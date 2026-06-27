"""Users router — local SQLite (replaces Firestore).

Endpoints (all Basic-auth protected):
  GET  /api/users/me
  GET  /api/users/me/full
  PUT  /api/users/me
  POST /api/users/sync   (creates/updates profile; ignores google_access_token)
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.auth.dependencies import get_current_user
from app.db import Profile, Progress, Quiz, SessionLocal, SessionRow, StudyPlan, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/users", tags=["users"])


# ── Pydantic ────────────────────────────────────────────────────────────────


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    grade: Optional[str] = None
    school: Optional[str] = None
    languages: Optional[List[str]] = None
    preferences: Optional[Dict[str, Any]] = None


class SyncBody(BaseModel):
    google_access_token: Optional[str] = None  # ignored (kept for frontend compat)
    timezone: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────────────────────


def _uid(user: dict) -> int:
    try:
        return int(user["uid"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Bad user id")


def _serialize_ts(val) -> str:
    if val is None:
        return ""
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _compute_streak(session_dates: set) -> tuple[int, int]:
    if not session_dates:
        return 0, 0
    sorted_dates = sorted(session_dates, reverse=True)
    today = datetime.now(timezone.utc).date()
    current_streak = 0
    check_date = today
    if sorted_dates[0] < today - timedelta(days=1):
        current_streak = 0
    else:
        if sorted_dates[0] == today - timedelta(days=1):
            check_date = today - timedelta(days=1)
        for d in sorted_dates:
            if d == check_date:
                current_streak += 1
                check_date -= timedelta(days=1)
            elif d < check_date:
                break
    longest_streak = 1
    run = 1
    for i in range(1, len(sorted_dates)):
        if sorted_dates[i] == sorted_dates[i - 1] - timedelta(days=1):
            run += 1
            longest_streak = max(longest_streak, run)
        else:
            run = 1
    return current_streak, longest_streak


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/me", response_model=Dict[str, Any])
async def get_current_user_profile(user: dict = Depends(get_current_user)):
    uid = _uid(user)
    with SessionLocal() as db:
        u = db.get(User, uid)
        p = db.get(Profile, uid)
    return {
        "uid": str(uid),
        "metadata": {
            "name": (u.name if u else None) or user.get("name"),
            "email": (u.email if u else None) or user.get("email"),
            "bio": p.bio if p else "",
            "grade": p.grade if p else "",
            "school": p.school if p else "",
            "languages": p.languages if p else [],
            "preferences": p.preferences if p else {},
            "timezone": u.timezone if u else "",
            "created_at": _serialize_ts(u.created_at) if u else "",
        },
    }


@router.get("/me/full", response_model=Dict[str, Any])
async def get_full_profile(user: dict = Depends(get_current_user)):
    uid = _uid(user)
    with SessionLocal() as db:
        u = db.get(User, uid)
        p = db.get(Profile, uid)

        sessions = list(
            db.scalars(
                select(SessionRow)
                .where(SessionRow.user_id == uid)
                .order_by(SessionRow.created_at.desc())
            )
        )
        progress_rows = list(
            db.scalars(select(Progress).where(Progress.user_id == uid))
        )
        quiz_rows = list(db.scalars(select(Quiz).where(Quiz.user_id == uid)))
        plan_rows = list(db.scalars(select(StudyPlan).where(StudyPlan.user_id == uid)))

    total_duration = 0
    session_dates = set()
    recent_sessions = []
    for i, s in enumerate(sessions):
        total_duration += s.duration_minutes or 0
        if s.created_at:
            session_dates.add(s.created_at.date())
        if i < 5:
            recent_sessions.append({
                "id": str(s.session_id),
                "topic": s.topic or "General Tutoring",
                "subject": s.subject or "",
                "duration_minutes": s.duration_minutes or 0,
                "created_at": _serialize_ts(s.created_at),
                "status": s.status or "completed",
            })

    current_streak, longest_streak = _compute_streak(session_dates)

    subjects_map: Dict[str, Dict[str, Any]] = {}
    for r in progress_rows:
        subj = r.subject or "Other"
        bucket = subjects_map.setdefault(subj, {"total_mastery": 0, "count": 0, "topics": []})
        bucket["total_mastery"] += r.mastery_level or 0
        bucket["count"] += 1
        bucket["topics"].append({"topic": r.topic, "mastery_level": r.mastery_level})

    subjects = [
        {
            "name": name,
            "progress": round((info["total_mastery"] / max(info["count"], 1)) / 5 * 100),
            "topic_count": info["count"],
            "topics": info["topics"],
        }
        for name, info in subjects_map.items()
    ]

    quiz_scores = [r.percentage for r in quiz_rows if r.percentage is not None]
    avg_score = round(sum(quiz_scores) / len(quiz_scores), 1) if quiz_scores else 0

    goals = [
        {
            "id": str(plan.id),
            "plan_name": plan.plan_name,
            "subjects": plan.subjects,
            "weekly_goals": plan.weekly_goals,
            "target_date": plan.target_date,
        }
        for plan in plan_rows
    ]

    profile = {
        "name": (u.name if u else None) or user.get("name", ""),
        "email": (u.email if u else None) or user.get("email", ""),
        "picture": (u.picture if u else None) or user.get("picture", ""),
        "bio": p.bio if p else "",
        "grade": p.grade if p else "",
        "school": p.school if p else "",
        "languages": p.languages if p else [],
        "created_at": _serialize_ts(u.created_at) if u else "",
        "preferences": p.preferences if p else {},
        "timezone": u.timezone if u else "",
    }

    return {
        "profile": profile,
        "stats": {
            "total_sessions": len(sessions),
            "total_hours": round(total_duration / 60, 1),
            "current_streak": current_streak,
            "longest_streak": longest_streak,
            "avg_score": avg_score,
            "subjects_covered": len(subjects_map),
        },
        "subjects": subjects,
        "recent_sessions": recent_sessions,
        "goals": goals,
    }


@router.put("/me", response_model=Dict[str, Any])
async def update_user_profile(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    uid = _uid(user)
    with SessionLocal() as db:
        u = db.get(User, uid)
        p = db.get(Profile, uid)
        if p is None:
            p = Profile(user_id=uid)
            db.add(p)
        updated_fields = []
        if body.name is not None and u is not None:
            u.name = body.name
            updated_fields.append("name")
        if body.bio is not None:
            p.bio = body.bio
            updated_fields.append("bio")
        if body.grade is not None:
            p.grade = body.grade
            updated_fields.append("grade")
        if body.school is not None:
            p.school = body.school
            updated_fields.append("school")
        if body.languages is not None:
            p.languages = body.languages
            updated_fields.append("languages")
        if body.preferences is not None:
            p.preferences = body.preferences
            updated_fields.append("preferences")
        p.updated_at = datetime.now(timezone.utc)
        db.commit()
    logger.info("Profile updated for user %s: %s", uid, updated_fields)
    return {"status": "ok", "updated_fields": updated_fields}


@router.post("/sync", response_model=Dict[str, Any])
async def sync_user(body: SyncBody = SyncBody(), user: dict = Depends(get_current_user)):
    """Ensure profile exists; optionally store timezone. google_access_token ignored."""
    uid = _uid(user)
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        u = db.get(User, uid)
        if u is None:
            raise HTTPException(status_code=404, detail="User not found")
        u.last_login = now
        if body.timezone:
            u.timezone = body.timezone
        db.commit()
    return {"status": "updated", "data": {"timezone": body.timezone or ""}}