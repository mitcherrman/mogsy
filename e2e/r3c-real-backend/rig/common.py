"""Shared constants for the local Reconstruct real-backend playtest rig (DEV ONLY).

Nothing here is product code. The rig serves the backend's REAL FastAPI app
from a read-only worktree against a scratch SQLite DB, so a Reconstruct bot match
can be played end to end in the real arena (see ../README.md).

  RC_BACKEND_WORKTREE  a worktree of the backend's origin/master (never modified)
  RC_RIG_DATA          where the scratch DB, secret and run dir live
                       (default: <system temp>/rc-r3a-rig; never inside a repo)
"""
import os
import secrets
import subprocess
import tempfile

BE = os.path.dirname(os.path.abspath(__file__))
WORKTREE = os.path.normpath(os.environ["RC_BACKEND_WORKTREE"])
DATA = os.path.normpath(os.environ["RC_RIG_DATA"])
RUN_DIR = os.path.join(DATA, "run")          # backend cwd (assets junction lives here)
DB_PATH = os.path.join(DATA, "scratch_ranked.db")
SECRET_FILE = os.path.join(DATA, "secret.txt")
PORT = int(os.environ.get("RC_BACKEND_PORT", "8077"))
API = f"http://127.0.0.1:{PORT}"

# Fixed UUID of the single local test user (the "owner").
TEST_USER_ID = "7e570000-0000-4000-8000-0000000000a1"
TEST_USER_EMAIL = "playtest@local.invalid"


def ensure_dirs() -> None:
    """The run dir, with `assets` linked to the worktree's static art."""
    os.makedirs(RUN_DIR, exist_ok=True)
    link = os.path.join(RUN_DIR, "assets")
    target = os.path.join(WORKTREE, "assets")
    if not os.path.exists(link) and os.path.isdir(target):
        if os.name == "nt":
            subprocess.run(["cmd", "/c", "mklink", "/J", link, target], check=True,
                           stdout=subprocess.DEVNULL)
        else:
            os.symlink(target, link, target_is_directory=True)


def secret() -> str:
    os.makedirs(DATA, exist_ok=True)
    if not os.path.exists(SECRET_FILE):
        with open(SECRET_FILE, "w") as fh:
            fh.write(secrets.token_hex(32))
    return open(SECRET_FILE).read().strip()
