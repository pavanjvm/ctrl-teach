"""Calendar router — removed (Google Calendar integration dropped).

All endpoints have been deleted.  The router still exposes an empty
APIRouter so ``app.main`` can continue to mount it harmlessly, but it is
actually no longer mounted in main.py.  Kept only for legacy imports.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(
    prefix="/api/calendar",
    tags=["calendar"],
)