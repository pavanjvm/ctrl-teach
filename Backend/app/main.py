"""FastAPI application with a WebSocket endpoint bridging the browser to the
OpenAI Realtime API (gpt-realtime-2) via the OpenAI Agents SDK realtime layer.

Architecture (migrated from Google ADK / Gemini Live):
- Per-connection RealtimeRunner + RealtimeSession (server-side WebSocket).
- upstream_task: browser WebSocket  →  RealtimeSession
    * binary PCM @ 16 kHz  → resampled to 24 kHz  → session.send_audio()
    * text / image / canvas JSON  → session.send_message()
- downstream_task: RealtimeSession events  →  browser WebSocket
    * Translates SDK events (audio, tool_start, tool_end, raw transcripts,
      interruptions, errors) into the SAME ADK-shaped JSON envelopes the
      frontend already consumes, so no frontend protocol change is required.
    * Preserves the Canvas Bridge / Early Canvas Push innovations.
- asyncio with a long-lived upstream task + a downstream retry loop that
  recreates a fresh RealtimeSession on transient errors.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from dotenv import load_dotenv

# Load .env BEFORE importing modules that read env vars at import time.
load_dotenv()

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

try:
    # tracing is noisy and not needed in this deployment
    from agents import set_tracing_disabled  # type: ignore[attr-defined]
except Exception:  # pragma: no cover
    def set_tracing_disabled(_v: bool) -> None:  # type: ignore[misc]
        pass

from agents.realtime import RealtimeAgent, RealtimeRunner
from agents.realtime.model_inputs import RealtimeModelSendInterrupt, RealtimeModelSendRawMessage
from agents.realtime.openai_realtime import OpenAIRealtimeWebSocketModel

from app.agents.tutor_agent import build_tutor_agent
from app.agents.prompt_builder import build_tutor_instruction
from app.agents.clicky_agent import build_clicky_agent
from app.auth.dependencies import verify_basic_credentials
from app.auth.extension_tokens import verify_clicky_extension_token
from app.config import settings
from sqlalchemy import select

from app.db import SessionLocal, SessionRow, Tutor, User
from app.routers import auth_router, users, dashboard, schedule, tutors
from app.routers import discover as discover_router
from app.routers import clicky as clicky_router
from app.utils.errors import (
    ErrorCategory,
    ErrorPayload,
    ErrorSeverity,
    classify_api_error,
)
from app.utils.logging_config import setup_logging
from app.utils.ws_signals import set_ws_notify, ws_notify

logger = logging.getLogger(__name__)

# ── Globals initialised at startup ────────────────────────────────────────────
default_root_agent: Optional[RealtimeAgent] = None


# ── Audio helpers ─────────────────────────────────────────────────────────────

_INPUT_RATE = 16_000
_OUTPUT_RATE = 24_000


def _resample_pcm16(data: bytes, src_rate: int, dst_rate: int) -> bytes:
    """Resample mono 16-bit PCM from src_rate to dst_rate (linear interpolation)."""
    if not data or src_rate == dst_rate:
        return data
    try:
        arr = np.frombuffer(data, dtype=np.int16).astype(np.float32)
    except ValueError:
        return data
    n = len(arr)
    if n == 0:
        return data
    new_n = max(1, int(round(n * dst_rate / src_rate)))
    idx = np.linspace(0, n - 1, new_n)
    resampled = np.interp(idx, np.arange(n), arr).astype(np.int16)
    return resampled.tobytes()


def _to_base64(value: Any) -> str:
    """Normalise an audio chunk (bytes or base64 str) to a base64 string.

    Handles the various shapes the OpenAI Realtime SDK may expose:
    raw bytes, a base64 string, or a model-audio event object exposing
    ``.delta`` / ``.data`` attributes.
    """
    if value is None:
        return ""
    if isinstance(value, (bytes, bytearray, memoryview)):
        return base64.b64encode(bytes(value)).decode("ascii")
    if isinstance(value, str):
        return value
    # Object wrappers: try .delta (response.audio.delta) then .data
    for attr in ("delta", "data", "audio"):
        inner = getattr(value, attr, None)
        if inner is not None:
            return _to_base64(inner)
    return ""


# ── Lifespan ──────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Initialise the default realtime agent tree once at startup."""
    global default_root_agent
    setup_logging(settings.log_level)
    set_tracing_disabled(True)
    logger.info("Initialising Magic Whiteboard Tutor backend (OpenAI Realtime API)…")

    # Ensure SQLite tables exist (idempotent — also runs at db import time).
    from app.db import init_db
    init_db()

    # Ensure local uploads directory exists for storage_tools.
    import os
    os.makedirs(settings.uploads_dir, exist_ok=True)

    default_root_agent = build_tutor_agent()
    logger.info("Default realtime agent ready (agent=%s)", default_root_agent.name)

    yield  # ← app is running

    logger.info("Shutting down Magic Whiteboard Tutor backend.")


# ── FastAPI App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="Magic Whiteboard Tutor",
    version="0.2.0",
    lifespan=lifespan,
)

app.include_router(users.router)
app.include_router(auth_router.router)
app.include_router(dashboard.router)
app.include_router(schedule.router)
app.include_router(tutors.router)
app.include_router(discover_router.router)
app.include_router(clicky_router.router)

# Serve locally-saved canvas snapshots / generated images at /uploads/*
import os as _os
_os.makedirs(settings.uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.uploads_dir), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health-check ──────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "magic-whiteboard-tutor", "backend": "openai-realtime"}


# ── Realtime session config ───────────────────────────────────────────────────


