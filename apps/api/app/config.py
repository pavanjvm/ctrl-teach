"""Application configuration using pydantic-settings.

Local-first stack: OpenAI Realtime API + SQLite + signed bearer sessions.
No Firebase / Google Cloud / OAuth dependencies remain.
"""

from __future__ import annotations

import json
from typing import List, Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralised application settings loaded from environment / .env file."""

    model_config = SettingsConfigDict(
        # .env.local is ignored by git and may override local demo settings
        # without changing a developer's secret-bearing .env file.
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── OpenAI ─────────────────────────────────────────────────────────────
    openai_api_key: str = ""
    realtime_model: str = "gpt-realtime-2.1"
    realtime_reasoning_effort: Literal["minimal", "low", "medium", "high", "xhigh"] = "high"
    realtime_voice: str = "ash"
    transcription_model: str = "gpt-4o-mini-transcribe"
    classroom_transcription_model: str = "gpt-transcribe"
    course_generation_model: str = "gpt-5.4-mini"
    image_model: str = "gpt-image-2"
    # Keep the learner-facing interview responsive and bound longer background
    # writing/image requests so a broken connection cannot stall a job forever.
    course_intake_timeout_seconds: float = 30.0
    course_generation_request_timeout_seconds: float = 180.0

    # Tavus is used only as the realtime face renderer for Role Playing.
    # The API key stays on the backend; the browser receives a short-lived
    # Daily meeting token for the conversation it starts.
    tavus_api_key: str = ""
    tavus_face_id: str = ""
    tavus_pal_id: str = ""
    # Billing safeguards. Tavus starts metering when it creates the room, so
    # short server-enforced timeouts protect credits if browser cleanup fails.
    tavus_max_call_duration_seconds: int = 600
    tavus_participant_left_timeout_seconds: int = 5
    tavus_participant_absent_timeout_seconds: int = 30
    # Backward-compatible aliases for deployments configured before Tavus
    # renamed Replicas/Personas to Faces/PALs.
    tavus_replica_id: str = ""
    tavus_persona_id: str = ""
    tars_visual_locator_enabled: bool = True
    tars_visual_locator_model: str = "gpt-5.6-sol"
    tars_visual_locator_trial_models: str = "gpt-5.6-sol"
    tars_visual_locator_service_tier: Literal["auto", "default", "flex", "priority"] = "priority"
    tars_visual_locator_reasoning_effort: str = "medium"
    tars_visual_locator_batch_reasoning_effort: str = "low"
    tars_visual_locator_timeout_seconds: float = 20.0

    # ── Firecrawl (discovery + course-page/document extraction) ───────────
    firecrawl_api_key: str = ""

    # ── Database (SQLite) ───────────────────────────────────────────────────
    # A local file path. Use "sqlite:///:memory:" for an ephemeral DB.
    database_url: str = "sqlite:///./ctrlteach.db"

    # ── Auth ────────────────────────────────────────────────────────────────
    # JSON list of {"username":"x","password":"y","is_admin":true} seeded
    # into the users table on startup. Prefer registration for learner users.
    app_users: str = "[]"
    # New PBKDF2-SHA256 password hashes use at least 600,000 rounds.
    password_pbkdf2_rounds: int = 600_000
    # HMAC secret for short-lived application bearer sessions. Production
    # deployments should always provide an independent high-entropy value.
    app_session_token_secret: str = ""
    app_session_token_ttl_seconds: int = 43_200
    # HMAC secret for short-lived browser-extension sessions. When omitted a
    # process-local secret is generated, which is safe for development but
    # invalidates extension sessions whenever the backend restarts.
    tars_extension_token_secret: str = ""
    tars_extension_token_ttl_seconds: int = 43_200

    # ── Local file storage (replaces GCS) ──────────────────────────────────
    # Directory where canvas snapshots / generated images are written.
    uploads_dir: str = "./uploads"

    # ── Server ─────────────────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"
    cors_origins: str = '["http://localhost:3000"]'

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from JSON string."""
        try:
            return json.loads(self.cors_origins)
        except (json.JSONDecodeError, TypeError):
            return ["http://localhost:3000"]

    @property
    def seeded_users(self) -> list[dict]:
        try:
            users = json.loads(self.app_users)
            if isinstance(users, list):
                return users
        except (json.JSONDecodeError, TypeError):
            pass
        return []


# Singleton
settings = Settings()
