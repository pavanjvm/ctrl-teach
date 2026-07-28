"""Authenticated learner-owned AI course generation endpoints."""

from __future__ import annotations

import asyncio
import logging
import re
import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from app.auth.dependencies import get_current_user
from app.config import settings
from app.db import BrowserLabRecovery, BrowserLabRun, GeneratedCourse, PlatformCourse, SessionLocal
from app.services.course_factory import extract_file_source
from app.services.generated_courses import (
    MAX_SOURCE_CHARS,
    CourseGenerationError,
    generate_intake,
    generate_next_intake_question,
    _partial_course,
    run_generation_job,
    sanitize_adaptive_recovery_summary,
    shutdown_course_generation_client,
)

router = APIRouter(prefix="/api/generated-courses", tags=["generated-courses"])
logger = logging.getLogger(__name__)

_tasks: Dict[str, asyncio.Task[None]] = {}


class GenerationAnswers(BaseModel):
    answers: Dict[str, Union[str, List[str]]] = Field(default_factory=dict)


class IntakeAnswer(BaseModel):
    questionId: str = Field(min_length=2, max_length=64)
    answer: Union[str, List[str]]


def _owned_row(course_id: str, owner_user_id: int) -> GeneratedCourse:
    with SessionLocal() as db:
        row = db.scalar(
            select(GeneratedCourse).where(
                GeneratedCourse.id == course_id,
                GeneratedCourse.owner_user_id == owner_user_id,
            )
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Generated course not found")
        db.expunge(row)
        return row


def _public_response(row: GeneratedCourse) -> Dict[str, Any]:
    payload = dict(row.payload or {})
    if payload.get("version") != 2:
        legacy_course = payload if payload.get("modules") else None
        return {
            "id": row.id,
            "status": "ready" if row.status == "published" and legacy_course else row.status,
            "topic": legacy_course.get("title") if legacy_course else row.source_label,
            "summary": legacy_course.get("description") if legacy_course else "",
            "progress": {"stage": row.status, "percent": 100 if legacy_course else 0, "message": ""},
            "course": legacy_course,
            "archivedAt": payload.get("archivedAt"),
            "error": None,
            "createdAt": row.created_at.isoformat() if row.created_at else None,
            "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
        }
    intake = payload.get("intake") or {}
    partial_course = payload.get("course")
    if not partial_course and row.status in {"researching", "generating", "generating_images"}:
        partial_course = _partial_course(row.id, payload)
    return {
        "id": row.id,
        "status": row.status,
        "topic": intake.get("topic") or row.source_label,
        "summary": intake.get("summary") or "",
        "questions": intake.get("questions") or [],
        "answers": payload.get("answers") or {},
        "interviewComplete": bool(intake.get("complete", False)),
        "progress": payload.get("progress") or {},
        "course": payload.get("course"),
        "partialCourse": partial_course,
        "error": payload.get("error"),
        "archivedAt": payload.get("archivedAt"),
        "sourceType": row.source_type,
        "sourceLabel": row.source_label,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
    }


def _schedule(course_id: str) -> None:
    current = _tasks.get(course_id)
    if current is not None and not current.done():
        return
    task = asyncio.create_task(run_generation_job(course_id), name=f"generated-course:{course_id}")
    _tasks[course_id] = task

    def finished(_task: asyncio.Task[None]) -> None:
        _tasks.pop(course_id, None)

    task.add_done_callback(finished)


def resume_generation_jobs() -> None:
    """Resume jobs left in an active stage after a process restart."""

    with SessionLocal() as db:
        rows = list(
            db.scalars(
                select(GeneratedCourse).where(
                    GeneratedCourse.status.in_(("researching", "generating", "generating_images"))
                )
            )
        )
        course_ids = [row.id for row in rows if (row.payload or {}).get("version") == 2]
    for course_id in course_ids:
        _schedule(course_id)


async def shutdown_generation_jobs() -> None:
    tasks = [task for task in _tasks.values() if not task.done()]
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
    _tasks.clear()
    await shutdown_course_generation_client()


async def _cancel_generation_job(course_id: str) -> None:
    task = _tasks.pop(course_id, None)
    if task is None or task.done():
        return
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)


