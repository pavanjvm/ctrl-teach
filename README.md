# Ctrl+Teach

<p align="center">
  <img src="frontend/public/Logo.png" alt="Ctrl+Teach logo" width="112" />
</p>

Ctrl+Teach is an AI-led learning workspace that turns a learning objective into
an interactive course. Learners can study with a realtime voice tutor, work
through guided labs and assessments, generate full courses, and rehearse live
conversations with an AI video actor.

The application is local-first: FastAPI owns authentication, SQLite data,
OpenAI connections, Tavus credentials, and generated assets. The Next.js client
receives signed application sessions and short-lived media-room credentials,
never provider API keys.

## What It Includes

- Realtime voice tutoring with OpenAI Realtime and a synchronized whiteboard.
- Generated courses with resumable research, outline, lesson, and image stages.
- Study, lab, assessment, and roleplay learning modes.
- Browser labs with structured assertions, tracked attempts, and adaptive recovery.
- Standalone video roleplay using selectable Tavus faces and OpenAI voices.
- Permanent local voice previews that do not consume API credits when played.
- Learner profiles, progress, streaks, badges, schedules, tutors, and a library.
- A Chrome Manifest V3 Tars companion for assistance on other web pages.

## Architecture

```text
Browser (Next.js 15 / React 19)
  |-- REST + signed bearer session -------- FastAPI
  |-- WebSocket PCM/text/canvas ----------- OpenAI Realtime agent layer
  |-- Daily call-object video ------------- Tavus Echo PAL / Phoenix face
  |
FastAPI
  |-- SQLite ------------------------------ users, profiles, progress, courses
  |-- local uploads ----------------------- generated course images
  |-- OpenAI ------------------------------ realtime, course text, images
  |-- Tavus ------------------------------- faces, PALs, conversations
  `-- optional Firecrawl ------------------ discovery and source extraction
```

OpenAI remains the roleplay brain and voice. Tavus is used as the synchronized
face renderer; the browser joins the private Tavus Daily room with local camera
and microphone tracks disabled. Learner microphone audio follows the existing
browser-to-OpenAI WebSocket path, so a camera is not required.

## Technology

| Area | Stack |
| --- | --- |
| Frontend | Next.js 15, React 19, TypeScript, custom CSS, Framer Motion |
| Realtime media | OpenAI Realtime, Daily call-object mode, Tavus CVI |
| Canvas and UI | Excalidraw, Lucide, Radix Tabs, Jotai |
| Backend | FastAPI, OpenAI Agents SDK, SQLAlchemy |
| Storage and auth | SQLite, local file storage, signed bearer sessions |
| Optional extraction | Firecrawl |

## Local Setup

### Prerequisites

- Node.js 20 or newer
- Python 3.12 or newer
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- An OpenAI API key
- A Tavus API key only when testing live video roleplay

### 1. Configure and run the backend

```bash
cd Backend
uv sync --locked
cp .env.example .env
```

At minimum, set these values in `Backend/.env`:

```env
OPENAI_API_KEY=your-openai-api-key
APP_SESSION_TOKEN_SECRET=replace-with-a-long-random-secret
```

Generate a suitable local session secret with:

```bash
uv run python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Start the API:

```bash
uv run uvicorn app.main:app --reload --port 8000
```

The API is available at `http://localhost:8000`; interactive documentation is
at `http://localhost:8000/docs` and health status is at `/health`.

On Python installations that do not expose a system certificate store, the
backend automatically uses the verified `certifi` CA bundle for outbound API
connections. Do not disable TLS verification to work around certificate errors.

### 2. Configure and run the frontend

In another terminal:

```bash
cd frontend
npm ci
```

Localhost is the default. To set the endpoints explicitly, create
`frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

Start Next.js:

```bash
npm run dev
```

Open `http://localhost:3000`, register a local account, and complete onboarding.

## Backend Configuration

`Backend/.env.example` is the source of truth for supported variables. Important
groups are summarized below.

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Realtime tutoring, course generation, images, and visual location |
| `REALTIME_MODEL` | Realtime conversation model; defaults to `gpt-realtime-2.1` |
| `COURSE_GENERATION_MODEL` | Course research and writing model |
| `IMAGE_MODEL` | Generated course image model |
| `TAVUS_API_KEY` | Backend-only Tavus credential for live roleplay |
| `TAVUS_FACE_ID` | Optional default roleplay face |
| `TAVUS_PAL_ID` | Optional existing Echo PAL; one is created and cached when omitted |
| `FIRECRAWL_API_KEY` | Optional discovery and source extraction |
| `DATABASE_URL` | SQLite URL; defaults to `sqlite:///./ctrlteach.db` |
| `APP_SESSION_TOKEN_SECRET` | HMAC secret for application sessions |
| `CORS_ORIGINS` | JSON list of allowed frontend origins |

Never place provider keys in `frontend/.env.local` or commit a populated
`Backend/.env`.

When updating an existing SQLite deployment, move the database file currently
referenced by `DATABASE_URL` to `ctrlteach.db` before changing the URL. Updating
the URL first will create a new empty database.

