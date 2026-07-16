from __future__ import annotations

import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, GeneratedCourse, Profile, User
from app.services import companion_context, generated_courses


class CompanionContextTests(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        self.sessions = sessionmaker(bind=engine, expire_on_commit=False)
        with self.sessions() as db:
            db.add(User(id=7, username="learner", password_hash="x", name="Pavan"))
            db.add(Profile(user_id=7, preferences={"ctrlteach": {"level": "beginner"}}))
            db.add(GeneratedCourse(
                id="generated-owned",
                owner_user_id=7,
                status="ready",
                payload={
                    "course": {
                        "title": "Docker Foundations",
                        "description": "Learn the Docker mental model.",
                        "outcomes": ["Explain images and containers"],
                        "modules": [{
                            "title": "Mental model",
                            "lessons": [{
                                "id": "lesson-1",
                                "title": "Images and containers",
                                "summary": "An image is a blueprint; a container is a running instance.",
                                "contentBlocks": [{
                                    "type": "content",
                                    "heading": "Core idea",
                                    "paragraphs": ["Images are immutable templates."],
                                }],
                            }],
                        }],
                        "citations": [],
                    }
                },
            ))
            db.add(GeneratedCourse(
                id="generated-other",
                owner_user_id=8,
                status="ready",
                payload={"course": {"title": "Private course", "modules": []}},
            ))
            db.commit()

    def _build(self, page: dict) -> dict:
        with (
            patch.object(companion_context, "SessionLocal", self.sessions),
            patch.object(generated_courses, "SessionLocal", self.sessions),
        ):
            return companion_context.build_companion_page_context(7, page)

    def test_reader_context_is_owner_scoped_and_lesson_grounded(self) -> None:
        context = self._build({
            "route": "/learn/generated-owned/lesson-1",
            "title": "Images and containers",
        })
        self.assertEqual(context["mode"], "course_reader")
        self.assertEqual(context["learnerName"], "Pavan")
        self.assertEqual(context["courseTitle"], "Docker Foundations")
        self.assertIn("Images are immutable templates", context["verifiedCourseContext"])

    def test_another_learners_course_is_not_disclosed(self) -> None:
        context = self._build({"route": "/learn/generated-other"})
        self.assertEqual(context["courseAccess"], "unavailable")
        self.assertNotIn("courseTitle", context)
        self.assertNotIn("Private course", str(context))

    def test_external_page_gets_navigation_capabilities_without_course_data(self) -> None:
        context = self._build({
            "url": "https://example.com/docs/install",
            "title": "Install docs",
        })
        self.assertEqual(context["mode"], "browser_page")
        self.assertEqual(context["route"], "/docs/install")
        self.assertIn("point", context["capabilities"])
        self.assertNotIn("verifiedCourseContext", context)

    def test_teaching_profiles_route_has_a_dedicated_page_mode(self) -> None:
        self.assertEqual(
            companion_context.page_mode("/teaching-profiles"),
            "teaching_profile_management",
        )


if __name__ == "__main__":
    unittest.main()
