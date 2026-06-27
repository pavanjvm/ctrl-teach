"""Canvas interaction tools for the Magic Whiteboard Tutor.

These tools let the AI agent read the current whiteboard state and
instruct the frontend to draw / modify elements on the Excalidraw canvas.
The actual rendering happens client-side — the agent emits JSON commands
that the frontend interprets.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ── Text measurement helper ───────────────────────────────────────────────────

_CHAR_WIDTH_RATIO = 0.8    # approximate width-per-pixel relative to font_size (Virgil/handwriting font runs wide)
_LINE_HEIGHT_RATIO = 1.6   # line height relative to font_size (Excalidraw Virgil font needs generous spacing)
_H_PAD = 24                # horizontal padding inside a box (each side)
_V_PAD = 14                # vertical padding inside a box (each side)

# Auto-advancing Y cursor so consecutive text writes stack vertically.
# Reset by clear_canvas.
_TEXT_SPACING = 20          # vertical gap between consecutive text blocks
_cursor_y: float = 60.0    # current vertical cursor position
_CURSOR_Y_INIT: float = 60.0
_CURSOR_MARGIN: float = 40.0  # gap between existing content and new tutor text


def update_cursor_from_canvas(elements: List[Dict[str, Any]]) -> None:
    """Update the internal Y cursor based on the actual canvas content.

    Called when a canvas snapshot or element data arrives so that subsequent
    `write_text_on_canvas` calls place text BELOW everything the student
    has already drawn.
    """
    global _cursor_y
    if not elements:
        return

    max_bottom: float = 0.0
    for el in elements:
        y = float(el.get("y", 0))
        h = float(el.get("height", 0))
        bottom = y + h
        # For freedraw / line / arrow, compute from points
        pts = el.get("points")
        if pts and isinstance(pts, list) and len(pts) > 0:
            max_pt_y = max((float(p[1]) for p in pts if isinstance(p, (list, tuple)) and len(p) > 1), default=0)
            bottom = max(bottom, y + max_pt_y)
        max_bottom = max(max_bottom, bottom)

    if max_bottom > 0:
        new_cursor = max_bottom + _CURSOR_MARGIN
        if new_cursor > _cursor_y:
            logger.debug("update_cursor_from_canvas: cursor %.0f → %.0f", _cursor_y, new_cursor)
            _cursor_y = new_cursor



# ── Math symbol normalisation ─────────────────────────────────────────────────
# Converts LaTeX / ASCII math shorthands -> proper Unicode so text displays
# correctly on the Excalidraw canvas without any LaTeX renderer.
# All replacement strings use \uXXXX escapes (ASCII-safe) to avoid
# Windows cp1252 file-encoding corruption of multi-byte Unicode literals.

import re as _re

# Superscript digit map for ^ exponents
_SUP_MAP = str.maketrans(
    "0123456789+-=()nij",
    "\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079"
    "\u207a\u207b\u207c\u207d\u207e\u207f\u2071\u02b2",
)
# Subscript digit map for _ subscripts
_SUB_MAP = str.maketrans(
    "0123456789+-=()",
    "\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089"
    "\u208a\u208b\u208c\u208d\u208e",
)

# LaTeX command -> Unicode  (all replacements use \uXXXX escapes)
_LATEX_CMDS: list[tuple[str, str]] = [
    # Greek lowercase
    (r'\\alpha',         '\u03b1'), (r'\\beta',        '\u03b2'),
    (r'\\gamma',         '\u03b3'), (r'\\delta',        '\u03b4'),
    (r'\\varepsilon',    '\u03b5'), (r'\\epsilon',      '\u03b5'),
    (r'\\zeta',          '\u03b6'), (r'\\eta',          '\u03b7'),
    (r'\\vartheta',      '\u03b8'), (r'\\theta',        '\u03b8'),
    (r'\\iota',          '\u03b9'), (r'\\kappa',        '\u03ba'),
    (r'\\lambda',        '\u03bb'), (r'\\mu',           '\u03bc'),
    (r'\\nu',            '\u03bd'), (r'\\xi',           '\u03be'),
    (r'\\varpi',         '\u03c0'), (r'\\pi',           '\u03c0'),
    (r'\\varrho',        '\u03c1'), (r'\\rho',          '\u03c1'),
    (r'\\varsigma',      '\u03c2'), (r'\\sigma',        '\u03c3'),
    (r'\\tau',           '\u03c4'), (r'\\upsilon',      '\u03c5'),
    (r'\\varphi',        '\u03c6'), (r'\\phi',          '\u03c6'),
    (r'\\chi',           '\u03c7'), (r'\\psi',          '\u03c8'),
    (r'\\omega',         '\u03c9'),
    # Greek uppercase
    (r'\\Gamma',         '\u0393'), (r'\\Delta',        '\u0394'),
    (r'\\Theta',         '\u0398'), (r'\\Lambda',       '\u039b'),
    (r'\\Xi',            '\u039e'), (r'\\Pi',           '\u03a0'),
    (r'\\Sigma',         '\u03a3'), (r'\\Upsilon',      '\u03a5'),
    (r'\\Phi',           '\u03a6'), (r'\\Psi',          '\u03a8'),
    (r'\\Omega',         '\u03a9'),
    # Operators / relations
    (r'\\infty',         '\u221e'), (r'\\pm',           '\u00b1'),
    (r'\\mp',            '\u2213'), (r'\\times',        '\u00d7'),
    (r'\\div',           '\u00f7'), (r'\\cdot',         '\u00b7'),
    (r'\\leq',           '\u2264'), (r'\\geq',          '\u2265'),
    (r'\\neq',           '\u2260'), (r'\\approx',       '\u2248'),
    (r'\\equiv',         '\u2261'), (r'\\sim',          '~'),
    (r'\\subset',        '\u2282'), (r'\\supset',       '\u2283'),
    (r'\\notin',         '\u2209'), (r'\\in(?![a-zA-Z])', '\u2208'),
    (r'\\cup',           '\u222a'), (r'\\cap',          '\u2229'),
    (r'\\forall',        '\u2200'), (r'\\exists',       '\u2203'),
    (r'\\nabla',         '\u2207'), (r'\\partial',      '\u2202'),
    (r'\\sum',           '\u03a3'), (r'\\prod',         '\u03a0'),
    (r'\\oint',          '\u222e'), (r'\\int',          '\u222b'),
    # sqrt without braces (braced form handled separately before this list)
    (r'\\sqrt(?!\{)',    '\u221a'),
    (r'\\ldots',         '\u2026'), (r'\\cdots',        '\u2026'),
    (r'\\leftrightarrow','\u2194'), (r'\\Rightarrow',   '\u21d2'),
    (r'\\Leftarrow',     '\u21d0'), (r'\\rightarrow',   '\u2192'),
    (r'\\leftarrow',     '\u2190'), (r'\\to',           '\u2192'),
    (r'\\circ',          '\u2218'), (r'\\bullet',       '\u2022'),
    (r'\\star',          '\u2605'),
]


def _apply_sup(match: _re.Match) -> str:  # type: ignore[type-arg]
    """Convert a ^{...} or ^x exponent to Unicode superscript chars."""
    body = match.group(1) if match.group(1) is not None else match.group(2)
    translated = body.translate(_SUP_MAP)
    # Fall back to parenthesised form for chars not in the map
    if any(c == body[i] for i, c in enumerate(translated) if c not in _SUP_MAP.values()):
        return f"^({body})" if len(body) > 1 else f"^{body}"
    return translated


def _apply_sub(match: _re.Match) -> str:  # type: ignore[type-arg]
    """Convert a _{...} or _x subscript to Unicode subscript chars."""
    body = match.group(1) if match.group(1) is not None else match.group(2)
    translated = body.translate(_SUB_MAP)
    return translated


def _normalize_math_text(text: str) -> str:
    """Convert LaTeX / ASCII math notation to plain Unicode for canvas display.

    Aggressively strips ALL LaTeX formatting so nothing like ``$...$``,
    ``\\color``, ``\\text``, or ``\\mathrm`` ever reaches the canvas.
    """
    # 1. Strip outer LaTeX math delimiters: $...$, $$...$$, \[...\], \(...\)
    text = _re.sub(r'\$\$(.+?)\$\$', r'\1', text, flags=_re.DOTALL)
    text = _re.sub(r'\$(.+?)\$',     r'\1', text, flags=_re.DOTALL)
    text = _re.sub(r'\\\[(.+?)\\\]', r'\1', text, flags=_re.DOTALL)
    text = _re.sub(r'\\\((.+?)\\\)', r'\1', text, flags=_re.DOTALL)

    # 2. \color commands — strip the command, keep the content.
    #    Handles: \color{red}{text}, \color{#abc123}{text},
    #             \color#abc123  (no braces, just hex), \textcolor{...}{text}
    text = _re.sub(r'\\(?:text)?color\s*\{[^}]*\}\s*\{([^}]*)\}', r'\1', text)
    text = _re.sub(r'\\(?:text)?color\s*\{[^}]*\}', '', text)
    text = _re.sub(r'\\(?:text)?color\s*#[0-9a-fA-F]{3,8}', '', text)

    # 3. \text{...}, \mathrm{...}, \mathbf{...}, \textbf{...}, \textit{...},
    #    \mathit{...}, \boldsymbol{...}, \operatorname{...}
    text = _re.sub(
        r'\\(?:text|textrm|textbf|textit|texttt|mathrm|mathbf|mathit|mathbb|'
        r'mathcal|mathsf|boldsymbol|operatorname|displaystyle|scriptstyle)'
        r'\s*\{([^}]*)\}',
        r'\1', text,
    )

    # 4. \left, \right, \big, \Big, \bigg, \Bigg — just remove them
    text = _re.sub(r'\\(?:left|right|[bB]ig{1,2})\s*([()\[\]|.]?)', r'\1', text)

    # 5. Spacing commands → plain space or nothing
    text = _re.sub(r'\\(?:quad|qquad|enspace|thinspace)', ' ', text)
    text = _re.sub(r'\\[,;!]', '', text)
    # \  (backslash-space) → space
    text = _re.sub(r'\\ ', ' ', text)

    # 6. \sqrt{expr} -> sqrt-symbol + expr
    text = _re.sub(r'\\sqrt\s*\{([^}]*)\}', '\u221a' + r'\1', text)
    text = _re.sub(r'\\sqrt\s+(\S)',         '\u221a' + r'\1', text)

    # 7. \frac{num}{den} -> (num)/(den)
    text = _re.sub(r'\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}', r'(\1)/(\2)', text)

    # 8. All known LaTeX commands -> Unicode
    for pattern, replacement in _LATEX_CMDS:
        text = _re.sub(pattern, replacement, text)

    # 9. ^{exponent} or ^x  ->  superscript Unicode
    text = _re.sub(r'\^\{([^}]*)\}', lambda m: m.group(1).translate(_SUP_MAP), text)
    text = _re.sub(r'\^([0-9nij])',  lambda m: m.group(1).translate(_SUP_MAP), text)

    # 10. _{subscript} or _x  ->  subscript Unicode
    text = _re.sub(r'_\{([^}]*)\}', lambda m: m.group(1).translate(_SUB_MAP), text)
    text = _re.sub(r'_([0-9])',      lambda m: m.group(1).translate(_SUB_MAP), text)

    # 11. Plain-English / ASCII fallbacks
    _plain_subs: list[tuple[str, str]] = [
        (r'\bsqrt\s*\(', '\u221a('),
        (r'\bsqrt\b',    '\u221a'),
        (r'\bpi\b',      '\u03c0'),
        (r'\binfinity\b','\u221e'),
        (r'\binf\b',     '\u221e'),
        (r'\binfty\b',   '\u221e'),
        (r'\balpha\b',   '\u03b1'), (r'\bbeta\b',   '\u03b2'),
        (r'\bgamma\b',   '\u03b3'), (r'\bdelta\b',  '\u03b4'),
        (r'\btheta\b',   '\u03b8'), (r'\blambda\b', '\u03bb'),
        (r'\bmu\b',      '\u03bc'), (r'\bsigma\b',  '\u03c3'),
        (r'\bphi\b',     '\u03c6'), (r'\bomega\b',  '\u03c9'),
        (r'!=',          '\u2260'),
        (r'<=',          '\u2264'),
        (r'>=',          '\u2265'),
        (r'~=',          '\u2248'),
        (r'\*\*2\b',     '\u00b2'),
        (r'\*\*3\b',     '\u00b3'),
    ]
    for pattern, replacement in _plain_subs:
        text = _re.sub(pattern, replacement, text, flags=_re.IGNORECASE)

    # 12. Remove any leftover lone braces from LaTeX grouping
    text = _re.sub(r'(?<!\\)[{}]', '', text)

    # 13. Catch-all: strip any remaining \command that wasn't handled above.
    #     Keeps the content after the command name.
    text = _re.sub(r'\\[a-zA-Z]+\s*', '', text)

    # 14. Clean up double/triple spaces left behind
    text = _re.sub(r'  +', ' ', text)

    return text


def _measure_text_width(text: str, font_size: int) -> float:
    """Estimate the rendered pixel width for a single line of text.

    Uses a conservative character-width ratio suitable for Excalidraw's
    'Virgil' (hand-drawn) font.  Multi-line strings use the longest line.
    """
    longest = max((len(line) for line in text.splitlines()), default=0)
    return max(longest * font_size * _CHAR_WIDTH_RATIO, font_size)


def _box_size(
    text: str,
    font_size: int,
    min_width: float = 120.0,
    min_height: float = 44.0,
) -> tuple[float, float]:
    """Return (width, height) for a box that comfortably contains *text*."""
    lines = text.splitlines() or [text]
    num_lines = len(lines)
    w = max(
        max(_measure_text_width(line, font_size) for line in lines) + _H_PAD * 2,
        min_width,
    )
    h = max(
        num_lines * font_size * _LINE_HEIGHT_RATIO + _V_PAD * 2,
        min_height,
    )
    return w, h


# ── Canvas Element Bridge ─────────────────────────────────────────────────────
# Stores full element payloads so tool responses sent back to the Gemini Live
# model stay small.  main.py re-injects the element data before forwarding
# events to the client WebSocket.  This prevents 1008 policy-violation errors
# caused by large function-response payloads in the Live streaming session.

canvas_bridge: Dict[str, Dict[str, Any]] = {}


def _defer_elements(
    tool_name: str,
    action: str,
    elements: List[Dict[str, Any]],
    animation: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Store elements in the bridge and return a slim, model-safe response.

    Parameters
    ----------
    animation:
        Optional list of animation group dicts, each with ``start`` (int),
        ``end`` (int, exclusive) and ``delay`` (ms).  When present the
        frontend renders the element slices progressively.
    """
    import uuid as _uuid_mod

    cmd_id = f"cmd-{_uuid_mod.uuid4().hex[:12]}"
    bridge_data: Dict[str, Any] = {
        "tool": tool_name,
        "action": action,
        "elements": elements,
    }
    if animation:
        bridge_data["animation"] = animation
    canvas_bridge[cmd_id] = bridge_data
    return {
        "status": "ok",
        "tool": tool_name,
        "action": action,
        "element_count": len(elements),
        "deferred_canvas_id": cmd_id,
    }


