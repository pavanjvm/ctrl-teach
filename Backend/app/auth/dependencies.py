"""Application authentication dependencies for signed bearer sessions."""

from __future__ import annotations

from typing import Optional

from fastapi import Header, HTTPException, status

from app.auth.passwords import (
    hash_password,
    password_needs_rehash,
    verify_password,
)
from app.db import SessionLocal, User, get_user_by_username
from app.auth.session_tokens import verify_app_session_token


def _verify(username: str, password: str) -> bool:
    user = get_user_by_username(username)
    if user is None:
        # Keep unknown-account timing close to a real password verification.
        hash_password(password or "dummy")
        return False
    return verify_password(password, user.password_hash)


def _user_dict(user) -> dict:
    return {
        "uid": str(user.id),
        "username": user.username,
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
    }


def authenticate_user_credentials(username: str, password: str) -> Optional[dict]:
    clean_username = (username or "").strip()
    if not _verify(clean_username, password or ""):
        return None
    user = get_user_by_username(clean_username)
    if user is not None and password_needs_rehash(user.password_hash):
        with SessionLocal() as db:
            stored_user = db.get(User, user.id)
            if stored_user is not None:
                stored_user.password_hash = hash_password(password)
                db.commit()
    return _user_dict(user) if user is not None else None


def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    """Return the user represented by a valid signed bearer session."""
    authenticated = verify_app_session_token(authorization)
    if authenticated is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return authenticated
