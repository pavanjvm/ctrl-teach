from __future__ import annotations

import asyncio
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.dependencies import get_current_user
from app.config import settings
from app.db import Base, GeneratedCourse
from app.routers import generated_courses as generated_router
from app.services import generated_courses as generated_service
from app.services.generated_courses import CourseOutline, LessonContent


INTAKE = {
    "topic": "Reliable distributed systems",
    "summary": "Learn to design and reason about reliable distributed services.",
    "inferredPriorKnowledge": None,
    "inferredOutcome": None,
    "inferredTimeBudget": None,
    "inferredScope": None,
    "questions": [
        {
            "id": "current_level",
            "prompt": "How familiar are you with distributed systems?",
            "kind": "single_select",
            "options": ["New to it", "Some experience"],
            "required": True,
        },
    ],
}

TIME_QUESTION = {
    "id": "time_budget",
    "prompt": "How much total learning time do you want?",
    "kind": "single_select",
    "options": ["Up to 1 hour", "2–4 hours"],
    "required": True,
}


class GeneratedCourseRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        self.session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        app = FastAPI()
        app.include_router(generated_router.router)
        app.dependency_overrides[get_current_user] = lambda: {"uid": "7", "username": "learner"}
        self.client = TestClient(app)

    def test_prompt_intake_start_and_list_are_owner_scoped(self) -> None:
        with (
            patch.object(generated_router, "SessionLocal", self.session_factory),
            patch.object(generated_router, "generate_intake", new=AsyncMock(return_value=INTAKE)),
            patch.object(
                generated_router,
                "generate_next_intake_question",
                new=AsyncMock(side_effect=[
                    {"complete": False, "question": TIME_QUESTION},
                    {"complete": True, "question": None},
                ]),
            ),
            patch.object(generated_router, "_schedule") as schedule,
        ):
            intake = self.client.post(
                "/api/generated-courses/intake",
                data={"prompt": "Teach me to design reliable distributed systems"},
            )
            self.assertEqual(intake.status_code, 201)
            course_id = intake.json()["id"]
            self.assertEqual(intake.json()["status"], "intake")
            self.assertEqual(len(intake.json()["questions"]), 1)

            missing = self.client.post(
                f"/api/generated-courses/{course_id}/generate",
                json={"answers": {}},
            )
            self.assertEqual(missing.status_code, 422)

            first_answer = self.client.post(
                f"/api/generated-courses/{course_id}/intake-answer",
                json={"questionId": "current_level", "answer": "New to it"},
            )
            self.assertEqual(first_answer.status_code, 200)
            self.assertFalse(first_answer.json()["interviewComplete"])
            self.assertEqual(first_answer.json()["questions"][-1]["id"], "time_budget")

            second_answer = self.client.post(
                f"/api/generated-courses/{course_id}/intake-answer",
                json={"questionId": "time_budget", "answer": "Up to 1 hour"},
            )
            self.assertEqual(second_answer.status_code, 200)
            self.assertTrue(second_answer.json()["interviewComplete"])

            started = self.client.post(
                f"/api/generated-courses/{course_id}/generate",
                json={"answers": {}},
            )
            self.assertEqual(started.status_code, 202)
            self.assertEqual(started.json()["status"], "researching")
            schedule.assert_called_once_with(course_id)

            with self.session_factory() as db:
                stored = db.get(GeneratedCourse, course_id)
                assert stored is not None
                stored.status = "failed"
                failed_payload = dict(stored.payload or {})
                failed_payload["error"] = "transient image failure"
                stored.payload = failed_payload
                db.commit()

            retried = self.client.post(
                f"/api/generated-courses/{course_id}/generate",
                json={"answers": {}},
            )
            self.assertEqual(retried.status_code, 202)
            self.assertEqual(retried.json()["status"], "researching")
            self.assertEqual(schedule.call_count, 2)

            listed = self.client.get("/api/generated-courses")
            self.assertEqual(listed.status_code, 200)
            self.assertEqual(listed.json()["courses"][0]["id"], course_id)

    def test_other_users_course_returns_not_found(self) -> None:
        now = datetime.now(timezone.utc)
        with self.session_factory() as db:
            db.add(
                GeneratedCourse(
                    id="generated-private",
                    owner_user_id=8,
                    status="intake",
                    source_type="prompt",
                    source_label="private",
                    payload={"version": 2, "intake": INTAKE},
                    created_at=now,
                    updated_at=now,
                )
            )
            db.commit()
        with patch.object(generated_router, "SessionLocal", self.session_factory):
            response = self.client.get("/api/generated-courses/generated-private")
        self.assertEqual(response.status_code, 404)


