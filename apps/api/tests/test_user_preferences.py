from __future__ import annotations

import unittest

from app.routers.users import _merge_preferences


class UserPreferenceMergeTests(unittest.TestCase):
    def test_preserves_settings_when_learning_memory_syncs(self) -> None:
        merged = _merge_preferences(
            {
                "dark_mode": True,
                "notifications": False,
                "ctrlteach": {"name": "Pavan", "onboarded": True},
            },
            {
                "ctrlteach": {
                    "learnerMemory": {
                        "version": 1,
                        "events": [{"id": "assessment:1"}],
                    }
                }
            },
        )

        self.assertTrue(merged["dark_mode"])
        self.assertFalse(merged["notifications"])
        self.assertEqual(merged["ctrlteach"]["name"], "Pavan")
        self.assertEqual(merged["ctrlteach"]["learnerMemory"]["version"], 1)

    def test_updates_only_the_requested_top_level_setting(self) -> None:
        merged = _merge_preferences(
            {"dark_mode": False, "ctrlteach": {"onboarded": True}},
            {"dark_mode": True},
        )

        self.assertTrue(merged["dark_mode"])
        self.assertEqual(merged["ctrlteach"], {"onboarded": True})


if __name__ == "__main__":
    unittest.main()
