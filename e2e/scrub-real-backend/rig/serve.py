"""Launch the REAL FastAPI app (api_server:app) against the scratch DB.

Real: routes, service, the scrub module, the wave/XP authority, grading,
persistence, JWT verification (HS256). Replaced: ONLY routes._auth._owner_state
(the Supabase owner-state RPC), so the local test user's verified bearer is the
"owner". lifespan is OFF: no startup hook (heavy migrations, registries,
pollers) runs, so nothing but the explicit scratch-DB setup ever touches a schema.
"""
import os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

C.ensure_dirs()
os.chdir(C.RUN_DIR)
sys.path.insert(0, C.WORKTREE)

assert os.path.abspath(C.DB_PATH).lower().startswith(os.path.abspath(C.DATA).lower())
os.environ.update({
    "LOL_CALC_DB_PATH": C.DB_PATH,
    "RANKED_PUBLIC_ENABLED": "1",
    "RANKED_FORMATS_ENABLED": "1",
    "RANKED_RATELIMIT_ENABLED": "0",
    "SUPABASE_JWT_SECRET": C.secret(),
    "SUPABASE_ALLOW_HS256": "1",
    "LIVE_ESPORTS_ENABLED": "0",
    "PRO_STATS_WARMUP": "0",
})
for k in ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY",
          "SUPABASE_ANON_KEY"):
    os.environ.pop(k, None)

import uvicorn
import routes._auth as _auth
import api_server


# SC_OWNER=0 serves the SAME app with an authenticated NON-owner, to prove over
# real HTTP that the preset is refused for everyone but the owner.
_IS_OWNER = os.environ.get("SC_OWNER", "1") != "0"


def _owner_state(token):
    return {"is_owner": _IS_OWNER, "authorized": _IS_OWNER}


_auth._owner_state = _owner_state     # the ONE seam replaced

if __name__ == "__main__":
    print(f"[serve] db={C.DB_PATH}  port={C.PORT}", flush=True)
    uvicorn.run(api_server.app, host="127.0.0.1", port=C.PORT, lifespan="off",
                log_level="warning")
