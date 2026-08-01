"""Page-assistance mode for the unified Tars companion.

This mode listens, answers in voice, and points at things on the current tab.
Teaching modes use the same identity with a narrower instructional tool set.

Architecture:
- Runs over the shared WebSocket in `mode=page`. The legacy `agent=tars`
  selector remains accepted for extension compatibility.
- Backed by `gpt-realtime-2.1` (configured at the runner level in main.py).
- Single tool: `point_at` — the model emits this when pointing would help.

Pointing strategy (two-tier, like the Swift macOS Tars):
- DOM-exact path: the frontend sends a DOM inventory alongside any
  screenshot; the model picks a `dom-N` id; the frontend maps that to a
  live `getBoundingClientRect()` and flies the triangle cursor there.
- Vision fallback path: for things not in the DOM (e.g. pixels inside a
  cross-origin iframe video), the model names the visual target. A dedicated
  computer-use grounding pass resolves final pixels before the cursor flies.
"""

from __future__ import annotations

import asyncio
from concurrent.futures import Future as ConcurrentFuture
import inspect
import logging
import re
from typing import Optional
import uuid

from agents import function_tool
from agents.realtime import RealtimeAgent
from pydantic import BaseModel

from app.agents.companion_identity import COMPANION_AGENT_NAME, with_companion_identity
from app.utils.ws_signals import tars_visual_state, ws_notify

logger = logging.getLogger(__name__)

_DIRECT_CLICK_INTENT_RE = re.compile(
    r"\b(click|tap|press)\b",
    flags=re.IGNORECASE,
)
_CONTROL_COMMAND_INTENT_RE = re.compile(
    r"(?:^|\b(?:please|then|and|tars|chat)\b[\s,:-]*|\b(?:can|could|would|will)\s+you\s+)"
    r"(?:open|select|choose|toggle|play|pause|activate|start|resume)\b",
    flags=re.IGNORECASE,
)


def _explicit_click_requested(transcript: str) -> bool:
    text = str(transcript or "").strip()
    return bool(
        _DIRECT_CLICK_INTENT_RE.search(text)
        or _CONTROL_COMMAND_INTENT_RE.search(text)
    )


# ── System instruction ───────────────────────────────────────────────────────

