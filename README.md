# Ctrl+Teach



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
cd apps/api
uv sync --locked
cp .env.example .env
```

At minimum, set these values in `apps/api/.env`:

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
uv run uvicorn app.main:app --port 8000 --loop asyncio
```

The API is available at `http://localhost:8000`; interactive documentation is
at `http://localhost:8000/docs` and health status is at `/health`.

On Python installations that do not expose a system certificate store, the
backend automatically uses the verified `certifi` CA bundle for outbound API
connections. Do not disable TLS verification to work around certificate errors.

### 2. Configure and run the frontend

In another terminal:

```bash
cd apps/web
npm ci --legacy-peer-deps
```

Localhost is the default. To set the endpoints explicitly, create
`apps/web/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

Start Next.js:

```bash
npm run dev
```

The current Radix dependency set declares React 18 peer ranges while the app
uses React 19. The legacy-peer mode installs the locked dependency graph until
those upstream peer ranges are updated.

Open `http://localhost:3000`, register a local account, and complete onboarding.

## Backend Configuration

`apps/api/.env.example` is the source of truth for supported variables. Important
groups are summarized below.

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Realtime tutoring, course generation, images, and visual location |
| `REALTIME_MODEL` | Realtime conversation model; defaults to `gpt-realtime-2.1` |
| `COURSE_GENERATION_MODEL` | Course research and writing model |
| `IMAGE_MODEL` | Generated course image model |
| `COURSE_INTAKE_TIMEOUT_SECONDS` | Maximum time for one learner-facing course interview request |
| `COURSE_GENERATION_REQUEST_TIMEOUT_SECONDS` | Maximum time for one background course or image request |
| `TAVUS_API_KEY` | Backend-only Tavus credential for live roleplay |
| `TAVUS_FACE_ID` | Optional default roleplay face |
| `TAVUS_PAL_ID` | Optional existing Echo PAL; one is created and cached when omitted |
| `FIRECRAWL_API_KEY` | Optional discovery and source extraction |
| `DATABASE_URL` | SQLite URL; defaults to `sqlite:///./ctrlteach.db` |
| `APP_SESSION_TOKEN_SECRET` | HMAC secret for application sessions |
| `CORS_ORIGINS` | JSON list of allowed frontend origins |

Never place provider keys in `apps/web/.env.local` or commit a populated
`apps/api/.env`.

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
`apps/web/public/audio/roleplay-voices`. Playing them does not create a Tavus
room or OpenAI request. To regenerate the complete set deliberately:

```bash
cd apps/api
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
cd apps/web
npx tsc --noEmit -p tsconfig.json

# Frontend production build
npm run build

# Backend import smoke test
cd ../api
uv run python -c "from app.main import app; print(app.title)"

# Roleplay tests
uv run python -m unittest tests.test_roleplay

# Adaptive browser-lab recovery tests
uv run python -m unittest tests.test_browser_labs

# Browser-extension protocol tests
cd ../extension
node --test *.test.js
```

ESLint is not currently installed, so `npm run lint` is not a valid repository
check. Use TypeScript and the production build until linting is configured.

## Project Layout

```text
.
|-- apps/
|   |-- api/                   FastAPI application, tests, and API-specific scripts
|   |-- extension/             Chrome Manifest V3 Tars companion
|   `-- web/                   Next.js application and static assets
|-- docs/
|   |-- architecture/          repository architecture and ownership rules
|   |-- planning/              product and technical backlog documents
|   `-- setup/                 local setup and migration guidance
|-- scripts/                   project-level artifact scripts
|-- AGENTS.md                  repository guidance for coding agents
|-- README.md                  project overview and setup
`-- skills-lock.json           locked skill metadata
```

## Browser Extension

With the frontend and backend running, load `apps/extension/` as an unpacked
extension from `chrome://extensions`. See
[`apps/extension/README.md`](apps/extension/README.md) for permissions,
controls, and deployed-origin configuration.

## Deployment

The frontend and backend each include a Dockerfile. Build them with
`docker build -f apps/web/Dockerfile apps/web` and
`docker build -f apps/api/Dockerfile apps/api`. The frontend expects public
HTTP and WebSocket backend URLs at build time. The backend should run with a
persistent database/upload volume or managed equivalents, an explicit CORS
origin, strong independent session secrets, and provider credentials supplied
through the deployment platform's secret manager.

Run the backend with one worker when using the current in-process realtime and
course-job coordination. Revisit shared coordination before scaling to multiple
workers or replicas.
