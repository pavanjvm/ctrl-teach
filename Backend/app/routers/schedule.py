"""Schedule router — local SQLite CRUD for per-user scheduled sessions.

Google Calendar dual-write has been removed.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.auth.dependencies import get_current_user
from app.db import ScheduledSession, SessionLocal

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


class ScheduleSessionCreate(BaseModel):
    title: str
    subject: str = ""
    tutor: str = ""
    avatar: str = ""
    description: str = ""
    start_time: str  # ISO 8601 datetime string
    duration_hours: float = 1.0
    session_type: str = "manual"
    subject_class: str = ""


class ScheduleSessionUpdate(BaseModel):
    title: Optional[str] = None
    subject: Optional[str] = None
    tutor: Optional[str] = None
    avatar: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[str] = None
    duration_hours: Optional[float] = None
    session_type: Optional[str] = None
    subject_class: Optional[str] = None


def _uid(user: dict) -> int:
    try:
        return int(user["uid"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Bad user id")


def _to_dict(row: ScheduledSession) -> Dict[str, Any]:
    return {
        "id": row.id,
        "title": row.title,
        "subject": row.subject,
        "tutor": row.tutor,
        "avatar": row.avatar,
        "description": row.description,
        "start_time": row.start_time,
        "duration_hours": row.duration_hours,
        "session_type": row.session_type,
        "subject_class": row.subject_class,
        "created_at": row.created_at.isoformat() if row.created_at else "",
        "updated_at": row.updated_at.isoformat() if row.updated_at else "",
    }


@router.get("", response_model=List[Dict[str, Any]])
async def list_schedule(user: dict = Depends(get_current_user)):
    uid = _uid(user)
    with SessionLocal() as db:
        rows = db.scalars(
            select(ScheduledSession)
            .where(ScheduledSession.user_id == uid)
            .order_by(ScheduledSession.start_time)
        )
        return [_to_dict(r) for r in rows]


@router.post("", response_model=Dict[str, Any])
async def create_scheduled_session(body: ScheduleSessionCreate, user: dict = Depends(get_current_user)):
    uid = _uid(user)
    now = datetime.now(timezone.utc)
    import uuid as _u
    sid = _u.uuid4().hex
    row = ScheduledSession(
        id=sid,
        user_id=uid,
        title=body.title,
        subject=body.subject,
        tutor=body.tutor,
        avatar=body.avatar,
        description=body.description,
        start_time=body.start_time,
        duration_hours=body.duration_hours,
        session_type=body.session_type,
        subject_class=body.subject_class,
        created_at=now,
        updated_at=now,
    )
    with SessionLocal() as db:
        db.add(row)
        db.commit()
    logger.info("Schedule session created: %s for user %s", sid, uid)
    return _to_dict(row)


@router.put("/{session_id}", response_model=Dict[str, Any])
async def update_scheduled_session(session_id: str, body: ScheduleSessionUpdate, user: dict = Depends(get_current_user)):
    uid = _uid(user)
    with SessionLocal() as db:
        row = db.get(ScheduledSession, session_id)
        if row is None or row.user_id != uid:
            raise HTTPException(status_code=404, detail="Session not found")
        for field in ("title", "subject", "tutor", "avatar", "description", "start_time", "duration_hours", "session_type", "subject_class"):
            val = getattr(body, field, None)
            if val is not None:
                setattr(row, field, val)
        row.updated_at = datetime.now(timezone.utc)
        db.commit()
        return _to_dict(row)


@router.delete("/{session_id}", response_model=Dict[str, Any])
async def delete_scheduled_session(session_id: str, user: dict = Depends(get_current_user)):
    uid = _uid(user)
    with SessionLocal() as db:
        row = db.get(ScheduledSession, session_id)
        if row is None or row.user_id != uid:
            raise HTTPException(status_code=404, detail="Session not found")
        db.delete(row)
        db.commit()
    return {"status": "ok", "deleted_id": session_id}


@router.get("/all", response_model=Dict[str, Any])
async def get_schedule_all(user: dict = Depends(get_current_user)):
    uid = _uid(user)
    with SessionLocal() as db:
        sessions = [
            _to_dict(r)
            for r in db.scalars(
                select(ScheduledSession)
                .where(ScheduledSession.user_id == uid)
                .order_by(ScheduledSession.start_time)
            )
        ]
        from app.db import StudyPlan
        plans = [
            {
                "id": str(r.id),
                "plan_name": r.plan_name,
                "subjects": r.subjects,
                "weekly_goals": r.weekly_goals,
                "target_date": r.target_date,
            }
            for r in db.scalars(select(StudyPlan).where(StudyPlan.user_id == uid))
        ]
    return {
        "sessions": sessions,
        "study_plans": plans,
        "calendar_connected": False,
        "calendar_events": [],
    }