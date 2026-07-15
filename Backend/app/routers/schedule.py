"""Schedule router — local SQLite CRUD for per-user scheduled sessions.

Google Calendar dual-write has been removed.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select

from app.auth.dependencies import get_current_user
from app.db import ScheduledSession, SessionLocal

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


def _validate_iso_datetime(value: str) -> str:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("start_time must be an ISO 8601 datetime") from exc
    if parsed.tzinfo is None:
        raise ValueError("start_time must include a timezone")
    return value


class ScheduleSessionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    subject: str = Field(default="", max_length=100)
    tutor: str = Field(default="", max_length=200)
    avatar: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=2000)
    start_time: str = Field(min_length=10, max_length=64)
    duration_hours: float = Field(default=1.0, gt=0, le=12)
    session_type: Literal["manual", "ai-suggested"] = "manual"
    subject_class: Literal["math", "science", "history", "languages"] = "math"

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("title must not be blank")
        return clean

    @field_validator("start_time")
    @classmethod
    def validate_start_time(cls, value: str) -> str:
        return _validate_iso_datetime(value)


class ScheduleSessionUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    subject: Optional[str] = Field(default=None, max_length=100)
    tutor: Optional[str] = Field(default=None, max_length=200)
    avatar: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = Field(default=None, max_length=2000)
    start_time: Optional[str] = Field(default=None, min_length=10, max_length=64)
    duration_hours: Optional[float] = Field(default=None, gt=0, le=12)
    session_type: Optional[Literal["manual", "ai-suggested"]] = None
    subject_class: Optional[Literal["math", "science", "history", "languages"]] = None

    @field_validator("title")
    @classmethod
    def validate_optional_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        clean = value.strip()
        if not clean:
            raise ValueError("title must not be blank")
        return clean

    @field_validator("start_time")
    @classmethod
    def validate_optional_start_time(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return _validate_iso_datetime(value)


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
