"""Centralised error handling utilities for the Magic Whiteboard Tutor.

Provides structured error types, WebSocket error messaging, and retry helpers
so every module handles failures consistently.
"""

from __future__ import annotations

import asyncio
import functools
import logging
import traceback
from enum import Enum
from typing import Any, Callable, Dict, Optional, TypeVar

from pydantic import BaseModel

logger = logging.getLogger(__name__)

T = TypeVar("T")


# ── Error Categories ──────────────────────────────────────────────────────────


class ErrorSeverity(str, Enum):
    """How severe the error is – determines client‑side behaviour."""

    TRANSIENT = "transient"      # Retry‑able (network blip, rate limit)
    RECOVERABLE = "recoverable"  # User can re‑try differently
    FATAL = "fatal"              # Session must end


class ErrorCategory(str, Enum):
    """Broad category for structured logging & client handling."""

    CONNECTION = "connection"
    AUTHENTICATION = "authentication"
    MODEL = "model"
    TOOL = "tool"
    CONTENT_POLICY = "content_policy"
    RATE_LIMIT = "rate_limit"
    VALIDATION = "validation"
    INTERNAL = "internal"
    TIMEOUT = "timeout"
    RESOURCE = "resource"


# ── Structured Error Payload ──────────────────────────────────────────────────


class ErrorPayload(BaseModel):
    """JSON‑serialisable error that gets sent over the WebSocket."""

    type: str = "error"
    category: ErrorCategory
    severity: ErrorSeverity
    code: str
    message: str
    detail: Optional[str] = None
    retry_after: Optional[float] = None  # seconds

    def to_ws_json(self) -> Dict[str, Any]:
        return self.model_dump(exclude_none=True)


# ── ADK Event Error Classifier ────────────────────────────────────────────────

# Maps ADK / Gemini error_code strings to (category, severity, should_break).
_ERROR_CODE_MAP: Dict[str, tuple[ErrorCategory, ErrorSeverity, bool]] = {
    "SAFETY": (ErrorCategory.CONTENT_POLICY, ErrorSeverity.RECOVERABLE, True),
    "PROHIBITED_CONTENT": (ErrorCategory.CONTENT_POLICY, ErrorSeverity.RECOVERABLE, True),
    "BLOCKLIST": (ErrorCategory.CONTENT_POLICY, ErrorSeverity.RECOVERABLE, True),
    "MAX_TOKENS": (ErrorCategory.MODEL, ErrorSeverity.RECOVERABLE, True),
    "RESOURCE_EXHAUSTED": (ErrorCategory.RATE_LIMIT, ErrorSeverity.TRANSIENT, False),
    "UNAVAILABLE": (ErrorCategory.CONNECTION, ErrorSeverity.TRANSIENT, False),
    "DEADLINE_EXCEEDED": (ErrorCategory.TIMEOUT, ErrorSeverity.TRANSIENT, False),
    "CANCELLED": (ErrorCategory.CONNECTION, ErrorSeverity.FATAL, True),
    "UNKNOWN": (ErrorCategory.INTERNAL, ErrorSeverity.TRANSIENT, False),
}

_USER_MESSAGES: Dict[str, str] = {
    "SAFETY": "That content can't be processed. Please try a different question.",
    "PROHIBITED_CONTENT": "That content violates our policies. Please rephrase.",
    "BLOCKLIST": "That content is blocked. Please try something else.",
    "MAX_TOKENS": "The response was too long and got cut short. Try a simpler question.",
    "RESOURCE_EXHAUSTED": "We're experiencing high demand. Retrying shortly…",
    "UNAVAILABLE": "Connection hiccup – retrying…",
    "DEADLINE_EXCEEDED": "The request took too long. Retrying…",
    "CANCELLED": "The session was cancelled.",
}

