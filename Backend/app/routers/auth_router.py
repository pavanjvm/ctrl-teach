from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.auth.dependencies import authenticate_user_credentials
from app.auth.passwords import hash_password
from app.auth.rate_limit import SlidingWindowRateLimiter
from app.auth.session_tokens import create_app_session_token
from app.db import Profile, SessionLocal, User

router = APIRouter(prefix="/api/auth", tags=["auth"])

_login_ip_limiter = SlidingWindowRateLimiter(limit=30, window_seconds=300)
_login_account_limiter = SlidingWindowRateLimiter(limit=10, window_seconds=300)
_register_ip_limiter = SlidingWindowRateLimiter(limit=10, window_seconds=3600)


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _consume_or_reject(limiter: SlidingWindowRateLimiter, key: str) -> None:
    allowed, retry_after = limiter.consume(key)
    if allowed:
        return
    raise HTTPException(
        status_code=429,
        detail="Too many authentication attempts. Try again later.",
        headers={"Retry-After": str(retry_after)},
    )


class RegisterBody(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=8, max_length=256)
    name: str = Field(default="", max_length=255)
    email: Optional[str] = Field(default=None, max_length=255)


class LoginBody(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)


class SessionResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: int
    user: Dict[str, Any]


@router.post("/login", response_model=SessionResponse)
async def login(body: LoginBody, request: Request):
    client_key = _client_key(request)
    account_key = body.username.strip().casefold()
    _consume_or_reject(_login_ip_limiter, client_key)
    _consume_or_reject(_login_account_limiter, account_key)
    user = authenticate_user_credentials(body.username, body.password)
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    _login_account_limiter.reset(account_key)
    with SessionLocal() as db:
        db_user = db.get(User, int(user["uid"]))
        if db_user is not None:
            db_user.last_login = datetime.now(timezone.utc)
            db.commit()
    token, expires_at = create_app_session_token(user)
    return SessionResponse(
        access_token=token,
        expires_at=expires_at,
        user=user,
    )


@router.post("/register", response_model=Dict[str, Any])
async def register(body: RegisterBody, request: Request):
    _consume_or_reject(_register_ip_limiter, _client_key(request))
    username = body.username.strip()
    if not username or not body.password:
        raise HTTPException(status_code=400, detail="username and password are required")
    with SessionLocal() as db:
        existing = db.scalar(select(User).where(User.username == username))
        if existing is not None:
            raise HTTPException(status_code=409, detail="username already exists")

        user = User(
            username=username,
            password_hash=hash_password(body.password),
            email=body.email or username,
            name=body.name or username,
            created_at=datetime.now(timezone.utc),
        )
        db.add(user)
        db.flush()
        db.add(Profile(user_id=user.id))
        db.commit()

    return {"status": "created", "username": username}