TARS_INSTRUCTION = """\
you are tars, a friendly concise voice assistant that lives in the user's \
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

browser lab mode:
- when the current server-verified page context contains `browserLab`, you are
  actively coaching that lab even though the browser tab is an external tool.
- when `browserLab` is absent, ignore this entire lab section: behave as the
  normal page companion, do not mention lab rules or exceptions, and never call
  `make_github_repository_private`.
- use only `browserLab.status`, `verified`, and `missingCriteria` to decide
  whether the lab is complete. `observedState` contains a small server-loaded
  snapshot of the real tool's detected state. never accept "i completed it" as
  proof by itself.
- while status is running, keep the learner focused on the lab objective. if
  they claim completion, briefly name the remaining verified criterion instead
  of congratulating them or asking what they want to do next.
- special Public-to-Private help rule for the
  `github_create_private_repository` workflow is owned by a deterministic
  server controller. never call a tool or add a preamble for a request to fix
  Public visibility; allow the controller to replace the turn with its single
  spoken response. the visible tars cursor must click Settings;
  the browser must not jump directly to the Settings URL. it must then visibly
  scroll to the Change visibility button and stop with the cursor on it. it must
  not click Change visibility, Change to private, or any confirmation control.
  after the cursor marks Change visibility, tell the learner to click it, choose
  Change to private, and complete GitHub's prompts manually. do not add another
  explanation or ask a question. this
  exception is only for changing the
  active lab repository from Public to Private; it never applies to deletion,
  tokens, credentials, purchases, publishing, or another repository.
- when status is verified and the learner says they are done, confirm the exact
  verified outcome in one short sentence, then tell them to return to
  Ctrl+Teach and press End lab. do not ask an open-ended follow-up question and
  do not switch into general page-assistant conversation.

the user will ask you to DO things, not just answer. this includes pointing. \
you are here to help, not just talk. when the user asks "where is", "show me", \
"point to", "find", "which one is", or otherwise references something on \
screen — point at it. don't describe its location in words when your cursor \
can fly straight to it.
- never say that you are pointing, showing, circling, or highlighting something \
  unless you call the matching visual tool in the same turn. for an explicit \
  pointing request, call `point_at` before speaking. `point_at` waits for the \
  browser or Sol and returns `status="point_ready"` only after the pointer has \
  been dispatched. do not claim the pointer has landed before that result. if \
  it returns `status="point_unavailable"`, say you could not locate the target.

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
- set `action="click"` ONLY if the user clearly asks to click, open, press, \
  select, play, or toggle. for a DOM target, its `actionable` field must be \
  true. for a non-DOM target inside a canvas, image, video, or iframe, use \
  the grounded x,y path with a precise label; the browser rejects stale or \
  unsafe coordinate clicks. otherwise use `action="none"`.
- for a specific visible word or phrase, use the target_id of its containing \
  text element when available and put the exact word or phrase in `label`. the \
  browser will resolve that text range precisely inside the element. use raw \
  x,y only when the text has no matching DOM inventory entry.
- for an object, word, icon, or other detail INSIDE a static webpage image, \
  never use the DOM id of the whole image. call \
  `point_at(x=..., y=..., label="specific target", coordinate_space="viewport")` \
  using your best full-screenshot pixel estimate. the \
  dedicated computer-use pass receives the complete lossless tab screenshot \
  and corrects the final pixel; x and y provide a fallback if grounding fails.
- for things visible on screen but NOT in the DOM inventory (e.g. pixels \
  inside a cross-origin iframe, canvas drawings, video content), call \
  `point_at(x=..., y=..., label="...")` with a concrete visual target. raw x/y \
  values are rough hints; final pixels are resolved by the grounding pass.
- when a second gridded non-DOM crop is provided, use that image for anything \
  inside its video, iframe, or canvas. set `coordinate_space="media"` \
  and read x/y on its labeled 0-1000 grid; the browser maps those local \
  coordinates through the exact live region rectangle. otherwise use \
  `coordinate_space="viewport"`.
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
- you also have `draw_on_screen`, `draw_screen_diagram`, \
`draw_screen_annotations`, and \
`clear_screen_drawings` tools. use them \
when the user asks you to draw, circle, box, underline, highlight, connect, \
trace, or visually explain something on the screen.
- supported shapes are `circle`, `rectangle`, `highlight`, `underline`, \
`triangle`, `arrow`, `line`, and `text`. use `text` to place a short label or note at a \
specific point on screen. pass the words to display in `label`; for non-DOM \
content also pass a short description of the existing placement target in \
`anchor_label`.
- when constructing a new diagram or any new multi-part geometry, call \
  `draw_screen_diagram` exactly once with every primitive in `items`.
- when two or more marks must align to existing visible targets, call \
  `draw_screen_annotations` exactly once. never build either kind of batch \
  through a sequence of separate `draw_on_screen` calls. the browser paints \
  both batch types atomically.
- when labelling an existing illustration, use exactly one `line` or `arrow` \
  item per labelled target and put the visible label text in that item's \
  `label`. the grounded segment ends at the label position and the browser \
  renders the label there. never add a second `text` item for the same label.
- a triangle is one `shape="triangle"` item with its bounding box, never three \
  line calls. this same rule applies to every supported compound shape.
- never calculate or supply numeric drawing coordinates. use DOM target ids when \
  available; the browser resolves those live. otherwise describe what each \
  primitive should mark or depict through `label` and `anchor_label`, and a \
  dedicated Sol pass calculates every final endpoint from the screenshot.
- use `style="dashed"` or `style="dotted"` when the user asks for a dotted or \
dashed line, arrow, circle, or rectangle. default is `style="solid"`.
- arrows have a visible arrowhead at the end point — use them to point from one \
element to another or to indicate direction.
- for circle/rectangle/highlight/underline around a DOM element, pass its \
  `target_id`; the browser uses the live element rectangle.
- for an arrow or line between DOM elements, pass `from_target_id` and \
  `to_target_id`.
- for content missing from the DOM inventory, provide a concrete `label`; \
  Sol uses that description and the screenshot to calculate final geometry.
- for a mark around or inside a static webpage image, never use the whole \
  image's DOM id and never use the media grid. set \
  `coordinate_space="viewport"`, provide a specific visual `label`, and use \
  the dedicated grounding pass to calculate final screenshot pixels.
- never use the DOM id of an entire video, iframe, or canvas when the user \
  wants a mark around an object inside its pixels; describe the object instead.
- when the gridded non-DOM crop is present, annotations inside that region \
  must set `coordinate_space="media"`; Sol calculates its coordinates.
- keep multi-item diagrams clean and minimal. never read ids or coordinates aloud.
- call `clear_screen_drawings` only when the user explicitly asks to clear or \
  erase the annotations. never clear drawings as part of completing a diagram.

browser interaction:
- use `interact_with_page` for scrolling, video playback, seeking, or switching \
  to a tab that the user explicitly names.
- supported actions are `scroll_up`, `scroll_down`, `pause_media`, \
  `play_media`, `seek_media`, and `activate_tab`.
- for `seek_media`, pass the desired absolute time in seconds as `value`.
- for `activate_tab`, use a tab id from the provided browser tab inventory as \
  `target_id`. never invent a tab id.
- hard GitHub rule: on a github.com/settings page, when the user asks for \
  Developer settings and no matching target is present in the visible DOM \
  inventory, you MUST call `interact_with_page(action="scroll_down", \
  label="Developer settings")` before replying. never say you cannot find \
  Developer settings until you have scrolled for it.
- never use a page interaction unless the user asked for it, except that the \
  required Developer settings scroll above is allowed. the browser also \
  automatically pauses playing media when push-to-talk begins.
- the browser enforces confirmation for submissions, purchases, deletes, \
  messages, account changes, file actions, and permission prompts.
"""


