# Scrub / Chronoscope S3 — real-backend browser smoke (DEV ONLY)

Modelled on `e2e/r3c-real-backend/`. Nothing here ships and no Playwright config includes it.

## What is real

The backend is the real `api_server:app` served with **`lifespan="off"`** (no startup migration or
hook ever runs) against a **scratch SQLite DB** under `SC_RIG_DATA`, created by the existing
`migrate_add_ranked_public.migrate` only (`setup_db.py` refuses any path outside `SC_RIG_DATA`).
Routes, the Ranked service, `scrub.v1`, the wave/XP authority, grading, persistence and HS256 JWT
verification are all real. Only `routes._auth._owner_state` (the Supabase owner RPC) is replaced;
`SC_OWNER=0` serves a **non-owner** to prove the preset refusal over real HTTP.
The frontend is the real arena under the dev-only E2E identity seam (`VITE_E2E_AUTH=1`, dummy
Supabase URL). The match is created server-side with the exact body the admin
`PresetLaunch` posts (`{"match_with_bot":true,"preset":"admin.scrub"}`) and the page is opened at
`/quiz/ranked` (the discovery path).

`rig/oracle.py` reads the frozen private payload from the scratch DB so the driver can lock the
canonical or the farthest-wrong checkpoint. It is a QA oracle, not a product path.

## Run

```bash
export SC_BACKEND_WORKTREE=<backend worktree> SC_RIG_DATA=<scratch dir outside any repo>
export SC_BACKEND_PORT=8187 SC_PYTHON=<python with the backend requirements> SC_CHROME=<chromium>
python e2e/scrub-real-backend/rig/setup_db.py --wipe
python e2e/scrub-real-backend/rig/serve.py &            # real backend; SC_OWNER=0 for a non-owner
VITE_COMBAT_API_URL=http://127.0.0.1:8187 VITE_E2E_AUTH=1 VITE_SUPABASE_URL=http://127.0.0.1:1 \
  VITE_SUPABASE_PUBLISHABLE_KEY=dummy node node_modules/vite/bin/vite.js --port 8151 --strictPort &
node e2e/scrub-real-backend/play-match.mjs --vp 1280x720 --plan exact,wrong,wrong --out <outdir>
# --motion reduce | --vp 390x844 (real CDP touch) | --axe <axe.min.js> | --reload-after-lock 1
```

A plan entry is `exact`, `wrong` (the checkpoint farthest from the first) or `timeout` (never
locks). Per segment the driver records the pre-lock DOM and wire secrecy, asserts the Lock POST body,
samples every region on every frame, and reads the server's resolved round back.

## Traps

* One active match per user: run matches sequentially. `setup_db.py --wipe` runs per match.
* `/quiz/ranked` takes several seconds to first render under the dummy-Supabase identity.
* The console shows ~80 `ERR_UNSAFE_PORT` / dummy-realtime errors: that is the dummy Supabase URL
  (port 1), not the page. The asset routes are not served (503 / CORS on `/api/assets/*`).
* The admin *shell* does not render under the dev-only E2E **admin** persona: `AdminAuthProvider`
  re-runs on the per-render `ensureAuthorized` the persona returns (an infinite update loop that is
  identical on `main`). The Playtests panel is covered by `AdminShell.areas.test.tsx` and
  `ScrubLaunch.test.tsx`; the launch request is exercised here over real HTTP.