# ── Tool functions ────────────────────────────────────────────────────────────


def draw_on_canvas(
    elements: List[Dict[str, Any]],
    action: str = "add",
) -> Dict[str, Any]:
    """Draw, update, or clear elements on the student's whiteboard.

    Parameters
    ----------
    elements:
        A list of Excalidraw-compatible element dicts.  Each dict should
        contain at least ``type`` (e.g. "text", "rectangle", "arrow",
        "line", "freedraw", "ellipse") and the relevant properties like
        ``x``, ``y``, ``width``, ``height``, ``text``, ``strokeColor``, etc.
    action:
        One of ``"add"`` (append new elements), ``"replace"`` (clear then
        add), or ``"clear"`` (remove everything from canvas).

    Returns
    -------
    dict
        Confirmation payload with the action performed.
    """
    if action not in ("add", "replace", "clear"):
        return {"status": "error", "message": f"Unknown action: {action}"}

    elems = elements if action != "clear" else []
    logger.info("draw_on_canvas: action=%s elements=%d", action, len(elems))

    # Animate each element individually so shapes cascade onto the board.
    animation = None
    if action == "add" and len(elems) > 0:
        animation = []
        for idx in range(len(elems)):
            animation.append({"start": idx, "end": idx + 1, "delay": idx * 200})
    return _defer_elements("draw_on_canvas", action, elems, animation=animation)


