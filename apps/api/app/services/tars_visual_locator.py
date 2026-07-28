"""High-precision visual grounding for Tars screen annotations.

The realtime model decides *what* Tars should point at or draw. A dedicated
GPT computer-use pass determines *where* every drawing belongs in the exact
screenshot pixel space. Realtime drawing coordinates are neither accepted nor
forwarded to the locator.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
from dataclasses import dataclass
from io import BytesIO
import json
import logging
import time
from typing import Any, Literal

from openai import AsyncOpenAI
from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None

LocalizationMode = Literal["point", "bounds", "segment"]


@dataclass(frozen=True)
class LocalizationResult:
    """A spatial result expressed in the supplied image's pixel coordinates."""

    mode: LocalizationMode
    start: tuple[float, float]
    end: tuple[float, float] | None = None


def _openai_client() -> AsyncOpenAI | None:
    global _client
    if not settings.openai_api_key:
        return None
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            timeout=settings.tars_visual_locator_timeout_seconds,
        )
    return _client


def _computer_call(response: Any) -> Any | None:
    return next(
        (item for item in getattr(response, "output", []) if getattr(item, "type", "") == "computer_call"),
        None,
    )


def _computer_actions(computer_call: Any) -> list[Any]:
    """Return current batched actions plus the legacy single-action shape."""

    actions = list(getattr(computer_call, "actions", []) or [])
    single_action = getattr(computer_call, "action", None)
    if single_action is not None:
        actions.append(single_action)
    return actions


def _requests_screenshot(computer_call: Any) -> bool:
    return any(
        getattr(action, "type", "") == "screenshot"
        for action in _computer_actions(computer_call)
    )


def _xy(value: Any) -> tuple[float, float] | None:
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        x, y = value[0], value[1]
    elif isinstance(value, dict):
        x, y = value.get("x"), value.get("y")
    else:
        x, y = getattr(value, "x", None), getattr(value, "y", None)
    if isinstance(x, (int, float)) and isinstance(y, (int, float)):
        return float(x), float(y)
    return None


def _spatial_result_from_actions(
    actions: list[Any],
    requested_mode: LocalizationMode,
) -> LocalizationResult | None:
    """Extract one click or drag geometry from an ordered action slice."""

    click: tuple[float, float] | None = None
    move: tuple[float, float] | None = None
    for action in actions:
        action_type = getattr(action, "type", "")
        if action_type == "drag":
            path = [point for point in (_xy(item) for item in (getattr(action, "path", []) or [])) if point]
            if len(path) >= 2:
                start, end = path[0], path[-1]
                if requested_mode == "point":
                    return LocalizationResult(
                        mode="point",
                        start=((start[0] + end[0]) / 2, (start[1] + end[1]) / 2),
                    )
                if requested_mode == "bounds":
                    start = min(start[0], end[0]), min(start[1], end[1])
                    end = max(path[0][0], path[-1][0]), max(path[0][1], path[-1][1])
                return LocalizationResult(mode=requested_mode, start=start, end=end)
        point = _xy(action)
        if point is None:
            continue
        if action_type in {"click", "double_click"}:
            click = point
        elif action_type == "move":
            move = point

    # A point cannot establish requested bounds or segment endpoints. Reject it
    # instead of presenting rough Realtime geometry as fully grounded.
    point = click or move
    if requested_mode != "point":
        return None
    return LocalizationResult(mode="point", start=point) if point else None


def _spatial_result(computer_call: Any, requested_mode: LocalizationMode) -> LocalizationResult | None:
    """Extract a click or drag geometry from a computer-use call."""

    return _spatial_result_from_actions(_computer_actions(computer_call), requested_mode)


