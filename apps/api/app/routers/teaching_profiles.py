"""Read and select the curated teaching profile used globally by Tars."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.db import Profile, SessionLocal
from app.services.teaching_profiles import (
    PREFERENCE_KEY,
    get_teaching_profile,
    list_teaching_profiles,
    made_to_stick_foundation,
    selected_teaching_profile_id,
)


router = APIRouter(prefix="/api/teaching-profiles", tags=["teaching-profiles"])


class TeachingProfileSelection(BaseModel):
    profileId: str | None = None


def _uid(user: dict) -> int:
    try:
        return int(user["uid"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Bad user id")


@router.get("", response_model=dict[str, Any])
async def get_catalog(user: dict = Depends(get_current_user)):
    uid = _uid(user)
    return {
        "profiles": [profile.public_dict() for profile in list_teaching_profiles()],
        "selectedProfileId": selected_teaching_profile_id(uid),
        "foundation": made_to_stick_foundation(),
        "disclaimer": (
            "Teaching profiles are inspired by documented educational approaches. "
            "Tars does not impersonate or speak as these educators."
        ),
    }


@router.put("/selection", response_model=dict[str, Any])
async def update_selection(
    body: TeachingProfileSelection,
    user: dict = Depends(get_current_user),
):
    uid = _uid(user)
    normalized = str(body.profileId).strip().lower() if body.profileId else None
    if normalized and get_teaching_profile(normalized) is None:
        raise HTTPException(status_code=422, detail="Unknown teaching profile")

    with SessionLocal() as db:
        profile = db.get(Profile, uid)
        if profile is None:
            profile = Profile(user_id=uid)
            db.add(profile)
        preferences = dict(profile.preferences) if isinstance(profile.preferences, dict) else {}
        ctrlteach = dict(preferences.get("ctrlteach") or {})
        if normalized:
            ctrlteach[PREFERENCE_KEY] = normalized
        else:
            ctrlteach.pop(PREFERENCE_KEY, None)
        preferences["ctrlteach"] = ctrlteach
        profile.preferences = preferences
        profile.updated_at = datetime.now(timezone.utc)
        db.commit()

    return {
        "status": "ok",
        "selectedProfileId": normalized,
        "profile": get_teaching_profile(normalized).public_dict() if normalized else None,
    }
