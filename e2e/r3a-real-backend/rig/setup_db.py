"""Create (or wipe+recreate) the scratch Ranked DB. Never touches lol_calc.db.

  python setup_db.py          # create if missing, migrate + seed (idempotent)
  python setup_db.py --wipe   # delete the scratch DB first (stop the server!)
Run from anywhere; chdirs into the scratch run dir so stray files stay there.
"""
import os, sys, sqlite3

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
    print("wiped", C.DB_PATH)

assert os.path.abspath(C.DB_PATH).lower().startswith(os.path.abspath(C.DATA).lower()), "refusing: not scratch"

from migrate_add_ranked_public import migrate
from migrate_add_study_hall_attempts import migrate as migrate_study_hall
from reconstruct_fixture_support import seed_recipe_graph

migrate(C.DB_PATH)
migrate_study_hall(C.DB_PATH)
conn = sqlite3.connect(C.DB_PATH)
try:
    seed_recipe_graph(conn)
    n = conn.execute("SELECT COUNT(*) FROM item_canonical").fetchone()[0]
    e = conn.execute("SELECT COUNT(*) FROM item_build_components").fetchone()[0]
    t = len(conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall())
    print(f"scratch db ready: {C.DB_PATH}  tables={t} item_canonical={n} build_edges={e}")
finally:
    conn.close()
