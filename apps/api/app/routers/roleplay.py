"""Authenticated Tavus Echo conversation lifecycle for Role Playing."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Form, HTTPException, status
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user
from app.auth.session_tokens import verify_app_session_token
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/roleplay", tags=["roleplay"])

_TAVUS_BASE_URL = "https://tavusapi.com/v2"
_pal_lock = asyncio.Lock()
_cached_pal_id: str | None = None
_active_conversations: dict[str, str] = {}
_conversation_lock = asyncio.Lock()


class StartRoleplayRequest(BaseModel):
    conversation_name: str = Field(default="Ctrl+Teach Roleplay", max_length=120)
    face_id: str = Field(default="", max_length=80)


class TavusFace(BaseModel):
    face_id: str
    face_name: str
    thumbnail_video_url: str = ""
    face_type: str = ""
    model_name: str = ""
    is_default: bool = False


class TavusFaceList(BaseModel):
    faces: list[TavusFace]


class RoleplayClientEvent(BaseModel):
    stage: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_.-]+$")
    detail: str = Field(default="", max_length=240)
    participant_count: int = Field(default=0, ge=0, le=50)


class TavusSession(BaseModel):
    conversation_id: str
    conversation_url: str
    meeting_token: str


class TavusSessionStatus(BaseModel):
    status: str
    actor_ready: bool
    shutdown_reason: str = ""


def _headers() -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "x-api-key": settings.tavus_api_key,
    }


def _tavus_error(response: httpx.Response, fallback: str) -> HTTPException:
    message = fallback
    try:
        payload = response.json()
        detail = payload.get("message") or payload.get("detail") or payload.get("error")
        if isinstance(detail, str) and detail.strip():
            message = detail.strip()[:240]
    except Exception:
        pass
    logger.warning("Tavus request failed status=%s detail=%s", response.status_code, message)
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=message)


def _configured_face_id() -> str:
    """Prefer Tavus's current Face setting while accepting its legacy alias."""

    return settings.tavus_face_id.strip() or settings.tavus_replica_id.strip()


def _conversation_safety_properties() -> dict[str, int]:
    """Bound Tavus room lifetime so abandoned sessions cannot drain credits."""

    return {
        "max_call_duration": max(60, min(settings.tavus_max_call_duration_seconds, 3600)),
        "participant_left_timeout": max(
            1, min(settings.tavus_participant_left_timeout_seconds, 60)
        ),
        "participant_absent_timeout": max(
            10, min(settings.tavus_participant_absent_timeout_seconds, 300)
        ),
    }


def _parse_tavus_faces(payload: Any) -> list[TavusFace]:
    """Normalize Tavus's face catalogue to the fields needed by the picker."""

    raw_faces = payload.get("data", []) if isinstance(payload, dict) else []
    if not isinstance(raw_faces, list):
        raw_faces = []

    default_face_id = _configured_face_id()
    faces_by_id: dict[str, TavusFace] = {}
    for raw_face in raw_faces:
        if not isinstance(raw_face, dict):
            continue
        face_id = str(raw_face.get("face_id") or raw_face.get("replica_id") or "").strip()
        face_status = str(raw_face.get("status") or "").strip().lower()
        if not face_id or face_status not in {"", "active", "completed", "ready"}:
            continue
        face_name = str(raw_face.get("face_name") or raw_face.get("replica_name") or "").strip()
        faces_by_id[face_id] = TavusFace(
            face_id=face_id,
            face_name=face_name or "Tavus face",
            thumbnail_video_url=str(raw_face.get("thumbnail_video_url") or "").strip(),
            face_type=str(raw_face.get("face_type") or "").strip(),
            model_name=str(raw_face.get("model_name") or "").strip(),
            is_default=face_id == default_face_id,
        )

    if default_face_id and default_face_id not in faces_by_id:
        faces_by_id[default_face_id] = TavusFace(
            face_id=default_face_id,
            face_name="Default Tavus face",
            is_default=True,
        )

    return sorted(
        faces_by_id.values(),
        key=lambda face: (not face.is_default, face.face_name.casefold(), face.face_id),
    )


