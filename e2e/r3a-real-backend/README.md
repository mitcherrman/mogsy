# Reconstruct R3A — real-backend match driver (DEV ONLY)

Plays a full three-segment `admin.reconstruct` bot match in the **real** Ranked
arena (`/quiz/ranked`, production `QuizRankedMatch` → `CanonicalArena`) against a
**local real backend**, sampling every region's bounding box, every scroll
offset and the host's lifecycle attributes on each animation frame and DOM
commit. Nothing here ships: no product file imports it, and it is not part of
any Playwright config.

## What is real, what is replaced

| Real | Replaced |
|---|---|
| backend `api_server:app` (routes, service, `reconstruct` module, grading, persistence, JWT verification) | only `routes._auth._owner_state` (the Supabase owner RPC), so the one local test user is "owner" |
| the arena, the module renderer, the controller and its polling | `VITE_SUPABASE_URL` is a dummy; the frontend's E2E identity seam (`VITE_E2E_AUTH=1`) supplies the persona |

The backend is served from a **read-only worktree of `origin/master`** against a
**scratch SQLite DB** created by `rig/setup_db.py`; the 5.9 GB certified DB is
never opened. The recipe catalogue comes from
`fixtures/reconstruct_recipe_graph_rev4065930.json`.

## Run

```bash
# 0. backend worktree (once)            git worktree add --detach <path> origin/master
export RC_BACKEND_WORKTREE=<path>
# 1. scratch DB + server (leave running)
python e2e/r3a-real-backend/rig/setup_db.py --wipe
python e2e/r3a-real-backend/rig/serve.py            # 127.0.0.1:8077
# 2. a vite wired to it
VITE_COMBAT_API_URL=http://127.0.0.1:8077 VITE_E2E_AUTH=1 \
VITE_SUPABASE_URL=http://127.0.0.1:1 VITE_SUPABASE_PUBLISHABLE_KEY=dummy \
  node node_modules/vite/bin/vite.js --port 8132 --strictPort
# 3. play (each run wipes the DB and creates a fresh match)
node e2e/r3a-real-backend/play-match.mjs --vp 1440x900 --plan right,wrong,wrong --out r3a-out
node e2e/r3a-real-backend/analyse.mjs r3a-out
```

`--plan` is the outcome per segment (`right` builds the canonical recipe, read
from the backend's own fixture; `wrong` swaps one part for a decoy).
`--latency <ms>` delays every API response, to see how the host's timing
behaves on a real network.

## Traps

* One active match per user: `RANKED_ACTIVE_MATCH_EXISTS` until it finishes or
  `setup_db.py --wipe` runs (the driver wipes first).
* A segment is not answerable for ~4.5 s after creation (`RANKED_CARD_NOT_OPEN`);
  the driver waits for `[data-testid="reconstruct-phase"]` to lose `data-not-open`.
* The persona must have `admin: false` (`admin: true` loops `AdminAuthProvider`
  under the E2E seam — pre-existing).
* The bot is driven inline on every read and write: there is no live "locked,
  awaiting the opponent" window to observe.
* The installed Playwright browser can lag `playwright-core`; set
  `RC_PLAYWRIGHT_EXE` to a chrome-headless-shell that works.
