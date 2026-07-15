from __future__ import annotations

import unittest

from app.auth.rate_limit import SlidingWindowRateLimiter


class SlidingWindowRateLimiterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.now = 100.0
        self.limiter = SlidingWindowRateLimiter(
            limit=2,
            window_seconds=10,
            clock=lambda: self.now,
        )

    def test_blocks_after_limit_and_reports_retry(self) -> None:
        self.assertEqual(self.limiter.consume("user"), (True, 0))
        self.assertEqual(self.limiter.consume("user"), (True, 0))
        allowed, retry_after = self.limiter.consume("user")
        self.assertFalse(allowed)
        self.assertGreaterEqual(retry_after, 10)

    def test_window_expiry_allows_another_attempt(self) -> None:
        self.limiter.consume("user")
        self.limiter.consume("user")
        self.now += 11
        self.assertEqual(self.limiter.consume("user"), (True, 0))

    def test_reset_only_clears_selected_key(self) -> None:
        self.limiter.consume("user")
        self.limiter.consume("other")
        self.limiter.reset("user")
        self.assertEqual(self.limiter.consume("user"), (True, 0))
        self.assertEqual(self.limiter.consume("other"), (True, 0))


if __name__ == "__main__":
    unittest.main()
