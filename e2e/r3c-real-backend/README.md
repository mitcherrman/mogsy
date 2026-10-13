# Reconstruct R3C — live real-backend certification rig (DEV ONLY)

R3B's rig (`e2e/r3b-real-backend/`), copied and extended for R3C. Nothing here ships and no
Playwright config includes it.

**R3C additions**
* `play-match.mjs`: records the timed-out board's state during the hold (`timeoutHold[].board`:
  phase, `data-timed-out`, socket tokens/states/marks, shown "your pick" badges, verdict, breakdown
  rows, equation, generic stamp); `--reload-final hold|outro|end` reloads the FINAL round at that
  presentation boundary and records where the page lands, whether the reveal or the outro replayed,
  and the presented-match hint; an outro screenshot (`s3-4-outro`).
* `sampler.mjs`: the arena grid row's own overflow (`gridOv`) and the outro's result/score boxes.
* `layout.mjs`: per run, the header height range and every change of it, the board/rail jump at
  each change, the grid overflow, the outro box vs the viewport, page scroll.
* `rail-contrast.mjs`: WCAG contrast of every text run on the rails, the header plate and the phone
  match bar, on painted pixels, both app themes (needs only a vite server; uses the dev probe).
* `matrix.sh <r3c|base> <outdir> <play-match args…>`: one match against the chosen stack.

## What is real

The backend is the real `api_server:app` served with **`lifespan="off"`** (no startup migration ever
runs, MG-P1's rune convergence included) against a **scratch SQLite DB** under `RC_RIG_DATA` (the
rig refuses any other path). Only `routes._auth._owner_state` is replaced. The frontend is the real
arena under the E2E identity seam (`VITE_E2E_AUTH=1`, dummy Supabase URL). Matches are created
server-side and the page is opened at `/quiz/ranked` with no router state, i.e. the discovery path.

## Run

```bash
export RC_SCRATCH=<scratch dir outside any repo>
# per stack: scratch DB, then the backend (8187 = R3C, 8188 = baseline)
RC_BACKEND_WORKTREE=<backend worktree> RC_RIG_DATA=$RC_SCRATCH/rig-r3c python rig/setup_db.py
RC_BACKEND_WORKTREE=<backend worktree> RC_RIG_DATA=$RC_SCRATCH/rig-r3c RC_BACKEND_PORT=8187 python rig/serve.py
# a vite wired to it (8151 = R3C, 8152 = baseline), with the rollup WASM hook if Smart App Control blocks rollup
VITE_COMBAT_API_URL=http://127.0.0.1:8187 VITE_E2E_AUTH=1 VITE_SUPABASE_URL=http://127.0.0.1:1 \
  VITE_SUPABASE_PUBLISHABLE_KEY=dummy node node_modules/vite/bin/vite.js --port 8151 --strictPort
bash e2e/r3c-real-backend/matrix.sh r3c $RC_SCRATCH/out --vp 1440x900 --plan timeout,right,wrong --reload-final hold
node e2e/r3c-real-backend/layout.mjs $RC_SCRATCH/out
node e2e/r3c-real-backend/analyse.mjs $RC_SCRATCH/out     # R3B's pacing analysis (done -> outro)
```

## Traps

* One active match per user: run matches on the SAME stack sequentially (two stacks may run in parallel).
* A `--reload-final` run loses the in-page sampler with the page, so it writes no frames; use it for
  landing/replay evidence and a separate run for geometry.
* `/quiz/ranked` takes several seconds to first render under the dummy-Supabase identity (INT1).
* R3A's and R3B's traps all apply (`admin:false` persona, the bot settles inline).
