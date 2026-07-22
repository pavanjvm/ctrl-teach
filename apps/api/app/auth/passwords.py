"""Password hashing policy shared by registration, login, and user seeding."""

from __future__ import annotations

from passlib.context import CryptContext

from app.config import settings


_MIN_PBKDF2_ROUNDS = 600_000
password_context = CryptContext(
    schemes=["pbkdf2_sha256"],
    deprecated="auto",
    pbkdf2_sha256__default_rounds=max(
        _MIN_PBKDF2_ROUNDS,
        settings.password_pbkdf2_rounds,
    ),
    pbkdf2_sha256__min_desired_rounds=_MIN_PBKDF2_ROUNDS,
)


def hash_password(password: str) -> str:
    return password_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return password_context.verify(password, password_hash)
    except Exception:
        return False


def password_needs_rehash(password_hash: str) -> bool:
    try:
        return password_context.needs_update(password_hash)
    except Exception:
        return False
