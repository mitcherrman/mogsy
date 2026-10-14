"""Shared constants for the Role Challenge real-backend acceptance rig (DEV ONLY).

Nothing here is product code. The rig serves the backend's REAL FastAPI app from
a backend worktree against a SCRATCH SQLite DB so a Role Challenge can be
selected, started, played to completion, resumed and retried in the real arena.

  RC_BACKEND_WORKTREE  backend worktree at the candidate commit (never modified)
  RC_RIG_DATA          where the scratch DB, secret and run dir live (never a repo)
  RC_BACKEND_PORT      default 8190
"""
import os
import secrets
import subprocess

BE = os.path.dirname(os.path.abspath(__file__))
WORKTREE = os.path.normpath(os.environ["RC_BACKEND_WORKTREE"])
DATA = os.path.normpath(os.environ["RC_RIG_DATA"])
RUN_DIR = os.path.join(DATA, "run")          # backend cwd (assets link lives here)
DB_PATH = os.path.join(DATA, "scratch_role_challenge.db")
SECRET_FILE = os.path.join(DATA, "secret.txt")
PORT = int(os.environ.get("RC_BACKEND_PORT", "8190"))
API = f"http://127.0.0.1:{PORT}"

#: Two local accounts. Entitlement is the only thing that differs.
FREE_USER_ID = "7e570000-0000-4000-8000-0000000000f1"
PREMIUM_USER_ID = "7e570000-0000-4000-8000-0000000000a2"
PERSONAS = {
    "free": {"sub": FREE_USER_ID, "email": "free@local.invalid", "premium": False},
    "premium": {"sub": PREMIUM_USER_ID, "email": "premium@local.invalid", "premium": True},
}


def ensure_dirs() -> None:
    os.makedirs(RUN_DIR, exist_ok=True)
    link = os.path.join(RUN_DIR, "assets")
    target = os.path.join(WORKTREE, "assets")
    if not os.path.exists(link) and os.path.isdir(target):
        if os.name == "nt":
            subprocess.run(["cmd", "/c", "mklink", "/J", link, target], check=True,
                           stdout=subprocess.DEVNULL)
        else:
            os.symlink(target, link, target_is_directory=True)


def assert_scratch(path: str) -> None:
    if not os.path.abspath(path).lower().startswith(os.path.abspath(DATA).lower()):
        raise SystemExit(f"refusing: {path} is not under RC_RIG_DATA")
    if os.path.basename(path).lower() == "lol_calc.db":
        raise SystemExit("refusing: the rig never opens lol_calc.db")


def secret() -> str:
    os.makedirs(DATA, exist_ok=True)
    if not os.path.exists(SECRET_FILE):
        with open(SECRET_FILE, "w") as fh:
            fh.write(secrets.token_hex(32))
    return open(SECRET_FILE).read().strip()
