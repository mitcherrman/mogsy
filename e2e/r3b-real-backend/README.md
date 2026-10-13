# Reconstruct R3B — live real-backend timing rig (DEV ONLY)

R3A's real-backend driver (`e2e/r3a-real-backend/`, on `reconstruct/r3a-final-polish`), copied
and extended for the R3B pacing work. Nothing here ships and no Playwright config includes it.

**R3B additions:** a `timeout` outcome in `--plan`; `--reload <segment>` (reconnect during that
segment's hold); a double-pressed Lock with a count of the POSTs it sent; outro and end-screen
regions in the sampler; a server-truth readback after the match (`/result` and every round's stored
`presentation_ms`, outcome and points); `analyse.mjs` writes `summary.json` with the readable-evidence
interval (`done` → swap/outro) and the final-transition geometry.

## What is real

The backend is the real `api_server:app` (routes, service, module, grading, persistence, HS256 JWT).
Only `routes._auth._owner_state` is replaced. It is served with **`lifespan="off"`**, so no
startup migration (including MG-P1's rune convergence) ever runs, against a **scratch SQLite DB**
under `RC_RIG_DATA` (the rig refuses any other path). The frontend is the real arena under the
E2E identity seam (`VITE_E2E_AUTH=1`, dummy Supabase URL).

## Run

```bash
export RC_SCRATCH=<scratch dir outside any repo>
# per stack: scratch DB, then the backend (port 8177 = R3B, 8178 = baseline)
RC_BACKEND_WORKTREE=<backend worktree> RC_RIG_DATA=$RC_SCRATCH/rig-r3b python rig/setup_db.py --wipe
RC_BACKEND_WORKTREE=<backend worktree> RC_RIG_DATA=$RC_SCRATCH/rig-r3b RC_BACKEND_PORT=8177 python rig/serve.py
# a vite wired to it (8141 = R3B, 8142 = baseline)
VITE_COMBAT_API_URL=http://127.0.0.1:8177 VITE_E2E_AUTH=1 VITE_SUPABASE_URL=http://127.0.0.1:1 \
  VITE_SUPABASE_PUBLISHABLE_KEY=dummy node node_modules/vite/bin/vite.js --port 8141 --strictPort
bash e2e/r3b-real-backend/matrix.sh r3b $RC_SCRATCH/out-r3b        # 11 matches
node e2e/r3b-real-backend/analyse.mjs $RC_SCRATCH/out-r3b           # + summary.json
```

## Traps

* A reload that lands after the match completed goes to `/lol`, and the backend then keeps the
  scratch DB open, so the next `--wipe` fails on Windows. The driver falls back to reusing
  the DB (the previous match is complete). Restarting the backend also clears it.
* Windows Smart App Control may block rollup's unsigned native binding. See
  `RECONSTRUCT_R3B_HANDOFF.md` §9 for the session-scoped `@rollup/wasm-node` workaround.
* R3A's traps all apply (one active match per user, `admin:false` persona, the bot settles inline).
