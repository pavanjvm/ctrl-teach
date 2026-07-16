from __future__ import annotations

import asyncio
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.agents.tars_agent import build_tars_agent
from app.agents.tutor_agent import build_tutor_agent
from app.db import Base, Profile, User
from app.main import app
from app.routers import teaching_profiles as teaching_profiles_router
from app.services import teaching_profiles


class TeachingProfileTests(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        self.sessions = sessionmaker(bind=engine, expire_on_commit=False)
        with self.sessions() as db:
            db.add(User(id=7, username="learner", password_hash="x", name="Pavan"))
            db.add(Profile(
                user_id=7,
                preferences={"ctrlteach": {"onboarded": True, "pace": "steady"}},
            ))
            db.commit()

    def _patch_sessions(self):
        return (
            patch.object(teaching_profiles, "SessionLocal", self.sessions),
            patch.object(teaching_profiles_router, "SessionLocal", self.sessions),
        )

    def test_catalog_is_curated_and_excludes_private_prompt_text(self) -> None:
        first, second = self._patch_sessions()
        with first, second:
            catalog = asyncio.run(teaching_profiles_router.get_catalog({"uid": "7"}))

        self.assertEqual(len(catalog["profiles"]), 9)
        self.assertIsNone(catalog["selectedProfileId"])
        self.assertEqual(catalog["foundation"]["principles"][0], "Simple")
        self.assertNotIn("instruction", catalog["profiles"][0])
        self.assertEqual(
            {profile["id"] for profile in catalog["profiles"]},
            {"socrates", "montessori", "feynman", "burger", "escalante", "sullivan", "tagore", "freire", "elliott"},
        )

    def test_only_curated_profile_api_is_exposed(self) -> None:
        paths = {route.path for route in app.routes}
        self.assertIn("/api/teaching-profiles", paths)
        self.assertIn("/api/teaching-profiles/selection", paths)
        self.assertFalse(any(path.startswith("/api/tutors") for path in paths))

    def test_selection_persists_without_erasing_other_preferences(self) -> None:
        first, second = self._patch_sessions()
        with first, second:
            result = asyncio.run(teaching_profiles_router.update_selection(
                teaching_profiles_router.TeachingProfileSelection(profileId="feynman"),
                {"uid": "7"},
            ))
            selected = teaching_profiles.selected_teaching_profile(7)

        self.assertEqual(result["selectedProfileId"], "feynman")
        self.assertIsNotNone(selected)
        self.assertEqual(selected.id, "feynman")
        with self.sessions() as db:
            preferences = db.get(Profile, 7).preferences
        self.assertTrue(preferences["ctrlteach"]["onboarded"])
        self.assertEqual(preferences["ctrlteach"]["pace"], "steady")

    def test_selection_can_be_restored_to_original_tars(self) -> None:
        first, second = self._patch_sessions()
        with first, second:
            asyncio.run(teaching_profiles_router.update_selection(
                teaching_profiles_router.TeachingProfileSelection(profileId="socrates"),
                {"uid": "7"},
            ))
            result = asyncio.run(teaching_profiles_router.update_selection(
                teaching_profiles_router.TeachingProfileSelection(profileId=None),
                {"uid": "7"},
            ))
            selected_id = teaching_profiles.selected_teaching_profile_id(7)

        self.assertIsNone(result["selectedProfileId"])
        self.assertIsNone(selected_id)

    def test_unknown_profile_is_rejected(self) -> None:
        first, second = self._patch_sessions()
        with first, second, self.assertRaises(HTTPException) as raised:
            asyncio.run(teaching_profiles_router.update_selection(
                teaching_profiles_router.TeachingProfileSelection(profileId="invented-teacher"),
                {"uid": "7"},
            ))
        self.assertEqual(raised.exception.status_code, 422)

    def test_profile_instruction_keeps_tars_identity_and_mode_boundaries(self) -> None:
        profile = teaching_profiles.get_teaching_profile("socrates")
        instruction = teaching_profiles.build_teaching_profile_instruction(profile)
        page_agent = build_tars_agent(instruction)
        tutor_agent = build_tutor_agent(
            teaching_profile_instruction=instruction,
            include_image_generation=False,
            include_handoffs=False,
            include_progress_tools=False,
        )

        for agent in (page_agent, tutor_agent):
            self.assertEqual(agent.name, "tars")
            self.assertIn("You are still Tars", agent.instructions)
            self.assertIn("not historical roleplay", agent.instructions)
            self.assertIn("SIMPLE", agent.instructions)
            self.assertIn("Active mode instructions", agent.instructions)

    def test_experiential_profile_has_explicit_safety_boundary(self) -> None:
        profile = teaching_profiles.get_teaching_profile("elliott")
        instruction = teaching_profiles.build_teaching_profile_instruction(profile)
        self.assertIn("Never reproduce Jane Elliott's eye-colour exercise", instruction)
        self.assertIn("Never deceive, humiliate, shame", instruction)

    def test_playful_profile_keeps_humor_useful_and_safe(self) -> None:
        profile = teaching_profiles.get_teaching_profile("burger")
        instruction = teaching_profiles.build_teaching_profile_instruction(profile)
        self.assertIn("Make the humor serve the concept", instruction)
        self.assertIn("Treat a failed attempt as useful evidence", instruction)
        self.assertIn("Never use sarcasm at the learner's expense", instruction)
        self.assertIn("high-stakes", instruction)

    def test_all_profile_voices_are_supported_realtime_voices(self) -> None:
        supported = {"alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"}
        self.assertTrue({profile.voice for profile in teaching_profiles.list_teaching_profiles()} <= supported)


if __name__ == "__main__":
    unittest.main()