def _parse_conversation_status(payload: Any) -> TavusSessionStatus:
    if not isinstance(payload, dict):
        return TavusSessionStatus(status="unknown", actor_ready=False)

    actor_ready = False
    shutdown_reason = str(payload.get("shutdown_reason") or "").strip()
    events = payload.get("events")
    if isinstance(events, list):
        for event in events:
            if not isinstance(event, dict):
                continue
            event_type = str(event.get("event_type") or "").strip()
            if event_type in {"system.pal_joined", "system.replica_joined"}:
                actor_ready = True
            if event_type == "system.shutdown" and not shutdown_reason:
                properties = event.get("properties")
                if isinstance(properties, dict):
                    shutdown_reason = str(
                        properties.get("shutdown_reason") or properties.get("reason") or ""
                    ).strip()

    return TavusSessionStatus(
        status=str(payload.get("status") or "unknown").strip().lower(),
        actor_ready=actor_ready,
        shutdown_reason=shutdown_reason[:240],
    )


async def _echo_pal_id(client: httpx.AsyncClient, face_id: str) -> str:
    """Return the configured Echo PAL or lazily create one per process."""

    global _cached_pal_id
    configured = settings.tavus_pal_id.strip() or settings.tavus_persona_id.strip()
    if configured:
        logger.info("Using configured Tavus Echo PAL pal_id=%s", configured)
        return configured
    if _cached_pal_id:
        return _cached_pal_id

    async with _pal_lock:
        if _cached_pal_id:
            return _cached_pal_id
        response = await client.post(
            f"{_TAVUS_BASE_URL}/pals",
            headers=_headers(),
            json={
                "pal_name": "Ctrl+Teach Tars Face",
                "pipeline_mode": "echo",
                "default_face_id": face_id,
            },
        )
        if response.is_error:
            raise _tavus_error(response, "Tavus could not create the Echo PAL.")
        pal_id = str(response.json().get("pal_id") or response.json().get("persona_id") or "").strip()
        if not pal_id:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Tavus created a PAL but returned no PAL ID.",
            )
        _cached_pal_id = pal_id
        return pal_id


@router.get("/faces", response_model=TavusFaceList)
async def list_roleplay_faces(
    _current_user: dict[str, Any] = Depends(get_current_user),
) -> TavusFaceList:
    """Return ready Tavus faces without exposing the account API key."""

    if not settings.tavus_api_key.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Tavus is not configured. Add TAVUS_API_KEY to apps/api/.env.",
        )

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            raw_faces: list[Any] = []
            page = 1
            while True:
                response = await client.get(
                    f"{_TAVUS_BASE_URL}/faces",
                    headers=_headers(),
                    params={"limit": 100, "page": page, "verbose": True},
                )
                if response.is_error:
                    raise _tavus_error(response, "Tavus could not load the available faces.")
                payload = response.json()
                page_faces = payload.get("data", []) if isinstance(payload, dict) else []
                if not isinstance(page_faces, list):
                    page_faces = []
                raw_faces.extend(page_faces)
                total_count = payload.get("total_count") if isinstance(payload, dict) else None
                if not isinstance(total_count, int) or len(raw_faces) >= total_count or not page_faces:
                    break
                page += 1
    except httpx.HTTPError as exc:
        logger.warning("Tavus unavailable while listing faces: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Tavus faces are temporarily unavailable. Please try again.",
        ) from exc

    faces = _parse_tavus_faces({"data": raw_faces})
    logger.info("Tavus roleplay faces loaded count=%s", len(faces))
    return TavusFaceList(faces=faces)


@router.post("/sessions", response_model=TavusSession)
async def start_roleplay_session(
    request: StartRoleplayRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> TavusSession:
    """Create a private Tavus room without exposing the account API key."""

    face_id = request.face_id.strip() or _configured_face_id()
    if not settings.tavus_api_key.strip() or not face_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Choose a Tavus face before starting the roleplay. "
                "TAVUS_FACE_ID may also be set as a backend default."
            ),
        )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            pal_id = await _echo_pal_id(client, face_id)
            response = await client.post(
                f"{_TAVUS_BASE_URL}/conversations",
                headers=_headers(),
                json={
                    "conversation_name": request.conversation_name.strip() or "Ctrl+Teach Roleplay",
                    "pal_id": pal_id,
                    "face_id": face_id,
                    "require_auth": True,
                    "max_participants": 2,
                    "properties": _conversation_safety_properties(),
                },
            )
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        logger.warning("Tavus unavailable while starting roleplay: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Tavus is temporarily unavailable. Please try again.",
        ) from exc

    if response.is_error:
        raise _tavus_error(response, "Tavus could not start the face session.")

    payload = response.json()
    conversation_id = str(payload.get("conversation_id") or "").strip()
    conversation_url = str(payload.get("conversation_url") or "").strip()
    meeting_token = str(payload.get("meeting_token") or "").strip()
    if not conversation_id or not conversation_url or not meeting_token:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Tavus returned an incomplete private conversation.",
        )

    async with _conversation_lock:
        _active_conversations[conversation_id] = str(current_user["uid"])

    logger.info(
        "Tavus roleplay room created conversation_id=%s user_id=%s face_id=%s pal_id=%s",
        conversation_id,
        current_user["uid"],
        face_id,
        pal_id,
    )

    return TavusSession(
        conversation_id=conversation_id,
        conversation_url=conversation_url,
        meeting_token=meeting_token,
    )