## Live Roleplay and Tavus Credits

The `/role-playing` flow creates a metered Tavus conversation only after the
learner finishes scene setup. It then:

1. Loads ready faces from the authenticated Tavus account.
2. Creates a private Echo conversation and returns a short-lived Daily token.
3. Streams OpenAI's 24 kHz PCM response to the Tavus face through Echo messages.
4. Ends the Tavus conversation when the learner ends the scene, navigates away,
   closes the tab, or exceeds the configured server safeguards.

Default safeguards include a 10-minute maximum call, a 5-second
participant-left timeout, and a 30-second never-joined timeout. Keep the DELETE
and beacon cleanup paths intact because Tavus starts metering when it creates
the room.

Voice previews are static WAV files under
`frontend/public/audio/roleplay-voices`. Playing them does not create a Tavus
room or OpenAI request. To regenerate the complete set deliberately:

```bash
cd Backend
uv run python scripts/generate_roleplay_voice_previews.py
```

## Course Generation

Generated courses are owner-scoped SQLite jobs exposed through
`/api/generated-courses`. The backend persists intermediate stages so an
interrupted process can resume instead of discarding completed research or
lessons. Generated image files are stored beneath `UPLOADS_DIR` and served by
the backend.

The frontend merges completed generated courses with the seed catalog in the
learner provider. Course Factory is available at `/course-factory`.

## Adaptive Recovery Loop

Browser labs use a server-owned recovery loop when verified attempt evidence
shows that a learner has failed a step:

1. The backend diagnoses the likely misconception from the failed assertion
   and its verified browser evidence.
2. The lesson presents a short corrective explanation and a compact whiteboard
   micro-lesson.
3. The learner completes a smaller targeted practice task.
4. A correct practice response reopens the original step with a fresh server
   retry boundary. Every assertion attached to that step must be proven again.
5. Required cleanup runs only after the retried task succeeds, using a separate
   cleanup boundary. The lesson unlocks only when the backend reports the whole
   attempt as `verified`.

The backend stores each mistake, misconception, recovery task, practice
attempt, retry boundary, and final outcome in SQLite. Learner memory records a
matching recovery summary, and future companion and generated-course prompts
receive a bounded, owner-scoped summary of demonstrated gaps and recoveries.
This context personalizes later teaching but cannot replace course truth,
original success criteria, or cleanup requirements.

The recovery API is implemented under the existing browser-lab routes:

- `POST /api/browser-labs/attempts/{attempt_id}/recovery`
- `POST /api/browser-labs/attempts/{attempt_id}/recoveries/{recovery_id}/practice-attempts`
- `POST /api/browser-labs/attempts/{attempt_id}/recoveries/{recovery_id}/retry`

The browser extension supplies evidence, but the backend stamps evidence phases
and makes the verification decision. Client assertion telemetry is diagnostic
only and cannot prove task completion, recovery practice cannot satisfy the
original step, and a verified run is terminal.

## Verification

```bash
# Frontend type checking
cd frontend
npx tsc --noEmit -p tsconfig.json

# Frontend production build
npm run build

# Backend import smoke test
cd ../Backend
uv run python -c "from app.main import app; print(app.title)"

# Roleplay tests
uv run python -m unittest tests.test_roleplay

# Adaptive browser-lab recovery tests
uv run python -m unittest tests.test_browser_labs

# Browser-extension protocol tests
cd ../browser-extension
node --test *.test.js
```

ESLint is not currently installed, so `npm run lint` is not a valid repository
check. Use TypeScript and the production build until linting is configured.

## Project Layout

```text
.
|-- frontend/                  Next.js application
|   |-- src/app/               routes and route-specific styles
|   |-- src/components/        learning, canvas, and companion UI
|   |-- src/lib/               learner state, course data, shared utilities
|   `-- public/                static images and roleplay voice previews
|-- Backend/                   FastAPI application
|   |-- app/agents/            realtime tutor and roleplay agents
|   |-- app/routers/           REST endpoints
|   |-- app/services/          courses, labs, context, visual location
|   |-- tests/                 backend tests
|   `-- scripts/               maintenance and preview generation
|-- browser-extension/         Chrome Manifest V3 Tars companion
|-- scripts/                   project-level artifact scripts
|-- AGENTS.md                  repository guidance for coding agents
`-- README.md                  project overview and setup
```

## Browser Extension

With the frontend and backend running, load `browser-extension/` as an unpacked
extension from `chrome://extensions`. See
[`browser-extension/README.md`](browser-extension/README.md) for permissions,
controls, and deployed-origin configuration.

## Deployment

The frontend and backend each include a Dockerfile. The frontend expects public
HTTP and WebSocket backend URLs at build time. The backend should run with a
persistent database/upload volume or managed equivalents, an explicit CORS
origin, strong independent session secrets, and provider credentials supplied
through the deployment platform's secret manager.

Run the backend with one worker when using the current in-process realtime and
course-job coordination. Revisit shared coordination before scaling to multiple
workers or replicas.
