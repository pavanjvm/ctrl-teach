"""Canvas Agent — legacy shell.

Canvas drawing is handled via direct tools on the root tutor agent, so
this sub-agent is no longer used.  Retained as an empty placeholder to
avoid breaking old imports.
"""

from __future__ import annotations

from agents.realtime import RealtimeAgent


def build_canvas_agent() -> RealtimeAgent:
    """Deprecated: canvas drawing is a direct tool on the tutor agent."""
    return RealtimeAgent(
        name="canvas_agent",
        instructions="Deprecated shell — canvas drawing is a direct tutor tool.",
        tools=[],
    )