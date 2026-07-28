from __future__ import annotations

import asyncio
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
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

ADAPTIVE_RECOVERY = {
    "version": 1,
    "gaps": [{
        "key": "github:issues-tab",
        "title": "Distinguishing repository tabs",
        "platformId": "github",
        "occurrences": 2,
        "resolved": 0,
        "retryFailed": 1,
        "lastOutcome": "retry_failed",
        "lastObservedAt": "2026-07-17T10:00:00+00:00",
    }],
    "recoveries": {"total": 2, "resolved": 1, "retryFailed": 1},
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
            patch.object(
                generated_router,
                "_load_adaptive_recovery_summary",
                return_value=ADAPTIVE_RECOVERY,
            ) as recovery_snapshot,
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
            self.assertEqual(started.json()["status"], "generating")
            self.assertEqual(started.json()["progress"]["stage"], "outlining")
            schedule.assert_called_once_with(course_id)

            archiving_active = self.client.post(f"/api/generated-courses/{course_id}/archive")
            self.assertEqual(archiving_active.status_code, 409)

            with self.session_factory() as db:
                stored = db.get(GeneratedCourse, course_id)
                assert stored is not None
                self.assertEqual(stored.payload["adaptiveRecovery"], ADAPTIVE_RECOVERY)
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
            self.assertEqual(retried.json()["status"], "generating")
            self.assertEqual(retried.json()["progress"]["stage"], "outlining")
            self.assertEqual(schedule.call_count, 2)
            recovery_snapshot.assert_called_once()
            self.assertEqual(recovery_snapshot.call_args.args[1], 7)

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
            archived = self.client.post("/api/generated-courses/generated-private/archive")
            deleted = self.client.delete("/api/generated-courses/generated-private")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(archived.status_code, 404)
        self.assertEqual(deleted.status_code, 404)

    def test_owner_can_archive_restore_and_delete_generated_course(self) -> None:
        now = datetime.now(timezone.utc)
        course_id = "generated-manage"
        with self.session_factory() as db:
            db.add(
                GeneratedCourse(
                    id=course_id,
                    owner_user_id=7,
                    status="ready",
                    source_type="prompt",
                    source_label="manageable",
                    payload={"version": 2, "intake": INTAKE, "course": {"id": course_id, "modules": []}},
                    created_at=now,
                    updated_at=now,
                )
            )
            db.commit()

        with tempfile.TemporaryDirectory() as uploads_dir:
            asset_dir = Path(uploads_dir) / "generated" / "7" / course_id
            asset_dir.mkdir(parents=True)
            (asset_dir / "cover.webp").write_bytes(b"image")
            with (
                patch.object(generated_router, "SessionLocal", self.session_factory),
                patch.object(settings, "uploads_dir", uploads_dir),
            ):
                archived = self.client.post(f"/api/generated-courses/{course_id}/archive")
                self.assertEqual(archived.status_code, 200)
                self.assertTrue(archived.json()["archivedAt"])

                listed = self.client.get("/api/generated-courses")
                self.assertTrue(listed.json()["courses"][0]["archivedAt"])

                restored = self.client.post(f"/api/generated-courses/{course_id}/restore")
                self.assertEqual(restored.status_code, 200)
                self.assertIsNone(restored.json()["archivedAt"])

                deleted = self.client.delete(f"/api/generated-courses/{course_id}")
                self.assertEqual(deleted.status_code, 204)
                self.assertFalse(asset_dir.exists())

                missing = self.client.get(f"/api/generated-courses/{course_id}")
                self.assertEqual(missing.status_code, 404)


class GeneratedCourseServiceTests(unittest.TestCase):
    def test_adaptive_recovery_summary_is_bounded_and_drops_untrusted_fields(self) -> None:
        raw = {
            "version": 20,
            "gaps": [
                {
                    "key": f"gap-{index}",
                    "title": "A likely misconception " + ("x" * 400),
                    "platformId": "github",
                    "occurrences": 10_000,
                    "resolved": False,
                    "retryFailed": True,
                    "lastOutcome": "retry_failed",
                    "lastObservedAt": "2026-07-17T10:00:00+00:00",
                    "rawEvidence": {"password": "secret"},
                }
                for index in range(12)
            ],
            "recoveries": {"total": 10_000, "resolved": 2, "retryFailed": 3},
            "authorization": "Bearer secret",
        }

        summary = generated_service.sanitize_adaptive_recovery_summary(raw)
        self.assertEqual(summary["version"], 1)
        self.assertEqual(len(summary["gaps"]), 8)
        self.assertEqual(summary["gaps"][0]["occurrences"], 999)
        self.assertLessEqual(len(summary["gaps"][0]["title"]), 240)
        self.assertNotIn("rawEvidence", summary["gaps"][0])
        self.assertNotIn("secret", str(summary))
        prompt = generated_service.adaptive_recovery_prompt(raw)
        self.assertLessEqual(
            len(prompt),
            generated_service.MAX_ADAPTIVE_RECOVERY_PROMPT_CHARS,
        )
        self.assertTrue(prompt.endswith("required cleanup.\n"))

    def test_outline_and_lesson_prompts_receive_the_same_recovery_snapshot(self) -> None:
        outline = CourseOutline.model_validate({
            "title": "GitHub Workflow",
            "description": "A grounded course about navigating GitHub repositories safely.",
            "difficulty": "Beginner",
            "audience": "New software team members",
            "outcomes": ["Navigate repositories", "Use repository tabs safely"],
            "prerequisites": [],
            "skills": ["GitHub navigation", "Repository workflows"],
            "coverPrompt": "An editorial educational illustration of a repository workflow",
            "modules": [
                {"title": "Foundations", "lessons": [
                    {"title": "Repository layout", "summary": "Learn how repository navigation areas are organized."},
                    {"title": "Issues", "summary": "Practice distinguishing Issues from adjacent repository tabs."},
                ]},
                {"title": "Application", "lessons": [
                    {"title": "Issue lists", "summary": "Apply navigation knowledge to inspect issue lists safely."},
                    {"title": "Review", "summary": "Review the workflow and verify each navigation decision."},
                ]},
            ],
        })
        outline_parse = AsyncMock(
            return_value=SimpleNamespace(output_parsed=outline)
        )
        outline_client = SimpleNamespace(
            responses=SimpleNamespace(parse=outline_parse)
        )
        payload = {
            "source": {
                "text": "Grounded source text about GitHub repository navigation.",
                "title": "GitHub navigation",
            },
            "intake": {**INTAKE, "topic": "GitHub navigation"},
            "answers": {"time_budget": "Up to 1 hour"},
            "adaptiveRecovery": ADAPTIVE_RECOVERY,
        }
        with patch.object(generated_service, "_client", return_value=outline_client):
            asyncio.run(generated_service.generate_outline(payload))
        outline_prompt = outline_parse.await_args.kwargs["input"]
        payload["research"] = {
            "brief": "Authoritative research brief about repository navigation.",
            "citations": [{"id": "src-1", "title": "GitHub Docs", "url": "https://docs.github.com"}],
        }

        lesson_content = LessonContent.model_validate({
            "summary": "A complete lesson about choosing the correct repository navigation area.",
            "duration": "20m",
            "blocks": [
                {"type": "content", "heading": "Navigation model", "paragraphs": ["Repository tabs separate distinct kinds of work."], "citationIds": ["src-1"]},
                {"type": "grid_cards", "heading": "Tab purposes", "cards": [{"title": "Issues", "body": "Tracks proposed and active work."}, {"title": "Pull requests", "body": "Reviews changes to code."}], "citationIds": ["src-1"]},
                {"type": "numbered_list", "heading": "Decision steps", "items": [{"title": "Identify", "body": "Name the work item you need."}, {"title": "Choose", "body": "Select the tab that owns that work item."}], "citationIds": ["src-1"]},
                {"type": "quiz", "heading": "Check", "questions": [{"question": "Where do you inspect tracked work?", "choices": ["Issues", "Pull requests"], "answerIndex": 0, "explanation": "Issues owns tracked work items."}, {"question": "Where are code changes reviewed?", "choices": ["Issues", "Pull requests"], "answerIndex": 1, "explanation": "Pull requests owns code review."}], "citationIds": ["src-1"]},
            ],
        })
        lesson_parse = AsyncMock(
            return_value=SimpleNamespace(output_parsed=lesson_content)
        )
        lesson_client = SimpleNamespace(
            responses=SimpleNamespace(parse=lesson_parse)
        )
        with patch.object(generated_service, "_client", return_value=lesson_client):
            asyncio.run(generated_service.generate_lesson(
                course_title=outline.title,
                module_title=outline.modules[0].title,
                lesson=outline.modules[0].lessons[0],
                research=payload["research"],
                answers=payload["answers"],
                adaptive_recovery=payload["adaptiveRecovery"],
            ))
        lesson_prompt = lesson_parse.await_args.kwargs["input"]

        for prompt in (outline_prompt, lesson_prompt):
            self.assertIn("ADAPTIVE RECOVERY SIGNALS", prompt)
            self.assertIn("Distinguishing repository tabs", prompt)
            self.assertIn("not subject-matter sources", prompt)
            self.assertIn("required cleanup", prompt)
        self.assertIn("Grounded source text about GitHub", outline_prompt)
        self.assertIn("Authoritative research brief", lesson_prompt)

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

    def test_partial_course_exposes_outline_before_first_lesson(self) -> None:
        outline = CourseOutline.model_validate(
            {
                "title": "Streaming Course",
                "description": "Course outline available before lesson generation finishes.",
                "difficulty": "Beginner",
                "audience": "Learners",
                "outcomes": ["Start learning sooner", "Follow course structure"],
                "prerequisites": [],
                "skills": ["Streaming", "Course navigation"],
                "coverPrompt": "An editorial illustration about progressive learning",
                "modules": [
                    {"title": "First module", "lessons": [{"title": "First lesson", "summary": "Pending lesson summary."}]},
                ],
            }
        )
        partial = generated_service._partial_course(
            "course-stream",
            {
                "source": {"type": "prompt", "label": "Prompt"},
                "answers": {},
                "research": {"citations": []},
                "outline": outline.model_dump(),
                "lessonDrafts": {},
                "assets": {},
            },
        )
        self.assertIsNotNone(partial)
        assert partial is not None
        self.assertEqual(partial["modules"][0]["lessons"][0]["status"], "pending")
        self.assertEqual(partial["completedLessonCount"], 0)

    def test_generation_checkpoints_first_lesson_before_starting_the_rest(self) -> None:
        outline = CourseOutline.model_validate(
            {
                "title": "Progressive Course",
                "description": "A course that unlocks its first lesson while the remaining lessons keep generating.",
                "difficulty": "Beginner",
                "audience": "Learners who want to begin immediately",
                "outcomes": ["Begin with a coherent first lesson", "Continue as content arrives"],
                "prerequisites": [],
                "skills": ["Progressive learning", "Course navigation"],
                "coverPrompt": "An editorial educational illustration of a learning path assembling in stages",
                "modules": [
                    {"title": "Foundations", "lessons": [
                        {"title": "Lesson 1", "summary": "Start with the first foundational concept."},
                        {"title": "Lesson 2", "summary": "Build on the first foundational concept."},
                    ]},
                    {"title": "Application", "lessons": [
                        {"title": "Lesson 3", "summary": "Apply the concepts in a guided example."},
                        {"title": "Lesson 4", "summary": "Review the complete practical workflow."},
                    ]},
                ],
            }
        )
        lesson = LessonContent.model_validate({
            "summary": "A complete lesson that is ready for the learner to open.",
            "duration": "15m",
            "blocks": [
                {"type": "content", "heading": "Concept", "paragraphs": ["A clear explanation of the concept."], "citationIds": []},
                {"type": "grid_cards", "heading": "Examples", "cards": [{"title": "One", "body": "The first example."}, {"title": "Two", "body": "The second example."}], "citationIds": []},
                {"type": "numbered_list", "heading": "Practice", "items": [{"title": "Step one", "body": "Try the first step."}, {"title": "Step two", "body": "Verify the result."}], "citationIds": []},
                {"type": "quiz", "heading": "Check", "questions": [{"question": "Which step comes first?", "choices": ["Step one", "Step two"], "answerIndex": 0, "explanation": "Step one begins the workflow."}, {"question": "What follows practice?", "choices": ["Verification", "Nothing"], "answerIndex": 0, "explanation": "Verification confirms the result."}], "citationIds": []},
            ],
        })
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        course_id = "generated-progressive"
        now = datetime.now(timezone.utc)
        with session_factory() as db:
            db.add(GeneratedCourse(
                id=course_id,
                owner_user_id=7,
                status="generating",
                source_type="prompt",
                source_label="Progressive course",
                payload={
                    "version": 2,
                    "source": {"type": "prompt", "label": "Progressive course"},
                    "intake": INTAKE,
                    "answers": {"time_budget": "Up to 1 hour"},
                    "outline": outline.model_dump(),
                    "research": {"brief": "Grounded research", "citations": []},
                    "lessonDrafts": {},
                },
                created_at=now,
                updated_at=now,
            ))
            db.commit()

        async def scenario() -> None:
            release_remaining = asyncio.Event()
            calls: list[str] = []

            async def fake_generate_lesson(**kwargs):
                title = kwargs["lesson"].title
                calls.append(title)
                if title != "Lesson 1":
                    await release_remaining.wait()
                return lesson

            with (
                patch.object(generated_service, "SessionLocal", session_factory),
                patch.object(generated_service, "generate_lesson", side_effect=fake_generate_lesson),
            ):
                task = asyncio.create_task(generated_service.run_generation_job(course_id))
                drafts: dict[str, dict] = {}
                for _ in range(100):
                    await asyncio.sleep(0.01)
                    with session_factory() as db:
                        row = db.get(GeneratedCourse, course_id)
                        assert row is not None
                        drafts = dict((row.payload or {}).get("lessonDrafts") or {})
                    if drafts:
                        break

                self.assertEqual(calls[0], "Lesson 1")
                self.assertEqual(list(drafts), [f"{course_id}-m1-l1"])
                partial = generated_service._partial_course(
                    course_id,
                    {
                        "source": {"type": "prompt", "label": "Progressive course"},
                        "answers": {"time_budget": "Up to 1 hour"},
                        "research": {"citations": []},
                        "outline": outline.model_dump(),
                        "lessonDrafts": drafts,
                    },
                )
                assert partial is not None
                self.assertEqual(partial["completedLessonCount"], 1)
                self.assertEqual(partial["modules"][0]["lessons"][0]["status"], "ready")
                self.assertEqual(partial["modules"][0]["lessons"][1]["status"], "pending")

                task.cancel()
                await asyncio.gather(task, return_exceptions=True)

        asyncio.run(scenario())

    def test_partial_course_streams_ready_images_and_marks_pending_images(self) -> None:
        outline = CourseOutline.model_validate(
            {
                "title": "Visual Course",
                "description": "Course with progressively generated artwork.",
                "difficulty": "Beginner",
                "audience": "Learners",
                "outcomes": ["Understand visuals", "Use diagrams effectively"],
                "prerequisites": [],
                "skills": ["Visual reasoning", "Diagram reading"],
                "coverPrompt": "A visual course cover",
                "modules": [
                    {"title": "Visuals", "lessons": [{"title": "Diagrams", "summary": "Learn with diagrams."}]},
                ],
            }
        )
        ready_cover = {"id": "cover", "status": "ready", "url": "/uploads/cover.webp", "alt": "Cover", "caption": "Cover"}
        payload = {
            "source": {"type": "prompt", "label": "Prompt"},
            "answers": {},
            "research": {"citations": []},
            "outline": outline.model_dump(),
            "lessonDrafts": {
                "course-visual-m1-l1": {
                    "summary": "Diagram lesson",
                    "duration": "15m",
                    "blocks": [
                        {"type": "image", "prompt": "Diagram", "alt": "Pending diagram", "caption": "Diagram caption", "aspect": "wide", "citationIds": []},
                    ],
                },
            },
            "assets": {"cover": ready_cover},
        }
        partial = generated_service._partial_course("course-visual", payload, outline)
        assert partial is not None
        image = partial["modules"][0]["lessons"][0]["contentBlocks"][0]
        self.assertEqual(partial["coverImage"], ready_cover)
        self.assertEqual(image["status"], "pending")
        self.assertEqual(image["asset"]["status"], "pending")
        self.assertNotIn("prompt", image)

        ready_image = {"id": "lesson-1", "status": "ready", "url": "/uploads/lesson.webp", "alt": "Diagram", "caption": "Diagram caption"}
        payload["assets"]["lesson-1"] = ready_image
        partial = generated_service._partial_course("course-visual", payload, outline)
        assert partial is not None
        image = partial["modules"][0]["lessons"][0]["contentBlocks"][0]
        self.assertEqual(image["asset"], ready_image)
        self.assertNotIn("status", image)

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
                    {"id": "open-github", "instruction": "Open GitHub in the browser.", "expectedEvidence": "Tars observes GitHub open.", "assertionIds": ["visit-platform"]},
                    {"id": "open-issues", "instruction": "Click Issues on a repository.", "expectedEvidence": "Tars observes the Issues interaction.", "assertionIds": ["issues-click"]},
                ],
                "successCriteria": ["Tars observes the task and cleanup."],
                "cleanupSteps": [{"id": "close", "instruction": "Leave without creating or editing an issue.", "expectedEvidence": "Tars observes neutral cleanup review.", "assertionIds": ["cleanup"]}],
                "taskAssertions": [{"id": "issues-click", "kind": "click_text", "value": "Issues", "description": "Tars observed the Issues label."}],
                "cleanupAssertions": [{"id": "cleanup", "kind": "interaction_observed", "value": "", "description": "Tars observed cleanup review."}],
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
            db.add(GeneratedCourse(id="generated-test", owner_user_id=7, status="ready", source_type="prompt", source_label="prompt", payload={"course": course, "adaptiveRecovery": ADAPTIVE_RECOVERY}, created_at=now, updated_at=now))
            db.commit()
        with patch.object(generated_service, "SessionLocal", sessions):
            context = generated_service.rich_lesson_context("generated-test", "lesson-1", 7)
            context_without_recovery = generated_service.rich_lesson_context(
                "generated-test",
                "lesson-1",
                7,
                include_adaptive_recovery=False,
            )
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
        self.assertIn("Distinguishing repository tabs", context or "")
        self.assertNotIn("Distinguishing repository tabs", context_without_recovery or "")
        self.assertNotIn("<div>", context or "")
        self.assertIsNone(denied)


if __name__ == "__main__":
    unittest.main()
