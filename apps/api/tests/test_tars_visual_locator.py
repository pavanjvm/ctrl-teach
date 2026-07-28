from __future__ import annotations

from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from app.agents.tars_agent import _resolve_point_at
from app.services.tars_visual_locator import (
    LocalizationResult,
    _mode_for,
    _spatial_result,
    locate_visual_target,
    locate_visual_targets_batch,
    refine_tars_payload,
    refine_tars_payloads_batch,
)
from app.utils.ws_signals import tars_visual_state, ws_notify


class SpatialResultTests(unittest.TestCase):
    def test_triangle_uses_one_bounds_localization(self) -> None:
        self.assertEqual(_mode_for("draw_on_screen", "triangle"), "bounds")

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

    def test_rejects_click_when_bounds_were_requested(self) -> None:
        call = SimpleNamespace(actions=[SimpleNamespace(type="click", x=42, y=57)])

        result = _spatial_result(call, "bounds")

        self.assertIsNone(result)

    def test_preserves_segment_direction(self) -> None:
        call = SimpleNamespace(actions=[SimpleNamespace(
            type="drag",
            path=[SimpleNamespace(x=90, y=80), SimpleNamespace(x=20, y=10)],
        )])

        result = _spatial_result(call, "segment")

        self.assertEqual(result, LocalizationResult(mode="segment", start=(90, 80), end=(20, 10)))

    def test_normalizes_point_drag_to_its_midpoint(self) -> None:
        call = SimpleNamespace(actions=[SimpleNamespace(
            type="drag",
            path=[SimpleNamespace(x=20, y=10), SimpleNamespace(x=80, y=50)],
        )])

        result = _spatial_result(call, "point")

        self.assertEqual(result, LocalizationResult(mode="point", start=(50, 30)))