def _build_runner(agent: RealtimeAgent, voice: str) -> RealtimeRunner:
    """Build a RealtimeRunner configured for low-latency bidi voice."""
    # Clicky is explicitly push-to-talk and commits on Ctrl release. Disabling
    # server VAD prevents it from creating/committing a turn while the browser
    # is still capturing the screen context that belongs to that same turn.
    turn_detection = None if agent.name == "clicky_agent" else {
        "type": "semantic_vad",
        "interrupt_response": True,
    }
    model_settings = {
        "model_name": settings.realtime_model,
        "audio": {
            "input": {
                "format": "pcm16",
                "transcription": {"model": settings.transcription_model},
                "turn_detection": turn_detection,
            },
            "output": {
                "format": "pcm16",
                "voice": voice or settings.realtime_voice,
                "transcription": {"model": settings.transcription_model},
            },
        },
        "tool_choice": "auto",
    }
    # Custom model with a longer WS handshake timeout (default 10s is too
    # short for high-latency links to OpenAI; raises "timed out during
    # opening handshake" on flaky connections).
    model = OpenAIRealtimeWebSocketModel(
        transport_config={"handshake_timeout": 30.0}
    )
    return RealtimeRunner(
        starting_agent=agent,
        model=model,
        config={"model_settings": model_settings},
    )


def _model_config() -> Dict[str, Any]:
    cfg: Dict[str, Any] = {}
    if settings.openai_api_key:
        cfg["api_key"] = settings.openai_api_key
    return cfg


# ── WebSocket Endpoint ────────────────────────────────────────────────────────


