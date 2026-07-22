"""Tutors router — local SQLite CRUD for per-user custom AI tutors."""

from __future__ import annotations

import logging
import uuid as _uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.auth.dependencies import get_current_user
from app.db import SessionLocal, Tutor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tutors", tags=["tutors"])


class TeachingStyleIn(BaseModel):
    icon: str = ""
    name: str = ""
    desc: str = ""


class TagIn(BaseModel):
    label: str
    color: str = "gray"


class TutorCreate(BaseModel):
    name: str
    title: str = ""
    desc: str = ""
    avatar: str = ""
    placeholder: str = ""
    subjects: List[str] = []
    personality: str = ""
    level: str = "Intermediate"
    voice: str = "ash"
    tags: List[TagIn] = []
    styles: List[TeachingStyleIn] = []


class TutorUpdate(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    desc: Optional[str] = None
    avatar: Optional[str] = None
    placeholder: Optional[str] = None
    subjects: Optional[List[str]] = None
    personality: Optional[str] = None
    level: Optional[str] = None
    voice: Optional[str] = None
    tags: Optional[List[TagIn]] = None
    styles: Optional[List[TeachingStyleIn]] = None


def _uid(user: dict) -> int:
    try:
        return int(user["uid"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Bad user id")


def _to_dict(row: Tutor) -> Dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "title": row.title,
        "desc": row.desc,
        "avatar": row.avatar,
        "placeholder": row.placeholder,
        "subjects": row.subjects or [],
        "personality": row.personality,
        "level": row.level,
        "voice": row.voice,
        "tags": row.tags or [],
        "styles": row.styles or [],
        "status": row.status,
        "stats": row.stats or {"sessions": "0", "rating": "N/A"},
        "created_at": row.created_at.isoformat() if row.created_at else "",
        "updated_at": row.updated_at.isoformat() if row.updated_at else "",
    }


@router.get("", response_model=List[Dict[str, Any]])
async def list_tutors(user: dict = Depends(get_current_user)):
    uid = _uid(user)
    with SessionLocal() as db:
        rows = db.scalars(
            select(Tutor).where(Tutor.user_id == uid).order_by(Tutor.created_at)
        )
        return [_to_dict(r) for r in rows]


@router.get("/{tutor_id}", response_model=Dict[str, Any])
async def get_tutor(tutor_id: str, user: dict = Depends(get_current_user)):
    uid = _uid(user)
    with SessionLocal() as db:
        row = db.get(Tutor, tutor_id)
        if row is None or row.user_id != uid:
            raise HTTPException(status_code=404, detail="Tutor not found")
        return _to_dict(row)


@router.post("", response_model=Dict[str, Any])
async def create_tutor(body: TutorCreate, user: dict = Depends(get_current_user)):
    uid = _uid(user)
    now = datetime.now(timezone.utc)
    tid = _uuid.uuid4().hex[:12]
    row = Tutor(
        id=tid,
        user_id=uid,
        name=body.name,
        title=body.title,
        desc=body.desc,
        avatar=body.avatar,
        placeholder=body.placeholder,
        subjects=body.subjects,
        personality=body.personality,
        level=body.level,
        voice=body.voice,
        tags=[t.model_dump() for t in body.tags],
        styles=[s.model_dump() for s in body.styles],
        status="New",
        stats={"sessions": "0", "rating": "N/A"},
        created_at=now,
        updated_at=now,
    )
    with SessionLocal() as db:
        db.add(row)
        db.commit()
    logger.info("Tutor created: %s for user %s", tid, uid)
    return _to_dict(row)


@router.put("/{tutor_id}", response_model=Dict[str, Any])
async def update_tutor(tutor_id: str, body: TutorUpdate, user: dict = Depends(get_current_user)):
    uid = _uid(user)
    with SessionLocal() as db:
        row = db.get(Tutor, tutor_id)
        if row is None or row.user_id != uid:
            raise HTTPException(status_code=404, detail="Tutor not found")
        for field in ("name", "title", "desc", "avatar", "placeholder", "subjects", "personality", "level", "voice"):
            val = getattr(body, field, None)
            if val is not None:
                setattr(row, field, val)
        if body.tags is not None:
            row.tags = [t.model_dump() for t in body.tags]
        if body.styles is not None:
            row.styles = [s.model_dump() for s in body.styles]
        row.updated_at = datetime.now(timezone.utc)
        db.commit()
        return _to_dict(row)


@router.delete("/{tutor_id}", response_model=Dict[str, Any])
async def delete_tutor(tutor_id: str, user: dict = Depends(get_current_user)):
    uid = _uid(user)
    with SessionLocal() as db:
        row = db.get(Tutor, tutor_id)
        if row is None or row.user_id != uid:
            raise HTTPException(status_code=404, detail="Tutor not found")
        db.delete(row)
        db.commit()
    logger.info("Tutor deleted: %s for user %s", tutor_id, uid)
    return {"status": "ok", "deleted_id": tutor_id}