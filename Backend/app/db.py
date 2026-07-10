"""Database layer — SQLAlchemy + SQLite.

Replaces Firebase / Firestore entirely.  Exposes:
  - engine, SessionLocal, Base
  - ORM models: User, Profile, Session, Progress, Quiz, StudyPlan, Tutor,
    ScheduledSession, GeneratedCourse, BrowserLabRun
  - get_session() generator (FastAPI dependency)
  - init_db() called at import time: creates tables + seeds users from
    settings.app_users (bcrypt-hashed).
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, List, Optional

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Float,
    Integer,
    String,
    UniqueConstraint,
    create_engine,
    select,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    sessionmaker,
)

from app.config import settings

logger = logging.getLogger(__name__)


# ── Engine + session factory ────────────────────────────────────────────────

_url = settings.database_url
if _url.startswith("sqlite"):
    engine = create_engine(
        _url,
        echo=False,
        future=True,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(_url, echo=False, future=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


# ── Models ──────────────────────────────────────────────────────────────────


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    picture: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    timezone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class Profile(Base):
    """Editable profile fields (bio, grade, school, languages, preferences)."""

    __tablename__ = "profiles"

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bio: Mapped[str] = mapped_column(String(2048), default="")
    grade: Mapped[str] = mapped_column(String(64), default="")
    school: Mapped[str] = mapped_column(String(128), default="")
    languages: Mapped[list] = mapped_column(JSON, default=list)
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


class SessionRow(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    session_id: Mapped[str] = mapped_column(String(128), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="active")
    topic: Mapped[str] = mapped_column(String(255), default="General Tutoring")
    subject: Mapped[str] = mapped_column(String(128), default="")
    duration_minutes: Mapped[float] = mapped_column(Float, default=0.0)
    tutor_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    # Session notes (filled by save_session_notes tool)
    notes: Mapped[Optional[str]] = mapped_column(String(8192), nullable=True)
    key_concepts: Mapped[list] = mapped_column(JSON, default=list)


class Progress(Base):
    __tablename__ = "progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    subject: Mapped[str] = mapped_column(String(128), index=True)
    topic: Mapped[str] = mapped_column(String(255), index=True)
    mastery_level: Mapped[int] = mapped_column(Integer, default=1)
    details: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


class Quiz(Base):
    __tablename__ = "quizzes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    session_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    subject: Mapped[str] = mapped_column(String(128), default="")
    topic: Mapped[str] = mapped_column(String(255), default="")
    score: Mapped[int] = mapped_column(Integer, default=0)
    total: Mapped[int] = mapped_column(Integer, default=0)
    percentage: Mapped[float] = mapped_column(Float, default=0.0)
    questions_missed: Mapped[list] = mapped_column(JSON, default=list)
    taken_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


class StudyPlan(Base):
    __tablename__ = "study_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    plan_name: Mapped[str] = mapped_column(String(255))
    subjects: Mapped[list] = mapped_column(JSON, default=list)
    weekly_goals: Mapped[list] = mapped_column(JSON, default=list)
    target_date: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


class Tutor(Base):
    __tablename__ = "tutors"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    name: Mapped[str] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(255), default="")
    desc: Mapped[str] = mapped_column(String(2048), default="")
    avatar: Mapped[str] = mapped_column(String(2048), default="")
    placeholder: Mapped[str] = mapped_column(String(2048), default="")
    subjects: Mapped[list] = mapped_column(JSON, default=list)
    personality: Mapped[str] = mapped_column(String(64), default="")
    level: Mapped[str] = mapped_column(String(64), default="Intermediate")
    voice: Mapped[str] = mapped_column(String(64), default="ash")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    styles: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(32), default="New")
    stats: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


class ScheduledSession(Base):
    __tablename__ = "scheduled_sessions"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    title: Mapped[str] = mapped_column(String(255))
    subject: Mapped[str] = mapped_column(String(128), default="")
    tutor: Mapped[str] = mapped_column(String(255), default="")
    avatar: Mapped[str] = mapped_column(String(2048), default="")
    description: Mapped[str] = mapped_column(String(2048), default="")
    start_time: Mapped[str] = mapped_column(String(64))  # ISO datetime string
    duration_hours: Mapped[float] = mapped_column(Float, default=1.0)
    session_type: Mapped[str] = mapped_column(String(32), default="manual")
    subject_class: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


class GeneratedCourse(Base):
    """Owner-scoped AI course generation state and persisted course payload."""

    __tablename__ = "generated_courses"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    owner_user_id: Mapped[int] = mapped_column(Integer, index=True)
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    source_type: Mapped[str] = mapped_column(String(32), default="url")
    source_label: Mapped[str] = mapped_column(String(512), default="")
    source_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    extraction_mode: Mapped[str] = mapped_column(String(64), default="")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class BrowserLabRun(Base):
    """A learner-owned, server-verified run of one generated browser lab.

    The course JSON is the source of the lab definition, but a run retains an
    immutable snapshot so a later course regeneration cannot change what a
    learner needs to prove. Evidence remains in the run rather than being
    accepted as a client-side completion flag.
    """

    __tablename__ = "browser_lab_runs"
    __table_args__ = (
        UniqueConstraint(
            "owner_user_id",
            "course_id",
            "lesson_id",
            name="uq_browser_lab_run_owner_course_lesson",
        ),
    )

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    owner_user_id: Mapped[int] = mapped_column(Integer, index=True)
    course_id: Mapped[str] = mapped_column(String(128), index=True)
    lesson_id: Mapped[str] = mapped_column(String(192), index=True)
    platform_id: Mapped[str] = mapped_column(String(128), default="")
    launch_url: Mapped[str] = mapped_column(String(2048), default="")
    allowed_hosts: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(32), default="running", index=True)
    plan_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    evidence: Mapped[list] = mapped_column(JSON, default=list)
    verification: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


# ── Helpers ────────────────────────────────────────────────────────────────


def init_db() -> None:
    """Create all tables and seed configured users."""
    Base.metadata.create_all(bind=engine)
    _seed_users()


def _seed_users() -> None:
    """Seed users from settings.app_users (list of {username,password})."""
    users = settings.seeded_users
    if not users:
        return
    from passlib.context import CryptContext

    pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
    with SessionLocal() as db:
        for u in users:
            username = (u.get("username") or "").strip()
            password = u.get("password") or ""
            if not username or not password:
                continue
            existing = db.scalar(select(User).where(User.username == username))
            if existing:
                continue
            db.add(
                User(
                    username=username,
                    password_hash=pwd.hash(password),
                    email=u.get("email"),
                    name=u.get("name") or username,
                )
            )
            logger.info("Seeded user: %s", username)
        db.commit()


@contextmanager
def get_session() -> Iterator[Any]:
    """Yield a SQLAlchemy session; commit on success, rollback on error."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db_session() -> Any:
    """Return a raw SQLAlchemy session (caller owns lifecycle)."""
    return SessionLocal()


def get_user_by_username(username: str) -> Optional[User]:
    with SessionLocal() as db:
        return db.scalar(select(User).where(User.username == username))


def get_user_by_id(uid: int) -> Optional[User]:
    with SessionLocal() as db:
        return db.get(User, uid)


# Initialised at import time
try:
    init_db()
except Exception as exc:
    logger.error("init_db failed: %s", exc, exc_info=True)
