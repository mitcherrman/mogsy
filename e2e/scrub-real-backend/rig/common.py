"""Shared constants for the local Scrub real-backend playtest rig (DEV ONLY).

Nothing here is product code and no Playwright config includes it. The rig serves
the backend's REAL FastAPI app from a read-only worktree against a scratch SQLite
DB, so an `admin.scrub` bot match can be played end to end in the real arena
(see ../README.md). Modelled on e2e/r3c-real-backend/rig.

  SC_BACKEND_WORKTREE  a worktree of the backend branch under test (never modified)
  SC_RIG_DATA          where the scratch DB, secret and run dir live (never inside a repo)
  SC_BACKEND_PORT      default 8077
"""
import os
import secrets

WORKTREE = os.path.normpath(os.environ["SC_BACKEND_WORKTREE"])
DATA = os.path.normpath(os.environ["SC_RIG_DATA"])
RUN_DIR = os.path.join(DATA, "run")
DB_PATH = os.path.join(DATA, "scratch_ranked.db")
SECRET_FILE = os.path.join(DATA, "secret.txt")
PORT = int(os.environ.get("SC_BACKEND_PORT", "8077"))
API = f"http://127.0.0.1:{PORT}"

TEST_USER_ID = "7e570000-0000-4000-8000-0000000000a1"
TEST_USER_EMAIL = "playtest@local.invalid"


def ensure_dirs() -> None:
    os.makedirs(RUN_DIR, exist_ok=True)
    link = os.path.join(RUN_DIR, "assets")
    target = os.path.join(WORKTREE, "assets")
    if not os.path.exists(link) and os.path.isdir(target):
        os.symlink(target, link, target_is_directory=True)


def secret() -> str:
    os.makedirs(DATA, exist_ok=True)
    if not os.path.exists(SECRET_FILE):
        with open(SECRET_FILE, "w") as fh:
            fh.write(secrets.token_hex(32))
    return open(SECRET_FILE).read().strip()
