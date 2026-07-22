"""Per-user Google OAuth tokens — no longer used.

This module previously persisted Google Calendar OAuth access tokens in
Firestore.  All Google Cloud / Calendar code has been removed; this stub
remains only to satisfy any legacy imports.
"""

from __future__ import annotations


def save_google_token(uid: str, access_token: str) -> None:  # noqa: D401
    """Deprecated no-op — Google Calendar integration removed."""


def load_google_token(uid: str):  # noqa: D401
    """Deprecated — always returns None."""
    return None


def get_calendar_service(uid: str):
    """Deprecated — always returns None."""
    return None