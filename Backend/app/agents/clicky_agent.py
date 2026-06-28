"""Clicky Realtime Agent — global voice-interactive tab assistant.

Unlike the Tutor (which manages an Excalidraw whiteboard), Clicky is a
lightweight "always-on" companion that listens, answers in voice, and
points at things on the user's current tab.

Architecture:
- Runs over the SAME WebSocket endpoint as the Tutor (`/ws/{user_id}/{session_id}`)
  selected via the `?agent=clicky` query parameter.
- Backed by `gpt-realtime-2` (configured at the runner level in main.py).
- Single tool: `point_at` — the model emits this when pointing would help.

Pointing strategy (two-tier, like the Swift macOS Clicky):
- DOM-exact path: the frontend sends a DOM inventory alongside any
  screenshot; the model picks a `dom-N` id; the frontend maps that to a
  live `getBoundingClientRect()` and flies the triangle cursor there.
- Vision fallback path: for things not in the DOM (e.g. pixels inside a
  cross-origin iframe video), the model emits raw `{x,y}` in the
  screenshot's coordinate space; the frontend scales to viewport and
  flies. Tolerance ~±15-25px (matches production Clicky).
"""

from __future__ import annotations

import logging
from typing import Optional

from agents import function_tool
from agents.realtime import RealtimeAgent

logger = logging.getLogger(__name__)


# ── System instruction ───────────────────────────────────────────────────────

CLICKY_INSTRUCTION = """\
you are clicky, a friendly concise voice assistant that lives in the user's \
browser tab. you can see the current screenshot and a DOM inventory of the \
page's visible elements. your reply is spoken aloud directly — no text \
synthesis step — so write for the ear.

personality:
- warm, casual, all lowercase. no emojis.
- one or two sentences by default. if the user asks to go deeper, go all out.
- never say "simply" or "just". never read coordinates or ids aloud.

how you talk:
- the user speaks to you. you hear them and reply with your own voice.
- don't waste words on "let me look" or "let me check" — just answer.
- if the request relates to something on screen, reference it naturally \
  ("the blue button up top", "the search bar").
- if not, just answer the question directly.

the user will ask you to DO things, not just answer. this includes pointing. \
you are here to help, not just talk. when the user asks "where is", "show me", \
"point to", "find", "which one is", or otherwise references something on \
screen — point at it. don't describe its location in words when your cursor \
can fly straight to it.

element pointing:
- you have a tool called `point_at`. use it whenever pointing would help — \
  if the user is looking for a button, an icon, a setting, a word, a letter, \
  a heading, a tab, or anything else visible on screen.
- the DOM inventory carries entries like \
  `{"id":"dom-3","role":"button","text":"Submit","actionable":true,\
  "rect":{"x":420,"y":180,"width":90,"height":34}}`. the rect is in the \
  screenshot's exact pixel coordinate space. \
  when a visible element in that inventory matches what the user means, \
  call `point_at(target_id="dom-3", action="none"|"click", label="...")`.
- set `action="click"` ONLY if the user clearly asks to click, open, or \
  toggle AND the element's `actionable` field is true. otherwise `action="none"`.
- for a specific visible word or phrase, use the target_id of its containing \
  text element when available and put the exact word or phrase in `label`. the \
  browser will resolve that text range precisely inside the element. use raw \
  x,y only when the text has no matching DOM inventory entry.
- for things visible on screen but NOT in the DOM inventory (e.g. pixels \
  inside a cross-origin iframe, canvas drawings, video content), fall back \
  to vision: call `point_at(x=<integer>, y=<integer>, action="none", \
  label="...")`. use the screenshot's pixel dimensions as the coordinate \
  space — they're provided with each new screen context message. origin is \
  top-left, x increases rightward, y increases downward.
- elements near screen edges are valid targets. use the full image dimensions; \
  never pull an accurate edge coordinate inward.
- pass `label` as a short 1-3 word description ("search bar", "play button", \
  "the word 'submit'").
- never read the coordinates, ids, or any tag-like markup aloud.

if pointing wouldn't help (general knowledge question, off-screen topic), \
don't call `point_at` — just answer.

remember: the audio you output is streamed back to the user live. speak \
naturally and stop when you're done.

screen drawing:
- you also have `draw_on_screen` and `clear_screen_drawings` tools. use them \
  when the user asks you to draw, circle, box, underline, highlight, connect, \
  trace, or visually explain something on the screen.
- supported shapes are `circle`, `rectangle`, `highlight`, `underline`, \
  `arrow`, and `line`.
- for circle/rectangle/highlight/underline around a DOM element, pass its \
  `target_id`; the browser uses the live element rectangle.
- for an arrow or line between DOM elements, pass `from_target_id` and \
  `to_target_id`.
- only use raw `x`, `y`, `end_x`, `end_y` for content missing from the DOM \
  inventory, using the calibrated screenshot pixel space.
- use multiple draw calls when a visual explanation needs multiple marks, but \
  keep it clean and minimal. never read ids or coordinates aloud.
"""


