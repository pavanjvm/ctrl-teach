"""Evaluate Tars's visual locator against labeled screenshot cases.

Run from ``Backend``:

    uv run python scripts/tars_locator_trial.py --manifest path/to/cases.json

Manifest format:

    {
      "cases": [{
        "name": "blue button",
        "image": "fixtures/blue-button.png",
        "description": "blue submit button",
        "mode": "point",
        "shape": "",
        "expected": {"start": [412, 238]}
      }]
    }

Images are read locally and sent to each configured computer-use model. Nothing
is persisted by this script unless ``--output`` is provided.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import math
from pathlib import Path
import sys
from typing import Any

from PIL import Image

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import settings  # noqa: E402
from app.services.tars_visual_locator import LocalizationResult, locate_visual_target  # noqa: E402


def _point(value: Any) -> tuple[float, float] | None:
    if isinstance(value, list) and len(value) == 2 and all(isinstance(item, (int, float)) for item in value):
        return float(value[0]), float(value[1])
    return None


def _distance(first: tuple[float, float], second: tuple[float, float]) -> float:
    return math.hypot(first[0] - second[0], first[1] - second[1])


def _score(result: LocalizationResult, expected: dict[str, Any]) -> float | None:
    expected_start = _point(expected.get("start"))
    if expected_start is None:
        return None
    errors = [_distance(result.start, expected_start)]
    expected_end = _point(expected.get("end"))
    if expected_end is not None:
        if result.end is None:
            return None
        errors.append(_distance(result.end, expected_end))
    return sum(errors) / len(errors)


def _mime_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix == ".webp":
        return "image/webp"
    return "image/jpeg"


async def _run_case(model: str, case: dict[str, Any], manifest_dir: Path) -> dict[str, Any]:
    image_path = (manifest_dir / str(case["image"])).resolve()
    image_bytes = image_path.read_bytes()
    with Image.open(image_path) as image:
        width, height = image.size
    result = await locate_visual_target(
        image_base64=base64.b64encode(image_bytes).decode("ascii"),
        mime_type=_mime_type(image_path),
        width=width,
        height=height,
        description=str(case.get("description") or case.get("name") or "requested target"),
        mode=str(case.get("mode") or "point"),
        shape=str(case.get("shape") or ""),
        model=model,
    )
    if result is None:
        return {"name": case.get("name"), "success": False, "error": "no localization returned"}
    pixel_error = _score(result, case.get("expected") or {})
    return {
        "name": case.get("name"),
        "success": True,
        "result": {
            "mode": result.mode,
            "start": list(result.start),
            "end": list(result.end) if result.end else None,
        },
        "pixel_error": pixel_error,
    }


async def _run(manifest_path: Path, models: list[str]) -> dict[str, Any]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    cases = manifest.get("cases")
    if not isinstance(cases, list) or not cases:
        raise ValueError("manifest must contain a non-empty 'cases' list")

    reports = []
    for model in models:
        results = []
        for case in cases:
            results.append(await _run_case(model, case, manifest_path.parent))
        scored = [item["pixel_error"] for item in results if isinstance(item.get("pixel_error"), (int, float))]
        reports.append({
            "model": model,
            "successful_cases": sum(1 for item in results if item["success"]),
            "total_cases": len(results),
            "mean_pixel_error": sum(scored) / len(scored) if scored else None,
            "cases": results,
        })
    return {"manifest": str(manifest_path), "models": reports}


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare Tars computer-use localization models")
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument(
        "--models",
        default=settings.tars_visual_locator_trial_models,
        help="comma-separated model ids",
    )
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    if not settings.openai_api_key:
        parser.error("OPENAI_API_KEY is required")
    models = [item.strip() for item in args.models.split(",") if item.strip()]
    if not models:
        parser.error("at least one model is required")

    report = asyncio.run(_run(args.manifest.resolve(), models))
    rendered = json.dumps(report, indent=2)
    if args.output:
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


if __name__ == "__main__":
    main()
