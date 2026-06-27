"""Per-connection WebSocket signal channel via Python contextvars.

Allows tool functions (e.g. generate_and_show_image) to push early
status messages to the client WebSocket without having a direct
reference to it.  The contextvar is set by main.py at the start of
each WebSocket session and is automatically visible to all coroutines
invoked from that session's async context — including ADK tool calls.

Usage
-----
# In main.py (per WebSocket connection):
    from app.utils.ws_signals import ws_notify, set_ws_notify
    token = set_ws_notify(lambda data: asyncio.ensure_future(_send_json(ws, data)))
    try:
        ...session handling...
    finally:
        ws_notify.reset(token)

# In any tool (e.g. media_tools.py):
    from app.utils.ws_signals import ws_notify
    notify = ws_notify.get()
    if notify:
        notify({"type": "generating_image", "status": "started"})
"""

from __future__ import annotations

import logging
from contextvars import ContextVar
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger(__name__)

# Holds a callable(data: dict) -> None for the current WS session.
# asyncio.create_task() copies the current context, so ADK tool tasks
# created within the session will all see the correct callback.
ws_notify: ContextVar[Optional[Callable[[Dict[str, Any]], None]]] = ContextVar(
    "ws_notify", default=None
)


def set_ws_notify(fn: Callable[[Dict[str, Any]], None]):
    """Set the notify callback for the current async context.

    Returns the Token produced by ContextVar.set() so the caller can
    restore the previous value with ws_notify.reset(token) in a finally block.
    """
    logger.debug("ws_notify registered for session")
    return ws_notify.set(fn)