class GeneratedCourseServiceTests(unittest.TestCase):
    def test_intake_normalization_keeps_one_beginner_safe_question(self) -> None:
        parsed = generated_service.IntakeResult.model_validate({
            **INTAKE,
            "questions": [{
                "id": "desired_focus",
                "prompt": "Which direction sounds most useful?",
                "kind": "single_select",
                "options": ["Build something", "Understand the basics"],
                "required": True,
            }],
        })
        normalized = generated_service._normalize_intake(parsed)
        self.assertEqual(len(normalized["questions"]), 1)
        self.assertIn("recommend", normalized["questions"][0]["options"][-1].lower())
        self.assertFalse(normalized["complete"])

    def test_intake_rejects_questions_that_make_beginners_design_the_course(self) -> None:
        parsed = generated_service.IntakeResult.model_validate({
            **INTAKE,
            "questions": [{
                "id": "docker_scope",
                "prompt": "Which Docker topics and tools do you want the course to include?",
                "kind": "multi_select",
                "options": ["Compose", "Networking", "BuildKit"],
                "required": True,
            }],
        })
        normalized = generated_service._normalize_intake(parsed)
        self.assertNotEqual(normalized["questions"][0]["id"], "docker_scope")
        self.assertEqual(normalized["questions"][0]["id"], "current_level")

    def test_course_shape_is_bounded_by_time_budget(self) -> None:
        self.assertEqual(generated_service.course_shape("Up to 1 hour")[:2], (2, 4))
        self.assertEqual(generated_service.course_shape("2–4 hours")[:2], (3, 8))
        self.assertEqual(generated_service.course_shape("5–8 hours")[:2], (4, 12))
        self.assertEqual(generated_service.course_shape("10+ hours")[:2], (6, 18))

    def test_outline_shape_can_be_repaired_to_requested_distribution(self) -> None:
        outline = CourseOutline.model_validate(
            {
                "title": "AWS Console Basics",
                "description": "A practical course about learning the AWS Console safely.",
                "difficulty": "Beginner",
                "audience": "Cloud learners",
                "outcomes": ["Navigate AWS", "Practice safely"],
                "prerequisites": [],
                "skills": ["AWS", "Cloud basics"],
                "coverPrompt": "An educational cloud console illustration with no logos",
                "modules": [
                    {"title": "Start", "lessons": [{"title": "Open the console", "summary": "Learn the console layout safely."}]},
                    {"title": "Practice", "lessons": [{"title": "Find services", "summary": "Use search and navigation to find services."}]},
                ],
            }
        )

        repaired = generated_service._normalize_outline_shape(
            outline,
            topic="AWS Console",
            module_count=3,
            lesson_count=8,
            distribution=[3, 3, 2],
        )

        self.assertTrue(
            generated_service._outline_matches_shape(
                repaired,
                module_count=3,
                lesson_count=8,
                distribution=[3, 3, 2],
            )
        )
        self.assertEqual([len(module.lessons) for module in repaired.modules], [3, 3, 2])
        self.assertEqual(repaired.modules[0].lessons[0].title, "Open the console")

    def test_long_course_lessons_must_be_substantive(self) -> None:
        lesson = LessonContent.model_validate(
            {
                "summary": "A small lesson that is structurally valid but still too thin for a 10+ hour course.",
                "duration": "15m",
                "blocks": [
                    {"type": "content", "heading": "One", "paragraphs": ["Brief explanation with little depth."], "citationIds": []},
                    {"type": "grid_cards", "heading": "Two", "cards": [
                        {"title": "A", "body": "Short body."},
                        {"title": "B", "body": "Short body."},
                    ], "citationIds": []},
                    {"type": "info_tabs", "heading": "Three", "tabs": [
                        {"label": "X", "paragraphs": ["Brief."]},
                        {"label": "Y", "paragraphs": ["Brief."]},
                    ], "citationIds": []},
                    {"type": "numbered_list", "heading": "Four", "items": [
                        {"title": "Step 1", "body": "Short."},
                        {"title": "Step 2", "body": "Short."},
                    ], "citationIds": []},
                    {"type": "quiz", "heading": "Five", "questions": [
                        {"question": "What is this?", "choices": ["A", "B"], "answerIndex": 0, "explanation": "Because it is the first choice."},
                        {"question": "And this?", "choices": ["A", "B"], "answerIndex": 0, "explanation": "Because it is the first choice."},
                    ], "citationIds": []},
                ],
            }
        )
        self.assertFalse(generated_service._lesson_depth_valid(lesson, long_course=True))

    def test_long_course_depth_uses_teaching_text_and_real_duration(self) -> None:
        detailed_text = " ".join(["Explain the concept with a concrete example and learner-facing reasoning."] * 45)
        payload = {
            "summary": "A substantial lesson with explanation, practice, and assessment.",
            "duration": "35m",
            "blocks": [
                {"type": "content", "heading": "Concept", "paragraphs": [detailed_text], "citationIds": []},
                {"type": "grid_cards", "heading": "Examples", "cards": [{"title": "A", "body": "A worked example with a practical consequence."}, {"title": "B", "body": "A contrasting example that exposes a misconception."}], "citationIds": []},
                {"type": "info_tabs", "heading": "Practice", "tabs": [{"label": "Try", "paragraphs": ["Apply the idea to a new scenario."]}, {"label": "Reflect", "paragraphs": ["Explain why the result follows."]}], "citationIds": []},
                {"type": "numbered_list", "heading": "Steps", "items": [{"title": "One", "body": "Identify the relevant inputs."}, {"title": "Two", "body": "Work through the decision and verify it."}], "citationIds": []},
                {"type": "quiz", "heading": "Check", "questions": [{"question": "Which application is valid here?", "choices": ["The worked case", "An unrelated case"], "answerIndex": 0, "explanation": "The worked case satisfies the lesson conditions."}, {"question": "What should be verified next?", "choices": ["The result", "Nothing"], "answerIndex": 0, "explanation": "Verification closes the reasoning loop."}], "citationIds": []},
            ],
        }
        lesson = LessonContent.model_validate(payload)
        self.assertTrue(generated_service._lesson_depth_valid(lesson, long_course=True))
        too_short = LessonContent.model_validate({**payload, "duration": "20m"})
        self.assertFalse(generated_service._lesson_depth_valid(too_short, long_course=True))

    def test_stored_lesson_drafts_are_checkpointed(self) -> None:
        payload = {"lessonDrafts": {"x": {"summary": "ok", "duration": "10m", "blocks": []}}}
        drafts = generated_service._stored_lesson_map(payload)
        self.assertIn("x", drafts)
        self.assertEqual(drafts["x"]["summary"], "ok")

    def test_partial_course_exposes_completed_lessons_only(self) -> None:
        outline = CourseOutline.model_validate(
            {
                "title": "Partial Course",
                "description": "A course that is still assembling lesson drafts.",
                "difficulty": "Beginner",
                "audience": "Learners",
                "outcomes": ["Outcome 1", "Outcome 2"],
                "prerequisites": [],
                "skills": ["Skill 1", "Skill 2"],
                "coverPrompt": "A simple educational cover illustration with clear course theming",
                "modules": [
                    {"title": "Module A", "lessons": [{"title": "Lesson 1", "summary": "Summary 1 introduces the first concept clearly."}, {"title": "Lesson 2", "summary": "Summary 2 expands the idea with practice."}]},
                    {"title": "Module B", "lessons": [{"title": "Lesson 3", "summary": "Summary 3 closes the loop with application."}]},
                ],
            }
        )
        payload = {
            "source": {"type": "prompt", "label": "Prompt"},
            "answers": {"time_budget": "10+ hours"},
            "intake": {"topic": "Topic", "summary": "Summary", "questions": []},
            "research": {"citations": [{"id": "src-1", "title": "Primary source", "url": "https://example.com"}]},
            "lessonDrafts": {
                "course-1-m1-l1": {
                    "summary": "Detailed lesson",
                    "duration": "40m",
                    "blocks": [
                        {"type": "content", "heading": "A", "paragraphs": ["One", "Two"], "citationIds": []},
                        {"type": "grid_cards", "heading": "B", "cards": [{"title": "T1", "body": "Body one"}, {"title": "T2", "body": "Body two"}], "citationIds": []},
                        {"type": "info_tabs", "heading": "C", "tabs": [{"label": "L1", "paragraphs": ["P1"]}, {"label": "L2", "paragraphs": ["P2"]}], "citationIds": []},
                        {"type": "numbered_list", "heading": "D", "items": [{"title": "1", "body": "Step one"}, {"title": "2", "body": "Step two"}], "citationIds": []},
                        {"type": "quiz", "heading": "E", "questions": [
                            {"question": "Q1?", "choices": ["A", "B"], "answerIndex": 0, "explanation": "Because choice A is correct."},
                            {"question": "Q2?", "choices": ["A", "B"], "answerIndex": 0, "explanation": "Because choice A is correct."},
                        ], "citationIds": []},
                    ],
                }
            },
            "outline": outline.model_dump(),
        }
        partial = generated_service._partial_course("course-1", payload, outline)
        self.assertIsNotNone(partial)
        assert partial is not None
        self.assertTrue(partial["partial"])
        self.assertEqual(partial["completedLessonCount"], 1)
        self.assertEqual(partial["totalLessonCount"], 3)
        self.assertEqual(partial["modules"][0]["lessons"][0]["status"], "ready")
        self.assertEqual(partial["modules"][0]["lessons"][1]["status"], "pending")
        self.assertEqual(partial["modules"][0]["lessons"][0]["contentBlocks"][0]["id"], "course-1-m1-l1-b1")
        self.assertEqual(partial["modules"][0]["lessons"][0]["contentBlocks"][4]["questions"][0]["id"], "course-1-m1-l1-b5-q1")

    def test_total_estimated_minutes_requires_long_course_floor(self) -> None:
        lessons = [{"duration": "40m"}, {"duration": "40m"}, {"duration": "40m"}]
        self.assertEqual(generated_service._total_estimated_minutes(lessons), 120)
        self.assertLess(generated_service._total_estimated_minutes(lessons), 600)

    def test_prepare_course_sanitizes_html_and_keeps_quiz_contract(self) -> None:
        outline = CourseOutline.model_validate(
            {
                "title": "Reliable Systems",
                "description": "A practical course about designing services that remain correct under failure.",
                "difficulty": "Intermediate",
                "audience": "Software engineers building production services",
                "outcomes": ["Reason about failure", "Design resilient workflows"],
                "prerequisites": ["Basic programming"],
                "skills": ["Reliability", "Distributed systems"],
                "coverPrompt": "Editorial illustration of resilient distributed services connected across regions",
                "modules": [
                    {"title": "Foundations", "lessons": [{"title": "Failure models", "summary": "Understand how partial failure changes system design."}]},
                    {"title": "Application", "lessons": [{"title": "Reliable workflows", "summary": "Apply idempotency and durable state to workflows."}]},
                ],
            }
        )
        lesson_payload = {
            "summary": "A complete lesson grounded in system reliability.",
            "duration": "25m",
            "blocks": [
                {"type": "content", "heading": "Core model", "paragraphs": ["Failures are partial."], "citationIds": ["src-1", "made-up"]},
                {"type": "html", "heading": "Unsafe visual", "html": "<script>alert(1)</script><div>flow</div>", "accessibilitySummary": "A flow from request to durable state.", "height": 320, "citationIds": []},
                {"type": "grid_cards", "heading": "Patterns", "cards": [{"title": "Retry", "body": "Repeat transient work."}, {"title": "Idempotency", "body": "Make repeats safe."}], "citationIds": []},
                {"type": "quiz", "heading": "Check", "questions": [{"question": "Why use idempotency keys?", "choices": ["For color", "To make retries safe"], "answerIndex": 1, "explanation": "They identify repeated operations."}, {"question": "What is partial failure?", "choices": ["Every node stops", "Some components fail while others run"], "answerIndex": 1, "explanation": "Distributed components can fail independently."}], "citationIds": ["src-1"]},
            ],
        }
        lessons = [LessonContent.model_validate(lesson_payload), LessonContent.model_validate(lesson_payload)]
        payload = {
            "source": {"type": "prompt", "label": "Learning prompt"},
            "answers": {"time_budget": "Up to 1 hour"},
            "intake": INTAKE,
            "research": {"citations": [{"id": "src-1", "title": "Primary source", "url": "https://example.com"}]},
        }
        course = generated_service._prepare_course("generated-test", payload, outline, lessons)
        first_blocks = course["modules"][0]["lessons"][0]["contentBlocks"]
        self.assertEqual(course["format"], "rich")
        self.assertEqual(first_blocks[1]["type"], "content")
        self.assertEqual(first_blocks[0]["citationIds"], ["src-1"])
        self.assertEqual(first_blocks[3]["questions"][0]["answerIndex"], 1)

    def test_prepare_course_injects_browser_lab_after_practical_platform_lesson(self) -> None:
        outline = CourseOutline.model_validate(
            {
                "title": "GitHub Workflow",
                "description": "A course about using GitHub issues and pull requests in a real team workflow.",
                "difficulty": "Beginner",
                "audience": "New software team members",
                "outcomes": ["Navigate GitHub", "Use a reversible practice workflow"],
                "prerequisites": [],
                "skills": ["GitHub", "Code collaboration"],
                "coverPrompt": "A practical software collaboration illustration with repository branches",
                "modules": [
                    {"title": "Practice", "lessons": [{"title": "Use GitHub issues", "summary": "Practice navigating issues in GitHub."}]},
                    {"title": "Concepts", "lessons": [{"title": "Collaboration concepts", "summary": "Understand review etiquette and team norms."}]},
                ],
            }
        )
        lesson_payload = {
            "summary": "Practice using GitHub issues safely.",
            "duration": "20m",
            "blocks": [
                {"type": "content", "heading": "Workflow", "paragraphs": ["Use GitHub issues to inspect work."], "citationIds": []},
                {"type": "grid_cards", "heading": "Areas", "cards": [{"title": "Issues", "body": "Track work."}, {"title": "Labels", "body": "Classify work."}], "citationIds": []},
                {"type": "numbered_list", "heading": "Steps", "items": [{"title": "Open", "body": "Open GitHub."}, {"title": "Inspect", "body": "Inspect an issue."}], "citationIds": []},
                {"type": "quiz", "heading": "Check", "questions": [{"question": "What tracks work?", "choices": ["Issues", "Themes"], "answerIndex": 0, "explanation": "Issues track work."}, {"question": "What classifies work?", "choices": ["Labels", "Fonts"], "answerIndex": 0, "explanation": "Labels classify work."}], "citationIds": []},
            ],
            "browserLab": {
                "platformId": "github",
                "objective": "Practice opening GitHub and inspecting an issue list.",
                "prerequisites": ["A GitHub account is optional for public repositories."],
                "steps": [
                    {"id": "open-github", "instruction": "Open GitHub in the browser.", "expectedEvidence": "Clicky observes GitHub open.", "assertionIds": ["visit-platform"]},
                    {"id": "open-issues", "instruction": "Click Issues on a repository.", "expectedEvidence": "Clicky observes the Issues interaction.", "assertionIds": ["issues-click"]},
                ],
                "successCriteria": ["Clicky observes the task and cleanup."],
                "cleanupSteps": [{"id": "close", "instruction": "Leave without creating or editing an issue.", "expectedEvidence": "Clicky observes neutral cleanup review.", "assertionIds": ["cleanup"]}],
                "taskAssertions": [{"id": "issues-click", "kind": "click_text", "value": "Issues", "description": "Clicky observed the Issues label."}],
                "cleanupAssertions": [{"id": "cleanup", "kind": "interaction_observed", "value": "", "description": "Clicky observed cleanup review."}],
                "estimatedDuration": "15m",
            },
        }
        conceptual_payload = {**lesson_payload, "summary": "Understand collaboration concepts.", "browserLab": None}
        lessons = [LessonContent.model_validate(lesson_payload), LessonContent.model_validate(conceptual_payload)]
        payload = {
            "source": {"type": "prompt", "label": "Learning prompt"},
            "answers": {"time_budget": "Up to 1 hour"},
            "intake": INTAKE,
            "research": {"citations": [{"id": "src-1", "title": "Primary source", "url": "https://example.com"}]},
        }

        course = generated_service._prepare_course("generated-github", payload, outline, lessons)
        module_lessons = course["modules"][0]["lessons"]

        self.assertEqual(module_lessons[0]["type"], "study")
        self.assertEqual(module_lessons[1]["type"], "lab")
        self.assertEqual(module_lessons[1]["sourceLessonId"], module_lessons[0]["id"])
        self.assertEqual(module_lessons[1]["browserLab"]["launchUrl"], "https://github.com/")
        self.assertIn("github.com", module_lessons[1]["browserLab"]["allowedHosts"])
        self.assertEqual(course["modules"][1]["lessons"][0]["type"], "study")

    def test_real_asset_bytes_are_persisted_to_uploads(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with (
                patch.object(settings, "uploads_dir", directory),
                patch.object(generated_service, "_generate_image", new=AsyncMock(return_value=b"real-image-bytes")),
                patch.object(generated_service, "_persist_asset"),
            ):
                asset = asyncio.run(
                    generated_service._ensure_asset(
                        course_id="generated-test",
                        owner_user_id=7,
                        asset_id="cover",
                        prompt="A detailed educational cover illustration for a distributed systems course",
                        alt="Distributed systems cover",
                        caption="Reliable Systems",
                        size="1536x1024",
                        existing={},
                    )
                )
            path = Path(directory) / asset["url"].removeprefix("/uploads/")
            self.assertTrue(path.exists())
            self.assertEqual(path.read_bytes(), b"real-image-bytes")
            self.assertEqual(asset["contentType"], "image/webp")

    def test_realtime_context_requires_owner_and_uses_safe_block_text(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        sessions = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        now = datetime.now(timezone.utc)
        course = {
            "title": "Reliable Systems",
            "citations": [{"id": "src-1", "title": "Source", "url": "https://example.com"}],
            "modules": [{"title": "Failure foundations", "lessons": [{"id": "lesson-1", "title": "Failures", "summary": "Partial failure", "contentBlocks": [{"type": "content", "heading": "Model", "paragraphs": ["Components fail independently."]}, {"type": "image", "asset": {"caption": "A resilient service topology", "alt": "Three services connected through a durable queue"}}, {"type": "quiz", "heading": "Check", "questions": [{"id": "quiz-1", "question": "What can fail?", "choices": ["One component", "Nothing"], "answerIndex": 0, "explanation": "Components fail independently."}]}, {"type": "html", "heading": "Diagram", "html": "<div>hidden</div>", "accessibilitySummary": "Request flows through a durable queue."}]}]}],
        }
        with sessions() as db:
            db.add(GeneratedCourse(id="generated-test", owner_user_id=7, status="ready", source_type="prompt", source_label="prompt", payload={"course": course}, created_at=now, updated_at=now))
            db.commit()
        with patch.object(generated_service, "SessionLocal", sessions):
            context = generated_service.rich_lesson_context("generated-test", "lesson-1", 7)
            denied = generated_service.rich_lesson_context("generated-test", "lesson-1", 8)
            quiz_ids = generated_service.rich_lesson_quiz_ids("generated-test", "lesson-1", 7)
            denied_quiz_ids = generated_service.rich_lesson_quiz_ids("generated-test", "lesson-1", 8)
        self.assertIn("Components fail independently", context or "")
        self.assertIn("Module: Failure foundations", context or "")
        self.assertIn("Section 2 [image]", context or "")
        self.assertIn("A resilient service topology", context or "")
        self.assertIn("Choices: One component | Nothing", context or "")
        self.assertIn("Question ID quiz-1", context or "")
        self.assertEqual(quiz_ids, ["quiz-1"])
        self.assertEqual(denied_quiz_ids, [])
        self.assertIn("Request flows through a durable queue", context or "")
        self.assertNotIn("<div>", context or "")
        self.assertIsNone(denied)


if __name__ == "__main__":
    unittest.main()
