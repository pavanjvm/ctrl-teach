"""Discover router — web-powered course discovery.

POST /api/discover
  Body: { "query": str, "platforms": [str], "level": str|None }
  Returns ranked, *real* course/resource suggestions constrained to the
  platforms the learner selected during onboarding.

Pipeline:
  1. Build a platform-targeted search query (e.g. "user stories agile course
     site:udemy.com OR site:coursera.org ...").
  2. Two live web sources run in parallel:
       - Firecrawl `/search`   — web index hits (titles, urls, snippets).
       - OpenAI `web_search`   — Responses API tool with cited URLs.
  3. Hits are merged + deduped by URL.
  4. OpenAI `gpt-4o-mini` normalizes/ranks the merged hits into our structured
     course schema, inferring difficulty, duration, rating, skills, reason.

Results are cached per query signature for the demo.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from openai import OpenAI
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user
from app.config import settings
from app.services.learning_path import compose_learning_path
from app.services.roadmap_generation import generate_prompt_roadmap

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/discover", tags=["discover"])

_openai_client: Optional[OpenAI] = None
_firecrawl_client = None  # lazily imported so missing SDK doesn't crash startup
_cache: Dict[str, Dict[str, Any]] = {}
_CACHE_TTL = 60 * 30  # 30 minutes

# Map onboarding platform names to domains for `site:` grounding.
PLATFORM_DOMAINS: Dict[str, str] = {
    "YouTube": "youtube.com",
    "Udemy": "udemy.com",
    "Coursera": "coursera.org",
    "LinkedIn Learning": "linkedin.com/learning",
    "edX": "edx.org",
    "freeCodeCamp": "freecodecamp.org",
    "Pluralsight": "pluralsight.com",
    "Khan Academy": "khanacademy.org",
    "MIT OpenCourseWare": "ocw.mit.edu",
    "Medium": "medium.com",
    "Substack": "substack.com",
    "GitHub": "github.com",
    "Stack Overflow": "stackoverflow.com",
    "Reddit": "reddit.com",
    "Dev.to": "dev.to",
    "Documentation": None,  # open web — no site: filter
}


class DiscoverRequest(BaseModel):
    query: str
    platforms: List[str] = Field(default_factory=list)
    level: Optional[str] = None
    time_budget: str = "2 weeks"


class GenerateRoadmapRequest(BaseModel):
    prompt: str = Field(min_length=2, max_length=500)


def _openai() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI(api_key=settings.openai_api_key)
    return _openai_client


def _firecrawl():
    """Lazily build the Firecrawl client. Returns None if not configured."""
    global _firecrawl_client
    if _firecrawl_client is None:
        if not settings.firecrawl_api_key:
            return None
        try:
            from firecrawl import Firecrawl

            _firecrawl_client = Firecrawl(api_key=settings.firecrawl_api_key)
        except Exception as exc:  # missing SDK, bad key, etc.
            logger.warning("firecrawl init failed: %s", exc)
            _firecrawl_client = False  # type: ignore[assignment]
    return _firecrawl_client if _firecrawl_client is not False else None


def _sig(req: DiscoverRequest) -> str:
    raw = json.dumps(
        {
            "q": req.query.lower().strip(),
            "p": sorted(req.platforms),
            "l": req.level,
            "t": req.time_budget,
        },
        sort_keys=True,
    )
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def _build_query(req: DiscoverRequest) -> str:
    """Compose a search query that biases results toward the chosen platforms."""
    base = req.query.strip()
    level_hint = f"{req.level} " if req.level else ""
    # Ground results in the chosen platforms via `site:` operators.
    site_clauses: List[str] = []
    for p in req.platforms:
        domain = PLATFORM_DOMAINS.get(p)
        if domain:
            site_clauses.append(f"site:{domain}")
    if site_clauses:
        return f"{level_hint}{base} course tutorial {' OR '.join(site_clauses)}"
    return f"{level_hint}{base} course tutorial best"


SCHEMA = {
    "type": "object",
    "properties": {
        "courses": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "platform": {"type": "string"},
                    "instructor": {"type": "string"},
                    "description": {"type": "string"},
                    "difficulty": {"type": "string"},
                    "duration": {"type": "string"},
                    "rating": {"type": "number"},
                    "ratingCount": {"type": "integer"},
                    "skills": {"type": "array", "items": {"type": "string"}},
                    "url": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": [
                    "title", "platform", "instructor", "description", "difficulty",
                    "duration", "rating", "ratingCount", "skills", "reason",
                ],
                "additionalProperties": False,
            },
        }
    },
    "required": ["courses"],
    "additionalProperties": False,
}


def _firecrawl_search(query: str) -> List[Dict[str, Any]]:
    """Run a Firecrawl web search and return raw hits as plain dicts."""
    client = _firecrawl()
    if client is None:
        return []
    try:
        results = client.search(query, sources=["web"], limit=10)
        hits: List[Dict[str, Any]] = []
        for item in results.web or []:
            url = getattr(item, "url", None) or ""
            title = getattr(item, "title", None) or ""
            # Some sources (e.g. youtube) include description in `markdown`.
            markdown = getattr(item, "markdown", None) or ""
            snippet = getattr(item, "description", None) or markdown[:240]
            if not url:
                continue
            hits.append({
                "title": title,
                "url": url,
                "snippet": snippet,
            })
        return hits
    except Exception as exc:
        logger.warning("firecrawl search failed: %s", exc, exc_info=True)
        return []


def _openai_web_search(req: DiscoverRequest) -> List[Dict[str, Any]]:
    """Run a live web search via OpenAI's Responses API `web_search` tool.

    Returns raw hits (url, title, snippet) extracted from the model's cited
    sources. Useful as a second live source alongside Firecrawl for broader
    coverage — the two indexes overlap but don't fully coincide.
    """
    if not settings.openai_api_key:
        return []
    platforms = ", ".join(req.platforms) if req.platforms else "any major learning platform"
    level_hint = f" {req.level} level." if req.level else ""
    question = (
        f"Find the 6 best {req.query} courses/tutorials from these platforms: {platforms}."
        f"{level_hint} List each result with its exact URL, title, and a one-sentence description."
    )
    try:
        resp = _openai().responses.create(
            model="gpt-4o-mini",
            tools=[{"type": "web_search"}],
            input=question,
        )
    except Exception as exc:
        logger.warning("openai web_search failed: %s", exc, exc_info=True)
        return []

    # Extract cited URLs from the response output. Each `url_citation`
    # annotation carries a real URL we should ground into. We also keep the
    # model's prose answer so the downstream normalizer has context.
    seen: Dict[str, Dict[str, Any]] = {}
    prose_parts: List[str] = []
    for item in getattr(resp, "output", []) or []:
        # Message items carry the answer text + url_citation annotations.
        content = getattr(item, "content", None) or []
        for block in content:
            if getattr(block, "type", None) == "output_text":
                prose_parts.append(getattr(block, "text", "") or "")
                for ann in getattr(block, "annotations", []) or []:
                    if getattr(ann, "type", None) == "url_citation":
                        url = getattr(ann, "url", None) or ""
                        title = getattr(ann, "title", None) or ""
                        if url and url not in seen:
                            seen[url] = {"url": url, "title": title, "snippet": ""}
        # Some SDK versions surface citations directly on the output item.
        for ann in getattr(item, "annotations", []) or []:
            if getattr(ann, "type", None) == "url_citation":
                url = getattr(ann, "url", None) or ""
                if url and url not in seen:
                    seen[url] = {
                        "url": url,
                        "title": getattr(ann, "title", None) or "",
                        "snippet": "",
                    }

    # Snippet = the model's prose answer (trimmed) so the redistributing
    # normalizer has topical context for ranking.
    prose = " ".join(prose_parts).strip()
    for h in seen.values():
        h["snippet"] = prose[:400]
    return list(seen.values())


def _dedupe_hits(hits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen_urls: set[str] = set()
    out: List[Dict[str, Any]] = []
    for h in hits:
        key = (h.get("url") or "").split("?")[0].split("#")[0].rstrip("/").lower()
        if not key or key in seen_urls:
            continue
        seen_urls.add(key)
        out.append(h)
    return out


def _rank_with_openai(req: DiscoverRequest, hits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Normalize merged live web hits into our structured course schema."""
    if not hits:
        return []

    platforms = ", ".join(req.platforms) if req.platforms else "any major learning platform"
    level_hint = f" Focus on {req.level} level content." if req.level else ""
    raw_hits = json.dumps(hits, ensure_ascii=False)[:6000]

    prompt = (
        "You are a course-discovery engine for an AI learning companion called Ctrl+Teach. "
        "Below are RAW web-search hits (real titles, URLs, snippets) for the learner's topic. "
        "Your job: normalize them into a ranked list of 6 high-quality course/resource "
        "suggestions that BEST fit the learner's topic and chosen platforms. Drop spam, ads, "
        "or irrelevant results. If a hit is clearly a course/tutorial, keep it. If rating or "
        "duration info is missing from the snippet, infer a plausible value.\n\n"
        f"Topic: {req.query}\n"
        f"Preferred platforms: {platforms}\n"
        f"{level_hint}\n\n"
        f"RAW HITS:\n{raw_hits}\n\n"
        "Rules:\n"
        "- `url` MUST come from the raw hits — never invent a URL.\n"
        "- `platform` should match the URL's domain (e.g. youtube.com → YouTube, "
        "udemy.com → Udemy, coursera.org → Coursera, medium.com → Medium, "
        "freecodecamp.org → freeCodeCamp, github.com → GitHub, etc.).\n"
        "- `difficulty` is one of Beginner, Intermediate, Advanced.\n"
        "- `duration` is a human estimate like '6h 30m' or '45m'.\n"
        "- `instructor` is a plausible name based on the snippet if available, "
        "otherwise 'Various' or the channel/author name.\n"
        "- `rating` is a decimal between 4.0 and 5.0 inferred from surface signals.\n"
        "- `reason` is one short sentence explaining why it ranks here.\n"
    )

    try:
        resp = _openai().chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You normalize raw web hits into ranked course JSON."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_schema", "json_schema": {"name": "discover", "schema": SCHEMA}},
            temperature=0.5,
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        return data.get("courses", [])[:6]
    except Exception as exc:
        logger.warning("openai ranking failed: %s", exc, exc_info=True)
        # Fallback: return a minimal record for each raw hit so the UX still works.
        return [
            {
                "title": h["title"] or h["url"],
                "platform": _platform_from_url(h["url"]),
                "instructor": "Various",
                "description": h["snippet"] or "",
                "difficulty": req.level or "Beginner",
                "duration": "—",
                "rating": 4.5,
                "ratingCount": 0,
                "skills": [],
                "url": h["url"],
                "reason": "Top result from live web search.",
            }
            for h in hits[:6]
        ]


