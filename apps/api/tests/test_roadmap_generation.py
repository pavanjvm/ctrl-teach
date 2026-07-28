from __future__ import annotations

import unittest

from app.services.roadmap_generation import _sanitize_roadmap, generate_prompt_roadmap


class RoadmapGenerationTests(unittest.TestCase):
    def test_offline_fallback_is_stable_and_interactive(self) -> None:
        first = generate_prompt_roadmap(None, "Learn data engineering")
        second = generate_prompt_roadmap(None, "Learn data engineering")

        self.assertEqual(first["id"], second["id"])
        self.assertTrue(first["id"].startswith("custom-"))
        self.assertEqual(len(first["stages"]), 4)
        self.assertTrue(all(len(stage["topics"]) == 3 for stage in first["stages"]))
        self.assertTrue(all(
            len(topic["keywords"]) == 4
            for stage in first["stages"]
            for topic in stage["topics"]
        ))

    def test_sanitizer_owns_ids_links_and_colors(self) -> None:
        raw = {
            "id": "javascript:alert(1)",
            "title": "Security Engineering",
            "accent": "url(https://evil.example)",
            "courseIds": ["attacker-course"],
            "stages": [
                {
                    "label": f"Stage {stage_index + 1}",
                    "description": "A useful stage",
                    "topics": [
                        {
                            "title": f"Topic {stage_index + 1}.{topic_index + 1}",
                            "description": "Practice this capability in a realistic scenario.",
                            "keywords": ["one", "two", "three"],
                            "courseIds": ["attacker-course"],
                            "bootcampIds": ["https://evil.example"],
                        }
                        for topic_index in range(3)
                    ],
                }
                for stage_index in range(4)
            ],
        }

        roadmap = _sanitize_roadmap(raw, "security engineering")

        self.assertTrue(roadmap["id"].startswith("custom-"))
        self.assertEqual(roadmap["accent"], "#7c3aed")
        self.assertNotIn("attacker-course", roadmap["courseIds"])
        for stage in roadmap["stages"]:
            for topic in stage["topics"]:
                self.assertEqual(topic["courseIds"], [])
                self.assertEqual(topic["bootcampIds"], [])


if __name__ == "__main__":
    unittest.main()
