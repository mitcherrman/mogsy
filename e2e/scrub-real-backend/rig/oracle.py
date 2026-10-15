"""QA ORACLE (not a product path): read a frozen segment's private payload straight
from the scratch DB so a driver can lock the canonical or a deliberately wrong
checkpoint. Prints JSON {canonical, tokens, lane, target_level, round_id}."""
import sys, os, json, sqlite3
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

match_id, rn = sys.argv[1], int(sys.argv[2])
conn = sqlite3.connect(C.DB_PATH)
conn.row_factory = sqlite3.Row
row = conn.execute(
    "SELECT segment_private_json FROM ranked_rounds WHERE match_id=? AND round_number=?",
    (match_id, rn)).fetchone()
p = json.loads(row["segment_private_json"])
print(json.dumps({k: p[k] for k in ("canonical", "tokens", "lane", "target_level", "round_id")}))
