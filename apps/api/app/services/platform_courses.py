"""Seed data and serialization helpers for admin-managed platform courses."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict

from app.db import PlatformCourse, SessionLocal


DEFAULT_PLATFORM_COURSES: tuple[Dict[str, Any], ...] = (
    {
        "id": "platform-product-discovery",
        "title": "Product Discovery Fundamentals",
        "description": (
            "Turn uncertain product ideas into evidence-backed opportunities through "
            "interviews, assumptions, and lightweight experiments."
        ),
        "thumbnail": "linear-gradient(135deg,#d8f3b0 0%,#84b547 52%,#263d1f 100%)",
        "instructor": "Ctrl+Teach Faculty",
        "platform": "Ctrl+Teach",
        "difficulty": "Beginner",
        "duration": "3h 20m",
        "skills": ["Customer Interviews", "Assumption Mapping", "Experiment Design"],
        "rating": 4.8,
        "ratingCount": 184,
        "modules": [
            {
                "id": "discovery-foundations",
                "title": "Find the real problem",
                "lessons": [
                    {
                        "id": "problem-space",
                        "title": "Separate problems from solutions",
                        "type": "study",
                        "duration": "18m",
                        "summary": "Frame a customer problem without smuggling in your preferred solution.",
                    },
                    {
                        "id": "interview-practice",
                        "title": "Run a discovery interview",
                        "type": "roleplay",
                        "duration": "22m",
                        "summary": "Practice neutral questions with a skeptical customer.",
                    },
                ],
            },
            {
                "id": "discovery-evidence",
                "title": "Build evidence",
                "lessons": [
                    {
                        "id": "assumption-map",
                        "title": "Map the riskiest assumptions",
                        "type": "lab",
                        "duration": "25m",
                        "summary": "Prioritize desirability, viability, feasibility, and usability risks.",
                    },
                    {
                        "id": "evidence-check",
                        "title": "Evidence quality checkpoint",
                        "type": "assessment",
                        "duration": "12m",
                        "summary": "Distinguish strong behavioral evidence from opinions and anecdotes.",
                    },
                ],
            },
        ],
    },
    {
        "id": "platform-practical-system-design",
        "title": "Practical System Design",
        "description": (
            "Learn a repeatable way to clarify requirements, estimate scale, choose "
            "components, and defend architectural trade-offs."
        ),
        "thumbnail": "linear-gradient(135deg,#dcecff 0%,#5f8fd8 52%,#202c4f 100%)",
        "instructor": "Ctrl+Teach Faculty",
        "platform": "Ctrl+Teach",
        "difficulty": "Intermediate",
        "duration": "5h 10m",
        "skills": ["Requirements", "Capacity Planning", "Data Modeling", "Trade-offs"],
        "rating": 4.9,
        "ratingCount": 231,
        "modules": [
            {
                "id": "design-frame",
                "title": "Frame the system",
                "lessons": [
                    {
                        "id": "requirements-first",
                        "title": "Ask the questions that shape the design",
                        "type": "study",
                        "duration": "20m",
                        "summary": "Turn a broad prompt into functional and non-functional requirements.",
                    },
                    {
                        "id": "back-of-envelope",
                        "title": "Estimate traffic and storage",
                        "type": "lab",
                        "duration": "28m",
                        "summary": "Build a compact capacity model before choosing architecture.",
                    },
                ],
            },
            {
                "id": "design-defend",
                "title": "Defend the architecture",
                "lessons": [
                    {
                        "id": "data-and-caching",
                        "title": "Choose data and caching boundaries",
                        "type": "study",
                        "duration": "24m",
                        "summary": "Match storage and cache choices to access patterns and consistency needs.",
                    },
                    {
                        "id": "staff-review",
                        "title": "Staff engineer design review",
                        "type": "roleplay",
                        "duration": "20m",
                        "summary": "Explain decisions and respond to failure-mode questions.",
                    },
                ],
            },
        ],
    },
    {
        "id": "platform-reliable-ai-agents",
        "title": "Building Reliable AI Agents",
        "description": (
            "Design agent workflows that are observable, testable, and safe enough "
            "to move from a demo into a real product."
        ),
        "thumbnail": "linear-gradient(135deg,#efe4ff 0%,#9873ce 50%,#34254f 100%)",
        "instructor": "Ctrl+Teach Faculty",
        "platform": "Ctrl+Teach",
        "difficulty": "Advanced",
        "duration": "4h 45m",
        "skills": ["Tool Design", "Guardrails", "Evals", "Observability"],
        "rating": 4.9,
        "ratingCount": 146,
        "modules": [
            {
                "id": "agent-contracts",
                "title": "Make behavior explicit",
                "lessons": [
                    {
                        "id": "workflow-boundaries",
                        "title": "Agent or deterministic workflow?",
                        "type": "study",
                        "duration": "18m",
                        "summary": "Choose autonomy only where it creates meaningful value.",
                    },
                    {
                        "id": "tool-contract-lab",
                        "title": "Design robust tool contracts",
                        "type": "lab",
                        "duration": "26m",
                        "summary": "Define inputs, outputs, failures, and approval boundaries.",
                    },
                ],
            },
            {
                "id": "agent-quality",
                "title": "Measure and control quality",
                "lessons": [
                    {
                        "id": "eval-strategy",
                        "title": "Build an evaluation strategy",
                        "type": "study",
                        "duration": "22m",
                        "summary": "Combine offline cases, production traces, and human review.",
                    },
                    {
                        "id": "incident-review",
                        "title": "Agent incident review",
                        "type": "assessment",
                        "duration": "15m",
                        "summary": "Diagnose a failure and choose the smallest reliable control.",
                    },
                ],
            },
        ],
    },
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


def seed_platform_courses() -> None:
    """Create the editable starter catalog once without overwriting admin edits."""

    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        existing_ids = {
            row_id for (row_id,) in db.query(PlatformCourse.id).all()
        }
        for course in DEFAULT_PLATFORM_COURSES:
            course_id = str(course["id"])
            if course_id in existing_ids:
                continue
            payload = deepcopy(course)
            payload.pop("id", None)
            db.add(
                PlatformCourse(
                    id=course_id,
                    status="published",
                    course=payload,
                    created_at=now,
                    updated_at=now,
                    published_at=now,
                )
            )
        db.commit()
