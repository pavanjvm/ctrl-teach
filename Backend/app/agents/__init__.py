"""Agents package.

Provides a shared OpenAI Async client used by the image-generation tool.
The realtime model itself is managed by the OpenAI Agents SDK's
``RealtimeRunner`` (see app.main).
"""

from __future__ import annotations

import logging
import os

from openai import AsyncOpenAI

from app.config import settings

logger = logging.getLogger(__name__)

# Shared async OpenAI client for non-realtime calls (image generation).
# The realtime WebSocket session is created separately by RealtimeRunner.
openai_client = AsyncOpenAI(
    api_key=settings.openai_api_key or os.environ.get("OPENAI_API_KEY") or None,
)