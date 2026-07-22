from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.dependencies import get_current_user
from app.db import Base, CourseLessonProgress, PlatformCourse, Progress
from app.routers import learning_paths as learning_paths_router


class LearningPathRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)
        app = FastAPI()
        app.include_router(learning_paths_router.router)
        app.dependency_overrides[get_current_user] = lambda: {"uid": "7", "username": "learner"}
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()
        self.engine.dispose()

    def test_path_marks_evidenced_skills_complete_and_exposes_curated_anchor(self) -> None:
        with self.session_factory() as db:
            db.add(PlatformCourse(
                id="platform-product-discovery",
                status="published",
                course={"skills": ["Customer Interviews", "Experiment Design"]},
            ))
            db.add(Progress(user_id=7, subject="Product", topic="Customer Interviews", mastery_level=4))
            db.commit()
        with patch.object(learning_paths_router, "SessionLocal", self.session_factory):
            response = self.client.post("/api/learning-paths", json={"roleId": "product-manager"})

        self.assertEqual(response.status_code, 201)
        nodes = response.json()["nodes"]
        self.assertEqual(nodes[0]["status"], "completed")
        self.assertEqual(nodes[1]["status"], "available")
        self.assertEqual(nodes[1]["metadata"]["sourceKind"], "cprime_curated")

    def test_gap_generation_creates_a_resumable_generated_course(self) -> None:
        with patch.object(learning_paths_router, "SessionLocal", self.session_factory):
            path = self.client.post("/api/learning-paths", json={"roleId": "cloud-architect"}).json()
            gap = next(node for node in path["nodes"] if node["courseRef"] is None and node["type"] == "course")
            with patch.object(learning_paths_router, "_schedule") as schedule:
                response = self.client.post(f"/api/learning-paths/{path['id']}/nodes/{gap['id']}/generate")

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.json()["status"], "researching")
        schedule.assert_called_once_with(response.json()["courseId"])

    def test_reading_a_path_reorders_nodes_after_mastery_changes(self) -> None:
        with patch.object(learning_paths_router, "SessionLocal", self.session_factory):
            path = self.client.post("/api/learning-paths", json={"roleId": "product-manager"}).json()
            with self.session_factory() as db:
                db.add(Progress(user_id=7, subject="Product", topic="Customer Interviews", mastery_level=3))
                db.commit()
            response = self.client.get(f"/api/learning-paths/{path['id']}")

        self.assertEqual(response.status_code, 200)
        nodes = response.json()["nodes"]
        self.assertEqual(nodes[0]["status"], "completed")
        self.assertEqual(nodes[1]["status"], "available")

    def test_completed_course_persists_mastery_and_unlocks_the_next_path_node(self) -> None:
        with self.session_factory() as db:
            db.add(PlatformCourse(
                id="platform-product-discovery",
                status="published",
                course={
                    "skills": ["Customer Interviews", "Experiment Design"],
                    "modules": [{
                        "id": "module-discovery",
                        "lessons": [{"id": "lesson-interviews"}, {"id": "lesson-experiments"}],
                    }],
                },
            ))
            db.commit()

        with patch.object(learning_paths_router, "SessionLocal", self.session_factory):
            path = self.client.post("/api/learning-paths", json={"roleId": "product-manager"}).json()
            first_lesson = self.client.post(
                "/api/learning-paths/progress/lessons",
                json={"courseId": "platform-product-discovery", "lessonId": "lesson-interviews"},
            )
            completion = self.client.post(
                "/api/learning-paths/progress/lessons",
                json={"courseId": "platform-product-discovery", "lessonId": "lesson-experiments"},
            )
            refreshed = self.client.get(f"/api/learning-paths/{path['id']}")

        self.assertEqual(first_lesson.status_code, 200)
        self.assertFalse(first_lesson.json()["courseCompleted"])
        self.assertEqual(completion.status_code, 200)
        self.assertTrue(completion.json()["courseCompleted"])
        self.assertEqual(len(completion.json()["updatedNodeIds"]), 2)
        nodes = refreshed.json()["nodes"]
        self.assertEqual(nodes[0]["status"], "completed")
        self.assertEqual(nodes[1]["status"], "completed")
        self.assertEqual(nodes[2]["status"], "available")
        with self.session_factory() as db:
            progress = {
                row.topic: row.mastery_level
                for row in db.scalars(select(Progress).where(Progress.user_id == 7))
            }
        self.assertEqual(progress["Customer Interviews"], 3)
        self.assertEqual(progress["Experiment Design"], 3)

    def test_list_paths_restores_the_owned_path(self) -> None:
        with patch.object(learning_paths_router, "SessionLocal", self.session_factory):
            path = self.client.post("/api/learning-paths", json={"roleId": "cloud-architect"}).json()
            response = self.client.get("/api/learning-paths")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["paths"][0]["id"], path["id"])

    def test_lesson_progress_rejects_unknown_lessons(self) -> None:
        with self.session_factory() as db:
            db.add(PlatformCourse(
                id="platform-product-discovery",
                status="published",
                course={
                    "skills": ["Customer Interviews"],
                    "modules": [{"id": "module-discovery", "lessons": [{"id": "lesson-interviews"}]}],
                },
            ))
            db.commit()

        with patch.object(learning_paths_router, "SessionLocal", self.session_factory):
            self.client.post("/api/learning-paths", json={"roleId": "product-manager"})
            response = self.client.post(
                "/api/learning-paths/progress/lessons",
                json={"courseId": "platform-product-discovery", "lessonId": "lesson-not-in-course"},
            )

        self.assertEqual(response.status_code, 404)
        with self.session_factory() as db:
            self.assertEqual(len(list(db.scalars(select(CourseLessonProgress)))), 0)

    def test_lesson_progress_lists_only_the_current_learners_records(self) -> None:
        with self.session_factory() as db:
            db.add(CourseLessonProgress(user_id=7, course_id="course-7", lesson_id="lesson-7"))
            db.add(CourseLessonProgress(user_id=9, course_id="course-9", lesson_id="lesson-9"))
            db.commit()

        with patch.object(learning_paths_router, "SessionLocal", self.session_factory):
            response = self.client.get("/api/learning-paths/progress/lessons")

        self.assertEqual(response.status_code, 200)
        completed_lessons = response.json()["completedLessons"]
        self.assertEqual(len(completed_lessons), 1)
        self.assertEqual(completed_lessons[0]["courseId"], "course-7")
        self.assertEqual(completed_lessons[0]["lessonId"], "lesson-7")
        self.assertTrue(completed_lessons[0]["completedAt"])
