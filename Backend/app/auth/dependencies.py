"""Manual Basic-auth dependency.

Verifies username + password against the local SQLite ``users`` table
(bcrypt-hashed).  Returns a dict with the numeric ``uid``, ``username``,
``email``, ``name``.

The WebSocket endpoint in main.py performs the same check directly (since
FastAPI dependencies don't apply to WebSocket parameters).
"""

from __future__ import annotations

import logging
import secrets
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from passlib.context import CryptContext

from app.db import get_user_by_username

logger = logging.getLogger(__name__)

security = HTTPBasic()
_pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def _verify(username: str, password: str) -> bool:
    user = get_user_by_username(username)
    if user is None:
        # Constant-ish-time-ish failure: still do one hash operation.
        _pwd.hash(password or "dummy")
        return False
    try:
        return _pwd.verify(password, user.password_hash)
    except Exception:
        return False


def get_current_user(credentials: HTTPBasicCredentials = Depends(security)) -> dict:
    """FastAPI dependency returning the authenticated user dict."""
    username = (credentials.username or "").strip()
    ok = _verify(username, credentials.password or "")
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    user = get_user_by_username(username)
    if user is None:  # race / shouldn't happen
        raise HTTPException(status_code=401, detail="User not found")

    # Update last_login (best effort)
    try:
        from datetime import datetime, timezone
        from app.db import SessionLocal
        with SessionLocal() as db:
            db_user = db.get(type(user), user.id)
            if db_user is not None:
                db_user.last_login = datetime.now(timezone.utc)
                db.commit()
    except Exception:
        pass

    return {
        "uid": str(user.id),
        "username": user.username,
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
    }


def verify_basic_credentials(token: Optional[str]) -> Optional[dict]:
    """Verify an HTTP ``Authorization: Basic <b64>`` header value.

    Returns the user dict (same shape as get_current_user) or None.
    Used by the WebSocket endpoint which can't use FastAPI deps.
    """
    if not token:
        return None
    try:
        scheme, _, payload = token.partition(" ")
        if scheme.lower() != "basic" or not payload:
            return None
        import base64
        decoded = base64.b64decode(payload).decode("utf-8", errors="replace")
        username, sep, password = decoded.partition(":")
        if not sep:
            return None
        if not _verify(username, password):
            return None
        user = get_user_by_username(username)
        if user is None:
            return None
        return {
            "uid": str(user.id),
            "username": user.username,
            "email": user.email,
            "name": user.name,
            "picture": user.picture,
        }
    except Exception as exc:
        logger.warning("verify_basic_credentials failed: %s", exc)
        return None