def _remove_generated_assets(owner_user_id: int, course_id: str) -> None:
    safe_course_id = re.sub(r"[^a-zA-Z0-9_-]", "", course_id)
    owner_root = (Path(settings.uploads_dir) / "generated" / str(owner_user_id)).resolve()
    course_root = (owner_root / safe_course_id).resolve()
    if safe_course_id and owner_root in course_root.parents:
        shutil.rmtree(course_root, ignore_errors=True)


def _prompt_title(text: str) -> str:
    clean = re.sub(r"\s+", " ", text).strip()
    return clean[:120] or "New course"


def _load_adaptive_recovery_summary(db: Any, owner_user_id: int) -> Dict[str, Any]:
    """Load a bounded snapshot without making course generation depend on it."""

    try:
        # Import only after generated_courses has finished loading. The browser
        # lab service imports the platform catalog from that module.
        from app.services.browser_labs import adaptive_recovery_summary

        return sanitize_adaptive_recovery_summary(
            adaptive_recovery_summary(db, owner_user_id)
        )
    except (ImportError, AttributeError):
        return {}
    except Exception:
        logger.exception(
            "Could not snapshot adaptive recovery signals for user=%s",
            owner_user_id,
        )
        return {}


@router.post("/intake", status_code=status.HTTP_201_CREATED)
async def create_intake(
    prompt: str = Form(default=""),
    curriculum_text: str = Form(default=""),
    curriculum_file: Optional[UploadFile] = File(default=None),
    user: dict = Depends(get_current_user),
):
    trace_id = uuid.uuid4().hex[:10]
    request_started = time.monotonic()
    prompt = prompt.strip()
    curriculum_text = curriculum_text.strip()
    provided = int(bool(prompt)) + int(bool(curriculum_text)) + int(curriculum_file is not None)
    if provided != 1:
        raise HTTPException(
            status_code=400,
            detail="Enter one learning prompt, paste one curriculum, or upload one curriculum file.",
        )

    if prompt:
        if len(prompt) < 8:
            raise HTTPException(status_code=422, detail="Describe what you want to learn in a little more detail.")
        source = {
            "type": "prompt",
            "text": prompt[:MAX_SOURCE_CHARS],
            "title": _prompt_title(prompt),
            "label": "Learning prompt",
            "mode": "prompt",
        }
    elif curriculum_text:
        if len(curriculum_text) < 40:
            raise HTTPException(status_code=422, detail="Paste a more complete curriculum or outline.")
        source = {
            "type": "curriculum",
            "text": curriculum_text[:MAX_SOURCE_CHARS],
            "title": _prompt_title(curriculum_text.splitlines()[0]),
            "label": "Pasted curriculum",
            "mode": "pasted-text",
        }
    else:
        assert curriculum_file is not None
        contents = await curriculum_file.read()
        if len(contents) > 20 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Curriculum files must be 20 MB or smaller.")
        try:
            extracted = await run_in_threadpool(
                extract_file_source,
                curriculum_file.filename or "curriculum",
                contents,
                curriculum_file.content_type or "",
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if str(extracted.get("mode") or "").endswith("fallback"):
            raise HTTPException(
                status_code=422,
                detail="The curriculum could not be parsed. Configure Firecrawl or upload TXT/Markdown.",
            )
        source = {
            "type": "curriculum",
            "text": str(extracted["text"])[:MAX_SOURCE_CHARS],
            "title": extracted["title"],
            "label": extracted["label"],
            "mode": extracted["mode"],
        }

    logger.info(
        "Course intake request received trace=%s user=%s source_type=%s "
        "source_chars=%d model=%s",
        trace_id,
        user.get("uid"),
        source["type"],
        len(source["text"]),
        settings.course_generation_model,
    )
    try:
        intake = await generate_intake(
            source["text"],
            source["title"],
            trace_id=trace_id,
        )
    except CourseGenerationError as exc:
        logger.error(
            "Course intake request failed trace=%s user=%s elapsed=%.2fs error=%s",
            trace_id,
            user.get("uid"),
            time.monotonic() - request_started,
            str(exc)[:500],
        )
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    intake = dict(intake)
    intake["complete"] = bool(intake.get("complete", False))

    now = datetime.now(timezone.utc)
    course_id = f"generated-{uuid.uuid4().hex[:12]}"
    payload = {
        "version": 2,
        "source": source,
        "intake": intake,
        "answers": {},
        "progress": {
            "stage": "intake",
            "percent": 5,
            "message": "Answer a few questions so the course fits you.",
        },
        "error": None,
        "assets": {},
    }
    row = GeneratedCourse(
        id=course_id,
        owner_user_id=int(user["uid"]),
        status="intake",
        source_type=source["type"],
        source_label=source["label"],
        extraction_mode=source["mode"],
        payload=payload,
        created_at=now,
        updated_at=now,
    )
    with SessionLocal() as db:
        db.add(row)
        db.commit()
        db.refresh(row)
        logger.info(
            "Course intake job created trace=%s user=%s course_id=%s "
            "elapsed=%.2fs questions=%d",
            trace_id,
            user.get("uid"),
            course_id,
            time.monotonic() - request_started,
            len(intake.get("questions") or []),
        )
        return _public_response(row)


@router.post("/{course_id}/intake-answer")
async def answer_intake_question(
    course_id: str,
    body: IntakeAnswer,
    user: dict = Depends(get_current_user),
):
    row = _owned_row(course_id, int(user["uid"]))
    if row.status != "intake":
        raise HTTPException(status_code=409, detail="This course interview is already complete.")

    payload = dict(row.payload or {})
    intake = dict(payload.get("intake") or {})
    questions = list(intake.get("questions") or [])
    question_index = next(
        (index for index, item in enumerate(questions) if item.get("id") == body.questionId),
        None,
    )
    if question_index is None:
        raise HTTPException(status_code=422, detail="That interview question is no longer active.")

    question = questions[question_index]
    if isinstance(body.answer, list):
        answer: Union[str, List[str]] = [str(item).strip() for item in body.answer if str(item).strip()]
        if question.get("kind") != "multi_select":
            raise HTTPException(status_code=422, detail="Choose one answer for this question.")
    else:
        answer = body.answer.strip()
    if question.get("required", True) and (answer == "" or answer == []):
        raise HTTPException(status_code=422, detail="Answer this question to continue.")

    options = list(question.get("options") or [])
    selected = answer if isinstance(answer, list) else [answer]
    if options and any(item not in options for item in selected):
        raise HTTPException(status_code=422, detail="Choose one of the available answers.")

    # If a learner revises an earlier answer, discard the dependent branch and
    # ask the model for a fresh follow-up from that point.
    questions = questions[: question_index + 1]
    kept_ids = {str(item.get("id")) for item in questions}
    answers = {
        key: value
        for key, value in dict(payload.get("answers") or {}).items()
        if key in kept_ids
    }
    answers[body.questionId] = answer
    intake["questions"] = questions

    try:
        follow_up = await generate_next_intake_question(
            dict(payload.get("source") or {}),
            intake,
            answers,
        )
    except CourseGenerationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    next_question = follow_up.get("question")
    complete = bool(follow_up.get("complete")) or next_question is None
    if next_question is not None and len(questions) < 5:
        questions.append(next_question)
        complete = False

    intake["questions"] = questions
    intake["complete"] = complete
    payload["intake"] = intake
    payload["answers"] = answers
    payload["progress"] = {
        "stage": "intake",
        "percent": min(9, 5 + len(answers)),
        "message": "Course preferences captured." if complete else "Adapting the next question to your answer.",
    }
    payload["error"] = None

    with SessionLocal() as db:
        stored = db.get(GeneratedCourse, course_id)
        if stored is None or stored.owner_user_id != int(user["uid"]):
            raise HTTPException(status_code=404, detail="Generated course not found")
        stored.payload = payload
        stored.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(stored)
        return _public_response(stored)


@router.post("/{course_id}/generate", status_code=status.HTTP_202_ACCEPTED)
async def start_generation(
    course_id: str,
    body: GenerationAnswers,
    user: dict = Depends(get_current_user),
):
    row = _owned_row(course_id, int(user["uid"]))
    if row.status == "ready":
        return _public_response(row)
    if row.status in {"researching", "generating", "generating_images"}:
        _schedule(course_id)
        return _public_response(row)

    payload = dict(row.payload or {})
    intake = payload.get("intake") or {}
    if intake.get("complete") is False:
        raise HTTPException(status_code=422, detail="Finish the adaptive course interview first.")
    effective_answers = body.answers or dict(payload.get("answers") or {})
    questions = intake.get("questions") or []
    missing: List[str] = []
    for question in questions:
        if not question.get("required", True):
            continue
        value = effective_answers.get(question.get("id"))
        if value is None or value == "" or value == []:
            missing.append(str(question.get("id")))
    if missing:
        raise HTTPException(status_code=422, detail=f"Answer the required questions: {', '.join(missing)}")

    payload["answers"] = effective_answers
    payload["error"] = None
    payload["progress"] = {
        "stage": "outlining",
        "percent": 10,
        "message": "Designing your course modules",
    }
    with SessionLocal() as db:
        stored = db.get(GeneratedCourse, course_id)
        if stored is None or stored.owner_user_id != int(user["uid"]):
            raise HTTPException(status_code=404, detail="Generated course not found")
        if "adaptiveRecovery" not in payload:
            payload["adaptiveRecovery"] = _load_adaptive_recovery_summary(
                db,
                stored.owner_user_id,
            )
        stored.payload = payload
        stored.status = "generating"
        stored.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(stored)
        response = _public_response(stored)
    _schedule(course_id)
    return response


@router.get("")
async def list_generated_courses(user: dict = Depends(get_current_user)):
    with SessionLocal() as db:
        rows = list(
            db.scalars(
                select(GeneratedCourse)
                .where(GeneratedCourse.owner_user_id == int(user["uid"]))
                .order_by(GeneratedCourse.updated_at.desc())
            )
        )
        courses = [
            _public_response(row)
            for row in rows
            if (row.payload or {}).get("version") == 2 or row.status == "published"
        ]
    return {"courses": courses}


@router.post("/{course_id}/archive")
async def archive_generated_course(course_id: str, user: dict = Depends(get_current_user)):
    owner_user_id = int(user["uid"])
    _owned_row(course_id, owner_user_id)
    with SessionLocal() as db:
        row = db.get(GeneratedCourse, course_id)
        if row is None or row.owner_user_id != owner_user_id:
            raise HTTPException(status_code=404, detail="Generated course not found")
        if row.status in {"researching", "generating", "generating_images"}:
            raise HTTPException(status_code=409, detail="Wait for generation to finish, or delete the course instead.")
        payload = dict(row.payload or {})
        payload["archivedAt"] = datetime.now(timezone.utc).isoformat()
        row.payload = payload
        row.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(row)
        return _public_response(row)


@router.post("/{course_id}/restore")
async def restore_generated_course(course_id: str, user: dict = Depends(get_current_user)):
    owner_user_id = int(user["uid"])
    _owned_row(course_id, owner_user_id)
    with SessionLocal() as db:
        row = db.get(GeneratedCourse, course_id)
        if row is None or row.owner_user_id != owner_user_id:
            raise HTTPException(status_code=404, detail="Generated course not found")
        payload = dict(row.payload or {})
        payload.pop("archivedAt", None)
        row.payload = payload
        row.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(row)
        return _public_response(row)


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_generated_course(course_id: str, user: dict = Depends(get_current_user)):
    owner_user_id = int(user["uid"])
    _owned_row(course_id, owner_user_id)
    await _cancel_generation_job(course_id)

    keep_assets = False
    with SessionLocal() as db:
        row = db.get(GeneratedCourse, course_id)
        if row is None or row.owner_user_id != owner_user_id:
            raise HTTPException(status_code=404, detail="Generated course not found")
        platform_courses = db.scalars(select(PlatformCourse)).all()
        keep_assets = any(
            str((platform.course or {}).get("sourceGeneratedCourseId") or "") == course_id
            for platform in platform_courses
        )
        db.execute(delete(BrowserLabRecovery).where(
            BrowserLabRecovery.owner_user_id == owner_user_id,
            BrowserLabRecovery.course_id == course_id,
        ))
        db.execute(delete(BrowserLabRun).where(
            BrowserLabRun.owner_user_id == owner_user_id,
            BrowserLabRun.course_id == course_id,
        ))
        db.delete(row)
        db.commit()

    if not keep_assets:
        await run_in_threadpool(_remove_generated_assets, owner_user_id, course_id)


@router.get("/{course_id}")
async def get_generated_course(course_id: str, user: dict = Depends(get_current_user)):
    return _public_response(_owned_row(course_id, int(user["uid"])))
