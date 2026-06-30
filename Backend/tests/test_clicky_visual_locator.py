from __future__ import annotations

from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from app.services.clicky_visual_locator import (
    LocalizationResult,
    _spatial_result,
    refine_clicky_payload,
)


class SpatialResultTests(unittest.TestCase):
    def test_extracts_and_normalizes_bounding_drag(self) -> None:
        call = SimpleNamespace(actions=[SimpleNamespace(
            type="drag",
            path=[SimpleNamespace(x=90, y=80), SimpleNamespace(x=20, y=10)],
        )])

        result = _spatial_result(call, "bounds")

        self.assertEqual(result, LocalizationResult(mode="bounds", start=(20, 10), end=(90, 80)))

    def test_supports_legacy_single_click_action(self) -> None:
        call = SimpleNamespace(
            actions=None,
            action=SimpleNamespace(type="click", x=42, y=57),
        )

        result = _spatial_result(call, "point")

        self.assertEqual(result, LocalizationResult(mode="point", start=(42, 57)))

    def test_preserves_segment_direction(self) -> None:
        call = SimpleNamespace(actions=[SimpleNamespace(
            type="drag",
            path=[SimpleNamespace(x=90, y=80), SimpleNamespace(x=20, y=10)],
        )])

        result = _spatial_result(call, "segment")

        self.assertEqual(result, LocalizationResult(mode="segment", start=(90, 80), end=(20, 10)))


class RefinePayloadTests(unittest.IsolatedAsyncioTestCase):
    async def test_replaces_realtime_bounds_with_computer_use_bounds(self) -> None:
        payload = {
            "coordinate_space": "media",
            "shape": "rectangle",
            "x": 100,
            "y": 100,
            "end_x": 200,
            "end_y": 200,
            "label": "target",
        }
        state = {
            "clicky_media_crop": {
                "rawData": "abc",
                "rawMimeType": "image/png",
                "width": 800,
                "height": 400,
            },
            "last_input_transcript": "box the target",
        }

        with patch(
            "app.services.clicky_visual_locator.locate_visual_target",
            new=AsyncMock(return_value=LocalizationResult(
                mode="bounds",
                start=(80, 40),
                end=(400, 200),
            )),
        ):
            refined = await refine_clicky_payload(payload, state, tool_name="draw_on_screen")

        self.assertEqual(refined["x"], 100)
        self.assertEqual(refined["y"], 100)
        self.assertEqual(refined["end_x"], 500)
        self.assertEqual(refined["end_y"], 500)
        self.assertEqual(refined["grounding"], "computer_use")

    async def test_replaces_realtime_underline_with_grounded_segment(self) -> None:
        payload = {
            "coordinate_space": "media",
            "shape": "underline",
            "x": 10,
            "y": 10,
            "end_x": 20,
            "end_y": 20,
            "label": "formula",
        }
        state = {
            "clicky_media_crop": {
                "rawData": "abc",
                "rawMimeType": "image/png",
                "width": 800,
                "height": 400,
            },
        }

        with patch(
            "app.services.clicky_visual_locator.locate_visual_target",
            new=AsyncMock(return_value=LocalizationResult(
                mode="segment",
                start=(80, 360),
                end=(400, 360),
            )),
        ):
            refined = await refine_clicky_payload(payload, state, tool_name="draw_on_screen")

        self.assertEqual(refined["x"], 100)
        self.assertEqual(refined["y"], 900)
        self.assertEqual(refined["end_x"], 500)
        self.assertEqual(refined["end_y"], 900)
        self.assertEqual(refined["grounding_mode"], "segment")

    async def test_refines_non_dom_viewport_point(self) -> None:
        payload = {
            "coordinate_space": "viewport",
            "x": 10,
            "y": 20,
            "label": "play icon",
        }
        state = {
            "clicky_viewport_capture": {
                "data": "abc",
                "mimeType": "image/jpeg",
                "width": 1440,
                "height": 900,
            },
        }

        with patch(
            "app.services.clicky_visual_locator.locate_visual_target",
            new=AsyncMock(return_value=LocalizationResult(
                mode="point",
                start=(720, 450),
            )),
        ):
            refined = await refine_clicky_payload(payload, state, tool_name="point_at")

        self.assertEqual(refined["x"], 720)
        self.assertEqual(refined["y"], 450)
        self.assertEqual(refined["grounding"], "computer_use")

    async def test_skips_exact_dom_targets(self) -> None:
        payload = {"target_id": "dom-1", "label": "button"}
        refined = await refine_clicky_payload(payload, {}, tool_name="point_at")
        self.assertIs(refined, payload)


if __name__ == "__main__":
    unittest.main()
