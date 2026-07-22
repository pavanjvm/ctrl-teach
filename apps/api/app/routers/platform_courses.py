"""Public catalog and role-gated admin course management endpoints."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.auth.dependencies import get_current_admin
from app.db import GeneratedCourse, PlatformCourse, SessionLocal
from app.services.platform_courses import platform_course_response


public_router = APIRouter(prefix="/api/platform-courses", tags=["platform-courses"])
admin_router = APIRouter(prefix="/api/admin/courses", tags=["admin-courses"])

LessonType = Literal["study", "lab", "assessment", "roleplay"]
Difficulty = Literal["Beginner", "Intermediate", "Advanced"]


class PlatformLessonInput(BaseModel):
    # Rich generated lessons carry content blocks, labs, quizzes, and teaching
    # plans. Preserve those fields when an admin edits the basic lesson details.
    model_config = ConfigDict(extra="allow")

    id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=255)
    type: LessonType = "study"
    duration: str = Field(default="15m", max_length=64)
    summary: str = Field(default="", max_length=2048)


class PlatformModuleInput(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=255)
    lessons: List[PlatformLessonInput] = Field(default_factory=list, max_length=100)


class PlatformCourseInput(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[str] = Field(default=None, max_length=128)
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=4096)
    thumbnail: str = Field(default="", max_length=2048)
    instructor: str = Field(default="Ctrl+Teach Faculty", max_length=255)
    platform: str = Field(default="Ctrl+Teach", max_length=64)
    difficulty: Difficulty = "Beginner"
    duration: str = Field(default="1h", max_length=64)
    skills: List[str] = Field(default_factory=list, max_length=30)
    rating: float = Field(default=0, ge=0, le=5)
    ratingCount: int = Field(default=0, ge=0)
    modules: List[PlatformModuleInput] = Field(default_factory=list, max_length=50)


def _clean_payload(body: PlatformCourseInput) -> Dict[str, Any]:
    payload = body.model_dump(exclude={"id"})
    payload["title"] = payload["title"].strip()
    payload["description"] = payload["description"].strip()
    payload["instructor"] = payload["instructor"].strip() or "Ctrl+Teach Faculty"
    payload["platform"] = "Ctrl+Teach"
    payload["skills"] = list(dict.fromkeys(skill.strip() for skill in payload["skills"] if skill.strip()))
    return payload


def _new_course_id(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.casefold()).strip("-")[:72] or "course"
    return f"platform-{slug}-{uuid.uuid4().hex[:6]}"


def _row_or_404(course_id: str) -> PlatformCourse:
    with SessionLocal() as db:
        row = db.get(PlatformCourse, course_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Platform course not found")
        db.expunge(row)
        return row


def _validate_publishable(course: Dict[str, Any]) -> None:
    modules = list(course.get("modules") or [])
    if not course.get("description"):
        raise HTTPException(status_code=422, detail="Add a course description before publishing.")
    if not modules:
        raise HTTPException(status_code=422, detail="Add at least one module before publishing.")
    if not any(module.get("lessons") for module in modules):
        raise HTTPException(status_code=422, detail="Add at least one lesson before publishing.")


@public_router.get("")
async def list_published_courses():
    with SessionLocal() as db:
        rows = list(
            db.scalars(
                select(PlatformCourse)
                .where(PlatformCourse.status == "published")
                .order_by(PlatformCourse.published_at.desc(), PlatformCourse.created_at.desc())
            )
        )
        return {"courses": [platform_course_response(row)["course"] for row in rows]}


@public_router.get("/{course_id}")
async def get_published_course(course_id: str):
    with SessionLocal() as db:
        row = db.scalar(
            select(PlatformCourse).where(
                PlatformCourse.id == course_id,
                PlatformCourse.status == "published",
            )
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Published course not found")
        return {"course": platform_course_response(row)["course"]}


@admin_router.get("")
async def list_admin_courses(_admin: dict = Depends(get_current_admin)):
    with SessionLocal() as db:
        rows = list(
            db.scalars(select(PlatformCourse).order_by(PlatformCourse.updated_at.desc()))
        )
        return {"courses": [platform_course_response(row) for row in rows]}


@admin_router.post("", status_code=status.HTTP_201_CREATED)
async def create_admin_course(
    body: PlatformCourseInput,
    admin: dict = Depends(get_current_admin),
):
    now = datetime.now(timezone.utc)
    payload = _clean_payload(body)
    row = PlatformCourse(
        id=_new_course_id(payload["title"]),
        status="draft",
        course=payload,
        created_by_user_id=int(admin["uid"]),
        created_at=now,
        updated_at=now,
    )
    with SessionLocal() as db:
        db.add(row)
        db.commit()
        db.refresh(row)
        return platform_course_response(row)


@admin_router.post("/import-generated/{generated_course_id}", status_code=status.HTTP_201_CREATED)
async def import_generated_admin_course(
    generated_course_id: str,
    admin: dict = Depends(get_current_admin),
):
    """Copy one completed admin-owned AI course into the editable catalog."""

    admin_id = int(admin["uid"])
    with SessionLocal() as db:
        generated = db.scalar(
            select(GeneratedCourse).where(
                GeneratedCourse.id == generated_course_id,
                GeneratedCourse.owner_user_id == admin_id,
            )
        )
        course = dict((generated.payload or {}).get("course") or {}) if generated else {}
        if generated is None:
            raise HTTPException(status_code=404, detail="Generated course not found")
        if generated.status != "ready" or not course:
            raise HTTPException(status_code=409, detail="Course generation is not complete yet")

        title = str(course.get("title") or "Generated course")
        course_id = _new_course_id(title)
        course.pop("id", None)
        course["platform"] = "Ctrl+Teach"
        course["status"] = "draft"
        course["sourceGeneratedCourseId"] = generated_course_id
        now = datetime.now(timezone.utc)
        row = PlatformCourse(
            id=course_id,
            status="draft",
            course=course,
            created_by_user_id=admin_id,
            created_at=now,
            updated_at=now,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return platform_course_response(row)


@admin_router.put("/{course_id}")
async def update_admin_course(
    course_id: str,
    body: PlatformCourseInput,
    _admin: dict = Depends(get_current_admin),
):
    payload = _clean_payload(body)
    with SessionLocal() as db:
        row = db.get(PlatformCourse, course_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Platform course not found")
        row.course = payload
        row.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(row)
        return platform_course_response(row)


@admin_router.post("/{course_id}/publish")
async def publish_admin_course(
    course_id: str,
    _admin: dict = Depends(get_current_admin),
):
    with SessionLocal() as db:
        row = db.get(PlatformCourse, course_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Platform course not found")
        _validate_publishable(row.course or {})
        now = datetime.now(timezone.utc)
        row.status = "published"
        row.updated_at = now
        row.published_at = now
        db.commit()
        db.refresh(row)
        return platform_course_response(row)


@admin_router.post("/{course_id}/unpublish")
async def unpublish_admin_course(
    course_id: str,
    _admin: dict = Depends(get_current_admin),
):
    with SessionLocal() as db:
        row = db.get(PlatformCourse, course_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Platform course not found")
        row.status = "draft"
        row.updated_at = datetime.now(timezone.utc)
        row.published_at = None
        db.commit()
        db.refresh(row)
        return platform_course_response(row)
