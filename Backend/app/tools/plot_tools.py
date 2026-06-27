"""Mathematical function plotting tool for the Magic Whiteboard Tutor.

Extracted from canvas_tools to keep modules focused.  Uses the shared
``_defer_elements`` bridge so that large element arrays are never sent
back to the Gemini Live model.

When rendered on the frontend the elements are revealed progressively
(axes → ticks → origin → curve → label) to create an immersive
"the tutor is drawing it" animation.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Optional

from app.tools.canvas_tools import _defer_elements
import app.tools.canvas_tools as _ct

logger = logging.getLogger(__name__)

# Number of sub-segments the curve is sliced into for the drawing animation.
_CURVE_ANIM_SLICES = 6


# Gap between the last written text and the top of the plot
_PLOT_Y_GAP = 5.0


def plot_function(
    expression: str,
    x_min: float = -10.0,
    x_max: float = 10.0,
    y_min: Optional[float] = None,
    y_max: Optional[float] = None,
    canvas_x: float = 90.0,
    canvas_y: float = -1.0,
    canvas_width: float = 500.0,
    canvas_height: float = 400.0,
    color: str = "#e03131",
    label: str = "",
    num_points: int = 200,
) -> Dict[str, Any]:
    """Plot a mathematical function on the whiteboard with labelled X and Y axes.

    The tool draws a coordinate system (axes, tick marks, labels) and then
    renders the curve using connected line segments.  The result is animated
    on the frontend so the tutor appears to draw each part progressively.

    Parameters
    ----------
    expression:
        A Python math expression in terms of ``x``.  Must use only
        functions from the ``math`` module (e.g. ``sin``, ``cos``,
        ``sqrt``, ``log``, ``exp``, ``pi``, ``e``, ``tan``,
        ``abs``, ``pow``).  Examples:
        - ``"x**2"``
        - ``"sin(x)"``
        - ``"2*x + 3"``
        - ``"sqrt(abs(x))"``
        - ``"log(x)"``  (natural log)
    x_min:
        Left bound of the x-range (default -10).
    x_max:
        Right bound of the x-range (default 10).
    y_min:
        Bottom bound of the y-range.  If omitted the tool auto-scales.
    y_max:
        Top bound of the y-range.  If omitted the tool auto-scales.
    canvas_x:
        Left edge of the plot area on the canvas (pixels, default 90).
    canvas_y:
        Top edge of the plot area on the canvas (pixels).  Leave at
        default (-1) to auto-place the plot below the last piece of
        content written on the board so it never overlaps existing text
        or diagrams. without putting so much space betweeen them
    canvas_width:
        Width of the plot area in canvas pixels (default 500).
    canvas_height:
        Height of the plot area in canvas pixels (default 400).
    color:
        Hex stroke colour for the curve (default red).
    label:
        Optional label for the curve (e.g. ``"y = x²"``).  Drawn in the
        top-right corner of the plot.
    num_points:
        Number of sample points along the x range (default 200).
    """

    # ── Auto-position below existing board content ────────────────────
    # Use the shared text cursor as the anchor so the plot always lands
    # below whatever text / diagrams have already been written.
    if canvas_y < 0:
        canvas_y = max(_ct._cursor_y + _PLOT_Y_GAP, _ct._CURSOR_Y_INIT + _PLOT_Y_GAP)

    # ── Safe evaluation namespace ──────────────────────────────────────
    _safe_ns: Dict[str, Any] = {
        "__builtins__": {},
        "x": 0.0,
        # math functions the model is allowed to use
        "sin": math.sin, "cos": math.cos, "tan": math.tan,
        "asin": math.asin, "acos": math.acos, "atan": math.atan,
        "sinh": math.sinh, "cosh": math.cosh, "tanh": math.tanh,
        "sqrt": math.sqrt, "cbrt": lambda v: math.copysign(abs(v) ** (1/3), v),
        "log": math.log, "log2": math.log2, "log10": math.log10,
        "exp": math.exp, "abs": abs, "pow": pow,
        "pi": math.pi, "e": math.e,
        "floor": math.floor, "ceil": math.ceil,
    }

    # ── Sample the function ────────────────────────────────────────────
    step = (x_max - x_min) / max(num_points - 1, 1)
    raw_points: List[tuple[float, float]] = []

    for i in range(num_points):
        xv = x_min + i * step
        _safe_ns["x"] = xv
        try:
            yv = float(eval(expression, _safe_ns))  # noqa: S307
            if math.isfinite(yv):
                raw_points.append((xv, yv))
        except Exception:
            # Skip undefined points (e.g. log of negative)
            continue

    if not raw_points:
        return {"status": "error", "message": f"Could not evaluate '{expression}' — no valid points."}

    # ── Determine y-range (auto-scale if not provided) ─────────────────
    sampled_ys = [p[1] for p in raw_points]
    auto_y_min = min(sampled_ys)
    auto_y_max = max(sampled_ys)
    # Add 10 % padding
    y_span = max(auto_y_max - auto_y_min, 1e-9)
    if y_min is None:
        y_min = auto_y_min - y_span * 0.1
    if y_max is None:
        y_max = auto_y_max + y_span * 0.1

    # ── Coordinate mapping helpers ─────────────────────────────────────
    margin = 50.0  # space for tick labels
    plot_l = canvas_x + margin
    plot_r = canvas_x + canvas_width - 10
    plot_t = canvas_y + 10
    plot_b = canvas_y + canvas_height - margin
    pw = plot_r - plot_l
    ph = plot_b - plot_t

    def to_canvas(xv: float, yv: float) -> tuple[float, float]:
        cx = plot_l + (xv - x_min) / (x_max - x_min) * pw
        cy = plot_b - (yv - y_min) / (y_max - y_min) * ph
        return cx, cy

    elements: List[Dict[str, Any]] = []
    anim_groups: List[Dict[str, Any]] = []

    def _mark_group(delay_ms: int) -> None:
        """Snapshot current element count as a new animation group."""
        end = len(elements)
        start = anim_groups[-1]["end"] if anim_groups else 0
        if end > start:
            anim_groups.append({"start": start, "end": end, "delay": delay_ms})

    # ── Group 1: Axes + axis labels (delay 0 ms) ──────────────────────
    axis_color = "#495057"

    # X axis
    elements.append({
        "type": "line",
        "x": plot_l, "y": plot_b,
        "width": pw, "height": 0,
        "points": [[0, 0], [pw, 0]],
        "strokeColor": axis_color, "strokeWidth": 2,
    })
    # Y axis
    elements.append({
        "type": "line",
        "x": plot_l, "y": plot_t,
        "width": 0, "height": ph,
        "points": [[0, 0], [0, ph]],
        "strokeColor": axis_color, "strokeWidth": 2,
    })
    elements.append({
        "type": "text", "x": plot_r + 4, "y": plot_b - 8,
        "text": "x", "fontSize": 18, "strokeColor": axis_color, "fontFamily": 1,
    })
    elements.append({
        "type": "text", "x": plot_l - 6, "y": plot_t - 22,
        "text": "y", "fontSize": 18, "strokeColor": axis_color, "fontFamily": 1,
    })
    _mark_group(0)

    # ── Tick helper ────────────────────────────────────────────────────
    def _nice_ticks(lo: float, hi: float, max_ticks: int = 8) -> List[float]:
        span = hi - lo
        if span <= 0:
            return [lo]
        raw_step = span / max_ticks
        mag = 10 ** math.floor(math.log10(raw_step))
        for nice in (1, 2, 2.5, 5, 10):
            s = nice * mag
            if span / s <= max_ticks:
                break
        start = math.ceil(lo / s) * s
        ticks: List[float] = []
        v = start
        while v <= hi + s * 0.001:
            ticks.append(round(v, 10))
            v += s
        return ticks

    tick_color = "#868e96"
    tick_len = 6

    # ── Group 2: X ticks (delay 100 ms) ───────────────────────────────
    for tv in _nice_ticks(x_min, x_max):
        tx, _ = to_canvas(tv, 0)
        elements.append({
            "type": "line",
            "x": tx, "y": plot_b - tick_len / 2,
            "width": 0, "height": tick_len,
            "points": [[0, 0], [0, tick_len]],
            "strokeColor": tick_color, "strokeWidth": 1,
        })
        lbl = str(int(tv)) if tv == int(tv) else f"{tv:.2g}"
        elements.append({
            "type": "text",
            "x": tx - len(lbl) * 4, "y": plot_b + 6,
            "text": lbl, "fontSize": 12, "strokeColor": tick_color, "fontFamily": 1,
        })
    _mark_group(100)

    # ── Group 3: Y ticks (delay 180 ms) ───────────────────────────────
    for tv in _nice_ticks(y_min, y_max):
        _, ty = to_canvas(0, tv)
        elements.append({
            "type": "line",
            "x": plot_l - tick_len / 2, "y": ty,
            "width": tick_len, "height": 0,
            "points": [[0, 0], [tick_len, 0]],
            "strokeColor": tick_color, "strokeWidth": 1,
        })
        lbl = str(int(tv)) if tv == int(tv) else f"{tv:.2g}"
        elements.append({
            "type": "text",
            "x": plot_l - len(lbl) * 8 - 12, "y": ty - 7,
            "text": lbl, "fontSize": 12, "strokeColor": tick_color, "fontFamily": 1,
        })
    _mark_group(180)

    # ── Group 4: Origin indicator (delay 250 ms, only if visible) ─────
    if x_min <= 0 <= x_max and y_min <= 0 <= y_max:
        ox, oy = to_canvas(0, 0)
        elements.append({
            "type": "line",
            "x": ox, "y": plot_t,
            "width": 0, "height": ph,
            "points": [[0, 0], [0, ph]],
            "strokeColor": "#dee2e6", "strokeWidth": 1,
        })
        elements.append({
            "type": "line",
            "x": plot_l, "y": oy,
            "width": pw, "height": 0,
            "points": [[0, 0], [pw, 0]],
            "strokeColor": "#dee2e6", "strokeWidth": 1,
        })
    _mark_group(250)

    # ── Build contiguous curve segments ────────────────────────────────
    segments: List[List[tuple[float, float]]] = []
    current_seg: List[tuple[float, float]] = []
    max_y_gap = (y_max - y_min) * 0.4  # discontinuity threshold

    prev_y: Optional[float] = None
    for xv, yv in raw_points:
        clamped_y = max(y_min, min(y_max, yv))
        if prev_y is not None and abs(yv - prev_y) > max_y_gap:
            if current_seg:
                segments.append(current_seg)
            current_seg = []
        current_seg.append((xv, clamped_y))
        prev_y = yv
    if current_seg:
        segments.append(current_seg)

    # ── Groups 6‥N: Curve sub-slices (progressive drawing) ────────────
    # Flatten all segment points into one ordered list, then slice into
    # _CURVE_ANIM_SLICES sub-polylines so the curve grows left-to-right.

    all_curve_pts: List[tuple[float, float, int]] = []  # (x, y, seg_idx)
    for si, seg in enumerate(segments):
        for pt in seg:
            all_curve_pts.append((pt[0], pt[1], si))

    total_curve = len(all_curve_pts)
    n_slices = min(_CURVE_ANIM_SLICES, max(1, total_curve // 4))
    slice_size = max(2, total_curve // n_slices)
    curve_base_delay = 350   # ms delay before curve starts drawing
    curve_slice_gap = 60     # ms between each slice appearance

    for sl in range(n_slices):
        sl_start = sl * slice_size
        sl_end = total_curve if sl == n_slices - 1 else (sl + 1) * slice_size + 1  # +1 overlap
        sl_pts = all_curve_pts[sl_start:sl_end]

        if len(sl_pts) < 2:
            continue

        # Split by segment index to avoid connecting points across
        # discontinuities within the same animation slice.
        sub_segs: Dict[int, List[tuple[float, float]]] = {}
        for xv, yv, si in sl_pts:
            sub_segs.setdefault(si, []).append((xv, yv))

        for si_pts in sub_segs.values():
            if len(si_pts) < 2:
                continue
            first_cx, first_cy = to_canvas(si_pts[0][0], si_pts[0][1])
            pts = [[0.0, 0.0]]
            for xv, yv in si_pts[1:]:
                cx, cy = to_canvas(xv, yv)
                pts.append([cx - first_cx, cy - first_cy])

            elements.append({
                "type": "line",
                "x": first_cx, "y": first_cy,
                "width": pts[-1][0], "height": pts[-1][1],
                "points": pts,
                "strokeColor": color, "strokeWidth": 2,
            })

        _mark_group(curve_base_delay + sl * curve_slice_gap)

    # ── Final group: Curve label ───────────────────────────────────────
    curve_label = label or f"y = {expression}"
    elements.append({
        "type": "text",
        "x": plot_r - len(curve_label) * 8, "y": plot_t + 4,
        "text": curve_label,
        "fontSize": 16, "strokeColor": color, "fontFamily": 1,
    })
    _mark_group(curve_base_delay + n_slices * curve_slice_gap + 120)

    logger.info(
        "plot_function: expr='%s' x=[%.2f,%.2f] y=[%.2f,%.2f] points=%d elements=%d groups=%d",
        expression, x_min, x_max, y_min, y_max, len(raw_points), len(elements), len(anim_groups),
    )

    # Advance the shared text cursor below the plot so subsequent
    # write_text_on_canvas calls don't overlap the graph.
    _ct._cursor_y = max(_ct._cursor_y, canvas_y + canvas_height + _ct._TEXT_SPACING + 7)

    return _defer_elements("plot_function", "add", elements, animation=anim_groups)
