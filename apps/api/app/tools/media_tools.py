"""Image-generation tool for the Magic Whiteboard Tutor.

Migrated from Gemini 3 Pro image generation to the OpenAI Images API
(``gpt-image-2`` by default). Returns base64 image bytes which are placed on the
student's Excalidraw canvas via ``add_image_to_canvas`` (deferred-image
bridge pattern, unchanged).
"""

from __future__ import annotations

import base64
import io
import logging
from typing import Any, Dict

from PIL import Image, ImageDraw

from app.agents import openai_client
from app.config import settings
from app.tools.canvas_tools import add_image_to_canvas
import app.tools.canvas_tools as _ct
from app.utils.ws_signals import ws_notify

logger = logging.getLogger(__name__)

# Gap between the last written content and the top of a generated image
_IMAGE_Y_GAP = 30.0

# Corner radius (px) applied to generated images
_CORNER_RADIUS = 40


def _round_corners(image_bytes: bytes, radius: int = _CORNER_RADIUS) -> bytes:
    """Apply rounded corners to an image and return PNG bytes."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    w, h = img.size

    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, w, h], radius=radius, fill=255)

    img.putalpha(mask)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class MediaTools:
    """Generate educational images with the OpenAI Images API."""

    def __init__(self) -> None:
        self.model = settings.image_model

    async def generate_image(self, prompt: str) -> str:
        """Generate an image and return it as a base64-encoded PNG string."""
        response = await openai_client.images.generate(
            model=self.model,
            prompt=prompt,
            size="1024x1024",
        )
        for item in response.data:
            b64 = getattr(item, "b64_json", None)
            if b64:
                return b64
        return ""

    async def generate_and_show_image(
        self,
        prompt: str,
        x: float = 60.0,
        y: float = -1.0,
        width: float = 400.0,
        height: float = 300.0,
    ) -> Dict[str, Any]:
        """Generate an educational image and place it on the whiteboard.

        Parameters
        ----------
        prompt:
            Detailed description of the image to generate.
        x:
            Horizontal position on the canvas (default 60).
        y:
            Vertical position on the canvas (default -1 = auto-place below
            existing board content so it never overlaps text or diagrams).
        width:
            Display width in pixels (default 400).
        height:
            Display height in pixels (default 300).
        """
        # ── Auto-position below existing board content ────────────────────
        if y < 0:
            y = max(_ct._cursor_y + _IMAGE_Y_GAP, _ct._CURSOR_Y_INIT + _IMAGE_Y_GAP)

        # ── Notify the frontend BEFORE the slow image API call ────────────
        notify = ws_notify.get()
        if notify:
            try:
                notify({"type": "generating_image", "tool": "generate_and_show_image", "status": "started"})
            except Exception:
                pass

        image_b64 = await self.generate_image(prompt)
        if not image_b64:
            if notify:
                try:
                    notify({"type": "generating_image", "status": "error"})
                except Exception:
                    pass
            return {
                "status": "error",
                "tool": "generate_and_show_image",
                "action": "add",
                "elements": [],
                "message": "Image generation failed — no data returned.",
            }

        # Round corners client-side for a polished look.
        try:
            png_bytes = _round_corners(base64.b64decode(image_b64))
            image_b64 = base64.b64encode(png_bytes).decode("utf-8")
        except Exception as exc:
            logger.warning("Rounded-corner post-processing failed: %s", exc)

        canvas_result = await add_image_to_canvas(
            image_base64=image_b64,
            x=x,
            y=y,
            width=width,
            height=height,
            mime_type="image/png",
        )

        _ct._cursor_y = max(_ct._cursor_y, y + height + _ct._TEXT_SPACING + 20)

        return {
            **canvas_result,
            "tool": "generate_and_show_image",
        }
