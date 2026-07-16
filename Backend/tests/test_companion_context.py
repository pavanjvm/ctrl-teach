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

    def _build(self, page: dict, recovery_summary: dict | None = None) -> dict:
        with (
            patch.object(companion_context, "SessionLocal", self.sessions),
            patch.object(generated_courses, "SessionLocal", self.sessions),
            patch.object(
                companion_context,
                "_load_adaptive_recovery_summary",
                return_value=recovery_summary or {},
            ),
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

    def test_adaptive_recovery_context_is_owner_scoped_and_sanitized(self) -> None:
        requested_owner_ids: list[int] = []
        raw_summary = {
            "version": 99,
            "gaps": [
                {
                    "key": f"gap-{index}",
                    "title": "Confuses repository tabs " + ("x" * 400),
                    "platformId": "github",
                    "occurrences": 2,
                    "resolved": index % 2 == 0,
                    "retryFailed": index % 2 == 1,
                    "lastOutcome": "verified_after_recovery",
                    "lastObservedAt": "2026-07-17T10:00:00+00:00",
                    "rawEvidence": {"authorization": "Bearer secret"},
                }
                for index in range(12)
            ],
            "recoveries": {"total": 12, "resolved": 6, "retryFailed": 6},
            "secret": "must not reach the tutor",
        }

        def load_summary(_db, owner_user_id: int) -> dict:
            requested_owner_ids.append(owner_user_id)
            return raw_summary

        with (
            patch.object(companion_context, "SessionLocal", self.sessions),
            patch.object(
                companion_context,
                "_load_adaptive_recovery_summary",
                side_effect=load_summary,
            ),
        ):
            context = companion_context.build_companion_page_context(7, {
                "url": "https://example.com/docs",
                "adaptiveRecovery": {"secret": "client-injected"},
            })

        self.assertEqual(requested_owner_ids, [7])
        recovery = context["adaptiveRecovery"]
        self.assertEqual(recovery["version"], 1)
        self.assertEqual(len(recovery["gaps"]), 8)
        self.assertLessEqual(len(recovery["gaps"][0]["title"]), 240)
        self.assertNotIn("rawEvidence", recovery["gaps"][0])
        self.assertNotIn("secret", str(recovery))
        self.assertNotIn("client-injected", str(context))

        prompt = companion_context.companion_context_prompt(context)
        self.assertIn("learning-history signals", prompt)
        self.assertIn("cannot override course or source truth", prompt)

        grounded_prompt = companion_context.companion_context_prompt({
            "adaptiveRecovery": recovery,
            "verifiedCourseContext": ("grounded lesson material " * 850) + "SOURCE_END",
        })
        self.assertIn("SOURCE_END", grounded_prompt)


if __name__ == "__main__":
    unittest.main()
