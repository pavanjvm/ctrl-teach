"""Media Agent — legacy shell.

Image generation is handled as a direct tool (``generate_and_show_image``)
on the root tutor agent, so this sub-agent is no longer used.  Retained as
an empty placeholder to avoid breaking old imports.
"""

from __future__ import annotations

from agents.realtime import RealtimeAgent


def build_media_agent() -> RealtimeAgent:
    """Deprecated: image generation is a direct tool on the tutor agent."""
    return RealtimeAgent(
        name="media_agent",
        instructions="Deprecated shell — image generation is a direct tutor tool.",
        tools=[],
    )