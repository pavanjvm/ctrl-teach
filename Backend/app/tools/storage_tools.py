"""Local-disk storage for canvas snapshots / generated images.

Replaces the Cloud Storage (GCS) tools.  Files are written under
``settings.uploads_dir`` and served back via FastAPI's StaticFiles (mounted
in main.py at runtime).  Only ``upload_canvas_snapshot`` is wired onto a
live agent; the rest are kept for completeness / future use.
"""

from __future__ import annotations

import base64
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from app.config import settings

logger = logging.getLogger(__name__)


def _ensure_dir() -> str:
    os.makedirs(settings.uploads_dir, exist_ok=True)
    return settings.uploads_dir


def _b64_decode(image_b64: str) -> bytes:
    if "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]
    image_b64 = image_b64.strip()
    padding = len(image_b64) % 4
    if padding:
        image_b64 += "=" * (4 - padding)
    return base64.b64decode(image_b64)


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
        data = _b64_decode(image_bytes_base64)
    except Exception as exc:
        logger.warning("upload_canvas_snapshot: invalid base64 — %s", exc)
        return {"status": "error", "message": "Invalid base64 image data."}

    fname = f"{label}_{uuid.uuid4().hex[:8]}.jpeg"
    sub = os.path.join("snapshots", user_id, session_id)
    full_dir = os.path.join(_ensure_dir(), sub)
    os.makedirs(full_dir, exist_ok=True)
    full_path = os.path.join(full_dir, fname)
    with open(full_path, "wb") as fh:
        fh.write(data)
    return {
        "status": "ok",
        "local_path": os.path.join(sub, fname),
        "size_bytes": len(data),
        "saved_at": datetime.now(timezone.utc).isoformat(),
    }


def upload_generated_image(
    user_id: str,
    image_bytes_base64: str,
    filename: str = "generated",
    content_type: str = "image/png",
) -> Dict[str, Any]:
    ext = content_type.split("/")[-1]
    if len(image_bytes_base64) < 100:
        return {"status": "error", "message": "Image data too small to be valid."}
    try:
        data = _b64_decode(image_bytes_base64)
    except Exception as exc:
        return {"status": "error", "message": f"Invalid base64: {exc}"}
    fname = f"{filename}_{uuid.uuid4().hex[:8]}.{ext}"
    sub = os.path.join("generated", user_id)
    full_dir = os.path.join(_ensure_dir(), sub)
    os.makedirs(full_dir, exist_ok=True)
    full_path = os.path.join(full_dir, fname)
    with open(full_path, "wb") as fh:
        fh.write(data)
    return {
        "status": "ok",
        "local_path": os.path.join(sub, fname),
        "size_bytes": len(data),
    }


storage_tools = [upload_canvas_snapshot, upload_generated_image]