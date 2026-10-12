"""PAV1 — freeze a representative sample of PA1's certified assembly content.

READ-ONLY, DEVELOPMENT ONLY. Runs PA1's own content authority
(`pro_authority.assembly_content`, backend branch `pa1/assembly-content`,
content commit a34965e5) against the two read-only snapshots PA1 certified
from, and writes a trimmed, verbatim-valued capture that the
`/dev/pro-play-assembly` lab's stand-in authority reads. Nothing is modified:
both databases are opened `mode=ro`, the PA1 worktree is only imported from.

The capture CONTAINS ANSWERS (`private.answer`, per-card tier and role anchor)
because it stands in for the server. It is imported only by
`src/pages/dev/pro-play-assembly/labAuthority.ts`; the primitive's source
test pins that it never reaches `PositionalAssembly`.

Sample (Worlds, PA1's pilot pool, 2015+):
  * ROSTER LOCK — every eligible FINALS side (9 of 22; the refusals are PA1's
    own: Wolf / Ghost identity conflicts, Faker's registry gap, substitutions,
    missing roles).
  * DRAFT MEMORY — the 2017 Final, every game, both sides; every other Final,
    the deciding game, both sides (26 team-games).
  * Three seeds per tray variant (size 10 / 15; roster with and without the
    bench tier). Tokens are PA1's (`t0..`); the lab re-mints them per round.
  * Team crests through the real media authority, dated to the game.

    python scripts/pro-play-assembly/capture_pa1_sample.py [out.json]
"""
import importlib.util
import json
import os
import sqlite3
import sys
import time
from pathlib import Path

PA1 = Path(os.environ.get(
    "PA1_WORKTREE",
    r"C:/Users/mlmit/OneDrive/Desktop/League_Combat_Simulator/.worktrees/pa1-assembly-content"))
CORPUS = os.environ.get("LOL_CALC_DB", r"C:/Users/mlmit/mogzy-data/lol_calc.db")
IDENTITY = os.environ.get(
    "MOGSY_IDENTITY_DB_PATH",
    r"C:/Users/mlmit/mogzy-archive/railway-web-volume/live-recovery/20261010T091611Z/mogsy_esports_identity_full.db")
HERE = Path(__file__).resolve()
DEFAULT_OUT = HERE.parents[2] / "src" / "lib" / "pro-play-assembly" / "__fixtures__" / "pa1AssemblyCapture.json"
OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_OUT
PA1_CONTENT_COMMIT = "a34965e54fefec7e448f3a2c873f03710df2ed54"

os.environ["MOGSY_IDENTITY_DB_PATH"] = IDENTITY
os.environ["LOL_CALC_DB_PATH"] = CORPUS
os.environ["LOL_CALC_DB"] = CORPUS
sys.path.insert(0, str(PA1))
os.chdir(PA1)

from pro_authority import assembly_content as ac  # noqa: E402
from pro_authority import media as media_mod  # noqa: E402
from pro_authority import player_display, team_display  # noqa: E402

_spec = importlib.util.spec_from_file_location("acr", PA1 / "scripts" / "assembly_content_report.py")
acr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(acr)

SEEDS = ["pav1-0", "pav1-1", "pav1-2"]


def ro(path):
    c = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    c.row_factory = sqlite3.Row
    return c


def slug(s):
    return "".join(ch if ch.isalnum() else "-" for ch in s.lower()).strip("-").replace("--", "-")


def trim_tray(t):
    out = {"seed": t["seed"], "size": t["size"], "cards": t["cards"], "private": t["private"]}
    if "include_bench" in t:
        out["include_bench"] = t["include_bench"]
    return out