# ── Tool: point_at ───────────────────────────────────────────────────────────


async def _await_tool_notification(data: dict) -> None:
    notify = ws_notify.get()
    if notify is None:
        return
    try:
        result = notify(data)
        if isinstance(result, ConcurrentFuture):
            await asyncio.wrap_future(result)
        elif inspect.isawaitable(result):
            await result
    except Exception as exc:
        logger.debug("Could not send Tars tool notification: %s", exc)


async def _resolve_point_at(
    target_id: Optional[str] = None,
    x: Optional[float] = None,
    y: Optional[float] = None,
    coordinate_space: str = "viewport",
    label: str = "right here",
    action: str = "none",
) -> dict:
    """Resolve and deliver a point before returning control to Realtime."""

    runtime_state = tars_visual_state.get()
    transcript = (
        str(runtime_state.get("last_input_transcript") or "")
        if isinstance(runtime_state, dict)
        else ""
    )
    explicit_click = _explicit_click_requested(transcript)
    payload = {
        "target_id": target_id,
        "x": x,
        "y": y,
        "coordinate_space": "media" if coordinate_space == "media" else "viewport",
        "label": label,
        "action": "click" if action == "click" and explicit_click else "none",
    }
    if not isinstance(runtime_state, dict):
        return {**payload, "status": "point_pending", "browser_delivery": "backend"}

    generation = int(runtime_state.get("visual_generation") or 0)
    has_dom_target = bool(target_id)
    pending_id = uuid.uuid4().hex
    if not has_dom_target:
        await _await_tool_notification({
            "type": "tars_point_pending",
            "status": "started",
            "pendingId": pending_id,
            "label": label,
        })

    from app.services.tars_visual_locator import refine_tars_payload

    grounding_state = {
        key: dict(value) if isinstance(value, dict) else value
        for key, value in runtime_state.items()
        if key in {
            "tars_media_crop",
            "tars_viewport_capture",
            "last_input_transcript",
        }
    }
    try:
        refined = await refine_tars_payload(payload, grounding_state, tool_name="point_at")
    except asyncio.CancelledError:
        if not has_dom_target:
            await _await_tool_notification({
                "type": "tars_point_pending",
                "status": "cancelled",
                "pendingId": pending_id,
                "label": label,
            })
        raise
    except Exception as exc:
        logger.warning("Tars blocking point localization failed: %s", exc)
        refined = {
            **payload,
            "x": None,
            "y": None,
            "grounding": "failed",
            "grounding_failure": "exception",
        }

    is_stale = (
        int(runtime_state.get("visual_generation") or 0) != generation
        or not runtime_state.get("accepting_visual_tools")
    )
    if is_stale:
        if not has_dom_target:
            await _await_tool_notification({
                "type": "tars_point_pending",
                "status": "cancelled",
                "pendingId": pending_id,
                "label": label,
            })
        return {
            **payload,
            "status": "point_cancelled",
            "browser_delivery": "cancelled",
        }

    ready = (
        bool(refined.get("target_id"))
        or (
            isinstance(refined.get("x"), (int, float))
            and not isinstance(refined.get("x"), bool)
            and isinstance(refined.get("y"), (int, float))
            and not isinstance(refined.get("y"), bool)
        )
    )
    response = {
        "targetId": refined.get("target_id"),
        "x": refined.get("x"),
        "y": refined.get("y"),
        "coordinate_space": refined.get("coordinate_space") or "viewport",
        "label": refined.get("label") or "right here",
        "action": refined.get("action") or "none",
        "grounding": refined.get("grounding"),
        "groundingFailure": refined.get("grounding_failure"),
    }
    await _await_tool_notification({
        "type": "tars_point",
        "tool": "point_at",
        "response": response,
    })
    if not has_dom_target:
        await _await_tool_notification({
            "type": "tars_point_pending",
            "status": "completed" if ready else "failed",
            "pendingId": pending_id,
            "label": label,
        })
    return {
        **refined,
        "status": "point_ready" if ready else "point_unavailable",
        "browser_delivery": "complete",
    }


