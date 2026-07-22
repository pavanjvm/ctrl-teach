# Ctrl+Teach TODO

Focused backlog for learner skill profiles and learning memory.

## Skill Profile

**Status:** In progress

### Current foundation

- `frontend/src/lib/skillProfile.ts` derives strengths, building skills, focus areas, confidence, and evidence counts.
- `frontend/src/lib/learner.tsx` updates the profile from lesson, assessment, lab, roleplay, and reflection memories.
- Dashboard recommendations and `/profile` already consume the derived profile.

### Work

- [ ] Define canonical skill IDs, labels, aliases, and parent-child relationships so equivalent skills merge reliably.
- [ ] Move profile derivation into a versioned shared contract that backend jobs and frontend views calculate consistently.
- [ ] Separate observed evidence from inferred status; every strength or focus area must link to supporting activity evidence.
- [ ] Add recency weighting and confidence decay without erasing historical achievements.
- [ ] Prevent repeated retries, duplicate events, or one course from inflating skill confidence.
- [ ] Track skill progression over time instead of exposing only the latest aggregate.
- [ ] Add course, lesson, assessment, lab, and roleplay filters to the skill evidence view.
- [ ] Use focus areas to recommend specific review lessons, practice tasks, and assessments with a visible reason.
- [ ] Add accessibility-friendly empty, low-confidence, conflicting-evidence, and stale-profile states.
- [ ] Add deterministic unit tests for classification thresholds, recency, aliases, recovery evidence, and duplicate handling.

### Acceptance

- [ ] Every displayed skill status has inspectable evidence and a confidence explanation.
- [ ] The same evidence produces the same profile on every device.
- [ ] Weak or stale evidence cannot label a skill as a strength.
- [ ] Recommendations change when verified evidence changes.

## Learning Memory

**Status:** In progress

### Current foundation

- Learning memories capture interests, completed lessons, assessments, labs, roleplays, reflections, and browser-lab recoveries.
- Memories are sanitized, deduplicated, capped, stored locally, and mirrored under `Profile.preferences.ctrlteach.learnerMemory`.
- `/profile` exposes the memory timeline and supports clearing local memory.

### Work

- [ ] Replace profile-JSON storage with an owner-scoped, versioned SQLite memory model.
- [ ] Add authenticated list, create, upsert, delete, clear, and export endpoints.
- [ ] Implement cross-device conflict resolution using stable activity IDs and server timestamps.
- [ ] Make clear-memory delete both server and local copies, with explicit confirmation and audit coverage.
- [ ] Record source, provenance, evidence type, confidence, and schema version for every memory.
- [ ] Avoid storing raw transcripts or sensitive free text unless required and explicitly disclosed.
- [ ] Add retention controls for event limits, expiration, archival, and user-requested deletion.
- [ ] Generate bounded server-side memory summaries for Tars, course generation, and recommendations.
- [ ] Treat memory as personalization context only; it must never override system instructions, course truth, lab criteria, or authorization.
- [ ] Defend memory ingestion and prompt summaries against untrusted text and prompt injection.
- [ ] Let learners inspect, remove, and correct individual memories.
- [ ] Add backend ownership, sanitization, deduplication, retention, and deletion tests.
- [ ] Add frontend tests for sync, offline recovery, conflicts, empty states, and clear-memory behavior.

### Acceptance

- [ ] Memory persists across devices without duplicate events.
- [ ] Learners can see why a memory exists and remove it permanently.
- [ ] Tars receives only bounded, relevant, owner-scoped memory context.
- [ ] Deleted memories no longer affect skill profiles or recommendations.
