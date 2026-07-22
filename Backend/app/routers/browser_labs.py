"""Browser lab attempts verified from Tars extension evidence."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user
from app.auth.extension_tokens import verify_tars_extension_token
from app.services import browser_labs

router = APIRouter(prefix="/api/browser-labs", tags=["browser-labs"])


class BrowserLabAttemptResponse(BaseModel):
    attempt: dict[str, Any]


class BrowserLabEvidenceRequest(BaseModel):
    clientEventId: Optional[str] = Field(default=None, max_length=120)
    kind: str = Field(min_length=1, max_length=80)
    payload: dict[str, Any] = Field(default_factory=dict)


class BrowserLabPracticeAttemptRequest(BaseModel):
    clientAttemptId: str = Field(min_length=1, max_length=120)
    optionId: str = Field(min_length=1, max_length=80)


def get_tars_extension_user(authorization: Optional[str] = Header(default=None)) -> dict[str, Any]:
    user = verify_tars_extension_token(authorization)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Tars extension token",
        )
    return user


@router.post("/{course_id}/{lesson_id}/attempts", response_model=BrowserLabAttemptResponse)
async def create_browser_lab_attempt(
    course_id: str,
    lesson_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> BrowserLabAttemptResponse:
    return BrowserLabAttemptResponse(
        attempt=browser_labs.start_attempt(course_id, lesson_id, user)
    )


@router.get("/attempts/{attempt_id}", response_model=BrowserLabAttemptResponse)
async def get_browser_lab_attempt(
    attempt_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> BrowserLabAttemptResponse:
    return BrowserLabAttemptResponse(
        attempt=browser_labs.get_attempt(attempt_id, user)
    )


@router.post("/attempts/{attempt_id}/evidence", response_model=BrowserLabAttemptResponse)
async def submit_browser_lab_evidence(
    attempt_id: str,
    request: BrowserLabEvidenceRequest,
    user: dict[str, Any] = Depends(get_tars_extension_user),
) -> BrowserLabAttemptResponse:
    return BrowserLabAttemptResponse(
        attempt=browser_labs.record_evidence(attempt_id, user, request.model_dump())
    )


@router.post("/attempts/{attempt_id}/recovery", response_model=BrowserLabAttemptResponse)
async def create_browser_lab_recovery(
    attempt_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> BrowserLabAttemptResponse:
    return BrowserLabAttemptResponse(
        attempt=browser_labs.create_recovery(attempt_id, user)
    )


@router.post(
    "/attempts/{attempt_id}/recoveries/{recovery_id}/practice-attempts",
    response_model=BrowserLabAttemptResponse,
)
async def submit_browser_lab_recovery_practice(
    attempt_id: str,
    recovery_id: str,
    request: BrowserLabPracticeAttemptRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> BrowserLabAttemptResponse:
    return BrowserLabAttemptResponse(
        attempt=browser_labs.record_practice_attempt(
            attempt_id,
            recovery_id,
            user,
            client_attempt_id=request.clientAttemptId,
            option_id=request.optionId,
        )
    )


@router.post(
    "/attempts/{attempt_id}/recoveries/{recovery_id}/retry",
    response_model=BrowserLabAttemptResponse,
)
async def retry_browser_lab_recovery(
    attempt_id: str,
    recovery_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> BrowserLabAttemptResponse:
    return BrowserLabAttemptResponse(
        attempt=browser_labs.start_recovery_retry(attempt_id, recovery_id, user)
    )
