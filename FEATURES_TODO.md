# Ctrl+Teach Feature Backlog

This document tracks product features that are started or planned but are not
yet complete enough to treat as finished. Keep each feature scoped around a
learner outcome, and move an item to **Done** only when its acceptance criteria
and verification work are complete.

## Status Legend

- **Planned**: agreed feature, implementation has not started.
- **In progress**: some production code exists, but the complete workflow is not ready.
- **Blocked**: cannot proceed until the named dependency is resolved.
- **Done**: acceptance criteria, tests, and documentation are complete.

## Priority 1: Learning Path

**Status:** In progress

### Learner outcome

A learner can describe a goal, receive a credible step-by-step learning path,
follow it across sessions, and see the path adapt as they complete work or
struggle with a topic.

### Existing foundation

- `Backend/app/services/learning_path.py` composes grounded study, assessment,
  and roleplay steps from search results.
- `POST /api/discover/path` exposes path composition.
- `GoalPathBuilder` displays the generated result during discovery.
- The `/learn` workspace already renders a course path and tracks lesson progress.
- SQLite already includes a `StudyPlan` model that can be extended or replaced
  through an explicit migration decision.

### Work to complete

- [ ] Persist generated learning paths per user instead of keeping them only in
  transient frontend state.
- [ ] Add owner-scoped create, list, read, update, archive, and delete endpoints.
- [ ] Define one canonical learning-path schema shared by Discover, `/learn`,
  generated courses, and persisted progress.
- [ ] Add a dedicated path overview showing modules, prerequisites, estimated
  time, completion, current step, and the recommended next action.
- [ ] Let learners rename a path, adjust the goal or weekly time budget, reorder
  incomplete steps, and archive paths they no longer want.
- [ ] Preserve completed steps when a path is regenerated or adapted.
- [ ] Use assessment outcomes, lab results, confidence, and elapsed progress to
  recommend review, remediation, or advancement.
- [ ] Support resuming the active path after sign-in on another browser.
- [ ] Distinguish path progress from course completion while allowing a path to
  reference seed courses, generated courses, individual lessons, labs, and
  roleplays.
- [ ] Validate every external resource URL against grounded source results and
  show source/provider information in the UI.
- [ ] Add loading, empty, partial-generation, retry, offline, and archived states.
- [ ] Add analytics events for path creation, step start, completion, adaptation,
  abandonment, and return.

### Acceptance criteria

- [ ] A signed-in learner can create and save a path from a plain-language goal.
- [ ] The saved path appears after refresh and on a separate authenticated device.
- [ ] Completing a linked lesson updates the path without manual refresh.
- [ ] Regenerating an unfinished path never removes completed work.
- [ ] The next recommended step has a visible reason based on the learner's goal
  or evidence of progress.
- [ ] All path endpoints enforce ownership and reject malformed resources.
- [ ] The UI remains usable when generation fails after a partial path is saved.

### Verification

- [ ] Unit tests for schema validation, source filtering, adaptation, and progress merging.
- [ ] API tests for ownership, persistence, archive/delete behavior, and retries.
- [ ] Frontend tests for creation, resume, empty states, and completed-step preservation.
- [ ] Manual responsive check of overview and workspace path panels.

## Priority 2: Custom Tutors

**Status:** In progress

### Learner outcome

A learner can create a tutor with a distinct teaching style, subject focus,
voice, and identity, then reliably use that tutor throughout voice lessons and
future sessions.

### Existing foundation

- `Backend/app/routers/tutors.py` provides owner-scoped SQLite CRUD.
- `/tutors` has creation, filtering, profile, deletion, avatar, personality,
  teaching-style, level, and voice controls.
- `/board?tutor={id}` loads tutor configuration into a realtime session.
- `Backend/app/agents/prompt_builder.py` incorporates tutor configuration into
  agent instructions.

### Work to complete

- [ ] Replace the legacy voice list with the OpenAI Realtime voices supported by
  `Backend/app/agents/roleplay_agent.py`, using the permanent local previews.
- [ ] Add an edit workflow for every tutor field instead of requiring deletion
  and recreation.
- [ ] Validate names, descriptions, subjects, teaching styles, avatar URLs, and
  voice identifiers on both frontend and backend.
- [ ] Convert mutable Pydantic list defaults to `Field(default_factory=list)`.
- [ ] Add a structured tutor instruction profile covering tone, pacing,
  correction style, questioning style, examples, boundaries, and target level.
- [ ] Show a generated instruction preview before the tutor is created.
- [ ] Allow a learner to select a default tutor globally and override it for a
  course or individual session.
- [ ] Carry the selected tutor consistently into Study, board, rich-course voice
  tutoring, labs, assessments, and learning-path recommendations where relevant.
- [ ] Track real session count, last-used time, learner feedback, and rating
  instead of placeholder statistics.
- [ ] Add safe avatar upload with type/size validation and local persistence;
  keep the provided built-in avatars as a no-upload option.
- [ ] Add duplicate, archive, restore, and permanent-delete actions.
- [ ] Provide clear empty, loading, save-error, preview-error, and deleted-tutor states.
- [ ] Decide whether tutor memories are isolated per tutor or shared through the
  learner profile, then document and expose that behavior to the learner.

### Acceptance criteria

- [ ] A signed-in learner can create, edit, duplicate, archive, and restore a tutor.
- [ ] Only valid OpenAI Realtime voices can be saved, previewed, and used live.
- [ ] Selecting a tutor changes the realtime agent's name, teaching behavior,
  level, and voice in a verifiable session.
- [ ] A default tutor persists across refresh and devices.
- [ ] Tutor data and uploaded avatars are inaccessible to other users.
- [ ] Deleting or archiving the active tutor falls back safely to the default
  Ctrl+Teach tutor without breaking a session.
- [ ] Tutor statistics are calculated from real sessions and learner feedback.

### Verification

- [ ] Backend CRUD, validation, ownership, default-tutor, and archive tests.
- [ ] Prompt-builder tests proving tutor configuration changes agent instructions.
- [ ] WebSocket tests proving the selected valid voice reaches the realtime session.
- [ ] Frontend tests for create, edit, preview, duplicate, archive, and error states.
- [ ] Manual end-to-end voice session with two tutors that behave and sound different.

## Suggested Delivery Order

1. Stabilize shared schemas and database persistence for learning paths.
2. Ship saved path overview, resume, and progress synchronization.
3. Add path adaptation after assessments and labs.
4. Normalize custom tutors around supported OpenAI voices and backend validation.
5. Ship tutor editing, defaults, and consistent session integration.
6. Add real tutor statistics, feedback, archive/restore, and memory policy.

## Cross-Feature Decisions

- [ ] Decide whether a learning path stores a tutor ID globally or per step.
- [ ] Define fallback behavior when a referenced tutor, course, lesson, or
  external resource is archived or deleted.
- [ ] Define migration/versioning rules for saved path and tutor schemas.
- [ ] Keep all provider API keys backend-only and enforce owner scoping for every
  new endpoint and stored asset.
- [ ] Update `README.md` and `AGENTS.md` when either feature reaches Done.
