# Ctrl+Teach backend

## Tavus role-playing renderer

The `/role-playing` experience keeps Tars/OpenAI as the conversation brain and
streams its 24 kHz PCM output to a Tavus Echo PAL for synchronized Phoenix face
rendering. Configure these backend-only values in `.env`:

```env
TAVUS_API_KEY=your-tavus-api-key
TAVUS_FACE_ID=your-stock-or-custom-face-id
TAVUS_PAL_ID=
```

`TAVUS_PAL_ID` is optional. When omitted, the authenticated
`POST /api/roleplay/sessions` route creates and caches an Echo PAL using the
configured face. The browser receives only the private conversation URL and
short-lived Daily meeting token. `DELETE /api/roleplay/sessions/{id}` ends the
room immediately so unused Tavus minutes are not consumed.

## Tars visual-grounding trials

Tars's production visual locator defaults to `gpt-5.5` with `medium`
reasoning effort. Configure it in
`.env` with `TARS_VISUAL_LOCATOR_MODEL`; candidate trial models are listed in
`TARS_VISUAL_LOCATOR_TRIAL_MODELS`.

To compare models on the same labeled screenshots, create a JSON manifest using
the format documented in `scripts/tars_locator_trial.py`, then run:

```bash
.venv/bin/python scripts/tars_locator_trial.py --manifest path/to/cases.json
```

The command reports success count and mean pixel error per model. Trial images
are not saved by the backend automatically.
