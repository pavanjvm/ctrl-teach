"""Generate temporary reference narration for the combined Ctrl+Teach pitch."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from openai import OpenAI

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings


OUTPUT_DIR = (
    Path(__file__).resolve().parents[3]
    / "apps"
    / "video"
    / "public"
    / "voiceover"
    / "combined-pitch"
)

SCENES = {
    "act-1-opening.mp3": "World-class expertise shouldn’t have office hours.",
    "act-1-calendar.mp3": (
        "Yet every new cohort adds another calendar, another constraint, another wait."
    ),
    "act-1-urgency.mp3": (
        "The learner needs the skill now. The next class starts later."
    ),
    "act-2-escape.mp3": (
        "And when the answer isn’t available, learners don’t wait."
    ),
    "act-2-search.mp3": "They search.",
    "act-2-ai.mp3": "They ask AI.",
    "act-2-elsewhere.mp3": "They go somewhere else.",
    "act-2-reframe.mp3": (
        "This isn’t a content problem. It’s a delivery problem."
    ),
    "act-3-breakthrough.mp3": "So we removed the calendar.",
}

INSTRUCTIONS = (
    "Speak as a warm, authoritative female-presenting premium documentary narrator. "
    "Use confident, intelligent, understated urgency with crisp diction and deliberate "
    "emphasis. Use a measured, unhurried pace. Preserve every supplied word. Do not "
    "add an introduction or any commentary."
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scene", choices=SCENES)
    args = parser.parse_args()

    if not settings.openai_api_key.strip():
        raise SystemExit("OPENAI_API_KEY is not configured")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    client = OpenAI(api_key=settings.openai_api_key)

    scenes = (
        {args.scene: SCENES[args.scene]}
        if args.scene
        else SCENES
    )
    for filename, text in scenes.items():
        output_path = OUTPUT_DIR / filename
        print(f"generate {filename}")
        with client.audio.speech.with_streaming_response.create(
            model="gpt-4o-mini-tts",
            voice="marin",
            input=text,
            instructions=INSTRUCTIONS,
            response_format="mp3",
        ) as response:
            response.stream_to_file(output_path)
        print(f"saved {output_path} ({output_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
