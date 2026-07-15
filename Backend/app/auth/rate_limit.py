"""Small process-local sliding-window limiter for public auth endpoints."""

from __future__ import annotations

from collections import defaultdict, deque
from collections.abc import Callable
from threading import Lock
import time


class SlidingWindowRateLimiter:
    def __init__(
        self,
        *,
        limit: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.limit = max(1, limit)
        self.window_seconds = max(1.0, window_seconds)
        self._clock = clock
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def consume(self, key: str) -> tuple[bool, int]:
        """Consume one attempt and return (allowed, retry_after_seconds)."""
        now = self._clock()
        cutoff = now - self.window_seconds
        with self._lock:
            if len(self._events) > 1024:
                for stale_key, stale_events in list(self._events.items()):
                    while stale_events and stale_events[0] <= cutoff:
                        stale_events.popleft()
                    if not stale_events:
                        self._events.pop(stale_key, None)
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self.limit:
                retry_after = max(1, int(events[0] + self.window_seconds - now) + 1)
                return False, retry_after
            events.append(now)
            return True, 0

    def reset(self, key: str) -> None:
        with self._lock:
            self._events.pop(key, None)
