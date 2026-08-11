from __future__ import annotations

import base64
import json
from io import BytesIO
import inspect
import re
import unittest
from unittest.mock import AsyncMock, patch

from PIL import Image

from app.agents.tutor_agent import build_tutor_agent
from app.agents.tars_agent import (
    ScreenDrawingItem,
    _normalize_screen_annotation_batch,
    _normalize_screen_drawing_item,
    build_tars_agent,
    draw_on_screen,
)
from app.config import settings
from app.main import (
    _audio_interruption_requires_visual_abort,
    _handle_raw_event,
    _prepare_realtime_input_audio,
    _reasoning_effort_for_mode,
    _send_json,
    _transcription_model_for_mode,
    _turn_detection_for_mode,
    _turn_requires_learner_response,
    websocket_endpoint,
)
from app.services.tars_visual_locator import (
    LocalizationResult,
    crop_image_region,
    refine_classroom_point,
)
from app.tools import canvas_tools


class ClassroomAgentTests(unittest.TestCase):
    def test_classroom_audio_bypasses_backend_resampling(self) -> None:
        pcm = b"\x01\x00\x02\x00"
        with patch("app.main._resample_pcm16") as resample:
            self.assertIs(
                _prepare_realtime_input_audio(pcm, classroom_mode=True),
                pcm,
            )
        resample.assert_not_called()

    def test_page_tars_uses_explicit_ptt_while_teaching_uses_vad(self) -> None:
        self.assertIsNone(_turn_detection_for_mode(push_to_talk=True))
        self.assertEqual(
            _turn_detection_for_mode(push_to_talk=False),
            {"type": "semantic_vad", "interrupt_response": True},
        )
        self.assertEqual(
            _turn_detection_for_mode(push_to_talk=False, classroom_mode=True),
            {
                "type": "semantic_vad",
                "interrupt_response": True,
                "eagerness": "high",
                "create_response": True,
            },
        )

    def test_classroom_uses_low_latency_reasoning(self) -> None:
        self.assertEqual(
            _reasoning_effort_for_mode(classroom_mode=True),
            "low",
        )

    def test_classroom_uses_higher_accuracy_input_transcription(self) -> None:
        self.assertEqual(
            _transcription_model_for_mode(classroom_mode=True),
            settings.classroom_transcription_model,
        )
        self.assertEqual(
            _transcription_model_for_mode(classroom_mode=False),
            settings.transcription_model,
        )

    def test_push_to_talk_interruption_does_not_abort_visuals_twice(self) -> None:
        self.assertFalse(_audio_interruption_requires_visual_abort("tars"))
        self.assertTrue(_audio_interruption_requires_visual_abort("tutor"))
        self.assertTrue(_audio_interruption_requires_visual_abort("roleplay"))

    def test_page_and_teacher_modes_share_tars_identity_but_not_tools(self) -> None:
        page_agent = build_tars_agent()
        teacher_agent = build_tutor_agent(
            include_image_generation=False,
            include_handoffs=False,
            include_progress_tools=False,
            excluded_canvas_tools={"add_image_to_canvas"},
        )
        page_tools = {getattr(tool, "name", "") for tool in page_agent.tools}
        teacher_tools = {getattr(tool, "name", "") for tool in teacher_agent.tools}
        self.assertEqual(page_agent.name, "tars")
        self.assertEqual(teacher_agent.name, "tars")
        self.assertIn("interact_with_page", page_tools)
        self.assertIn("draw_screen_diagram", page_tools)
        self.assertIn("draw_screen_annotations", page_tools)
        self.assertNotIn("interact_with_page", teacher_tools)
        self.assertIn("draw_screen_diagram", teacher_tools)
        self.assertIn("draw_screen_annotations", teacher_tools)
        self.assertIn("draw_on_canvas", teacher_tools)
        self.assertNotIn("draw_on_canvas", page_tools)

    def test_realtime_drawing_schema_cannot_supply_coordinates(self) -> None:
        parameters = draw_on_screen.params_json_schema["properties"]
        self.assertFalse({"x", "y", "end_x", "end_y", "ground_to_screen"} & parameters.keys())
        self.assertFalse(
            {"x", "y", "end_x", "end_y", "ground_to_screen"}
            & ScreenDrawingItem.model_fields.keys()
        )

    def test_screen_diagram_items_discard_model_geometry(self) -> None:
        item = _normalize_screen_drawing_item({
            "shape": "triangle",
            "x": 10,
            "y": 20,
            "end_x": 210,
            "end_y": 180,
            "ground_to_screen": False,
            "color": "purple",
            "style": "dashed",
        })

        self.assertEqual(item["shape"], "triangle")
        self.assertNotIn("ground_to_screen", item)
        self.assertNotIn("x", item)
        self.assertNotIn("end_x", item)
        self.assertEqual((item["color"], item["style"]), ("purple", "dashed"))

    def test_annotation_batch_uses_leader_labels_without_duplicate_text_grounding(self) -> None:
        result = _normalize_screen_annotation_batch([
            ScreenDrawingItem(
                shape="line",
                x=100,
                y=100,
                end_x=240,
                end_y=80,
                label="Deltoid",
            ),
            ScreenDrawingItem(
                shape="text",
                x=248,
                y=72,
                label="deltoid",
                anchor_label="label text",
            ),
        ])

        self.assertEqual(len(result["annotations"]), 1)
        self.assertEqual(result["annotations"][0]["shape"], "line")
        self.assertEqual(result["annotations"][0]["label"], "Deltoid")
        self.assertNotIn("ground_to_screen", result["annotations"][0])
        self.assertNotIn("x", result["annotations"][0])

    def test_classroom_can_draw_and_point_but_cannot_generate_images_or_handoff(self) -> None:
        def wait_for_learner():
            return {"status": "waiting"}

        agent = build_tutor_agent(
            custom_instruction="Teach one concept and wait for the learner.",
            extra_tool_functions=[wait_for_learner],
            include_image_generation=False,
            include_handoffs=False,
            include_progress_tools=False,
            excluded_canvas_tools={"add_image_to_canvas", "draw_on_canvas"},
        )
        tool_names = {getattr(tool, "name", "") for tool in agent.tools}
        self.assertNotIn("draw_on_canvas", tool_names)
        self.assertIn("draw_diagram", tool_names)
        self.assertIn("point_at_whiteboard", tool_names)
        self.assertIn("draw_on_screen", tool_names)
        self.assertIn("wait_for_learner", tool_names)
        self.assertNotIn("generate_and_show_image", tool_names)
        self.assertNotIn("add_image_to_canvas", tool_names)
        self.assertNotIn("get_progress", tool_names)
        self.assertEqual(agent.handoffs, [])

    def test_definition_text_wraps_inside_actual_classroom_viewport(self) -> None:
        canvas_tools.update_board_viewport_width(538)
        result = canvas_tools.write_text_on_canvas(
            "Cloud computing — rent IT resources online instead of owning hardware",
            x=66,
            y=40,
            font_size=24,
        )
        bridge = canvas_tools.canvas_bridge.pop(result["deferred_canvas_id"])
        elements = bridge["elements"]
        self.assertGreaterEqual(len(elements), 3)
        self.assertTrue(all(float(item["x"]) + float(item["width"]) <= 502 for item in elements))
        self.assertTrue(all(item["autoResize"] is True for item in elements))
        self.assertTrue(all(item["viewportWrap"] is True for item in elements))
        canvas_tools.update_board_viewport_width(896)

    def test_diagram_tool_emits_coordinate_free_semantic_graph(self) -> None:
        result = canvas_tools.draw_diagram(
            "flowchart",
            title="Request lifecycle",
            nodes=[
                {"id": "request", "label": "Receive request"},
                {"id": "validate", "label": "Validate the request", "shape": "diamond"},
                {"id": "respond", "label": "Return response"},
            ],
            edges=[
                {"from": "request", "to": "validate"},
                {"from": "validate", "to": "respond", "label": "valid"},
            ],
        )
        bridge = canvas_tools.canvas_bridge.pop(result["deferred_canvas_id"])
        self.assertEqual(bridge["tool"], "draw_diagram")
        self.assertEqual(len(bridge["elements"]), 1)
        descriptor = bridge["elements"][0]
        self.assertEqual(descriptor["type"], "structured-diagram")
        self.assertEqual(descriptor["direction"], "TB")
        self.assertEqual(len(descriptor["nodes"]), 3)
        self.assertEqual(len(descriptor["edges"]), 2)
        self.assertNotIn("x", descriptor["nodes"][0])
        self.assertNotIn("y", descriptor["nodes"][0])

    def test_mindmap_items_become_edges_from_a_central_node(self) -> None:
        result = canvas_tools.draw_diagram(
            "mindmap",
            title="Cloud services",
            items=["Compute", "Storage", "Networking"],
        )
        bridge = canvas_tools.canvas_bridge.pop(result["deferred_canvas_id"])
        descriptor = bridge["elements"][0]
        root = descriptor["nodes"][0]
        self.assertEqual(root["label"], "Cloud services")
        self.assertEqual(root["shape"], "ellipse")
        self.assertEqual(len(descriptor["edges"]), 3)
        self.assertTrue(all(edge["from"] == root["id"] for edge in descriptor["edges"]))

    def test_only_questions_pause_connected_teaching(self) -> None:
        self.assertFalse(_turn_requires_learner_response(
            "AWS provides compute, storage, and networking as connected cloud services."
        ))
        self.assertTrue(_turn_requires_learner_response("Does that make sense so far?"))
        self.assertTrue(_turn_requires_learner_response("", explicit_wait=True))
        self.assertFalse(_turn_requires_learner_response(
            "Now connect compute, storage, and networking into one system.",
            explicit_wait=True,
        ))


class ClassroomPointGroundingTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def _screenshot() -> str:
        image = Image.new("RGB", (100, 80), "white")
        output = BytesIO()
        image.save(output, format="JPEG")
        return base64.b64encode(output.getvalue()).decode("ascii")

    def test_course_image_crop_uses_excalidraw_pixel_bounds(self) -> None:
        cropped = crop_image_region(
            self._screenshot(),
            {"x": 10, "y": 20, "width": 30, "height": 25},
        )
        self.assertIsNotNone(cropped)
        assert cropped is not None
        _, width, height, left, top = cropped
        self.assertEqual((width, height, left, top), (30, 25, 10, 20))

    async def test_gpt_point_inside_crop_maps_back_to_viewport(self) -> None:
        payload = {
            "tarsPoint": {
                "x": 90,
                "y": 4,
                "label": "Docker image blueprint box",
                "targetArea": "course_image",
            }
        }
        state = {
            "classroom_canvas_capture": {
                "data": self._screenshot(),
                "mimeType": "image/jpeg",
                "width": 100,
                "height": 80,
                "generatedImageBounds": {"x": 10, "y": 20, "width": 30, "height": 25},
            }
        }
        locator = AsyncMock(return_value=LocalizationResult(mode="point", start=(5, 7)))
        with patch("app.services.tars_visual_locator.locate_visual_target", locator):
            result = await refine_classroom_point(payload, state, model="gpt-5.5")

        self.assertEqual((result["x"], result["y"]), (15, 27))
        self.assertEqual(result["groundingModel"], "gpt-5.5")
        self.assertEqual(result["groundingRegion"], "course_image")
        self.assertEqual(locator.await_args.kwargs["width"], 30)
        self.assertEqual(locator.await_args.kwargs["height"], 25)


