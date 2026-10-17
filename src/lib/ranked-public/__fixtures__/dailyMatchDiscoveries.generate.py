"""Generate Daily-stage discoveries responses with the REAL backend projection
(origin/master 80da3edc, ranked_public.projections.project_match_discoveries)."""
import sys, json
from datetime import datetime, timezone
sys.path.insert(0, sys.argv[1])
from ranked_public import projections

now = datetime(2026, 10, 17, 9, 30, 5, tzinfo=timezone.utc)
MATCH = "rkb_daily_standard_0"

def row(ref, rnd, seen):
    return {"canonical_question_ref": ref, "first_seen_at": seen,
            "first_round_number": rnd, "first_match_id": MATCH}

rows = [
    row("ranked:v2-030", 2, "2026-10-17T09:27:41Z"),
    row("ranked:v2-118", 5, "2026-10-17T09:28:19Z"),
    row("ranked:v2-402", 9, "2026-10-17T09:29:30Z"),
]
frozen = {
    "ranked:v2-030": {"prompt": "What is Flash's base cooldown?", "category": "Summoner Spells"},
    "ranked:v2-118": {"prompt": "How much does a Long Sword cost?", "category": "Item Costs"},
}
earned = projections.project_match_discoveries(
    MATCH, rows, frozen, {}, 3, 426, now)
none = projections.project_match_discoveries(
    "rkb_daily_standard_1", [], {}, {}, 0, 426, now)
out = {"earned": earned, "none": none}
json.dump(out, sys.stdout, indent=2, sort_keys=True)
