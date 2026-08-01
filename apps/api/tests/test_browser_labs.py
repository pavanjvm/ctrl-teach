from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.dependencies import get_current_user
from app.db import Base, BrowserLabRecovery, BrowserLabRun, GeneratedCourse
from app.routers import browser_labs as browser_labs_router
from app.services import browser_labs as browser_labs_service


class BrowserLabRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)
        app = FastAPI()
        app.include_router(browser_labs_router.router)
        self.current_user = {"uid": "7", "username": "learner"}
        app.dependency_overrides[get_current_user] = lambda: self.current_user
        app.dependency_overrides[browser_labs_router.get_tars_extension_user] = lambda: self.current_user
        self.client = TestClient(app)
        self.patcher = patch.object(browser_labs_service, "SessionLocal", self.session_factory)
        self.patcher.start()

        now = datetime.now(timezone.utc)
        course = {
            "title": "GitHub Workflow",
            "modules": [{
                "title": "Practice",
                "lessons": [{
                    "id": "lesson-1-lab",
                    "title": "Hands-on lab: GitHub issues",
                    "type": "lab",
                    "summary": "Practice inspecting GitHub issues.",
                    "browserLab": {
                        "platformId": "github",
                        "platform": "GitHub",
                        "launchUrl": "https://github.com/",
                        "allowedHosts": ["github.com"],
                        "objective": "Inspect a GitHub issue list.",
                        "steps": [{"id": "issues", "instruction": "Click Issues.", "expectedEvidence": "Issues clicked.", "assertionIds": ["visit-platform", "issues-click"]}],
                        "cleanupSteps": [{"id": "cleanup", "instruction": "Leave without editing.", "expectedEvidence": "Cleanup reviewed.", "assertionIds": ["cleanup"]}],
                        "successCriteria": ["Task and cleanup are observed."],
                        "taskAssertions": [
                            {"id": "visit-platform", "kind": "visit_host", "value": "github.com", "description": "Visited GitHub."},
                            {"id": "issues-click", "kind": "click_text", "value": "Issues", "description": "Clicked Issues."},
                        ],
                        "cleanupAssertions": [
                            {"id": "cleanup", "kind": "interaction_observed", "value": "Repository home", "description": "Cleanup observed."},
                        ],
                        "estimatedDuration": "15m",
                    },
                }],
            }],
        }
        with self.session_factory() as db:
            db.add(GeneratedCourse(
                id="course-1",
                owner_user_id=7,
                status="ready",
                source_type="prompt",
                source_label="prompt",
                payload={"course": course},
                created_at=now,
                updated_at=now,
            ))
            db.commit()

    def tearDown(self) -> None:
        self.patcher.stop()
        self.engine.dispose()

    def _create_attempt(self) -> dict:
        response = self.client.post("/api/browser-labs/course-1/lesson-1-lab/attempts")
        self.assertEqual(response.status_code, 200)
        return response.json()["attempt"]

    def test_refresh_starts_a_new_uncompleted_attempt(self) -> None:
        first = self._create_attempt()
        self._evidence(
            first["id"],
            "navigation",
            {"url": "https://github.com/openai/openai", "title": "GitHub"},
        )

        refreshed = self._create_attempt()

        self.assertEqual(refreshed["id"], first["id"])
        self.assertEqual(refreshed["status"], "running")
        self.assertEqual(refreshed["evidenceCount"], 0)

    def test_empty_interaction_assertion_never_completes_from_an_arbitrary_click(self) -> None:
        result = browser_labs_service.verify_evidence(
            {
                "allowedHosts": ["github.com"],
                "taskAssertions": [{
                    "id": "anything",
                    "kind": "interaction_observed",
                    "value": "",
                }],
                "cleanupAssertions": [],
            },
            [{
                "kind": "click",
                "phase": "task",
                "host": "github.com",
                "url": "https://github.com/",
                "text": "Profile",
            }],
        )

        self.assertFalse(result["taskComplete"])
        self.assertEqual(result["status"], "running")

    def _evidence(
        self,
        attempt_id: str,
        kind: str,
        payload: dict,
        *,
        client_event_id: str | None = None,
    ):
        body = {"kind": kind, "payload": payload}
        if client_event_id:
            body["clientEventId"] = client_event_id
        return self.client.post(
            f"/api/browser-labs/attempts/{attempt_id}/evidence",
            json=body,
        )

    def _start_recovery(self, attempt_id: str):
        return self.client.post(f"/api/browser-labs/attempts/{attempt_id}/recovery")

    def _internal_recovery(self, recovery_id: str) -> BrowserLabRecovery:
        with self.session_factory() as db:
            recovery = db.get(BrowserLabRecovery, recovery_id)
            assert recovery is not None
            db.expunge(recovery)
            return recovery

    def _complete_practice(self, attempt_id: str, recovery_id: str) -> dict:
        internal = self._internal_recovery(recovery_id)
        correct_option = str((internal.practice_task or {})["correctOptionId"])
        response = self.client.post(
            f"/api/browser-labs/attempts/{attempt_id}/recoveries/{recovery_id}/practice-attempts",
            json={"clientAttemptId": "practice-correct", "optionId": correct_option},
        )
        self.assertEqual(response.status_code, 200)
        return response.json()["attempt"]

    def test_attempt_requires_task_and_cleanup_evidence_before_verified(self) -> None:
        attempt = self._create_attempt()

        nav = self._evidence(
            attempt["id"],
            "navigation",
            {"url": "https://github.com/openai/openai", "title": "GitHub"},
        )
        self.assertEqual(nav.status_code, 200)
        self.assertEqual(nav.json()["attempt"]["status"], "running")

        click = self._evidence(
            attempt["id"],
            "click",
            {"url": "https://github.com/openai/openai", "text": "Issues", "role": "link"},
        )
        self.assertEqual(click.status_code, 200)
        self.assertEqual(click.json()["attempt"]["status"], "needs_cleanup")

        telemetry = self._evidence(
            attempt["id"],
            "assertion_observed",
            {
                "url": "https://github.com/openai/openai",
                "assertionId": "cleanup",
                "phase": "cleanup",
            },
        )
        self.assertEqual(telemetry.status_code, 200)
        self.assertEqual(telemetry.json()["attempt"]["status"], "needs_cleanup")

        early_cleanup = self._evidence(
            attempt["id"],
            "click",
            {"url": "https://github.com/openai/openai", "text": "Repository home"},
        )
        self.assertEqual(early_cleanup.json()["attempt"]["status"], "needs_cleanup")

        boundary = self._evidence(attempt["id"], "cleanup_started", {})
        self.assertEqual(boundary.json()["attempt"]["status"], "needs_cleanup")
        cleanup = self._evidence(
            attempt["id"],
            "click",
            {"url": "https://github.com/openai/openai", "text": "Repository home"},
        )
        self.assertEqual(cleanup.status_code, 200)
        self.assertEqual(cleanup.json()["attempt"]["status"], "verified")

    def test_rejects_evidence_outside_allowed_hosts(self) -> None:
        attempt = self._create_attempt()
        response = self._evidence(attempt["id"], "navigation", {"url": "https://example.com"})
        self.assertEqual(response.status_code, 400)

    def test_recovery_requires_real_attempt_evidence(self) -> None:
        attempt = self._create_attempt()
        empty_check = self._start_recovery(attempt["id"])
        self.assertEqual(empty_check.status_code, 409)

        empty_url = self._evidence(
            attempt["id"],
            "click",
            {"text": "Issues", "phase": "task"},
        )
        self.assertEqual(empty_url.status_code, 200)
        self.assertFalse(empty_url.json()["attempt"]["verification"]["taskComplete"])
        self.assertEqual(self._start_recovery(attempt["id"]).status_code, 409)

    def test_recovery_practice_and_fresh_retry_cannot_bypass_original_or_cleanup(self) -> None:
        attempt = self._create_attempt()
        attempt_id = attempt["id"]
        self._evidence(
            attempt_id,
            "navigation",
            {"url": "https://github.com/openai/openai", "title": "GitHub"},
            client_event_id="task-nav",
        )

        checked = self._start_recovery(attempt_id)
        self.assertEqual(checked.status_code, 200)
        recovery = checked.json()["attempt"]["activeRecovery"]
        recovery_id = recovery["id"]
        self.assertEqual(recovery["status"], "practicing")
        self.assertEqual(recovery["failedStep"]["id"], "issues")
        self.assertEqual(recovery["gapKey"].split(":")[1], "control_identification")
        self.assertIsInstance(recovery["misconception"]["evidenceSummary"], str)
        self.assertTrue(recovery["microLesson"]["beats"])
        self.assertTrue(recovery["practiceTask"]["options"][0]["label"])
        self.assertNotIn("correctOptionId", str(recovery))

        duplicate_check = self._start_recovery(attempt_id)
        self.assertEqual(
            duplicate_check.json()["attempt"]["activeRecovery"]["id"],
            recovery_id,
        )

        practice_evidence = self._evidence(
            attempt_id,
            "click",
            {"url": "https://github.com/openai/openai", "text": "Issues"},
        )
        self.assertEqual(practice_evidence.json()["attempt"]["status"], "recovering")
        self.assertFalse(practice_evidence.json()["attempt"]["verification"]["taskComplete"])

        internal = self._internal_recovery(recovery_id)
        correct_option = str((internal.practice_task or {})["correctOptionId"])
        wrong_option = next(
            str(option["id"])
            for option in (internal.practice_task or {})["options"]
            if option["id"] != correct_option
        )
        wrong = self.client.post(
            f"/api/browser-labs/attempts/{attempt_id}/recoveries/{recovery_id}/practice-attempts",
            json={"clientAttemptId": "practice-wrong", "optionId": wrong_option},
        )
        self.assertEqual(wrong.status_code, 200)
        self.assertEqual(wrong.json()["attempt"]["activeRecovery"]["status"], "practicing")
        duplicate_wrong = self.client.post(
            f"/api/browser-labs/attempts/{attempt_id}/recoveries/{recovery_id}/practice-attempts",
            json={"clientAttemptId": "practice-wrong", "optionId": correct_option},
        )
        self.assertEqual(
            len(duplicate_wrong.json()["attempt"]["activeRecovery"]["practiceAttempts"]),
            1,
        )

        practice_complete = self._complete_practice(attempt_id, recovery_id)
        self.assertEqual(practice_complete["activeRecovery"]["status"], "retry_ready")
        self.assertFalse(practice_complete["verification"]["taskComplete"])

        retry = self.client.post(
            f"/api/browser-labs/attempts/{attempt_id}/recoveries/{recovery_id}/retry"
        )
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(retry.json()["attempt"]["activeRecovery"]["status"], "retrying")

        forged = self._evidence(
            attempt_id,
            "assertion_observed",
            {
                "url": "https://github.com/openai/openai",
                "assertionId": "issues-click",
                "phase": "retry",
            },
        )
        self.assertEqual(forged.json()["attempt"]["activeRecovery"]["status"], "retrying")

        retried = self._evidence(
            attempt_id,
            "click",
            {"url": "https://github.com/openai/openai", "text": "Issues"},
        )
        self.assertEqual(retried.json()["attempt"]["status"], "needs_cleanup")
        self.assertIsNone(retried.json()["attempt"]["activeRecovery"])

        before_boundary = self._evidence(
            attempt_id,
            "click",
            {"url": "https://github.com/openai/openai", "text": "Repository home"},
        )
        self.assertEqual(before_boundary.json()["attempt"]["status"], "needs_cleanup")
        self._evidence(attempt_id, "cleanup_started", {})
        verified = self._evidence(
            attempt_id,
            "click",
            {"url": "https://github.com/openai/openai", "text": "Repository home"},
        ).json()["attempt"]
        self.assertEqual(verified["status"], "verified")
        self.assertEqual(verified["recoveryHistory"][0]["finalOutcome"], "resolved")

        reloaded = self.client.get(f"/api/browser-labs/attempts/{attempt_id}").json()["attempt"]
        self.assertEqual(reloaded["status"], "verified")
        self.assertEqual(reloaded["recoveryHistory"][0]["id"], recovery_id)
        with self.session_factory() as db:
            stored = db.get(BrowserLabRecovery, recovery_id)
            assert stored is not None
            self.assertEqual((stored.final_outcome or {})["labStatus"], "verified")
            summary = browser_labs_service.adaptive_recovery_summary(db, 7)
            other_summary = browser_labs_service.adaptive_recovery_summary(db, 8)
        self.assertEqual(summary["recoveries"]["total"], 1)
        self.assertEqual(other_summary["recoveries"]["total"], 0)

    def test_retry_reproves_every_assertion_linked_to_failed_step(self) -> None:
        attempt = self._create_attempt()
        attempt_id = attempt["id"]
        with self.session_factory() as db:
            run = db.get(BrowserLabRun, attempt_id)
            assert run is not None
            plan = dict(run.plan_snapshot or {})
            plan["taskAssertions"] = [
                {"id": "repo-click", "kind": "click_text", "value": "Repositories", "description": "Clicked Repositories."},
                {"id": "issues-click", "kind": "click_text", "value": "Issues", "description": "Clicked Issues."},
            ]
            plan["steps"] = [{
                "id": "issues",
                "instruction": "Use Repositories, then click Issues.",
                "expectedEvidence": "Both controls clicked.",
                "assertionIds": ["repo-click", "issues-click"],
            }]
            run.plan_snapshot = plan
            run.verification = browser_labs_service.verify_evidence(plan, [])
            db.commit()

        self._evidence(
            attempt_id,
            "click",
            {"url": "https://github.com/openai/openai", "text": "Repositories"},
        )
        recovery = self._start_recovery(attempt_id).json()["attempt"]["activeRecovery"]
        self._complete_practice(attempt_id, recovery["id"])
        self.client.post(
            f"/api/browser-labs/attempts/{attempt_id}/recoveries/{recovery['id']}/retry"
        )

        missing_fresh_passed_assertion = self._evidence(
            attempt_id,
            "click",
            {"url": "https://github.com/openai/openai", "text": "Issues"},
        ).json()["attempt"]
        self.assertEqual(missing_fresh_passed_assertion["activeRecovery"]["status"], "retrying")
        completed_retry = self._evidence(
            attempt_id,
            "click",
            {"url": "https://github.com/openai/openai", "text": "Repositories"},
        ).json()["attempt"]
        self.assertEqual(completed_retry["status"], "needs_cleanup")

    def test_refresh_replaces_the_plan_snapshot_with_current_course_data(self) -> None:
        attempt = self._create_attempt()
        original_plan = attempt["plan"]
        with self.session_factory() as db:
            course = db.get(GeneratedCourse, "course-1")
            assert course is not None
            payload = dict(course.payload or {})
            changed_course = dict(payload["course"])
            modules = [dict(module) for module in changed_course["modules"]]
            lessons = [dict(lesson) for lesson in modules[0]["lessons"]]
            lessons[0]["browserLab"] = {
                **lessons[0]["browserLab"],
                "steps": [],
                "cleanupSteps": [],
                "taskAssertions": [],
                "cleanupAssertions": [],
            }
            modules[0]["lessons"] = lessons
            changed_course["modules"] = modules
            course.payload = {**payload, "course": changed_course}
            db.commit()

        reopened = self._create_attempt()
        self.assertEqual(reopened["id"], attempt["id"])
        self.assertNotEqual(reopened["plan"], original_plan)
        current = self.client.get(f"/api/browser-labs/attempts/{attempt['id']}").json()["attempt"]
        self.assertEqual(current["plan"], reopened["plan"])
        self.assertEqual(current["evidenceCount"], 0)

    def test_verified_attempt_is_terminal_until_the_page_reloads(self) -> None:
        attempt = self._create_attempt()

        self._evidence(attempt["id"], "navigation", {"url": "https://github.com/openai/openai"})
        self._evidence(attempt["id"], "click", {"url": "https://github.com/openai/openai", "text": "Issues"})
        self._evidence(attempt["id"], "cleanup_started", {})
        verified = self._evidence(
            attempt["id"],
            "click",
            {"url": "https://github.com/openai/openai", "text": "Repository home"},
        ).json()["attempt"]
        self.assertEqual(verified["status"], "verified")
        evidence_count = verified["evidenceCount"]
        terminal = self._evidence(
            attempt["id"],
            "navigation",
            {"url": "https://example.com"},
        )
        self.assertEqual(terminal.status_code, 200)
        self.assertEqual(terminal.json()["attempt"]["status"], "verified")
        self.assertEqual(terminal.json()["attempt"]["evidenceCount"], evidence_count)

    def test_attempt_and_recovery_are_owner_scoped(self) -> None:
        attempt = self._create_attempt()
        self._evidence(attempt["id"], "navigation", {"url": "https://github.com/openai/openai"})
        recovery = self._start_recovery(attempt["id"]).json()["attempt"]["activeRecovery"]
        self.current_user = {"uid": "8", "username": "other"}
        self.assertEqual(
            self.client.get(f"/api/browser-labs/attempts/{attempt['id']}").status_code,
            404,
        )
        self.assertEqual(self._start_recovery(attempt["id"]).status_code, 404)
        denied_practice = self.client.post(
            f"/api/browser-labs/attempts/{attempt['id']}/recoveries/{recovery['id']}/practice-attempts",
            json={"clientAttemptId": "other", "optionId": "option-1"},
        )
        self.assertEqual(denied_practice.status_code, 404)


if __name__ == "__main__":
    unittest.main()