def _platform_from_url(url: str) -> str:
    host = url.split("/")[2] if "://" in url else ""
    for name, domain in PLATFORM_DOMAINS.items():
        if domain and domain in host:
            return name
    return host.replace("www.", "").split(".")[0].capitalize() or "Web"


def _collect_live_hits(req: DiscoverRequest) -> tuple[List[Dict[str, Any]], List[str]]:
    """Collect grounded URLs from the configured search connectors."""

    import concurrent.futures as _cf

    query = _build_query(req)
    firecrawl_hits: List[Dict[str, Any]] = []
    openai_hits: List[Dict[str, Any]] = []
    with _cf.ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            ("firecrawl", pool.submit(_firecrawl_search, query)),
            ("openai-websearch", pool.submit(_openai_web_search, req)),
        ]
        for source, future in futures:
            try:
                result = future.result(timeout=45)
            except Exception as exc:
                logger.warning("%s discovery source failed: %s", source, exc)
                result = []
            if source == "firecrawl":
                firecrawl_hits = result
            else:
                openai_hits = result

    used_sources: List[str] = []
    if firecrawl_hits:
        used_sources.append("firecrawl")
    if openai_hits:
        used_sources.append("openai-websearch")
    return _dedupe_hits(firecrawl_hits + openai_hits), used_sources


