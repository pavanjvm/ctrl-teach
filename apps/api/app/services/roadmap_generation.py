"""Prompt-to-roadmap generation with strict, UI-compatible validation.

The model only proposes curriculum text. Identifiers, colors, course links,
and the final bounded shape are owned by the application so generated content
cannot inject routes or arbitrary external URLs into the learner experience.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

MAX_PROMPT_CHARS = 500
MAX_STAGES = 5
MAX_TOPICS_PER_STAGE = 4
MAX_KEYWORDS_PER_TOPIC = 4


def _clean_text(value: Any, limit: int) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def _slug(value: str, limit: int = 44) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")[:limit] or "custom-roadmap"


def _title_from_prompt(prompt: str) -> str:
    cleaned = prompt.strip().rstrip(".?!")
    prefixes = (
        "create a roadmap for ",
        "generate a roadmap for ",
        "roadmap for ",
        "learn ",
        "become a ",
        "become an ",
    )
    lowered = cleaned.casefold()
    for prefix in prefixes:
        if lowered.startswith(prefix):
            cleaned = cleaned[len(prefix):]
            break
    return cleaned[:80].title() or "Custom Learning Roadmap"


def _fallback_topic(
    roadmap_id: str,
    stage_index: int,
    topic_index: int,
    title: str,
    description: str,
    keywords: list[str],
    *,
    optional: bool = False,
) -> dict[str, Any]:
    return {
        "id": f"{roadmap_id}-s{stage_index + 1}-t{topic_index + 1}",
        "title": title,
        "description": description,
        "keywords": keywords[:MAX_KEYWORDS_PER_TOPIC],
        "courseIds": [],
        "bootcampIds": [],
        "optional": optional,
    }


def _fallback_roadmap(prompt: str) -> dict[str, Any]:
    title = _title_from_prompt(prompt)
    digest = hashlib.sha1(prompt.casefold().encode("utf-8")).hexdigest()[:10]
    roadmap_id = f"custom-{_slug(title, 30)}-{digest}"
    subject = title.rstrip()
    stage_specs = [
        (
            "Foundations",
            "Build the vocabulary and mental models needed for the rest of the path.",
            [
                ("Core concepts", f"Understand the essential ideas and terminology behind {subject}.", ["fundamentals", "terminology", "mental models", "first principles"]),
                ("Tools and environment", f"Set up the common tools and a safe practice environment for {subject}.", ["tooling", "setup", "workflow", "practice environment"]),
                ("Guided first project", f"Complete a small end-to-end exercise that makes the foundations of {subject} concrete.", ["guided project", "hands-on practice", "feedback", "reflection"]),
            ],
        ),
        (
            "Core skills",
            "Develop the capabilities used in realistic day-to-day work.",
            [
                ("Essential techniques", f"Practice the most frequently used techniques and patterns in {subject}.", ["core techniques", "patterns", "deliberate practice", "examples"]),
                ("Applied problem solving", f"Break down realistic {subject} problems and choose an appropriate approach.", ["problem solving", "trade-offs", "decision making", "debugging"]),
                ("Quality standards", f"Recognize strong work, common mistakes, and the quality bar for {subject}.", ["best practices", "quality", "common mistakes", "review"]),
            ],
        ),
        (
            "Build in practice",
            "Combine individual skills into complete, reviewable outcomes.",
            [
                ("Intermediate project", f"Build a multi-step {subject} project with clear requirements and checkpoints.", ["project planning", "implementation", "checkpoints", "documentation"]),
                ("Collaboration and review", f"Explain decisions, receive feedback, and improve a {subject} solution.", ["collaboration", "peer review", "communication", "iteration"]),
                ("Failure modes", f"Diagnose recurring failure modes and recover systematically when {subject} work goes wrong.", ["troubleshooting", "root cause", "recovery", "resilience"]),
            ],
        ),
        (
            "Professional depth",
            "Make the work dependable and ready for real-world use.",
            [
                ("Advanced patterns", f"Compare advanced approaches and understand when each is appropriate for {subject}.", ["advanced patterns", "constraints", "scalability", "optimization"]),
                ("Measurement and improvement", f"Define useful success criteria and improve {subject} work with evidence.", ["metrics", "evaluation", "experiments", "continuous improvement"]),
                ("Portfolio capstone", f"Produce and present a portfolio-ready {subject} outcome that demonstrates independent judgment.", ["capstone", "portfolio", "presentation", "mastery evidence"]),
            ],
        ),
    ]

    stages: list[dict[str, Any]] = []
    for stage_index, (label, description, topics) in enumerate(stage_specs):
        stages.append({
            "id": f"{roadmap_id}-stage-{stage_index + 1}",
            "label": f"{stage_index + 1:02d} · {label}",
            "description": description,
            "topics": [
                _fallback_topic(
                    roadmap_id,
                    stage_index,
                    topic_index,
                    topic_title,
                    topic_description,
                    keywords,
                    optional=stage_index == 3 and topic_index == 0,
                )
                for topic_index, (topic_title, topic_description, keywords) in enumerate(topics)
            ],
        })

    return {
        "id": roadmap_id,
        "eyebrow": "Generated for your goal",
        "title": title,
        "shortTitle": title[:32],
        "description": f"A practical, progressive roadmap generated from your prompt: {prompt.strip()}",
        "audience": "Learners building a new capability from foundations to applied work",
        "duration": "8–12 weeks",
        "accent": "#7c3aed",
        "softAccent": "#f5f3ff",
        "courseIds": ["sd-fundamentals", "py-python"],
        "stages": stages,
    }


def _sanitize_roadmap(raw: Any, prompt: str) -> dict[str, Any]:
    fallback = _fallback_roadmap(prompt)
    if not isinstance(raw, dict):
        return fallback

    raw_stages = raw.get("stages")
    if not isinstance(raw_stages, list) or len(raw_stages) < 3:
        return fallback

    roadmap_id = fallback["id"]
    stages: list[dict[str, Any]] = []
    for stage_index, raw_stage in enumerate(raw_stages[:MAX_STAGES]):
        if not isinstance(raw_stage, dict):
            continue
        raw_topics = raw_stage.get("topics")
        if not isinstance(raw_topics, list) or len(raw_topics) < 2:
            continue
        topics: list[dict[str, Any]] = []
        for topic_index, raw_topic in enumerate(raw_topics[:MAX_TOPICS_PER_STAGE]):
            if not isinstance(raw_topic, dict):
                continue
            title = _clean_text(raw_topic.get("title"), 80)
            description = _clean_text(raw_topic.get("description"), 280)
            if not title or not description:
                continue
            raw_keywords = raw_topic.get("keywords")
            keywords = []
            if isinstance(raw_keywords, list):
                for value in raw_keywords:
                    keyword = _clean_text(value, 48)
                    if keyword and keyword.casefold() not in {item.casefold() for item in keywords}:
                        keywords.append(keyword)
                    if len(keywords) == MAX_KEYWORDS_PER_TOPIC:
                        break
            while len(keywords) < 3:
                suffixes = ("fundamentals", "practice", "patterns")
                keywords.append(f"{title} {suffixes[len(keywords)]}"[:48])
            topics.append(_fallback_topic(
                roadmap_id,
                stage_index,
                topic_index,
                title,
                description,
                keywords,
                optional=bool(raw_topic.get("optional")),
            ))
        if len(topics) < 2:
            continue
        label = _clean_text(raw_stage.get("label"), 72) or f"Stage {stage_index + 1}"
        label = re.sub(r"^\d+\s*[·.:-]\s*", "", label)
        stages.append({
            "id": f"{roadmap_id}-stage-{stage_index + 1}",
            "label": f"{stage_index + 1:02d} · {label}",
            "description": _clean_text(raw_stage.get("description"), 180) or "Build capability through focused practice.",
            "topics": topics,
        })

    if len(stages) < 3:
        return fallback

    title = _clean_text(raw.get("title"), 80) or fallback["title"]
    return {
        **fallback,
        "title": title,
        "shortTitle": _clean_text(raw.get("shortTitle"), 32) or title[:32],
        "description": _clean_text(raw.get("description"), 420) or fallback["description"],
        "audience": _clean_text(raw.get("audience"), 180) or fallback["audience"],
        "duration": _clean_text(raw.get("duration"), 40) or fallback["duration"],
        "stages": stages,
    }


def generate_prompt_roadmap(client: Any, prompt: str) -> dict[str, Any]:
    """Generate a bounded roadmap or return a deterministic offline version."""

    clean_prompt = _clean_text(prompt, MAX_PROMPT_CHARS)
    fallback = _fallback_roadmap(clean_prompt)
    if client is None:
        return fallback

    request = f"""
Create a role-style learning roadmap for this learner request:

{clean_prompt}

Return JSON with a top-level `roadmap` object containing:
- title, shortTitle, description, audience, duration
- 4 or 5 progressive stages
- every stage has label, description, and exactly 3 topics
- every topic has title, a practical description, 3 or 4 concise keywords,
  and optional (boolean)

Sequence prerequisites before advanced material. Keep nodes specific to the
requested capability. Include hands-on practice, quality, and a capstone.
Do not include URLs, course IDs, prices, vendor claims, or markdown.
"""
    try:
        response = client.chat.completions.create(
            model=settings.course_generation_model,
            messages=[
                {
                    "role": "system",
                    "content": "You are the Ctrl+Teach curriculum architect. Return valid JSON only.",
                },
                {"role": "user", "content": request},
            ],
            response_format={"type": "json_object"},
        )
        payload = json.loads(response.choices[0].message.content or "{}")
        return _sanitize_roadmap(payload.get("roadmap"), clean_prompt)
    except Exception as exc:
        logger.warning("roadmap generation failed, using deterministic fallback: %s", exc)
        return fallback
