"""Global Clicky assistant endpoint for browser-tab screenshots."""

from __future__ import annotations

import base64
import json
import logging
import time
from typing import Any, List, Optional

from fastapi import APIRouter, Depends
from openai import OpenAI
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.auth.extension_tokens import create_clicky_extension_token
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/clicky", tags=["clicky"])
MAX_CLICKY_HISTORY_TURNS = 2


class ClickyRequest(BaseModel):
    clientRequestId: Optional[str] = None
    conversationId: Optional[str] = None
    prompt: str
    image: str
    mimeType: str = "image/jpeg"
    width: int
    height: int
    elements: List[dict[str, Any]] = []
    history: List[dict[str, str]] = []
    includeAudio: bool = True


class ClickySpeakRequest(BaseModel):
    clientRequestId: Optional[str] = None
    text: str


class ClickyPoint(BaseModel):
    x: float
    y: float
    label: str = "right here"


class ClickyResponse(BaseModel):
    answer: str
    targetId: Optional[str] = None
    point: Optional[ClickyPoint] = None
    action: str = "none"
    audio_b64: Optional[str] = None
    audio_mime: Optional[str] = None


class ClickyExtensionSession(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    expires_at: int


SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "answer": {"type": "string", "minLength": 8},
        "targetId": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "action": {"enum": ["none", "click"]},
        "point": {
            "anyOf": [
                {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "x": {"type": "number"},
                        "y": {"type": "number"},
                        "label": {"type": "string"},
                    },
                    "required": ["x", "y", "label"],
                },
                {"type": "null"},
            ]
        },
    },
    "required": ["answer", "targetId", "action", "point"],
}


def _client() -> OpenAI:
    return OpenAI(api_key=settings.openai_api_key)


