from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import dependencies as auth_dependencies
from app.auth.dependencies import get_current_admin, get_current_user
from app.db import Base, GeneratedCourse, PlatformCourse, User
from app.routers import platform_courses as platform_router
from app.services import platform_courses as platform_service


COURSE = {
    "title": "Admin authored course",
    "description": "A complete platform course managed through the admin studio.",
    "thumbnail": "linear-gradient(135deg,#fff,#789)",
    "instructor": "Course Admin",
    "platform": "Ctrl+Teach",
    "difficulty": "Intermediate",
    "duration": "2h",
    "skills": ["Editing", "Publishing"],
    "rating": 0,
    "ratingCount": 0,
    "modules": [{
        "id": "module-1",
        "title": "First module",
        "lessons": [{
            "id": "lesson-1",
            "title": "First lesson",
            "type": "study",
            "duration": "15m",
            "summary": "The opening lesson.",
        }],
    }],
}


class PlatformCourseRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        self.session_factory = sessionmaker(
            bind=engine,
            autoflush=False,
            expire_on_commit=False,
        )
        with self.session_factory() as db:
            db.add_all([
                User(id=1, username="admin", password_hash="unused", is_admin=True),
                User(id=2, username="learner", password_hash="unused", is_admin=False),
            ])
            db.commit()

    def _client(self, *, admin: bool) -> TestClient:
        app = FastAPI()
        app.include_router(platform_router.public_router)
        app.include_router(platform_router.admin_router)
        if admin:
            app.dependency_overrides[get_current_admin] = lambda: {
                "uid": "1",
                "username": "admin",
                "isAdmin": True,
            }
        else:
            app.dependency_overrides[get_current_user] = lambda: {
                "uid": "2",
                "username": "learner",
                "isAdmin": False,
            }
        return TestClient(app)

    def test_admin_can_create_edit_publish_and_unpublish(self) -> None:
        client = self._client(admin=True)
        with patch.object(platform_router, "SessionLocal", self.session_factory):
            created = client.post("/api/admin/courses", json=COURSE)
            self.assertEqual(created.status_code, 201)
            course_id = created.json()["id"]
            self.assertEqual(created.json()["status"], "draft")

            hidden = client.get("/api/platform-courses")
            self.assertEqual(hidden.status_code, 200)
            self.assertEqual(hidden.json()["courses"], [])

            edited_course = {**COURSE, "title": "Edited before publishing"}
            edited = client.put(f"/api/admin/courses/{course_id}", json=edited_course)
            self.assertEqual(edited.status_code, 200)
            self.assertEqual(edited.json()["course"]["title"], "Edited before publishing")

            published = client.post(f"/api/admin/courses/{course_id}/publish")
            self.assertEqual(published.status_code, 200)
            self.assertEqual(published.json()["status"], "published")

            visible = client.get("/api/platform-courses")
            self.assertEqual(len(visible.json()["courses"]), 1)
            self.assertEqual(visible.json()["courses"][0]["id"], course_id)

            unpublished = client.post(f"/api/admin/courses/{course_id}/unpublish")
            self.assertEqual(unpublished.status_code, 200)
            self.assertEqual(unpublished.json()["status"], "draft")
            self.assertEqual(client.get("/api/platform-courses").json()["courses"], [])

    def test_learner_role_cannot_access_admin_courses(self) -> None:
        client = self._client(admin=False)
        with (
            patch.object(platform_router, "SessionLocal", self.session_factory),
            patch.object(auth_dependencies, "SessionLocal", self.session_factory),
        ):
            response = client.get("/api/admin/courses")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "Admin access required")

    def test_publish_requires_a_real_curriculum(self) -> None:
        client = self._client(admin=True)
        incomplete = {**COURSE, "modules": []}
        with patch.object(platform_router, "SessionLocal", self.session_factory):
            created = client.post("/api/admin/courses", json=incomplete)
            response = client.post(f"/api/admin/courses/{created.json()['id']}/publish")
        self.assertEqual(response.status_code, 422)
        self.assertIn("module", response.json()["detail"].lower())

    def test_admin_can_import_a_generated_course_as_an_editable_draft(self) -> None:
        generated = {
            **COURSE,
            "id": "generated-admin-course",
            "format": "rich",
            "modules": [{
                "id": "module-1",
                "title": "Generated module",
                "lessons": [{
                    "id": "lesson-1",
                    "title": "Generated lesson",
                    "type": "study",
                    "duration": "18m",
                    "summary": "Generated summary",
                    "contentBlocks": [{
                        "id": "block-1",
                        "type": "content",
                        "heading": "Important concept",
                        "paragraphs": ["Full generated lesson content."],
                    }],
                }],
            }],
        }
        with self.session_factory() as db:
            db.add(
                GeneratedCourse(
                    id="generated-admin-course",
                    owner_user_id=1,
                    status="ready",
                    source_type="prompt",
                    source_label="Admin prompt",
                    payload={"version": 2, "course": generated},
                )
            )
            db.commit()

        client = self._client(admin=True)
        with patch.object(platform_router, "SessionLocal", self.session_factory):
            imported = client.post("/api/admin/courses/import-generated/generated-admin-course")
            self.assertEqual(imported.status_code, 201)
            self.assertEqual(imported.json()["status"], "draft")
            course_id = imported.json()["id"]
            self.assertNotEqual(course_id, "generated-admin-course")
            self.assertEqual(
                imported.json()["course"]["modules"][0]["lessons"][0]["contentBlocks"][0]["type"],
                "content",
            )

            edited = dict(imported.json()["course"])
            edited["title"] = "Edited generated course"
            saved = client.put(f"/api/admin/courses/{course_id}", json=edited)
            self.assertEqual(saved.status_code, 200)
            self.assertEqual(saved.json()["course"]["title"], "Edited generated course")
            self.assertEqual(
                saved.json()["course"]["modules"][0]["lessons"][0]["contentBlocks"][0]["paragraphs"],
                ["Full generated lesson content."],
            )

    def test_rich_course_fields_round_trip_through_admin_and_public_catalog(self) -> None:
        rich_course = {
            **COURSE,
            "format": "rich",
            "overview": {
                "audience": "Product teams",
                "outcomes": ["Frame a problem", "Test an assumption"],
                "prerequisites": ["Basic product vocabulary"],
                "estimatedTime": "2h 15m",
            },
            "coverImage": {
                "id": "cover-1",
                "status": "ready",
                "url": "/uploads/generated/cover.webp",
                "alt": "Course cover",
                "caption": "Generated cover",
                "prompt": "A product discovery workshop",
                "width": 1536,
                "height": 1024,
                "contentType": "image/webp",
                "sizeBytes": 1200,
            },
            "citations": [{
                "id": "src-1",
                "title": "Discovery guide",
                "url": "https://example.com/discovery",
            }],
            "certificateCriteria": {
                "title": "Discovery practitioner",
                "requiredScore": 80,
                "requiredArtifacts": ["interview-plan"],
                "skills": ["Editing", "Publishing"],
                "statement": "Completed the discovery course.",
            },
            "modules": [{
                "id": "module-1",
                "title": "First module",
                "lessons": [{
                    "id": "lesson-1",
                    "title": "First lesson",
                    "type": "lab",
                    "duration": "20m",
                    "summary": "Practice the workflow.",
                    "contentBlocks": [{
                        "id": "block-1",
                        "type": "content",
                        "heading": "Important concept",
                        "paragraphs": ["Full lesson content."],
                        "citationIds": ["src-1"],
                    }],
                    "lab": {
                        "scenario": "Interview a customer",
                        "task": "Write neutral questions",
                        "starterContext": "A new product idea",
                        "deliverable": "Interview guide",
                        "successCriteria": ["Questions avoid leading language"],
                    },
                    "whiteboardPlan": {
                        "objective": "Explain neutral interviewing",
                        "beats": ["Define leading questions"],
                        "visualElements": ["Question comparison"],
                    },
                }],
            }],
        }
        client = self._client(admin=True)
        with patch.object(platform_router, "SessionLocal", self.session_factory):
            created = client.post("/api/admin/courses", json=rich_course)
            self.assertEqual(created.status_code, 201)
            course_id = created.json()["id"]

            edited = created.json()["course"]
            edited["overview"]["audience"] = "Product and design teams"
            saved = client.put(f"/api/admin/courses/{course_id}", json=edited)
            self.assertEqual(saved.status_code, 200)
            self.assertEqual(saved.json()["course"]["coverImage"]["url"], "/uploads/generated/cover.webp")
            self.assertEqual(
                saved.json()["course"]["modules"][0]["lessons"][0]["lab"]["deliverable"],
                "Interview guide",
            )

            published = client.post(f"/api/admin/courses/{course_id}/publish")
            self.assertEqual(published.status_code, 200)
            public = client.get(f"/api/platform-courses/{course_id}")
            self.assertEqual(public.status_code, 200)
            self.assertEqual(public.json()["course"]["overview"]["audience"], "Product and design teams")
            self.assertEqual(public.json()["course"]["citations"][0]["id"], "src-1")
            self.assertEqual(public.json()["course"]["certificateCriteria"]["requiredScore"], 80)
            self.assertEqual(
                public.json()["course"]["modules"][0]["lessons"][0]["contentBlocks"][0]["citationIds"],
                ["src-1"],
            )

    def test_generated_course_cannot_be_edited_before_generation_is_ready(self) -> None:
        with self.session_factory() as db:
            db.add(
                GeneratedCourse(
                    id="generated-course-in-progress",
                    owner_user_id=1,
                    status="generating",
                    source_type="prompt",
                    source_label="Admin prompt",
                    payload={"version": 2, "course": {**COURSE, "title": "Partial course"}},
                )
            )
            db.commit()

        client = self._client(admin=True)
        with patch.object(platform_router, "SessionLocal", self.session_factory):
            response = client.post("/api/admin/courses/import-generated/generated-course-in-progress")

        self.assertEqual(response.status_code, 409)
        self.assertIn("not complete", response.json()["detail"].lower())
        with self.session_factory() as db:
            self.assertEqual(list(db.scalars(select(PlatformCourse))), [])


class PlatformCourseSeedTests(unittest.TestCase):
    def test_seed_is_idempotent_and_never_overwrites_admin_edits(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

        with patch.object(platform_service, "SessionLocal", session_factory):
            platform_service.seed_platform_courses()
            with session_factory() as db:
                row = db.get(PlatformCourse, "platform-product-discovery")
                assert row is not None
                changed = dict(row.course)
                changed["title"] = "Admin-edited title"
                row.course = changed
                db.commit()

            platform_service.seed_platform_courses()

        with session_factory() as db:
            rows = list(db.scalars(select(PlatformCourse)))
            edited = db.get(PlatformCourse, "platform-product-discovery")
            self.assertEqual(len(rows), len(platform_service.DEFAULT_PLATFORM_COURSES))
            assert edited is not None
            self.assertEqual(edited.course["title"], "Admin-edited title")


if __name__ == "__main__":
    unittest.main()