@router.get("/sessions/{conversation_id}", response_model=TavusSessionStatus)
async def get_roleplay_session_status(
    conversation_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> TavusSessionStatus:
    """Read Tavus's canonical conversation events as a join-event fallback."""

    async with _conversation_lock:
        owner = _active_conversations.get(conversation_id)
    if owner != str(current_user["uid"]):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Roleplay session not found.")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{_TAVUS_BASE_URL}/conversations/{conversation_id}",
                headers=_headers(),
                params={"verbose": True},
            )
    except httpx.HTTPError as exc:
        logger.warning("Tavus status unavailable for roleplay %s: %s", conversation_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Tavus session status is temporarily unavailable.",
        ) from exc

    if response.is_error:
        raise _tavus_error(response, "Tavus could not read the face session status.")
    session_status = _parse_conversation_status(response.json())
    logger.info(
        "Tavus roleplay server status conversation_id=%s user_id=%s status=%s actor_ready=%s shutdown_reason=%s",
        conversation_id,
        current_user["uid"],
        session_status.status,
        session_status.actor_ready,
        session_status.shutdown_reason or "-",
    )
    return session_status


@router.post("/sessions/{conversation_id}/events", status_code=status.HTTP_204_NO_CONTENT)
async def log_roleplay_client_event(
    conversation_id: str,
    request: RoleplayClientEvent,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> None:
    """Record safe client-side room lifecycle diagnostics in backend logs."""

    async with _conversation_lock:
        owner = _active_conversations.get(conversation_id)
    if owner != str(current_user["uid"]):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Roleplay session not found.")

    detail = " ".join(request.detail.split())
    logger.info(
        "Tavus roleplay client event conversation_id=%s user_id=%s stage=%s participants=%s detail=%s",
        conversation_id,
        current_user["uid"],
        request.stage,
        request.participant_count,
        detail or "-",
    )


async def _end_owned_conversation(conversation_id: str, user_id: str) -> None:
    async with _conversation_lock:
        owner = _active_conversations.get(conversation_id)
    if owner != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Roleplay session not found.")

    logger.info("Ending Tavus roleplay room conversation_id=%s user_id=%s", conversation_id, user_id)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{_TAVUS_BASE_URL}/conversations/{conversation_id}/end",
                headers=_headers(),
            )
        if response.is_error and response.status_code != status.HTTP_404_NOT_FOUND:
            raise _tavus_error(response, "Tavus could not end the face session.")
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        logger.warning("Tavus unavailable while ending roleplay %s: %s", conversation_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The roleplay room could not be closed cleanly.",
        ) from exc
    finally:
        async with _conversation_lock:
            _active_conversations.pop(conversation_id, None)
        logger.info("Tavus roleplay room closed conversation_id=%s", conversation_id)


@router.delete("/sessions/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def end_roleplay_session(
    conversation_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> None:
    """End an owned Tavus conversation so billed minutes stop promptly."""

    await _end_owned_conversation(conversation_id, str(current_user["uid"]))


@router.post(
    "/sessions/{conversation_id}/end-beacon",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def end_roleplay_session_beacon(
    conversation_id: str,
    token: str = Form(min_length=1, max_length=4096),
) -> None:
    """End a room from pagehide without an unload-time CORS preflight."""

    current_user = verify_app_session_token(token)
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication",
        )
    await _end_owned_conversation(conversation_id, str(current_user["uid"]))
