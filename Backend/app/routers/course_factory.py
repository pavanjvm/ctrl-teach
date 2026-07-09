"""Authenticated course-factory endpoints for generation and publishing."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy import select

from app.auth.dependencies import get_current_user
from app.db import GeneratedCourse, SessionLocal
from app.services.course_factory import (
    extract_file_source,
    extract_url_source,
    generate_course,
)

router = APIRouter(prefix="/api/course-factory", tags=["course-factory"])


class CourseUpdate(BaseModel):
    course: Dict[str, Any]


def _response(row: GeneratedCourse) -> Dict[str, Any]:
    return {
        "id": row.id,
        "status": row.status,
        "sourceType": row.source_type,
        "sourceLabel": row.source_label,
        "sourceUrl": row.source_url,
        "course": row.payload,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
        "publishedAt": row.published_at.isoformat() if row.published_at else None,
    }


def _owned_row(course_id: str, user_id: int) -> GeneratedCourse:
    with SessionLocal() as db:
        row = db.scalar(
            select(GeneratedCourse).where(
                GeneratedCourse.id == course_id,
                GeneratedCourse.owner_user_id == user_id,
            )
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Course draft not found")
        db.expunge(row)
        return row


@router.post("/generate")
async def create_draft(
    source_url: str = Form(default=""),
    syllabus: Optional[UploadFile] = File(default=None),
    user: dict = Depends(get_current_user),
):
    """Extract one source and generate an editable course draft."""

    source_url = source_url.strip()
    if not source_url and syllabus is None:
        raise HTTPException(status_code=400, detail="Paste a course URL or upload a syllabus.")
    if source_url and syllabus is not None:
        raise HTTPException(status_code=400, detail="Use one source at a time.")

    if syllabus is not None:
        contents = await syllabus.read()
        if len(contents) > 20 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Syllabus files must be 20 MB or smaller.")
        try:
            source = await run_in_threadpool(
                extract_file_source,
                syllabus.filename or "syllabus",
                contents,
                syllabus.content_type or "",
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        source_type = "syllabus"
        stored_url = ""
    else:
        try:
            source = await run_in_threadpool(extract_url_source, source_url)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        source_type = "url"
        stored_url = source_url

    course_id = f"factory-{uuid.uuid4().hex[:12]}"
    course = await run_in_threadpool(
        generate_course,
        course_id=course_id,
        source_text=source["text"],
        source_title=source["title"],
        source_type=source_type,
        source_label=source["label"],
        source_url=stored_url,
    )

    now = datetime.now(timezone.utc)
    row = GeneratedCourse(
        id=course_id,
        owner_user_id=int(user["uid"]),
        status="draft",
        source_type=source_type,
        source_label=source["label"],
        source_url=stored_url or None,
        extraction_mode=source["mode"],
        payload=course,
        created_at=now,
        updated_at=now,
    )
    with SessionLocal() as db:
        db.add(row)
        db.commit()
        db.refresh(row)
        response = _response(row)
    return {"draft": response, "extractionMode": source["mode"]}


@router.get("/drafts")
async def list_drafts(user: dict = Depends(get_current_user)):
    with SessionLocal() as db:
        rows = list(
            db.scalars(
                select(GeneratedCourse)
                .where(GeneratedCourse.owner_user_id == int(user["uid"]))
                .order_by(GeneratedCourse.updated_at.desc())
            )
        )
        return {"drafts": [_response(row) for row in rows]}


@router.get("/published")
async def list_published(user: dict = Depends(get_current_user)):
    del user
    with SessionLocal() as db:
        rows = list(
            db.scalars(
                select(GeneratedCourse)
                .where(GeneratedCourse.status == "published")
                .order_by(GeneratedCourse.published_at.desc())
            )
        )
        return {"courses": [row.payload for row in rows]}


@router.put("/{course_id}")
async def save_draft(
    course_id: str,
    update: CourseUpdate,
    user: dict = Depends(get_current_user),
):
    _owned_row(course_id, int(user["uid"]))
    if not update.course.get("modules"):
        raise HTTPException(status_code=422, detail="A course needs at least one module.")
    course = dict(update.course)
    course["id"] = course_id
    course["status"] = "draft"
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        row = db.get(GeneratedCourse, course_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Course draft not found")
        row.payload = course
        row.status = "draft"
        row.updated_at = now
        db.commit()
        db.refresh(row)
        return {"draft": _response(row)}


@router.post("/{course_id}/publish")
async def publish_course(
    course_id: str,
    update: CourseUpdate,
    user: dict = Depends(get_current_user),
):
    _owned_row(course_id, int(user["uid"]))
    modules = update.course.get("modules")
    if not isinstance(modules, list) or not modules:
        raise HTTPException(status_code=422, detail="A course needs at least one module.")

    course = dict(update.course)
    course["id"] = course_id
    course["status"] = "published"
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        row = db.get(GeneratedCourse, course_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Course draft not found")
        row.payload = course
        row.status = "published"
        row.updated_at = now
        row.published_at = now
        db.commit()
        db.refresh(row)
        return {"published": _response(row)}

