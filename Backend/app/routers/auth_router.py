from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import select

from app.db import Profile, SessionLocal, User

router = APIRouter(prefix="/api/auth", tags=["auth"])

_pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


class RegisterBody(BaseModel):
    username: str
    password: str
    name: str = ""
    email: Optional[str] = None


@router.post("/register", response_model=Dict[str, Any])
async def register(body: RegisterBody):
    username = body.username.strip()
    if not username or not body.password:
        raise HTTPException(status_code=400, detail="username and password are required")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="password must be at least 6 characters")

    with SessionLocal() as db:
        existing = db.scalar(select(User).where(User.username == username))
        if existing is not None:
            raise HTTPException(status_code=409, detail="username already exists")

        user = User(
            username=username,
            password_hash=_pwd.hash(body.password),
            email=body.email or username,
            name=body.name or username,
            created_at=datetime.now(timezone.utc),
        )
        db.add(user)
        db.flush()
        db.add(Profile(user_id=user.id))
        db.commit()

    return {"status": "created", "username": username}
