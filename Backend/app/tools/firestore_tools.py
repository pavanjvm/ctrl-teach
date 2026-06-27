"""Persistence tools — now backed by SQLite via SQLAlchemy.

All functions are plain callables wrapped by ``function_tool`` in the agent
builders.  They read the current user's numeric id + the current realtime
session id from the calendar_mcp contextvars (set by main.py per WebSocket).

Each tool is wrapped by ``_safe_tool`` so it never raises into the realtime
session — failures become graceful error dicts.
"""

from __future__ import annotations

import asyncio
import functools
import inspect
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from sqlalchemy import select

from app.db import (
    Progress,
    Quiz,
    SessionLocal,
    SessionRow,
    StudyPlan,
)
from app.mcp.calendar_mcp import current_session_id, current_user_id
from app.utils.ws_signals import ws_notify

logger = logging.getLogger(__name__)


def _notify_ws(data: Dict[str, Any]) -> None:
    """Emit a per-session WS signal from sync tool code without leaking coroutines."""
    notify = ws_notify.get()
    if not notify:
        return
    try:
        result = notify(data)
        if inspect.isawaitable(result):
            try:
                asyncio.get_running_loop().create_task(result)  # type: ignore[arg-type]
            except RuntimeError:
                # No loop in this thread; close coroutine to avoid RuntimeWarning.
                if inspect.iscoroutine(result):
                    result.close()
    except Exception:
        pass


def _real_uid(user_id: str) -> int:
    """Return the authenticated user's numeric id (from the WS context)."""
    ctx = current_user_id.get()
    if ctx:
        try:
            return int(ctx)
        except (TypeError, ValueError):
            pass
    try:
        return int(user_id)
    except (TypeError, ValueError):
        raise RuntimeError("No authenticated user context available")


def _real_session_id(session_id: str) -> str:
    ctx = current_session_id.get()
    if ctx:
        return ctx
    return session_id


def _safe_tool(fn: Callable) -> Callable:
    @functools.wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Dict[str, Any]:
        try:
            return fn(*args, **kwargs)
        except Exception as exc:
            logger.error("%s failed: %s", fn.__name__, exc, exc_info=True)
            return {"status": "error", "message": f"{fn.__name__} is temporarily unavailable."}

    return wrapper


# ── Session Notes ───────────────────────────────────────────────────────────


