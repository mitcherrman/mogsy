"""Create (or wipe+recreate) the scratch Ranked DB with the EXISTING migration only.

  python setup_db.py          # create if missing (idempotent)
  python setup_db.py --wipe   # delete the scratch DB first (stop the server!)
Scrub reads no database content (the wave/XP authority is pure), so no seed data
is needed. Never touches lol_calc.db.
"""
import os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

C.ensure_dirs()
os.chdir(C.RUN_DIR)
sys.path.insert(0, C.WORKTREE)
os.environ["LOL_CALC_DB_PATH"] = C.DB_PATH

if "--wipe" in sys.argv:
    for suffix in ("", "-wal", "-shm", "-journal"):
        try:
            os.remove(C.DB_PATH + suffix)
        except FileNotFoundError:
            pass

assert os.path.abspath(C.DB_PATH).lower().startswith(os.path.abspath(C.DATA).lower()), "refusing: not scratch"

from migrate_add_ranked_public import migrate
migrate(C.DB_PATH)
print(f"scratch db ready: {C.DB_PATH}")