class RefinePayloadTests(unittest.IsolatedAsyncioTestCase):
    async def test_drawing_ignores_realtime_coordinates_and_uses_visual_locator(self) -> None:
        payload = {
            "shape": "line",
            "x": 20,
            "y": 30,
            "end_x": 220,
            "end_y": 130,
            "ground_to_screen": False,
            "label": "requested segment",
        }
        state = {
            "tars_viewport_capture": {
                "data": "abc",
                "mimeType": "image/png",
                "width": 400,
                "height": 220,
            },
        }

        locator = AsyncMock(return_value=[LocalizationResult(
            mode="segment",
            start=(100, 80),
            end=(300, 180),
        )])
        with patch("app.services.tars_visual_locator.locate_visual_targets_batch", new=locator):
            refined = await refine_tars_payload(payload, state, tool_name="draw_on_screen")

        locator.assert_awaited_once()
        self.assertEqual(refined["grounding"], "computer_use")
        self.assertEqual(refined["coordinate_source"], "sol")
        self.assertEqual(
            (refined["x"], refined["y"], refined["end_x"], refined["end_y"]),
            (100, 80, 300, 180),
        )
        self.assertNotIn("ground_to_screen", refined)

    async def test_dom_drawing_uses_live_target_without_sol_or_model_coordinates(self) -> None:
        payload = {
            "shape": "rectangle",
            "target_id": "dom-live-target",
            "x": 999,
            "y": 888,
            "end_x": 777,
            "end_y": 666,
            "label": "search box",
        }
        locator = AsyncMock()

        with patch(
            "app.services.tars_visual_locator.locate_visual_targets_batch",
            new=locator,
        ):
            refined = await refine_tars_payload(payload, {}, tool_name="draw_on_screen")

        locator.assert_not_awaited()
        self.assertEqual(refined["grounding"], "dom")
        self.assertEqual(refined["coordinate_source"], "dom")
        self.assertEqual(refined["target_id"], "dom-live-target")
        self.assertNotIn("x", refined)
        self.assertNotIn("end_x", refined)

    async def test_locate_visual_target_uses_computer_use_action(self) -> None:
        fake_response = SimpleNamespace(output=[
            SimpleNamespace(
                type="computer_call",
                action=SimpleNamespace(type="click", x=321, y=123),
            )
        ])
        fake_client = SimpleNamespace(
            responses=SimpleNamespace(create=AsyncMock(return_value=fake_response))
        )

        with patch("app.services.tars_visual_locator._openai_client", return_value=fake_client):
            result = await locate_visual_target(
                image_base64="abc",
                mime_type="image/png",
                width=640,
                height=360,
                description="submit button",
                mode="point",
                model="gpt-5.6-sol",
            )

        self.assertEqual(result, LocalizationResult(mode="point", start=(321, 123)))
        kwargs = fake_client.responses.create.await_args.kwargs
        self.assertEqual(kwargs["model"], "gpt-5.6-sol")
        self.assertEqual(kwargs["service_tier"], "priority")
        self.assertEqual(kwargs["tools"], [{"type": "computer"}])
        self.assertEqual(kwargs["tool_choice"], "required")

    async def test_batch_locator_uses_one_forced_function_call_for_all_coordinates(self) -> None:
        fake_response = SimpleNamespace(output=[SimpleNamespace(
            type="function_call",
            name="submit_screen_coordinates",
            arguments=(
                '{"coordinates":['
                '{"x":80,"y":100,"end_x":null,"end_y":null},'
                '{"x":270,"y":120,"end_x":350,"end_y":80}'
                ']}'
            ),
        )])
        create = AsyncMock(return_value=fake_response)
        fake_client = SimpleNamespace(responses=SimpleNamespace(create=create))

        with patch("app.services.tars_visual_locator._openai_client", return_value=fake_client):
            results = await locate_visual_targets_batch(
                image_base64="abc",
                mime_type="image/png",
                width=400,
                height=220,
                requests=[
                    {"description": "red box", "mode": "point", "shape": "text"},
                    {"description": "blue box", "mode": "segment", "shape": "line"},
                ],
            )

        self.assertEqual(create.await_count, 1)
        self.assertEqual(results[0], LocalizationResult(mode="point", start=(80, 100)))
        self.assertEqual(
            results[1],
            LocalizationResult(mode="segment", start=(270, 120), end=(350, 80)),
        )
        kwargs = create.await_args.kwargs
        self.assertEqual(kwargs["max_tool_calls"], 1)
        self.assertEqual(kwargs["reasoning"], {"effort": "low"})
        self.assertEqual(kwargs["tool_choice"], {
            "type": "function",
            "name": "submit_screen_coordinates",
        })
        tool = kwargs["tools"][0]
        self.assertEqual(tool["type"], "function")
        self.assertEqual(tool["name"], "submit_screen_coordinates")
        coordinates_schema = tool["parameters"]["properties"]["coordinates"]
        self.assertEqual(coordinates_schema["minItems"], 2)
        self.assertEqual(coordinates_schema["maxItems"], 2)

    async def test_batch_refinement_skips_sol_miss_without_realtime_coordinates(self) -> None:
        payloads = [
            {
                "shape": "line",
                "x": 20,
                "y": 30,
                "end_x": 220,
                "end_y": 130,
                "label": "deltoid",
                "ground_to_screen": True,
            },
            {
                "shape": "line",
                "x": 30,
                "y": 40,
                "end_x": 230,
                "end_y": 140,
                "label": "hamstrings",
                "ground_to_screen": True,
            },
        ]
        state = {
            "tars_viewport_capture": {
                "data": "abc",
                "mimeType": "image/png",
                "width": 400,
                "height": 220,
            },
            "last_input_transcript": "label the anatomy",
        }
        locator = AsyncMock(return_value=[
            LocalizationResult(mode="segment", start=(100, 100), end=(180, 80)),
            None,
        ])

        with patch(
            "app.services.tars_visual_locator.locate_visual_targets_batch",
            new=locator,
        ):
            refined = await refine_tars_payloads_batch(payloads, state)

        locator.assert_awaited_once()
        self.assertEqual(refined[0]["grounding"], "computer_use_batch")
        self.assertEqual((refined[0]["x"], refined[0]["end_x"]), (100, 180))
        self.assertEqual(refined[1]["grounding"], "failed")
        self.assertEqual(refined[1]["grounding_failure"], "batch_locator_missing")
        self.assertEqual(refined[1]["coordinate_source"], "sol_missing")
        self.assertNotIn("x", refined[1])
        self.assertNotIn("end_x", refined[1])

    async def test_mixed_batch_bypasses_sol_only_for_dom_items(self) -> None:
        payloads = [
            {
                "shape": "rectangle",
                "target_id": "dom-card",
                "x": 900,
                "y": 900,
                "label": "card",
            },
            {
                "shape": "circle",
                "x": 800,
                "y": 800,
                "end_x": 900,
                "end_y": 900,
                "label": "image detail",
            },
        ]
        state = {
            "tars_viewport_capture": {
                "data": "abc",
                "mimeType": "image/png",
                "width": 400,
                "height": 220,
            },
        }
        locator = AsyncMock(return_value=[LocalizationResult(
            mode="bounds",
            start=(50, 60),
            end=(100, 120),
        )])

        with patch(
            "app.services.tars_visual_locator.locate_visual_targets_batch",
            new=locator,
        ):
            refined = await refine_tars_payloads_batch(payloads, state)

        locator.assert_awaited_once()
        self.assertEqual(len(locator.await_args.kwargs["requests"]), 1)
        self.assertEqual(refined[0]["grounding"], "dom")
        self.assertEqual(refined[0]["target_id"], "dom-card")
        self.assertNotIn("x", refined[0])
        self.assertEqual(refined[1]["grounding"], "computer_use_batch")
        self.assertEqual((refined[1]["x"], refined[1]["end_x"]), (50, 100))

    async def test_handles_ga_computer_screenshot_first_response(self) -> None:
        screenshot_response = SimpleNamespace(
            id="resp-first",
            output=[SimpleNamespace(
                type="computer_call",
                call_id="call-screen",
                actions=[SimpleNamespace(type="screenshot")],
                action=None,
            )],
        )
        click_response = SimpleNamespace(output=[SimpleNamespace(
            type="computer_call",
            call_id="call-click",
            actions=[SimpleNamespace(type="click", x=444, y=222)],
            action=None,
        )])
        create = AsyncMock(side_effect=[screenshot_response, click_response])
        fake_client = SimpleNamespace(responses=SimpleNamespace(create=create))

        with patch("app.services.tars_visual_locator._openai_client", return_value=fake_client):
            result = await locate_visual_target(
                image_base64="exact-png",
                mime_type="image/png",
                width=1280,
                height=720,
                description="right-angled triangle",
                mode="point",
                model="gpt-5.6-sol",
            )

        self.assertEqual(result, LocalizationResult(mode="point", start=(444, 222)))
        self.assertEqual(create.await_count, 2)
        follow_up = create.await_args_list[1].kwargs
        self.assertEqual(follow_up["previous_response_id"], "resp-first")
        self.assertEqual(follow_up["service_tier"], "priority")
        self.assertEqual(follow_up["tools"], [{"type": "computer"}])
        output = follow_up["input"][0]
        self.assertEqual(output["type"], "computer_call_output")
        self.assertEqual(output["call_id"], "call-screen")
        self.assertEqual(output["output"]["type"], "computer_screenshot")
        self.assertEqual(output["output"]["detail"], "original")
        self.assertIn("exact-png", output["output"]["image_url"])

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
            "tars_media_crop": {
                "rawData": "abc",
                "rawMimeType": "image/png",
                "width": 800,
                "height": 400,
            },
            "last_input_transcript": "box the target",
        }

        with patch(
            "app.services.tars_visual_locator.locate_visual_targets_batch",
            new=AsyncMock(return_value=[LocalizationResult(
                mode="bounds",
                start=(80, 40),
                end=(400, 200),
            )]),
        ):
            refined = await refine_tars_payload(payload, state, tool_name="draw_on_screen")

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
            "tars_media_crop": {
                "rawData": "abc",
                "rawMimeType": "image/png",
                "width": 800,
                "height": 400,
            },
        }

        with patch(
            "app.services.tars_visual_locator.locate_visual_targets_batch",
            new=AsyncMock(return_value=[LocalizationResult(
                mode="segment",
                start=(80, 360),
                end=(400, 360),
            )]),
        ):
            refined = await refine_tars_payload(payload, state, tool_name="draw_on_screen")

        self.assertEqual(refined["x"], 100)
        self.assertEqual(refined["y"], 900)
        self.assertEqual(refined["end_x"], 500)
        self.assertEqual(refined["end_y"], 900)
        self.assertEqual(refined["grounding_mode"], "segment")

    async def test_text_localization_uses_anchor_description_not_display_text(self) -> None:
        payload = {
            "coordinate_space": "viewport",
            "shape": "text",
            "x": 100,
            "y": 200,
            "label": "Remember this",
            "anchor_label": "empty space below the chart",
        }
        state = {
            "tars_viewport_capture": {
                "data": "full-png-data",
                "mimeType": "image/png",
                "width": 1920,
                "height": 1080,
            },
            "last_input_transcript": "write remember this below the chart",
        }
        locator = AsyncMock(return_value=[LocalizationResult(
            mode="point",
            start=(800, 600),
        )])

        with patch(
            "app.services.tars_visual_locator.locate_visual_targets_batch",
            new=locator,
        ):
            refined = await refine_tars_payload(payload, state, tool_name="draw_on_screen")

        self.assertEqual(refined["label"], "Remember this")
        self.assertEqual((refined["x"], refined["y"]), (800, 600))
        description = locator.await_args.kwargs["requests"][0]["description"]
        self.assertIn("empty space below the chart", description)
        self.assertNotIn("remember this", description.lower())

    async def test_failed_drawing_grounding_does_not_authorize_rough_geometry(self) -> None:
        payload = {
            "coordinate_space": "viewport",
            "shape": "line",
            "x": 10,
            "y": 20,
            "end_x": 300,
            "end_y": 400,
            "label": "triangle edge",
        }
        state = {
            "tars_viewport_capture": {
                "data": "full-png-data",
                "mimeType": "image/png",
                "width": 1920,
                "height": 1080,
            },
        }

        with patch(
            "app.services.tars_visual_locator.locate_visual_targets_batch",
            new=AsyncMock(return_value=[None]),
        ):
            refined = await refine_tars_payload(payload, state, tool_name="draw_on_screen")

        self.assertEqual(refined["grounding"], "failed")
        self.assertEqual(refined["grounding_failure"], "batch_locator_missing")
        self.assertNotIn("x", refined)

    async def test_mismatched_drawing_mode_does_not_authorize_rough_geometry(self) -> None:
        payload = {
            "coordinate_space": "viewport",
            "shape": "rectangle",
            "x": 10,
            "y": 20,
            "end_x": 300,
            "end_y": 400,
            "label": "diagram node",
        }
        state = {
            "tars_viewport_capture": {
                "data": "full-png-data",
                "mimeType": "image/png",
                "width": 1920,
                "height": 1080,
            },
        }

        with patch(
            "app.services.tars_visual_locator.locate_visual_targets_batch",
            new=AsyncMock(return_value=[LocalizationResult(
                mode="point",
                start=(500, 300),
            )]),
        ):
            refined = await refine_tars_payload(payload, state, tool_name="draw_on_screen")

        self.assertEqual(refined["grounding"], "failed")
        self.assertEqual(refined["grounding_failure"], "batch_locator_mode_mismatch")
        self.assertNotIn("x", refined)

    async def test_refines_non_dom_viewport_point(self) -> None:
        payload = {
            "coordinate_space": "viewport",
            "x": 10,
            "y": 20,
            "label": "play icon",
        }
        state = {
            "tars_viewport_capture": {
                "data": "abc",
                "mimeType": "image/jpeg",
                "width": 1440,
                "height": 900,
            },
        }

        with patch(
            "app.services.tars_visual_locator.locate_visual_target",
            new=AsyncMock(return_value=LocalizationResult(
                mode="point",
                start=(720, 450),
            )),
        ):
            refined = await refine_tars_payload(payload, state, tool_name="point_at")

        self.assertEqual(refined["x"], 720)
        self.assertEqual(refined["y"], 450)
        self.assertEqual(refined["grounding"], "computer_use")

    async def test_static_image_media_hint_uses_complete_lossless_viewport(self) -> None:
        payload = {
            "coordinate_space": "media",
            "x": 100,
            "y": 200,
            "label": "red bird's eye",
        }
        state = {
            "tars_media_crop": None,
            "tars_viewport_capture": {
                "data": "full-png-data",
                "mimeType": "image/png",
                "width": 2560,
                "height": 1440,
            },
            "last_input_transcript": "point to the red bird's eye in the image",
        }

        locator = AsyncMock(return_value=LocalizationResult(
            mode="point",
            start=(2048, 288),
        ))
        with patch(
            "app.services.tars_visual_locator.locate_visual_target",
            new=locator,
        ):
            refined = await refine_tars_payload(payload, state, tool_name="point_at")

        self.assertEqual(refined["coordinate_space"], "viewport")
        self.assertEqual((refined["x"], refined["y"]), (2048, 288))
        kwargs = locator.await_args.kwargs
        self.assertEqual(kwargs["image_base64"], "full-png-data")
        self.assertEqual(kwargs["mime_type"], "image/png")
        self.assertEqual((kwargs["width"], kwargs["height"]), (2560, 1440))
        self.assertIn("point to the red bird's eye", kwargs["description"])

    async def test_locator_failure_uses_realtime_fallback_point(self) -> None:
        payload = {
            "coordinate_space": "viewport",
            "x": 100,
            "y": 200,
            "label": "small image detail",
        }
        state = {
            "tars_viewport_capture": {
                "data": "full-png-data",
                "mimeType": "image/png",
                "width": 1920,
                "height": 1080,
            },
        }

        with patch(
            "app.services.tars_visual_locator.locate_visual_target",
            new=AsyncMock(return_value=None),
        ):
            refined = await refine_tars_payload(payload, state, tool_name="point_at")

        self.assertEqual((refined["x"], refined["y"]), (100.0, 200.0))
        self.assertEqual(refined["grounding"], "realtime_fallback")
        self.assertEqual(refined["grounding_failure"], "locator_no_result")

    async def test_missing_capture_uses_realtime_fallback_point(self) -> None:
        refined = await refine_tars_payload(
            {"x": 12, "y": 34, "label": "image detail"},
            {},
            tool_name="point_at",
        )

        self.assertEqual((refined["x"], refined["y"]), (12.0, 34.0))
        self.assertEqual(refined["grounding"], "realtime_fallback")
        self.assertEqual(refined["grounding_failure"], "capture_unavailable")

    async def test_missing_capture_without_rough_point_still_fails_closed(self) -> None:
        refined = await refine_tars_payload(
            {"x": None, "y": None, "label": "image detail"},
            {},
            tool_name="point_at",
        )

        self.assertIsNone(refined["x"])
        self.assertIsNone(refined["y"])
        self.assertEqual(refined["grounding"], "failed")

    async def test_skips_exact_dom_targets(self) -> None:
        payload = {"target_id": "dom-1", "label": "button"}
        refined = await refine_tars_payload(payload, {}, tool_name="point_at")
        self.assertIs(refined, payload)


