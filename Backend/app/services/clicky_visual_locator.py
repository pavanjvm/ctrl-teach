"""High-precision visual grounding for Clicky screen annotations.

The realtime model decides *what* Clicky should point at or draw. A dedicated
GPT computer-use pass determines *where* the target is in the exact screenshot
pixel space. DOM-backed targets bypass this module because the browser can
resolve those directly with ``getBoundingClientRect()``.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
from dataclasses import dataclass
from io import BytesIO
import logging
import time
from typing import Any, Literal

from openai import AsyncOpenAI
from PIL import Image
from pydantic import BaseModel, Field

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


class VisualCoordinateResult(BaseModel):
    """Validated normalized geometry returned by the GPT-5.5 vision pass."""

    found: bool
    start_x: float = Field(ge=0, le=1000)
    start_y: float = Field(ge=0, le=1000)
    end_x: float | None = Field(default=None, ge=0, le=1000)
    end_y: float | None = Field(default=None, ge=0, le=1000)


def _openai_client() -> AsyncOpenAI | None:
    global _client
    if not settings.openai_api_key:
        return None
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            timeout=settings.clicky_visual_locator_timeout_seconds,
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


def _spatial_result(computer_call: Any, requested_mode: LocalizationMode) -> LocalizationResult | None:
    """Extract a click or drag geometry from a computer-use call."""

    click: tuple[float, float] | None = None
    move: tuple[float, float] | None = None
    for action in _computer_actions(computer_call):
        action_type = getattr(action, "type", "")
        if action_type == "drag":
            path = [point for point in (_xy(item) for item in (getattr(action, "path", []) or [])) if point]
            if len(path) >= 2:
                start, end = path[0], path[-1]
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

    # A click is still useful if the model did not follow a requested drag. The
    # caller can preserve the old annotation size while correcting its center.
    point = click or move
    return LocalizationResult(mode="point", start=point) if point else None


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


def _coordinate_prompt(mode: LocalizationMode, description: str, shape: str) -> str:
    target = description.strip() or "the object requested by the user"
    shared = (
        "Locate exactly one visual target in the supplied image. Ignore nearby labels, "
        "controls, borders, and background. Return normalized coordinates from 0 to 1000, "
        "where (0,0) is the image's top-left and (1000,1000) is its bottom-right. "
        "Set found=false only when the named target is genuinely absent.\n\n"
        f"Target: {target}\n"
    )
    if mode == "bounds":
        return shared + (
            "Return the target's tight top-left boundary as start_x/start_y and its tight "
            "bottom-right boundary as end_x/end_y."
        )
    if mode == "segment":
        direction = (
            "left endpoint to right endpoint of a tight underline directly beneath the target"
            if shape == "underline"
            else "requested visual connection, preserving the requested arrow direction"
        )
        return shared + f"Return start and end coordinates for the {direction}."
    return shared + (
        "Return start_x/start_y at the exact visual center of the target. "
        "Set end_x and end_y to null."
    )


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
    """Locate a target with GPT-5.5 direct vision and Structured Outputs."""

    client = _openai_client()
    if client is None or not settings.clicky_visual_locator_enabled:
        return None
    if not image_base64 or width < 1 or height < 1:
        return None

    selected_model = model or settings.clicky_visual_locator_model
    prompt = _coordinate_prompt(mode, description, shape)
    started_at = time.perf_counter()

    try:
        response = await asyncio.wait_for(
            client.responses.parse(
                model=selected_model,
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
                reasoning={"effort": settings.clicky_visual_locator_reasoning_effort},
                text_format=VisualCoordinateResult,
                # Reasoning tokens count against this limit. Keep enough room
                # for deployments that intentionally select high/xhigh while
                # still returning the tiny structured coordinate payload.
                max_output_tokens=2048,
            ),
            timeout=settings.clicky_visual_locator_timeout_seconds,
        )
        parsed = response.output_parsed
        if parsed is None or not parsed.found:
            return None

        def pixels(x: float, y: float) -> tuple[float, float]:
            return x * width / 1000.0, y * height / 1000.0

        start = pixels(parsed.start_x, parsed.start_y)
        end = (
            pixels(parsed.end_x, parsed.end_y)
            if parsed.end_x is not None and parsed.end_y is not None
            else None
        )
        if mode == "bounds" and end is not None:
            start, end = (
                (min(start[0], end[0]), min(start[1], end[1])),
                (max(start[0], end[0]), max(start[1], end[1])),
            )
        result = _clamp_result(LocalizationResult(mode=mode, start=start, end=end), width, height)
        logger.info(
            "Clicky visual locator model=%s mode=%s target=%r start=%s end=%s image=%dx%d latency_ms=%d",
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
            "Clicky visual localization failed model=%s mode=%s: %s",
            selected_model,
            mode,
            exc,
        )
    return None


def _capture_for_payload(payload: dict[str, Any], state: dict[str, Any]) -> tuple[dict[str, Any], float, float] | None:
    coordinate_space = payload.get("coordinate_space")
    if coordinate_space == "media":
        crop = state.get("clicky_media_crop")
        if not isinstance(crop, dict):
            return None
        return crop, 1000.0, 1000.0

    capture = state.get("clicky_viewport_capture")
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
    if shape in {"rectangle", "highlight", "circle"}:
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


async def refine_clicky_payload(
    payload: dict[str, Any],
    state: dict[str, Any],
    *,
    tool_name: str,
    model: str | None = None,
) -> dict[str, Any]:
    """Ground any non-DOM Clicky point or annotation with computer use."""

    if payload.get("target_id") or payload.get("from_target_id") or payload.get("to_target_id"):
        return payload
    capture_info = _capture_for_payload(payload, state)
    if capture_info is None:
        return payload
    capture, output_width, output_height = capture_info

    image_width = int(capture.get("width") or 0)
    image_height = int(capture.get("height") or 0)
    image_data = str(capture.get("rawData") or capture.get("data") or "")
    image_mime = str(capture.get("rawMimeType") or capture.get("mimeType") or "image/png")
    if image_width < 1 or image_height < 1 or not image_data:
        return payload

    label = str(payload.get("label") or "").strip()
    transcript = str(state.get("last_input_transcript") or "").strip()
    description = label or "requested target"
    if transcript:
        description = f"{description} (user request: {transcript})"
    shape = str(payload.get("shape") or "")
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
        return payload

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
    refined["grounding_model"] = model or settings.clicky_visual_locator_model
    refined["grounding_mode"] = result.mode
    return refined


async def refine_media_payload(payload: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    """Backward-compatible wrapper for older call sites."""

    tool_name = "draw_on_screen" if payload.get("shape") else "point_at"
    return await refine_clicky_payload(payload, state, tool_name=tool_name)


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
    authoritative visible image rectangle. We crop to it first, let GPT-5.5
    find the semantic target inside that crop, then translate the result back
    into the original screenshot coordinate space.
    """

    point = payload.get("clickyPoint")
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
        model=model or settings.clicky_visual_locator_model,
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
        "groundingModel": model or settings.clicky_visual_locator_model,
        "groundingRegion": "course_image" if used_course_image_crop else "board",
    }