def write_text_on_canvas(
    text: str,
    x: float = 100.0,
    y: float = -1.0,
    font_size: int = 24,
    color: str = "#1e1e1e",
) -> Dict[str, Any]:
    """Write text on the canvas at a given position.

    Parameters
    ----------
    text:
        The text string to display.
    x:
        Horizontal position in canvas pixels.
    y:
        Vertical position in canvas pixels.  Leave at default (-1) to
        auto-place below the last text written.
    font_size:
        Font size in pixels (default 24).
    color:
        Hex color string (default dark grey).
    """
    global _cursor_y

    # Normalise ASCII math shorthands → Unicode symbols
    text = _normalize_math_text(text)

    # Auto-position: place below the last text written
    if y < 0:
        y = _cursor_y

    # Split into individual lines so each gets its own element + animation.
    raw_lines = text.splitlines() or [text]
    # Remove completely empty lines but keep whitespace-only lines as spacing
    lines = [ln for ln in raw_lines if ln.strip()] if len(raw_lines) > 1 else raw_lines

    line_height = font_size * _LINE_HEIGHT_RATIO
    elements: List[Dict[str, Any]] = []
    animation: List[Dict[str, Any]] = []

    # Delay (ms) between successive lines appearing
    _LINE_DELAY = 250
    # Per-character typing speed within a single line
    _CHAR_MS = 30

    for i, line in enumerate(lines):
        line_y = y + i * line_height
        elements.append({
            "type": "text",
            "x": x,
            "y": line_y,
            "text": line,
            "fontSize": font_size,
            "strokeColor": color,
            "fontFamily": 1,
        })
        # Each line is its own animation group — typewriter per line
        char_count = len(line)
        type_duration = max(200, min(char_count * _CHAR_MS, 2000))
        # Lines cascade: each waits for the previous line to finish typing
        if i == 0:
            delay = 0
        else:
            # Previous line's delay + its duration → this line starts right after
            prev = animation[i - 1]
            delay = prev["delay"] + prev["duration"]
        animation.append({
            "start": i,
            "end": i + 1,
            "delay": delay,
            "duration": type_duration,
        })

    # Advance cursor past all lines
    total_h = len(lines) * line_height
    _cursor_y = y + total_h + _TEXT_SPACING

    logger.info(
        "write_text_on_canvas at (%.0f, %.0f): %d lines, %s",
        x, y, len(lines), text[:60],
    )
    return _defer_elements("write_text_on_canvas", "add", elements, animation=animation)


