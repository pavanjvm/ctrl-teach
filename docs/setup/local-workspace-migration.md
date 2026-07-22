# Local Workspace Migration

The repository now groups deployable products under `apps/`. Existing local
configuration and runtime data are intentionally not moved by Git because they
may contain credentials or personal test data.

## Move Local State

1. Stop running frontend and backend development servers.
2. Move API configuration from `Backend/.env` to `apps/api/.env`. If present,
   move `Backend/.env.local` to `apps/api/.env.local`.
3. Move web configuration from `frontend/.env.local` to `apps/web/.env.local`.
   If an older local `frontend/.env` exists, move it to `apps/web/.env` only if
   that is the file you intentionally use.
4. Preserve local API state only if it is needed:
   - `Backend/ctrlteach.db` to `apps/api/ctrlteach.db`
   - `Backend/uploads/` to `apps/api/uploads/`

If `DATABASE_URL` or `UPLOADS_DIR` points somewhere else, keep using that
configured location instead of moving the default files.

## Recreate Dependencies

Do not move virtual environments, `node_modules`, or build output. Recreate
them from the lockfiles:

```powershell
cd apps/api
uv sync --locked

cd ../web
npm ci
```

Then run the API from `apps/api` and the web app from `apps/web` using the
commands in the repository `README.md`. Secrets remain ignored and must never
be committed.
