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
from app.db import Base, GeneratedCourse
from app.routers import browser_labs as browser_labs_router
from app.services import browser_labs as browser_labs_service


class BrowserLabRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        self.session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        app = FastAPI()
        app.include_router(browser_labs_router.router)
        app.dependency_overrides[get_current_user] = lambda: {"uid": "7", "username": "learner"}
        app.dependency_overrides[browser_labs_router.get_clicky_extension_user] = lambda: {"uid": "7", "username": "learner"}
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
                            {"id": "cleanup", "kind": "interaction_observed", "value": "", "description": "Cleanup observed."},
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

    def test_attempt_requires_task_and_cleanup_evidence_before_verified(self) -> None:
        created = self.client.post("/api/browser-labs/course-1/lesson-1-lab/attempts")
        self.assertEqual(created.status_code, 200)
        attempt = created.json()["attempt"]

        nav = self.client.post(
            f"/api/browser-labs/attempts/{attempt['id']}/evidence",
            json={"kind": "navigation", "payload": {"url": "https://github.com/openai/openai", "title": "GitHub"}},
        )
        self.assertEqual(nav.status_code, 200)
        self.assertEqual(nav.json()["attempt"]["status"], "running")

        click = self.client.post(
            f"/api/browser-labs/attempts/{attempt['id']}/evidence",
            json={"kind": "click", "payload": {"url": "https://github.com/openai/openai", "text": "Issues", "role": "link"}},
        )
        self.assertEqual(click.status_code, 200)
        self.assertEqual(click.json()["attempt"]["status"], "needs_cleanup")

        cleanup = self.client.post(
            f"/api/browser-labs/attempts/{attempt['id']}/evidence",
            json={"kind": "assertion_observed", "payload": {"url": "https://github.com/openai/openai", "assertionId": "cleanup"}},
        )
        self.assertEqual(cleanup.status_code, 200)
        self.assertEqual(cleanup.json()["attempt"]["status"], "verified")

    def test_rejects_evidence_outside_allowed_hosts(self) -> None:
        created = self.client.post("/api/browser-labs/course-1/lesson-1-lab/attempts")
        attempt = created.json()["attempt"]
        response = self.client.post(
            f"/api/browser-labs/attempts/{attempt['id']}/evidence",
            json={"kind": "navigation", "payload": {"url": "https://example.com"}},
        )
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
