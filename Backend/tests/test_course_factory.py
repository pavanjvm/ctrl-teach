from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.dependencies import get_current_user
from app.db import Base
from app.routers import course_factory as course_factory_router
from app.services.course_factory import (
    _sanitize_course,
    extract_file_source,
    generate_course,
)


SOURCE = """# Product Strategy and Roadmapping

## Outcome-driven product strategy
Connect a product vision to customer and business outcomes.

## Evidence-based prioritization
Compare opportunities, cost of delay, assumptions, and trade-offs.

## Stakeholder roadmap communication
Build a roadmap narrative and defend it with evidence.
"""


class CourseFactoryFallbackTests(unittest.TestCase):
    def test_text_syllabus_is_extracted_without_connector(self) -> None:
        with patch("app.services.course_factory._firecrawl", return_value=None):
            result = extract_file_source(
                "product-strategy.md",
                SOURCE.encode("utf-8"),
                "text/markdown",
            )

        self.assertEqual(result["mode"], "local-text")
        self.assertEqual(result["title"], "Product Strategy and Roadmapping")
        self.assertIn("Evidence-based prioritization", result["text"])

    def test_no_key_generation_contains_every_learning_mode(self) -> None:
        with patch("app.services.course_factory._openai", return_value=None):
            course = generate_course(
                course_id="factory-test",
                source_text=SOURCE,
                source_title="Product Strategy and Roadmapping",
                source_type="syllabus",
                source_label="product-strategy.md",
            )

        self.assertEqual(len(course["modules"]), 3)
        for module in course["modules"]:
            self.assertEqual(
                [lesson["type"] for lesson in module["lessons"]],
                ["study", "lab", "assessment", "roleplay"],
            )
            self.assertTrue(module["lessons"][0]["whiteboardPlan"]["beats"])
            self.assertTrue(module["lessons"][1]["lab"]["successCriteria"])
            self.assertEqual(len(module["lessons"][2]["assessment"]), 3)
            self.assertTrue(module["lessons"][3]["roleplay"]["followUps"])
        self.assertEqual(course["certificateCriteria"]["requiredScore"], 80)
        self.assertNotIn("price", course)

    def test_model_output_is_normalized_to_complete_inventory(self) -> None:
        with patch("app.services.course_factory._openai", return_value=None):
            fallback = generate_course(
                course_id="factory-test",
                source_text=SOURCE,
                source_title="Product Strategy and Roadmapping",
                source_type="url",
                source_label="cprime.com",
                source_url="https://example.com/course",
            )

        raw = {
            "title": "Edited title",
            "difficulty": "Expert",
            "modules": [{"title": "Only one module", "lessons": []}],
            "certificateCriteria": {"requiredScore": 140},
        }
        course = _sanitize_course(raw, fallback)

        self.assertEqual(course["title"], "Edited title")
        self.assertEqual(course["difficulty"], "Intermediate")
        self.assertEqual(len(course["modules"]), 3)
        self.assertEqual(course["certificateCriteria"]["requiredScore"], 100)


class CourseFactoryRouterTests(unittest.TestCase):
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
        app = FastAPI()
        app.include_router(course_factory_router.router)
        app.dependency_overrides[get_current_user] = lambda: {"uid": "7", "username": "admin"}
        self.client = TestClient(app)

    def test_generate_edit_publish_and_list(self) -> None:
        with patch("app.services.course_factory._openai", return_value=None):
            generated = generate_course(
                course_id="temporary-id",
                source_text=SOURCE,
                source_title="Product Strategy and Roadmapping",
                source_type="syllabus",
                source_label="product-strategy.md",
            )
        extracted = {
            "text": SOURCE,
            "title": "Product Strategy and Roadmapping",
            "label": "product-strategy.md",
            "mode": "local-text",
        }

        with (
            patch.object(course_factory_router, "SessionLocal", self.session_factory),
            patch.object(course_factory_router, "extract_file_source", return_value=extracted),
            patch.object(course_factory_router, "generate_course", return_value=generated),
        ):
            response = self.client.post(
                "/api/course-factory/generate",
                files={"syllabus": ("product-strategy.md", SOURCE, "text/markdown")},
            )
            self.assertEqual(response.status_code, 200)
            draft = response.json()["draft"]
            course_id = draft["id"]
            edited = draft["course"]
            edited["title"] = "Edited product strategy"

            save = self.client.put(
                f"/api/course-factory/{course_id}",
                json={"course": edited},
            )
            self.assertEqual(save.status_code, 200)

            publish = self.client.post(
                f"/api/course-factory/{course_id}/publish",
                json={"course": edited},
            )
            self.assertEqual(publish.status_code, 200)
            self.assertEqual(publish.json()["published"]["status"], "published")

            listed = self.client.get("/api/course-factory/published")
            self.assertEqual(listed.status_code, 200)
            self.assertEqual(listed.json()["courses"][0]["title"], "Edited product strategy")


if __name__ == "__main__":
    unittest.main()