@app.websocket("/ws/{user_id}/{session_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, session_id: str):
    """Bidirectional realtime streaming session.

    Browser protocol (unchanged from the Gemini Live version):
    - Binary frame → raw 16-bit PCM @ 16 kHz (resampled to 24 kHz upstream)
    - JSON {"type":"text","text":"..."}
    - JSON {"type":"interrupt"} (cancel the active response before a text turn)
    - JSON {"type":"image","data":"<base64>","mimeType":"image/jpeg"}
    - JSON {"type":"canvas","data":"<base64>","mimeType":"image/jpeg"}
    - JSON {"type":"canvas_elements","elements":[...]}
    - JSON {"type":"activity_start"|"activity_end"}
    - JSON {"type":"stop"}

    Server → client emits ADK-shaped JSON envelopes:
    - {"content":{"parts":[{"inlineData":{"mimeType":"audio/pcm;rate=24000","data":...}}]}}  (audio)
    - {"content":{"parts":[{"functionResponse":{"name":...,"response":{...}}}]}}            (canvas/image)
    - {"outputTranscription":{"text":...,"finished":bool},"author":...}                   (assistant transcript)
    - {"inputTranscription":{"text":...,"finished":bool}}                                  (user transcript)
    - {"turnComplete":true} / {"interrupted":true}
    - {"type":"generating_image","status":"..."} / {"type":"saving_progress",...}
    - {"type":"error",...}
    """
    # ── Basic / scoped extension auth (manual) ────────────────────────────
    # The frontend sends an HTTP ``Authorization: Basic <base64>`` header,
    # which the browser forwards as a WS subprotocol / query param.  We accept
    # it via either the ``token`` query param (raw "Basic <b64>") or the
    # ``auth`` sec-websocket-protocol header — kept simple here.
    agent_kind = websocket.query_params.get("agent") or "tutor"
    token = websocket.query_params.get("token")
    protocol_header = websocket.headers.get("sec-websocket-protocol") or ""
    extension_protocol_prefix = "ctrlteach-clicky-auth."
    selected_protocol: Optional[str] = None
    extension_protocol_token: Optional[str] = None
    if protocol_header.startswith(extension_protocol_prefix) and "," not in protocol_header:
        selected_protocol = protocol_header
        extension_protocol_token = protocol_header[len(extension_protocol_prefix):]
    authz = (
        f"Bearer {extension_protocol_token}"
        if extension_protocol_token
        else websocket.headers.get("authorization") or websocket.query_params.get("auth") or token
    )
    if authz and (authz.lower().startswith("bearer ") or authz.startswith("ctc1.")):
        user_info = verify_clicky_extension_token(authz) if agent_kind == "clicky" else None
    else:
        user_info = verify_basic_credentials(authz)
    await websocket.accept(subprotocol=selected_protocol)
    if user_info is None or str(user_info["uid"]) != str(user_id):
        logger.warning("WS connection rejected: bad credentials for user %s", user_id)
        await websocket.close(code=1008, reason="Invalid authentication")
        return

    logger.info("WS connected: user=%s session=%s", user_id, session_id)

    # ── Agent selection: ?agent=tutor (default) | clicky ────────────────────
    # ── Per-tutor personalisation (SQLite) — TUTOR ONLY ───────────────────
    tutor_id = websocket.query_params.get("tutor_id")
    tutor_voice: str = settings.realtime_voice
    root_agent: Optional[RealtimeAgent] = default_root_agent

    if agent_kind == "clicky":
        # Clicky owns its own agent tree and never depends on tutor config.
        root_agent = build_clicky_agent()
        tutor_voice = settings.realtime_voice
        logger.info("Clicky agent selected for user=%s session=%s", user_id, session_id)

    elif tutor_id:
        try:
            with SessionLocal() as db:
                _tutor_row = db.get(Tutor, tutor_id)
            if _tutor_row is not None and str(_tutor_row.user_id) == str(user_id):
                _tutor_config = {
                    "name": _tutor_row.name,
                    "title": _tutor_row.title,
                    "desc": _tutor_row.desc,
                    "subjects": _tutor_row.subjects or [],
                    "personality": _tutor_row.personality,
                    "level": _tutor_row.level,
                    "voice": _tutor_row.voice,
                    "styles": _tutor_row.styles or [],
                }
                logger.info(
                    "Tutor config loaded: name=%s subjects=%s personality=%s voice=%s",
                    _tutor_config["name"], _tutor_config["subjects"],
                    _tutor_config["personality"], _tutor_config["voice"],
                )
                dynamic_instruction = build_tutor_instruction(_tutor_config)
                tutor_voice = _tutor_config.get("voice") or settings.realtime_voice
                root_agent = build_tutor_agent(custom_instruction=dynamic_instruction)
                logger.info(
                    "Per-tutor agent built: tutor=%s voice=%s",
                    _tutor_config.get("name"), tutor_voice,
                )
            else:
                logger.warning("Tutor doc not found: %s/%s", user_id, tutor_id)
        except Exception as _tutor_err:
            logger.warning("Failed to load tutor config: %s", _tutor_err)

    if root_agent is None:
        logger.error("No root agent available — aborting session")
        await websocket.close(code=1011, reason="Agent unavailable")
        return

    # ── Persist session start to SQLite — TUTOR ONLY ───────────────────────
    session_start_time = datetime.now(timezone.utc)
    if agent_kind != "clicky":
        try:
            with SessionLocal() as db:
                existing = db.scalar(
                    select(SessionRow).where(
                        SessionRow.user_id == int(user_id), SessionRow.session_id == session_id
                    )
                )
                if existing is None:
                    db.add(SessionRow(
                        user_id=int(user_id),
                        session_id=session_id,
                        created_at=session_start_time,
                        status="active",
                        topic="General Tutoring",
                        subject="",
                        duration_minutes=0.0,
                        tutor_id=tutor_id,
                    ))
                    db.commit()
                    logger.info("Session row created: user=%s session=%s", user_id, session_id)
        except Exception as _db_exc:
            logger.warning("Failed to save session start: %s", _db_exc)

    # ── Per-WS contextvars for tools ────────────────────────────────────────
    from app.mcp.calendar_mcp import current_session_id as _cal_sid_ctx
    from app.mcp.calendar_mcp import current_user_id as _cal_user_ctx
    from app.mcp.calendar_mcp import current_user_timezone as _cal_tz_ctx

    _cal_user_ctx.set(str(user_id))
    _cal_sid_ctx.set(session_id)
    try:
        with SessionLocal() as db:
            _u = db.get(User, int(user_id))
            if _u is not None and _u.timezone:
                _cal_tz_ctx.set(_u.timezone)
                logger.info("User timezone set to: %s", _u.timezone)
    except Exception as _tz_err:
        logger.warning("Could not load user timezone: %s", _tz_err)

    _notify_token = set_ws_notify(
        lambda data: asyncio.ensure_future(_send_json(websocket, data))
    )

    # ── Canvas early-push helpers ───────────────────────────────────────────
    _CANVAS_TOOL_NAMES = {
        "draw_on_canvas", "write_text_on_canvas", "draw_diagram",
        "highlight_area", "clear_canvas", "plot_function",
    }
    _early_pushed: set[str] = set()
    _early_cursor_snapshot: Dict[str, float] = {}
    # Track which output transcripts already have an open partial message,
    # to synthesise one if streaming deltas never arrived.
    _output_partial_open: set[str] = set()

    async def _try_early_canvas_push(tool_name: str, args_json: str) -> None:
        if tool_name not in _CANVAS_TOOL_NAMES or not args_json:
            return
        try:
            from app.tools import canvas_tools as _ct
            from app.tools import plot_tools as _pt

            fn = getattr(_pt, tool_name, None) or getattr(_ct, tool_name, None)
            if fn is None:
                return

            args = json.loads(args_json)
            result = fn(**args)  # canvas/plot tools are synchronous

            _early_cursor_snapshot[tool_name] = _ct._cursor_y

            if isinstance(result, dict) and "deferred_canvas_id" in result:
                c_id = result["deferred_canvas_id"]
                from app.tools.canvas_tools import canvas_bridge
                if c_id in canvas_bridge:
                    bridge_data = canvas_bridge.pop(c_id)
                    result["elements"] = bridge_data["elements"]
                    if "animation" in bridge_data:
                        result["animation"] = bridge_data["animation"]
                    await _send_json(websocket, {
                        "content": {"parts": [{"functionResponse": {
                            "name": tool_name,
                            "response": result,
                        }}]}
                    })
                    _early_pushed.add(tool_name)
                    logger.info(
                        "Early canvas push for %s (%d elements)",
                        tool_name, len(bridge_data["elements"]),
                    )
        except Exception as exc:
            logger.warning("Early canvas push failed for %s: %s", tool_name, exc)

    def _build_function_response_envelope(tool_name: str, output: Any) -> Optional[Dict[str, Any]]:
        """Re-inject bridge data into a tool output and build the client envelope."""
        if not isinstance(output, dict):
            output = {"output": output} if output is not None else {"status": "ok"}

        # Re-inject deferred image data
        if "deferred_file_id" in output:
            f_id = output["deferred_file_id"]
            from app.tools.canvas_tools import image_bridge
            if f_id in image_bridge:
                output["files"] = {f_id: image_bridge.pop(f_id)}
                if not output.get("elements"):
                    output["elements"] = [
                        {
                            "type": "image",
                            "fileId": f_id,
                            "x": 100, "y": 100, "width": 400, "height": 300,
                            "status": "saved",
                        }
                    ]
                    output.setdefault("tool", "generate_and_show_image")
                    output.setdefault("action", "add")
                logger.info("Re-injected deferred image data for fileId: %s", f_id)

        # Re-inject deferred canvas element data
        if "deferred_canvas_id" in output:
            c_id = output["deferred_canvas_id"]
            from app.tools.canvas_tools import canvas_bridge
            if c_id in canvas_bridge:
                bridge_data = canvas_bridge.pop(c_id)
                output["elements"] = bridge_data["elements"]
                if "animation" in bridge_data:
                    output["animation"] = bridge_data["animation"]
                logger.info("Re-injected canvas elements for cmd: %s", c_id)

        return {"content": {"parts": [{"functionResponse": {"name": tool_name, "response": output}}]}}

    # Mutable holder so the long-lived upstream task can reach the current session
    state: Dict[str, Any] = {
        "session": None,
        "current_agent": "tutor_agent" if agent_kind != "clicky" else "clicky_agent",
        "agent_kind": agent_kind,
    }

    # ── Upstream: browser → RealtimeSession ────────────────────────────────
    async def upstream_task():
        try:
            while True:
                message = await websocket.receive()

                # Binary frame = raw PCM @ 16 kHz → resample to 24 kHz
                if "bytes" in message and message["bytes"]:
                    pcm16 = _resample_pcm16(message["bytes"], _INPUT_RATE, _OUTPUT_RATE)
                    session = state.get("session")
                    if session is not None:
                        try:
                            await session.send_audio(pcm16)
                        except Exception as exc:
                            logger.warning("send_audio failed (transient): %s", exc)
                    else:
                        _mic_probe_n = state.get("_mic_probe_n", 0) + 1
                        state["_mic_probe_n"] = _mic_probe_n
                        if _mic_probe_n % 50 == 1:
                            logger.debug(
                                "dropping binary audio (%d bytes): realtime session not ready yet",
                                len(message["bytes"]),
                            )
                    continue

                raw_text = message.get("text")
                if not raw_text:
                    continue

                try:
                    json_msg: Dict[str, Any] = json.loads(raw_text)
                except json.JSONDecodeError:
                    logger.warning("Non-JSON text frame ignored")
                    continue

                msg_type = json_msg.get("type", "")
                session = state.get("session")
                if session is None:
                    continue

                try:
                    if msg_type == "text":
                        text = json_msg.get("text", "")
                        if text:
                            await session.send_message(text)

                    elif msg_type == "interrupt":
                        # Typed input is an explicit user barge-in. Force the
                        # current response to stop even though semantic VAD's
                        # automatic interruption setting only applies to mic
                        # speech, not websocket text messages.
                        realtime_model = session._model
                        get_playback_state = getattr(realtime_model, "_get_playback_state", None)
                        playback_state = get_playback_state() if callable(get_playback_state) else {}
                        had_active_audio = (
                            playback_state.get("current_item_id") is not None
                            and (playback_state.get("elapsed_ms") or 0) > 0
                        )
                        await realtime_model.send_event(
                            RealtimeModelSendInterrupt(force_response_cancel=True)
                        )
                        # Active audio produces an ordered audio_interrupted
                        # event after all old chunks. With no active audio,
                        # acknowledge here so the next response is not muted.
                        if not had_active_audio:
                            await _send_json(websocket, {"interrupted": True})
                        logger.info("Current realtime response interrupted by client")

                    elif msg_type == "image":
                        b64 = json_msg.get("data", "")
                        mime = json_msg.get("mimeType", "image/jpeg")
                        data_url = f"data:{mime};base64,{b64}"
                        nudge = (
                            "I just showed you something from my camera. Please look at the "
                            "image I'm showing you and tell me what you see. If it's homework "
                            "or a problem, help me solve it."
                        )
                        await session.send_message({
                            "type": "message",
                            "role": "user",
                            "content": [
                                {"type": "input_image", "image_url": data_url, "detail": "high"},
                                {"type": "input_text", "text": nudge},
                            ],
                        })
                        logger.info("Camera image sent to agent (%s)", mime)

                    elif msg_type == "canvas":
                        b64 = json_msg.get("data", "")
                        mime = json_msg.get("mimeType", "image/jpeg")
                        width = json_msg.get("width")
                        height = json_msg.get("height")
                        intent_text = (json_msg.get("intentText") or "").strip()
                        data_url = f"data:{mime};base64,{b64}"
                        dims = f"{width}x{height}" if width and height else "the provided image dimensions"
                        if intent_text:
                            nudge = (
                                "The user is asking about this current whiteboard viewport. "
                                f"User request: {intent_text}\n\n"
                                f"Treat {dims} as the coordinate space if you call point_at_whiteboard(x, y, label). "
                                "Use top-left origin, x increasing right, y increasing down. "
                                "If pointing at a specific visible spot would help, call point_at_whiteboard BEFORE or while answering. "
                                "Do not say coordinates aloud."
                            )
                        else:
                            nudge = (
                                "Context only. Do NOT answer or acknowledge this message. "
                                "Just remember this is the latest current whiteboard viewport for future turns. "
                                f"Treat {dims} as the coordinate space when you later call point_at_whiteboard(x, y, label). "
                                "Use top-left origin, x increasing right, y increasing down. Do not speak coordinates."
                            )
                        await session.send_message({
                            "type": "message",
                            "role": "user",
                            "content": [
                                {"type": "input_image", "image_url": data_url, "detail": "high"},
                                {"type": "input_text", "text": nudge},
                            ],
                        })

                    elif msg_type == "clicky_screen":
                        # Clicky-only side-channel: pushes a current tab
                        # screenshot + DOM inventory so the model can decide
                        # whether to call point_at(target_id=...) for an
                        # exact DOM target, or point_at(x=,y=...) for vision
                        # fallback on non-DOM pixels (e.g. inside an iframe).
                        b64 = json_msg.get("data", "")
                        mime = json_msg.get("mimeType", "image/jpeg")
                        width = json_msg.get("width")
                        height = json_msg.get("height")
                        elements = json_msg.get("elements", []) or []
                        calibrated = bool(json_msg.get("calibrated"))
                        intent_text = (json_msg.get("intentText") or "").strip()
                        context_id = str(json_msg.get("contextId") or "")[:120]
                        page = json_msg.get("page") if isinstance(json_msg.get("page"), dict) else {}
                        media = json_msg.get("media") if isinstance(json_msg.get("media"), dict) else {}
                        media_crop = json_msg.get("mediaCrop") if isinstance(json_msg.get("mediaCrop"), dict) else {}
                        state["clicky_media_crop"] = media_crop if media_crop else None
                        state["clicky_viewport_capture"] = {
                            "data": b64,
                            "mimeType": mime,
                            "width": width,
                            "height": height,
                        } if b64 and width and height and calibrated else None
                        tabs = json_msg.get("tabs") if isinstance(json_msg.get("tabs"), list) else []
                        data_url = f"data:{mime};base64,{b64}"
                        media_crop_data = str(media_crop.get("data") or "")
                        media_crop_mime = str(media_crop.get("mimeType") or "image/jpeg")
                        media_crop_url = (
                            f"data:{media_crop_mime};base64,{media_crop_data}"
                            if media_crop_data
                            else ""
                        )
                        dims = f"{width}x{height}" if width and height else "the provided image dimensions"
                        dom_summary = json.dumps(elements[:220], ensure_ascii=False)[:30000]
                        page_summary = json.dumps(page, ensure_ascii=False)[:4000]
                        media_summary = json.dumps(media, ensure_ascii=False)[:6000]
                        tab_summary = json.dumps(tabs[:40], ensure_ascii=False)[:8000]
                        coordinate_note = (
                            "The image is calibrated to the browser viewport, so raw x,y "
                            "coordinates map exactly back to it. Ignore the four tiny colored "
                            "corner calibration markers if they are visible."
                            if calibrated
                            else
                            "The image could not be calibrated to the browser viewport. Prefer "
                            "a DOM target_id and do not emit raw x,y coordinates."
                        )
                        media_coordinate_note = (
                            "A second image is an enlarged crop of the visible video with a "
                            "labeled 0-1000 grid on both axes. For any object inside that video, "
                            "localize it from the second image, set coordinate_space='media', "
                            "and use grid coordinates from 0 through 1000. The browser maps them "
                            "through the exact live video rectangle."
                            if media_crop_url
                            else "No calibrated media crop is attached; use viewport coordinates."
                        )
                        if intent_text:
                            nudge = (
                                f"Current browser viewport screenshot (image dimensions: {dims} pixels, "
                                "origin top-left, x right, y down). "
                                f"User just asked: {intent_text}\n\n"
                                f"{coordinate_note}\n\n"
                                f"{media_coordinate_note}\n\n"
                                f"Context id: {context_id or 'none'}\n"
                                f"Page metadata JSON: {page_summary}\n"
                                f"Media context JSON: {media_summary}\n"
                                f"Open browser tabs JSON: {tab_summary}\n\n"
                                f"Visible DOM inventory JSON:\n{dom_summary}\n\n"
                                "Decide whether to call point_at and/or draw_on_screen based on "
                                "the request. Prefer target_id from the inventory when a matching "
                                "element exists. Fall back to raw "
                                "x,y only for things visible in the screenshot but absent "
                                "from the inventory. For raw area marks, x,y is top-left and "
                                "end_x,end_y is bottom-right; for underline/line/arrow they are "
                                "the two endpoints. Never use a whole video/canvas DOM target for "
                                "an object inside its pixels. Do not say coordinates or ids aloud."
                            )
                        else:
                            nudge = (
                                f"Context only — do NOT answer. Just remember this is the "
                                f"latest browser viewport screenshot (image dimensions: {dims} "
                                "pixels, origin top-left, x right, y down) for future turns.\n\n"
                                f"{coordinate_note}\n\n"
                                f"{media_coordinate_note}\n\n"
                                f"Context id: {context_id or 'none'}\n"
                                f"Page metadata JSON: {page_summary}\n"
                                f"Media context JSON: {media_summary}\n"
                                f"Open browser tabs JSON: {tab_summary}\n\n"
                                f"Visible DOM inventory JSON:\n{dom_summary}\n\n"
                                "If you later call point_at or draw_on_screen, prefer target_id "
                                "from this inventory; fall back to raw x,y only for non-DOM pixels. "
                                "Do not say coordinates or ids aloud."
                            )
                        # `session.send_message()` automatically starts a new
                        # response. A Clicky snapshot is context for the pending
                        # audio turn, so insert it without creating a response;
                        # clicky_commit_audio starts exactly one response after
                        # both the speech and current screen are present.
                        image_content = [
                            {
                                "type": "input_image",
                                "image_url": data_url,
                                "detail": "high",
                            }
                        ]
                        if media_crop_url:
                            image_content.append({
                                "type": "input_image",
                                "image_url": media_crop_url,
                                "detail": "high",
                            })
                        await session._model.send_event(RealtimeModelSendRawMessage(
                            message={
                                "type": "conversation.item.create",
                                "other_data": {
                                    "item": {
                                        "type": "message",
                                        "role": "user",
                                        "content": [
                                            *image_content,
                                            {"type": "input_text", "text": nudge},
                                        ],
                                    }
                                },
                            }
                        ))
                        logger.info(
                            "Clicky screen context sent (%s, %d elements, media_crop=%s)",
                            dims, len(elements), bool(media_crop_url),
                        )

                    elif msg_type == "clicky_commit_audio":
                        # Clicky is push-to-talk. On Ctrl release the browser
                        # sends this after a short silence tail so the server
                        # explicitly commits the current input audio buffer.
                        # Clicky has server VAD disabled, so this is the single
                        # operation that closes the input buffer and replies.
                        try:
                            await session.send_audio(b"\x00\x00" * 1200, commit=True)
                            await session._model.send_event(RealtimeModelSendRawMessage(
                                message={"type": "response.create", "other_data": {}}
                            ))
                            logger.info("Clicky audio committed explicitly and response.create sent")
                        except Exception as exc:
                            logger.warning("Clicky audio commit failed: %s", exc)

                    elif msg_type == "clicky_cancel_audio":
                        await session._model.send_event(RealtimeModelSendRawMessage(
                            message={"type": "input_audio_buffer.clear", "other_data": {}}
                        ))
                        logger.info("Clicky input audio buffer cleared")

                    elif msg_type == "canvas_elements":
                        elements = json_msg.get("elements", [])
                        from app.tools.canvas_tools import update_cursor_from_canvas
                        update_cursor_from_canvas(elements)
                        canvas_text = f"[Canvas Elements JSON]\n{json.dumps(elements, indent=2)}"
                        await session.send_message(canvas_text)

                    elif msg_type == "activity_start":
                        # No direct Realtime equivalent — ignore.
                        pass

                    elif msg_type == "activity_end":
                        pass

                    elif msg_type == "stop":
                        logger.info("Client sent stop signal")
                        break

                    else:
                        logger.debug("Unknown message type: %s", msg_type)

                except Exception as exc:
                    logger.warning("Upstream send failed: %s", exc)

        except WebSocketDisconnect:
            logger.info("WS disconnected (upstream): user=%s", user_id)
        except RuntimeError as exc:
            if "disconnect" in str(exc).lower():
                logger.info("WS already disconnected (upstream): user=%s", user_id)
            else:
                logger.error("Upstream runtime error: %s", exc, exc_info=True)
        except Exception as exc:
            logger.error("Upstream error: %s", exc, exc_info=True)

    # ── Downstream: RealtimeSession → browser ──────────────────────────────
    MAX_REALTIME_RETRIES = 3

    async def downstream_task():
        runner = _build_runner(root_agent, tutor_voice)
        mcfg = _model_config()

        for attempt in range(MAX_REALTIME_RETRIES + 1):
            try:
                session = await runner.run(model_config=mcfg or None)
            except Exception as exc:
                logger.error("Failed to start realtime session: %s", exc, exc_info=True)
                await _send_json(websocket, ErrorPayload(
                    category=ErrorCategory.CONNECTION,
                    severity=ErrorSeverity.FATAL,
                    code="SESSION_START_FAILED",
                    message="Could not start the realtime session.",
                    detail=str(exc)[:200],
                ).to_ws_json())
                return

            pending_clicky_drawings: list[
                tuple[asyncio.Task[None], dict[str, Any]]
            ] = []
            # Strong references for fire-and-forget point tasks so the GC cannot
            # cancel them mid-localization. Each task removes itself on completion.
            pending_clicky_points: set[asyncio.Task[None]] = set()

            def _cancel_pending_clicky_drawings() -> None:
                while pending_clicky_drawings:
                    task, _ = pending_clicky_drawings.pop()
                    task.cancel()

            async def _deliver_clicky_drawing(
                original_payload: dict[str, Any], grounding_state: dict[str, Any]
            ) -> None:
                """Ground one annotation and ship it the moment the result exists.

                Mirrors the Swift Clicky: the drawing action starts as soon as
                the visual locator resolves, instead of being held until turn
                end. A multi-shape diagram therefore paints progressively as
                each shape's coordinates are grounded, which feels far snappier
                than waiting for the whole turn to finish.
                """
                from app.services.clicky_visual_locator import refine_clicky_payload
                try:
                    refined = await refine_clicky_payload(
                        original_payload,
                        grounding_state,
                        tool_name="draw_on_screen",
                    )
                except Exception as exc:
                    logger.warning("Clicky drawing localization failed: %s", exc)
                    refined = original_payload
                await _send_json(websocket, {
                    "type": "clicky_draw",
                    "tool": "draw_on_screen",
                    "response": refined,
                })
                logger.info("Clicky drawing delivered payload=%s", refined)

            async def _deliver_clicky_point(
                original_payload: dict[str, Any], grounding_state: dict[str, Any]
            ) -> None:
                """Ground a vision point without blocking the realtime audio stream.

                The model already receives the tool's echoed return value, so
                this refinement is browser-facing only. Running it as a detached
                task means ElevenLabs/Realtime voice keeps streaming while the
                GPT computer-use locator resolves — the cursor flies as soon as
                the visual result exists, exactly like production Clicky.
                """
                from app.services.clicky_visual_locator import refine_clicky_payload
                try:
                    refined = await refine_clicky_payload(
                        original_payload,
                        grounding_state,
                        tool_name="point_at",
                    )
                except Exception as exc:
                    logger.warning("Clicky point localization failed: %s", exc)
                    refined = original_payload
                await _send_json(websocket, {
                    "type": "clicky_point",
                    "tool": "point_at",
                    "response": {
                        "targetId": refined.get("target_id"),
                        "x": refined.get("x"),
                        "y": refined.get("y"),
                        "coordinate_space": refined.get("coordinate_space") or "viewport",
                        "label": refined.get("label") or "right here",
                        "action": refined.get("action") or "none",
                    },
                })
                logger.info(
                    "Clicky point delivered target_id=%s x=%s y=%s action=%s",
                    refined.get("target_id"),
                    refined.get("x"),
                    refined.get("y"),
                    refined.get("action"),
                )

            async def _flush_pending_clicky_drawings() -> None:
                if not pending_clicky_drawings:
                    return
                batch = pending_clicky_drawings[:]
                pending_clicky_drawings.clear()
                # Each drawing task self-delivers its clicky_draw event the
                # moment its localization completes. At turn end we only await
                # any stragglers still in flight so nothing is dropped when the
                # session tears down — we do not re-batch or re-send.
                await asyncio.gather(
                    *(task for task, _ in batch),
                    return_exceptions=True,
                )

            try:
                async with session:
                    state["session"] = session
                    state["current_agent"] = root_agent.name
                    _output_partial_open.clear()
                    logger.info("Realtime session ready agent=%s — upstream can now forward audio", root_agent.name)
                    await _send_json(websocket, {"type": "realtime_ready", "agent": root_agent.name})
                    async for event in session:
                        etype = getattr(event, "type", "")

                        # ── Audio ──────────────────────────────────────────
                        if etype == "audio":
                            audio_b64 = _to_base64(getattr(event, "audio", None))
                            if not audio_b64:
                                # Fallback: the event itself may carry the chunk.
                                audio_b64 = _to_base64(event)
                            if audio_b64:
                                await _send_json(websocket, {
                                    "content": {"parts": [{"inlineData": {
                                        "mimeType": f"audio/pcm;rate={_OUTPUT_RATE}",
                                        "data": audio_b64,
                                    }}]}
                                })

                        # ── Agent lifecycle ────────────────────────────────
                        elif etype == "agent_start":
                            agent_obj = getattr(event, "agent", None)
                            if agent_obj is not None and getattr(agent_obj, "name", None):
                                state["current_agent"] = agent_obj.name
                        elif etype == "agent_end":
                            await _flush_pending_clicky_drawings()
                            await _send_json(websocket, {"turnComplete": True})

                        # ── Handoff ────────────────────────────────────────
                        elif etype == "handoff":
                            to_agent = getattr(event, "to_agent", None)
                            if to_agent is not None and getattr(to_agent, "name", None):
                                state["current_agent"] = to_agent.name

                        # ── Tool events ────────────────────────────────────
                        elif etype == "tool_start":
                            tool = getattr(event, "tool", None)
                            tool_name = getattr(tool, "name", "") or ""
                            args_json = getattr(event, "arguments", "") or ""
                            if tool_name == "generate_and_show_image":
                                await _send_json(websocket, {
                                    "type": "generating_image",
                                    "tool": "generate_and_show_image",
                                    "status": "started",
                                })
                                logger.info("Sent early generating_image signal to client")
                            await _try_early_canvas_push(tool_name, args_json)

                        elif etype == "tool_end":
                            tool = getattr(event, "tool", None)
                            tool_name = getattr(tool, "name", "") or ""
                            output = getattr(event, "output", None)

                            # ── Clicky screen annotations ─────────────────
                            if tool_name in {"draw_on_screen", "clear_screen_drawings"}:
                                payload = output if isinstance(output, dict) else {}
                                if tool_name == "draw_on_screen":
                                    # Snapshot the grounding state now — the live
                                    # `state` mutates as the turn continues, but a
                                    # drawing must be grounded against the screenshot
                                    # that was current when the model emitted it.
                                    grounding_state = {
                                        key: dict(value) if isinstance(value, dict) else value
                                        for key, value in state.items()
                                        if key in {
                                            "clicky_media_crop",
                                            "clicky_viewport_capture",
                                            "last_input_transcript",
                                        }
                                    }
                                    original_payload = dict(payload)
                                    # Detached task: deliver this annotation the instant
                                    # its computer-use localization resolves, instead of
                                    # blocking the event stream or waiting for agent_end.
                                    pending_clicky_drawings.append((
                                        asyncio.create_task(
                                            _deliver_clicky_drawing(original_payload, grounding_state)
                                        ),
                                        original_payload,
                                    ))
                                    continue
                                _cancel_pending_clicky_drawings()
                                await _send_json(websocket, {
                                    "type": "clicky_draw",
                                    "tool": tool_name,
                                    "response": payload,
                                })
                                logger.info("Clicky drawing tool=%s payload=%s", tool_name, payload)
                                continue

                            # ── Clicky point_at → emit a lightweight envelope ─
                            if tool_name == "point_at":
                                payload = output if isinstance(output, dict) else {}
                                grounding_state = {
                                    key: dict(value) if isinstance(value, dict) else value
                                    for key, value in state.items()
                                    if key in {
                                        "clicky_media_crop",
                                        "clicky_viewport_capture",
                                        "last_input_transcript",
                                    }
                                }
                                # Non-blocking: ground + deliver on a detached task so
                                # realtime voice keeps streaming while the locator runs.
                                point_task = asyncio.create_task(
                                    _deliver_clicky_point(dict(payload), grounding_state)
                                )
                                pending_clicky_points.add(point_task)
                                point_task.add_done_callback(pending_clicky_points.discard)
                                continue

                            if tool_name == "interact_with_page":
                                payload = output if isinstance(output, dict) else {}
                                await _send_json(websocket, {
                                    "type": "clicky_action",
                                    "tool": "interact_with_page",
                                    "response": {
                                        "action": payload.get("action") or "none",
                                        "targetId": payload.get("target_id"),
                                        "value": payload.get("value"),
                                        "label": payload.get("label") or "",
                                    },
                                })
                                logger.info("Clicky browser action payload=%s", payload)
                                continue

                            if tool_name in _early_pushed:
                                # Already delivered via early push — discard the
                                # duplicate bridge entry and restore the cursor.
                                if isinstance(output, dict) and "deferred_canvas_id" in output:
                                    from app.tools.canvas_tools import canvas_bridge
                                    canvas_bridge.pop(output["deferred_canvas_id"], None)
                                if tool_name in _early_cursor_snapshot:
                                    import app.tools.canvas_tools as _ct_mod
                                    _ct_mod._cursor_y = _early_cursor_snapshot.pop(tool_name)
                                _early_pushed.discard(tool_name)
                                logger.info("Skipped duplicate canvas push for %s", tool_name)
                            else:
                                envelope = _build_function_response_envelope(tool_name, output)
                                if envelope is not None:
                                    await _send_json(websocket, envelope)

                        # ── Interruption ────────────────────────────────────
                        elif etype == "audio_interrupted":
                            await _send_json(websocket, {"interrupted": True})

                        # ── Error ──────────────────────────────────────────
                        elif etype == "error":
                            err = getattr(event, "error", None)
                            esc = err if isinstance(err, BaseException) else Exception(str(err or "realtime error"))
                            payload, retryable = classify_api_error(esc)
                            await _send_json(websocket, payload.to_ws_json())
                            if retryable:
                                raise esc  # trigger reconnect via outer handler
                            # fatal → end
                            return

                        # ── Raw model events (transcripts) ──────────────────
                        # The OpenAI Agents SDK forwards raw model events as
                        # typed dataclasses (RealtimeModel*Event), NOT plain
                        # dicts, so we dispatch on the dataclass' .type field.
                        elif etype == "raw_model_event":
                            data = getattr(event, "data", None)
                            dtype = getattr(data, "type", None)

                            # Assistant (output) speech transcript — streaming
                            # deltas. Finalised on turnComplete (agent_end).
                            if dtype == "transcript_delta":
                                delta = getattr(data, "delta", "") or ""
                                if delta:
                                    await _send_json(websocket, {
                                        "outputTranscription": {
                                            "text": delta,
                                            "finished": False,
                                        },
                                        "author": state.get("current_agent", "tutor_agent"),
                                    })

                            # User (input) speech transcript — completed only.
                            elif dtype == "input_audio_transcription_completed":
                                full = getattr(data, "transcript", "") or ""
                                if full:
                                    state["last_input_transcript"] = full
                                    logger.info("Realtime input transcript: %r", full)
                                    # delta + finish pair so the frontend's
                                    # input-transcript UI renders + finalises.
                                    await _send_json(websocket, {
                                        "inputTranscription": {
                                            "text": full,
                                            "finished": False,
                                        },
                                    })
                                    await _send_json(websocket, {
                                        "inputTranscription": {
                                            "text": full,
                                            "finished": True,
                                        },
                                    })

                            # Legacy dict payload path (kept for safety).
                            elif isinstance(data, dict):
                                await _handle_raw_event(data, websocket, state, _output_partial_open)

                # Session closed cleanly — done.
                return

            except WebSocketDisconnect:
                _cancel_pending_clicky_drawings()
                logger.info("WS disconnected (downstream): user=%s", user_id)
                return
            except Exception as exc:
                _cancel_pending_clicky_drawings()
                payload, retryable = classify_api_error(exc)
                if retryable and attempt < MAX_REALTIME_RETRIES:
                    delay = 1.0 * (attempt + 1)
                    logger.warning(
                        "Realtime session lost (attempt %d/%d, code=%s): %s — reconnecting in %.0fs…",
                        attempt + 1, MAX_REALTIME_RETRIES, payload.code, exc, delay,
                    )
                    await _send_json(websocket, {
                        "type": "info",
                        "code": "RECONNECTING",
                        "message": payload.message,
                        "attempt": attempt + 1,
                        "max_attempts": MAX_REALTIME_RETRIES,
                    })
                    state["session"] = None
                    await asyncio.sleep(delay)
                    continue

                logger.error("Realtime downstream error: %s", exc, exc_info=True)
                try:
                    await _send_json(websocket, ErrorPayload(
                        category=ErrorCategory.INTERNAL,
                        severity=ErrorSeverity.FATAL,
                        code="STREAM_ERROR",
                        message="Streaming session encountered an error.",
                        detail=str(exc)[:200],
                    ).to_ws_json())
                except Exception:
                    pass
                return

    # ── Persist session end to SQLite — TUTOR ONLY ────────────────────────
    _persist_session_end = agent_kind != "clicky"

    # ── Run upstream + downstream, clean up on exit ────────────────────────
    upstream = asyncio.create_task(upstream_task())
    try:
        await downstream_task()
    except Exception as exc:
        logger.error("Session error: %s", exc, exc_info=True)
    finally:
        upstream.cancel()
        try:
            await upstream
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

        # ── Persist session end to SQLite ─────────────────────────────────
        if _persist_session_end:
            try:
                session_end_time = datetime.now(timezone.utc)
                duration_minutes = round(
                    (session_end_time - session_start_time).total_seconds() / 60, 1
                )
                with SessionLocal() as db:
                    row = db.scalar(
                        select(SessionRow).where(
                            SessionRow.user_id == int(user_id),
                            SessionRow.session_id == session_id,
                        )
                    )
                    if row is not None:
                        row.ended_at = session_end_time
                        row.duration_minutes = duration_minutes
                        row.status = "completed"
                        db.commit()
                logger.info(
                    "Session ended: user=%s session=%s (%.1f min)",
                    user_id, session_id, duration_minutes,
                )
            except Exception as _db_exc:
                logger.warning("Failed to save session end: %s", _db_exc)

        ws_notify.reset(_notify_token)
        state["session"] = None
        logger.info("WS session cleaned up: user=%s session=%s", user_id, session_id)
        try:
            await websocket.close()
        except Exception:
            pass


# ── Raw Realtime API event handling (transcripts + audio fallback) ────────────


async def _handle_raw_event(
    data: Dict[str, Any],
    websocket: WebSocket,
    state: Dict[str, Any],
    output_partial_open: set,
) -> None:
    """Translate raw Realtime API events into ADK-shaped transcript envelopes."""
    ev_type = data.get("type", "")
    # DEBUG — temporary diagnostic for transcript-not-showing-in-chat issue
    print(f"[RAW] {ev_type}", flush=True)

    # ── Assistant (output) transcript deltas/final ──────────────────────────
    if ev_type == "response.audio_transcript.delta":
        text = data.get("delta") or ""
        if text:
            item_id = data.get("item_id", "")
            output_partial_open.add(item_id)
            await _send_json(websocket, {
                "outputTranscription": {"text": text, "finished": False},
                "author": state.get("current_agent", "tutor_agent"),
            })
    elif ev_type == "response.audio_transcript.done":
        item_id = data.get("item_id", "")
        full = data.get("transcript") or ""
        if item_id not in output_partial_open and full:
            # No deltas arrived — synthesise a brief partial then finalise.
            await _send_json(websocket, {
                "outputTranscription": {"text": full, "finished": False},
                "author": state.get("current_agent", "tutor_agent"),
            })
        await _send_json(websocket, {
            "outputTranscription": {"text": full or " ", "finished": True},
            "author": state.get("current_agent", "tutor_agent"),
        })
        output_partial_open.discard(item_id)

    # ── User (input) transcript final ────────────────────────────────────────
    elif ev_type == "conversation.item.input_audio_transcription.completed":
        full = data.get("transcript") or ""
        if full:
            # Mimic delta+finish so the frontend's transcript UI renders it.
            await _send_json(websocket, {
                "inputTranscription": {"text": full, "finished": False},
            })
            await _send_json(websocket, {
                "inputTranscription": {"text": full, "finished": True},
            })

    # ── Audio fallback (only if the high-level `audio` event didn't already
    #    deliver it).  We forward deltas here defensively; duplicates are
    #    harmless because the player is a simple ring buffer that tolerates
    #    contiguous PCM.)  Kept disabled by default to avoid double audio.
    elif ev_type == "response.audio.delta":
        # Intentionally NOT forwarded — handled by the high-level `audio` event.
        pass


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _send_json(ws: WebSocket, data: dict) -> None:
    """Send a JSON dict over the WebSocket, swallowing errors."""
    try:
        await ws.send_text(json.dumps(data))
    except Exception:
        pass


# ── Entry-point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
        reload=True,
    )