def _normalize_clicky_json(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        return {}
    # Some models occasionally return a schema-shaped wrapper with the actual
    # values under "properties". Treat that as the response instead of falling
    # back to a generic answer.
    props = data.get("properties")
    if data.get("type") == "object" and isinstance(props, dict) and "answer" in props:
        return props
    return data


@router.post("/extension-session", response_model=ClickyExtensionSession)
async def create_extension_session(user: dict = Depends(get_current_user)):
    """Exchange the app's Basic login for a Clicky-only expiring token."""
    token, expires_at = create_clicky_extension_token(user)
    return ClickyExtensionSession(
        access_token=token,
        user_id=str(user["uid"]),
        expires_at=expires_at,
    )


async def _speak(answer: str, request_id: str = "unknown") -> str:
    """Generate Clicky's spoken audio via OpenAI TTS (fast single HTTP call).

    Returns base64-encoded 24kHz PCM16 mono audio, matching what the frontend
    playPcm16Audio helper expects. Replaces the previous Realtime WebSocket
    approach which added 2-5s of handshake overhead per response.
    """
    if not answer.strip() or not settings.openai_api_key:
        return ""
    tts_start = time.perf_counter()
    logger.info("clicky tts start request_id=%s answer=%r", request_id, answer[:160])
    try:
        response = _client().audio.speech.create(
            model="tts-1",
            voice=settings.realtime_voice,
            input=answer,
            response_format="pcm",
        )
        audio = response.read()
        logger.info(
            "clicky tts done request_id=%s bytes=%s tts_ms=%s",
            request_id,
            len(audio),
            int((time.perf_counter() - tts_start) * 1000),
        )
        return base64.b64encode(audio).decode("ascii") if audio else ""
    except Exception as exc:
        logger.warning("clicky tts failed request_id=%s error=%s", request_id, exc)
        return ""


@router.post("")
async def ask_clicky(req: ClickyRequest, _user: dict = Depends(get_current_user)):
    if not settings.openai_api_key:
        return ClickyResponse(answer="Clicky needs an OpenAI API key to see this page.", point=None)

    request_id = req.clientRequestId or "unknown"
    total_start = time.perf_counter()
    prompt = req.prompt.strip() or "Help me with what is on this screen."
    logger.info(
        "clicky request start request_id=%s conversation_id=%s prompt=%r elements=%s image=%sx%s history=%s include_audio=%s",
        request_id,
        req.conversationId or "none",
        prompt,
        len(req.elements),
        req.width,
        req.height,
        len(req.history),
        req.includeAudio,
    )
    data_url = f"data:{req.mimeType};base64,{req.image}"
    dom_inventory = json.dumps(req.elements[:120], ensure_ascii=False)[:16000]
    system = (
        "You are Clicky, a concise browser-tab assistant. You see a screenshot of the current app tab. "
        "Your name is Clicky, but users often address you as 'chat' or 'hey chat' (e.g. 'hey chat, click that button'). "
        "When a user greets you with 'chat' or 'hey chat', treat it as addressing you and respond as Clicky. "
        "You also receive a DOM inventory of visible page elements with exact viewport rects. "
        "For pointing accuracy, ALWAYS prefer returning targetId from the DOM inventory when a relevant element exists. "
        "Only use point as a fallback for things visible in the screenshot but not represented in the DOM inventory. "
        "You may set action='click' only when the user clearly asks you to click, press, open, select, choose, or start something, "
        "and only when targetId refers to a DOM element whose actionable field is true. Otherwise set action='none'. "
        "Answer briefly but specifically to the user's request. The answer must be non-empty and must never be a generic filler like 'I can help with that.' "
        "If the request is unclear, ask one short clarifying question. If pointing would help, return either targetId OR a point. "
        "Never mention target IDs, pixel positions, x/y values, coordinates, or JSON in the answer; those are internal control fields only. "
        "If pointing, say a natural phrase like 'this button' or 'right here' instead of giving numbers. "
        "Coordinate space for point is exactly the provided image: "
        f"width={req.width}, height={req.height}, origin top-left, x right, y down. "
        "If targetId is used, set point to null. If no pointing helps, set both targetId and point to null."
    )
    try:
        history_messages: list[dict[str, str]] = []
        for turn in req.history[-MAX_CLICKY_HISTORY_TURNS:]:
            user_text = str(turn.get("user") or "").strip()
            assistant_text = str(turn.get("assistant") or "").strip()
            if user_text:
                history_messages.append({"role": "user", "content": user_text[:1200]})
            if assistant_text:
                history_messages.append({"role": "assistant", "content": assistant_text[:1200]})

        model_start = time.perf_counter()
        resp = _client().chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                *history_messages,
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": f"User request: {prompt}\n\nVisible DOM inventory JSON:\n{dom_inventory}"},
                        {"type": "image_url", "image_url": {"url": data_url, "detail": "low"}},
                    ],
                },
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "clicky", "strict": True, "schema": SCHEMA},
            },
            temperature=0.3,
        )
        model_ms = int((time.perf_counter() - model_start) * 1000)
        raw_content = resp.choices[0].message.content or "{}"
        logger.info("clicky model raw request_id=%s model_ms=%s content=%s", request_id, model_ms, raw_content[:1000])
        data = _normalize_clicky_json(json.loads(raw_content))
        target_id = data.get("targetId")
        valid_ids = {str(el.get("id")) for el in req.elements if el.get("id")}
        actionable_ids = {str(el.get("id")) for el in req.elements if el.get("id") and el.get("actionable")}
        if target_id is not None and str(target_id) not in valid_ids:
            target_id = None
        action = data.get("action") if data.get("action") in {"none", "click"} else "none"
        if action == "click" and (not target_id or str(target_id) not in actionable_ids):
            action = "none"
        point = data.get("point")
        if point:
            point["x"] = max(0, min(float(point.get("x", 0)), req.width))
            point["y"] = max(0, min(float(point.get("y", 0)), req.height))
        if target_id:
            point = None
        answer = str(data.get("answer") or "").strip()
        if not answer or answer.lower() in {"i can help with that.", "i can help with that"}:
            logger.warning("clicky model returned generic/empty answer: prompt=%r data=%r", prompt, data)
            answer = "I did not catch the actual request. Say it again after the wake word."
        logger.info(
            "clicky model parsed request_id=%s answer=%r target_id=%s action=%s point=%s",
            request_id,
            answer[:200],
            target_id,
            action,
            bool(point),
        )
        audio_b64 = ""
        tts_ms = 0
        if req.includeAudio:
            tts_start = time.perf_counter()
            audio_b64 = await _speak(answer, request_id)
            tts_ms = int((time.perf_counter() - tts_start) * 1000)
        total_ms = int((time.perf_counter() - total_start) * 1000)
        logger.info(
            "clicky response done request_id=%s model_ms=%s tts_ms=%s total_ms=%s audio_b64_len=%s",
            request_id,
            model_ms,
            tts_ms,
            total_ms,
            len(audio_b64 or ""),
        )
        return {
            "answer": answer,
            "targetId": target_id,
            "action": action,
            "point": point,
            "audio_b64": audio_b64 or None,
            "audio_mime": "audio/pcm;rate=24000" if audio_b64 else None,
        }
    except Exception as exc:
        logger.warning("clicky endpoint failed: %s", exc, exc_info=True)
        return ClickyResponse(answer="I had trouble seeing the page just now. Try again.", point=None)


@router.post("/speak")
async def speak_clicky(req: ClickySpeakRequest, _user: dict = Depends(get_current_user)):
    request_id = req.clientRequestId or "unknown"
    text = req.text.strip()
    if not text:
        return {"audio_b64": None, "audio_mime": None}
    audio_b64 = await _speak(text, request_id)
    return {
        "audio_b64": audio_b64 or None,
        "audio_mime": "audio/pcm;rate=24000" if audio_b64 else None,
    }
