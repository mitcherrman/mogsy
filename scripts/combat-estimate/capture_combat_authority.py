"""CE1 — capture certified combat scenarios for the Combat Estimate lab.

DEVELOPMENT ONLY. READ ONLY against the backend.

Every number in the output is produced by the backend's own authorities, called
directly — nothing in this script states a League formula, resolves a stat or
mitigates a hit:

* attacker / target stats ... ``services.combat_helpers.build_runtime_champion_stats``
                              (Combat Lab's executor stat builder — the route
                              ``test_combat_calculations_seam.py`` proves the
                              seam equals, to the last bit)
* raw and post-armor damage . ``combat_calculations.calculate`` — the one
                              certified physical-ability-damage seam
                              (``ability_damage.physical.post_mitigation.v1``)
* formula disclosure ........ ``combat_calculations.formula_disclosure.disclose``
                              (the canonical evaluator probed for flat + ratio;
                              refused when a row is not linear)
* modelled component ........ ``physical_ability_damage.modelled_component``
                              (Pantheon E: the unempowered cast)
* ability names ............. the ``champion_abilities`` table

A scenario the seam REFUSES is recorded in ``refused`` with the seam's own
reason and detail, never answered. A scenario whose answer falls outside the
dev scale tier for its attacker level is likewise refused (``scale_overflow``).

Usage (from anywhere; the backend is imported from ``--backend``):

    python -I scripts/combat-estimate/capture_combat_authority.py \
        --backend C:/Users/mlmit/mogzy-wt/ce1-be-read \
        --db C:/Users/mlmit/mogzy-data/lol_calc.db \
        --out src/lib/combat-estimate/__fixtures__/combatAuthorityCapture.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sqlite3
import subprocess
import sys
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

CAPTURE_TOOL = "scripts/combat-estimate/capture_combat_authority.py"
CAPTURE_CONTRACT = "combat_estimate.capture.v1"

#: DEVELOPMENT-ONLY scale policy. The instrument's range is a function of a
#: PUBLIC premise value only -- the attacker's total attack damage, printed on
#: the board -- never of the hidden answer, so no bound can leak it: the beam
#: runs to four times the attacker's AD, rounded up to the next 100 and held
#: between 400 and 1000. A scenario whose answer does not fit is refused,
#: which is an eligibility rule like any other (a bounded instrument always
#: says "the answer is on the beam"). Productionisation decides the real
#: policy; this one exists so the prototype's beam is neither empty nor
#: cramped across the demonstrated magnitudes.
SCALE_POLICY_ID = "ce1.scale.four_times_attack_damage.dev-v0"
SCALE_AD_MULTIPLE = 4
SCALE_ROUND_TO = 100
SCALE_MIN_MAX = 400
SCALE_MAX_MAX = 1000
SCALE_COARSE_STEP = 50
SCALE_FIGURE_EVERY = 100

#: The premise identifiers the working restates (journey.py's own map).
RATIO_PREMISE_KEY = {"AD": "attack_damage", "BO_AD": "bonus_attack_damage", "AP": "ability_power"}
RATIO_LABEL = {"AD": "attack damage", "BO_AD": "bonus attack damage", "AP": "ability power"}
RATIO_STAT_KEY = {"AD": "AD", "BO_AD": "BONUS_AD", "AP": "AP"}

#: The demonstration set. Each entry is a PREMISE; the numbers come from the
#: authorities above. ``metric`` is which certified value the round asks for:
#: ``post_mitigation`` (after armor — the seam's headline number) or ``raw``
#: (before armor — the seam's ``raw_damage``, the Journey's certified
#: ``physical_ability_raw_damage`` family).
SCENARIOS = [
    # The pinned Applied-Chain case (test_the_pinned_applied_chain_case_is_reproduced):
    # Jarvan IV Q rank 3, level 5, Serrated Dirk vs Olaf level 5 — 199 raw, 144.2259 after armor.
    dict(id="jarvan-q-r3-l5-dirk-vs-olaf", attacker="Jarvan IV", level=5, items=["Serrated Dirk"],
         slot="Q", rank=3, target="Olaf", target_level=5, target_items=[], metric="post_mitigation",
         difficulty="opening"),
    dict(id="zed-q-r1-l2-longsword-vs-ahri", attacker="Zed", level=2, items=["Long Sword"],
         slot="Q", rank=1, target="Ahri", target_level=2, target_items=[], metric="post_mitigation",
         difficulty="opening"),
    dict(id="olaf-q-r5-l11-lastwhisper-vs-jarvan", attacker="Olaf", level=11, items=["Last Whisper"],
         slot="Q", rank=5, target="Jarvan IV", target_level=11, target_items=[], metric="post_mitigation",
         difficulty="middle"),
    dict(id="jarvan-q-r5-l11-noitems-vs-olaf", attacker="Jarvan IV", level=11, items=[],
         slot="Q", rank=5, target="Olaf", target_level=11, target_items=[], metric="post_mitigation",
         difficulty="middle"),
    dict(id="lucian-q-r3-l7-pickaxe-vs-ezreal", attacker="Lucian", level=7, items=["Pickaxe"],
         slot="Q", rank=3, target="Ezreal", target_level=7, target_items=[], metric="post_mitigation",
         difficulty="middle"),
    dict(id="leesin-r-r2-l11-brutalizer-vs-sett", attacker="Lee Sin", level=11, items=["The Brutalizer"],
         slot="R", rank=2, target="Sett", target_level=11, target_items=[], metric="post_mitigation",
         difficulty="middle"),
    dict(id="jhin-w-r5-l13-dirk-pickaxe-vs-malphite-chainvest", attacker="Jhin", level=13,
         items=["Serrated Dirk", "Pickaxe"], slot="W", rank=5, target="Malphite", target_level=13,
         target_items=["Chain Vest"], metric="post_mitigation", difficulty="late"),
    dict(id="pantheon-e-r5-l13-dirk-vs-garen", attacker="Pantheon", level=13, items=["Serrated Dirk"],
         slot="E", rank=5, target="Garen", target_level=13, target_items=[], metric="post_mitigation",
         difficulty="late"),
    dict(id="vi-r-r3-l18-lastwhisper-pickaxe-pickaxe-vs-ornn-chainvest", attacker="Vi", level=18,
         items=["Last Whisper", "Pickaxe", "Pickaxe"], slot="R", rank=3, target="Ornn", target_level=18,
         target_items=["Chain Vest"], metric="post_mitigation", difficulty="late"),
    dict(id="yasuo-r-r3-l16-warhammer-vs-sion", attacker="Yasuo", level=16, items=["Caulfield's Warhammer"],
         slot="R", rank=3, target="Sion", target_level=16, target_items=[], metric="post_mitigation",
         difficulty="late"),
    # Before-armor variations (the seam's raw number; the Journey's certified raw family).
    dict(id="zed-q-r3-l7-longsword-vs-ahri-raw", attacker="Zed", level=7, items=["Long Sword"],
         slot="Q", rank=3, target="Ahri", target_level=7, target_items=[], metric="raw",
         difficulty="middle"),
    dict(id="jarvan-r-r3-l16-dirk-vs-olaf-raw", attacker="Jarvan IV", level=16, items=["Serrated Dirk"],
         slot="R", rank=3, target="Olaf", target_level=16, target_items=[], metric="raw",
         difficulty="late"),
    # A premise the seam must REFUSE (an item with a canonical effect): recorded, never answered.
    dict(id="jarvan-q-r5-l11-ldr-vs-olaf", attacker="Jarvan IV", level=11, items=["Lord Dominik's Regards"],
         slot="Q", rank=5, target="Olaf", target_level=11, target_items=[], metric="post_mitigation",
         difficulty="middle"),
]


def _round(value, places=4):
    rounded = round(float(value), places)
    return int(rounded) if float(rounded).is_integer() else rounded


def _whole(value: float) -> int:
    """The game's whole-number display of a damage value (ROUND_HALF_UP, as
    ``mastery.choices.numeric_choices.display_value`` rounds)."""
    return int(Decimal(repr(float(value))).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def _scale_for(attack_damage: float) -> dict:
    import math
    raw = math.ceil(SCALE_AD_MULTIPLE * float(attack_damage) / SCALE_ROUND_TO) * SCALE_ROUND_TO
    maximum = max(SCALE_MIN_MAX, min(SCALE_MAX_MAX, raw))
    return {"policy": SCALE_POLICY_ID, "max": int(maximum), "coarse_step": SCALE_COARSE_STEP,
            "figure_every": SCALE_FIGURE_EVERY,
            "basis": f"{SCALE_AD_MULTIPLE} x attack damage {_round(attack_damage)}, rounded up to {SCALE_ROUND_TO}, clamped [{SCALE_MIN_MAX}, {SCALE_MAX_MAX}]"}


def _git(backend: Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=str(backend), capture_output=True, text=True,
                          check=True).stdout.strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", required=True, help="League_Combat_Simulator checkout (read only)")
    ap.add_argument("--db", required=True, help="lol_calc.db (opened read-only)")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    backend = Path(args.backend).resolve()
    db = Path(args.db).resolve()
    out = Path(args.out).resolve()
    os.environ["LOL_CALC_DB_PATH"] = str(db)
    sys.path.insert(0, str(backend))
    os.chdir(str(backend))

    import combat_calculations as CC
    from combat_calculations import formula_disclosure as FD
    from combat_calculations import physical_ability_damage as PAD
    from services.combat_helpers import build_runtime_champion_stats

    conn = sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row

    def item_row(name: str):
        row = conn.execute(
            "SELECT canonical_item_id, canonical_name, source_revision FROM item_canonical "
            "WHERE canonical_name = ? AND validation_status = 'validated_current'", (name,)).fetchone()
        if row is None:
            raise KeyError(f"no validated_current item named {name!r}")
        return {"id": str(row[0]), "name": str(row[1]), "revision": str(row[2])}

    def ability_name(champion: str, slot: str) -> str:
        row = conn.execute(
            "SELECT ability_name FROM champion_abilities WHERE champion_name = ? AND slot = ?",
            (champion, slot)).fetchone()
        return str(row[0]) if row and row[0] else slot

    scenarios, refused = [], []
    for s in SCENARIOS:
        try:
            a_items = [item_row(n) for n in s["items"]]
            t_items = [item_row(n) for n in s["target_items"]]
        except KeyError as exc:
            refused.append({"id": s["id"], "reason": "unknown_item", "detail": str(exc)})
            continue
        a_stats = build_runtime_champion_stats(s["attacker"], level=s["level"],
                                               item_names=list(s["items"]))["runtime_stats"]
        t_stats = build_runtime_champion_stats(s["target"], level=s["target_level"],
                                               item_names=list(s["target_items"]))["runtime_stats"]
        request = CC.CombatCalculationRequest(
            calculation=CC.PHYSICAL_ABILITY_DAMAGE,
            attacker=CC.AttackerInputs(
                champion=s["attacker"], level=int(s["level"]), ability_slot=s["slot"],
                ability_rank=int(s["rank"]), attack_damage_total=float(a_stats["AD"]),
                attack_damage_bonus=float(a_stats.get("BONUS_AD", 0.0)),
                ability_power_total=float(a_stats.get("AP", 0.0)),
                item_ids=tuple(i["id"] for i in a_items), runes=(), shards=(), form=None),
            target=CC.TargetInputs(
                champion=s["target"], level=int(s["target_level"]), armor_total=float(t_stats["ARMOR"]),
                item_ids=tuple(i["id"] for i in t_items), runes=(), shards=(), form=None),
            context=CC.CombatContext(target_kind=CC.TARGET_CHAMPION, resistance_reduction=(),
                                     ability_state=(), inactive_item_effects=()))
        result = CC.calculate(conn, request)
        if not result.supported:
            refused.append({"id": s["id"], "reason": result.reason, "detail": result.detail,
                            "provenance": [list(p) for p in result.provenance]})
            continue
        try:
            disclosure = FD.disclose(conn, s["attacker"], s["slot"])
        except FD.FormulaNotDisclosable as exc:
            refused.append({"id": s["id"], "reason": exc.code, "detail": exc.detail})
            continue

        metric = s["metric"]
        exact = float(result.post_mitigation_damage if metric == "post_mitigation" else result.raw_damage)
        scale = _scale_for(a_stats["AD"])
        if not (0 <= exact < scale["max"]):
            refused.append({"id": s["id"], "reason": "scale_overflow",
                            "detail": f"answer {exact} is outside the beam [0, {scale['max']})"})
            continue

        name = ability_name(s["attacker"], s["slot"])
        rank = int(s["rank"])
        bound = {RATIO_PREMISE_KEY[i]: _round(a_stats[RATIO_STAT_KEY[i]]) for i, _ in disclosure.ratios}
        ratios = [{"stat": RATIO_PREMISE_KEY[i], "label": RATIO_LABEL[i], "ratio": v,
                   "value": bound[RATIO_PREMISE_KEY[i]]} for i, v in disclosure.ratios]
        attacker_stats = {
            "attack_damage": _round(a_stats["AD"]),
            "bonus_attack_damage": _round(a_stats.get("BONUS_AD", 0.0)),
            "ability_power": _round(a_stats.get("AP", 0.0)),
        }
        pen = result.penetration
        # combat_working.v1 — the shape the frontend's `readCombatWorking` reads
        # (journey.py `combat_working`): every value the evaluator produced.
        working = {
            "contract": "combat_working.v1",
            "calculation": "physical_ability_damage",
            "damage_type": disclosure.damage_type,
            "attacker": {"side": "attacker", "champion": s["attacker"]},
            "target": {"side": "target", "champion": s["target"]},
            "ability": {"slot": disclosure.slot, "name": name, "rank": rank},
            "formula": {"flat": _round(disclosure.flat_at(rank)), "ratios": ratios},
            "attacker_stats": attacker_stats,
            "raw_damage": _round(result.raw_damage),
            "target_armor": {"value": _round(result.target_armor), "source": "stated"},
            "penetration": {"lethality": _round(pen.lethality), "armor_pen_percent": _round(pen.armor_pen_percent),
                            "armor_pen_flat": _round(pen.armor_pen_flat)},
            "effective_armor": _round(result.effective_armor),
            "mitigation_multiplier": _round(result.mitigation_multiplier),
            "final_damage": _round(result.post_mitigation_damage),
            "answer": str(_whole(result.post_mitigation_damage)),
        }
        # raw_damage_working.v1 — the per-term layout (flat, then one term per
        # ratio) the frontend's `readRawDamageWorking` checks sums to the total.
        raw_terms = [{"term": "flat", "value": _round(disclosure.flat_at(rank))}]
        raw_terms += [{"term": "ratio", "stat": r["stat"], "value": _round(r["ratio"] * r["value"])} for r in ratios]
        raw_working = {
            "contract": "raw_damage_working.v1",
            "calculation": "physical_ability_raw_damage",
            "damage_type": disclosure.damage_type,
            "attacker": {"side": "attacker", "champion": s["attacker"]},
            "ability": {"slot": disclosure.slot, "name": name, "rank": rank},
            "formula": {"flat": _round(disclosure.flat_at(rank)), "ratios": ratios},
            "terms": raw_terms,
            "raw_damage": _round(result.raw_damage),
            "answer": str(_whole(result.raw_damage)),
        }
        component = PAD.modelled_component(s["attacker"], s["slot"])
        assumptions = [
            "Frozen state: one specified hit, both champions at the stated levels, nothing else happening.",
            "No runes, no stat shards, no form or transformation on either side.",
            "Items contribute base stats only; no item passive or active is modelled.",
            "Target armor is the stated total; no armor reduction (shred) is in effect.",
        ]
        if metric == "raw":
            assumptions.append("Before armor: the ability's raw physical damage, with no mitigation applied.")
        else:
            assumptions.append("After armor: percent armor penetration, then flat penetration and lethality, then the armor formula.")
        if component:
            assumptions.append(f"Modelled component: {component}.")
        scenarios.append({
            "id": s["id"],
            "kind": "certified",
            "difficulty": s["difficulty"],
            "metric": metric,
            "attacker": {
                "champion": s["attacker"], "level": int(s["level"]), "items": a_items,
                "stats": {**attacker_stats, "base_attack_damage": _round(a_stats["AD"] - a_stats.get("BONUS_AD", 0.0))},
            },
            "ability": {
                "slot": disclosure.slot, "name": name, "rank": rank, "max_rank": disclosure.max_rank,
                "component": component, "formula_text": disclosure.formula_text, "tier": disclosure.tier,
                "disclosure": disclosure.to_dict(),
            },
            "target": {"champion": s["target"], "level": int(s["target_level"]), "items": t_items,
                       "armor": float(result.target_armor)},
            "penetration": pen.to_dict(),
            "result": {
                "damage_type": result.damage_type,
                "raw_damage": result.raw_damage,
                "target_armor": result.target_armor,
                "effective_armor": result.effective_armor,
                "mitigation_multiplier": result.mitigation_multiplier,
                "post_mitigation_damage": result.post_mitigation_damage,
            },
            "answer": {"metric": metric, "exact": exact, "whole": _whole(exact)},
            "scale": scale,
            "working": working if metric == "post_mitigation" else raw_working,
            "formula_bindings": [list(p) for p in result.formula_bindings],
            "provenance": [list(p) for p in result.provenance],
            "assumptions": assumptions,
        })

    stat = db.stat()
    capture = {
        "contract": CAPTURE_CONTRACT,
        "tool": CAPTURE_TOOL,
        "captured_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "backend": {
            "repo": "mitcherrman/League_Combat_Simulator",
            "commit": _git(backend, "rev-parse", "HEAD"),
            "checkout": str(backend),
            "dirty": bool(_git(backend, "status", "--porcelain", "--untracked-files=no")),
        },
        "database": {"path": str(db), "bytes": stat.st_size,
                     "modified": dt.datetime.fromtimestamp(stat.st_mtime, dt.timezone.utc).isoformat(timespec="seconds")},
        "authorities": {
            "calculation": CC.PHYSICAL_ABILITY_DAMAGE,
            "implementation": PAD.IMPLEMENTATION_VERSION,
            "raw_authority": PAD.RAW_AUTHORITY,
            "mitigation_authority": PAD.MITIGATION_AUTHORITY,
            "item_authority": PAD.ITEM_AUTHORITY,
            "stat_builder": "services.combat_helpers.build_runtime_champion_stats",
            "disclosure": FD.DISCLOSURE_VERSION,
            "certification_tests": ["test_combat_calculations_seam.py", "test_jp5_structured_working.py"],
        },
        "scale_policy": {"id": SCALE_POLICY_ID, "development_only": True,
                         "rule": f"max = clamp(ceil({SCALE_AD_MULTIPLE} x attacker attack damage / {SCALE_ROUND_TO}) x {SCALE_ROUND_TO}, {SCALE_MIN_MAX}, {SCALE_MAX_MAX}); coarse step {SCALE_COARSE_STEP}; figures every {SCALE_FIGURE_EVERY}",
                         "basis": "attacker total attack damage (public premise)"},
        "scenarios": scenarios,
        "refused": refused,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(capture, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out}: {len(scenarios)} certified scenarios, {len(refused)} refused")
    for sc in scenarios:
        print(f"  {sc['id']:<60} {sc['metric']:<16} beam 0-{sc['scale']['max']:<5} answer {sc['answer']['whole']:>5}  (exact {sc['answer']['exact']})")
    for r in refused:
        print(f"  REFUSED {r['id']}: {r['reason']} — {r['detail']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