# WS close codes.  True = retryable (transient), False = fatal.
# These apply to both the old Gemini Live WS transport and the new OpenAI
# Realtime WebSocket transport (server-side WebSocket).
_WS_RETRYABLE_CODES: Dict[int, bool] = {
    1006: True,   # Abnormal closure — network blip
    1007: True,   # Invalid frame payload — bad/stale session, reconnect fresh
    1008: True,   # Policy violation — payload too large or unsupported; retry
    1011: True,   # Internal server error / deadline expired
    1001: False,  # Going away — server shutting down, fatal
    1003: False,  # Unsupported data type, fatal
}


def classify_adk_error(
    error_code: str | None,
    error_message: str | None = None,
) -> tuple[ErrorPayload, bool]:
    """Return a structured ``ErrorPayload`` and whether the caller should break.

    Parameters
    ----------
    error_code:
        The ``event.error_code`` from an ADK Event.
    error_message:
        The ``event.error_message`` from an ADK Event.

    Returns
    -------
    tuple[ErrorPayload, bool]
        (payload, should_break)
    """
    code = error_code or "UNKNOWN"
    category, severity, should_break = _ERROR_CODE_MAP.get(
        code, (ErrorCategory.INTERNAL, ErrorSeverity.TRANSIENT, False)
    )
    user_msg = _USER_MESSAGES.get(code, f"An unexpected error occurred ({code}).")
    retry_after = 2.0 if severity == ErrorSeverity.TRANSIENT else None

    payload = ErrorPayload(
        category=category,
        severity=severity,
        code=code,
        message=user_msg,
        detail=error_message,
        retry_after=retry_after,
    )
    return payload, should_break


def classify_api_error(exc: BaseException) -> tuple["ErrorPayload", bool]:
    """Classify a realtime WebSocket / API error (OpenAI Realtime or legacy).

    Returns ``(ErrorPayload, is_retryable)`` where *is_retryable* is True
    if the caller should retry the operation with a fresh realtime session.

    Recognises:
      * OpenAI SDK errors carrying ``.status_code`` (int)
      * OpenAI Realtime ``server.event_error`` payloads / dicts with
        ``error.type``
      * Raw WebSocket close codes (int ``status_code``)
      * ``openai.APIError`` / ``openai.APIStatusError`` style exceptions
    """
    status_code: Optional[int] = getattr(exc, "status_code", None)
    msg = str(exc)

    # AsyncOpenAI SDK errors expose .status_code (int) for HTTP-level errors.
    # Realtime WS closures usually surface as websockets exceptions whose text
    # contains the close code; fall back to parsing it from the message.
    if status_code is None:
        for code in (1006, 1007, 1008, 1011, 1001, 1003):
            if str(code) in msg:
                status_code = code
                break

    retryable = _WS_RETRYABLE_CODES.get(status_code or 0, False)

    # OpenAI realtime error.type strings are often retryable.
    err_type = ""
    err_obj = getattr(exc, "error", None) or getattr(exc, "body", None)
    if isinstance(err_obj, dict):
        err_type = str(err_obj.get("type") or err_obj.get("code") or "")
    if not err_type:
        lower = msg.lower()
        if "rate_limit" in lower or "rate limit" in lower:
            err_type = "rate_limit_exceeded"
        elif "server" in lower or "overloaded" in lower or "timeout" in lower:
            err_type = "server_error"

    if err_type == "rate_limit_exceeded":
        retryable = True
        status_code = status_code or 429
    elif err_type in {"server_error", "internal_server_error", "overloaded"}:
        retryable = True
        status_code = status_code or 1011
    elif err_type in {"invalid_request_error", "authentication_error"}:
        retryable = False

    # Human-readable messages keyed by code
    _WS_MESSAGES: Dict[int, str] = {
        1006: "Connection was interrupted unexpectedly. Reconnecting…",
        1007: "Session history conflict. Starting fresh session…",
        1008: "Operation not supported by the AI service. Reconnecting…",
        1011: "AI service encountered an internal error. Retrying…",
        429: "We're experiencing high demand. Retrying shortly…",
    }
    human_msg = _WS_MESSAGES.get(
        status_code or 0,
        "Connection to AI service was lost. Reconnecting…" if retryable
        else "Connection to AI service failed.",
    )

    payload = ErrorPayload(
        category=ErrorCategory.CONNECTION,
        severity=ErrorSeverity.TRANSIENT if retryable else ErrorSeverity.FATAL,
        code=f"WS_{status_code or (err_type or 'UNKNOWN')}",
        message=human_msg,
        detail=msg[:200],
        retry_after=2.0 if retryable else None,
    )
    return payload, retryable


