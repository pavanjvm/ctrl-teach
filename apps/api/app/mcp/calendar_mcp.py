"""ContextVars for the realtime session (no Google Calendar code remains).

The user/session/timezone contextvars are still used by firestore_tools
and main.py to pass the authenticated user's id + realtime session id +
timezone into tool functions that need them.  All Google Calendar /
OAuth tool functions have been removed.
"""

from __future__ import annotations

import contextvars

current_user_id: contextvars.ContextVar[str] = contextvars.ContextVar(
    "current_user_id", default=""
)
current_user_timezone: contextvars.ContextVar[str] = contextvars.ContextVar(
    "current_user_timezone", default="UTC"
)
current_session_id: contextvars.ContextVar[str] = contextvars.ContextVar(
    "current_session_id", default=""
)

# Kept empty for backward-compat imports (e.g. agent builders).
calendar_tools: list = []