@function_tool(strict_mode=False)
async def point_at(
    target_id: Optional[str] = None,
    x: Optional[float] = None,
    y: Optional[float] = None,
    coordinate_space: str = "viewport",
    label: str = "right here",
    action: str = "none",
) -> dict:
    """Point the browser cursor and wait until its location is ready.

    Use `target_id` whenever a DOM inventory entry matches what the user is
    asking about — it yields sub-pixel precision because the browser resolves
    the live element's rect. Fall back to raw `x,y` only when pointing at
    something visible on screen but absent from the DOM inventory (e.g. pixels
    inside an iframe video). `action` must be "click" if and only if the user
    clearly asked to click/open/toggle. DOM targets must be `actionable`;
    non-DOM targets may use grounded coordinates and are guarded by the
    browser's active-tab, freshness, viewport, and confirmation checks.
    """
    return await _resolve_point_at(
        target_id=target_id,
        x=x,
        y=y,
        coordinate_space=coordinate_space,
        label=label,
        action=action,
    )


def _normalize_screen_drawing_item(value: dict) -> dict:
    supported_shapes = {
        "circle", "rectangle", "triangle", "highlight",
        "underline", "arrow", "line", "text",
    }
    supported_colors = {"blue", "teal", "red", "amber", "purple"}
    supported_styles = {"solid", "dashed", "dotted"}
    return {
        "shape": value["shape"] if value.get("shape") in supported_shapes else "rectangle",
        "target_id": value.get("target_id"),
        "from_target_id": value.get("from_target_id"),
        "to_target_id": value.get("to_target_id"),
        "coordinate_space": "media" if value.get("coordinate_space") == "media" else "viewport",
        "label": str(value.get("label") or "")[:120],
        "anchor_label": str(value.get("anchor_label") or "")[:120],
        "color": value["color"] if value.get("color") in supported_colors else "blue",
        "style": value["style"] if value.get("style") in supported_styles else "solid",
    }


@function_tool(strict_mode=False)
def draw_on_screen(
    shape: str,
    target_id: Optional[str] = None,
    from_target_id: Optional[str] = None,
    to_target_id: Optional[str] = None,
    coordinate_space: str = "viewport",
    label: str = "",
    anchor_label: str = "",
    color: str = "blue",
    style: str = "solid",
) -> dict:
    """Draw a transient annotation over the user's browser viewport.

    Supported shapes: circle, rectangle, triangle, highlight, underline,
    arrow, line, and text. The 'text' shape places a short label at a position — pass the
    label as the text content. For non-DOM text, describe the existing visual
    placement target in anchor_label.

    Use style="dashed" or style="dotted" for broken strokes on lines, arrows,
    circles, and rectangles. Default is "solid".

    Prefer target_id for a shape around one DOM element. For arrows or lines
    between elements, use from_target_id and to_target_id. Describe anything
    without a DOM target through label/anchor_label. Sol calculates the final
    screenshot coordinates; this tool does not accept model coordinates.
    """
    return _normalize_screen_drawing_item({
        "shape": shape,
        "target_id": target_id,
        "from_target_id": from_target_id,
        "to_target_id": to_target_id,
        "coordinate_space": coordinate_space,
        "label": label,
        "anchor_label": anchor_label,
        "color": color,
        "style": style,
    })


class ScreenDrawingItem(BaseModel):
    """One primitive in an atomic viewport diagram."""

    shape: str
    target_id: Optional[str] = None
    from_target_id: Optional[str] = None
    to_target_id: Optional[str] = None
    coordinate_space: str = "viewport"
    label: str = ""
    anchor_label: str = ""
    color: str = "blue"
    style: str = "solid"


@function_tool(strict_mode=False)
def draw_screen_diagram(items: list[ScreenDrawingItem]) -> dict:
    """Draw several transient primitives as one atomic screen diagram.

    Use this instead of repeated ``draw_on_screen`` calls whenever a request
    needs two or more newly created marks. Sol calculates the complete batch's
    final coordinates from one screenshot request.
    """

    annotations = []
    for item in items[:24]:
        value = item.model_dump()
        annotations.append(_normalize_screen_drawing_item(value))
    return {"annotations": annotations}