# ── Custom Exceptions ─────────────────────────────────────────────────────────


class WhiteboardError(Exception):
    """Base exception for the whiteboard application."""

    def __init__(
        self,
        message: str,
        category: ErrorCategory = ErrorCategory.INTERNAL,
        severity: ErrorSeverity = ErrorSeverity.RECOVERABLE,
    ):
        super().__init__(message)
        self.category = category
        self.severity = severity

    def to_payload(self) -> ErrorPayload:
        return ErrorPayload(
            category=self.category,
            severity=self.severity,
            code=self.category.value.upper(),
            message=str(self),
        )


class ToolExecutionError(WhiteboardError):
    """Raised when a custom tool fails."""

    def __init__(self, tool_name: str, message: str):
        super().__init__(
            f"Tool '{tool_name}' failed: {message}",
            category=ErrorCategory.TOOL,
            severity=ErrorSeverity.RECOVERABLE,
        )
        self.tool_name = tool_name


class SessionError(WhiteboardError):
    """Raised on session‑management problems."""

    def __init__(self, message: str):
        super().__init__(
            message,
            category=ErrorCategory.CONNECTION,
            severity=ErrorSeverity.FATAL,
        )


class AuthenticationError(WhiteboardError):
    """Raised when Google OAuth or API key validation fails."""

    def __init__(self, message: str = "Authentication failed"):
        super().__init__(
            message,
            category=ErrorCategory.AUTHENTICATION,
            severity=ErrorSeverity.FATAL,
        )


class ValidationError(WhiteboardError):
    """Raised on invalid user input."""

    def __init__(self, message: str):
        super().__init__(
            message,
            category=ErrorCategory.VALIDATION,
            severity=ErrorSeverity.RECOVERABLE,
        )


# ── Retry Decorator ───────────────────────────────────────────────────────────


def async_retry(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    retryable_exceptions: tuple = (
        ConnectionError,
        TimeoutError,
        asyncio.TimeoutError,
    ),
):
    """Decorator that retries an async function with exponential back‑off.

    Usage::

        @async_retry(max_retries=3)
        async def call_external_api():
            ...
    """

    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            last_exc: BaseException | None = None
            for attempt in range(1, max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except retryable_exceptions as exc:
                    last_exc = exc
                    delay = min(base_delay * (2 ** (attempt - 1)), max_delay)
                    logger.warning(
                        "Retry %d/%d for %s after %.1fs – %s: %s",
                        attempt,
                        max_retries,
                        func.__name__,
                        delay,
                        type(exc).__name__,
                        exc,
                    )
                    await asyncio.sleep(delay)
            raise last_exc  # type: ignore[misc]

        return wrapper

    return decorator


# ── Safe Execution Helper ─────────────────────────────────────────────────────


async def safe_execute(
    func: Callable[..., Any],
    *args: Any,
    error_context: str = "",
    **kwargs: Any,
) -> tuple[Any, ErrorPayload | None]:
    """Execute *func* and return ``(result, None)`` or ``(None, ErrorPayload)``.

    Never raises; captures exceptions into a structured payload.
    """
    try:
        result = await func(*args, **kwargs) if asyncio.iscoroutinefunction(func) else func(*args, **kwargs)
        return result, None
    except WhiteboardError as exc:
        logger.error("WhiteboardError in %s: %s", error_context, exc)
        return None, exc.to_payload()
    except Exception as exc:
        logger.error(
            "Unexpected error in %s: %s\n%s",
            error_context,
            exc,
            traceback.format_exc(),
        )
        return None, ErrorPayload(
            category=ErrorCategory.INTERNAL,
            severity=ErrorSeverity.RECOVERABLE,
            code="INTERNAL_ERROR",
            message="An internal error occurred. Please try again.",
            detail=str(exc),
        )