def _prompt_for(mode: LocalizationMode, description: str, shape: str) -> str:
    target = description.strip() or "the object requested by the user"
    shared = (
        "This is visual localization only. Inspect the screenshot, identify the target below, "
        "and return exactly one computer action. Do not type, scroll, or interact with anything "
        "else. Be pixel-precise and exclude nearby labels, controls, and background.\n\n"
        f"Target: {target}\n"
    )
    if mode == "bounds":
        return shared + (
            "Return one drag action from the target's tight top-left visible boundary to its "
            "tight bottom-right visible boundary. The drag is a bounding-box measurement only."
        )
    if mode == "segment":
        if shape == "underline":
            instruction = (
                "Return one drag action from the left endpoint to the right endpoint of a tight "
                "underline directly beneath the target."
            )
        else:
            instruction = (
                "Return one drag action whose start and end exactly match the visual connection "
                "requested by the user. Preserve the requested direction for an arrow."
            )
        return shared + instruction
    return shared + "Return one left click at the exact visual center of the target."


def _batch_prompt(requests: list[dict[str, str]]) -> str:
    lines = [
        "You calculate final screen-drawing coordinates. Inspect the screenshot and return exactly ",
        f"{len(requests)} computer actions in one computer call, in the numbered order below. ",
        "The screenshot is the exact drawing canvas. Do not type, scroll, activate controls, or ",
        "interact with anything. Existing-content requests must be pixel-precise. New diagrams ",
        "must use a clear, coherent area of the screenshot. Each numbered request must produce ",
        "exactly one action.\n",
    ]
    for index, request in enumerate(requests, start=1):
        mode = request["mode"]
        shape = request.get("shape", "")
        target = request["description"]
        if mode == "bounds":
            instruction = (
                "drag its final top-left to bottom-right bounds; tightly bound an existing target, "
                "or choose clean coherent bounds when creating new geometry"
            )
        elif mode == "segment" and shape == "underline":
            instruction = "drag a tight underline from left to right directly beneath it"
        elif mode == "segment" and shape in {"line", "arrow"}:
            instruction = (
                "drag the exact requested segment; for a label leader, start on the visible target "
                "and end at nearby clear label space without covering the diagram"
            )
        elif mode == "segment":
            instruction = "drag the requested visual connection from its start to its end"
        else:
            instruction = "click its exact visual center"
        lines.append(f"{index}. Target: {target}. Action: {instruction}.\n")
    return "".join(lines)


def _clamp_result(result: LocalizationResult, width: int, height: int) -> LocalizationResult:
    def clamp(point: tuple[float, float]) -> tuple[float, float]:
        return (
            max(0.0, min(float(width), point[0])),
            max(0.0, min(float(height), point[1])),
        )

    return LocalizationResult(
        mode=result.mode,
        start=clamp(result.start),
        end=clamp(result.end) if result.end else None,
    )