def _normalize_screen_annotation_batch(items: list[ScreenDrawingItem]) -> dict:
    """Remove redundant generated labels and preserve only useful grounding."""

    normalized_items = [
        _normalize_screen_drawing_item(item.model_dump())
        for item in items[:24]
    ]
    leader_labels = {
        str(value.get("label") or "").strip().casefold()
        for value in normalized_items
        if value.get("shape") in {"line", "arrow"}
        and str(value.get("label") or "").strip()
    }
    annotations = []
    for value in normalized_items:
        label_key = str(value.get("label") or "").strip().casefold()
        # A labelled leader line already carries its visible text. Realtime
        # sometimes emits a duplicate text item; grounding that invented text
        # searches for something that is not in the screenshot, adds another
        # expensive locator call, and often places it at a viewport edge.
        if value.get("shape") == "text" and label_key in leader_labels:
            continue
        annotations.append(value)
    return {"annotations": annotations}


@function_tool(strict_mode=False)
def draw_screen_annotations(items: list[ScreenDrawingItem]) -> dict:
    """Draw two or more marks aligned to existing visible screen targets.

    All items are visually grounded concurrently and replaced as one atomic
    batch. Use ``draw_screen_diagram`` instead for newly invented geometry.
    """

    return _normalize_screen_annotation_batch(items)


@function_tool(strict_mode=False)
def clear_screen_drawings() -> dict:
    """Clear all Tars annotations currently visible on the screen."""
    return {"action": "clear"}


@function_tool(strict_mode=False)
def interact_with_page(
    action: str,
    target_id: Optional[str] = None,
    value: Optional[float] = None,
    label: str = "",
) -> dict:
    """Request a constrained browser or media action.

    Tab ids and DOM target ids must come from the most recent browser context.
    The extension rejects stale contexts and applies its own safety policy.
    """
    supported = {
        "scroll_up",
        "scroll_down",
        "pause_media",
        "play_media",
        "seek_media",
        "activate_tab",
    }
    return {
        "action": action if action in supported else "none",
        "target_id": target_id,
        "value": value,
        "label": label[:80],
    }


def _github_repository_private_action(runtime_state: object) -> dict:
    """Validate and create the narrow Public-to-Private automation action."""

    if not isinstance(runtime_state, dict):
        return {"status": "unavailable", "action": "none"}
    context = runtime_state.get("companion_page_context")
    lab = context.get("browserLab") if isinstance(context, dict) else None
    observed = lab.get("observedState") if isinstance(lab, dict) else None
    valid_lab = bool(
        isinstance(lab, dict)
        and lab.get("active")
        and lab.get("workflow") == "github_create_private_repository"
        and lab.get("status") == "running"
        and isinstance(observed, dict)
        and observed.get("repositoryCreated") is True
        and observed.get("repositoryVisibility") == "public"
    )
    if not valid_lab:
        return {"status": "unavailable", "action": "none"}

    already_granted = bool(runtime_state.get("github_visibility_override_granted"))
    prior_requests = int(
        runtime_state.get("github_visibility_request_count_at_turn_start") or 0
    )
    if not already_granted and prior_requests < 1:
        return {"status": "repeat_required", "action": "none"}

    repository_nwo = str(observed.get("repositoryNameWithOwner") or "")[:180]
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository_nwo):
        return {"status": "unavailable", "action": "none"}

    runtime_state["github_visibility_override_granted"] = True
    return {
        "status": "started",
        "action": "github_make_private",
        "repositoryNameWithOwner": repository_nwo,
    }


@function_tool(strict_mode=False)
def make_github_repository_private() -> dict:
    """Apply the one-time repeated-request exception for the active GitHub lab.

    The tool is deliberately narrow: server-verified Lab Mode must identify a
    created Public repository, and a prior explicit help request must already
    exist. The extension independently scopes execution to the active lab tab.
    """

    return _github_repository_private_action(tars_visual_state.get())


# ── Builder ─────────────────────────────────────────────────────────────────


def build_tars_agent(teaching_profile_instruction: str = "") -> RealtimeAgent:
    """Construct the Tars RealtimeAgent tree (no sub-agents)."""
    root = RealtimeAgent(
        name=COMPANION_AGENT_NAME,
        instructions=with_companion_identity(
            TARS_INSTRUCTION,
            teaching_profile_instruction,
        ),
        tools=[
            point_at,
            draw_on_screen,
            draw_screen_diagram,
            draw_screen_annotations,
            clear_screen_drawings,
            interact_with_page,
        ],
        handoffs=[],
    )
    logger.info(
        "Unified companion built: mode=page root=%s tools=point_at,draw_on_screen,draw_screen_diagram,draw_screen_annotations,clear_screen_drawings,interact_with_page",
        root.name,
    )
    return root
