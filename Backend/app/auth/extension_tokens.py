"""Short-lived, scope-limited authentication for the Tars extension."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
from typing import Any, Optional

from app.config import settings
from app.db import SessionLocal, User

logger = logging.getLogger(__name__)
_EPHEMERAL_SECRET = secrets.token_bytes(32)
_warned_ephemeral = False
_MAX_TOKEN_LENGTH = 4096


def _secret() -> bytes:
    global _warned_ephemeral
    configured = settings.tars_extension_token_secret.strip()
    if configured:
        return configured.encode("utf-8")
    # Local development already requires a high-entropy OpenAI key. Derive a
    # purpose-separated HMAC key from it so extension sessions survive uvicorn
    # reloads without ever exposing or directly reusing the API key bytes.
    if settings.openai_api_key.strip():
        return hashlib.sha256(
            b"ctrlteach:tars-extension-token:v1:" + settings.openai_api_key.encode("utf-8")
        ).digest()
    if not _warned_ephemeral:
        logger.warning(
            "TARS_EXTENSION_TOKEN_SECRET is not configured; extension sessions "
            "will be invalidated on backend restart"
        )
        _warned_ephemeral = True
    return _EPHEMERAL_SECRET


def _b64_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_tars_extension_token(user: dict[str, Any]) -> tuple[str, int]:
    now = int(time.time())
    expires_at = now + max(300, settings.tars_extension_token_ttl_seconds)
    payload = {
        "uid": str(user["uid"]),
        "username": str(user.get("username") or ""),
        "scope": "tars:realtime",
        "iat": now,
        "exp": expires_at,
        "jti": secrets.token_urlsafe(12),
    }
    encoded = _b64_encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signature = _b64_encode(
        hmac.new(_secret(), encoded.encode("ascii"), hashlib.sha256).digest()
    )
    return f"ctc1.{encoded}.{signature}", expires_at


def verify_tars_extension_token(token: Optional[str]) -> Optional[dict[str, Any]]:
    if not token or len(token) > _MAX_TOKEN_LENGTH:
        return None
    try:
        scheme, separator, raw = token.partition(" ")
        if separator and scheme.lower() != "bearer":
            return None
        if not separator:
            raw = token
        version, encoded, signature = raw.split(".", 2)
        if version != "ctc1":
            return None
        expected = _b64_encode(
            hmac.new(_secret(), encoded.encode("ascii"), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(signature, expected):
            return None
        payload = json.loads(_b64_decode(encoded))
        if payload.get("scope") != "tars:realtime":
            return None
        now = int(time.time())
        if int(payload.get("exp") or 0) <= now:
            return None
        if int(payload.get("iat") or 0) > now + 60:
            return None
        uid = str(payload.get("uid") or "")
        if not uid:
            return None
        with SessionLocal() as db:
            user = db.get(User, int(uid))
            if user is None:
                return None
            return {
                "uid": str(user.id),
                "username": user.username,
                "email": user.email,
                "name": user.name,
                "picture": user.picture,
                "scope": "tars:realtime",
            }
    except Exception as exc:
        logger.warning("Tars extension token verification failed: %s", exc)
        return None
