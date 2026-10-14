"""Serve the REAL backend app (api_server:app) for Role Challenge acceptance.

Real: every route, the Role Challenge launch service (catalog, status, start,
UTC-day quota, idempotent start keys, entitlement decision, atomic match+run
commit), the Ranked match engine, grading, settlement, history, review and
discovery isolation, JWT verification (HS256).

Replaced, and ONLY these (each is an external authority the scratch DB cannot
hold):
  * routes._auth._owner_state          -- Supabase owner RPC
  * entitlement.get_pro_status/_grant  -- Stripe/Supabase entitlement lookup;
                                          the 'premium' persona is Premium
  * launch._champion_names,
    composer._roster_roles             -- the Mastery identity registry, which
                                          needs the canonical DB; replaced by the
                                          checked-in 173-champion roster
  * composer.compose                   -- canonical Mastery content (Blocks
                                          A/C/D) needs lol_calc.db. The rig
                                          composes the same 12 answers in the same
                                          four 3-answer blocks from exact-ref bank
                                          rows, through the composer's own
                                          _quiz_spec, as a RoleChallengeComposition.
lifespan is OFF: no startup migration or background job touches anything.
"""
import os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

C.ensure_dirs()
os.chdir(C.RUN_DIR)
sys.path.insert(0, C.WORKTREE)
C.assert_scratch(C.DB_PATH)
os.environ.update({
    "LOL_CALC_DB_PATH": C.DB_PATH,
    "RANKED_PUBLIC_ENABLED": "1",
    "RANKED_FORMATS_ENABLED": "1",
    "RANKED_RATELIMIT_ENABLED": "0",
    "SUPABASE_JWT_SECRET": C.secret(),
    "SUPABASE_ALLOW_HS256": "1",
    "LIVE_ESPORTS_ENABLED": "0",
    "PRO_STATS_WARMUP": "0",
    "PATCH_OPS_ENABLE_EXTERNAL_VISION": "0",
})
for k in ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"):
    os.environ.pop(k, None)

import uvicorn
import api_server
import routes._auth as _auth
from ranked_formats import RankedFormat
from ranked_formats.schema import SCORING_MODEL_POINTS
from ranked_public import champion_roles as CR
from ranked_public import shared_bank as SB
from role_challenge import composer as RC
from role_challenge import launch
from services import entitlement

_auth._owner_state = lambda token: {"is_owner": True, "authorized": True}

PREMIUM = {p["sub"] for p in C.PERSONAS.values() if p["premium"]}
entitlement.get_pro_status = lambda user_id, token: user_id in PREMIUM
entitlement.get_grant_kind = lambda user_id, token: None


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


_ASSET_KEYS = {}
_champ_dir = os.path.join(C.WORKTREE, "assets", "champions")
if os.path.isdir(_champ_dir):
    _ASSET_KEYS = {folder.lower(): folder for folder in os.listdir(_champ_dir)}
_ASSET_KEYS.update({"wukong": "MonkeyKing", "nunuwillump": "Nunu", "renataglasc": "Renata"})

ROSTER = {_norm(e.champion): frozenset(e.roles) for e in CR._ROSTER.values()}
NAMES = {_norm(e.champion): {"name": e.champion, "riot_id": _ASSET_KEYS.get(_norm(e.champion))}
         for e in CR._ROSTER.values()}
RC._roster_roles = lambda: ROSTER
launch._champion_names = lambda: NAMES


def rig_compose(cur, role, champion, seed):
    """12 exact-ref answers in RC's four 3-answer blocks, via RC's own specs."""
    RC.validate_request(role, champion, seed)
    servable = SB.canonical_record_index(cur)
    rows = []
    for row, record in SB.load_pool_rows(cur, "easy_game_knowledge"):
        ref = getattr(record, "canonical_ref", None)
        if ":rig-" in (row["question_key"] or "") and ref and servable.get(ref) is not None:
            rows.append((RC._rank(seed, role, champion, ref), ref, row["question_key"].split(":")[0]))
    rows.sort()
    if len(rows) < RC.TOTAL_ANSWERS:
        raise RC.RoleChallengeUnavailable(RC.CODE_BANK_EXHAUSTED, f"rig bank has {len(rows)} rows")
    picks = [RC._BankCandidate(ref, family, "easy_game_knowledge", RC.EVIDENCE_GLOBAL)
             for _, ref, family in rows[:RC.TOTAL_ANSWERS]]
    pattern, blocks = [], []
    for b, name in enumerate(RC.BLOCKS):
        chunk = picks[b * 3:(b + 1) * 3]
        start = len(pattern) + 1
        for pick in chunk:
            pattern.append(RC._quiz_spec(pick, len(pattern) + 1, name))
        detail = RC._bank_detail(chunk)
        if name == RC.BLOCK_CHAMPION:
            detail.update({"champion": champion, "role": role,
                           "conventional_role": RC.is_conventional(role, champion),
                           "rig_substitute_for": "mastery_slice"})
        blocks.append(RC.BlockComposition(name, RC.SOURCE_BANK, 3,
                                          tuple(range(start, start + 3)), RC._freeze(detail)))
    fmt = RankedFormat(format_id=RC.FORMAT_ID, format_version=RC.FORMAT_VERSION, status="active",
                       segment_pattern=tuple(pattern), bot_eligible=True, rating_eligible=False,
                       scoring_model=SCORING_MODEL_POINTS, match_length=len(pattern)).validate()
    return RC.RoleChallengeComposition(
        composer_version=RC.COMPOSER_VERSION, role=role, champion=champion, seed=seed,
        composition_id="rcc_rig_" + RC._rank(seed, role, champion)[:24],
        content_authority=RC._freeze({"rig": "role-challenge-real-backend"}), format=fmt,
        total_answer_count=RC._answer_count(fmt), blocks=tuple(blocks))


RC.compose = rig_compose

if __name__ == "__main__":
    print(f"[rc-rig] db={C.DB_PATH} port={C.PORT}", flush=True)
    uvicorn.run(api_server.app, host="127.0.0.1", port=C.PORT, lifespan="off", log_level="info")
