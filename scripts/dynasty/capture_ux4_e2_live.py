"""UX-4: capture REAL E2 series responses for the LiveSeriesTransport contract test.

Plays one whole BO5 over HTTP against a running backend that serves
`/api/admin/dynasty/v2` (E2, backend commit b022b21a). It records one response
per UX state into `src/lib/dynasty/e1/fixtures/e2-live-capture.json`. Nothing
is synthesized: every response is exactly what the server returned. The
script only picks lineups and answers (always option A) and sends the
snapshot's own `next` actions.

    UX4_API=http://127.0.0.1:8766 UX4_TOKEN=<owner bearer> python -I scripts/dynasty/capture_ux4_e2_live.py

A Baron is offered only when the server qualifies it, so series are started
(new start_key each) until one includes a Baron (at most UX4_ATTEMPTS, default 12).
The token is read from the environment and never written anywhere.
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


def act(snap, kind, payload):
    global _n
    _n += 1
    body = {"expected_seq": snap["seq"], "action_id": f"ux4cap-{int(time.time())}-{_n:04d}", "kind": kind, "payload": payload}
    status, out = call("POST", f"/series/{snap['series_id']}/actions", body)
    if status != 200:
        raise SystemExit(f"{kind} -> {status} {out}")
    return body, out


def play_one(attempt):
    rec = {}
    status, snap = call("POST", "/series", {"start_key": f"ux4-capture-{int(time.time())}-{attempt}",
                                             "qualification_policy": "narrow_early_mid_combo",
                                             "user_preset": "balanced", "opponent_preset": "balanced2"})
    if status != 200:
        raise SystemExit(f"create -> {status} {snap}")
    rec["series_created"] = {"request": None, "response": snap}
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
    rec["series_completed"] = {"request": None, "response": snap}
    return rec, barons


def main():
    attempts = int(os.environ.get("UX4_ATTEMPTS", "12"))
    for a in range(attempts):
        rec, barons = play_one(a)
        print(f"attempt {a}: series {rec['series_created']['response']['series_id']} "
              f"{rec['series_completed']['response']['result']['score']} barons={barons}")
        if barons and "objective_settled" in rec and "between_games" in rec:
            OUT.write_text(json.dumps({
                "schema": "mogzy.ux4.e2_live_capture.v1",
                "label": "REAL responses from a local backend running E2 (b022b21a) on a scratch DB; questions from the "
                         "read-only Mogzy bank. Not synthesized. Re-capture: scripts/dynasty/capture_ux4_e2_live.py.",
                "lineup": LINEUP, "answers": "always option A",
                "samples": [{"state": k, **v} for k, v in rec.items()],
            }, separators=(",", ":"), sort_keys=True), encoding="utf-8")
            print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
            return
    sys.exit("no series with a Baron in the attempt budget")


if __name__ == "__main__":
    main()
