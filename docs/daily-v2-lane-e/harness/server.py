"""LOCAL-ONLY Daily three-acts playtest backend (lane E scratch; never committed).

Runs the backend worktree's real app against a COPY of the canonical DB with:
  * DAILY_THREE_ACTS_V2=owner, serveable scope (owner gate 9) and lane E's
    launch config (strict caps 1/act 2/day + pass-5 quotas; no override);
  * E_DB selects the database COPY (default: ../dbcopy/lol_calc.db); point it
    at a dev copy that also holds the takedown rows to play those too;
  * HS256 test tokens (SUPABASE_ALLOW_HS256 + a random per-run secret), the
    repo's own e2e path; SUPABASE_URL is removed, so nothing reaches Supabase;
  * require_admin overridden to the local test owner (the real check is a
    production Supabase owner RPC, which a local test identity cannot pass);
  * platform_policy.queue_mode_enabled -> True (it reads Supabase).
Writes the persona JSON (token + test user) to persona.json beside this file.
"""
import json
import os
import secrets
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
WT = r"C:\Users\mlmit\OneDrive\Desktop\League_Combat_Simulator\.worktrees\daily-v2-e"
DB = os.environ.get("E_DB") or str(HERE.parent / "dbcopy" / "lol_calc.db")
PORT = int(os.environ.get("E_PORT", "8711"))
OWNER = "0e2e7a5e-0000-4000-8000-00000000e2e1"   # local test owner id
SECRET = secrets.token_hex(32)

for key in [k for k in os.environ if k.startswith("SUPABASE_")]:
    os.environ.pop(key)
os.environ.update({
    "LOL_CALC_DB_PATH": DB,
    "RANKED_PUBLIC_ENABLED": "1",
    "RANKED_FORMATS_ENABLED": "1",
    "RANKED_RATELIMIT_ENABLED": "0",
    "RANKED_MODULE_ITEM_COST_DUEL_ENABLED": "1",
    "RANKED_SHARED_BANK_ENABLED": "1",
    "RANKED_MASTERY_SLICES_ENABLED": "1",
    "RANKED_BOT_ENABLED": "1",
    "DAILY_THREE_ACTS_V2": "owner",
    "DAILY_THREE_ACTS_CERT_SCOPE": "serveable",
    "SUPABASE_ALLOW_HS256": "1",
    "SUPABASE_JWT_SECRET": SECRET,
    "SUPABASE_VERIFY_ISSUER": "0",
    "MOGSY_ADMIN_USER_IDS": OWNER,
})
os.chdir(WT)
sys.path.insert(0, WT)

import jwt  # noqa: E402
import uvicorn  # noqa: E402

now = int(time.time())
token = jwt.encode({"sub": OWNER, "aud": "authenticated", "role": "authenticated",
                    "is_anonymous": False, "email": "owner@e2e.test",
                    "iat": now, "exp": now + 12 * 3600}, SECRET, algorithm="HS256")
(HERE / "persona.json").write_text(json.dumps({
    "token": token, "admin": True,
    "user": {"id": OWNER, "email": "owner@e2e.test", "is_anonymous": False}}))

from api_server import app  # noqa: E402
from routes._auth import AdminPrincipal, require_admin  # noqa: E402
from services import platform_policy  # noqa: E402

app.dependency_overrides[require_admin] = \
    lambda: AdminPrincipal(user_id=OWNER, email="owner@e2e.test")
platform_policy.queue_mode_enabled = lambda mode: True

uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
