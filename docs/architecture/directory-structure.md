# Directory Structure

This repository uses a feature-oriented source layout. It keeps route URLs and
backend API contracts stable while making ownership clear for parallel work.

## Frontend

- `frontend/src/app/` contains Next.js routes, layouts, and route-specific CSS.
- `frontend/src/components/auth/` contains authentication UI and providers.
- `frontend/src/components/learning/` contains learner workspace modes,
  progression UI, and lesson-scoped experiences.
- `frontend/src/components/labs/` contains hands-on practice surfaces and the
  TARS coaching overlay.
- `frontend/src/components/realtime/` contains the whiteboard and transcript
  UI used by live tutoring.
- `frontend/src/components/tars/` contains global TARS integration UI.
- `frontend/src/components/courses/` and `frontend/src/components/admin/`
  contain course presentation and authoring UI.
- `frontend/src/components/ui/` contains reusable presentational primitives.
- `frontend/src/components/legacy/` holds intentionally retained, unreferenced
  legacy components. Do not add new production code there.

`frontend/src/lib/` follows the same feature boundaries:

- `courses/` owns course catalog, generated course helpers, and authoring
  utilities.
- `learning/` owns learner state, skill profiling, recommendations, and lab
  scene definitions.
- `realtime/` owns whiteboard layout helpers.
- `tars/` owns TARS state, whiteboard bridge, wake-template, and teaching
  profile helpers.
- `admin/` contains temporary admin mock data until it is replaced by API data.

## Backend and Extension

- `Backend/app/` remains layer-oriented: `routers/`, `services/`, `agents/`,
  `auth/`, `middleware/`, `tools/`, and shared infrastructure at the app root.
- `browser-extension/` remains flat because Chrome extension manifests reference
  its assets by path.

## Contribution Rules

1. Keep route files in `app/`; put reusable feature UI in the matching
   `components/<feature>/` directory.
2. Put feature state, domain helpers, and API adapters in `lib/<feature>/`.
3. Use the `@/` alias for frontend imports rather than upward relative paths.
4. Keep behavior-preserving moves separate from feature changes whenever
   possible, so branch merges stay low-conflict.
5. Do not place secrets or environment-specific values in source files. Use
   `Backend/.env.example` and `frontend/.env.local` as the configuration
   contracts.
