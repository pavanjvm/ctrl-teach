from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.dependencies import get_current_user
from app.db import Base, PlatformCourse, Progress
from app.routers import learning_paths as learning_paths_router


class LearningPathRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        self.session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        app = FastAPI()
        app.include_router(learning_paths_router.router)
        app.dependency_overrides[get_current_user] = lambda: {"uid": "7", "username": "learner"}
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()

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
