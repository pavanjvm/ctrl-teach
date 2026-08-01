# Ctrl+Teach backend

## Dependency management

The backend uses `uv` with dependencies declared in `pyproject.toml` and fully
resolved in `uv.lock`.

```bash
uv sync --locked
uv run uvicorn app.main:app --port 8000 --loop asyncio
```

Keep course-generation development on the single-process command above. The
Uvicorn reload subprocess can stall outbound TLS requests on macOS; restart the
API manually after backend edits.

Add or remove dependencies with `uv add <package>` and `uv remove <package>`,
then commit both `pyproject.toml` and `uv.lock`.

## Admin course studio

Admin accounts use the same signed bearer sessions as learners, with an
additional database role checked on every admin API request. Seed an admin in
`apps/api/.env` (use a strong local password):

```env
APP_USERS=[{"username":"admin","password":"replace-this","name":"Course Admin","is_admin":true}]
```

The account signs in at `/admin/login`. Platform courses are stored separately
from learner-owned generated courses. Admins can save drafts, publish them to
the shared learner catalog, and unpublish them without deleting course data.

For local product demos, `apps/api/.env.local` can override `APP_USERS` without
changing the main secret-bearing `.env`. A seeded entry may opt into
`"force_password": true` when a fixed demo password must be restored on each
startup. `"force_role": true` similarly restores the declared admin role. Do
not use short demo passwords outside local testing.

## Tavus role-playing renderer

The `/role-playing` experience keeps Tars/OpenAI as the conversation brain and
streams its 24 kHz PCM output to a Tavus Echo PAL for synchronized Phoenix face
rendering. Configure these backend-only values in `.env`:

```env
TAVUS_API_KEY=your-tavus-api-key
TAVUS_FACE_ID=
TAVUS_PAL_ID=
TAVUS_MAX_CALL_DURATION_SECONDS=600
TAVUS_PARTICIPANT_LEFT_TIMEOUT_SECONDS=5
TAVUS_PARTICIPANT_ABSENT_TIMEOUT_SECONDS=30
```

`TAVUS_FACE_ID` is optional and acts as the preselected face in Role Playing;
learners can choose from the ready faces returned by the Tavus account.
`TAVUS_PAL_ID` is also optional. When omitted, the authenticated
`POST /api/roleplay/sessions` route creates and caches an Echo PAL using the
selected or default face. The browser receives only the private conversation URL and
short-lived Daily meeting token. `DELETE /api/roleplay/sessions/{id}` ends the
room immediately so unused Tavus minutes are not consumed. Tavus also receives
a 10-minute hard cap, a 5-second participant-left timeout, and a 30-second
never-joined timeout by default, protecting credits if the browser crashes.
Tab and page exits additionally queue a beacon cleanup request that does not
depend on an unload-time CORS preflight.

## Tars visual-grounding trials

Tars's production visual locator defaults to `gpt-5.6-sol` with the
`priority` service tier and `medium` reasoning effort. Configure these in
`.env` with `TARS_VISUAL_LOCATOR_MODEL`, `TARS_VISUAL_LOCATOR_SERVICE_TIER`,
and `TARS_VISUAL_LOCATOR_REASONING_EFFORT`; candidate trial models are listed
in `TARS_VISUAL_LOCATOR_TRIAL_MODELS`.

Realtime voice sessions use `gpt-realtime-2.1` with `high` reasoning effort by
default. Override this with `REALTIME_REASONING_EFFORT` (`minimal`, `low`,
`medium`, `high`, or `xhigh`) when latency or task complexity calls for a
different tradeoff.

To compare models on the same labeled screenshots, create a JSON manifest using
the format documented in `scripts/tars_locator_trial.py`, then run:

```bash
uv run python scripts/tars_locator_trial.py --manifest path/to/cases.json
```

The command reports success count and mean pixel error per model. Trial images
are not saved by the backend automatically.