async def locate_visual_target(
    *,
    image_base64: str,
    mime_type: str,
    width: int,
    height: int,
    description: str,
    mode: LocalizationMode = "point",
    shape: str = "",
    model: str | None = None,
) -> LocalizationResult | None:
    """Locate a target with the GA computer tool on GPT-5.6 Sol."""

    client = _openai_client()
    if client is None or not settings.tars_visual_locator_enabled:
        return None
    if not image_base64 or width < 1 or height < 1:
        return None

    selected_model = model or settings.tars_visual_locator_model
    prompt = _prompt_for(mode, description, shape)
    started_at = time.perf_counter()
    timeout_seconds = settings.tars_visual_locator_timeout_seconds
    deadline = time.monotonic() + timeout_seconds

    try:
        response = await asyncio.wait_for(
            client.responses.create(
                model=selected_model,
                service_tier=settings.tars_visual_locator_service_tier,
                input=[{
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                        {
                            "type": "input_image",
                            "image_url": f"data:{mime_type};base64,{image_base64}",
                            "detail": "original",
                        },
                    ],
                }],
                # GPT-5.5+ models use the GA `computer` tool. The deprecated
                # `computer_use_preview` tool is only valid with the legacy
                # `computer-use-preview` model and is rejected by GPT-5.6 Sol.
                tools=[{"type": "computer"}],
                tool_choice="required",
                max_tool_calls=1,
                parallel_tool_calls=False,
                reasoning={"effort": settings.tars_visual_locator_reasoning_effort},
                # Reasoning tokens count against this limit. Keep enough room
                # for deployments that intentionally select high/xhigh while
                # still returning the tiny computer action payload.
                max_output_tokens=2048,
            ),
            timeout=timeout_seconds,
        )
        computer_call = _computer_call(response)
        if computer_call is None:
            return None
        raw_result = _spatial_result(computer_call, mode)
        # The GA computer tool may ask for a screenshot before emitting an
        # action. Return the same immutable frame as computer_call_output and
        # allow one follow-up call; localization never executes the action.
        if (
            raw_result is None
            and _requests_screenshot(computer_call)
            and getattr(response, "id", None)
            and getattr(computer_call, "call_id", None)
        ):
            response = await asyncio.wait_for(
                client.responses.create(
                    model=selected_model,
                    service_tier=settings.tars_visual_locator_service_tier,
                    tools=[{"type": "computer"}],
                    tool_choice="required",
                    previous_response_id=response.id,
                    input=[{
                        "type": "computer_call_output",
                        "call_id": computer_call.call_id,
                        "output": {
                            "type": "computer_screenshot",
                            "image_url": f"data:{mime_type};base64,{image_base64}",
                            "detail": "original",
                        },
                    }],
                    max_tool_calls=1,
                    parallel_tool_calls=False,
                    reasoning={"effort": settings.tars_visual_locator_reasoning_effort},
                    max_output_tokens=2048,
                ),
                timeout=max(0.001, deadline - time.monotonic()),
            )
            computer_call = _computer_call(response)
            if computer_call is None:
                return None
            raw_result = _spatial_result(computer_call, mode)
        if raw_result is None:
            return None
        result = _clamp_result(raw_result, width, height)
        logger.info(
            "Tars visual locator model=%s mode=%s target=%r start=%s end=%s image=%dx%d latency_ms=%d",
            selected_model,
            result.mode,
            description,
            result.start,
            result.end,
            width,
            height,
            int((time.perf_counter() - started_at) * 1000),
        )
        return result
    except Exception as exc:
        logger.warning(
            "Tars visual localization failed model=%s mode=%s: %s",
            selected_model,
            mode,
            exc,
        )
    return None


