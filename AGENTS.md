# Ctrl+Teach — Agent Notes

## Stack
- Frontend: Next.js 15 (App Router, React 19), TypeScript, Tailwind-free (custom CSS + tokens in `src/app/globals.css`), `framer-motion`, `@excalidraw/excalidraw`, `lucide-react`, and Daily call-object rendering through `@daily-co/daily-js` / `@daily-co/daily-react`. Luxe Whitespace design language.
- Backend: FastAPI + OpenAI Realtime API (`agents` SDK) + Tavus CVI + SQLite + signed bearer sessions. See `Backend/README.md`.

## Key commands
- Frontend typecheck: `cd frontend && npx tsc --noEmit -p tsconfig.json`
- Frontend build: `cd frontend && npm run build`
- Frontend dev: `cd frontend && npm run dev`
- Frontend lint: NOT configured (`next lint` requires `eslint` to be installed). Use `tsc --noEmit` for type checking.
- Backend dev: `cd Backend && .venv/bin/uvicorn app.main:app --reload --port 8000`
- Backend import smoke-test: `cd Backend && .venv/bin/python -c "from app.main import app"`
- Backend roleplay tests: `cd Backend && .venv/bin/python -m unittest tests.test_roleplay`

## Env
- Frontend: `frontend/.env.local` → `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`.
- Backend: `Backend/.env` → `OPENAI_API_KEY` for Realtime, course generation, images, and TARS visual location.
- Tavus roleplay: `TAVUS_API_KEY`; optional defaults are `TAVUS_FACE_ID` and `TAVUS_PAL_ID`. Credit safeguards use `TAVUS_MAX_CALL_DURATION_SECONDS`, `TAVUS_PARTICIPANT_LEFT_TIMEOUT_SECONDS`, and `TAVUS_PARTICIPANT_ABSENT_TIMEOUT_SECONDS`.
- Content discovery/extraction: `FIRECRAWL_API_KEY` is optional unless the requested workflow needs Firecrawl.
- Model defaults live in `Backend/app/config.py`: `gpt-realtime-2`, `gpt-4o-mini-transcribe`, `gpt-5.4-mini` for course generation, and `gpt-image-2`. Prefer env overrides rather than hardcoding model names elsewhere.
- Auth/session secrets and CORS are also configured in `Backend/.env`; copy names from `Backend/.env.example` and never commit real credentials.

## Architecture highlights
- `src/lib/learner.tsx` (`LearnerProvider`/`useLearner`): global learner state (onboarding prefs, active course/lesson, XP/streak/confidence/badges). Persisted to `localStorage` + mirrored to backend `Profile.preferences.ctrlteach`.
- `src/lib/courses.ts`: seed course catalog with full module/lesson structures.
- Generated courses are owner-scoped SQLite jobs managed by `Backend/app/services/generated_courses.py`, exposed through `/api/generated-courses`, and merged into the learner catalog after completion. Course generation persists intermediate research, outline, lesson, and image stages so interrupted jobs can resume.
- `/course-factory` creates rich courses; generated lessons can include browser-lab assertions and locally persisted image assets under the configured uploads directory.
- `src/lib/labScenes.ts` + `src/components/LabCoach.tsx`: the hero pixel-precision coaching engine (Tars-inspired bezier-arc flight + live CSS-selector rect resolution). `src/components/lab/UserStoryBuilder.tsx` is the practice surface.
- Workflow routes: `/onboarding` → `/discover` → `/learn` (workspace) → `/learn/completion`. Login/signup redirect to `/onboarding` (or `/discover` if already onboarded).
- Workspace `/learn`: 3-pane (PathSidebar · stage · CompanionPanel) + bottom ProgressBar with mode switcher (Study/Lab/Assessment/Roleplay). Study mode reuses the realtime voice whiteboard; embedded Lab/Assessment/Roleplay/Companion modes remain lesson-scoped interactive experiences.

## Realtime roleplay
- Standalone `/role-playing` is a live pipeline: the backend creates a Tavus Echo conversation, the browser joins its Daily room in call-object mode, and OpenAI Realtime supplies the intelligence and selected voice audio. Tavus renders the selected face; do not enable a second Tavus voice path.
- Available Tavus faces come from `GET /api/roleplay/faces`. Session creation uses `POST /api/roleplay/sessions`; always end with `DELETE /api/roleplay/sessions/{conversation_id}`.
- The roleplay page also ends sessions on tab close/navigation through keepalive/beacon cleanup. Preserve this behavior because Tavus credits are limited and begin metering when the room is created.
- OpenAI voice selection is validated in `Backend/app/agents/roleplay_agent.py` and sent in the roleplay WebSocket query. Permanent preview WAV files live in `frontend/public/audio/roleplay-voices`; regenerate them with `Backend/scripts/generate_roleplay_voice_previews.py` only when needed.
- Local camera and microphone tracks are disabled for the Daily video room; learner microphone audio goes to OpenAI through the existing WebSocket audio path. A missing camera must not block roleplay.
- Keep the live call surface height stable and the transcript internally scrollable so additional messages cannot resize or visually zoom the Tavus video. The transcript sidebar can be hidden without stopping transcript collection.

## TARS interaction reference
- The browser implementation in `LabCoach.tsx` owns the reference interaction: pointer overlay, `[POINT]`→selector mapping, quadratic-bezier arc flight (`animateBezierFlightArc`), streaming speech bubble, and pulsing focus.
