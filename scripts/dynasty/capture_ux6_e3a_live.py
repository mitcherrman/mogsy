"""UX-6: capture REAL E3A management-series responses for the live transport contract test.

Plays one whole E3A BO5 over HTTP against a running backend that serves
`/api/admin/dynasty/v2` with E3A (backend commit bc928207, `WORLDS_DYNASTY_E3A_API.md`).
It records one response per UX state into
`src/lib/dynasty/e1/fixtures/e3a-live-capture.json`. Nothing is synthesized:
every response is exactly what the server returned. The script picks the
preparation plan, a reserve in jungle for game 1, the tactic after each game,
and Baron answers (always option A); otherwise it sends the snapshot's own `next`.

States (E3A API §2 and the refusal table):
  discovery_none                 GET /series on a fresh scratch DB
  created                        POST /series {management_rules, entry_scenario: congested_schedule} -> preparation
  prep_over_budget               4 activities for 3 slots -> 422 OVER_BUDGET
  prep_committed                 rest, VOD review (late), champion practice (mid, artillery) -> lineup game 1
  prep_duplicate                 the identical plan body resent -> duplicate: true, nothing applied twice
  prep_again                     a second plan with a new action id -> 409 WRONG_PHASE
  lineup_locked                  game 1 with the jungle reserve -> game
  stale_action                   an advance quoting an old seq -> 409 STALE_SEQ
  game_published                 the first stage tally of game 1
  objective_*                    a Baron, if the server qualifies one
  tactics                        game 1 settled -> tactics
  lineup_before_tactic           lock_lineup during tactics -> 409 WRONG_PHASE
  tactic_wrong_game              choose_tactic for another game -> 409 WRONG_GAME
  tactic_chosen                  quick review -> lineup game 2
  tactic_duplicate               the identical tactic body resent -> duplicate: true
  lineup_game_2                  (the same response as tactic_chosen, recorded for the draft screen)
  game_2_started                 core five again
  series_completed               the final snapshot (carry_over)
  discovery_single               GET /series with an unfinished E3A series (the fresh-scenario one)
  fresh_preparation, fresh_rest_refused   fresh scenario: rest is ineligible -> 422 ACTIVITY_INELIGIBLE

Run it against a FRESH scratch DB:

    UX6_API=http://127.0.0.1:8767 UX6_TOKEN=<owner bearer> python -I scripts/dynasty/capture_ux6_e3a_live.py

The token is read from the environment and never written anywhere. The run leaves
one unfinished fresh-scenario series on the scratch DB by design.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API = os.environ.get("UX6_API", "http://127.0.0.1:8767").rstrip("/") + "/api/admin/dynasty/v2"
TOKEN = os.environ["UX6_TOKEN"]
POLICY = os.environ.get("UX6_POLICY", "broad_mid_win")
OUT = Path(__file__).resolve().parents[2] / "src" / "lib" / "dynasty" / "e1" / "fixtures" / "e3a-live-capture.json"
RULES = "dynasty.combat_v2.management.rules.e3a"
LINEUP = {"top": "syn_c1_duelist", "jng": "syn_c1_juggernaut", "mid": "syn_c1_artillery", "bot": "syn_c1_longbow", "sup": "syn_c1_guardian"}
PLAN = [{"activity": "rest"}, {"activity": "vod_review", "focus_stage": "late"},
        {"activity": "champion_practice", "player_id": "t_user-mid", "champion": "syn_c1_artillery"}]
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


def refused(status, out, want_status, want_code, what):
    if status != want_status or (out or {}).get("detail", {}).get("code") != want_code:
        raise SystemExit(f"{what}: expected {want_status} {want_code}, got {status} {out}")
    return out


def create_body(key, scenario):
    return {"start_key": key, "qualification_policy": POLICY, "user_preset": "balanced", "opponent_preset": "balanced2",
            "when_unfinished_exists": "create", "management_rules": RULES, "entry_scenario": scenario}


def body_for(snap, kind, payload, seq=None):
    global _n
    _n += 1
    return {"expected_seq": snap["seq"] if seq is None else seq, "action_id": f"ux6cap-{int(time.time())}-{_n:04d}", "kind": kind, "payload": payload}


def post(snap, body):
    return call("POST", f"/series/{snap['series_id']}/actions", body)


def act(snap, kind, payload):
    body = body_for(snap, kind, payload)
    return body, ok(*post(snap, body), kind)


def main():
    rec = {}
    none = ok(*call("GET", "/series"), "discover")
    if none["resume"]["reason"] != "none":
        raise SystemExit("the scratch DB already has unfinished series: start from a fresh one")
    rec["discovery_none"] = {"request": None, "response": none}

    cb = create_body(f"ux6-capture-{int(time.time())}", "congested_schedule")
    snap = ok(*call("POST", "/series", cb), "create")
    assert snap["phase"] == "preparation" and snap["schema_revision"] == 3, snap["phase"]
    rec["created"] = {"request": cb, "response": snap}

    over = body_for(snap, "commit_preparation", {"activities": [{"activity": "rest"}] * 4})
    rec["prep_over_budget"] = {"request": over, "status": 422, "response": refused(*post(snap, over), 422, "OVER_BUDGET", "over budget")}

    req, snap = act(snap, "commit_preparation", {"activities": PLAN})
    rec["prep_committed"] = {"request": req, "response": snap}
    dup = ok(*post(snap, req), "prep duplicate")
    assert dup.get("duplicate") is True and dup["seq"] == snap["seq"], "prep retry must be a duplicate"
    rec["prep_duplicate"] = {"request": req, "response": dup}
    again = body_for(snap, "commit_preparation", {"activities": []})
    rec["prep_again"] = {"request": again, "status": 409, "response": refused(*post(snap, again), 409, "WRONG_PHASE", "second plan")}

    players = dict(snap["lineup"]["suggested_players"], jng="t_user-res-jng")
    req, snap = act(snap, "lock_lineup", {"game": 1, "champions": LINEUP, "players": players})
    rec["lineup_locked"] = {"request": req, "response": snap}
    stale = body_for(snap, "advance", dict(snap["next"]["payload"]), seq=snap["seq"] - 1)
    st, so = post(snap, stale)
    rec["stale_action"] = {"request": stale, "status": st, "response": so}
    if st != 409:
        raise SystemExit(f"stale action -> {st} {so}")

    barons = 0
    game2_locked = False
    while snap["phase"] != "completed":
        phase, nxt = snap["phase"], snap["next"]
        if phase == "lineup":
            g = nxt["payload"]["game"]
            req, snap = act(snap, "lock_lineup", {"game": g, "champions": LINEUP, "players": dict(nxt["payload"]["players"])})
            if not game2_locked:
                game2_locked = True
                rec["game_2_started"] = {"request": req, "response": snap}
        elif phase == "game":
            p = nxt["payload"]
            req, snap = act(snap, "advance", {"game": p["game"], "machine_seq": p["machine_seq"], "steps": 1})
            top = snap["current_game"]["beats"][-1]["beat"] if snap.get("current_game") else None
            if top == "stage_tally" and "game_published" not in rec:
                rec["game_published"] = {"request": req, "response": snap}
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
                if snap["phase"] != "objective" and "objective_settled" not in rec:
                    rec["objective_settled"] = {"request": req, "response": snap}
        elif phase == "tactics":
            g = nxt["payload"]["game"]
            if "tactics" not in rec:
                rec["tactics"] = {"request": None, "response": snap}
                early = body_for(snap, "lock_lineup", {"game": g + 1, "champions": LINEUP, "players": players})
                rec["lineup_before_tactic"] = {"request": early, "status": 409, "response": refused(*post(snap, early), 409, "WRONG_PHASE", "lineup before tactic")}
                wrong = body_for(snap, "choose_tactic", {"game": g + 1, "choice": "none"})
                rec["tactic_wrong_game"] = {"request": wrong, "status": 409, "response": refused(*post(snap, wrong), 409, "WRONG_GAME", "wrong game")}
                req, snap = act(snap, "choose_tactic", {"game": g, "choice": "quick_review"})
                rec["tactic_chosen"] = {"request": req, "response": snap}
                dup = ok(*post(snap, req), "tactic duplicate")
                assert dup.get("duplicate") is True and dup["seq"] == snap["seq"], "tactic retry must be a duplicate"
                rec["tactic_duplicate"] = {"request": req, "response": dup}
            else:
                opts = {o["choice"]: o for o in snap["management"]["decisions"]["tactics"]["options"]}
                choice = "breather" if opts["breather"]["eligible"] else "none"
                req, snap = act(snap, "choose_tactic", {"game": g, "choice": choice})
                rec.setdefault("tactic_breather", {"request": req, "response": snap})
    rec["series_completed"] = {"request": None, "response": snap}

    fb = create_body(f"ux6-capture-{int(time.time())}-fresh", "fresh")
    fresh = ok(*call("POST", "/series", fb), "create fresh")
    rec["fresh_preparation"] = {"request": fb, "response": fresh}
    rest = body_for(fresh, "commit_preparation", {"activities": [{"activity": "rest"}]})
    rec["fresh_rest_refused"] = {"request": rest, "status": 422, "response": refused(*post(fresh, rest), 422, "ACTIVITY_INELIGIBLE", "fresh rest")}
    rec["discovery_single"] = {"request": None, "response": ok(*call("GET", "/series"), "discover")}

    OUT.write_text(json.dumps({
        "schema": "mogzy.ux6.e3a_live_capture.v1",
        "label": "REAL responses from a local backend running E3A (bc928207) on a scratch DB; questions from the read-only "
                 "Mogzy bank. Not synthesized. Re-capture: scripts/dynasty/capture_ux6_e3a_live.py.",
        "lineup": LINEUP, "plan": PLAN, "answers": "always option A", "policy": POLICY,
        "samples": [{"state": k, **v} for k, v in rec.items()],
    }, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    print(f"series {rec['created']['response']['series_id']} {snap['result']['score']} barons={barons}")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    sys.exit(main())
