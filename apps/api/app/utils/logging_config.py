"""Structured logging configuration."""

from __future__ import annotations

import logging
import sys
from typing import Optional


def setup_logging(level: Optional[str] = None) -> None:
    """Configure root logger with structured format.

    Parameters
    ----------
    level:
        One of "debug", "info", "warning", "error".  Defaults to "info".
    """
    level = (level or "info").upper()
    numeric_level = getattr(logging, level, logging.INFO)

    fmt = (
        "%(asctime)s | %(levelname)-8s | %(name)-35s | %(message)s"
    )
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(fmt, datefmt="%Y-%m-%d %H:%M:%S"))

    root = logging.getLogger()
    root.setLevel(numeric_level)
    # Remove existing handlers to avoid duplicates on reload
    root.handlers.clear()
    root.addHandler(handler)

    # Silence noisy libraries
    for noisy in (
        "httpcore",
        "httpx",
        "urllib3",
        "sqlalchemy.engine",
        "websockets",
    ):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