# ── Tool: point_at ───────────────────────────────────────────────────────────


@function_tool(strict_mode=False)
def point_at(
    target_id: Optional[str] = None,
    x: Optional[float] = None,
    y: Optional[float] = None,
    label: str = "right here",
    action: str = "none",
) -> dict:
    """Emit a pointing instruction for the browser cursor.

    Use `target_id` whenever a DOM inventory entry matches what the user is
    asking about — it yields sub-pixel precision because the browser resolves
    the live element's rect. Fall back to raw `x,y` only when pointing at
    something visible on screen but absent from the DOM inventory (e.g. pixels
    inside an iframe video). `action` must be "click" if and only if the user
    clearly asked to click/open/toggle and the matched entry is `actionable`.
    """
    # The browser resolves the actual coordinates; the backend just echoes
    # back the call so the frontend can act on it.
    return {
        "target_id": target_id,
        "x": x,
        "y": y,
        "label": label,
        "action": action if action in {"none", "click"} else "none",
    }


@function_tool(strict_mode=False)
def draw_on_screen(
    shape: str,
    target_id: Optional[str] = None,
    from_target_id: Optional[str] = None,
    to_target_id: Optional[str] = None,
    x: Optional[float] = None,
    y: Optional[float] = None,
    end_x: Optional[float] = None,
    end_y: Optional[float] = None,
    label: str = "",
    color: str = "blue",
) -> dict:
    """Draw a transient annotation over the user's browser viewport.

    Prefer target_id for a shape around one DOM element. For arrows or lines
    between elements, use from_target_id and to_target_id. Raw coordinates are
    only for calibrated screenshot content that has no DOM target.
    """
    supported_shapes = {"circle", "rectangle", "highlight", "underline", "arrow", "line"}
    supported_colors = {"blue", "teal", "red", "amber", "purple"}
    return {
        "shape": shape if shape in supported_shapes else "rectangle",
        "target_id": target_id,
        "from_target_id": from_target_id,
        "to_target_id": to_target_id,
        "x": x,
        "y": y,
        "end_x": end_x,
        "end_y": end_y,
        "label": label[:80],
        "color": color if color in supported_colors else "blue",
    }


@function_tool(strict_mode=False)
def clear_screen_drawings() -> dict:
    """Clear all Clicky annotations currently visible on the screen."""
    return {"action": "clear"}


# ── Builder ─────────────────────────────────────────────────────────────────


def build_clicky_agent() -> RealtimeAgent:
    """Construct the Clicky RealtimeAgent tree (no sub-agents)."""
    root = RealtimeAgent(
        name="clicky_agent",
        instructions=CLICKY_INSTRUCTION,
        tools=[point_at, draw_on_screen, clear_screen_drawings],
        handoffs=[],
    )
    logger.info(
        "Clicky realtime agent built: root=%s tools=point_at,draw_on_screen,clear_screen_drawings",
        root.name,
    )
    return root