def draw_diagram(
    diagram_type: str,
    title: str = "",
    items: Optional[List[str]] = None,
    x: float = 100.0,
    y: float = 100.0,
) -> Dict[str, Any]:
    """Draw a structured diagram on the canvas.

    Parameters
    ----------
    diagram_type:
        One of ``"flowchart"``, ``"mindmap"``, ``"timeline"``,
        ``"comparison_table"``, ``"equation"``, ``"list"``.
    title:
        Title for the diagram.
    items:
        List of labels / steps to include.
    x:
        Starting X position.
    y:
        Starting Y position.
    """
    items = items or []
    elements: List[Dict[str, Any]] = []
    # Animation groups — each entry records (start_idx, end_idx_exclusive)
    # for a logical chunk of elements that should appear together.
    # Delays are computed after the element list is complete.
    _anim_groups: List[tuple] = []  # [(start, end), ...]

    # Per-step delay (ms) for the cascading animation.
    _STEP_DELAY = 350            # delay between successive diagram steps
    _TITLE_DELAY = 0             # title appears immediately
    _FIRST_ITEM_DELAY = 250      # small pause between title and first item

    # Normalise math symbols in title and all items
    title = _normalize_math_text(title)
    items = [_normalize_math_text(it) for it in items]

    # Title element
    if title:
        _title_start = len(elements)
        elements.append({
            "type": "text",
            "x": x,
            "y": y,
            "text": title,
            "fontSize": 28,
            "strokeColor": "#1864ab",
            "fontFamily": 1,
        })
        _anim_groups.append((_title_start, len(elements)))

    # Generate elements based on diagram type
    if diagram_type == "flowchart":
        # Pre-compute the widest box so all flowchart steps are the same width
        fc_font = 18
        max_box_w = max((_box_size(it, fc_font)[0] for it in items), default=200)
        box_h = 50  # fixed height per step
        row_gap = 100  # vertical distance between box tops

        for i, item in enumerate(items):
            step_start = len(elements)
            box_y = y + 60 + i * row_gap
            item_w, _ = _box_size(item, fc_font)
            bw = max(item_w, max_box_w)  # uniform width across all steps
            cx = x + bw / 2             # centre-x for the arrow
            elements.append({
                "type": "rectangle",
                "x": x,
                "y": box_y,
                "width": bw,
                "height": box_h,
                "strokeColor": "#1864ab",
                "backgroundColor": "#d0ebff",
                "fillStyle": "solid",
            })
            _, th = _box_size(item, fc_font, min_width=0, min_height=0)
            elements.append({
                "type": "text",
                "x": x + _H_PAD,
                "y": box_y + (box_h - th) / 2,
                "text": item,
                "fontSize": fc_font,
                "strokeColor": "#1e1e1e",
                # Use full box interior so long labels are never clipped
                "width": bw - _H_PAD * 2,
                "height": th,
            })
            if i < len(items) - 1:
                elements.append({
                    "type": "arrow",
                    "x": cx,
                    "y": box_y + box_h,
                    "width": 0,
                    "height": row_gap - box_h,
                    "strokeColor": "#1864ab",
                })
            # One animation group per flowchart step (box + label + arrow)
            _anim_groups.append((step_start, len(elements)))

    elif diagram_type == "mindmap":
        import math
        mm_font = 16
        # Size the central node to fit the title text
        centre_text = title or "Topic"
        centre_w = max(_measure_text_width(centre_text, mm_font) + _H_PAD * 2, 160)
        centre_h = max(mm_font * _LINE_HEIGHT_RATIO + _V_PAD * 2, 60)
        cx_centre = x + 50 + centre_w / 2
        cy_centre = y + 90 + centre_h / 2
        _centre_start = len(elements)
        elements.append({
            "type": "ellipse",
            "x": x + 50,
            "y": y + 60,
            "width": centre_w,
            "height": centre_h,
            "strokeColor": "#e67700",
            "backgroundColor": "#fff3bf",
            "fillStyle": "solid",
        })
        _anim_groups.append((_centre_start, len(elements)))

        for i, item in enumerate(items):
            branch_start = len(elements)
            angle = (2 * math.pi * i) / max(len(items), 1)
            bw, bh = _box_size(item, mm_font)
            # Radiate branches further out when items are wider
            radius_x = max(centre_w / 2 + bw + 40, 220)
            radius_y = max(centre_h / 2 + bh + 40, 175)
            bx = int(cx_centre + radius_x * math.cos(angle) - bw / 2)
            by = int(cy_centre + radius_y * math.sin(angle) - bh / 2)
            elements.append({
                "type": "rectangle",
                "x": bx,
                "y": by,
                "width": bw,
                "height": bh,
                "strokeColor": "#2b8a3e",
                "backgroundColor": "#d3f9d8",
                "fillStyle": "solid",
            })
            _, th = _box_size(item, mm_font, min_width=0, min_height=0)
            elements.append({
                "type": "text",
                "x": bx + _H_PAD,
                "y": by + (bh - th) / 2,
                "text": item,
                "fontSize": mm_font,
                "strokeColor": "#1e1e1e",
                "width": bw - _H_PAD * 2,
                "height": th,
            })
            _anim_groups.append((branch_start, len(elements)))

    elif diagram_type == "list":
        for i, item in enumerate(items):
            _item_start = len(elements)
            elements.append({
                "type": "text",
                "x": x + 10,
                "y": y + 60 + i * 36,
                "text": f"• {item}",
                "fontSize": 20,
                "strokeColor": "#1e1e1e",
            })
            _anim_groups.append((_item_start, len(elements)))

    else:
        # Generic: render items as text list inside a border rectangle.
        # Size the rectangle to the widest item so nothing overflows.
        gen_font = 18
        inner_w = max(
            (_measure_text_width(it, gen_font) for it in items),
            default=300,
        )
        box_w = inner_w + _H_PAD * 2 + 20
        row_px = gen_font * _LINE_HEIGHT_RATIO + 6
        box_h = 60 + len(items) * row_px + 20
        _border_start = len(elements)
        elements.append({
            "type": "rectangle",
            "x": x - 10,
            "y": y - 10,
            "width": box_w,
            "height": box_h,
            "strokeColor": "#868e96",
        })
        _anim_groups.append((_border_start, len(elements)))

        for i, item in enumerate(items):
            _row_start = len(elements)
            _, th = _box_size(item, gen_font, min_width=0, min_height=0)
            elements.append({
                "type": "text",
                "x": x + _H_PAD,
                "y": y + 50 + i * row_px,
                "text": item,
                "fontSize": gen_font,
                "strokeColor": "#1e1e1e",
                # Full box interior so nothing clips
                "width": box_w - _H_PAD * 2 - 20,
                "height": th,
            })
            _anim_groups.append((_row_start, len(elements)))

    # ── Build animation metadata ──────────────────────────────────────────
    # Each animation group gets a staggered delay so elements cascade
    # top-to-bottom (or centre-out for mindmaps).
    animation: List[Dict[str, Any]] | None = None
    if len(_anim_groups) > 1:
        animation = []
        for idx, (start, end) in enumerate(_anim_groups):
            if idx == 0:
                delay = _TITLE_DELAY
            else:
                delay = _FIRST_ITEM_DELAY + (idx - 1) * _STEP_DELAY
            animation.append({"start": start, "end": end, "delay": delay})

    logger.info(
        "draw_diagram: type=%s title=%s items=%d elements=%d anim_groups=%d",
        diagram_type, title, len(items), len(elements),
        len(_anim_groups),
    )
    return _defer_elements("draw_diagram", "add", elements, animation=animation)


