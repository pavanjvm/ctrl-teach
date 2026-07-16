"""Server-side browser lab attempts, verification, and adaptive recovery."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import re
import secrets
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from fastapi import HTTPException, status
from sqlalchemy import select

from app.db import BrowserLabRecovery, BrowserLabRun, GeneratedCourse, SessionLocal
from app.services.generated_courses import BROWSER_PLATFORM_CATALOG

MAX_EVIDENCE_EVENTS = 240
MAX_TEXT_VALUE = 700
MAX_PRACTICE_ATTEMPTS = 20
MAX_RECOVERY_HISTORY = 12
ACTIVE_RECOVERY_STATUSES = {"practicing", "retry_ready", "retrying"}
SENSITIVE_KEY_RE = re.compile(
    r"(password|secret|token|key|authorization|cookie|credential)",
    re.IGNORECASE,
)


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


def _asserted_host(value: str) -> str:
    clean = str(value or "").strip().lower()
    if not clean:
        return ""
    return _host(clean) or clean.split("/", 1)[0].split(":", 1)[0]


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


def _sanitize_evidence(
    payload: dict[str, Any],
    allowed_hosts: list[str],
    *,
    phase: str,
    sequence: int,
    recovery_id: str = "",
) -> dict[str, Any]:
    kind = re.sub(r"[^a-zA-Z0-9_.:-]", "_", str(payload.get("kind") or "event"))[:80]
    raw_payload = payload.get("payload")
    event_payload = dict(raw_payload) if isinstance(raw_payload, dict) else {}
    # Phase is an authorization boundary and is always assigned by the server.
    event_payload.pop("phase", None)
    url = str(event_payload.get("url") or payload.get("url") or "")
    host = _host(url)
    if url and not _allowed_host(host, allowed_hosts):
        raise HTTPException(status_code=400, detail="Evidence URL is outside this lab")
    return {
        "id": secrets.token_urlsafe(12),
        "clientEventId": str(payload.get("clientEventId") or "")[:120],
        "sequence": sequence,
        "phase": phase,
        "recoveryId": recovery_id,
        "kind": kind,
        "host": host,
        "url": url[:2048],
        "payload": _scrub(event_payload),
        "createdAt": _now().isoformat(),
    }


def _control_event(
    *,
    kind: str,
    phase: str,
    sequence: int,
    recovery_id: str = "",
) -> dict[str, Any]:
    return {
        "id": secrets.token_urlsafe(12),
        "clientEventId": "",
        "sequence": sequence,
        "phase": phase,
        "recoveryId": recovery_id,
        "kind": kind,
        "host": "",
        "url": "",
        "payload": {},
        "createdAt": _now().isoformat(),
    }


def _event_sequence(event: dict[str, Any], fallback: int = 0) -> int:
    try:
        return max(0, int(event.get("sequence") or fallback))
    except (TypeError, ValueError):
        return fallback


def _next_evidence_sequence(evidence: list[dict[str, Any]]) -> int:
    return max(
        (_event_sequence(event, index) for index, event in enumerate(evidence, start=1)),
        default=0,
    ) + 1


def _append_evidence(events: list[dict[str, Any]], event: dict[str, Any]) -> list[dict[str, Any]]:
    return [*events, event][-MAX_EVIDENCE_EVENTS:]


def _text_blob(event: dict[str, Any]) -> str:
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    return " ".join(
        str(payload.get(key) or "")
        for key in ("text", "label", "role", "title", "selector", "tagName", "visibleText")
    ).lower()


def _tokens(value: str) -> list[str]:
    return [
        token
        for token in re.findall(r"[a-z0-9][a-z0-9_-]{1,}", value.lower())
        if token not in {"the", "and", "for", "with", "into"}
    ]


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
    phases: set[str],
    after_sequence: int = 0,
    recovery_id: str = "",
) -> bool:
    kind = str(assertion.get("kind") or "")
    value = str(assertion.get("value") or "")
    expected_host = _asserted_host(value)
    for index, event in enumerate(evidence, start=1):
        if _event_sequence(event, index) <= after_sequence:
            continue
        if str(event.get("phase") or "task") not in phases:
            continue
        if recovery_id and str(event.get("recoveryId") or "") != recovery_id:
            continue
        # assertion_observed is useful telemetry, never proof.
        if event.get("kind") == "assertion_observed":
            continue
        # Every supported assertion describes browser state on the lab's
        # allowed platform. Evidence without a URL cannot prove that state.
        if not event.get("url") or not _allowed_host(
            str(event.get("host") or ""),
            allowed_hosts,
        ):
            continue
        if kind == "visit_host" and event.get("url"):
            event_host = str(event.get("host") or "")
            if not _allowed_host(event_host, allowed_hosts):
                continue
            if not expected_host or _allowed_host(event_host, [expected_host]):
                return True
        if kind == "url_contains" and value and value.lower() in str(event.get("url") or "").lower():
            return True
        if kind == "click_text" and event.get("kind") == "click" and _match_text(value, _text_blob(event)):
            return True
        if kind == "input_changed" and event.get("kind") in {"input", "change"} and _match_text(value, _text_blob(event)):
            return True
        if kind == "page_text" and event.get("kind") in {"navigation", "page_snapshot"} and _match_text(value, _text_blob(event)):
            return True
        if (
            kind == "interaction_observed"
            and event.get("kind") in {"click", "input", "change", "navigation", "page_snapshot"}
            and _match_text(value, _text_blob(event))
        ):
            return True
    return False


def _cleanup_boundary_sequence(evidence: list[dict[str, Any]]) -> Optional[int]:
    sequences = [
        _event_sequence(event, index)
        for index, event in enumerate(evidence, start=1)
        if event.get("kind") == "cleanup_started"
        and event.get("phase") == "cleanup_boundary"
    ]
    return min(sequences) if sequences else None


def verify_evidence(plan: dict[str, Any], evidence: list[dict[str, Any]]) -> dict[str, Any]:
    allowed_hosts = [str(host).lower() for host in plan.get("allowedHosts") or []]
    task_assertions = [item for item in plan.get("taskAssertions") or [] if isinstance(item, dict)]
    cleanup_assertions = [item for item in plan.get("cleanupAssertions") or [] if isinstance(item, dict)]
    task_results = {
        str(assertion.get("id") or ""): _assertion_matched(
            assertion,
            evidence,
            allowed_hosts,
            phases={"task", "retry_verified"},
        )
        for assertion in task_assertions
    }
    cleanup_boundary = _cleanup_boundary_sequence(evidence)
    cleanup_results = {
        str(assertion.get("id") or ""): bool(cleanup_boundary is not None)
        and _assertion_matched(
            assertion,
            evidence,
            allowed_hosts,
            phases={"cleanup"},
            after_sequence=cleanup_boundary or 0,
        )
        for assertion in cleanup_assertions
    }
    task_complete = bool(task_results) and all(task_results.values())
    cleanup_complete = bool(cleanup_results) and all(cleanup_results.values())
    status_value = "verified" if task_complete and cleanup_complete else "needs_cleanup" if task_complete else "running"
    return {
        "status": status_value,
        "taskComplete": task_complete,
        "cleanupComplete": cleanup_complete,
        "cleanupStarted": cleanup_boundary is not None,
        "cleanupBoundarySequence": cleanup_boundary,
        "taskAssertions": task_results,
        "cleanupAssertions": cleanup_results,
        "evidenceCount": len(evidence),
        "updatedAt": _now().isoformat(),
    }


def _recovery_rows(db: Any, run_id: str) -> list[BrowserLabRecovery]:
    return list(
        db.scalars(
            select(BrowserLabRecovery)
            .where(BrowserLabRecovery.browser_lab_run_id == run_id)
            .order_by(BrowserLabRecovery.sequence.desc())
        )
    )


def _public_practice_task(task: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(task.get("id") or ""),
        "kind": str(task.get("kind") or "multiple_choice"),
        "prompt": str(task.get("prompt") or ""),
        "options": [
            {
                "id": str(option.get("id") or ""),
                "label": str(option.get("text") or option.get("label") or ""),
            }
            for option in task.get("options") or []
            if isinstance(option, dict) and option.get("id")
        ],
    }


def _public_evidence_summary(mistake: dict[str, Any]) -> str:
    events = [
        event
        for event in mistake.get("evidenceSummary") or []
        if isinstance(event, dict)
    ]
    verification = mistake.get("failureVerification") or {}
    missing_count = sum(
        not bool(matched)
        for matched in (verification.get("taskAssertions") or {}).values()
    )
    event_label = "event" if len(events) == 1 else "events"
    assertion_label = "criterion" if missing_count == 1 else "criteria"
    return (
        f"The server checked {len(events)} stored evidence {event_label}; "
        f"{missing_count or 1} required {assertion_label} for this step "
        "was not yet verified."
    )


def public_recovery(recovery: BrowserLabRecovery) -> dict[str, Any]:
    mistake = recovery.mistake_snapshot or {}
    misconception = dict(mistake.get("misconception") or {})
    misconception["evidenceSummary"] = _public_evidence_summary(mistake)
    micro_lesson = recovery.micro_lesson or {}
    whiteboard_plan = (
        micro_lesson.get("whiteboardPlan")
        if isinstance(micro_lesson.get("whiteboardPlan"), dict)
        else micro_lesson
    )
    outcome = recovery.final_outcome or {}
    attempts = [
        {
            "id": str(item.get("clientAttemptId") or ""),
            "correct": bool(item.get("correct")),
            "feedback": str(item.get("feedback") or ""),
            "createdAt": item.get("attemptedAt"),
        }
        for item in (recovery.practice_attempts or [])
        if isinstance(item, dict)
    ]
    return {
        "id": recovery.id,
        "sequence": recovery.sequence,
        "status": recovery.status,
        "failedStep": mistake.get("failedStep") or {},
        "gapKey": recovery.gap_key,
        "missingAssertionIds": list(recovery.missing_assertion_ids or []),
        "misconception": misconception,
        "microLesson": whiteboard_plan,
        "practiceTask": _public_practice_task(recovery.practice_task or {}),
        "practiceAttempts": attempts,
        "retry": {
            "started": recovery.retry_boundary_sequence is not None,
            "verification": recovery.retry_verification or {},
        },
        "finalOutcome": str(outcome.get("status") or recovery.status),
        "createdAt": recovery.created_at.isoformat() if recovery.created_at else None,
        "updatedAt": recovery.updated_at.isoformat() if recovery.updated_at else None,
        "resolvedAt": recovery.resolved_at.isoformat() if recovery.resolved_at else None,
    }


def public_run(run: BrowserLabRun, db: Any | None = None) -> dict[str, Any]:
    owns_session = db is None
    session = db or SessionLocal()
    try:
        recoveries = _recovery_rows(session, run.id)
        active = next(
            (item for item in recoveries if item.status in ACTIVE_RECOVERY_STATUSES),
            None,
        )
        recovery_history = [
            public_recovery(item)
            for item in recoveries[:MAX_RECOVERY_HISTORY]
        ]
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
            "activeRecovery": public_recovery(active) if active is not None else None,
            "recoveryHistory": recovery_history,
            "createdAt": run.created_at.isoformat() if run.created_at else None,
            "updatedAt": run.updated_at.isoformat() if run.updated_at else None,
            "verifiedAt": run.verified_at.isoformat() if run.verified_at else None,
        }
    finally:
        if owns_session:
            session.close()


def _owned_run(db: Any, attempt_id: str, owner_user_id: int) -> BrowserLabRun:
    run = db.get(BrowserLabRun, attempt_id)
    if run is None or run.owner_user_id != owner_user_id:
        raise HTTPException(status_code=404, detail="Browser lab attempt not found")
    return run


def _owned_recovery(
    db: Any,
    run: BrowserLabRun,
    recovery_id: str,
    owner_user_id: int,
) -> BrowserLabRecovery:
    recovery = db.get(BrowserLabRecovery, recovery_id)
    if (
        recovery is None
        or recovery.owner_user_id != owner_user_id
        or recovery.browser_lab_run_id != run.id
    ):
        raise HTTPException(status_code=404, detail="Browser lab recovery not found")
    return recovery


def start_attempt(course_id: str, lesson_id: str, user: dict[str, Any]) -> dict[str, Any]:
    owner_user_id = _owner_id(user)
    now = _now()
    with SessionLocal() as db:
        run = db.scalar(
            select(BrowserLabRun).where(
                BrowserLabRun.owner_user_id == owner_user_id,
                BrowserLabRun.course_id == course_id,
                BrowserLabRun.lesson_id == lesson_id,
            )
        )
        if run is not None:
            # Existing runs keep their original plan, hosts, and success criteria.
            return public_run(run, db)

    plan = _lab_plan_for(owner_user_id, course_id, lesson_id)
    with SessionLocal() as db:
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
        db.commit()
        db.refresh(run)
        return public_run(run, db)


def get_attempt(attempt_id: str, user: dict[str, Any]) -> dict[str, Any]:
    owner_user_id = _owner_id(user)
    with SessionLocal() as db:
        run = _owned_run(db, attempt_id, owner_user_id)
        return public_run(run, db)


def _active_recovery(db: Any, run_id: str) -> Optional[BrowserLabRecovery]:
    return db.scalar(
        select(BrowserLabRecovery)
        .where(
            BrowserLabRecovery.browser_lab_run_id == run_id,
            BrowserLabRecovery.status.in_(tuple(ACTIVE_RECOVERY_STATUSES)),
        )
        .order_by(BrowserLabRecovery.sequence.desc())
    )


def _attempt_events(
    evidence: list[dict[str, Any]],
    *,
    phase: str,
    after_sequence: int = 0,
    recovery_id: str = "",
) -> list[dict[str, Any]]:
    ignored_kinds = {
        "assertion_observed",
        "cleanup_started",
        "recovery_retry_started",
    }
    return [
        event
        for index, event in enumerate(evidence, start=1)
        if _event_sequence(event, index) > after_sequence
        and event.get("phase") == phase
        and (not recovery_id or event.get("recoveryId") == recovery_id)
        and event.get("kind") not in ignored_kinds
        and bool(event.get("url"))
    ]


def _server_phase(
    run: BrowserLabRun,
    active_recovery: Optional[BrowserLabRecovery],
    kind: str,
) -> tuple[str, str]:
    if active_recovery is not None:
        if active_recovery.status == "retrying":
            return "retry", active_recovery.id
        return "recovery", active_recovery.id
    if run.status == "needs_cleanup":
        boundary = _cleanup_boundary_sequence(list(run.evidence or []))
        if kind == "cleanup_started" and boundary is None:
            return "cleanup_boundary", ""
        return ("cleanup" if boundary is not None else "cleanup_pending"), ""
    return "task", ""


def _assertions_by_id(plan: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(item.get("id") or ""): item
        for item in plan.get("taskAssertions") or []
        if isinstance(item, dict) and item.get("id")
    }


def _retry_results(run: BrowserLabRun, recovery: BrowserLabRecovery) -> dict[str, bool]:
    plan = run.plan_snapshot or {}
    allowed_hosts = [str(host).lower() for host in plan.get("allowedHosts") or []]
    assertions = _assertions_by_id(plan)
    boundary = int(recovery.retry_boundary_sequence or 0)
    return {
        assertion_id: bool(assertions.get(assertion_id))
        and _assertion_matched(
            assertions[assertion_id],
            list(run.evidence or []),
            allowed_hosts,
            phases={"retry", "retry_verified"},
            after_sequence=boundary,
            recovery_id=recovery.id,
        )
        for assertion_id in recovery.target_assertion_ids or []
    }


def _set_recovery_event_phase(
    evidence: list[dict[str, Any]],
    recovery_id: str,
    phase: str,
) -> list[dict[str, Any]]:
    updated: list[dict[str, Any]] = []
    for event in evidence:
        item = dict(event)
        if item.get("recoveryId") == recovery_id and item.get("phase") == "retry":
            item["phase"] = phase
        updated.append(item)
    return updated


def _resolve_recovery_if_ready(
    run: BrowserLabRun,
    recovery: BrowserLabRecovery,
    now: datetime,
) -> bool:
    results = _retry_results(run, recovery)
    complete = bool(results) and all(results.values())
    recovery.retry_verification = {
        "complete": complete,
        "assertions": results,
        "updatedAt": now.isoformat(),
    }
    recovery.updated_at = now
    if not complete:
        return False
    run.evidence = _set_recovery_event_phase(
        list(run.evidence or []),
        recovery.id,
        "retry_verified",
    )
    recovery.status = "resolved"
    recovery.resolved_at = now
    recovery.final_outcome = {
        "status": "resolved",
        "retryVerified": True,
        "resolvedAt": now.isoformat(),
    }
    return True


def _finish_lab_outcomes(db: Any, run: BrowserLabRun, now: datetime) -> None:
    for recovery in _recovery_rows(db, run.id):
        outcome = dict(recovery.final_outcome or {})
        outcome.update(
            {
                "labStatus": "verified",
                "cleanupVerified": True,
                "labVerifiedAt": now.isoformat(),
            }
        )
        recovery.final_outcome = outcome
        recovery.updated_at = now


def record_evidence(attempt_id: str, user: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    owner_user_id = _owner_id(user)
    now = _now()
    with SessionLocal() as db:
        run = _owned_run(db, attempt_id, owner_user_id)
        if run.status == "verified":
            return public_run(run, db)

        events = list(run.evidence or [])
        client_event_id = str(payload.get("clientEventId") or "")[:120]
        if client_event_id and any(item.get("clientEventId") == client_event_id for item in events):
            return public_run(run, db)

        active_recovery = _active_recovery(db, run.id)
        kind = re.sub(r"[^a-zA-Z0-9_.:-]", "_", str(payload.get("kind") or "event"))[:80]
        phase, recovery_id = _server_phase(run, active_recovery, kind)
        event = _sanitize_evidence(
            payload,
            run.allowed_hosts or [],
            phase=phase,
            sequence=_next_evidence_sequence(events),
            recovery_id=recovery_id,
        )
        run.evidence = _append_evidence(events, event)

        recovery_resolved = False
        if active_recovery is not None and active_recovery.status == "retrying":
            recovery_resolved = _resolve_recovery_if_ready(run, active_recovery, now)

        verification = verify_evidence(run.plan_snapshot or {}, list(run.evidence or []))
        run.verification = verification
        if active_recovery is not None and active_recovery.status in {"practicing", "retry_ready"}:
            run.status = "recovering"
        elif active_recovery is not None and not recovery_resolved:
            run.status = "running"
        else:
            run.status = str(verification.get("status") or "running")
        run.updated_at = now
        if run.status == "verified":
            run.verified_at = run.verified_at or now
            _finish_lab_outcomes(db, run, now)
        db.commit()
        db.refresh(run)
        return public_run(run, db)


def _missing_step(
    plan: dict[str, Any],
    verification: dict[str, Any],
) -> tuple[dict[str, Any], list[str], list[str]]:
    assertion_results = verification.get("taskAssertions") or {}
    all_missing = [
        str(assertion_id)
        for assertion_id, matched in assertion_results.items()
        if not matched
    ]
    for step in plan.get("steps") or []:
        if not isinstance(step, dict):
            continue
        target_ids = [
            str(item)
            for item in step.get("assertionIds") or []
            if str(item) in assertion_results
        ]
        missing_ids = [item for item in target_ids if not assertion_results.get(item)]
        if missing_ids:
            return dict(step), missing_ids, target_ids or missing_ids
    fallback_id = all_missing[0] if all_missing else "task-evidence"
    return (
        {
            "id": "task-retry",
            "instruction": "Repeat the original task step and verify its visible result.",
            "expectedEvidence": "Tars records the required original task evidence.",
            "assertionIds": all_missing or [fallback_id],
        },
        all_missing or [fallback_id],
        all_missing or [fallback_id],
    )


def _evidence_summary(evidence: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summary: list[dict[str, Any]] = []
    for index, event in enumerate(evidence, start=1):
        if event.get("kind") == "assertion_observed":
            continue
        payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        parsed = urlparse(str(event.get("url") or ""))
        summary.append(
            {
                "sequence": _event_sequence(event, index),
                "kind": str(event.get("kind") or "event")[:80],
                "phase": str(event.get("phase") or "task")[:32],
                "host": str(event.get("host") or "")[:255],
                "path": str(parsed.path or "")[:400],
                "label": str(
                    payload.get("text")
                    or payload.get("label")
                    or payload.get("title")
                    or ""
                )[:180],
            }
        )
    return summary[-16:]


def _gap_details(
    run: BrowserLabRun,
    step: dict[str, Any],
    missing_assertion_ids: list[str],
) -> tuple[str, dict[str, Any], str, str]:
    assertions = _assertions_by_id(run.plan_snapshot or {})
    primary = assertions.get(missing_assertion_ids[0], {}) if missing_assertion_ids else {}
    kind = str(primary.get("kind") or "interaction_observed")
    value = str(primary.get("value") or "").strip()
    templates = {
        "visit_host": (
            "navigation_context",
            "Recognizing the correct workspace",
            "The evidence does not yet show the required platform location. Check the host before acting so the same-looking control on another page is not mistaken for the target.",
        ),
        "url_contains": (
            "route_recognition",
            "Following the intended route",
            "The evidence shows a route mismatch. Use the page address and heading together to confirm the intended area before continuing.",
        ),
        "click_text": (
            "control_identification",
            "Matching the action to its control",
            f"The required control{f' labeled {value!r}' if value else ''} was not observed. Read the control label first, then activate that exact control rather than a nearby alternative.",
        ),
        "input_changed": (
            "field_mapping",
            "Matching information to the right field",
            f"The expected field change{f' for {value!r}' if value else ''} was not observed. Confirm the field label and purpose before entering or changing anything.",
        ),
        "page_text": (
            "outcome_verification",
            "Checking the visible result",
            f"The expected result{f' containing {value!r}' if value else ''} was not observed. After the action, pause and verify the page state instead of assuming it succeeded.",
        ),
        "interaction_observed": (
            "workflow_execution",
            "Completing the observable workflow",
            "The evidence does not yet show the required reversible interaction. Separate the intended action from the cleanup step and complete one precise action at a time.",
        ),
    }
    code, title, explanation = templates.get(kind, templates["interaction_observed"])
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:80] or "general"
    gap_key = f"{run.platform_id}:{code}:{normalized}"
    misconception = {
        "code": code,
        "title": title,
        "explanation": explanation,
        "confidence": "medium" if run.evidence else "low",
        "assertionKind": kind,
    }
    return gap_key, misconception, kind, value


def _micro_lesson(
    step: dict[str, Any],
    misconception: dict[str, Any],
) -> dict[str, Any]:
    instruction = str(step.get("instruction") or "Repeat the original step.")[:420]
    title = str(misconception.get("title") or "Repair the step")
    explanation = str(misconception.get("explanation") or "")
    return {
        "type": "whiteboard",
        "title": title,
        "explanation": explanation,
        "whiteboardPlan": {
            "objective": f"Correct the approach before retrying: {instruction}"[:420],
            "beats": [
                "Name the exact target and the evidence it should produce.",
                "Separate the intended action from nearby alternatives.",
                "Check the visible result before moving to cleanup.",
            ],
            "visualElements": [
                "Target -> action -> visible evidence",
                "Original success criteria remain unchanged",
            ],
        },
    }


def _practice_task(
    recovery_id: str,
    step: dict[str, Any],
    assertion_kind: str,
    assertion_value: str,
) -> dict[str, Any]:
    target = assertion_value or str(step.get("instruction") or "the required step")
    prompts = {
        "visit_host": (
            "Before retrying, what is the smallest reliable check?",
            f"Confirm the browser host matches {target!r} before interacting.",
        ),
        "url_contains": (
            "Before retrying, what should you verify first?",
            f"Confirm the address contains {target!r} and the page heading fits the task.",
        ),
        "click_text": (
            "Which smaller action best prepares you for the retry?",
            f"Locate the exact control labeled {target!r} and read its label before clicking.",
        ),
        "input_changed": (
            "Which smaller action best prepares you for the retry?",
            f"Match the field label to {target!r} before changing its value.",
        ),
        "page_text": (
            "What should happen immediately after the action?",
            f"Pause and verify that the visible page result includes {target!r}.",
        ),
        "interaction_observed": (
            "Which approach makes the retry easiest to verify?",
            "Perform one precise reversible action, then check its visible result.",
        ),
    }
    prompt, correct_text = prompts.get(assertion_kind, prompts["interaction_observed"])
    choices: list[tuple[str, bool]] = [
        (correct_text, True),
        ("Choose a nearby control that looks similar and continue without checking.", False),
        ("Skip the step and move directly to cleanup.", False),
    ]
    rotation = int(hashlib.sha256(recovery_id.encode("utf-8")).hexdigest()[:2], 16) % len(choices)
    choices = choices[rotation:] + choices[:rotation]
    options: list[dict[str, str]] = []
    correct_option_id = ""
    for index, (text, correct) in enumerate(choices, start=1):
        option_id = f"option-{index}"
        options.append({"id": option_id, "text": text})
        if correct:
            correct_option_id = option_id
    return {
        "id": f"practice-{recovery_id}",
        "kind": "multiple_choice",
        "prompt": prompt,
        "options": options,
        "correctOptionId": correct_option_id,
    }


def _mark_retry_failed(
    run: BrowserLabRun,
    recovery: BrowserLabRecovery,
    now: datetime,
) -> None:
    results = _retry_results(run, recovery)
    run.evidence = _set_recovery_event_phase(
        list(run.evidence or []),
        recovery.id,
        "retry_failed",
    )
    recovery.status = "retry_failed"
    recovery.retry_verification = {
        "complete": False,
        "assertions": results,
        "updatedAt": now.isoformat(),
    }
    recovery.final_outcome = {
        "status": "retry_failed",
        "retryVerified": False,
        "failedAt": now.isoformat(),
    }
    recovery.updated_at = now
    recovery.resolved_at = now


def create_recovery(attempt_id: str, user: dict[str, Any]) -> dict[str, Any]:
    owner_user_id = _owner_id(user)
    now = _now()
    with SessionLocal() as db:
        run = _owned_run(db, attempt_id, owner_user_id)
        if run.status == "verified":
            return public_run(run, db)

        latest = db.scalar(
            select(BrowserLabRecovery)
            .where(BrowserLabRecovery.browser_lab_run_id == run.id)
            .order_by(BrowserLabRecovery.sequence.desc())
        )
        if latest is not None and latest.status in {"practicing", "retry_ready"}:
            run.status = "recovering"
            db.commit()
            return public_run(run, db)
        if latest is not None and latest.status == "retrying":
            retry_events = _attempt_events(
                list(run.evidence or []),
                phase="retry",
                after_sequence=int(latest.retry_boundary_sequence or 0),
                recovery_id=latest.id,
            )
            if not retry_events:
                raise HTTPException(
                    status_code=409,
                    detail="Try the original step before checking the retry",
                )
            if _resolve_recovery_if_ready(run, latest, now):
                run.verification = verify_evidence(run.plan_snapshot or {}, list(run.evidence or []))
                run.status = str(run.verification.get("status") or "running")
                db.commit()
                return public_run(run, db)
            _mark_retry_failed(run, latest, now)

        if not _attempt_events(list(run.evidence or []), phase="task"):
            raise HTTPException(
                status_code=409,
                detail="Open the lab and attempt the step before checking it",
            )

        verification = verify_evidence(run.plan_snapshot or {}, list(run.evidence or []))
        run.verification = verification
        if verification.get("taskComplete"):
            run.status = "needs_cleanup"
            run.updated_at = now
            db.commit()
            return public_run(run, db)

        plan = run.plan_snapshot or {}
        step, missing_assertion_ids, target_assertion_ids = _missing_step(plan, verification)
        gap_key, misconception, assertion_kind, assertion_value = _gap_details(
            run,
            step,
            missing_assertion_ids,
        )
        recovery_sequence = int(latest.sequence if latest is not None else 0) + 1
        recovery_id = f"blrec_{secrets.token_urlsafe(18)}"
        recovery = BrowserLabRecovery(
            id=recovery_id,
            browser_lab_run_id=run.id,
            owner_user_id=owner_user_id,
            course_id=run.course_id,
            lesson_id=run.lesson_id,
            platform_id=run.platform_id,
            sequence=recovery_sequence,
            status="practicing",
            failed_step_id=str(step.get("id") or "task-retry")[:128],
            gap_key=gap_key,
            missing_assertion_ids=missing_assertion_ids,
            target_assertion_ids=target_assertion_ids,
            mistake_snapshot={
                "failedStep": step,
                "misconception": misconception,
                "failureVerification": verification,
                "evidenceSummary": _evidence_summary(list(run.evidence or [])),
            },
            micro_lesson=_micro_lesson(step, misconception),
            practice_task=_practice_task(recovery_id, step, assertion_kind, assertion_value),
            practice_attempts=[],
            retry_verification={},
            final_outcome={},
            created_at=now,
            updated_at=now,
        )
        db.add(recovery)
        run.status = "recovering"
        run.updated_at = now
        db.commit()
        db.refresh(run)
        return public_run(run, db)


def record_practice_attempt(
    attempt_id: str,
    recovery_id: str,
    user: dict[str, Any],
    *,
    client_attempt_id: str,
    option_id: str,
) -> dict[str, Any]:
    owner_user_id = _owner_id(user)
    now = _now()
    with SessionLocal() as db:
        run = _owned_run(db, attempt_id, owner_user_id)
        recovery = _owned_recovery(db, run, recovery_id, owner_user_id)
        attempts = list(recovery.practice_attempts or [])
        if any(item.get("clientAttemptId") == client_attempt_id for item in attempts):
            return public_run(run, db)
        if recovery.status != "practicing":
            raise HTTPException(status_code=409, detail="This recovery practice is not accepting answers")
        if len(attempts) >= MAX_PRACTICE_ATTEMPTS:
            raise HTTPException(status_code=409, detail="This recovery practice has reached its attempt limit")

        task = recovery.practice_task or {}
        valid_option_ids = {
            str(item.get("id") or "")
            for item in task.get("options") or []
            if isinstance(item, dict)
        }
        if option_id not in valid_option_ids:
            raise HTTPException(status_code=422, detail="Choose one of the recovery practice options")
        correct = option_id == str(task.get("correctOptionId") or "")
        feedback = (
            "That isolates the missing skill. Return to the original step for a verified retry."
            if correct
            else "That would not produce the required evidence. Use the target label and visible result to choose again."
        )
        attempts.append(
            {
                "clientAttemptId": client_attempt_id,
                "optionId": option_id,
                "correct": correct,
                "feedback": feedback,
                "attemptedAt": now.isoformat(),
            }
        )
        recovery.practice_attempts = attempts
        recovery.status = "retry_ready" if correct else "practicing"
        recovery.updated_at = now
        run.status = "recovering"
        run.updated_at = now
        db.commit()
        db.refresh(run)
        return public_run(run, db)


def start_recovery_retry(
    attempt_id: str,
    recovery_id: str,
    user: dict[str, Any],
) -> dict[str, Any]:
    owner_user_id = _owner_id(user)
    now = _now()
    with SessionLocal() as db:
        run = _owned_run(db, attempt_id, owner_user_id)
        recovery = _owned_recovery(db, run, recovery_id, owner_user_id)
        if recovery.status in {"retrying", "resolved"}:
            return public_run(run, db)
        if recovery.status != "retry_ready":
            raise HTTPException(status_code=409, detail="Complete the recovery practice before retrying")

        events = list(run.evidence or [])
        boundary_sequence = _next_evidence_sequence(events)
        boundary = _control_event(
            kind="recovery_retry_started",
            phase="retry_boundary",
            sequence=boundary_sequence,
            recovery_id=recovery.id,
        )
        run.evidence = _append_evidence(events, boundary)
        recovery.retry_boundary_sequence = boundary_sequence
        recovery.retry_verification = {
            "complete": False,
            "assertions": {
                assertion_id: False
                for assertion_id in recovery.target_assertion_ids or []
            },
            "updatedAt": now.isoformat(),
        }
        recovery.status = "retrying"
        recovery.updated_at = now
        run.status = "running"
        run.updated_at = now
        db.commit()
        db.refresh(run)
        return public_run(run, db)


def adaptive_recovery_summary(db: Any, owner_user_id: int) -> dict[str, Any]:
    """Return bounded, server-derived recovery signals for adaptive teaching."""

    rows = list(
        db.scalars(
            select(BrowserLabRecovery)
            .where(BrowserLabRecovery.owner_user_id == owner_user_id)
            .order_by(BrowserLabRecovery.updated_at.desc())
        )
    )
    aggregates: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = str(row.gap_key or "general")[:255]
        item = aggregates.get(key)
        if item is None:
            misconception = (row.mistake_snapshot or {}).get("misconception") or {}
            item = {
                "key": key,
                "title": str(misconception.get("title") or "Browser workflow practice")[:180],
                "platformId": row.platform_id,
                "occurrences": 0,
                "resolved": 0,
                "retryFailed": 0,
                "lastOutcome": row.status,
                "lastObservedAt": row.updated_at.isoformat() if row.updated_at else None,
            }
            aggregates[key] = item
        item["occurrences"] += 1
        if row.status == "resolved":
            item["resolved"] += 1
        elif row.status == "retry_failed":
            item["retryFailed"] += 1

    return {
        "version": 1,
        "gaps": list(aggregates.values())[:8],
        "recoveries": {
            "total": len(rows),
            "resolved": sum(row.status == "resolved" for row in rows),
            "retryFailed": sum(row.status == "retry_failed" for row in rows),
        },
    }