@_safe_tool
def save_session_notes(
    user_id: str,
    session_id: str,
    subject: str,
    topic: str,
    notes: str,
    key_concepts: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Save session notes and key concepts for the given session."""
    uid = _real_uid(user_id)
    sid = _real_session_id(session_id)
    with SessionLocal() as db:
        row = db.scalar(
            select(SessionRow).where(
                SessionRow.user_id == uid, SessionRow.session_id == sid
            )
        )
        if row is None:
            # Create the row if it didn't exist (rare — main.py creates it).
            row = SessionRow(
                user_id=uid,
                session_id=sid,
                status="completed",
                topic=topic,
                subject=subject,
            )
            db.add(row)
        row.subject = subject
        row.topic = topic
        row.notes = notes
        row.key_concepts = key_concepts or []
        db.commit()
    logger.info("Saved session notes: user=%s session=%s topic=%s", uid, sid, topic)
    return {"status": "ok", "message": f"Session notes saved for {topic}."}


# ── Progress Tracking ────────────────────────────────────────────────────────


@_safe_tool
def update_progress(
    user_id: str,
    subject: str,
    topic: str,
    mastery_level: int,
    details: str = "",
) -> Dict[str, Any]:
    """Update the student's mastery level (1-5) for a subject/topic."""
    _notify_ws({"type": "saving_progress", "status": "started", "topic": topic, "subject": subject})

    if mastery_level < 1 or mastery_level > 5:
        _notify_ws({"type": "saving_progress", "status": "error"})
        return {"status": "error", "message": "mastery_level must be between 1 and 5."}

    uid = _real_uid(user_id)
    with SessionLocal() as db:
        row = db.scalar(
            select(Progress).where(
                Progress.user_id == uid,
                Progress.subject == subject,
                Progress.topic == topic,
            )
        )
        if row is None:
            row = Progress(user_id=uid, subject=subject, topic=topic)
            db.add(row)
        row.mastery_level = mastery_level
        row.details = details
        row.updated_at = datetime.now(timezone.utc)
        db.commit()
    logger.info("Progress updated: user=%s %s/%s → %d", uid, subject, topic, mastery_level)

    _notify_ws({"type": "saving_progress", "status": "done", "topic": topic})

    return {"status": "ok", "message": f"Progress updated: {topic} → level {mastery_level}/5."}


@_safe_tool
def get_progress(
    user_id: str,
    subject: Optional[str] = None,
) -> Dict[str, Any]:
    """Retrieve the student's progress across topics, optionally filtered by subject."""
    uid = _real_uid(user_id)
    with SessionLocal() as db:
        stmt = select(Progress).where(Progress.user_id == uid)
        if subject:
            stmt = stmt.where(Progress.subject == subject)
        rows = db.scalars(stmt).all()
        progress_list = [
            {"subject": r.subject, "topic": r.topic, "mastery_level": r.mastery_level}
            for r in rows
        ]
    return {"status": "ok", "progress": progress_list}


# ── Quiz / Assessment ───────────────────────────────────────────────────────


@_safe_tool
def save_quiz_result(
    user_id: str,
    session_id: str,
    subject: str,
    topic: str,
    score: int,
    total: int,
    questions_missed: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Save a quiz attempt result."""
    uid = _real_uid(user_id)
    sid = _real_session_id(session_id)
    pct = round(score / max(total, 1) * 100, 1)
    with SessionLocal() as db:
        db.add(
            Quiz(
                user_id=uid,
                session_id=sid,
                subject=subject,
                topic=topic,
                score=score,
                total=total,
                percentage=pct,
                questions_missed=questions_missed or [],
            )
        )
        db.commit()
    logger.info("Quiz saved: user=%s %s/%s score=%d/%d (%.1f%%)", uid, subject, topic, score, total, pct)
    return {"status": "ok", "message": f"Quiz result saved: {score}/{total} ({pct}%) on {topic}."}


# ── Study Plans ─────────────────────────────────────────────────────────────


@_safe_tool
def save_study_plan(
    user_id: str,
    plan_name: str,
    subjects: List[str],
    weekly_goals: List[str],
    target_date: Optional[str] = None,
) -> Dict[str, Any]:
    """Save or update a study plan (keyed by plan_name per user)."""
    uid = _real_uid(user_id)
    with SessionLocal() as db:
        row = db.scalar(
            select(StudyPlan).where(
                StudyPlan.user_id == uid, StudyPlan.plan_name == plan_name
            )
        )
        if row is None:
            row = StudyPlan(user_id=uid, plan_name=plan_name)
            db.add(row)
        row.subjects = subjects
        row.weekly_goals = weekly_goals
        row.target_date = target_date
        row.updated_at = datetime.now(timezone.utc)
        db.commit()
    logger.info("Study plan saved: user=%s plan=%s", uid, plan_name)
    return {"status": "ok", "message": f"Study plan '{plan_name}' saved."}


@_safe_tool
def get_study_plans(user_id: str) -> Dict[str, Any]:
    """Retrieve all study plans for a student."""
    uid = _real_uid(user_id)
    with SessionLocal() as db:
        rows = db.scalars(select(StudyPlan).where(StudyPlan.user_id == uid)).all()
        plans = [
            {
                "plan_name": r.plan_name,
                "subjects": r.subjects,
                "weekly_goals": r.weekly_goals,
                "target_date": r.target_date,
            }
            for r in rows
        ]
    return {"status": "ok", "plans": plans}
