from __future__ import annotations

import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import extension_tokens, session_tokens
from app.db import Base, User


class AppSessionTokenTests(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        self.session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        with self.session_factory() as db:
            db.add(User(id=7, username="learner", password_hash="unused"))
            db.commit()
        self.db_patch = patch.object(session_tokens, "SessionLocal", self.session_factory)
        self.secret_patch = patch.object(
            session_tokens.settings,
            "app_session_token_secret",
            "test-session-secret-with-enough-entropy",
        )
        self.db_patch.start()
        self.secret_patch.start()

    def tearDown(self) -> None:
        self.secret_patch.stop()
        self.db_patch.stop()

    def test_round_trip_returns_database_user(self) -> None:
        token, _ = session_tokens.create_app_session_token({"uid": "7", "username": "learner"})
        authenticated = session_tokens.verify_app_session_token(f"Bearer {token}")
        self.assertEqual(authenticated["uid"], "7")
        self.assertEqual(authenticated["username"], "learner")

    def test_rejects_tampered_signature(self) -> None:
        token, _ = session_tokens.create_app_session_token({"uid": "7", "username": "learner"})
        replacement = "A" if token[-1] != "A" else "B"
        self.assertIsNone(session_tokens.verify_app_session_token(token[:-1] + replacement))

    def test_rejects_expired_session(self) -> None:
        with patch.object(session_tokens.time, "time", return_value=1_000):
            token, expires_at = session_tokens.create_app_session_token(
                {"uid": "7", "username": "learner"}
            )
        with patch.object(session_tokens.time, "time", return_value=expires_at + 1):
            self.assertIsNone(session_tokens.verify_app_session_token(token))

class ExtensionSessionTokenTests(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        self.session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        with self.session_factory() as db:
            db.add(User(id=8, username="extension-user", password_hash="unused"))
            db.commit()
        self.db_patch = patch.object(extension_tokens, "SessionLocal", self.session_factory)
        self.secret_patch = patch.object(
            extension_tokens.settings,
            "tars_extension_token_secret",
            "test-extension-secret-with-enough-entropy",
        )
        self.db_patch.start()
        self.secret_patch.start()

    def tearDown(self) -> None:
        self.secret_patch.stop()
        self.db_patch.stop()

    def test_round_trip_and_length_limit(self) -> None:
        token, _ = extension_tokens.create_tars_extension_token(
            {"uid": "8", "username": "extension-user"}
        )
        authenticated = extension_tokens.verify_tars_extension_token(token)
        self.assertEqual(authenticated["uid"], "8")
        self.assertIsNone(extension_tokens.verify_tars_extension_token("x" * 4097))

    def test_rejects_future_issued_token(self) -> None:
        with patch.object(extension_tokens.time, "time", return_value=1_000):
            token, _ = extension_tokens.create_tars_extension_token(
                {"uid": "8", "username": "extension-user"}
            )
        with patch.object(extension_tokens.time, "time", return_value=900):
            self.assertIsNone(extension_tokens.verify_tars_extension_token(token))


if __name__ == "__main__":
    unittest.main()