def highlight_area(
    x: float,
    y: float,
    width: float,
    height: float,
    color: str = "#ffec99",
) -> Dict[str, Any]:
    """Draw a translucent highlight rectangle on the canvas.

    Useful for pointing the student's attention to a specific area.

    Parameters
    ----------
    x:  Left edge.
    y:  Top edge.
    width:  Width of highlight.
    height:  Height of highlight.
    color:  Hex background color (default yellow).
    """
    element = {
        "type": "rectangle",
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "strokeColor": "transparent",
        "backgroundColor": color,
        "fillStyle": "solid",
        "opacity": 40,
    }
    # Single-group animation: highlight fades in gently.
    animation = [{"start": 0, "end": 1, "delay": 0}]
    return _defer_elements("highlight_area", "add", [element], animation=animation)



# ── Image Data Bridge ─────────────────────────────────────────────────────────

# This global store allows us to pass large image data to the frontend without
# blobbing it into the LLM conversation history, which causes 1007 errors.
# Key: file_id, Value: { dataURL, mimeType }
image_bridge: Dict[str, Dict[str, Any]] = {}


async def add_image_to_canvas(
    image_base64: str,
    x: float = 100.0,
    y: float = 100.0,
    width: float = 400.0,
    height: float = 300.0,
    mime_type: str = "image/png",
) -> Dict[str, Any]:
    """Place a base64-encoded image on the student's whiteboard canvas.

    Parameters
    ----------
    image_base64:
        The raw image bytes encoded as a base64 string (no data-URL prefix).
    x:
        Horizontal position in canvas pixels.
    y:
        Vertical position in canvas pixels.
    width:
        Display width in canvas pixels (default 400).
    height:
        Display height in canvas pixels (default 300).
    mime_type:
        MIME type of the image (default ``"image/png"``).
    """
    import uuid as _uuid

    file_id = f"img-{_uuid.uuid4().hex[:12]}"
    data_url = f"data:{mime_type};base64,{image_base64}"

    element = {
        "type": "image",
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "fileId": file_id,
        "status": "saved",
    }

    # Store the actual data in the bridge for main.py to re-inject.
    # We do NOT return the 'files' dict to the LLM to prevent 1007 errors.
    image_bridge[file_id] = {
        "id": file_id,
        "dataURL": data_url,
        "mimeType": mime_type,
        "created": 0,
    }

    logger.info(
        "add_image_to_canvas at (%.0f, %.0f) %dx%d fileId=%s (deferred)",
        x, y, width, height, file_id,
    )
    return{
        "status": "ok",
        "tool": "add_image_to_canvas",
        "action": "add",
        "elements": [element],
        "deferred_file_id": file_id,  # Signals main.py to inject files[file_id]
    }


# ── Imported from plot_tools to keep this module focused ──────────────────────
from app.tools.plot_tools import plot_function  # noqa: E402


def clear_canvas() -> Dict[str, Any]:
    """Clear everything from the whiteboard canvas."""
    global _cursor_y
    _cursor_y = _CURSOR_Y_INIT
    return _defer_elements("clear_canvas", "clear", [])


def point_at_whiteboard(x: float, y: float, label: str = "right here") -> Dict[str, Any]:
    """Move Clicky's cursor to a point in the latest whiteboard screenshot.

    Coordinates must be in the pixel coordinate space of the latest whiteboard
    viewport image sent to the model: top-left origin, x increasing right,
    y increasing down. The frontend maps those image pixels back to the live
    whiteboard viewport before animating Clicky.
    """
    return {
        "status": "ok",
        "tool": "point_at_whiteboard",
        "clickyPoint": {
            "x": x,
            "y": y,
            "label": label or "right here",
        },
    }


# ── Export FunctionTool wrappers ──────────────────────────────────────────────

canvas_tools = [
    draw_on_canvas,
    write_text_on_canvas,
    draw_diagram,
    highlight_area,
    add_image_to_canvas,
    plot_function,
    clear_canvas,
    point_at_whiteboard,
]
