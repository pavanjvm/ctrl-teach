eCprime AI Academy — Complete Project & Hackathon Reference

> A single source of truth for the hackathon: the context, the existing codebase
> (deep dive), and the exact plan to build and demo the solution.

---

# Part I — Hackathon Context

## Domain
**Training-as-a-Service (TaaS).**

## Use case (as given)
> Turn any learning objective into a monetizable, self-paced course—generated,
> curated, and delivered by AI. A platform to create, curate and host specific
> technical learning courses offered by Cprime and deliver as self-subscribed and
> self-paced curriculum.

## Cprime's existing offerings (and why they leave a gap)

**1. Cprime Learning** — the external, revenue-generating training catalog
(`cprime.com/learning/courses/`). Each course has a rich page: overview, a
detailed multi-part **course outline** with hands-on exercises, prerequisites,
and "in this class you will learn." Example: *Advanced Splunk Boot Camp*
(16 hours over 2 days, 6-part outline covering data ingestion, SPL, performance
tuning, security, dashboards, and the Splunk ML Toolkit).

- **The problem:** every listing is a **brochure, not a course.** The only way to
  actually learn is **"Reserve your seat"** for a **live, in-person class** — and
  most listings show *"There are currently no scheduled classes for this course."*
  The curriculum exists, but delivery requires a human instructor, a scheduled
  slot, and a booked cohort. It **doesn't scale**, so demand that wants training
  *now* never converts. The catalog is effectively **dead inventory**, and
  Cprime Learning is a real revenue stream that **underperforms** for this
  structural reason.

**2. LinkedIn Learning** — used **internally** by Cprime employees for upskilling
and **certificates**.

- **The problem:** it's **passive** (video + quiz), a recurring **per-seat SaaS
  cost**, and proves *completion*, not *mastery*. No live instruction, no
  coaching, no hands-on guidance.

## The core problem statement
Cprime owns world-class technical curriculum but has **no way to deliver it at
scale, on-demand, and self-paced** — so a real external revenue stream stays
stuck, and internal upskilling stays passive and outsourced.

## The winning angle
**Ingest Cprime's existing course outlines and turn each one into a live,
AI-delivered, self-paced, self-subscribed course you can start the instant you
pay** — replacing the dead "reserve a seat" CTA with "subscribe & start now."

This is strong because it:
1. **Runs on Cprime's real IP** — the AI delivers Cprime's actual syllabus, not
   invented content.
2. **Fixes the visible failure** — "no scheduled classes" → "start now."
3. **Is the monetization story** — dead catalog listings become purchasable,
   self-paced, infinitely scalable inventory (~90% margin), while the premium
   live boot camp stays as the top tier.

## Judging notes (from the team)
- **Monetizability matters a lot** for scoring → payments/subscribe must be visible.
- **Cprime branding is optional** (internal hackathon) → spend time on function, not a reskin.

## Two monetization angles (pick or combine)
- **A — External revenue (anchor on Cprime Learning):** sell AI-delivered,
  self-paced versions of the catalog. Tiered: self-paced AI (cheap, scalable) →
  hybrid (AI + human office hours) → live boot camp (existing premium).
- **B — Internal upskilling (anchor on LinkedIn Learning):** replace/augment LL
  for employees with active AI coaching + a Cprime **mastery** certificate;
  saves per-seat SaaS spend.
- **Recommended:** lead with **A** (the money story), use **B** as the wedge
  ("dogfood on employees, then sell externally").

---

# Part II — The Existing Project ("Ctrl+Teach") — Codebase Deep Dive

## TL;DR — what this project already is
A monorepo that fuses two products:

1. **A Ctrl+Teach AI voice tutor** ("Magic Whiteboard Tutor") — a real-time,
   voice-interactive AI teacher that **talks to you and draws on an Excalidraw
   whiteboard** while explaining. This is the original base (package name is
   literally `magic-whiteboard-tutor-frontend`).
2. **"Tars"** — a browser-wide voice assistant **ported from a macOS Swift
   menu-bar app** that **sees your screen, points a flying cursor at things, draws
   annotations over any webpage, and can click / scroll / control media.**

The unifying idea: **Tars's animated triangle cursor is the same visual
companion used by the tutor on the whiteboard.** One pointing/drawing engine
serves both "point at this button on any website" and "point at this equation on
the whiteboard."

The stack was **migrated off Google** (Firebase / Firestore / Gemini Live / ADK)
to a **local + OpenAI stack**: FastAPI + OpenAI Realtime API (via the OpenAI
Agents SDK) + SQLite + signed bearer-session auth.