async def locate_visual_targets_batch(
    *,
    image_base64: str,
    mime_type: str,
    width: int,
    height: int,
    requests: list[dict[str, str]],
    model: str | None = None,
) -> list[LocalizationResult | None]:
    """Locate an ordered annotation batch with exactly one Sol API request.

    Force a coordinate-submission function instead of using the computer
    tool's screenshot loop. The computer tool can otherwise spend its only
    action requesting a screenshot that is already attached.
    """

    if not requests:
        return []
    client = _openai_client()
    if client is None or not settings.tars_visual_locator_enabled:
        return [None] * len(requests)
    if not image_base64 or width < 1 or height < 1:
        return [None] * len(requests)

    selected_model = model or settings.tars_visual_locator_model
    started_at = time.perf_counter()
    coordinate_tool = {
        "type": "function",
        "name": "submit_screen_coordinates",
        "description": (
            "Submit final screenshot-pixel coordinates for every numbered "
            "drawing request, in exactly the same order. Do not omit an item."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "coordinates": {
                    "type": "array",
                    "minItems": len(requests),
                    "maxItems": len(requests),
                    "items": {
                        "type": "object",
                        "properties": {
                            "x": {
                                "type": "number",
                                "description": "Start x in pixels from the screenshot's left edge.",
                            },
                            "y": {
                                "type": "number",
                                "description": "Start y in pixels from the screenshot's top edge.",
                            },
                            "end_x": {
                                "anyOf": [{"type": "number"}, {"type": "null"}],
                                "description": "Drag end x, or null for a point request.",
                            },
                            "end_y": {
                                "anyOf": [{"type": "number"}, {"type": "null"}],
                                "description": "Drag end y, or null for a point request.",
                            },
                        },
                        "required": ["x", "y", "end_x", "end_y"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["coordinates"],
            "additionalProperties": False,
        },
        "strict": True,
    }
    try:
        response = await asyncio.wait_for(
            client.responses.create(
                model=selected_model,
                service_tier=settings.tars_visual_locator_service_tier,
                input=[{
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": _batch_prompt(requests)},
                        {
                            "type": "input_image",
                            "image_url": f"data:{mime_type};base64,{image_base64}",
                            "detail": "original",
                        },
                    ],
                }],
                tools=[coordinate_tool],
                tool_choice={"type": "function", "name": "submit_screen_coordinates"},
                max_tool_calls=1,
                parallel_tool_calls=False,
                reasoning={"effort": settings.tars_visual_locator_batch_reasoning_effort},
                max_output_tokens=4096,
            ),
            timeout=settings.tars_visual_locator_timeout_seconds,
        )
        function_call = next(
            (
                item
                for item in getattr(response, "output", [])
                if getattr(item, "type", "") == "function_call"
                and getattr(item, "name", "") == "submit_screen_coordinates"
            ),
            None,
        )
        if function_call is None:
            logger.warning(
                "Tars visual batch response contained no coordinate function response_id=%s status=%s output_types=%s",
                getattr(response, "id", None),
                getattr(response, "status", None),
                [getattr(item, "type", type(item).__name__) for item in getattr(response, "output", [])],
            )
            return [None] * len(requests)
        raw_arguments = str(getattr(function_call, "arguments", "") or "{}")
        logger.info(
            "Tars visual batch raw response id=%s status=%s function=%s arguments=%s",
            getattr(response, "id", None),
            getattr(response, "status", None),
            getattr(function_call, "name", None),
            raw_arguments,
        )
        parsed = json.loads(raw_arguments)
        coordinates = parsed.get("coordinates")
        if not isinstance(coordinates, list):
            return [None] * len(requests)
        results: list[LocalizationResult | None] = []
        for index, request in enumerate(requests):
            coordinate = coordinates[index] if index < len(coordinates) else None
            raw_result: LocalizationResult | None = None
            if isinstance(coordinate, dict):
                x, y = coordinate.get("x"), coordinate.get("y")
                end_x, end_y = coordinate.get("end_x"), coordinate.get("end_y")
                has_start = (
                    isinstance(x, (int, float))
                    and not isinstance(x, bool)
                    and isinstance(y, (int, float))
                    and not isinstance(y, bool)
                )
                has_end = (
                    isinstance(end_x, (int, float))
                    and not isinstance(end_x, bool)
                    and isinstance(end_y, (int, float))
                    and not isinstance(end_y, bool)
                )
                mode = request["mode"]
                if has_start and mode == "point":
                    raw_result = LocalizationResult(
                        mode="point",
                        start=(float(x), float(y)),
                    )
                elif has_start and has_end:
                    start = (float(x), float(y))
                    end = (float(end_x), float(end_y))
                    if mode == "bounds":
                        start, end = (
                            (min(start[0], end[0]), min(start[1], end[1])),
                            (max(start[0], end[0]), max(start[1], end[1])),
                        )
                    raw_result = LocalizationResult(mode=mode, start=start, end=end)
            results.append(_clamp_result(raw_result, width, height) if raw_result else None)
        logger.info(
            "Tars visual batch locator model=%s requested=%d returned=%d image=%dx%d latency_ms=%d",
            selected_model,
            len(requests),
            sum(result is not None for result in results),
            width,
            height,
            int((time.perf_counter() - started_at) * 1000),
        )
        return results
    except Exception as exc:
        logger.warning(
            "Tars visual batch localization failed model=%s requested=%d: %s",
            selected_model,
            len(requests),
            exc,
        )
        return [None] * len(requests)


def _capture_for_payload(payload: dict[str, Any], state: dict[str, Any]) -> tuple[dict[str, Any], float, float] | None:
    coordinate_space = payload.get("coordinate_space")
    if coordinate_space == "media":
        crop = state.get("tars_media_crop")
        if not isinstance(crop, dict):
            return None
        return crop, 1000.0, 1000.0

    capture = state.get("tars_viewport_capture")
    if not isinstance(capture, dict):
        capture = state.get("classroom_canvas_capture")
    if not isinstance(capture, dict):
        return None
    width = float(capture.get("width") or 0)
    height = float(capture.get("height") or 0)
    return (capture, width, height) if width > 0 and height > 0 else None


def _mode_for(tool_name: str, shape: str) -> LocalizationMode:
    if tool_name == "point_at":
        return "point"
    if shape in {"rectangle", "triangle", "highlight", "circle"}:
        return "bounds"
    if shape in {"underline", "line", "arrow"}:
        return "segment"
    # text annotations are grounded at a single point (the anchor position).
    return "point"


def _scaled_point(
    point: tuple[float, float],
    *,
    image_width: int,
    image_height: int,
    output_width: float,
    output_height: float,
) -> tuple[float, float]:
    return (
        point[0] * output_width / max(1, image_width),
        point[1] * output_height / max(1, image_height),
    )


def _recenter_existing_bounds(
    payload: dict[str, Any],
    center: tuple[float, float],
    output_width: float,
    output_height: float,
) -> dict[str, Any]:
    refined = dict(payload)
    values = [payload.get(key) for key in ("x", "y", "end_x", "end_y")]
    if all(isinstance(value, (int, float)) for value in values):
        x, y, end_x, end_y = (float(value) for value in values)
        delta_x = center[0] - (x + end_x) / 2
        delta_y = center[1] - (y + end_y) / 2
        refined["x"] = max(0.0, min(output_width, x + delta_x))
        refined["y"] = max(0.0, min(output_height, y + delta_y))
        refined["end_x"] = max(0.0, min(output_width, end_x + delta_x))
        refined["end_y"] = max(0.0, min(output_height, end_y + delta_y))
    else:
        refined["x"], refined["y"] = center
    return refined


def _drawing_semantics(
    payload: dict[str, Any],
    *,
    include_dom_targets: bool = False,
) -> dict[str, Any]:
    """Remove every numeric coordinate hint from a Realtime drawing payload."""

    keys = [
        "shape",
        "coordinate_space",
        "label",
        "anchor_label",
        "color",
        "style",
    ]
    if include_dom_targets:
        keys.extend(("target_id", "from_target_id", "to_target_id"))
    return {
        key: payload.get(key)
        for key in keys
        if payload.get(key) is not None
    }


async def refine_tars_payload(
    payload: dict[str, Any],
    state: dict[str, Any],
    *,
    tool_name: str,
    model: str | None = None,
) -> dict[str, Any]:
    """Ground any non-DOM Tars point or annotation with computer use."""

    is_drawing = tool_name == "draw_on_screen"
    has_dom_target = any(
        payload.get(key)
        for key in ("target_id", "from_target_id", "to_target_id")
    )
    if is_drawing and has_dom_target:
        return {
            **_drawing_semantics(payload, include_dom_targets=True),
            "grounding": "dom",
            "coordinate_source": "dom",
        }
    if is_drawing:
        result = (await refine_tars_payloads_batch([payload], state, model=model))[0]
        if result.get("grounding") == "computer_use_batch":
            result = {**result, "grounding": "computer_use"}
        return result

    if not is_drawing and has_dom_target:
        return payload

    def point_fallback(reason: str) -> dict[str, Any]:
        x = payload.get("x")
        y = payload.get("y")
        has_rough_point = (
            isinstance(x, (int, float))
            and not isinstance(x, bool)
            and isinstance(y, (int, float))
            and not isinstance(y, bool)
        )
        return {
            **payload,
            "x": float(x) if has_rough_point else None,
            "y": float(y) if has_rough_point else None,
            "grounding": "realtime_fallback" if has_rough_point else "failed",
            "grounding_failure": reason,
        }

    # Static webpage images deliberately do not create a media crop. If the
    # Realtime model nevertheless selects the media coordinate space, ground
    # the point against the complete tab screenshot and return viewport pixels.
    if (
        tool_name == "point_at"
        and payload.get("coordinate_space") == "media"
        and not isinstance(state.get("tars_media_crop"), dict)
        and isinstance(state.get("tars_viewport_capture"), dict)
    ):
        payload = {**payload, "coordinate_space": "viewport"}
    capture_info = _capture_for_payload(payload, state)
    if capture_info is None:
        if tool_name == "point_at":
            return point_fallback("capture_unavailable")
        return point_fallback("capture_unavailable")
    capture, output_width, output_height = capture_info

    image_width = int(capture.get("width") or 0)
    image_height = int(capture.get("height") or 0)
    image_data = str(capture.get("rawData") or capture.get("data") or "")
    image_mime = str(capture.get("rawMimeType") or capture.get("mimeType") or "image/png")
    if image_width < 1 or image_height < 1 or not image_data:
        if tool_name == "point_at":
            return point_fallback("invalid_capture")
        return point_fallback("invalid_capture")

    shape = str(payload.get("shape") or "")
    label = str(payload.get("label") or "").strip()
    anchor_label = str(payload.get("anchor_label") or "").strip()
    transcript = str(state.get("last_input_transcript") or "").strip()
    description = (
        anchor_label or "requested text placement"
        if shape == "text"
        else label or "requested target"
    )
    if transcript and shape != "text":
        description = f"{description} (user request: {transcript})"
    requested_mode = _mode_for(tool_name, shape)

    result = await locate_visual_target(
        image_base64=image_data,
        mime_type=image_mime,
        width=image_width,
        height=image_height,
        description=description,
        mode=requested_mode,
        shape=shape,
        model=model,
    )
    if result is None:
        logger.warning(
            "Tars visual locator returned no point target=%r image=%dx%d mime=%s",
            description,
            image_width,
            image_height,
            image_mime,
        )
        if tool_name == "point_at":
            return point_fallback("locator_no_result")
        return point_fallback("locator_no_result")
    result_matches_request = (
        result.mode == requested_mode
        and (result.end is None if requested_mode == "point" else result.end is not None)
    )
    if not result_matches_request:
        logger.warning(
            "Tars visual locator mode mismatch target=%r requested=%s received=%s",
            description,
            requested_mode,
            result.mode,
        )
        if tool_name == "point_at":
            return point_fallback("locator_mode_mismatch")
        return point_fallback("locator_mode_mismatch")

    start = _scaled_point(
        result.start,
        image_width=image_width,
        image_height=image_height,
        output_width=output_width,
        output_height=output_height,
    )
    end = (
        _scaled_point(
            result.end,
            image_width=image_width,
            image_height=image_height,
            output_width=output_width,
            output_height=output_height,
        )
        if result.end
        else None
    )

    if tool_name == "point_at":
        if end:
            start = ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)
        refined = {**payload, "x": start[0], "y": start[1]}
    elif end:
        refined = {
            **payload,
            "x": start[0],
            "y": start[1],
            "end_x": end[0],
            "end_y": end[1],
        }
    else:
        refined = _recenter_existing_bounds(payload, start, output_width, output_height)

    refined["grounding"] = "computer_use"
    refined["grounding_model"] = model or settings.tars_visual_locator_model
    refined["grounding_mode"] = result.mode
    return refined


async def refine_tars_payloads_batch(
    payloads: list[dict[str, Any]],
    state: dict[str, Any],
    *,
    model: str | None = None,
) -> list[dict[str, Any]]:
    """Ground a drawing batch with one Sol request and no per-item retries."""

    if not payloads:
        return []

    refined_payloads: list[dict[str, Any] | None] = [None] * len(payloads)
    locator_indices: list[int] = []
    locator_requests: list[dict[str, str]] = []
    transcript = str(state.get("last_input_transcript") or "").strip()
    viewport_capture = state.get("tars_viewport_capture")
    classroom_capture = state.get("classroom_canvas_capture")
    media_capture = state.get("tars_media_crop")
    if isinstance(viewport_capture, dict):
        capture = viewport_capture
        output_width = float(capture.get("width") or 0)
        output_height = float(capture.get("height") or 0)
        output_coordinate_space = "viewport"
    elif isinstance(classroom_capture, dict):
        capture = classroom_capture
        output_width = float(capture.get("width") or 0)
        output_height = float(capture.get("height") or 0)
        output_coordinate_space = "viewport"
    elif isinstance(media_capture, dict):
        capture = media_capture
        output_width = 1000.0
        output_height = 1000.0
        output_coordinate_space = "media"
    else:
        capture = None
        output_width = 0.0
        output_height = 0.0

    for index, original_payload in enumerate(payloads):
        has_dom_target = any(
            original_payload.get(key)
            for key in ("target_id", "from_target_id", "to_target_id")
        )
        if has_dom_target:
            refined_payloads[index] = {
                **_drawing_semantics(original_payload, include_dom_targets=True),
                "grounding": "dom",
                "coordinate_source": "dom",
            }
            continue

        payload = _drawing_semantics(original_payload)
        shape = str(payload.get("shape") or "")
        label = str(payload.get("label") or "").strip()
        anchor_label = str(payload.get("anchor_label") or "").strip()
        description = (
            anchor_label or "requested text placement"
            if shape == "text"
            else label or "requested target"
        )
        if transcript and shape != "text":
            description = f"{description} (user request: {transcript})"
        locator_indices.append(index)
        locator_requests.append({
            "description": f"{shape or 'drawing'}: {description}",
            "mode": _mode_for("draw_on_screen", shape),
            "shape": shape,
        })

    if locator_requests and capture is not None and output_width > 0 and output_height > 0:
        image_width = int(capture.get("width") or 0)
        image_height = int(capture.get("height") or 0)
        image_data = str(capture.get("rawData") or capture.get("data") or "")
        image_mime = str(capture.get("rawMimeType") or capture.get("mimeType") or "image/png")
        located = await locate_visual_targets_batch(
            image_base64=image_data,
            mime_type=image_mime,
            width=image_width,
            height=image_height,
            requests=locator_requests,
            model=model,
        )
        for index, request, result in zip(locator_indices, locator_requests, located):
            payload = _drawing_semantics(payloads[index])
            if result is None:
                logger.warning(
                    "Tars visual batch locator missed target=%r shape=%s; annotation skipped",
                    request["description"],
                    payload.get("shape"),
                )
                refined_payloads[index] = {
                    **payload,
                    "grounding": "failed",
                    "grounding_failure": "batch_locator_missing",
                    "coordinate_source": "sol_missing",
                }
                continue
            result_matches_request = (
                result.mode == request["mode"]
                and (result.end is None if request["mode"] == "point" else result.end is not None)
            )
            if not result_matches_request:
                logger.warning(
                    "Tars visual batch locator mode mismatch target=%r requested=%s received=%s; annotation skipped",
                    request["description"],
                    request["mode"],
                    result.mode,
                )
                refined_payloads[index] = {
                    **payload,
                    "grounding": "failed",
                    "grounding_failure": "batch_locator_mode_mismatch",
                    "coordinate_source": "sol_missing",
                }
                continue
            start = _scaled_point(
                result.start,
                image_width=image_width,
                image_height=image_height,
                output_width=output_width,
                output_height=output_height,
            )
            end = (
                _scaled_point(
                    result.end,
                    image_width=image_width,
                    image_height=image_height,
                    output_width=output_width,
                    output_height=output_height,
                )
                if result.end
                else None
            )
            if end:
                refined = {
                    **payload,
                    "x": start[0],
                    "y": start[1],
                    "end_x": end[0],
                    "end_y": end[1],
                }
            else:
                refined = _recenter_existing_bounds(payload, start, output_width, output_height)
            refined["coordinate_space"] = output_coordinate_space
            refined["grounding"] = "computer_use_batch"
            refined["grounding_model"] = model or settings.tars_visual_locator_model
            refined["grounding_mode"] = request["mode"]
            refined["coordinate_source"] = "sol"
            refined_payloads[index] = refined
        return [
            value if isinstance(value, dict) else {
                **_drawing_semantics(payload),
                "grounding": "failed",
                "grounding_failure": "batch_unresolved",
                "coordinate_source": "sol_missing",
            }
            for payload, value in zip(payloads, refined_payloads)
        ]

    if not locator_requests:
        return [value for value in refined_payloads if isinstance(value, dict)]

    reason = "capture_unavailable" if capture is None else "invalid_capture"
    logger.warning(
        "Tars visual batch locator skipped all annotations reason=%s count=%d",
        reason,
        len(locator_requests),
    )
    for index in locator_indices:
        refined_payloads[index] = {
            **_drawing_semantics(payloads[index]),
            "grounding": "failed",
            "grounding_failure": reason,
            "coordinate_source": "sol_missing",
        }
    return [
        value if isinstance(value, dict) else {
            **_drawing_semantics(payload),
            "grounding": "failed",
            "grounding_failure": "batch_unresolved",
            "coordinate_source": "sol_missing",
        }
        for payload, value in zip(payloads, refined_payloads)
    ]


async def refine_media_payload(payload: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    """Backward-compatible wrapper for older call sites."""

    tool_name = "draw_on_screen" if payload.get("shape") else "point_at"
    return await refine_tars_payload(payload, state, tool_name=tool_name)


def crop_image_region(
    image_base64: str,
    bounds: dict[str, Any],
) -> tuple[str, int, int, int, int] | None:
    """Crop a screenshot to trusted pixel bounds.

    Returns ``(base64, crop_width, crop_height, left, top)``. Bounds are
    clamped to the decoded image so stale viewport metadata cannot make Pillow
    read outside the capture.
    """

    try:
        raw = base64.b64decode(image_base64, validate=True)
        with Image.open(BytesIO(raw)) as source:
            source.load()
            left = max(0, min(source.width - 1, int(round(float(bounds.get("x", 0))))))
            top = max(0, min(source.height - 1, int(round(float(bounds.get("y", 0))))))
            right = max(
                left + 1,
                min(source.width, int(round(float(bounds.get("x", 0)) + float(bounds.get("width", 0))))),
            )
            bottom = max(
                top + 1,
                min(source.height, int(round(float(bounds.get("y", 0)) + float(bounds.get("height", 0))))),
            )
            if right - left < 2 or bottom - top < 2:
                return None
            cropped = source.crop((left, top, right, bottom)).convert("RGB")
            output = BytesIO()
            cropped.save(output, format="JPEG", quality=92, optimize=True)
            return (
                base64.b64encode(output.getvalue()).decode("ascii"),
                cropped.width,
                cropped.height,
                left,
                top,
            )
    except (ValueError, TypeError, OSError, binascii.Error) as exc:
        logger.warning("Could not crop classroom image bounds: %s", exc)
        return None


async def refine_classroom_point(
    payload: dict[str, Any],
    state: dict[str, Any],
    *,
    model: str | None = None,
) -> dict[str, Any]:
    """Ground a Live Classroom point against its exact captured viewport.

    For targets inside the generated course image, Excalidraw provides the
    authoritative visible image rectangle. We crop to it first, let GPT-5.6 Sol
    find the semantic target inside that crop, then translate the result back
    into the original screenshot coordinate space.
    """

    point = payload.get("tarsPoint")
    if not isinstance(point, dict):
        return payload
    capture = state.get("classroom_canvas_capture")
    if not isinstance(capture, dict):
        return point

    screenshot_data = str(capture.get("data") or "")
    screenshot_width = int(capture.get("width") or 0)
    screenshot_height = int(capture.get("height") or 0)
    if not screenshot_data or screenshot_width < 1 or screenshot_height < 1:
        return point

    image_data = screenshot_data
    image_width = screenshot_width
    image_height = screenshot_height
    offset_x = 0
    offset_y = 0
    used_course_image_crop = False
    target_area = str(point.get("targetArea") or "board")
    if target_area == "course_image":
        bounds = capture.get("generatedImageBounds")
        if isinstance(bounds, dict):
            cropped = crop_image_region(screenshot_data, bounds)
            if cropped is not None:
                image_data, image_width, image_height, offset_x, offset_y = cropped
                used_course_image_crop = True

    label = str(point.get("label") or "requested whiteboard target").strip()
    result = await locate_visual_target(
        image_base64=image_data,
        mime_type="image/jpeg",
        width=image_width,
        height=image_height,
        description=label,
        mode="point",
        model=model or settings.tars_visual_locator_model,
    )
    if result is None:
        return point

    x = max(0.0, min(float(screenshot_width), result.start[0] + offset_x))
    y = max(0.0, min(float(screenshot_height), result.start[1] + offset_y))
    return {
        **point,
        "x": x,
        "y": y,
        "grounding": "computer_use",
        "groundingModel": model or settings.tars_visual_locator_model,
        "groundingRegion": "course_image" if used_course_image_crop else "board",
    }
