"""Launch the REAL FastAPI app (api_server:app) on 127.0.0.1:8077 against the scratch DB.

Real: routes, service, module, grading, persistence, JWT verification (HS256).
Replaced: ONLY routes._auth._owner_state (the Supabase owner-state RPC), so the
local test user's verified bearer is the "owner". lifespan is OFF: the app's
startup hooks (heavy migrations, Mastery registry, LIVE1 poller, analytics
drainer, DB fix-ups) are not needed for Ranked and must not touch anything.
"""
import os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

C.ensure_dirs()
os.chdir(C.RUN_DIR)                 # StaticFiles("assets") resolves via the junction here
sys.path.insert(0, C.WORKTREE)

assert os.path.abspath(C.DB_PATH).lower().startswith(os.path.abspath(C.DATA).lower())
env = {
    "LOL_CALC_DB_PATH": C.DB_PATH,
    "RANKED_PUBLIC_ENABLED": "1",
    "RANKED_FORMATS_ENABLED": "1",
    "RANKED_RATELIMIT_ENABLED": "0",     # layout polling must not 429
    "SUPABASE_JWT_SECRET": C.secret(),
    "SUPABASE_ALLOW_HS256": "1",
    "LIVE_ESPORTS_ENABLED": "0",
    "PRO_STATS_WARMUP": "0",
}
os.environ.update(env)
for k in ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY",
          "SUPABASE_ANON_KEY"):
    os.environ.pop(k, None)          # no Supabase contact possible

import uvicorn
import routes._auth as _auth
import api_server

def _owner_state(token):
    return {"is_owner": True, "authorized": True}

_auth._owner_state = _owner_state     # the ONE seam replaced

if __name__ == "__main__":
    print(f"[serve] db={C.DB_PATH}  port={C.PORT}", flush=True)
    uvicorn.run(api_server.app, host="127.0.0.1", port=C.PORT, lifespan="off",
                log_level="info")