> Note: the frontend landing page (`frontend/src/app/page.tsx`) is **already**
> headlined **"Training-as-a-Service, AI-led"** — "Turn any learning objective
> into a live AI-led course" — with a use-case list of *"Agile & Scrum training,
> Product owner enablement, Technical onboarding, Software engineering courses, QA
> automation labs, Enterprise transformation."* The product was essentially built
> for this exact hackathon use case.

## Repository layout
```
ctrl-teach/
├── Backend/            # FastAPI + OpenAI Realtime API + SQLite
├── frontend/           # Next.js 15 (App Router, React 19), TypeScript
├── browser-extension/  # Chrome Manifest V3 extension (browser-wide Tars)
├── AGENTS.md           # Dev notes (stack, commands, architecture)
├── cloudbuild.yaml     # Google Cloud Build config
└── deploy.sh
```

## Tech stack
- **Frontend:** Next.js 15 (App Router, React 19), TypeScript, custom CSS (no
  Tailwind), `framer-motion`, `@excalidraw/excalidraw`, `lucide-react`/`@tabler/icons`,
  `axios`, `html2canvas`. "Luxe Whitespace" design language.
- **Backend:** FastAPI 0.129, OpenAI Agents SDK (`openai-agents`) realtime layer,
  `openai`, SQLAlchemy 2 + SQLite, `passlib` (pbkdf2_sha256), `numpy` (audio
  resample), `pillow`. No Google/Firebase deps remain.
- **Extension:** Chrome Manifest V3 (service worker + content script + offscreen
  document + audio worklet).

---

## Backend deep dive (`Backend/`)

### The heart: `app/main.py` (~1,285 lines)
A single WebSocket endpoint **`/ws/{user_id}/{session_id}`** bridges the browser
to the OpenAI Realtime API.

- **Per-connection** `RealtimeRunner` + `RealtimeSession`.
- **`upstream_task`** (browser → OpenAI): binary frames are raw PCM16 @ **16 kHz**,
  resampled to **24 kHz** (numpy linear interpolation) before `session.send_audio()`.
  JSON frames handle `text`, `interrupt`, `image`, `canvas`, `canvas_elements`, and
  Tars-specific messages.
- **`downstream_task`** (OpenAI → browser): translates SDK events into
  **"ADK-shaped" JSON envelopes** (a legacy from the Google ADK origin) so the
  frontend protocol never changed during migration. Includes a **retry loop**
  (3 attempts) that recreates a fresh session on transient errors.
- **Agent selection** via `?agent=tutor` (default) or `?agent=tars`.

**Two Tars-critical mechanisms:**
- **Push-to-talk without server VAD:** for Tars, `turn_detection = None`. The
  browser holds Ctrl to talk; on release it sends `tars_screen` (screenshot +
  DOM inventory), then `tars_commit_audio`, which is the *single* op that closes
  the input buffer and triggers exactly one `response.create` — so speech + screen
  land in the same turn.
- **Async visual grounding:** `point_at` / `draw_on_screen` tool calls spawn
  detached asyncio tasks that ground coordinates **without blocking audio** — the
  cursor flies as soon as the locator resolves; multi-shape diagrams paint
  progressively.

**Canvas Bridge / Early Canvas Push:** large canvas element payloads are stored
server-side (`canvas_bridge` / `image_bridge` dicts) and re-injected into browser
envelopes rather than sent through the LLM conversation (avoids WS 1007/1008
policy errors). Canvas tools are even "early-pushed" on `tool_start` for snappiness.

### Realtime session config
- Model: `settings.realtime_model` (`gpt-realtime-2.1` as configured).
- Input/output audio: pcm16; transcription model `gpt-4o-mini-transcribe`.
- Tutor uses `semantic_vad` with `interrupt_response`; Tars disables VAD.
- 30s WS handshake timeout for flaky links.

### Agents (`app/agents/`)
Built on `RealtimeAgent` + `realtime_handoff`:

- **`tutor_agent.py`** — the Magic Whiteboard Tutor. Large system prompt covering
  personality, **canvas discipline** ("canvas is for diagrams/equations only —
  your speech is auto-transcribed to chat"), color-coding conventions, and a
  **progress-tracking mandate** (`get_progress` at start, `update_progress` after
  each topic, `save_session_notes` at end). Tools: `write_text_on_canvas`,
  `draw_on_canvas`, `draw_diagram`, `highlight_area`, `plot_function`,
  `clear_canvas`, `generate_and_show_image`, `get_progress`, `update_progress`,
  `save_session_notes`, `upload_canvas_snapshot`, `point_at_whiteboard`, plus
  Tars's `draw_on_screen`/`clear_screen_drawings`. Hands off to `planner_agent`
  and `progress_agent`. Accepts a `custom_instruction` (per-tutor personalization).
- **`tars_agent.py`** — the browser assistant. Lowercase, casual "write for the
  ear" persona. Tools: `point_at` (DOM `target_id` OR vision `x,y`),
  `draw_on_screen` (circle/rectangle/highlight/underline/arrow/line/text;
  solid/dashed/dotted), `clear_screen_drawings`, `interact_with_page`
  (scroll/media/activate_tab). Encodes the **two-tier pointing strategy** and a
  `coordinate_space="media"` mode for gridded video crops.
- Others: `planner_agent`, `progress_agent`, `calendar_agent`, `canvas_agent`,
  `media_agent`, and `prompt_builder.py` (`build_tutor_instruction` builds a
  dynamic per-tutor instruction from DB config).

### Visual grounding: `app/services/tars_visual_locator.py`
The precision engine. The Realtime model decides *what* to point at; a dedicated
**GPT "computer-use" pass** decides *where* in exact pixel space
(`client.responses.create(tools=[{"type":"computer"}])`, model `gpt-5.5`, `medium`
reasoning, 20s timeout). Modes: `point` (click), `bounds` (drag box for
rectangle/highlight/circle), `segment` (drag for underline/line/arrow). DOM-backed
targets skip this (browser resolves via `getBoundingClientRect()`).

### Course generation: `app/services/learning_path.py`
`compose_learning_path(client, query, level, time_budget, hits)` turns a learning
**goal + real web hits** into a validated course: **3 modules**, each with study /
assessment / roleplay lessons, every external URL validated against the original
search hits (anti-hallucination). Has robust fallbacks (`_fallback_path`,
`_fallback_questions`, `_fallback_roleplay`) and a `_sanitize_path` validator.
**This is the seed for the hackathon importer.**

### Routers (full API surface)
| Router | Endpoints |
|---|---|
| `auth_router` | `POST /api/auth/register` |
| `users` | `GET/PUT /api/users/me`, `/me/full`, `POST /sync` |
| `tars` | `POST /api/tars/extension-session`, `POST /api/tars` (HTTP vision fallback), `POST /speak` (TTS) |
| `discover` | `POST /api/discover` (ranked course listings), `POST /api/discover/path` (full learning path) |
| `dashboard` | `/stats`, `/sessions`, `/streak`, `/progress`, `/topics`, `/study-plans`, `/all` |
| `tutors` | full CRUD (`GET/POST/PUT/DELETE`) |
| `schedule` | full CRUD + `/all` |

- **`discover.py`** — course *curation*: runs **Firecrawl `/search` + OpenAI
  `web_search` in parallel**, dedupes by URL, then `gpt-4o-mini` normalizes hits
  into a structured course schema (URLs must come from real hits). Cached 30 min.
- **`tars.py`** — also a *non-Realtime HTTP fallback*: `gpt-4o-mini` vision +
  JSON-schema pointing, `tts-1` audio. Plus the **extension-session** endpoint
  (issues scoped tokens).

### Data model (`app/db.py`, SQLite via SQLAlchemy)
- `User` (username, pbkdf2 password_hash, email, name, timezone, last_login)
- `Profile` (bio, grade, school, languages, **`preferences` JSON** — stores
  `preferences.ctrlteach` onboarding)
- `SessionRow` (tutoring sessions: topic, subject, duration, notes, key_concepts)
- `Progress` (**mastery_level 1–5** per subject/topic)
- `Quiz` (score, percentage, questions_missed)
- `StudyPlan` (subjects, weekly_goals, target_date)
- `Tutor` (custom AI tutors: name, personality, voice, subjects, styles, level)
- `ScheduledSession` (title, subject, tutor, start_time, duration — the "booking" model)

Users are seeded from the `APP_USERS` env JSON at startup.

> **Gap for the hackathon:** there is **no `Course` table** — generated courses
> live only in the frontend's `localStorage`. And there is **no `Enrollment` /
> payment** concept. These are the two things to build.

### Auth (two schemes)
- **HTTP Basic** (`app/auth/dependencies.py`) against SQLite, pbkdf2_sha256.
  `get_current_user` is the FastAPI dependency; `verify_basic_credentials` is used
  directly by the WebSocket (deps don't apply to WS).
- **Scoped extension tokens** (`app/auth/extension_tokens.py`): short-lived (12h)
  HMAC-signed tokens (`ctc1.<payload>.<sig>`, scope `tars:realtime`) so the
  browser extension never holds the user's password. Secret derived from
  `OPENAI_API_KEY` if not set (survives reloads).

### Canvas tools (`app/tools/canvas_tools.py`)
The AI emits JSON element commands the frontend renders on Excalidraw. Includes an
**auto-advancing Y cursor** (text stacks vertically), an extensive **LaTeX/ASCII →
Unicode** math normalizer (Greek, operators, super/subscripts, `\frac`, `\sqrt`),
box/text measurement helpers, staggered **animation metadata** (cascading reveals),
and the bridge deferral system. `plot_function` lives in `plot_tools.py`;
image generation in `media_tools.py`.

---

## Frontend deep dive (`frontend/`)

### Route structure
- `/` — landing (editorial "Training-as-a-Service, AI-led" marketing page).
- `(auth)`: `/login`, `/signup`.
- `(dashboard)`: `/dashboard`, `/discover`, `/learn` (+ `/completion`), `/board`
  (whiteboard session), `/library`, `/profile`, `/schedule`, `/tutors` (+ `/[id]`).
- `/onboarding`, `/privacy`, `/terms`.

**Workflow:** `/onboarding` → `/discover` → `/learn` (3-pane workspace:
PathSidebar · stage · CompanionPanel, with a Study / Lab / Assessment / Roleplay
mode switcher) → `/learn/completion`.

### Global state (providers nest in `layout.tsx`)
`AuthProvider` → `LearnerProvider` → `TarsProvider`, then `{children}` +
`<TarsExtensionBridge/>` + `<GlobalTarsAssistant/>`.
- **`lib/learner.tsx`** — onboarding prefs, active course/lesson, XP/streak/
  confidence/badges/completed lessons. Persisted to `localStorage` AND mirrored to
  backend `Profile.preferences.ctrlteach`. Courses = `SEED_COURSES` +
  `savedCourses` (localStorage — **this is where hosting must move server-side**).
- **`lib/tars.tsx`** — Tars enabled toggle, extension-available state, status.

### Domain types (`lib/types.ts`)
`OnboardingPrefs`, `CourseOnboardingPrefs`, and the catalog contract:
`Course → Module → Lesson`, where `LessonType = "study" | "lab" | "assessment" |
"roleplay"`, plus `QuizQuestion`, `RoleplayScenario`, `LearningResource`,
`LabScene`/`LabStep`/`Annotation` (Lab-mode coaching), and `ProgressState`/`Badge`.
**The `Course` type is the schema the importer/catalog should produce.**

### The whiteboard (`/board`)
Composes `WhiteboardCanvas` (Excalidraw, dynamically imported — no SSR),
`TranscriptPanel`, `Toolbar`. `useWebSocket` + `useAudio` wire mic → WS → OpenAI →
speaker, and canvas commands → Excalidraw. `needsWhiteboardVision()` heuristics
decide when to send a board screenshot to the model. `LabCoach.tsx` +
`labScenes.ts` implement the "pixel-precision coaching engine" (bezier-arc flight +
live CSS-selector rect resolution) — a browser port of Tars.

### `hooks/useWebSocket.ts`
Parses the ADK-shaped envelopes: input/output transcription (streaming deltas →
chat panel), inline PCM audio, `functionResponse` → canvas commands, and the
Tars events (`tars_point`, `tars_draw`, `tars_draw_batch`,
`realtime_ready`, `generating_image`, `saving_progress`). Manages
interrupt/turn-complete lifecycle. Exposes `sendAudio`, `sendText`, `sendImage`,
`sendCanvasSnapshot`, `sendTarsScreen`, `sendTarsCommitAudio`, etc.

### `components/GlobalTarsAssistant.tsx` (~1,552 lines — the in-app Tars)
The **fallback Tars that runs inside the web app when the extension isn't
installed.** A full reimplementation:
- Its own **`getDisplayMedia` screen capture** with a **calibration-marker
  system** — paints 4 colored corner markers, screenshots the tab-share stream,
  then connected-component detection finds the exact viewport rectangle (so vision
  coords map back precisely).
- DOM inventory collection (ranked/deduped), push-to-talk gating (Ctrl = unmute),
  client-side speech detection (RMS/flux/peak vs. learned ambient noise), and the
  animated triangle cursor with spring-follow + **quadratic-bezier flight**
  (duration `clamp(dist/800, 0.6–1.4s)`, arc `min(dist*0.2, 80)`, sin-pulse scale)
  — an exact port of the macOS `OverlayWindow.swift`.

`components/TarsExtensionBridge.tsx` probes for the extension via
`window.postMessage`; if present, hands it a **scoped extension session** + config
so the extension takes over and the in-app one stays dormant.

---

## Browser extension deep dive (`browser-extension/`)
Chrome **Manifest V3**; permissions `storage/tabs/offscreen/scripting` +
`<all_urls>`. Four coordinated contexts:

- **`service-worker.js`** — orchestrator: tracks the active tab, drives push-to-talk
  (`beginPushToTalk`/`finishPushToTalk`), captures the visible tab
  (`chrome.tabs.captureVisibleTab`), injects content scripts on demand, routes
  offscreen events → tabs, enforces a **trusted-origin bridge** (only
  `localhost:3000` / `127.0.0.1:3000` may configure it).
- **`content.js`** (~840 lines) — the on-page overlay in a **closed shadow DOM**
  (`z-index 2147483646`): triangle cursor, waveform (listening), spinner
  (thinking), speech bubble, SVG annotation layer, and a **confirmation dialog**
  for sensitive actions (buy/delete/submit/password). Collects DOM targets (ranked,
  ≤240), builds media context (video rect, captions, YouTube transcript), executes
  point/draw/click/scroll. Same bezier-flight cursor.
- **`offscreen.js`** (~494 lines) — the persistent **audio + WebSocket** layer
  (survives tab changes): mic via `AudioWorklet` @ 16 kHz, 24 kHz PCM player,
  client-side VAD, the WS to `/ws/...?agent=tars` (auth via
  `Sec-WebSocket-Protocol: ctrlteach-tars-auth.<token>`), and builds the
  **gridded 0–1000 media crop** for video grounding. Auto-reconnects.
- **`pcm-worklet.js`** — trivial `AudioWorkletProcessor` posting mic frames.
- **`setup.html/js`** — one-time mic-permission grant page.

**Interaction model:** hold **Ctrl** on any normal webpage to talk; release to send
screenshot + DOM inventory + tabs + media context. Only the active visible tab is
captured on turn-end (no continuous screen sharing).

---

## The Tars system — three coordinated modes
The key architectural insight: **Tars exists in three forms sharing one backend
agent and one visual language.**

| Mode | Screen source | Audio path | When |
|---|---|---|---|
| **Extension (browser-wide)** | `chrome.tabs.captureVisibleTab` | Offscreen doc WS + AudioWorklet | Any website, extension installed |
| **In-app fallback** | `getDisplayMedia` + calibration markers | React `useAudio`/`useWebSocket` | Inside the app, no extension |
| **Whiteboard companion** | Excalidraw canvas snapshot | Tutor session on `/board` | During AI tutoring (`point_at_whiteboard`) |

All three: hold Ctrl → speak → screenshot + DOM captured on release → `tars_agent`
decides `point_at`/`draw_on_screen` → **two-tier grounding** (DOM
`getBoundingClientRect()` for exact targets; GPT computer-use vision for non-DOM
pixels like iframe video) → the animated triangle cursor flies a bezier arc and
annotates.

---

## Notable engineering details
- **Migration scars preserved:** the server still emits "ADK-shaped" envelopes
  from the Google era, so the frontend was untouched during the OpenAI migration.
- **Latency obsession:** early canvas push, detached grounding tasks, progressive
  diagram painting, TTS fallback to avoid Realtime handshake cost.
- **Robust coordinate math:** viewport calibration via connected-component marker
  detection; media grounding via a labeled 0–1000 grid crop; DOM-target snapping.
- **Safety:** sensitive-action regex + confirmation modal; `action="click"` only
  when the DOM element is `actionable`; extension origin allowlist; scoped tokens.
- **Math rendering:** extensive LaTeX/ASCII → Unicode normalizer so equations
  render on Excalidraw's handwriting font without a LaTeX engine.

**Model IDs configured in code** (as written; several are ahead of common
availability): `gpt-realtime-2.1` (Realtime), `gpt-5.5`/`gpt-5.4` (visual locator),
`gpt-image-1`, `gpt-4o-mini` (discover / HTTP-tars / course-gen),
`gpt-4o-mini-transcribe`, `tts-1`.

## Deployment
Dockerfiles for `Backend/` and `frontend/`; `cloudbuild.yaml` + `deploy.sh` for
Google Cloud Run. Env: frontend needs `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL`;
backend needs `OPENAI_API_KEY` (+ optional `FIRECRAWL_API_KEY`, `APP_USERS`,
`TARS_EXTENSION_TOKEN_SECRET`). For a deployed origin, add the exact origin to
`CTRLTEACH_ORIGINS` in both `service-worker.js` and `content.js`.

## Known gaps / observations
- Significant **code duplication** between in-app Tars and the extension (DOM
  collection, bezier flight, VAD, cursor rendering reimplemented ~twice).
- **Courses are client-only** (localStorage) — no server-side catalog.
- **No monetization** primitives (pricing, payments, enrollment, gating).
- Frontend **lint not configured**; typecheck via `tsc --noEmit` is the gate.
- Verbose debug logging remains (hackathon/demo residue).

---

# Part III — The Hackathon Plan

## Problem statement (recap)
Cprime owns world-class curriculum (the Cprime Learning catalog) but delivers it
only via **live, in-person classes that don't scale** — most listings show *"no
scheduled classes"*, so demand never converts and the catalog is dead inventory.
Internally, upskilling is outsourced to **passive** LinkedIn Learning. There is no
way to deliver Cprime's training **on-demand, self-paced, and self-subscribed.**

## Solution
**Cprime AI Academy** — ingest Cprime's existing course outlines and turn each into
a **live, AI-delivered, self-paced, self-subscribed course** that starts the
instant you subscribe. An AI instructor **speaks, draws on a whiteboard, runs the
hands-on exercises, points at mistakes pixel-precisely, assesses mastery, and
issues a Cprime certificate** — using Cprime's own syllabus as ground truth.

**Mapped to the use case:**

| Use-case verb | How the Academy delivers it |
|---|---|
| **Create** | Paste/import a Cprime course outline → AI expands it into a full deliverable course |
| **Curate** | Grounded in Cprime's real syllabus (+ optional real web resources already wired) |
| **Host** | Courses persisted server-side in a browsable Cprime catalog |
| **Monetize** | Price per course + self-serve checkout; "Reserve a seat" → **"Subscribe & start now"** |
| **Deliver, self-paced** | AI voice tutor + whiteboard + Tars coaching + progress/mastery + certificate |

## Monetization model (the money slide)
- **Self-paced AI tier** — cheap, instant, ~90% margin, infinite scale → captures
  the long tail that never books a live class.
- **Hybrid tier** — AI course + human office hours.
- **Live boot camp** — the existing premium offering, untouched.
- **Internal wedge** — replaces passive LinkedIn Learning + issues Cprime
  mastery certificates; saves per-seat SaaS spend.

## Architecture
The delivery engine already exists. You add a **catalog + importer + monetization**
shell around it.

```
                         ┌──────────────────────────────────────────────┐
                         │             FRONTEND (Next.js 15)             │
  Admin ▶ Course Studio ─┼─▶ paste/import outline ─▶ preview ─▶ publish  │
  Learner ▶ Catalog ─────┼─▶ Course detail ─▶ Subscribe ─▶ /learn ───────┼──▶ AI delivery
                         │        (price)      (checkout)   (workspace)   │   (EXISTS)
                         └───────────┬───────────────────────┬──────────┘
                                     │ REST                   │ WebSocket
                         ┌───────────▼───────────────────────▼──────────┐
                         │              BACKEND (FastAPI)                 │
                         │  NEW: /api/courses (import·publish·catalog)    │
                         │  NEW: /api/courses/{id}/subscribe (Stripe)     │
                         │  NEW: /api/me/enrollments · /certificate       │
                         │  EXISTS: /ws (tutor + Tars), discover,       │
                         │          learning_path, progress, dashboard    │
                         └───────────┬────────────────────────┬──────────┘
                         ┌───────────▼──────┐        ┌─────────▼─────────┐
                         │  SQLite           │        │  OpenAI Realtime  │
                         │  NEW: Course,     │        │  + Agents SDK     │
                         │       Enrollment  │        │  + Stripe (test)  │
                         │  EXISTS: User,    │        └───────────────────┘
                         │  Progress, Tutor… │
                         └───────────────────┘
```

### What exists vs. what you build
| Layer | Exists (reuse) | Build for the hackathon |
|---|---|---|
| AI delivery | `tutor_agent`, `/board` whiteboard, Tars, Study/Lab/Assessment/Roleplay modes, `prompt_builder` | Seed the tutor instruction from the enrolled lesson |
| Generation | `compose_learning_path` (goal → course) | **Course-from-outline importer** (Cprime IP) |
| Catalog/hosting | `Course` type + localStorage `savedCourses` | **`Course`/`Enrollment` DB tables + catalog API** |
| Monetization | — | **Price + subscribe + access-gate** (Stripe test or simulated) |
| Progress/cert | `Progress`, `/dashboard`, `/learn/completion`, badges | **Mastery-gated Cprime certificate** |
| Auth | Signed bearer sessions, `get_current_user` | `is_admin` flag for Course Studio |

## Integration — detailed build steps
Do these in order; each phase is independently demoable.

### Phase 0 — Setup (30 min)
- `cd Backend && uv sync --locked`; create
  `.env` with `OPENAI_API_KEY` and
  `APP_USERS=[{"username":"admin","password":"admin"},{"username":"learner","password":"learner"}]`.
- `cd frontend && npm install && npm run dev`. Backend:
  `uv run uvicorn app.main:app --reload --port 8000`.
- `uv add stripe` if doing real payments.

### Phase 1 — Persist courses server-side (the keystone) (2–3 hrs)
- **`Backend/app/db.py`** — add models:
  - `Course`: `id, slug, title, overview, source_url, difficulty, duration,
    skills(JSON), outline_raw(text), modules(JSON), price_cents, currency,
    published(bool), created_by, created_at`. Store the generated module/lesson
    tree as a **JSON blob** (matches the frontend `Course` type — fast, no joins).
  - `Enrollment`: `id, user_id, course_id, status(active|completed),
    price_paid_cents, subscribed_at, completed_at, certificate_id`.
  - Add `is_admin` boolean to `User`.
- **`Backend/app/routers/courses.py`** (new): `GET /api/courses` (published
  catalog), `GET /api/courses/{id}`, admin `POST /api/courses` /
  `POST /api/courses/{id}/publish`. Register it in `app/main.py`.
- **Frontend** — point `/library` (or a new `/catalog`) and a course-detail page at
  these endpoints instead of localStorage. Keep `learner.tsx` for progress/prefs.

### Phase 2 — The Importer (the centerpiece) (3–4 hrs)
- **`Backend/app/services/course_importer.py`** (new) — model it on
  `learning_path.py`. Input = Cprime outline text (Parts / topics / "Exercise:"
  lines). Output = validated `Course` JSON:
  - each **Part → Module**, each **topic → study lesson**, each **"Exercise:" →
    lab lesson**, one **assessment lesson** per module, optional **roleplay**.
  - Prompt rule: *expand* each outline item (summary + what the AI will teach);
    **do not invent new topics** — the outline is ground truth. Reuse the
    `_sanitize_*` validation pattern from `learning_path.py`.
  - `gpt-4o-mini` + `response_format=json_object`.
- **`POST /api/courses/import`** → `{ outline_text | source_url }` → importer →
  saves a **draft** Course.
- *(Optional, real-IP flavor)* a small scraper that fetches a
  `cprime.com/learning/courses/...` page and extracts the outline → import by URL.
- **Frontend "Course Studio"** (`/studio`, admin-only) — reuse
  `GoalPathBuilder.tsx` layout: textarea/URL → **Generate** → preview the tree →
  **set price** → **Publish**.

### Phase 3 — Monetize + self-subscribe (2–3 hrs)
- **Simulated (fastest, demo-safe):** `POST /api/courses/{id}/subscribe` creates an
  `Enrollment` and unlocks access. One button.
- **Stripe test-mode (more convincing):** `POST /api/courses/{id}/checkout` creates
  a Stripe Checkout Session (test key); `POST /api/stripe/webhook` on
  `checkout.session.completed` creates the `Enrollment`. Test card
  `4242 4242 4242 4242`.
- **Access gate:** `GET /api/me/enrollments`; guard `/learn` + `/board` — no
  enrollment → redirect to the course detail's Subscribe CTA. This is what makes it
  a product, not a demo.

### Phase 4 — Wire delivery to the enrolled course (2 hrs, glue)
- On opening an enrolled lesson, pass the lesson's `summary`/topic into the tutor
  session — `prompt_builder.build_tutor_instruction` +
  `build_tutor_agent(custom_instruction=...)` already support this, so the AI
  teaches *that* lesson.
- Route lesson `type` → mode (Study = voice whiteboard, Lab = Tars coaching,
  Assessment = quiz gate, Roleplay = scenario) — already the design in `types.ts`.
- *(Stretch)* add a `"splunk"` Lab surface (mock search UI) to `labScenes.ts` so
  the SPL exercise is visually killer.

### Phase 5 — Certificate + progress (1–2 hrs)
- On mastery threshold (reuse `Progress` levels + `completedLessons`), mark
  `Enrollment.completed`, issue a `certificate_id`, and extend
  **`/learn/completion`** into a shareable **Cprime certificate** (learner name,
  course, date, mastery). The dashboard already shows XP/streak/mastery.

### Suggested team split (4 people)
1. DB + catalog API + access-gating.
2. Importer service + Course Studio UI.
3. Stripe/subscribe + certificate.
4. Delivery wiring + Splunk lab surface + demo polish.

## Demo script (≈4 minutes, 5 acts)
Have two logins ready (**admin**, **learner**). Pre-import 2–3 courses so the
catalog looks real; do the Splunk import **live** as the hero moment.

**Act 1 — Create (Course Studio, as admin) — 45s**
1. Show the real `cprime.com/learning/.../advanced-splunk-boot-camp` page — point
   at **"There are currently no scheduled classes for this course."**
2. In Course Studio, paste that outline (or the URL) → **Generate**.
3. Watch the AI expand the 6 Parts into modules + study/lab/assessment lessons.
   "It followed Cprime's exact syllabus — no hallucinated content."

**Act 2 — Curate & Host — 20s**
4. Set price → **Publish**. Open the Cprime AI catalog: the Splunk course now reads
   **"Start now — self-paced, AI-delivered,"** not "reserve a seat."

**Act 3 — Monetize (as learner) — 30s**
5. Open the course → **Subscribe** → Stripe test checkout (`4242…`) → payment
   succeeds → **access unlocks.** "Dead brochure → instant self-serve revenue."

**Act 4 — Deliver (the wow) — 90s**
6. Enter Lesson 1. The **AI instructor greets you, teaches "Advanced Indexing
   Concepts," speaking while drawing a diagram on the whiteboard live.**
7. Jump to the exercise **"Writing Advanced SPL Queries"** — **Tars's cursor
   flies over and annotates the mock Splunk UI** while coaching. No other team will
   have this.
8. Answer the module quiz → **mastery + progress update.**

**Act 5 — Certify & business case — 45s**
9. Complete the module → **Cprime mastery certificate** issues; dashboard shows
   XP/streak/mastery.
10. Close: *"Every dead catalog listing becomes purchasable, self-paced,
    AI-delivered inventory — infinite scale, ~90% margin — while the premium live
    boot camp stays on top. Internally, it replaces passive LinkedIn Learning with
    active, mastery-proven upskilling."*

## Risk & mitigation
- **Live import slow/flaky** → keep a **pre-generated Splunk course** as fallback.
- **Voice risky on stage** → the whiteboard drawing + Tars pointing still carry
  the visual wow without audio.
- **Needs internet** (course-gen + voice) → rehearse on the demo network; have
  screenshots/recording as ultimate backup.
- **Stripe setup cost** → start with **simulated enrollment**; add Stripe only if
  time allows.

## Stretch goals (if ahead of schedule)
- Real Cprime-URL scraper for one-click import of any catalog page.
- Admin analytics: enrollments, revenue, completion/mastery rates.
- "Private group training" tier (maps to Cprime's real upsell).
- Shareable/verifiable certificate page.

---

## Quick reference — key files to touch
| Purpose | File |
|---|---|
| Add `Course`/`Enrollment` tables | `Backend/app/db.py` |
| Catalog + import + subscribe API | `Backend/app/routers/courses.py` (new) |
| Course-from-outline generator | `Backend/app/services/course_importer.py` (new) |
| Register new router | `Backend/app/main.py` |
| Per-lesson tutor instruction | `Backend/app/agents/prompt_builder.py`, `tutor_agent.py` |
| Course Studio UI | `frontend/src/app/(dashboard)/studio/page.tsx` (new) + reuse `GoalPathBuilder.tsx` |
| Catalog + course detail UI | `frontend/src/app/(dashboard)/library` or new `/catalog` |
| Access gate | `frontend/src/app/(dashboard)/learn/page.tsx`, `board/page.tsx` |
| Certificate | `frontend/src/app/(dashboard)/learn/completion/page.tsx` |
| Course/enrollment types | `frontend/src/lib/types.ts` |
```
