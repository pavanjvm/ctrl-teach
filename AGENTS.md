# Ctrl+Teach — Agent Notes

## Stack
- Frontend: Next.js 15 (App Router, React 19), TypeScript, Tailwind-free (custom CSS + tokens in `src/app/globals.css`), `framer-motion`, `@excalidraw/excalidraw`, `lucide-react`. Luxe Whitespace design language.
- Backend: FastAPI + OpenAI Realtime API (`agents` SDK) + SQLite + Basic auth. See `Backend/README.md`.

## Key commands
- Frontend typecheck: `cd frontend && npx tsc --noEmit -p tsconfig.json`
- Frontend build: `cd frontend && npm run build`
- Frontend dev: `cd frontend && npm run dev`
- Frontend lint: NOT configured (`next lint` requires `eslint` to be installed). Use `tsc --noEmit` for type checking.
- Backend dev: `cd Backend && .venv/bin/uvicorn app.main:app --reload --port 8000`
- Backend import smoke-test: `cd Backend && .venv/bin/python -c "from app.main import app"`

## Env
- Frontend: `frontend/.env.local` → `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`.
- Backend: `Backend/.env` → `OPENAI_API_KEY` (needed for Realtime voice + `/api/discover` course generation).

## Architecture highlights
- `src/lib/learner.tsx` (`LearnerProvider`/`useLearner`): global learner state (onboarding prefs, active course/lesson, XP/streak/confidence/badges). Persisted to `localStorage` + mirrored to backend `Profile.preferences.ctrlteach`.
- `src/lib/courses.ts`: seed course catalog with full module/lesson structures.
- `src/lib/labScenes.ts` + `src/components/LabCoach.tsx`: the hero pixel-precision coaching engine (Clicky-inspired bezier-arc flight + live CSS-selector rect resolution). `src/components/lab/UserStoryBuilder.tsx` is the practice surface.
- Workflow routes: `/onboarding` → `/discover` → `/learn` (workspace) → `/learn/completion`. Login/signup redirect to `/onboarding` (or `/discover` if already onboarded).
- Workspace `/learn`: 3-pane (PathSidebar · stage · CompanionPanel) + bottom ProgressBar with mode switcher (Study/Lab/Assessment/Roleplay). Study mode reuses the realtime voice whiteboard; Lab/Assessment/Roleplay/Companion are scripted-but-interactive for guaranteed demo polish.

## Clicky repo reference
- Cloned at `/Users/pavan/projects/clicky` (macOS Swift menu-bar app). Concepts ported to the browser in `LabCoach.tsx`: pointer overlay, `[POINT]`→selector mapping, quadratic-bezier arc flight (`animateBezierFlightArc`), streaming speech bubble, pulsing focus.