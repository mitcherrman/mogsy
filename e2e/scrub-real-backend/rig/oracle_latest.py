"""QA ORACLE: the newest match id in the scratch DB (for the admin-click path, where the
browser, not the rig, creates the match). Prints {"match_id": ...}."""
import sys, os, json, sqlite3
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C
conn = sqlite3.connect(C.DB_PATH)
row = conn.execute("SELECT match_id FROM ranked_matches ORDER BY rowid DESC LIMIT 1").fetchone()
print(json.dumps({"match_id": row[0]}))