def main():
    t0 = time.time()
    conn, iconn = ro(CORPUS), ro(IDENTITY)
    player_display.reset_cache(None)
    team_display.reset_cache(None)
    registry = ac.IdentityRegistry(iconn)
    finals = {}
    for g in acr.ko_games(conn):
        if g["league_slug"] != acr.PILOT_LEAGUE or "_Finals_" not in g["match_id"]:
            continue
        if int(g["game_date"][:4]) < acr.PILOT_FIRST_SEASON:
            continue
        finals.setdefault(g["match_id"], []).append(g)
    ordered = sorted(finals.items(), key=lambda kv: kv[1][0]["game_date"])
    print(f"finals series: {len(finals)}", flush=True)

    rounds, refusals = [], []
    for match_id, gs in ordered:
        for team in (gs[0]["blue_team_key"], gs[0]["red_team_key"]):
            res = ac.series_lineup(conn, registry, match_id, team)
            s = res["subject"]
            if not res["eligible"]:
                refusals.append({"family": "roster_lock", "match_id": match_id, "team_key": team,
                                 "season": s["season"], "primary_reason": res["primary_reason"]})
                continue
            pool = ac.roster_distractor_pool(conn, registry, res)
            trays = []
            for size in ac.TRAY_SIZES:
                for bench in (False, True):
                    for seed in SEEDS:
                        t = ac.build_roster_tray(conn, registry, res, seed=seed, size=size,
                                                 include_bench=bench, pool=pool)
                        if not t["eligible"]:
                            raise SystemExit(f"tray refused {match_id}/{team}: {t['reasons']}")
                        assert not ac.audit_tray(t)
                        trays.append(trim_tray(t))
            rounds.append({
                "id": f"rl-{s['season']}-{slug(s['stage'])}-{slug(team)}",
                "family": "roster_lock", "content_id": res["content_id"],
                "subject": {**{k: v for k, v in s.items() if k != "games"},
                            "games": [{"game_number": g["game_number"], "game_date": g["game_date"],
                                       "side": g["side"]} for g in s["games"]]},
                "display": res["display"],
                "lineup": [{"slot_id": p["slot_id"], "role": p["role"], "entity_key": p["player_lp_page"],
                            "label": p["display_name"],
                            "evidence_levels": sorted({e["eligibility_level"] for e in p["registry_evidence"]})}
                           for p in res["lineup"]],
                "provenance": res["provenance"],
                "trays": trays,
            })
            print(f"  roster ok {match_id} / {team}", flush=True)

    resolve_team = ac.source_team_resolver(IDENTITY, CORPUS)
    for match_id, gs in ordered:
        gs = sorted(gs, key=lambda g: g["game_number"])
        wanted = gs if gs[0]["game_date"].startswith("2017") else [gs[-1]]
        for g in wanted:
            for team in (g["blue_team_key"], g["red_team_key"]):
                res = ac.game_draft(conn, match_id, g["game_number"], team, resolve_team=resolve_team)
                s = res["subject"]
                if not res["eligible"]:
                    refusals.append({"family": "draft_memory", "match_id": match_id, "team_key": team,
                                     "game_number": g["game_number"], "primary_reason": res["primary_reason"]})
                    continue
                pool = ac.draft_distractor_pool(conn, res)
                trays = []
                for size in ac.TRAY_SIZES:
                    for seed in SEEDS:
                        t = ac.build_draft_tray(conn, res, seed=seed, size=size, pool=pool)
                        if not t["eligible"]:
                            raise SystemExit(f"tray refused {match_id} G{g['game_number']}/{team}: {t['reasons']}")
                        assert not ac.audit_tray(t)
                        trays.append(trim_tray(t))
                rounds.append({
                    "id": f"dm-{s['season']}-{slug(s['stage'])}-g{s['game_number']}-{slug(team)}",
                    "family": "draft_memory", "content_id": res["content_id"],
                    "subject": s, "display": res["display"],
                    "lineup": [{"slot_id": p["slot_id"], "role": p["role"], "entity_key": p["champion_key"],
                                "label": p["champion_key"]} for p in res["lineup"]],
                    "provenance": res["provenance"], "notes": res["notes"],
                    "trays": trays,
                })
                print(f"  draft ok {match_id} G{g['game_number']} / {team} ({res['provenance']['path']})", flush=True)

    # Team crests through the real media authority, dated to the game. A team's
    # resolution is identical on every date in this sample (measured), so one
    # entry per team key is kept, with the dates it was checked on.
    team_media = {}
    for r in rounds:
        s = r["subject"]
        day = s["games"][0]["game_date"] if r["family"] == "roster_lock" else s["game_date"]
        for key in (s["team_key"], s["opponent_key"]):
            res = media_mod.resolve_media(conn, iconn, media_mod.ENTITY_TEAM, key, as_of=day)
            asset = res.asset
            entry = {"team_key": key, "state": res.state, "reason": res.reason,
                     "display_name": res.display_name, "label": res.fallback_label,
                     "asset_path": asset.asset_location if asset else None,
                     "credit": getattr(asset, "credit", None) if asset else None}
            prev = team_media.get(key)
            if prev and {k: prev[k] for k in entry} != entry:
                raise SystemExit(f"team media differs by date for {key}: {prev} vs {entry}")
            team_media[key] = {**entry, "as_of": sorted(set((prev or {}).get("as_of", []) + [day[:10]]))}

    out = {
        "captured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "authority": {
            "module": "pro_authority.assembly_content",
            "contract_version": ac.CONTRACT_VERSION, "rules_version": ac.RULES_VERSION,
            "pa1_content_commit": PA1_CONTENT_COMMIT,
            "corpus": CORPUS, "identity_db": IDENTITY,
            "media": "pro_authority.media.resolve_media (team crests, dated as_of the game)",
        },
        "sample": {"league": acr.PILOT_LEAGUE, "stage": "Finals", "first_season": acr.PILOT_FIRST_SEASON,
                   "seeds": SEEDS, "tray_sizes": list(ac.TRAY_SIZES)},
        "refusals": refusals,
        "rounds": rounds,
        "team_media": team_media,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # Compact, one line: the lab imports it; nobody diffs it by hand.
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB) — {len(rounds)} rounds, {len(refusals)} refusals [{time.time() - t0:.0f}s]")


if __name__ == "__main__":
    main()
