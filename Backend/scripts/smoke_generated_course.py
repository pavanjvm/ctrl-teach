"""Opt-in live smoke test for course, research, and image generation.

Run from Backend/ with:
    RUN_OPENAI_LIVE_TESTS=1 .venv/bin/python scripts/smoke_generated_course.py

The script uses an in-memory database and a temporary uploads directory. It
does not modify the application's real courses or media.
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.db import Base, GeneratedCourse
from app.services import generated_courses as service


def main() -> None:
    if os.getenv("RUN_OPENAI_LIVE_TESTS") != "1":
        print("SKIP: set RUN_OPENAI_LIVE_TESTS=1 to call OpenAI.")
        return
    if not settings.openai_api_key.strip():
        raise SystemExit("OPENAI_API_KEY is not configured.")

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    service.SessionLocal = sessions

    with tempfile.TemporaryDirectory(prefix="ctrlteach-live-course-") as uploads:
        settings.uploads_dir = uploads
        now = datetime.now(timezone.utc)
        course_id = "generated-live-smoke"
        with sessions() as db:
            db.add(
                GeneratedCourse(
                    id=course_id,
                    owner_user_id=999,
                    status="researching",
                    source_type="prompt",
                    source_label="Live smoke-test prompt",
                    extraction_mode="prompt",
                    payload={
                        "version": 2,
                        "source": {
                            "type": "prompt",
                            "title": "Event-driven architecture",
                            "label": "Live smoke-test prompt",
                            "mode": "prompt",
                            "text": (
                                "Create a visual, practical course on event-driven architecture "
                                "for a software engineer designing a reliable SaaS product. Cover "
                                "events, brokers, delivery semantics, idempotency, retries, and "
                                "observability. Use architecture visuals where they aid understanding."
                            ),
                        },
                        "intake": {
                            "topic": "Event-driven architecture for reliable SaaS products",
                            "summary": "A practical visual course for production system design.",
                            "questions": [],
                        },
                        "answers": {
                            "current_level": "Some experience",
                            "learning_goal": "Design a reliable event-driven SaaS architecture",
                            "time_budget": "Up to 1 hour",
                        },
                        "assets": {},
                        "progress": {"stage": "researching", "percent": 10, "message": "Starting"},
                    },
                    created_at=now,
                    updated_at=now,
                )
            )
            db.commit()

        asyncio.run(service.run_generation_job(course_id))

        with sessions() as db:
            row = db.get(GeneratedCourse, course_id)
            assert row is not None
            if row.status != "ready":
                raise AssertionError(f"Live generation failed: {(row.payload or {}).get('error')}")
            course = row.payload["course"]

        lessons = [lesson for module in course["modules"] for lesson in module["lessons"]]
        blocks = [block for lesson in lessons for block in lesson.get("contentBlocks", [])]
        image_blocks = [block for block in blocks if block["type"] == "image"]
        assert course["citations"], "Expected live URL citations"
        assert course["coverImage"]["sizeBytes"] > 0, "Expected a real generated cover"
        assert image_blocks, "Expected at least one generated lesson visual"
        assert all(block["asset"]["sizeBytes"] > 0 for block in image_blocks)
        files = list(Path(uploads).rglob("*.webp"))
        assert len(files) >= 2, "Expected cover and lesson image files"
        assert all(path.stat().st_size > 0 for path in files)

        print(
            "LIVE PASS:",
            f"title={course['title']!r}",
            f"modules={len(course['modules'])}",
            f"lessons={len(lessons)}",
            f"blocks={len(blocks)}",
            f"citations={len(course['citations'])}",
            f"images={len(files)}",
        )


if __name__ == "__main__":
    main()
