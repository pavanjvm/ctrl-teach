"""Canvas interaction tools for the Magic Whiteboard Tutor.

These tools let the AI agent read the current whiteboard state and
instruct the frontend to draw / modify elements on the Excalidraw canvas.
The actual rendering happens client-side — the agent emits JSON commands
that the frontend interprets.
"""

from __future__ import annotations

import json
import logging
import textwrap
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ── Text measurement helper ───────────────────────────────────────────────────

_CHAR_WIDTH_RATIO = 0.8    # approximate width-per-pixel relative to font_size (Virgil/handwriting font runs wide)
_LINE_HEIGHT_RATIO = 1.6   # line height relative to font_size (Excalidraw Virgil font needs generous spacing)
_H_PAD = 24                # horizontal padding inside a box (each side)
_V_PAD = 14                # vertical padding inside a box (each side)

# Auto-advancing Y cursor so consecutive text writes stack vertically.
# Reset by clear_canvas.
_TEXT_SPACING = 32          # vertical gap between consecutive text blocks
_cursor_y: float = 60.0    # current vertical cursor position
_CURSOR_Y_INIT: float = 60.0
_CURSOR_MARGIN: float = 40.0  # gap between existing content and new tutor text

# Diagram labels are wrapped before they reach Excalidraw. This keeps the
# renderer deterministic: each shape is sized from the exact lines it will
# display instead of relying on Excalidraw to reflow text after placement.
_FLOW_LABEL_MAX_WIDTH = 320.0
_MINDMAP_LABEL_MAX_WIDTH = 300.0
_GENERIC_LABEL_MAX_WIDTH = 560.0
_BOARD_SAFE_RIGHT = 860.0
_BOARD_TEXT_MAX_WIDTH = 680.0
_board_safe_right: float = _BOARD_SAFE_RIGHT


def update_board_viewport_width(view_width: Any) -> None:
    """Keep generated text inside the learner's actual visible board width."""
    global _board_safe_right
    try:
        width = float(view_width)
    except (TypeError, ValueError):
        return
    if width <= 0 or width != width:
        return
    # Leave room for Excalidraw chrome and the hand-drawn glyph overhang.
    _board_safe_right = max(320.0, min(1200.0, width - 36.0))


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


def _wrap_text(text: str, font_size: int, max_width: float) -> str:
    """Wrap *text* to a predictable pixel width while preserving newlines."""
    max_chars = max(8, int(max_width / (font_size * _CHAR_WIDTH_RATIO)))
    wrapper = textwrap.TextWrapper(
        width=max_chars,
        break_long_words=True,
        break_on_hyphens=False,
        replace_whitespace=False,
        drop_whitespace=True,
    )
    wrapped: List[str] = []
    for source_line in text.splitlines() or [text]:
        if not source_line.strip():
            wrapped.append("")
            continue
        wrapped.extend(wrapper.wrap(source_line) or [source_line])
    return "\n".join(wrapped)


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


def _text_block_size(text: str, font_size: int) -> tuple[float, float]:
    """Return the rendered size of already-wrapped text without box padding."""
    lines = text.splitlines() or [text]
    return (
        max((_measure_text_width(line, font_size) for line in lines), default=font_size),
        max(font_size * _LINE_HEIGHT_RATIO, len(lines) * font_size * _LINE_HEIGHT_RATIO),
    )


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

    # Keep generated writing inside a predictable board column. The classroom
    # is narrower than the full browser once the lesson path and transcript are
    # visible, so unconstrained one-line text otherwise disappears off-screen.
    x = max(32.0, min(float(x), max(32.0, _board_safe_right - 180.0)))
    available_width = max(160.0, min(_BOARD_TEXT_MAX_WIDTH, _board_safe_right - x))
    text = _wrap_text(text, font_size, available_width)

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
            # The browser has the real Excalidraw font metrics. Keep these
            # dimensions as layout hints, but let it measure the final glyphs.
            "autoResize": True,
            "viewportWrap": True,
            "width": min(_measure_text_width(line, font_size), available_width),
            "height": line_height,
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
    _cursor_y = y + total_h + _TEXT_SPACING + max(0.0, (len(lines) - 1) * 6.0)

    logger.info(
        "write_text_on_canvas at (%.0f, %.0f): %d lines, %s",
        x, y, len(lines), text[:60],
    )
    return _defer_elements("write_text_on_canvas", "add", elements, animation=animation)


