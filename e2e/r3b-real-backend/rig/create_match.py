"""Create an admin.reconstruct bot match exactly like the admin page's PresetLaunch:
POST /api/ranked/queue {match_with_bot:true, preset:"admin.reconstruct"} (+bearer).
Prints the match id on stdout (last line)."""
import sys, os, json, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C
from mint_token import mint

def create(token=None):
    token = token or mint()
    body = json.dumps({"match_with_bot": True, "preset": "admin.reconstruct"}).encode()
    req = urllib.request.Request(C.API + "/api/ranked/queue", data=body, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

if __name__ == "__main__":
    status, data = create()
    print(json.dumps({"status": status, "body": data}, indent=1), file=sys.stderr)
    if status != 200:
        sys.exit(1)
    print(data["payload"]["match_id"])
