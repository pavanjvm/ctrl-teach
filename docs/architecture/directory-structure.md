# Repository Directory Structure

The repository groups deployable products under `apps/`, keeps shared project
documentation under `docs/`, and keeps repository-wide utilities under
`scripts/`. This makes application ownership explicit without creating empty
shared packages that have no maintained contract.

## Repository Boundaries

- `apps/api/` is the FastAPI product: application code, API tests, Python
  dependency metadata, API Dockerfile, and API-specific maintenance scripts.
- `apps/web/` is the Next.js product: routes, frontend components, client
  state, static assets, Node dependency metadata, and web Dockerfile.
- `apps/extension/` is the Chrome Manifest V3 companion. Its manifest and
  assets remain together because Chrome resolves them by relative path.
- `docs/` contains durable architecture, planning, and setup documentation.
- `scripts/` contains repository-level utilities that are not owned by one app.

## Web Application

- `apps/web/src/app/` contains Next.js routes, layouts, and route-specific CSS.
- `apps/web/src/components/auth/` contains authentication UI and providers.
- `apps/web/src/components/learning/` contains learner workspace modes,
  progression UI, and lesson-scoped experiences.
- `apps/web/src/components/labs/` contains hands-on practice surfaces and the
  TARS coaching overlay.
- `apps/web/src/components/realtime/` contains the whiteboard and transcript
  UI used by live tutoring.
- `apps/web/src/components/tars/` contains global TARS integration UI.
- `apps/web/src/components/courses/` and `apps/web/src/components/admin/`
  contain course presentation and authoring UI.
- `apps/web/src/components/ui/` contains reusable presentational primitives.
- `apps/web/src/components/legacy/` holds intentionally retained, unreferenced
  legacy components. Do not add new production code there.

`apps/web/src/lib/` follows the same feature boundaries:

- `courses/` owns course catalog, generated course helpers, and authoring
  utilities.
- `learning/` owns learner state, skill profiling, recommendations, and lab
  scene definitions.
- `realtime/` owns whiteboard layout helpers.
- `tars/` owns TARS state, whiteboard bridge, wake-template, and teaching
  profile helpers.
- `admin/` contains temporary admin mock data until it is replaced by API data.

## API and Extension

- `apps/api/app/` remains layer-oriented: `routers/`, `services/`, `agents/`,
  `auth/`, `middleware/`, `tools/`, and shared infrastructure at the app root.
- `apps/api/tests/` holds backend tests close to the API code they verify.
- `apps/extension/` remains intentionally flat because Chrome extension
  manifests reference its assets by relative path.

## Learning-Path Progress

Learning-path progression is server-derived. The `course_lesson_progress` table
records valid lessons completed in path-backed platform or generated courses.
The learner provider keeps local progress responsive, hydrates these records at
sign-in, and submits newly completed lessons to
`/api/learning-paths/progress/lessons`. The backend validates the course and
lesson IDs, derives full-course completion from its own records, and only then
updates the matching path-node mastery and unlocks the next node.

## Contribution Rules

1. Keep route files in `app/`; put reusable feature UI in the matching
   `components/<feature>/` directory.
2. Put feature state, domain helpers, and API adapters in `lib/<feature>/`.
3. Use the `@/` alias for web imports rather than upward relative paths.
4. Keep behavior-preserving moves separate from feature changes whenever
   possible, so branch merges stay low-conflict.
5. Do not place secrets or environment-specific values in source files. Use
   `apps/api/.env.example` and `apps/web/.env.local` as the configuration
   contracts.
6. Add a shared package only after code has a maintained contract and at least
   two applications depend on it; do not create a catch-all `shared/` folder.
