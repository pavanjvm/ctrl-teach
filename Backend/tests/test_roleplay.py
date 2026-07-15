from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.agents.roleplay_agent import normalize_roleplay_voice
from app.config import settings
from app.routers import roleplay as roleplay_router


class _FakeResponse:
    def __init__(self, payload: dict, *, is_error: bool = False) -> None:
        self._payload = payload
        self.is_error = is_error
        self.status_code = 502 if is_error else 200

    def json(self) -> dict:
        return self._payload


class _FakeAsyncClient:
    faces_payload: dict = {"data": []}
    conversation_payload: dict = {}
    last_faces_params: dict | None = None
    last_conversation_body: dict | None = None
    last_ended_url: str | None = None

    def __init__(self, *args, **kwargs) -> None:
        del args, kwargs

    async def __aenter__(self) -> _FakeAsyncClient:
        return self

    async def __aexit__(self, *args) -> None:
        del args

    async def get(self, url: str, **kwargs) -> _FakeResponse:
        if "/conversations/" in url:
            return _FakeResponse(self.conversation_payload)
        self.__class__.last_faces_params = kwargs.get("params")
        return _FakeResponse(self.faces_payload)

    async def post(self, url: str, **kwargs) -> _FakeResponse:
        if url.endswith("/conversations"):
            self.__class__.last_conversation_body = kwargs.get("json")
            return _FakeResponse({
                "conversation_id": "conversation-1",
                "conversation_url": "https://example.daily.co/room",
                "meeting_token": "meeting-token",
            })
        if url.endswith("/end"):
            self.__class__.last_ended_url = url
            return _FakeResponse({})
        raise AssertionError(f"Unexpected POST {url}")


class RoleplayRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        app = FastAPI()
        app.include_router(roleplay_router.router)
        app.dependency_overrides[get_current_user] = lambda: {"uid": "7", "username": "learner"}
        self.client = TestClient(app)
        _FakeAsyncClient.conversation_payload = {}
        _FakeAsyncClient.last_faces_params = None
        _FakeAsyncClient.last_conversation_body = None
        _FakeAsyncClient.last_ended_url = None
        roleplay_router._active_conversations.clear()

    def test_lists_only_ready_faces_and_marks_backend_default(self) -> None:
        _FakeAsyncClient.faces_payload = {
            "data": [
                {
                    "face_id": "face-charlie",
                    "face_name": "Charlie",
                    "status": "completed",
                    "thumbnail_video_url": "https://cdn.example/charlie.mp4",
                    "model_name": "phoenix-3",
                },
                {"face_id": "face-training", "face_name": "Training", "status": "training"},
                {"face_id": "face-anna", "face_name": "Anna", "status": "completed"},
            ]
        }
        with (
            patch.object(settings, "tavus_api_key", "test-key"),
            patch.object(settings, "tavus_face_id", "face-charlie"),
            patch.object(roleplay_router.httpx, "AsyncClient", _FakeAsyncClient),
        ):
            response = self.client.get("/api/roleplay/faces")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([face["face_id"] for face in response.json()["faces"]], ["face-charlie", "face-anna"])
        self.assertTrue(response.json()["faces"][0]["is_default"])
        self.assertEqual(
            _FakeAsyncClient.last_faces_params,
            {"limit": 100, "page": 1, "verbose": True},
        )

    def test_selected_face_is_used_when_starting_session(self) -> None:
        with (
            patch.object(settings, "tavus_api_key", "test-key"),
            patch.object(settings, "tavus_face_id", "backend-default"),
            patch.object(roleplay_router.httpx, "AsyncClient", _FakeAsyncClient),
            patch.object(roleplay_router, "_echo_pal_id", AsyncMock(return_value="pal-1")),
        ):
            response = self.client.post(
                "/api/roleplay/sessions",
                json={"conversation_name": "Interview", "face_id": "face-charlie"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(_FakeAsyncClient.last_conversation_body["face_id"], "face-charlie")
        self.assertEqual(_FakeAsyncClient.last_conversation_body["pal_id"], "pal-1")
        self.assertEqual(_FakeAsyncClient.last_conversation_body["max_participants"], 2)
        self.assertEqual(
            _FakeAsyncClient.last_conversation_body["properties"],
            {
                "max_call_duration": 600,
                "participant_left_timeout": 5,
                "participant_absent_timeout": 30,
            },
        )

    def test_bounds_conversation_safety_timeouts(self) -> None:
        with (
            patch.object(settings, "tavus_max_call_duration_seconds", 50_000),
            patch.object(settings, "tavus_participant_left_timeout_seconds", 0),
            patch.object(settings, "tavus_participant_absent_timeout_seconds", 2),
        ):
            self.assertEqual(
                roleplay_router._conversation_safety_properties(),
                {
                    "max_call_duration": 3600,
                    "participant_left_timeout": 1,
                    "participant_absent_timeout": 10,
                },
            )

    def test_normalizes_supported_openai_roleplay_voice(self) -> None:
        self.assertEqual(normalize_roleplay_voice(" Coral "), "coral")
        self.assertEqual(normalize_roleplay_voice("MARIN"), "marin")

    def test_rejects_unknown_openai_roleplay_voice(self) -> None:
        self.assertIsNone(normalize_roleplay_voice("nova"))
        self.assertIsNone(normalize_roleplay_voice(""))

    def test_reads_current_and_legacy_actor_join_events(self) -> None:
        roleplay_router._active_conversations["conversation-1"] = "7"
        _FakeAsyncClient.conversation_payload = {
            "status": "active",
            "events": [
                {"event_type": "system.replica_joined"},
                {"event_type": "system.pal_joined"},
            ],
        }

        with (
            patch.object(settings, "tavus_api_key", "test-key"),
            patch.object(roleplay_router.httpx, "AsyncClient", _FakeAsyncClient),
        ):
            response = self.client.get("/api/roleplay/sessions/conversation-1")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"status": "active", "actor_ready": True, "shutdown_reason": ""},
        )

    def test_records_safe_client_join_diagnostics(self) -> None:
        roleplay_router._active_conversations["conversation-1"] = "7"

        with self.assertLogs(roleplay_router.logger, level="INFO") as captured:
            response = self.client.post(
                "/api/roleplay/sessions/conversation-1/events",
                json={
                    "stage": "daily_room_joined",
                    "detail": "local participant joined\nwithout actor",
                    "participant_count": 1,
                },
            )

        self.assertEqual(response.status_code, 204)
        self.assertIn("stage=daily_room_joined", captured.output[0])
        self.assertIn("detail=local participant joined without actor", captured.output[0])

    def test_rejects_diagnostics_for_unowned_conversation(self) -> None:
        response = self.client.post(
            "/api/roleplay/sessions/not-owned/events",
            json={"stage": "daily_join_started"},
        )

        self.assertEqual(response.status_code, 404)

    def test_unload_beacon_ends_owned_conversation(self) -> None:
        roleplay_router._active_conversations["conversation-1"] = "7"

        with (
            patch.object(
                roleplay_router,
                "verify_app_session_token",
                return_value={"uid": "7", "username": "learner"},
            ),
            patch.object(roleplay_router.httpx, "AsyncClient", _FakeAsyncClient),
        ):
            response = self.client.post(
                "/api/roleplay/sessions/conversation-1/end-beacon",
                data={"token": "signed-session-token"},
            )

        self.assertEqual(response.status_code, 204)
        self.assertEqual(
            _FakeAsyncClient.last_ended_url,
            "https://tavusapi.com/v2/conversations/conversation-1/end",
        )
        self.assertNotIn("conversation-1", roleplay_router._active_conversations)


if __name__ == "__main__":
    unittest.main()