@router.post("/path")
async def build_path(req: DiscoverRequest, user: dict = Depends(get_current_user)):
    """Build one grounded, multi-modal learning path for a learner goal."""

    if not req.query.strip():
        return {"path": None, "source": "empty"}

    sig = f"path:{_sig(req)}"
    cached = _cache.get(sig)
    if cached and time.time() - cached["t"] < _CACHE_TTL:
        return {"path": cached["path"], "source": "cache"}

    hits, used_sources = _collect_live_hits(req)
    client = _openai() if settings.openai_api_key else None
    path = compose_learning_path(
        client=client,
        query=req.query.strip(),
        level=req.level or "Beginner",
        time_budget=req.time_budget,
        hits=hits,
    )
    source = "+".join(used_sources) or ("openai-only" if client else "local-fallback")
    _cache[sig] = {"t": time.time(), "path": path}
    return {"path": path, "source": source}


@router.post("/roadmap")
async def build_roadmap(req: GenerateRoadmapRequest, user: dict = Depends(get_current_user)):
    """Turn a free-form learner prompt into a bounded interactive roadmap."""

    prompt = req.prompt.strip()
    sig = f"roadmap:{hashlib.sha1(prompt.casefold().encode('utf-8')).hexdigest()}"
    cached = _cache.get(sig)
    if cached and time.time() - cached["t"] < _CACHE_TTL:
        return {"roadmap": cached["roadmap"], "source": "cache"}

    client = _openai() if settings.openai_api_key else None
    roadmap = generate_prompt_roadmap(client, prompt)
    _cache[sig] = {"t": time.time(), "roadmap": roadmap}
    return {"roadmap": roadmap, "source": "openai" if client else "local-fallback"}



