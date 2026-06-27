"""Dashboard router — local SQLite (replaces Firestore)."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.auth.dependencies import get_current_user
from app.db import (
    Progress,
    Quiz,
    SessionLocal,
    SessionRow,
    StudyPlan,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _uid(user: dict) -> int:
    try:
        return int(user["uid"])
    except (KeyError, ValueError, TypeError):
        return 0


def _ser(dt) -> str:
    if dt is None:
        return ""
    return dt.isoformat() if hasattr(dt, "isoformat") else str(dt)


@router.get("/stats", response_model=Dict[str, Any])
async def get_dashboard_stats(user: dict = Depends(get_current_user)):
    uid = _uid(user)
    total_sessions = 0
    total_minutes = 0
    subjects = set()
    with SessionLocal() as db:
        for s in db.scalars(select(SessionRow).where(SessionRow.user_id == uid)):
            total_sessions += 1
            total_minutes += s.duration_minutes or 0
            if s.subject:
                subjects.add(s.subject)
        for p in db.scalars(select(Progress).where(Progress.user_id == uid)):
            if p.subject:
                subjects.add(p.subject)
        scores = [q.percentage for q in db.scalars(select(Quiz).where(Quiz.user_id == uid)) if q.percentage is not None]
    avg = round(sum(scores) / len(scores), 1) if scores else 0
    return {
        "total_sessions": total_sessions,
        "total_hours": round(total_minutes / 60, 1),
        "avg_score": avg,
        "subjects_covered": len(subjects),
    }


@router.get("/sessions", response_model=List[Dict[str, Any]])
async def get_user_sessions(limit: int = 10, user: dict = Depends(get_current_user)):
    uid = _uid(user)
    out = []
    with SessionLocal() as db:
        rows = db.scalars(
            select(SessionRow)
            .where(SessionRow.user_id == uid)
            .order_by(SessionRow.created_at.desc())
            .limit(limit)
        )
        for s in rows:
            out.append({
                "id": str(s.session_id),
                "status": s.status or "completed",
                "topic": s.topic,
                "subject": s.subject,
                "duration_minutes": s.duration_minutes or 0,
                "tutor_id": s.tutor_id,
                "created_at": _ser(s.created_at),
                "ended_at": _ser(s.ended_at),
                "notes": s.notes,
                "key_concepts": s.key_concepts,
            })
    return out


@router.get("/streak", response_model=Dict[str, Any])
async def get_learning_streak(user: dict = Depends(get_current_user)):
    uid = _uid(user)
    dates = set()
    with SessionLocal() as db:
        for s in db.scalars(
            select(SessionRow)
            .where(SessionRow.user_id == uid)
            .order_by(SessionRow.created_at.desc())
        ):
            if s.created_at:
                dates.add(s.created_at.date())
    if not dates:
        return {"current_streak": 0, "longest_streak": 0}
    sorted_d = sorted(dates, reverse=True)
    today = datetime.now(timezone.utc).date()
    cur = 0
    check = today
    if sorted_d[0] < today - timedelta(days=1):
        cur = 0
    else:
        if sorted_d[0] == today - timedelta(days=1):
            check = today - timedelta(days=1)
        for d in sorted_d:
            if d == check:
                cur += 1
                check -= timedelta(days=1)
            elif d < check:
                break
    longest = 1
    run = 1
    for i in range(1, len(sorted_d)):
        if sorted_d[i] == sorted_d[i - 1] - timedelta(days=1):
            run += 1
            longest = max(longest, run)
        else:
            run = 1
    return {"current_streak": cur, "longest_streak": longest}


@router.get("/progress", response_model=List[Dict[str, Any]])
async def get_learning_progress(user: dict = Depends(get_current_user)):
    uid = _uid(user)
    out = []
    with SessionLocal() as db:
        for r in db.scalars(select(Progress).where(Progress.user_id == uid)):
            out.append({
                "id": str(r.id),
                "subject": r.subject,
                "topic": r.topic,
                "mastery_level": r.mastery_level or 0,
            })
    return out


@router.get("/topics", response_model=Dict[str, Any])
async def get_suggested_topics(user: dict = Depends(get_current_user)):
    uid = _uid(user)
    suggested: List[str] = []
    with SessionLocal() as db:
        for r in db.scalars(select(Progress).where(Progress.user_id == uid)):
            if (r.mastery_level or 0) <= 2:
                label = r.topic or "Unknown Topic"
                if r.subject:
                    label = f"{r.subject}: {label}"
                suggested.append(label)
        recent = db.scalars(
            select(SessionRow)
            .where(SessionRow.user_id == uid)
            .order_by(SessionRow.created_at.desc())
            .limit(5)
        )
        for s in recent:
            t = s.topic
            if t and t not in suggested:
                suggested.append(t)
    return {"topics": suggested[:6]}


@router.get("/study-plans", response_model=List[Dict[str, Any]])
async def get_study_plans(user: dict = Depends(get_current_user)):
    uid = _uid(user)
    out = []
    with SessionLocal() as db:
        for r in db.scalars(select(StudyPlan).where(StudyPlan.user_id == uid)):
            out.append({
                "id": str(r.id),
                "plan_name": r.plan_name,
                "subjects": r.subjects,
                "weekly_goals": r.weekly_goals,
                "target_date": r.target_date,
            })
    return out


@router.get("/all", response_model=Dict[str, Any])
async def get_dashboard_all(user: dict = Depends(get_current_user)):
    uid = _uid(user)
    loop = asyncio.get_running_loop()

    def stats_sync(u: int):
        with SessionLocal() as db:
            s_rows = list(db.scalars(select(SessionRow).where(SessionRow.user_id == u)))
            p_rows = list(db.scalars(select(Progress).where(Progress.user_id == u)))
            q_rows = list(db.scalars(select(Quiz).where(Quiz.user_id == u)))
        total_minutes = sum((s.duration_minutes or 0) for s in s_rows)
        subjects = {s.subject for s in s_rows if s.subject} | {p.subject for p in p_rows if p.subject}
        scores = [q.percentage for q in q_rows if q.percentage is not None]
        return {
            "total_sessions": len(s_rows),
            "total_hours": round(total_minutes / 60, 1),
            "avg_score": round(sum(scores) / len(scores), 1) if scores else 0,
            "subjects_covered": len(subjects),
        }

    def sessions_sync(u: int):
        out = []
        with SessionLocal() as db:
            rows = db.scalars(
                select(SessionRow).where(SessionRow.user_id == u).order_by(SessionRow.created_at.desc()).limit(5)
            )
            for s in rows:
                out.append({
                    "id": str(s.session_id), "status": s.status or "completed",
                    "topic": s.topic, "subject": s.subject,
                    "duration_minutes": s.duration_minutes or 0,
                    "created_at": _ser(s.created_at), "notes": s.notes,
                })
        return out

    def streak_sync(u: int):
        dates = set()
        with SessionLocal() as db:
            for s in db.scalars(select(SessionRow).where(SessionRow.user_id == u).order_by(SessionRow.created_at.desc())):
                if s.created_at:
                    dates.add(s.created_at.date())
        if not dates:
            return {"current_streak": 0, "longest_streak": 0}
        sorted_d = sorted(dates, reverse=True)
        today = datetime.now(timezone.utc).date()
        cur, check = 0, today
        if sorted_d[0] < today - timedelta(days=1):
            cur = 0
        else:
            if sorted_d[0] == today - timedelta(days=1):
                check = today - timedelta(days=1)
            for d in sorted_d:
                if d == check:
                    cur += 1
                    check -= timedelta(days=1)
                elif d < check:
                    break
        longest, run = 1, 1
        for i in range(1, len(sorted_d)):
            if sorted_d[i] == sorted_d[i - 1] - timedelta(days=1):
                run += 1
                longest = max(longest, run)
            else:
                run = 1
        return {"current_streak": cur, "longest_streak": longest}

    def progress_topics_sync(u: int):
        progress, suggested = [], []
        with SessionLocal() as db:
            for r in db.scalars(select(Progress).where(Progress.user_id == u)):
                progress.append({"id": str(r.id), "subject": r.subject, "topic": r.topic, "mastery_level": r.mastery_level or 0})
                if (r.mastery_level or 0) <= 2:
                    label = r.topic or "Unknown"
                    if r.subject:
                        label = f"{r.subject}: {label}"
                    suggested.append(label)
            recent = db.scalars(select(SessionRow).where(SessionRow.user_id == u).order_by(SessionRow.created_at.desc()).limit(5))
            for s in recent:
                t = s.topic
                if t and t not in suggested:
                    suggested.append(t)
        return {"progress": progress, "topics": suggested[:6]}

    stats, sessions, streak, prog_topics = await asyncio.gather(
        loop.run_in_executor(None, stats_sync, uid),
        loop.run_in_executor(None, sessions_sync, uid),
        loop.run_in_executor(None, streak_sync, uid),
        loop.run_in_executor(None, progress_topics_sync, uid),
    )
    return {
        "stats": stats,
        "sessions": sessions,
        "streak": streak,
        "progress": prog_topics["progress"],
        "topics": prog_topics["topics"],
    }