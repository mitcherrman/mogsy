"""UX-3: capture a branching BO5 fixture from the REAL E1 machine.

Run from the mogsy repo root with the backend worktree on PYTHONPATH:

    PYTHONPATH=<backend>/.worktrees/wd-v2-combat python -I scripts/dynasty/capture_ux3_bo5_fixture.py

(`-I` ignores PYTHONPATH, so the script re-adds it from the environment itself.)

Every frame in the output is ``snapshot(state)`` returned by the backend's
``dynasty.combat_v2.events.snapshot`` after exactly one machine transition
(``start`` / ``advance`` / ``submit_objective_action``). Nothing in the
fixture is computed by this script except the tree shape:

* BO5 convention = E1's own (``qualification_study.bo5``): games are
  independent (no between-game state exists before E3), first to three wins,
  context ``("ux3-bo5", lineup, opponent, game_index)``.
* Qualification policy = ``narrow_early_mid_combo`` (E2A: the provisional
  closeout baseline for E2 prototypes; not owner-approved).
* Legal lineups = E1 study strategies EARLY / SCALING / BALANCED; the opponent
  plays BALANCED_2. These are the only lineups the fixture can serve.
* For an objective encounter all four counts (0..3) are captured, so the
  frontend's E2 contract double can settle whatever the player answers. The
  count still comes from E1's caller-asserted ``submit_objective_action``
  (the E2A trust hole); E2's ``apply_objective_grade`` will replace it.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

for p in reversed(os.environ.get("PYTHONPATH", "").split(os.pathsep)):
    if p and p not in sys.path:
        sys.path.insert(0, p)

from dynasty.combat_v2.catalog import SYNTHETIC_CATALOG_C1  # noqa: E402
from dynasty.combat_v2.events.machine import (  # noqa: E402
    Phase, advance, start, submit_objective_action,
)
from dynasty.combat_v2.events.policies import POLICY_NARROW  # noqa: E402
from dynasty.combat_v2.events.qualification_study import (  # noqa: E402
    BALANCED, BALANCED_2, EARLY, OPP, SCALING, USER, setup,
)
from dynasty.combat_v2.events.snapshot import snapshot  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "src" / "lib" / "dynasty" / "e1" / "fixtures" / "ux3-bo5.json"
LINEUPS = (EARLY, SCALING, BALANCED)
OPPONENT = BALANCED_2
POLICY = POLICY_NARROW
SERIES_SEED = int(os.environ.get("UX3_SERIES_SEED", "3"))
MAX_GAMES = 5


def frame(state, detail: bool) -> dict:
    return snapshot(state, detail=detail)


# -- lossless frame codec (decoded by src/lib/dynasty/e1/frames.ts) ----------
# Frame 0 of a path is stored whole. Each later frame stores only the top-level
# keys that changed; a list that only grew is stored as {"$append": [...]}.
# The codec carries no game logic: decode(encode(frames)) == frames is checked
# below for every path before the file is written.

def encode(frames, base=None):
    out, prev = [], base
    for f in frames:
        if prev is None:
            out.append(f)
        else:
            d = {}
            for k in set(prev) | set(f):
                if k not in f:
                    d[k] = {"$del": True}
                elif prev.get(k) != f[k]:
                    a, b = prev.get(k), f[k]
                    if isinstance(a, list) and isinstance(b, list) and len(b) > len(a) and b[:len(a)] == a:
                        d[k] = {"$append": b[len(a):]}
                    else:
                        d[k] = b
            out.append({"$delta": d})
        prev = f
    return out


def decode(encoded, base=None):
    out, prev = [], base
    for e in encoded:
        if "$delta" not in e:
            cur = e
        else:
            cur = dict(prev)
            for k, v in e["$delta"].items():
                if isinstance(v, dict) and v.get("$del"):
                    cur.pop(k, None)
                elif isinstance(v, dict) and "$append" in v and set(v) == {"$append"}:
                    cur[k] = list(prev[k]) + v["$append"]
                else:
                    cur[k] = v
        out.append(cur)
        prev = cur
    return out


def encode_path(path):
    frames = path["frames"]
    enc = {"frames": encode(frames), "encounter": None}
    assert decode(enc["frames"]) == frames
    if path["encounter"]:
        branches = {}
        for n, bf in path["encounter"]["branches"].items():
            branches[n] = encode(bf, base=frames[-1])
            assert decode(branches[n], base=frames[-1]) == bf
        enc["encounter"] = {"encounter_id": path["encounter"]["encounter_id"], "branches": branches}
    return enc


def play_until_pause(state, frames):
    """Advance one transition at a time, recording each snapshot."""
    while state.phase not in (Phase.SETTLED, Phase.AWAITING_OBJECTIVE):
        state = advance(state)
        frames.append(frame(state, detail=state.phase is Phase.SETTLED))
    return state


def capture_path(lineup, game_index: int) -> dict:
    s = setup(POLICY, lineup, OPPONENT, SERIES_SEED, ("ux3-bo5", lineup.key, OPPONENT.key, game_index))
    state = start(s)
    frames = [frame(state, detail=False)]
    state = play_until_pause(state, frames)
    path = {"frames": frames, "encounter": None}
    if state.phase is Phase.AWAITING_OBJECTIVE:
        enc = state.pending.encounter_id
        branches = {}
        for count in range(4):
            b = submit_objective_action(state, enc, f"ux3-fixture:{enc}", count)
            bf = [frame(b, detail=b.phase is Phase.SETTLED)]
            b = play_until_pause(b, bf)
            if b.phase is not Phase.SETTLED:
                raise SystemExit(f"game {game_index} {lineup.key}: a second encounter is not supported")
            branches[str(count)] = bf
        path["encounter"] = {"encounter_id": enc, "branches": branches}
    return path


def champion_view(key: str) -> dict:
    c = SYNTHETIC_CATALOG_C1.get(key)
    return {"key": key, "name": c.name, "class": c.profile.primary_class.value,
            "capabilities": sorted(t.value for t in c.profile.capabilities),
            "damage": c.profile.damage.value,
            "ratings": [c.ratings.early, c.ratings.mid, c.ratings.late]}


def strategy_view(s) -> dict:
    return {"lineup_id": s.key, "title": s.title,
            "roles": ["top", "jng", "mid", "bot", "sup"],
            "champions": [champion_view(k) for k in s.champions],
            "player_ratings": list(s.ratings)}


def backend_head(root: str) -> str:
    try:
        return subprocess.check_output(["git", "-C", root, "rev-parse", "HEAD"], text=True).strip()
    except Exception:  # pragma: no cover - provenance only
        return "unknown"


def main() -> None:
    import dynasty
    backend_root = str(Path(dynasty.__file__).resolve().parents[1])
    games = []
    for g in range(MAX_GAMES):
        raw = {s.key: capture_path(s, g) for s in LINEUPS}
        games.append({"index": g + 1, "raw": raw})
    doc = {
        "schema": "mogzy.dynasty.ux3.bo5_fixture.v1",
        "label": ("RECORDED E1 machine output (synthetic catalogs, provisional numbers). "
                  "Every frame is a backend snapshot after one transition. Not a live API."),
        "provenance": "simulated_event",
        "source": {
            "backend_commit": backend_head(backend_root),
            "e1_commit": "786dc81b",
            "producer": "dynasty.combat_v2.events.snapshot.snapshot",
            "snapshot_schema": "dynasty.combat_v2.events.snapshot.e1",
            "capture_script": "scripts/dynasty/capture_ux3_bo5_fixture.py",
            "bo5_convention": "qualification_study.bo5 (independent games, first to three)",
        },
        "policy": {"policy_id": POLICY.policy_id, "catalog_id": POLICY.catalog.catalog_id,
                   "status": POLICY.status},
        "series": {
            "series_id": "ux3-bo5-" + hashlib.sha256(f"ux3|{SERIES_SEED}".encode()).hexdigest()[:12],
            "best_of": 5, "wins_needed": 3,
            "user": {"team_id": USER, "name": f"SYN {USER}"},
            "opponent": {"team_id": OPP, "name": f"SYN {OPP}", "lineup": strategy_view(OPPONENT)},
        },
        "lineups": [strategy_view(s) for s in LINEUPS],
        "frame_codec": "mogzy.dynasty.ux3.frame_delta.v1",
        "games": [{"index": g["index"], "options": {k: encode_path(p) for k, p in g["raw"].items()}}
                  for g in games],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    enc = sum(1 for g in games for p in g["raw"].values() if p["encounter"])
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB); encounters {enc}")
    for g in games:
        row = []
        for k, p in g["raw"].items():
            last = (p["encounter"]["branches"]["3"] if p["encounter"] else p["frames"])[-1]
            st = last["settlement"]
            row.append(f"{k}:{st['winner'][0]}/{st['how'][:6]}{'*' if p['encounter'] else ''}")
        print(g["index"], " ".join(row))


if __name__ == "__main__":
    main()
