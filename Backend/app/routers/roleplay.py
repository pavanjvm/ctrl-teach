"""Authenticated Tavus Echo conversation lifecycle for Role Playing."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user
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


class TavusSession(BaseModel):
    conversation_id: str
    conversation_url: str
    meeting_token: str


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


async def _echo_pal_id(client: httpx.AsyncClient, face_id: str) -> str:
    """Return the configured Echo PAL or lazily create one per process."""

    global _cached_pal_id
    configured = settings.tavus_pal_id.strip() or settings.tavus_persona_id.strip()
    if configured:
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


@router.post("/sessions", response_model=TavusSession)
async def start_roleplay_session(
    request: StartRoleplayRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> TavusSession:
    """Create a private Tavus room without exposing the account API key."""

    face_id = _configured_face_id()
    if not settings.tavus_api_key.strip() or not face_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Tavus is not configured. Add TAVUS_API_KEY and "
                "TAVUS_FACE_ID to Backend/.env."
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

    return TavusSession(
        conversation_id=conversation_id,
        conversation_url=conversation_url,
        meeting_token=meeting_token,
    )


@router.delete("/sessions/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def end_roleplay_session(
    conversation_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> None:
    """End an owned Tavus conversation so billed minutes stop promptly."""

    async with _conversation_lock:
        owner = _active_conversations.get(conversation_id)
    if owner != str(current_user["uid"]):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Roleplay session not found.")

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
