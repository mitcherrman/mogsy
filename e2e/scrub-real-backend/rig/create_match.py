"""Create an admin.scrub bot match exactly like the admin page's PresetLaunch:
POST /api/ranked/queue {match_with_bot:true, preset:"admin.scrub"} (+bearer).
Prints the match id on stdout (last line). `--as-user` posts as a NON-owner to
prove the preset is refused (exit 0 and prints the status line)."""
import sys, os, json, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C
from mint_token import mint


def post(token, preset="admin.scrub"):
    body = json.dumps({"match_with_bot": True, "preset": preset}).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(C.API + "/api/ranked/queue", data=body, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


if __name__ == "__main__":
    if "--anonymous" in sys.argv:
        status, data = post(None)
        print(json.dumps({"status": status, "body": data}))
        sys.exit(0)
    status, data = post(mint())
    print(json.dumps({"status": status, "body": data}, indent=1), file=sys.stderr)
    if status != 200:
        sys.exit(1)
    print(data["payload"]["match_id"])
