# Ctrl+Teach backend

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
