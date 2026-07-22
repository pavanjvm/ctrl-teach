"""Generate cached roleplay voice previews with the live Realtime model."""

from __future__ import annotations

import argparse
import asyncio
import base64
import sys
import wave
from pathlib import Path

from openai import AsyncOpenAI

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents.roleplay_agent import OPENAI_REALTIME_VOICES, normalize_roleplay_voice
from app.config import settings

SAMPLE_RATE = 24_000
SAMPLE_TEXT = "Hi, I'll be your conversation partner today. Let's begin."
DEFAULT_OUTPUT_DIR = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "public"
    / "audio"
    / "roleplay-voices"
)


async def generate_preview(client: AsyncOpenAI, voice: str, output_path: Path) -> None:
    pcm = bytearray()
    async with client.realtime.connect(model=settings.realtime_model) as connection:
        await connection.session.update(
            session={
                "type": "realtime",
                "model": settings.realtime_model,
                "output_modalities": ["audio"],
                "max_output_tokens": 512,
                "instructions": (
                    "Read the supplied preview sentence exactly once. "
                    "Speak naturally and do not add any other words."
                ),
                "audio": {
                    "output": {
                        "format": {"type": "audio/pcm", "rate": SAMPLE_RATE},
                        "voice": voice,
                    }
                },
            }
        )
        await connection.response.create(
            response={
                "conversation": "none",
                "input": [
                    {
                        "type": "message",
                        "role": "user",
                        "content": [{"type": "input_text", "text": SAMPLE_TEXT}],
                    }
                ],
                "output_modalities": ["audio"],
                "max_output_tokens": 512,
            }
        )

        async for event in connection:
            if event.type == "response.output_audio.delta":
                pcm.extend(base64.b64decode(event.delta))
            elif event.type == "error":
                raise RuntimeError(str(event.error))
            elif event.type == "response.done":
                if getattr(event.response, "status", "completed") != "completed":
                    raise RuntimeError(
                        "Realtime preview failed: "
                        f"{event.response.status} {event.response.status_details}"
                    )
                break

    if not pcm:
        raise RuntimeError(f"Realtime returned no audio for {voice}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(output_path), "wb") as preview:
        preview.setnchannels(1)
        preview.setsampwidth(2)
        preview.setframerate(SAMPLE_RATE)
        preview.writeframes(pcm)


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("voices", nargs="*", help="Voice names; defaults to every supported voice")
    parser.add_argument("--force", action="store_true", help="Replace existing preview files")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()

    requested = args.voices or list(OPENAI_REALTIME_VOICES)
    voices: list[str] = []
    for raw_voice in requested:
        voice = normalize_roleplay_voice(raw_voice)
        if voice is None:
            parser.error(f"Unsupported Realtime voice: {raw_voice}")
        if voice not in voices:
            voices.append(voice)

    if not settings.openai_api_key.strip():
        parser.error("OPENAI_API_KEY is not configured")

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    for voice in voices:
        output_path = args.output_dir / f"{voice}.wav"
        if output_path.exists() and not args.force:
            print(f"skip {voice}: {output_path}")
            continue
        print(f"generate {voice}")
        await generate_preview(client, voice, output_path)
        print(f"saved {voice}: {output_path.stat().st_size} bytes")


if __name__ == "__main__":
    asyncio.run(main())
