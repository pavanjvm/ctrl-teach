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
from app.db import Base, ScheduledSession
from app.routers import schedule as schedule_router


class ScheduleRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        self.session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

        app = FastAPI()
        app.include_router(schedule_router.router)
        app.dependency_overrides[get_current_user] = lambda: {"uid": "7", "username": "learner"}
        self.client = TestClient(app)
        self.patcher = patch.object(schedule_router, "SessionLocal", self.session_factory)
        self.patcher.start()

    def tearDown(self) -> None:
        self.patcher.stop()

    @staticmethod
    def valid_payload() -> dict:
        return {
            "title": "  Algebra review  ",
            "subject": "math",
            "tutor": "Prof. Algebra",
            "start_time": "2026-07-15T10:30:00+05:30",
            "duration_hours": 1.5,
            "session_type": "manual",
            "subject_class": "math",
        }

    def test_create_and_list_preserve_exact_datetime(self) -> None:
        created = self.client.post("/api/schedule", json=self.valid_payload())

        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.json()["title"], "Algebra review")
        self.assertEqual(created.json()["start_time"], "2026-07-15T10:30:00+05:30")
        self.assertEqual(created.json()["duration_hours"], 1.5)

        listed = self.client.get("/api/schedule/all")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()["sessions"]), 1)
        self.assertEqual(listed.json()["sessions"][0]["start_time"], "2026-07-15T10:30:00+05:30")

    def test_create_rejects_invalid_session_data(self) -> None:
        invalid_values = (
            ("title", "   "),
            ("start_time", "2026-07-15T10:30:00"),
            ("start_time", "not-a-date"),
            ("duration_hours", 0),
            ("duration_hours", 13),
            ("session_type", "external"),
            ("subject_class", "unknown"),
        )

        for field, value in invalid_values:
            with self.subTest(field=field, value=value):
                payload = self.valid_payload()
                payload[field] = value
                response = self.client.post("/api/schedule", json=payload)
                self.assertEqual(response.status_code, 422)

    def test_update_reuses_validation_rules(self) -> None:
        created = self.client.post("/api/schedule", json=self.valid_payload()).json()

        invalid = self.client.put(
            f"/api/schedule/{created['id']}",
            json={"start_time": "2026-08-01T09:00:00"},
        )
        self.assertEqual(invalid.status_code, 422)

        updated = self.client.put(
            f"/api/schedule/{created['id']}",
            json={"title": "  Geometry review  ", "duration_hours": 0.5},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["title"], "Geometry review")
        self.assertEqual(updated.json()["duration_hours"], 0.5)

    def test_other_users_sessions_are_not_visible_or_mutable(self) -> None:
        now = datetime.now(timezone.utc)
        with self.session_factory() as db:
            db.add(ScheduledSession(
                id="other-session",
                user_id=8,
                title="Private session",
                start_time="2026-07-18T11:00:00+05:30",
                duration_hours=1,
                session_type="manual",
                subject_class="science",
                created_at=now,
                updated_at=now,
            ))
            db.commit()

        self.assertEqual(self.client.get("/api/schedule").json(), [])
        self.assertEqual(self.client.get("/api/schedule/all").json()["sessions"], [])
        self.assertEqual(
            self.client.put("/api/schedule/other-session", json={"title": "Changed"}).status_code,
            404,
        )
        self.assertEqual(self.client.delete("/api/schedule/other-session").status_code, 404)


if __name__ == "__main__":
    unittest.main()