class PointToolSynchronizationTests(unittest.IsolatedAsyncioTestCase):
    async def test_non_dom_point_waits_for_sol_and_notifies_browser_before_returning(self) -> None:
        state = {
            "visual_generation": 4,
            "accepting_visual_tools": True,
            "tars_viewport_capture": {
                "data": "png",
                "mimeType": "image/png",
                "width": 1920,
                "height": 1080,
            },
        }
        notifications: list[dict] = []
        state_token = tars_visual_state.set(state)
        notify_token = ws_notify.set(lambda event: notifications.append(event))
        try:
            with patch(
                "app.services.tars_visual_locator.refine_tars_payload",
                new=AsyncMock(return_value={
                    "x": 640.0,
                    "y": 320.0,
                    "label": "deltoid",
                    "coordinate_space": "viewport",
                    "action": "none",
                    "grounding": "computer_use",
                }),
            ) as locator:
                result = await _resolve_point_at(
                    x=300,
                    y=200,
                    label="deltoid",
                )
        finally:
            ws_notify.reset(notify_token)
            tars_visual_state.reset(state_token)

        locator.assert_awaited_once()
        self.assertEqual(result["status"], "point_ready")
        self.assertEqual(result["browser_delivery"], "complete")
        self.assertEqual(
            [event["type"] for event in notifications],
            ["tars_point_pending", "tars_point", "tars_point_pending"],
        )
        self.assertEqual(notifications[0]["status"], "started")
        self.assertEqual(notifications[1]["response"]["x"], 640.0)
        self.assertEqual(notifications[2]["status"], "completed")


if __name__ == "__main__":
    unittest.main()
