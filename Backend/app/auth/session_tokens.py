"""Short-lived signed bearer sessions for the web application."""

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
_TOKEN_VERSION = "cts1"
_TOKEN_SCOPE = "app:session"
_MAX_TOKEN_LENGTH = 4096


def _secret() -> bytes:
    global _warned_ephemeral
    configured = settings.app_session_token_secret.strip()
    if configured:
        return configured.encode("utf-8")
    if settings.openai_api_key.strip():
        return hashlib.sha256(
            b"ctrlteach:app-session-token:v1:" + settings.openai_api_key.encode("utf-8")
        ).digest()
    if not _warned_ephemeral:
        logger.warning(
            "APP_SESSION_TOKEN_SECRET is not configured; application sessions "
            "will be invalidated on backend restart"
        )
        _warned_ephemeral = True
    return _EPHEMERAL_SECRET


def _b64_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _signature(encoded: str) -> str:
    signed = f"{_TOKEN_VERSION}.{encoded}".encode("ascii")
    return _b64_encode(hmac.new(_secret(), signed, hashlib.sha256).digest())


def create_app_session_token(user: dict[str, Any]) -> tuple[str, int]:
    now = int(time.time())
    expires_at = now + max(300, settings.app_session_token_ttl_seconds)
    payload = {
        "uid": str(user["uid"]),
        "username": str(user.get("username") or ""),
        "scope": _TOKEN_SCOPE,
        "iat": now,
        "exp": expires_at,
        "jti": secrets.token_urlsafe(16),
    }
    encoded = _b64_encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    return f"{_TOKEN_VERSION}.{encoded}.{_signature(encoded)}", expires_at


def verify_app_session_token(token: Optional[str]) -> Optional[dict[str, Any]]:
    if not token or len(token) > _MAX_TOKEN_LENGTH:
        return None
    try:
        scheme, separator, raw = token.partition(" ")
        if separator:
            if scheme.lower() != "bearer":
                return None
        else:
            raw = token

        version, encoded, signature = raw.split(".", 2)
        if version != _TOKEN_VERSION or not hmac.compare_digest(signature, _signature(encoded)):
            return None

        payload = json.loads(_b64_decode(encoded))
        now = int(time.time())
        if payload.get("scope") != _TOKEN_SCOPE:
            return None
        if int(payload.get("exp") or 0) <= now:
            return None
        if int(payload.get("iat") or 0) > now + 60:
            return None

        uid = str(payload.get("uid") or "")
        if not uid.isdigit():
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
                "scope": _TOKEN_SCOPE,
            }
    except Exception as exc:
        logger.info("Application session token rejected: %s", exc)
        return None