class WebSocketSendTests(unittest.IsolatedAsyncioTestCase):
    async def test_raw_learner_transcript_delta_is_forwarded(self) -> None:
        websocket = AsyncMock()
        websocket.send_text = AsyncMock(return_value=None)

        await _handle_raw_event(
            {
                "type": "conversation.item.input_audio_transcription.delta",
                "item_id": "learner-turn-1",
                "delta": "branches",
            },
            websocket,
            {},
            set(),
        )

        payload = json.loads(websocket.send_text.await_args.args[0])
        self.assertEqual(
            payload["inputTranscription"],
            {
                "text": "branches",
                "finished": False,
                "itemId": "learner-turn-1",
            },
        )

    async def test_send_json_reports_delivery_result(self) -> None:
        websocket = type("WebSocketStub", (), {})()
        websocket.send_text = AsyncMock(return_value=None)

        self.assertTrue(await _send_json(websocket, {"type": "tars_draw"}))

        websocket.send_text = AsyncMock(side_effect=RuntimeError("closed"))
        self.assertFalse(await _send_json(websocket, {"type": "visual_sync_end"}))


class VisualTurnLifecycleTests(unittest.TestCase):
    def test_push_to_talk_commit_reopens_visual_tools_before_response(self) -> None:
        """A new Ctrl turn must accept points after the prior turn closed them."""

        source = inspect.getsource(websocket_endpoint)
        branch = re.search(
            r'elif msg_type == "tars_commit_audio":(?P<body>.*?)(?=\n\s+elif msg_type ==)',
            source,
            re.DOTALL,
        )

        self.assertIsNotNone(branch)
        assert branch is not None
        body = branch.group("body")
        self.assertIn("_accept_visual_tools_for_turn()", body)
        self.assertLess(
            body.index("_accept_visual_tools_for_turn()"),
            body.index('"type": "response.create"'),
        )

    def test_turn_end_defers_completion_for_late_tool_events(self) -> None:
        """The SDK can emit tool events after turn_ended for the same turn."""

        source = inspect.getsource(websocket_endpoint)
        branch = re.search(
            r'elif etype == "agent_end":(?P<body>.*?)(?=\n\s+# ── Handoff)',
            source,
            re.DOTALL,
        )

        self.assertIsNotNone(branch)
        assert branch is not None
        body = branch.group("body")
        self.assertIn("_schedule_turn_completion", body)
        self.assertNotIn('"turnComplete": True', body)
        self.assertNotIn('state["accepting_visual_tools"] = False', body)

    def test_page_tars_agent_start_cannot_reopen_interrupted_visuals(self) -> None:
        source = inspect.getsource(websocket_endpoint)
        branch = re.search(
            r'elif etype == "agent_start":(?P<body>.*?)(?=\n\s+elif etype == "agent_end")',
            source,
            re.DOTALL,
        )

        self.assertIsNotNone(branch)
        assert branch is not None
        self.assertIn('if agent_kind != "tars"', branch.group("body"))

    def test_grounded_diagrams_wait_for_concurrent_localization(self) -> None:
        source = inspect.getsource(websocket_endpoint)
        self.assertIn('"draw_screen_diagram", "draw_screen_annotations"', source)
        self.assertIn('"type": "tars_draw_batch"', source)
        self.assertNotIn('provisional=True', source)
        self.assertNotIn('Tars immediate drawing delivered', source)
        self.assertIn('_deliver_tars_drawing_batch', source)
        self.assertIn('refine_tars_payloads_batch', source)
        self.assertIn('visual_grounding_semaphore = asyncio.Semaphore(4)', source)

    def test_completion_tracks_raw_tool_calls_before_sdk_workers_start(self) -> None:
        source = inspect.getsource(websocket_endpoint)
        self.assertIn('if dtype == "function_call"', source)
        self.assertIn('_register_realtime_tool_call(', source)
        self.assertIn('or pending_realtime_tool_calls', source)
        self.assertIn('_finish_realtime_tool_call(tool_name, args_json)', source)

    def test_failed_grounding_sends_a_safe_matching_removal(self) -> None:
        source = inspect.getsource(websocket_endpoint)
        self.assertIn('"remove": True', source)
        self.assertIn('_screen_drawing_removal(', source)
        self.assertIn('"coordinate_source": "sol_missing"', source)


if __name__ == "__main__":
    unittest.main()
