"""Mathematical function plotting tool for the Magic Whiteboard Tutor.

Extracted from canvas_tools to keep modules focused.  Uses the shared
``_defer_elements`` bridge so that large element arrays are never sent
back to the Gemini Live model.

When rendered on the frontend the elements are revealed progressively
(axes → ticks → origin → curve → label) to create an immersive
"the tutor is drawing it" animation.
"""

from __future__ import annotations

import ast
import logging
import math
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Number of sub-segments the curve is sliced into for the drawing animation.
_CURVE_ANIM_SLICES = 6


# Gap between the last written text and the top of the plot
_PLOT_Y_GAP = 5.0

_MAX_EXPRESSION_LENGTH = 256
_MAX_EXPRESSION_NODES = 80
_MAX_POWER = 1_000.0
_MATH_CONSTANTS = {"pi": math.pi, "e": math.e}
_MATH_FUNCTIONS = {
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "asin": math.asin,
    "acos": math.acos,
    "atan": math.atan,
    "sinh": math.sinh,
    "cosh": math.cosh,
    "tanh": math.tanh,
    "sqrt": math.sqrt,
    "cbrt": lambda value: math.copysign(abs(value) ** (1 / 3), value),
    "log": math.log,
    "log2": math.log2,
    "log10": math.log10,
    "exp": math.exp,
    "abs": abs,
    "pow": math.pow,
    "floor": math.floor,
    "ceil": math.ceil,
}


def _parse_math_expression(expression: str) -> ast.Expression:
    """Parse a deliberately small, non-executable math expression language."""
    if not expression or len(expression) > _MAX_EXPRESSION_LENGTH:
        raise ValueError("Expression is empty or too long")
    parsed = ast.parse(expression, mode="eval")
    if sum(1 for _ in ast.walk(parsed)) > _MAX_EXPRESSION_NODES:
        raise ValueError("Expression is too complex")

    allowed_nodes = (
        ast.Expression,
        ast.BinOp,
        ast.UnaryOp,
        ast.Call,
        ast.Name,
        ast.Constant,
        ast.Add,
        ast.Sub,
        ast.Mult,
        ast.Div,
        ast.Mod,
        ast.Pow,
        ast.UAdd,
        ast.USub,
        ast.Load,
    )
    for node in ast.walk(parsed):
        if not isinstance(node, allowed_nodes):
            raise ValueError(f"Unsupported expression element: {type(node).__name__}")
        if isinstance(node, ast.Name) and node.id not in {
            "x",
            *_MATH_CONSTANTS,
            *_MATH_FUNCTIONS,
        }:
            raise ValueError(f"Unknown name: {node.id}")
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in _MATH_FUNCTIONS:
                raise ValueError("Only approved math functions may be called")
            if node.keywords:
                raise ValueError("Keyword arguments are not supported")
        if isinstance(node, ast.Constant) and (
            isinstance(node.value, bool) or not isinstance(node.value, (int, float))
        ):
            raise ValueError("Only numeric constants are supported")
    return parsed


def _evaluate_math_expression(parsed: ast.Expression, x_value: float) -> float:
    def evaluate(node: ast.AST) -> float:
        if isinstance(node, ast.Expression):
            return evaluate(node.body)
        if isinstance(node, ast.Constant):
            value = float(node.value)
        elif isinstance(node, ast.Name):
            if node.id == "x":
                value = x_value
            elif node.id in _MATH_CONSTANTS:
                value = _MATH_CONSTANTS[node.id]
            else:
                raise ValueError("Function names cannot be used as values")
        elif isinstance(node, ast.UnaryOp):
            operand = evaluate(node.operand)
            value = operand if isinstance(node.op, ast.UAdd) else -operand
        elif isinstance(node, ast.BinOp):
            left = evaluate(node.left)
            right = evaluate(node.right)
            if isinstance(node.op, ast.Add):
                value = left + right
            elif isinstance(node.op, ast.Sub):
                value = left - right
            elif isinstance(node.op, ast.Mult):
                value = left * right
            elif isinstance(node.op, ast.Div):
                value = left / right
            elif isinstance(node.op, ast.Mod):
                value = left % right
            elif isinstance(node.op, ast.Pow):
                if abs(right) > _MAX_POWER:
                    raise ValueError("Exponent is too large")
                value = math.pow(left, right)
            else:  # pragma: no cover - parser rejects other operators
                raise ValueError("Unsupported operator")
        elif isinstance(node, ast.Call):
            function = _MATH_FUNCTIONS[node.func.id]  # type: ignore[union-attr]
            values = [evaluate(argument) for argument in node.args]
            value = float(function(*values))
        else:  # pragma: no cover - parser rejects other nodes
            raise ValueError("Unsupported expression")

        if not math.isfinite(value):
            raise ValueError("Expression produced a non-finite result")
        return float(value)

    return evaluate(parsed)


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
    # Imported lazily to keep plot expression parsing independently testable
    # and avoid the canvas_tools -> plot_tools compatibility re-export cycle.
    from app.tools import canvas_tools as _ct

    # ── Auto-position below existing board content ────────────────────
    # Use the shared text cursor as the anchor so the plot always lands
    # below whatever text / diagrams have already been written.
    if canvas_y < 0:
        canvas_y = max(_ct._cursor_y + _PLOT_Y_GAP, _ct._CURSOR_Y_INIT + _PLOT_Y_GAP)

    if not all(math.isfinite(value) for value in (x_min, x_max)) or x_max <= x_min:
        return {"status": "error", "message": "The x range must be finite and increasing."}
    num_points = max(2, min(int(num_points), 2_000))
    try:
        parsed_expression = _parse_math_expression(expression)
    except (SyntaxError, ValueError) as exc:
        return {"status": "error", "message": f"Invalid math expression: {exc}"}

    # ── Sample the function ────────────────────────────────────────────
    step = (x_max - x_min) / max(num_points - 1, 1)
    raw_points: List[tuple[float, float]] = []

    for i in range(num_points):
        xv = x_min + i * step
        try:
            yv = _evaluate_math_expression(parsed_expression, xv)
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

    return _ct._defer_elements("plot_function", "add", elements, animation=anim_groups)
