"""UX-4/UX-5: capture REAL E2 series responses for the LiveSeriesTransport contract test.

Plays one whole BO5 over HTTP against a running backend that serves
`/api/admin/dynasty/v2` (E2 revision 2, backend commit bb5bc111). It records
one response per UX state into `src/lib/dynasty/e1/fixtures/e2-live-capture.json`.
Nothing is synthesized: every response is exactly what the server returned.
The script only picks lineups and answers (always option A) and sends the
snapshot's own `next` actions.

Revision-2 states (E2 API §7) are captured too:
  discovery_none / discovery_single / discovery_multiple   GET /series
  create_refused       POST /series {when_unfinished_exists: "refuse"} -> 409 UNFINISHED_SERIES_EXISTS
  objective_settled    the third answer, carrying current_game.objective_results
  objective_settled_retry  the identical third-answer body resent (duplicate: true)

Run it against a FRESH scratch DB (discovery_none needs no unfinished series):

    UX4_API=http://127.0.0.1:8766 UX4_TOKEN=<owner bearer> python -I scripts/dynasty/capture_ux4_e2_live.py

A Baron is offered only when the server qualifies it, so series are started
(new start_key each) until one includes a Baron (at most UX4_ATTEMPTS, default 12).
UX4_POLICY picks the qualification policy (default broad_mid_win, which qualifies
Barons far more often than narrow_early_mid_combo). The token is read from the
environment and never written anywhere.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API = os.environ.get("UX4_API", "http://127.0.0.1:8766").rstrip("/") + "/api/admin/dynasty/v2"
TOKEN = os.environ["UX4_TOKEN"]
POLICY = os.environ.get("UX4_POLICY", "broad_mid_win")
OUT = Path(__file__).resolve().parents[2] / "src" / "lib" / "dynasty" / "e1" / "fixtures" / "e2-live-capture.json"
LINEUP = {"top": "syn_c1_duelist", "jng": "syn_c1_juggernaut", "mid": "syn_c1_artillery", "bot": "syn_c1_longbow", "sup": "syn_c1_guardian"}
_n = 0


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def ok(status, out, what):
    if status != 200:
        raise SystemExit(f"{what} -> {status} {out}")
    return out


def create_body(key, when):
    return {"start_key": key, "qualification_policy": POLICY, "user_preset": "balanced",
            "opponent_preset": "balanced2", "when_unfinished_exists": when}


def send(snap, body):
    status, out = call("POST", f"/series/{snap['series_id']}/actions", body)
    return ok(status, out, body["kind"])


def act(snap, kind, payload):
    global _n
    _n += 1
    body = {"expected_seq": snap["seq"], "action_id": f"ux5cap-{int(time.time())}-{_n:04d}", "kind": kind, "payload": payload}
    return body, send(snap, body)


def play_one(attempt, rec):
    body = create_body(f"ux5-capture-{int(time.time())}-{attempt}", "create")
    snap = ok(*call("POST", "/series", body), "create")
    rec["series_created"] = {"request": body, "response": snap}
    barons = 0
    while snap["phase"] != "completed":
        phase, nxt = snap["phase"], snap["next"]
        if phase == "lineup":
            req, snap = act(snap, "lock_lineup", {"game": nxt["payload"]["game"], "champions": LINEUP})
            rec.setdefault("game_started", {"request": req, "response": snap})
        elif phase == "game":
            p = nxt["payload"]
            steps = 1 if "game_in_progress" not in rec else 60
            req, snap = act(snap, "advance", {"game": p["game"], "machine_seq": p["machine_seq"], "steps": steps})
            rec.setdefault("game_in_progress", {"request": req, "response": snap})
            if snap["phase"] == "objective" and "objective_offered" not in rec:
                rec["objective_offered"] = {"request": req, "response": snap}
            if snap["phase"] == "lineup" and "between_games" not in rec:
                rec["between_games"] = {"request": req, "response": snap}
        elif phase == "objective":
            obj = snap["current_game"]["objective"]
            if obj["state"] == "offered":
                req, snap = act(snap, "open_objective", {"game": nxt["payload"]["game"], "encounter_id": obj["encounter_id"]})
                rec.setdefault("objective_question_1", {"request": req, "response": snap})
                barons += 1
            else:
                enc = obj["encounter"]
                q = next(x for x in enc["questions"] if x["state"] == "current")
                req, snap = act(snap, "answer_objective", {"game": nxt["payload"]["game"], "encounter_id": enc["encounter_id"],
                                                           "question_id": q["question_id"], "option_id": q["options"][0]["option_id"]})
                if enc["answered"] == 0:
                    rec.setdefault("objective_answer_feedback", {"request": req, "response": snap})
                if enc["answered"] == 1:
                    rec.setdefault("objective_answer_2", {"request": req, "response": snap})
                if snap["phase"] != "objective" and "objective_settled" not in rec:
                    rec["objective_settled"] = {"request": req, "response": snap}
                    # The identical body again: E2 answers duplicate: true and never grades twice.
                    rec["objective_settled_retry"] = {"request": req, "response": send(snap, req)}
    rec["series_completed"] = {"request": None, "response": snap}
    return barons


def main():
    rec = {}
    # Discovery and the refuse guard, on a fresh scratch DB.
    none = ok(*call("GET", "/series"), "discover")
    if none["resume"]["reason"] != "none":
        raise SystemExit("the scratch DB already has unfinished series: start from a fresh one")
    rec["discovery_none"] = {"request": None, "response": none}
    first = ok(*call("POST", "/series", create_body(f"ux5-capture-{int(time.time())}-unfinished", "refuse")), "create (refuse, none unfinished)")
    rec["discovery_single"] = {"request": None, "response": ok(*call("GET", "/series"), "discover")}
    refused_body = create_body(f"ux5-capture-{int(time.time())}-refused", "refuse")
    status, refused = call("POST", "/series", refused_body)
    if status != 409 or refused["detail"]["code"] != "UNFINISHED_SERIES_EXISTS":
        raise SystemExit(f"refuse guard -> {status} {refused}")
    rec["create_refused"] = {"request": refused_body, "status": status, "response": refused}
    second = ok(*call("POST", "/series", create_body(f"ux5-capture-{int(time.time())}-second", "create")), "create (explicit)")
    rec["discovery_multiple"] = {"request": None, "response": ok(*call("GET", "/series"), "discover")}
    print(f"unfinished: {first['series_id']} {second['series_id']} (left unfinished on the scratch DB)")

    attempts = int(os.environ.get("UX4_ATTEMPTS", "12"))
    for a in range(attempts):
        run = dict(rec)
        barons = play_one(a, run)
        print(f"attempt {a}: series {run['series_created']['response']['series_id']} "
              f"{run['series_completed']['response']['result']['score']} barons={barons}")
        if barons and "objective_settled" in run and "between_games" in run:
            OUT.write_text(json.dumps({
                "schema": "mogzy.ux4.e2_live_capture.v2",
                "label": "REAL responses from a local backend running E2 revision 2 (bb5bc111) on a scratch DB; questions "
                         "from the read-only Mogzy bank. Not synthesized. Re-capture: scripts/dynasty/capture_ux4_e2_live.py.",
                "lineup": LINEUP, "answers": "always option A", "policy": POLICY,
                "samples": [{"state": k, **v} for k, v in run.items()],
            }, separators=(",", ":"), sort_keys=True), encoding="utf-8")
            print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
            return
    sys.exit("no series with a Baron in the attempt budget")


if __name__ == "__main__":
    main()
