"""Server-side browser lab attempts and evidence verification."""

from __future__ import annotations

from datetime import datetime, timezone
import re
import secrets
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from fastapi import HTTPException, status
from sqlalchemy import select

from app.db import BrowserLabRun, GeneratedCourse, SessionLocal
from app.services.generated_courses import BROWSER_PLATFORM_CATALOG

MAX_EVIDENCE_EVENTS = 240
MAX_TEXT_VALUE = 700
SENSITIVE_KEY_RE = re.compile(r"(password|secret|token|key|authorization|cookie|credential)", re.IGNORECASE)


def _owner_id(user: dict[str, Any]) -> int:
    try:
        return int(user["uid"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _host(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except Exception:
        return ""


def _allowed_host(host: str, allowed_hosts: list[str]) -> bool:
    host = host.lower().strip()
    if not host:
        return False
    for allowed in allowed_hosts:
        allowed = str(allowed or "").lower().strip()
        if host == allowed or host.endswith(f".{allowed}"):
            return True
    return False


def _lesson_from_course(course: dict[str, Any], lesson_id: str) -> Optional[dict[str, Any]]:
    for module in course.get("modules") or []:
        for lesson in module.get("lessons") or []:
            if lesson.get("id") == lesson_id:
                return lesson
    return None


def _lab_plan_for(owner_user_id: int, course_id: str, lesson_id: str) -> dict[str, Any]:
    with SessionLocal() as db:
        row = db.scalar(
            select(GeneratedCourse).where(
                GeneratedCourse.id == course_id,
                GeneratedCourse.owner_user_id == owner_user_id,
                GeneratedCourse.status == "ready",
            )
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Course not found")
        course = (row.payload or {}).get("course") or {}
        lesson = _lesson_from_course(course, lesson_id)
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")
        lab = lesson.get("browserLab")
        if not isinstance(lab, dict):
            raise HTTPException(status_code=404, detail="Browser lab not found")
        platform_id = str(lab.get("platformId") or "")
        platform = BROWSER_PLATFORM_CATALOG.get(platform_id)
        if not platform:
            raise HTTPException(status_code=422, detail="Unsupported browser lab platform")
        plan = dict(lab)
        plan["platformId"] = platform_id
        plan["platform"] = platform.get("label")
        plan["launchUrl"] = platform.get("launchUrl")
        plan["allowedHosts"] = [
            str(host).lower()
            for host in platform.get("allowedHosts") or []
            if str(host).strip()
        ]
        return plan


def _scrub(value: Any, *, depth: int = 0) -> Any:
    if depth > 5:
        return None
    if isinstance(value, dict):
        clean: dict[str, Any] = {}
        for key, item in value.items():
            if SENSITIVE_KEY_RE.search(str(key)):
                clean[str(key)[:80]] = "[redacted]"
            else:
                clean[str(key)[:80]] = _scrub(item, depth=depth + 1)
        return clean
    if isinstance(value, list):
        return [_scrub(item, depth=depth + 1) for item in value[:30]]
    if isinstance(value, str):
        return re.sub(r"\s+", " ", value).strip()[:MAX_TEXT_VALUE]
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return str(value)[:MAX_TEXT_VALUE]


def _sanitize_evidence(payload: dict[str, Any], allowed_hosts: list[str]) -> dict[str, Any]:
    kind = re.sub(r"[^a-zA-Z0-9_.:-]", "_", str(payload.get("kind") or "event"))[:80]
    raw_payload = payload.get("payload")
    event_payload = raw_payload if isinstance(raw_payload, dict) else {}
    url = str(event_payload.get("url") or payload.get("url") or "")
    host = _host(url)
    if url and not _allowed_host(host, allowed_hosts):
        raise HTTPException(status_code=400, detail="Evidence URL is outside this lab")
    return {
        "id": secrets.token_urlsafe(12),
        "clientEventId": str(payload.get("clientEventId") or "")[:120],
        "kind": kind,
        "host": host,
        "url": url[:2048],
        "payload": _scrub(event_payload),
        "createdAt": _now().isoformat(),
    }


def _text_blob(event: dict[str, Any]) -> str:
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    return " ".join(
        str(payload.get(key) or "")
        for key in ("text", "label", "role", "title", "selector", "tagName", "visibleText")
    ).lower()


def _tokens(value: str) -> list[str]:
    return [token for token in re.findall(r"[a-z0-9][a-z0-9_-]{1,}", value.lower()) if token not in {"the", "and", "for", "with", "into"}]


def _match_text(value: str, blob: str) -> bool:
    wanted = _tokens(value)
    if not wanted:
        return True
    return all(token in blob for token in wanted[:5])


def _assertion_matched(
    assertion: dict[str, Any],
    evidence: list[dict[str, Any]],
    allowed_hosts: list[str],
    *,
    cleanup: bool = False,
) -> bool:
    assertion_id = str(assertion.get("id") or "")
    kind = str(assertion.get("kind") or "")
    value = str(assertion.get("value") or "")
    for event in evidence:
        payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        if event.get("kind") == "assertion_observed" and str(payload.get("assertionId") or "") == assertion_id:
            return True
        if event.get("url") and not _allowed_host(str(event.get("host") or ""), allowed_hosts):
            continue
        if cleanup and payload.get("phase") != "cleanup":
            continue
        if kind == "visit_host" and event.get("url") and _allowed_host(str(event.get("host") or ""), allowed_hosts):
            return True
        if kind == "url_contains" and value and value.lower() in str(event.get("url") or "").lower():
            return True
        if kind == "click_text" and event.get("kind") == "click" and _match_text(value, _text_blob(event)):
            return True
        if kind == "input_changed" and event.get("kind") in {"input", "change"} and _match_text(value, _text_blob(event)):
            return True
        if kind == "page_text" and event.get("kind") in {"navigation", "page_snapshot"} and _match_text(value, _text_blob(event)):
            return True
        if kind == "interaction_observed" and event.get("kind") in {"click", "input", "change", "navigation", "page_snapshot"}:
            return _match_text(value, _text_blob(event))
    return False


def verify_evidence(plan: dict[str, Any], evidence: list[dict[str, Any]]) -> dict[str, Any]:
    allowed_hosts = [str(host).lower() for host in plan.get("allowedHosts") or []]
    task_assertions = [item for item in plan.get("taskAssertions") or [] if isinstance(item, dict)]
    cleanup_assertions = [item for item in plan.get("cleanupAssertions") or [] if isinstance(item, dict)]
    task_results = {
        str(assertion.get("id") or ""): _assertion_matched(assertion, evidence, allowed_hosts)
        for assertion in task_assertions
    }
    cleanup_results = {
        str(assertion.get("id") or ""): _assertion_matched(assertion, evidence, allowed_hosts, cleanup=True)
        for assertion in cleanup_assertions
    }
    task_complete = bool(task_results) and all(task_results.values())
    cleanup_complete = bool(cleanup_results) and all(cleanup_results.values())
    status_value = "verified" if task_complete and cleanup_complete else "needs_cleanup" if task_complete else "running"
    return {
        "status": status_value,
        "taskComplete": task_complete,
        "cleanupComplete": cleanup_complete,
        "taskAssertions": task_results,
        "cleanupAssertions": cleanup_results,
        "evidenceCount": len(evidence),
        "updatedAt": _now().isoformat(),
    }


def public_run(run: BrowserLabRun) -> dict[str, Any]:
    return {
        "id": run.id,
        "courseId": run.course_id,
        "lessonId": run.lesson_id,
        "platformId": run.platform_id,
        "launchUrl": run.launch_url,
        "allowedHosts": run.allowed_hosts or [],
        "status": run.status,
        "plan": run.plan_snapshot or {},
        "verification": run.verification or {},
        "evidenceCount": len(run.evidence or []),
        "createdAt": run.created_at.isoformat() if run.created_at else None,
        "updatedAt": run.updated_at.isoformat() if run.updated_at else None,
        "verifiedAt": run.verified_at.isoformat() if run.verified_at else None,
    }


def start_attempt(course_id: str, lesson_id: str, user: dict[str, Any]) -> dict[str, Any]:
    owner_user_id = _owner_id(user)
    plan = _lab_plan_for(owner_user_id, course_id, lesson_id)
    now = _now()
    with SessionLocal() as db:
        run = db.scalar(
            select(BrowserLabRun).where(
                BrowserLabRun.owner_user_id == owner_user_id,
                BrowserLabRun.course_id == course_id,
                BrowserLabRun.lesson_id == lesson_id,
            )
        )
        if run is None:
            run = BrowserLabRun(
                id=f"blr_{secrets.token_urlsafe(18)}",
                owner_user_id=owner_user_id,
                course_id=course_id,
                lesson_id=lesson_id,
                platform_id=str(plan.get("platformId") or ""),
                launch_url=str(plan.get("launchUrl") or ""),
                allowed_hosts=plan.get("allowedHosts") or [],
                status="running",
                plan_snapshot=plan,
                evidence=[],
                verification=verify_evidence(plan, []),
                created_at=now,
                updated_at=now,
            )
            db.add(run)
        elif run.status != "verified":
            run.platform_id = str(plan.get("platformId") or "")
            run.launch_url = str(plan.get("launchUrl") or "")
            run.allowed_hosts = plan.get("allowedHosts") or []
            run.plan_snapshot = plan
            run.updated_at = now
            run.verification = verify_evidence(plan, run.evidence or [])
            run.status = str(run.verification.get("status") or "running")
        db.commit()
        db.refresh(run)
        return public_run(run)


def get_attempt(attempt_id: str, user: dict[str, Any]) -> dict[str, Any]:
    owner_user_id = _owner_id(user)
    with SessionLocal() as db:
        run = db.get(BrowserLabRun, attempt_id)
        if run is None or run.owner_user_id != owner_user_id:
            raise HTTPException(status_code=404, detail="Browser lab attempt not found")
        return public_run(run)


def record_evidence(attempt_id: str, user: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    owner_user_id = _owner_id(user)
    now = _now()
    with SessionLocal() as db:
        run = db.get(BrowserLabRun, attempt_id)
        if run is None or run.owner_user_id != owner_user_id:
            raise HTTPException(status_code=404, detail="Browser lab attempt not found")
        event = _sanitize_evidence(payload, run.allowed_hosts or [])
        events = list(run.evidence or [])
        client_event_id = event.get("clientEventId")
        if client_event_id and any(item.get("clientEventId") == client_event_id for item in events):
            return public_run(run)
        events.append(event)
        run.evidence = events[-MAX_EVIDENCE_EVENTS:]
        verification = verify_evidence(run.plan_snapshot or {}, run.evidence or [])
        run.verification = verification
        run.status = str(verification.get("status") or "running")
        run.updated_at = now
        if run.status == "verified" and run.verified_at is None:
            run.verified_at = now
        db.commit()
        db.refresh(run)
        return public_run(run)