def _draw_diagram_legacy(
    diagram_type: str,
    title: str = "",
    items: Optional[List[str]] = None,
    x: float = 100.0,
    y: float = -1.0,
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
        Starting Y position. Leave at default (-1) to place the diagram below
        the existing canvas content.
    """
    global _cursor_y

    # Structured diagrams are designed to fit within ~700px from this origin.
    # Clamp model-supplied origins so their right edge remains on the board.
    x = max(40.0, min(float(x), 160.0))

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

    # Normalise math symbols in title and all items.
    title = _normalize_math_text(title)
    items = [_normalize_math_text(it) for it in items]

    if y < 0:
        y = _cursor_y

    diagram_bottom = y
    content_y = y

    # Mind maps use the title as their central node. Other diagram types get a
    # standalone, wrapped heading above the content.
    if title and diagram_type != "mindmap":
        wrapped_title = _wrap_text(title, 28, 620)
        title_w, title_h = _text_block_size(wrapped_title, 28)
        _title_start = len(elements)
        elements.append({
            "type": "text",
            "x": x,
            "y": y,
            "text": wrapped_title,
            "fontSize": 28,
            "strokeColor": "#1864ab",
            "fontFamily": 1,
            "width": min(title_w, 620),
            "height": title_h,
            "autoResize": False,
        })
        _anim_groups.append((_title_start, len(elements)))
        content_y = y + title_h + 48
        diagram_bottom = content_y

    # Generate elements based on diagram type
    if diagram_type == "flowchart":
        fc_font = 18
        arrow_gap = 48.0
        prepared = []
        for item in items:
            wrapped = _wrap_text(item, fc_font, _FLOW_LABEL_MAX_WIDTH)
            text_w, text_h = _text_block_size(wrapped, fc_font)
            box_w, box_h = _box_size(wrapped, fc_font, min_width=200, min_height=60)
            prepared.append((wrapped, text_w, text_h, box_w, box_h))

        uniform_width = max((entry[3] for entry in prepared), default=240.0)
        box_y = content_y
        for i, (wrapped, _text_w, text_h, _box_w, box_h) in enumerate(prepared):
            step_start = len(elements)
            cx = x + uniform_width / 2
            elements.append({
                "type": "rectangle",
                "x": x,
                "y": box_y,
                "width": uniform_width,
                "height": box_h,
                "strokeColor": "#1864ab",
                "backgroundColor": "#d0ebff",
                "fillStyle": "solid",
            })
            elements.append({
                "type": "text",
                "x": x + _H_PAD,
                "y": box_y + (box_h - text_h) / 2,
                "text": wrapped,
                "fontSize": fc_font,
                "strokeColor": "#1e1e1e",
                "fontFamily": 1,
                "width": uniform_width - _H_PAD * 2,
                "height": text_h,
                "textAlign": "center",
                "verticalAlign": "middle",
                "autoResize": False,
            })
            diagram_bottom = max(diagram_bottom, box_y + box_h)
            if i < len(prepared) - 1:
                elements.append({
                    "type": "arrow",
                    "x": cx,
                    "y": box_y + box_h,
                    "width": 0,
                    "height": arrow_gap,
                    "points": [[0, 0], [0, arrow_gap]],
                    "strokeColor": "#1864ab",
                })
            _anim_groups.append((step_start, len(elements)))
            box_y += box_h + arrow_gap

    elif diagram_type == "mindmap":
        mm_font = 16
        centre_text = _wrap_text(title or "Topic", mm_font, 220)
        centre_text_w, centre_text_h = _text_block_size(centre_text, mm_font)
        centre_w, centre_h = _box_size(centre_text, mm_font, min_width=180, min_height=70)

        branches = []
        for item in items:
            wrapped = _wrap_text(item, mm_font, _MINDMAP_LABEL_MAX_WIDTH)
            text_w, text_h = _text_block_size(wrapped, mm_font)
            box_w, box_h = _box_size(wrapped, mm_font, min_width=180, min_height=58)
            branches.append((wrapped, text_w, text_h, box_w, box_h))

        branch_width = max((entry[3] for entry in branches), default=220.0)
        branch_gap = 36.0
        branch_top = content_y
        branch_total_h = sum(entry[4] for entry in branches)
        if len(branches) > 1:
            branch_total_h += branch_gap * (len(branches) - 1)

        centre_x = x
        centre_y = branch_top + max(0.0, (branch_total_h - centre_h) / 2)
        branch_x = centre_x + centre_w + 110

        _centre_start = len(elements)
        elements.append({
            "type": "ellipse",
            "x": centre_x,
            "y": centre_y,
            "width": centre_w,
            "height": centre_h,
            "strokeColor": "#e67700",
            "backgroundColor": "#fff3bf",
            "fillStyle": "solid",
        })
        elements.append({
            "type": "text",
            "x": centre_x + _H_PAD,
            "y": centre_y + (centre_h - centre_text_h) / 2,
            "text": centre_text,
            "fontSize": mm_font,
            "strokeColor": "#1e1e1e",
            "fontFamily": 1,
            "width": centre_w - _H_PAD * 2,
            "height": centre_text_h,
            "textAlign": "center",
            "verticalAlign": "middle",
            "autoResize": False,
        })
        _anim_groups.append((_centre_start, len(elements)))
        diagram_bottom = max(diagram_bottom, centre_y + centre_h)

        next_branch_y = branch_top
        for wrapped, _text_w, text_h, _box_w, box_h in branches:
            branch_start = len(elements)
            source_x = centre_x + centre_w
            source_y = centre_y + centre_h / 2
            target_y = next_branch_y + box_h / 2
            elements.append({
                "type": "arrow",
                "x": source_x,
                "y": source_y,
                "width": branch_x - source_x,
                "height": target_y - source_y,
                "points": [[0, 0], [branch_x - source_x, target_y - source_y]],
                "strokeColor": "#2b8a3e",
            })
            elements.append({
                "type": "rectangle",
                "x": branch_x,
                "y": next_branch_y,
                "width": branch_width,
                "height": box_h,
                "strokeColor": "#2b8a3e",
                "backgroundColor": "#d3f9d8",
                "fillStyle": "solid",
            })
            elements.append({
                "type": "text",
                "x": branch_x + _H_PAD,
                "y": next_branch_y + (box_h - text_h) / 2,
                "text": wrapped,
                "fontSize": mm_font,
                "strokeColor": "#1e1e1e",
                "fontFamily": 1,
                "width": branch_width - _H_PAD * 2,
                "height": text_h,
                "textAlign": "center",
                "verticalAlign": "middle",
                "autoResize": False,
            })
            _anim_groups.append((branch_start, len(elements)))
            diagram_bottom = max(diagram_bottom, next_branch_y + box_h)
            next_branch_y += box_h + branch_gap

    elif diagram_type == "list":
        list_font = 20
        next_item_y = content_y
        for item in items:
            wrapped_body = _wrap_text(item, list_font, _GENERIC_LABEL_MAX_WIDTH - 30)
            body_lines = wrapped_body.splitlines() or [wrapped_body]
            wrapped = "\n".join(
                ("• " if index == 0 else "  ") + line
                for index, line in enumerate(body_lines)
            )
            _text_w, text_h = _text_block_size(wrapped, list_font)
            _item_start = len(elements)
            elements.append({
                "type": "text",
                "x": x + 10,
                "y": next_item_y,
                "text": wrapped,
                "fontSize": list_font,
                "strokeColor": "#1e1e1e",
                "fontFamily": 1,
                "width": _GENERIC_LABEL_MAX_WIDTH,
                "height": text_h,
                "autoResize": False,
            })
            _anim_groups.append((_item_start, len(elements)))
            diagram_bottom = max(diagram_bottom, next_item_y + text_h)
            next_item_y += text_h + 14

    else:
        gen_font = 18
        rows = []
        for item in items:
            wrapped = _wrap_text(item, gen_font, _GENERIC_LABEL_MAX_WIDTH)
            text_w, text_h = _text_block_size(wrapped, gen_font)
            rows.append((wrapped, text_w, text_h))

        inner_w = max((row[1] for row in rows), default=300.0)
        inner_w = min(max(inner_w, 300.0), _GENERIC_LABEL_MAX_WIDTH)
        row_gap = 18.0
        rows_h = sum(row[2] for row in rows)
        if len(rows) > 1:
            rows_h += row_gap * (len(rows) - 1)
        box_w = inner_w + _H_PAD * 2
        box_h = max(76.0, rows_h + _V_PAD * 2)
        border_y = content_y
        _border_start = len(elements)
        elements.append({
            "type": "rectangle",
            "x": x,
            "y": border_y,
            "width": box_w,
            "height": box_h,
            "strokeColor": "#868e96",
        })
        _anim_groups.append((_border_start, len(elements)))

        row_y = border_y + _V_PAD
        for wrapped, _text_w, text_h in rows:
            _row_start = len(elements)
            elements.append({
                "type": "text",
                "x": x + _H_PAD,
                "y": row_y,
                "text": wrapped,
                "fontSize": gen_font,
                "strokeColor": "#1e1e1e",
                "fontFamily": 1,
                "width": inner_w,
                "height": text_h,
                "autoResize": False,
            })
            _anim_groups.append((_row_start, len(elements)))
            row_y += text_h + row_gap
        diagram_bottom = max(diagram_bottom, border_y + box_h)

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

    # Keep subsequent tutor content below the complete diagram, including
    # variable-height wrapped labels.
    _cursor_y = max(_cursor_y, diagram_bottom + _TEXT_SPACING)

    logger.info(
        "draw_diagram: type=%s title=%s items=%d elements=%d anim_groups=%d bottom=%.0f",
        diagram_type, title, len(items), len(elements), len(_anim_groups), diagram_bottom,
    )
    return _defer_elements("draw_diagram", "add", elements, animation=animation)


def _diagram_id(value: Any, index: int, used: set[str]) -> str:
    """Return a short unique identifier suitable for graph bindings."""
    candidate = _re.sub(r"[^a-zA-Z0-9_-]+", "-", str(value or "").strip()).strip("-")
    candidate = (candidate or f"node-{index + 1}")[:48]
    base = candidate
    suffix = 2
    while candidate in used:
        candidate = f"{base[:40]}-{suffix}"
        suffix += 1
    used.add(candidate)
    return candidate


def _semantic_diagram_spec(
    diagram_type: str,
    title: str,
    items: Optional[List[str]],
    nodes: Optional[List[Dict[str, str]]],
    edges: Optional[List[Dict[str, str]]],
    direction: str,
) -> Dict[str, Any]:
    """Normalize model output into a bounded coordinate-free graph."""
    allowed_types = {
        "flowchart", "mindmap", "timeline", "comparison_table", "equation", "list",
    }
    kind = str(diagram_type or "flowchart").strip().lower()
    if kind not in allowed_types:
        kind = "flowchart"

    direction_aliases = {
        "tb": "TB", "top-to-bottom": "TB", "vertical": "TB",
        "lr": "LR", "left-to-right": "LR", "horizontal": "LR",
    }
    default_direction = "LR" if kind in {"mindmap", "timeline"} else "TB"
    rank_direction = direction_aliases.get(str(direction or "").strip().lower(), default_direction)

    safe_title = _normalize_math_text(str(title or "").strip())[:140]
    normalized_nodes: List[Dict[str, str]] = []
    aliases: Dict[str, str] = {}
    used_ids: set[str] = set()

    source_nodes = nodes if isinstance(nodes, list) else []
    for index, raw in enumerate(source_nodes[:10]):
        if not isinstance(raw, dict):
            continue
        label = _normalize_math_text(str(raw.get("label") or raw.get("text") or "").strip())[:120]
        if not label:
            continue
        raw_id = str(raw.get("id") or f"node-{index + 1}")
        node_id = _diagram_id(raw_id, index, used_ids)
        aliases[raw_id] = node_id
        requested_shape = str(raw.get("shape") or raw.get("kind") or "rectangle").lower()
        shape = requested_shape if requested_shape in {"rectangle", "ellipse", "diamond"} else "rectangle"
        normalized_nodes.append({"id": node_id, "label": label, "shape": shape})

    if not normalized_nodes:
        for index, item in enumerate((items or [])[:10]):
            label = _normalize_math_text(str(item or "").strip())[:120]
            if not label:
                continue
            node_id = _diagram_id(f"item-{index + 1}", index, used_ids)
            normalized_nodes.append({"id": node_id, "label": label, "shape": "rectangle"})

    if kind == "mindmap":
        root_id = _diagram_id("root", -1, used_ids)
        normalized_nodes.insert(0, {
            "id": root_id,
            "label": safe_title or "Main idea",
            "shape": "ellipse",
        })
    elif not normalized_nodes and safe_title:
        normalized_nodes.append({
            "id": _diagram_id("idea", 0, used_ids),
            "label": safe_title,
            "shape": "rectangle",
        })

    node_ids = {node["id"] for node in normalized_nodes}
    normalized_edges: List[Dict[str, str]] = []
    seen_edges: set[tuple[str, str, str]] = set()
    for raw in (edges or [])[:16]:
        if not isinstance(raw, dict):
            continue
        raw_source = str(raw.get("from") or raw.get("source") or "")
        raw_target = str(raw.get("to") or raw.get("target") or "")
        source = aliases.get(raw_source, raw_source)
        target = aliases.get(raw_target, raw_target)
        if source not in node_ids or target not in node_ids or source == target:
            continue
        label = _normalize_math_text(str(raw.get("label") or "").strip())[:80]
        key = (source, target, label)
        if key in seen_edges:
            continue
        seen_edges.add(key)
        normalized_edges.append({"from": source, "to": target, "label": label})

    if not normalized_edges and len(normalized_nodes) > 1:
        if kind == "mindmap":
            root_id = normalized_nodes[0]["id"]
            normalized_edges = [
                {"from": root_id, "to": node["id"], "label": ""}
                for node in normalized_nodes[1:]
            ]
        elif kind in {"flowchart", "timeline"}:
            normalized_edges = [
                {
                    "from": normalized_nodes[index]["id"],
                    "to": normalized_nodes[index + 1]["id"],
                    "label": "",
                }
                for index in range(len(normalized_nodes) - 1)
            ]

    return {
        "diagramType": kind,
        "title": safe_title,
        "direction": rank_direction,
        "nodes": normalized_nodes,
        "edges": normalized_edges,
    }


def draw_diagram(
    diagram_type: str,
    title: str = "",
    items: Optional[List[str]] = None,
    nodes: Optional[List[Dict[str, str]]] = None,
    edges: Optional[List[Dict[str, str]]] = None,
    direction: str = "",
) -> Dict[str, Any]:
    """Draw a structured diagram without accepting model-authored coordinates.

    Supply semantic ``nodes`` and ``edges`` when relationships matter. Each
    node supports ``id``, ``label``, and an optional ``shape`` of rectangle,
    ellipse, or diamond. Each edge supports ``from``, ``to``, and an optional
    ``label``. ``items`` remains a concise fallback for lists, timelines,
    mindmaps, and simple sequential flowcharts. Browser-side Dagre layout and
    Excalidraw bindings own all geometry.
    """
    global _cursor_y

    spec = _semantic_diagram_spec(
        diagram_type,
        title,
        items,
        nodes,
        edges,
        direction,
    )
    if not spec["nodes"]:
        return {
            "status": "error",
            "tool": "draw_diagram",
            "message": "A diagram needs at least one labelled node or item.",
        }

    import uuid as _uuid_mod

    origin_y = max(_CURSOR_Y_INIT, _cursor_y)
    descriptor = {
        "type": "structured-diagram",
        "id": f"diagram-{_uuid_mod.uuid4().hex[:12]}",
        "x": 72.0,
        "y": origin_y,
        **spec,
    }

    node_count = len(spec["nodes"])
    if spec["direction"] == "TB":
        estimated_height = 100.0 + node_count * 118.0
    else:
        estimated_height = 180.0 + min(node_count, 4) * 34.0
    _cursor_y = origin_y + estimated_height + _TEXT_SPACING

    result = _defer_elements("draw_diagram", "add", [descriptor])
    result["node_count"] = node_count
    result["edge_count"] = len(spec["edges"])
    logger.info(
        "draw_diagram semantic: type=%s nodes=%d edges=%d direction=%s",
        spec["diagramType"], node_count, len(spec["edges"]), spec["direction"],
    )
    return result


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


def point_at_whiteboard(
    x: float,
    y: float,
    label: str = "right here",
    target_area: str = "board",
) -> Dict[str, Any]:
    """Move Tars's cursor to a point in the latest whiteboard screenshot.

    Coordinates are a rough hint in the latest whiteboard screenshot. A
    dedicated GPT-5.6 Sol visual grounding pass corrects the final pixel before the
    frontend animates Tars. Set target_area to ``course_image`` when the
    target is inside the generated lesson image; Excalidraw then supplies its
    exact visible bounds and localization runs only inside that crop. Always
    use a concrete label such as ``Docker image blueprint box`` rather than
    ``this`` or ``right here``.
    """
    return {
        "status": "ok",
        "tool": "point_at_whiteboard",
        "tarsPoint": {
            "x": x,
            "y": y,
            "label": label or "right here",
            "targetArea": "course_image" if target_area == "course_image" else "board",
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
