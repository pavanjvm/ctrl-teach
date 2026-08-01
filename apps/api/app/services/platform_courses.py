"""Cleanup and serialization helpers for admin-managed platform courses."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict

from sqlalchemy import delete

from app.db import PlatformCourse, SessionLocal


RETIRED_DEFAULT_PLATFORM_COURSE_IDS: tuple[str, ...] = (
    "platform-product-discovery",
    "platform-practical-system-design",
    "platform-reliable-ai-agents",
)


def platform_course_response(row: PlatformCourse) -> Dict[str, Any]:
    """Return one row using the frontend Course contract plus admin metadata."""

    course = deepcopy(row.course or {})
    course["id"] = row.id
    course["status"] = row.status
    return {
        "id": row.id,
        "status": row.status,
        "course": course,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
        "publishedAt": row.published_at.isoformat() if row.published_at else None,
    }


def remove_retired_default_platform_courses() -> None:
    """Remove the former demo catalog while preserving admin-created courses."""

    with SessionLocal() as db:
        db.execute(
            delete(PlatformCourse).where(
                PlatformCourse.id.in_(RETIRED_DEFAULT_PLATFORM_COURSE_IDS)
            )
        )
        db.commit()