@router.post("")
async def discover(req: DiscoverRequest, user: dict = Depends(get_current_user)):
    if not req.query.strip():
        return {"courses": [], "source": "empty"}

    sig = _sig(req)
    cached = _cache.get(sig)
    if cached and time.time() - cached["t"] < _CACHE_TTL:
        return {"courses": cached["courses"], "source": "cache"}

    hits, used_sources = _collect_live_hits(req)

    if hits:
        # 2. Normalize/rank the merged live hits via OpenAI.
        courses = _rank_with_openai(req, hits)
        source = "+".join(used_sources)
    elif settings.openai_api_key:
        # Fallback: pure LLM generation (no live web) if both sources fail.
        courses = _fallback_generate(req)
        source = "openai-only"
    else:
        courses = []
        source = "no-key"

    for i, c in enumerate(courses):
        c.setdefault("id", f"disc-{sig[:8]}-{i}")
        c.setdefault("thumbnail", "")
    _cache[sig] = {"t": time.time(), "courses": courses}
    return {"courses": courses, "source": source}


def _fallback_generate(req: DiscoverRequest) -> List[Dict[str, Any]]:
    """Pure-LLM fallback used only if Firecrawl is unavailable."""
    platforms = ", ".join(req.platforms) if req.platforms else "any major learning platform"
    level_hint = f" Focus on {req.level} level content." if req.level else ""
    prompt = (
        "You are a course-discovery engine for an AI learning companion called Ctrl+Teach. "
        "A learner wants the *best* learning resources for a topic. Return 6 realistic, "
        "high-quality course/resource suggestions. Rank them best-first.\n\n"
        f"Topic: {req.query}\n"
        f"Allowed platforms (ONLY return courses from these): {platforms}\n"
        f"{level_hint}\n\n"
        "Rules:\n"
        "- `platform` MUST be one of the allowed platforms or a specific named one.\n"
        "- `difficulty` is one of Beginner, Intermediate, Advanced.\n"
        "- `duration` is a human estimate like '6h 30m' or '45m'.\n"
        "- `reason` is one short sentence explaining why it ranks here.\n"
        "- Be realistic; invent plausible instructors and good titles, never duplicate.\n"
    )
    try:
        resp = _openai().chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You produce ranked course suggestions as JSON."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_schema", "json_schema": {"name": "discover", "schema": SCHEMA}},
            temperature=0.7,
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        return data.get("courses", [])[:6]
    except Exception as exc:
        logger.warning("fallback discover generation failed: %s", exc, exc_info=True)
        return []
