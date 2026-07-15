"""Local-disk storage for canvas snapshots / generated images.

Replaces the Cloud Storage (GCS) tools.  Files are written under
``settings.uploads_dir`` and served back via FastAPI's StaticFiles (mounted
in main.py at runtime).  Only ``upload_canvas_snapshot`` is wired onto a
live agent; the rest are kept for completeness / future use.
"""

from __future__ import annotations

import base64
import binascii
import io
import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from PIL import Image, UnidentifiedImageError

from app.config import settings

logger = logging.getLogger(__name__)


_MAX_IMAGE_BYTES = 12 * 1024 * 1024
_MAX_IMAGE_PIXELS = 24_000_000
_IMAGE_EXTENSIONS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}


def _ensure_dir() -> Path:
    root = Path(settings.uploads_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_component(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "-", str(value or "")).strip("-_")
    return cleaned[:64] or fallback


def _safe_directory(*parts: str) -> Path:
    root = _ensure_dir()
    destination = root.joinpath(*parts).resolve()
    if root != destination and root not in destination.parents:
        raise ValueError("Invalid upload path")
    destination.mkdir(parents=True, exist_ok=True)
    return destination


def _b64_decode(image_b64: str) -> bytes:
    if "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]
    image_b64 = image_b64.strip()
    padding = len(image_b64) % 4
    if padding:
        image_b64 += "=" * (4 - padding)
    if len(image_b64) > ((_MAX_IMAGE_BYTES + 2) // 3) * 4 + 4:
        raise ValueError("Image is too large")
    try:
        decoded = base64.b64decode(image_b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid base64 image data") from exc
    if len(decoded) > _MAX_IMAGE_BYTES:
        raise ValueError("Image is too large")
    return decoded


def _validated_image(image_b64: str) -> tuple[bytes, str]:
    data = _b64_decode(image_b64)
    try:
        with Image.open(io.BytesIO(data)) as image:
            width, height = image.size
            image_format = str(image.format or "").upper()
            if width <= 0 or height <= 0 or width * height > _MAX_IMAGE_PIXELS:
                raise ValueError("Image dimensions are invalid or too large")
            if image_format not in _IMAGE_EXTENSIONS:
                raise ValueError("Only JPEG, PNG, and WebP images are supported")
            image.verify()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as exc:
        raise ValueError("Invalid image data") from exc
    return data, _IMAGE_EXTENSIONS[image_format]


def upload_canvas_snapshot(
    user_id: str,
    session_id: str,
    image_bytes_base64: str,
    label: str = "snapshot",
) -> Dict[str, Any]:
    """Save a base64-encoded canvas snapshot to the local uploads dir."""
    if len(image_bytes_base64) < 100:
        return {"status": "error", "message": "Image data too small to be a valid snapshot."}
    try:
        data, extension = _validated_image(image_bytes_base64)
    except Exception as exc:
        logger.warning("upload_canvas_snapshot rejected image: %s", exc)
        return {"status": "error", "message": str(exc)}

    safe_user = _safe_component(user_id, "anonymous")
    safe_session = _safe_component(session_id, "session")
    safe_label = _safe_component(label, "snapshot")
    fname = f"{safe_label}_{uuid.uuid4().hex[:8]}.{extension}"
    relative = Path("snapshots", safe_user, safe_session, fname)
    full_path = _safe_directory(*relative.parts[:-1]) / fname
    with open(full_path, "wb") as fh:
        fh.write(data)
    return {
        "status": "ok",
        "local_path": relative.as_posix(),
        "size_bytes": len(data),
        "saved_at": datetime.now(timezone.utc).isoformat(),
    }


def upload_generated_image(
    user_id: str,
    image_bytes_base64: str,
    filename: str = "generated",
    content_type: str = "image/png",
) -> Dict[str, Any]:
    del content_type  # The decoded image signature determines the extension.
    if len(image_bytes_base64) < 100:
        return {"status": "error", "message": "Image data too small to be valid."}
    try:
        data, extension = _validated_image(image_bytes_base64)
    except Exception as exc:
        logger.warning("upload_generated_image rejected image: %s", exc)
        return {"status": "error", "message": str(exc)}
    safe_user = _safe_component(user_id, "anonymous")
    safe_filename = _safe_component(filename, "generated")
    fname = f"{safe_filename}_{uuid.uuid4().hex[:8]}.{extension}"
    relative = Path("generated", safe_user, fname)
    full_path = _safe_directory(*relative.parts[:-1]) / fname
    with open(full_path, "wb") as fh:
        fh.write(data)
    return {
        "status": "ok",
        "local_path": relative.as_posix(),
        "size_bytes": len(data),
    }


storage_tools = [upload_canvas_snapshot, upload_generated_image]
