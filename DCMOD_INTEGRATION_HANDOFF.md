# DCMOD — final Daily integration handoff

Same document in both repos (League_Combat_Simulator, mogsy); branch
`dcmod/integrate-daily` in each. NOT merged into master/main, nothing
force-pushed, no tags.

## Objective
Put the approved DCMOD work onto the CURRENT deploy heads as one product:
C content sets × A rulesets × host, with B's Daily parent run orchestrating
canonical Bot Ranked children, D's scheduled Ranked availability, and E's
Daily arena on `/quiz/daily-challenge`. Retire the old Daily and score-attack
runtimes. Points-only; Survival's 3 lives are strikes, never HP.

## PRODUCT LOCK (owner, merge gate 2026-09-22)
- **Daily Challenge is Mogzy's daily sampler across ALL content Mogzy can
  provide, as each source becomes production-ready**: Champion / Item /
  League Fundamentals, Champion Mastery, Matchup, combat calculations, Pro
  Play, and current/future generators.
- **GR1 does not alter the Daily product plan.** GR1 builds/audits Champion
  Mastery, Matchup and related generators so they can join the Daily.
- **Any current exclusion is a readiness limitation, not a product
  restriction.** The planner is generic: it assigns whatever content is
  Daily-ready for a stage today (see "Daily readiness" below).

## Merge-gate pass (2026-09-22)
Reconciled onto current deploy heads (merge commits, no force-push):
backend `origin/master` through `5c273fdd`, frontend `origin/main`
unchanged at `45a322d4`.
- `b5c37f48`, `b5d15c1f` (Combat Lab items): no file overlap; their item
  tests give identical results on pristine master (canonical `champion_stats`
  absent from the test fixture).
- `9495b9eb` + `5c273fdd` FUNNEL1B3 (authoritative gameplay analytics
  outbox) — real overlap, reconciled:
  - it added `dsa_*` emission inside `daily_score_attack/service.py`, which
    this branch retires: the deletion stands (modify/delete resolved as
    delete). The `dsa_*` names stay in the analytics taxonomy; the Daily
    parent run emits no authoritative funnel event yet — a FUNNEL decision
    (not invented here).
  - it records `ranked_started`/`ranked_completed` per human participant and
    asserts `is_guest=False` because "a ranked match requires a registered
    account". Daily children are not Ranked play (and may now be guests), so
    they emit neither: `create_match_rows(host=...)` skips `ranked_started`
    for a hosted child (the factory passes `host="daily_challenge"`) and
    `_record_ranked_completion` skips a match bound to a Daily stage.
    Ordinary Ranked/Bot matches are unchanged
    (`test_daily_children_emit_no_ranked_funnel_events`).
  - `test_funnel1b3_gameplay_analytics.py`: 51/51 on this branch and on
    pristine master.

1. **Guest first Daily.** A verified anonymous (guest) Supabase session can
   start, play and finish the Daily - no signup first. The host decides
   access: `/api/daily-run` requires only a verified session; the Ranked
   per-match routes use `require_match_identity`, which admits the guest ONLY
   for a match bound to a Daily run (membership still enforced); live Ranked,
   the queue and every ordinary bot match keep the account-only rule.
   At the END, an anonymous player's completion shows the app's existing
   signup gate ("Save today's Daily Challenge", no guest dismissal) ->
   `/auth?mode=signup&returnTo=/quiz/daily-challenge` -> the existing
   `AccountUpgradePanel`, which converts the guest IN PLACE on the same user
   id, so the finished run (already stored under that id) is kept. No second
   account system.
2. **Daily readiness (planner stays generic).** `daily_challenge/wiring.py`
   `stage_readiness(content, kind)` = C compatibility + C resolves it for the
   stage's ruleset today + every segment yields REVIEWABLE misses (a
   replayable `quiz:` ref). `readiness_report()` exposes the per-(set, stage)
   verdict with its reason. Nothing is Fundamentals-only.
3. **Level-2 progression removed globally** (Ranked, Bot Ranked, Daily): new
   matches never level; legacy `(0,30,66)` matches replay single-level and
   stored choices are ignored; no pending state, gate, route
   (`level-two-choice` in Ranked and the staff prototype), schema, bot pick,
   projection keys (`progression_pending_players`, `progression_enabled`,
   `own_abilities.level2_*/level3_*`) or frontend Level-2 UI remain.
   `ranked_progression_choices` stays as a dormant table.
4. **Daily-hosted chrome.** Via the existing `host` seam only: a hosted child
   shows no "Ranked Duel" label, no "vs Bot/Opponent" line, no Forfeit
   control. Ordinary Ranked is unchanged.
5. **HP-era tests cleaned** and three real LH2.4-port collisions fixed (see
   Merge-gate verification).

## Exact starting refs
- backend  `origin/master` = `ded63efb4e8678f835b0557b8a4f0767db989280`
- frontend `origin/main`   = `45a322d4527ae449b6c817ae039c0303117b837a`
  (E/D were cut from `a9a7b45a`; main moved by one docs-only commit)

## Approved source commits → applied as
Backend (cherry-picked with `-x`, in this order):

| approved | applied | note |
|---|---|---|
| C `de47af84` | `9aa95fce` | clean |
| C `822d2b75` | `784083af` | clean |
| C `6e9d18f1` | `bef29589` | clean |
| A `470aa328` | `96bf07b4` | conflict in `ranked_formats/schema.py` (see below) |
| A `71093327` | `9f5186d4` | clean |
| B `476f7c1a` | `542c68ed` | clean |
| B `d8e059e7` | `e4f99e65` | clean |
| B `5ef56857` | `874a41cf` | clean |
| D `24772725` | `9a25d62b` | clean |

Frontend: E `8dc88f2d`→`d9c48cc3`, `24b7e0ef`→`97f31b04`,
`456df735`→`ac6494b2`, `58afceae`→`ac6bde4c`, `6d30b786`→`1d4de881`;
D `4034387d`→`8a8f749f`. All clean. None was already present on the deploy
heads (checked ancestry; nothing to skip).

### Prerequisite discovery (read this)
`origin/master` does NOT contain the LH2/SH1 lineage C/A/B were cut from, and
still carried the HP/outcome scoring infrastructure. C is built from that
lineage (`services/learning_attempts.py`, `ranked_public/runtime_casual.py`,
`ranked_public/study_hall*.py`, the Fundamentals presets) and LH2.4 is the HP
eradication the no-HP rule needs, so these owner commits were ported FIRST:
`08b29f94`→`a22832a1` LH2.1, `4f9944db`→`c08e65ae`, `c80cf474`→`a8e70635`,
`0c33ef42`→`d7357370` LH2.4, `0df11fdc`→`e9e164a6`, `4f516f56`→`5c8b0a88`,
`f96c7f80`→`23380914`, `49f1442a`→`80357b65`, `d66b97e3`→`ce951e66`,
`0010b0de`→`177bc0cb`. ENVVIS1/MRLVL1 commits in that range were already on
master under other SHAs and were skipped.

## Conflicts / reconciliations
- `api_server.py` (SH1.1b): master's GR1 mastery-state-lab router vs the Study
  Hall router → kept both.
- `ranked_formats/schema.py` (A): master's RBOT2 `content_roles` field vs A's
  `ruleset` field → both kept (`_FIELDS`, to_dict, from_dict).
- A vs RFX pacing: no code conflict. Master opens every round at
  `answerable_at`; A's ledger folds `[resolution.started_at, submitted_at or
  deadline)`, so lead-ins/reveals/transitions cost 0 by construction. Verified
  by tests and live.
- LH2.1/LH2.3 tests answered before `answerable_at` (pre-RFX lineage) →
  tests now answer at the answerable instant (master pacing wins).
- D's `test_ranked_availability` read a nonexistent `.message` (it had never
  been run) → `str(exc)`.
- B ↔ E: B was 1-based, E indexes arrays by `stage_index` → B's (never
  deployed) tables and plan are 0-based now.
- No HP/outcome behavior was resurrected (see No-HP audit).

## Final architecture
- Content: `content_sets/` (C). Rulesets: `ranked_rulesets/` (A). Host:
  `daily_challenge/run/` (B, pure orchestration behind ports).
- `daily_challenge/wiring.py` — the ONLY place B meets C/A/Ranked:
  - **CatalogContentPlanner**: per reusable kind, candidates = non-personal,
    non-historical catalog sets C declares compatible with that kind's ruleset
    AND that actually resolve now (probe); ordered by
    `sha256(daily-content:v1|seed|kind|id)`; DFS most-constrained-first,
    first unused candidate, backtracking → deterministic one-to-one matching;
    none → `InvalidContentAssignment` → 503, nothing frozen. B freezes it in
    `content_assignments_json` once per day. "Resolves now" is the Daily
    readiness gate (`stage_readiness`: compatible + resolvable + reviewable
    misses). With today's matrix Time Trial and Survival draw two distinct
    rapid-recall sets and Standard rotates over every Standard-ready set;
    Champion Mastery / Matchup join Standard's rotation as soon as they are
    Daily-ready (`test_focus_content_joins_the_rotation_once_it_meets_the_contract`).
  - **DailyWeakAreasGate**: False unless the user has a COMPLETED official
    Daily with `completed_at <` this run's cutoff; then C's
    `has_weak_areas_evidence(cur, user, cutoff, exclude, minimum=3)`.
    No window, floor or accuracy test.
  - **RankedStageMatchFactory**: `child_match_id = "dcr_" +
    sha256(launch_id)[:24]`; existing participant row → return it; else build
    the stage format and `create_bot_match(..., format_override=fmt)`; any
    creation error re-checks existence (racing creator won) before failing.
    Reusable: `resolve_content_set(id, ContentContext(now, user, seed=
    "<day seed>:<kind>"), ruleset_id=rid)` → `apply_ruleset(fmt, spec)`.
    Weak Areas: `evidence_before=frozen cutoff`, `exclude_session_ids=this
    run's children`, `length=5`, `allow_fallback=False`; < 3 → stage skipped
    (`weak_areas_unavailable`), never padded. Review: see below. Children are
    bot matches (`creation_source=bot_playtest`) → never rated.
    Daily host params: Time Trial bank 90 000 ms; Survival 3 strikes.
  - **Review** (`review_format`): B's frozen `review_items` in ordinal order
    → C's `freshen_question_refs` against current authorities → unservable refs
    dropped (never replaced) → one quiz segment per ref with
    `module_config.question_ref` → `ranked_public/exact_ref.py` re-materializes
    that exact ref at segment open (runtime-casual `compose`, or the certified
    shared-bank record index), frozen into `ranked_rounds` like any round.
    None servable → `ChildStageSkipped("review_items_unavailable")`. B's
    allocation (one per prior stage first, then fill, dedupe, shorter, zero →
    perfect/skip) is unchanged.
  - **RankedStageResultReader**: lazily advances the child
    (`get_rehydrated`), `finished = ranked_matches.status == complete`
    (covers segments_complete / time_bank_exhausted / strikes_exhausted);
    misses = human's `incorrect` OR `timeout` outcomes from the immutable
    per-round SETTLEMENTS (not submissions, so timeouts are never lost), in
    round order, `quiz:<key>` refs + family. Only settled rounds are read.
  - **present()**: B snapshot + `server_now`, per stage `ruleset` spec,
    `content {title, focus}`, `result` (reader summary) / `skip_reason`,
    active-stage `live {time_bank {total_ms, remaining_ms, as_of, draining,
    answerable_at, deadline, answered}, strikes {used, max}}`; review items
    exposed without refs.
- Ranked seams: `create_bot_match(format_override=)`, quiz
  `module_config.question_ref`, viewer's `ruleset` view in public/private
  projections, `host: "daily_challenge"` in `/api/ranked/active-match`
  (the Ranked page hands a Daily child back to the Daily; the queue ignores
  it), and Daily children excluded from Ranked history.
- API: `/api/daily-run` (B's routes) registered + `migrate_add_daily_runs`;
  requires a verified session - a guest (anonymous) session is allowed (see
  Merge-gate 1); 503 `DAILY_RUN_NOT_WIRED` when Ranked is disabled.
- Frontend: `/quiz/daily-challenge` → E's `run/DailyRunPage` (hosted
  `QuizRankedMatch` via `MatchHost`); Hub Daily status reads
  `GET /api/daily-run/today`; `/quiz/daily` redirects to the Daily; D's
  availability gates the PLAY seal (closed/unknown → Daily directly, no popup,
  no badge; open → badge + existing popup).

## Files changed / retired (high level)
Backend new: `daily_challenge/wiring.py`, `ranked_public/exact_ref.py`,
`test_dcmod_integration_daily.py`, `test_dcmod_retired_daily.py`.
Backend changed: `ranked_public/{service,projections,runtime_casual}.py`,
`ranked_formats/schema.py`, `routes/{daily_run,ranked_public}.py`,
`api_server.py`, `daily_challenge/run/{plan,ports,service}.py`,
`migrate_add_daily_runs.py`, `quiz/daily_review.py` (self-contained),
two scripts, several tests.
Backend RETIRED: `daily_challenge/{composition,engine,errors,grading,outcome,
plan,projection,repository,rewards,rules,service,snapshot,timing}.py`,
`routes/daily_challenge.py`, `schemas/daily_challenge_schemas.py`,
`migrate_add_daily_challenge_v2.py`, `daily_score_attack/` (9 files),
`routes/daily_score_attack.py`, `schemas/daily_score_attack_schemas.py`,
`migrate_add_daily_score_attack.py`, `migrate_dsa_runtime_identity.py`,
`dc1_phase{1,2,3,4}_fixture_support.py`, DC1/DC2 runtime tests
(phase1–4 runtime, theme categories, rg2 daily timeline) and
`test_daily_score_attack_*`. Kept: all `test_dc1_ability_*` and other
data-authority tests; `test_con1_daily_frozen_cards.py` (now INSERTs rows).
Tables: nothing dropped. `dc2_*` is still read by the Content Factory export
(`quiz/daily_review.py`); `dsa_*` is still read by production audit/promotion
scripts. A fresh DB no longer creates either.
Frontend RETIRED: DC2 page/controller/view model/views/panel/summary/
explanationPolicy/testFixtures, `lib/daily-challenge/{client,contracts}.ts`,
`pages/QuizDailyScoreAttack*`, `components/quiz/QuizScoreAttackCard*`,
`pages/dev/daily-score-attack/`, `Quiz.scoreAttackHub.test.tsx`, the
inspector's Time Trial scene, the admin-registry entry. (The score-attack
deletions landed in commit `76c329be` alongside DC2 because `git rm` had
staged them; `3e2514fa` carries the rest of that retirement.)
Study Hall ids: the current frontend has NO `practice.*` / Recent Review /
Study Hall call sites (verified by search) — nothing to migrate there. The
backend Study Hall host uses C's ids.

## Tests
Backend (env `RANKED_PUBLIC_ENABLED=1 RANKED_FORMATS_ENABLED=1
RANKED_RATELIMIT_ENABLED=0`): `test_dcmod_a_rulesets`, `test_dcmod_c_content_sets`,
`test_dcmod_b_daily_run`, `test_dcmod_integration_daily` (30),
`test_dcmod_retired_daily` (8), `test_ranked_availability`,
`test_ranked_public_queue_routes`, `test_lh24_points_only_scoring`:
**173 passed** (before the retirement test file) + retirement 8 passed.
LH2/SH set: LH2.1–2.5 + SH1.1 pass; 4 known failures (`no such table:
quiz_questions` fixture gap) fail identically on `origin/master`.
Broad Ranked sweep (88 files) vs `origin/master`: 179 "new" failures, ALL of
which already fail at the ported LH2.4 commit itself (HP-era fixtures: formats
without `match_length`, `full_damage=` kwargs, HP/damage expectations, legacy
item-cost-duel configs). None caused by C/A/B/D or integration wiring. Two
modules (`test_rp1_ranked_points_v2`, `test_rb4a_exhaustive_playtest`) no
longer import (`SCORING_ADDITIVE`, `_rb4a_worst_case_damage` removed by LH2.4).
Retirement: review/content-factory/quiz suites identical to baseline
(146 f / 949 p both sides).
Frontend: Daily run/page/boundary/entry 49 passed; hosted QuizRankedMatch,
D availability hook, Hub playCommit, Quiz.playScroll, route guards,
activeMatch, funnel surfaces all pass. Broad sweep (quiz-ranked, components/
quiz, ranked-arena, ranked-core, ranked-public, playtest, ranked-rules,
lobby-preview, funnel, feedback, admin, route guards): after pinning D's
availability open in `Quiz.playScroll`, no failures beyond the baseline set
(e.g. `QuestionStageGeometry` ×3 fail identically on `origin/main` — Windows
CRLF/path). `tsc -p tsconfig.app.json`: 25 errors, all in untouched files
(admin, broadcast, gif export, team-sim, identity, …). `vite build`: passes;
`DailyRunPage` chunk emitted.

## Manual / production-shape certification
Live stack: the real `api_server.app` (uvicorn, full startup migration chain)
over a fixture DB (certified shared-bank pools, items; champion runtime corpus
patched at `quiz.runtime_casual` exactly as in the integration tests), HS256
test tokens, and the real frontend (`vite` dev, `VITE_E2E_AUTH=1`) in a browser.
Harness lived in scratch space only; nothing of it is committed.

- **A. First Daily, Ranked closed — PASS.** No badge; PLAY → `/quiz/daily-challenge`
  directly (no popup). Daily intro lineup (Standard, Time Trial, Survival,
  Review) → stage tag → hosted canonical match → stage result
  ("5/6 correct · 1 question saved for Review" — a TIMEOUT counted) → next
  stages → Review (exact refs: one per stage, incl. timeout misses; format
  `daily_review` with `question_ref` segments) → ONE "Daily Challenge Complete"
  recap. No Victory/Defeat or Ranked end screen between stages. All children
  `rating_application_status = skipped`.
- **B. Eligible later Daily — PASS.** Player with 2-year-old practice misses +
  a completed Daily yesterday (seeded rows): 5 stages, same frozen order and
  content as A plus `weak_areas` in its frozen slot; the Weak Areas tag
  ("Built from what you've missed before") → `content_weak_areas` child with 4
  family slots from the historical misses, Standard ruleset, bot child. (Earlier
  stages were driven to completion over the real HTTP API by timeouts.)
- **C. Time Trial — PASS after a fix.** First run found the meter FROZEN for a
  whole answer window when the Daily snapshot was read during a lead-in
  (server `draining=false` at `as_of`). Fixed (`8136274a` / `7d171c6b`).
  Re-certified: drains ~1 s/s only while answerable, holds flat through every
  reveal/transition (e.g. 75 540 ms held 2.5 s, 73 361 ms held 2.6 s),
  resumes on the next question; display within 80 ms of the server's value.
  Ended `time_bank_exhausted` → "bank ran out"; its timeouts went to Review.
- **D. Survival — PASS.** Readout "N of 3 mistakes left" (never HP); ended
  `strikes_exhausted` at round 3 (timeout, timeout, incorrect); the bot's own
  incorrect answer ended nothing; "OUT OF MISTAKES · 3 questions saved".
- **E. Perfect day — NOT run live** (needs a flawless multi-stage run by
  hand). Covered by `test_perfect_day_skips_review` (real adapters: Review
  skipped, `outcome=perfect`, no child) and E's page test ("Perfect day —
  nothing to review").
- **F. Ranked open — PASS to the queue.** Badge "Ranked available"; PLAY opens
  the existing popup (its Daily row read "Today's Challenge Complete" from the
  parent run); Ranked → role card → Enter the Queue → server join passed the
  availability gate and was refused only by `RANKED_QUESTION_POOL_UNAVAILABLE`
  (the fixture has no production pool). This run also found Daily children in
  the Hub's "Recent Ranked"; fixed (`1e099c84`) and re-checked live.
- **G. Refresh mid-child — PASS.** Reload during the Time Trial child resumed
  the same child/stage straight into the arena, no intro/tag replay.


## Merge-gate verification (2026-09-22)
Backend (env `RANKED_PUBLIC_ENABLED=1 RANKED_FORMATS_ENABLED=1
RANKED_RATELIMIT_ENABLED=0`): DCMOD A/B/C/D + `test_dcmod_integration_daily`
(33, incl. guest funnel, ownership, live-Ranked identity unchanged,
readiness planner) + `test_dcmod_retired_daily` + availability + queue routes
+ points-only + `test_ranked_no_level_two` (11) + FUNNEL1B3 (51):
**241 passed** (after the final master merge).
Broad Ranked set vs pristine master `b5d15c1f`: master 437 failed / 2299
passed; branch 426 failed / 2161 passed (fewer tests: obsolete ones
deleted). Against `5c273fdd` the full-run baseline reported 175 failed /
469 skipped because of an ORDER-DEPENDENT skip in six media/premise files;
run standalone those six files fail identically on both trees (262 = 262,
zero new). The only node-level "new" failure is a renamed test whose
original fails identically on master (`quiz_questions` fixture gap).
HP-era cleanup: ~91 functions + ~20 parametrized cases deleted (HP/damage/
outcome/Level-2 preservation), many rewritten to points-only, both
non-importing modules import again; item-cost-duel client/flow tests that
asserted the retired v1 lane (`correct_item_id`, quiz v1) deleted (41
functions) - the lane is v4 Meta Reflex, covered by the meta-reflex suites.
Real bugs fixed from the LH2.4 port colliding with newer master:
Meta Reflex points settlement `damage=` -> `points=` (TypeError on every
block settlement); builder catalog quiz v2 key / removed `SegmentSpec.scoring`;
ICD test format v4 block missing `families`.
Frontend: Daily / quiz-ranked / ranked-arena / ranked-core / ranked-public /
dev duel prototype / Hub suites: only known baseline failures remain
(QuestionStageGeometry x3, AnswerGrid.elimination x2, QuestionTimeline x14,
playModeCard x2, Quiz.rankedRole Practice x1 - all fail on origin/main).
`tsc`: 25 errors, all in untouched files. `vite build`: passes.

Live smoke (real server + real frontend, fixture DB, HS256 test auth, E2E
identity): a guest started the first Daily from Hub PLAY (Ranked closed) with
no signup; played Standard -> Time Trial -> Survival -> Review; no Level-2
interruption anywhere; the hosted header showed no Ranked Duel / vs Bot /
Forfeit; the Time Trial bank drained only while answerable and held flat
(70 000 ms) through reveal/transition; Survival ended `strikes_exhausted` on
the 3rd mistake (readout 3 -> 2 -> 1 "mistakes left"; the bot's mistakes
ended nothing); Review served exactly the three allocated refs in order; the
finished day showed the save gate (hit-test confirmed on top) -> Create
Account -> `/auth?mode=signup&returnTo=/quiz/daily-challenge` "Save your
progress... on the same profile" (no credentials submitted). Ordinary Bot
Ranked for a signed-in player still shows "Ranked Duel - vs Bot" + Forfeit
and plays with no Level-2 prompt. `readiness_report` lists the Fundamentals
ready for all three stages and Mastery/Matchup unavailable with concrete
reasons.

## Current state
Both integration branches pushed (frontend head when written: `7981b034`).
Deploy branches untouched.

## Remaining blockers / next action
- Owner review + merge of both branches together (backend first: the new
  frontend needs `/api/daily-run`).
- **Content not Daily-ready today (readiness, not product):**
  - Champion Mastery / Matchup (Standard only in the V1 matrix): their
    Mastery-slice segments are multi-card applied chains whose misses carry
    per-card concept refs inside a generated chain - Review cannot yet replay
    one exactly (`review_contract` gap). Where no quality-eligible focus or
    corpus exists they are also `unresolvable`. They join the rotation as
    soon as a Review ref contract for Mastery cards exists (or the content
    yields `quiz:` refs), with no planner change. Matchup is additionally
    deferred inside GR1.
  - Combat calculations, Pro Play: no content-set catalog entry / resolver
    branch yet (C's architecture: add a catalog entry + resolver branch +
    its compatibility row).
- Invite IA: with Ranked closed, PLAY bypasses the popup, so Invite is not
  reachable from the seal (known D follow-up; not invented here).
- Anonymous players can play every Daily, not only the first; the save gate
  shows at the end of any anonymous Daily. If later Dailies should REQUIRE
  an account, that is a small host-policy check in `require_player`.
- The ability hotbar was gated on `progression_enabled`, which no longer
  exists, so it never renders in Ranked (it already never rendered in points
  matches frozen without progression). Ability effects themselves are
  HP-era and out of scope; product may want a follow-up.
- Level-2 remnants intentionally left in dev-only pages (the local duel
  prototype's own model, arena-inspector samples, shell-probe switch) and in
  docs (`docs/ranked-public-service.md`, `TANK_BALANCE_EXPERIMENT_SPEC.md`).
- `package-lock.json` on origin/main is out of sync with `package.json`
  (drizzle deps), so `npm ci` refuses; pre-existing, not touched here.
- dc2_*/dsa_* tables remain dormant for the Content Factory export and
  production audit scripts; drop once those are retired.

## PRODUCTION MERGE (2026-09-22)
Supersedes "Current state" above: both integration branches are now on the
deploy branches and live. Normal merge commits only; **no force-push** in
either repo; no tags.

### Backend (League_Combat_Simulator)
- Pre-merge `origin/master`: `cf5c1fd5` (moved past the handoff's `5c273fdd`
  by 4 commits: `666281e5` GR1 composition v2 (Lab only), `1b3b83df` +
  `0a8b4389` Pro Stats explorer + warm-up, `cf5c1fd5` PSE docs).
- Late reconciliation: `origin/master` merged into `dcmod/integrate-daily`
  as `9071f292` (from approved tip `76803e65`). Textual overlap only in
  `api_server.py` (Pro Stats warm-up thread in `lifespan`) and `conftest.py`
  (`PRO_STATS_WARMUP=0`); auto-merged, both sides kept. No semantic overlap:
  composition v2 is not the default and Daily does not use `mastery/setup_state`.
- Master merge: **`9ebe7310`** (`--no-ff` of `9071f292`; tree identical to
  the tested integration tree). Pushed `cf5c1fd5..9ebe7310`.
- Final gate on `9071f292` (env `RANKED_PUBLIC_ENABLED=1 RANKED_FORMATS_ENABLED=1
  RANKED_RATELIMIT_ENABLED=0`): DCMOD A/B/C/D, `test_dcmod_integration_daily`,
  `test_dcmod_retired_daily`, `test_ranked_availability`,
  `test_ranked_public_queue_routes`, `test_lh24_points_only_scoring`,
  `test_ranked_no_level_two`, `test_funnel1b3_gameplay_analytics`:
  **241 passed**. Import smoke: `api_server` imports; OpenAPI lists
  `/api/daily-run/*`, `/api/ranked/availability`, `/api/admin/analytics/health`.
  Newly arrived master suites: `test_pro_play_explorer_search` passes;
  `mastery/tests/test_gr1_slice_composition_v2.py` cannot run locally on
  either tree (needs a populated `lol_calc.db`; `champion_abilities` absent /
  DB unopenable on pristine master too) and its `test_the_footprint` is a
  branch-scope git-diff check. Environmental, not a regression.
- Railway: new build serving ~9 min after push. Production checks:
  `/api/health` 200; `/api/ranked/availability` 200 (`open:false`,
  `reason:not_configured`); `/api/daily-run/today` 401 `SESSION_REQUIRED`
  unauthenticated (was 404 before deploy) and 200 with a guest session;
  `/api/admin/analytics/health` 403 "Admin authorization required" (same as
  before deploy); no 5xx over repeated polling. Startup completed (new routes
  served). Railway logs NOT inspected (no CLI/log access in this pass):
  migration lines, analytics-drainer start and drainer auth failures are
  unverified from logs.

### Frontend (mogsy)
- Pre-merge `origin/main`: `adda486e` (moved past `2780b8bc`: GR1 docs
  `20d6161d`/`57344a41`, Pro Play explorer `ba107e42`, `1f031926`,
  `0c327987`, `51c8a7df`, `adda486e`). Zero file overlap.
- Late reconciliation: `origin/main` merged into `dcmod/integrate-daily` as
  `8e2104be` (from approved tip `0947a04c`), then `ea2f8da9` test-only:
  `Quiz.hub.test.tsx` pins Ranked availability open for its PLAY-record test
  (same pin as `Quiz.playScroll`; that test already failed at `0947a04c`
  because closed Ranked correctly bypasses the popup).
- Main merge: **`e51d9786`** (`--no-ff` of `ea2f8da9`; tree identical).
  Pushed `adda486e..e51d9786` from a detached worktree (local `main` has 3
  unrelated unpushed commits and was not touched).
- Tests on `ea2f8da9`: Daily (lib run, page, boundary, entry), hosted /
  noLevelTwo / forfeit QuizRankedMatch, Hub playCommit, Quiz.playScroll,
  Quiz.hub, RankedPlayScroll, useRankedAvailability, activeMatch, pro-play
  suites: all pass except `Quiz.hub` "keeps exactly one h1", which fails
  identically on `origin/main`. `vite build` passes (`DailyRunPage` chunk).
- Deploy: mogzy.lol served the new bundle (`index-C-P8Xdve.js`, contains
  `DailyRunPage`) ~7 min after push.

### Production smoke (mogzy.lol, guest, built-in browser)
1. Hub loads (anonymous guest profile). PASS
2. Ranked closed: no "Ranked available" badge; PLAY -> `/quiz/daily-challenge`
   directly, no popup. PASS
3. Guest began the Daily with no signup (session `is_anonymous: true`). PASS
4. Hosted match: no Level-2 prompt, no "Ranked Duel", no "vs Bot", no
   Forfeit control, points only. PASS
5. Time Trial encountered (League Fundamentals): completed normally,
   11 answered, `segments_complete`. Bank drain was not timed by hand. PASS
6. Survival (Item Fundamentals): "MISTAKES LEFT" readout, ended
   `strikes_exhausted` after 3 misses; no HP. PASS
7. Review stage served 3 items; final "DAILY CHALLENGE COMPLETE" recap
   (Standard, Time Trial, Survival "out of mistakes", Review). PASS
8. Guest completion showed "Save today's Daily Challenge" -> Create Account
   -> `/auth?mode=signup&returnTo=/quiz/daily-challenge` "Save your
   progress ... on the same profile". Nothing submitted. PASS
9. Ranked-open popup: not testable, production schedule is closed
   (`not_configured`); schedule not altered.

### Observations (recorded only, no change made)
- Production Standard stage (Champion Fundamentals) ended
  `segments_complete` after **4** rounds while the round ribbon showed 10
  slots. Likely production content depth (prod `/api/quiz/sets` reports
  Champion Basics `question_count: 0`); readiness item to confirm, not a
  merge defect.
- mogzy.lol logs several 403 resource loads in the console on the Hub
  (pre-existing, not investigated).
- `/api/live-esports/health` reports hot DB 676.8 MB, over `max_mb` 512
  (unrelated to DCMOD).
- Open follow-ups from above unchanged: Mastery/Matchup Review ref contract,
  Combat calculations / Pro Play content-set entries, Invite entry with
  Ranked closed, ability hotbar, dormant `dc2_*`/`dsa_*` tables,
  package-lock drift, Railway log verification of migrations + drainer.

## POST-LAUNCH AUDIT — Daily Standard stage length (2026-09-22)

Production showed a TEN-slot round bar over a Daily Standard stage (Champion
Fundamentals) that completed after FOUR questions, and `/api/quiz/sets`
reported Champion Basics with `question_count: 0`. Two separate display
defects; the Daily's content and its backend contract were correct throughout.
No Daily redesign, no content-universe or GR1 change, no padding.

### Finding 1 — the round bar was never told the plan (UI was wrong)
* `content_sets/fundamentals.py` declares Champion Fundamentals as FOUR
  curriculum slots, so the resolved Standard format freezes
  `match_length = len(segment_pattern) = 4`. Four questions is the
  curriculum, not a shortfall, not candidate exhaustion, not a thin corpus.
* `src/lib/ranked-core/roundTimeline.ts` has had a finite-plan branch
  ("the strip IS the plan") since ARENA1, but the ONE production call site
  (`QuizRankedMatch.tsx`) never passed `totalRounds`. The projection therefore
  fell back to its indefinite window — `TIMELINE_VISIBLE_NODES = 9` plus one
  off-edge buffer node = the ten slots seen — which is independent of
  `match_length`. The header counter, which does read the server field,
  correctly said "1 / 4" beside it; the two disagreed because they had
  different sources.
* Not a cause: catalog counts, provider depth, clean-depth, candidate
  exhaustion, `match_length`, missing canonical data. The child match and the
  server contract were right.

### Finding 2 — `match_length` means two different things
Rulesets do not touch length (`apply_ruleset`), but the CONTENT RESOLVER sets
it per ruleset (`content_sets/resolver.py`):
* standard/review: `match_length` = the plan (== `len(segment_pattern)`);
* time_trial/survival: the pattern CYCLES and `match_length` is the clean
  CANDIDATE CEILING (`content_sets/depth.py`) — production Survival on Item
  Fundamentals froze 377, and the header read "1 / 377".
The client was never told which reading it had, so a blanket fix would have
drawn a 377-slot strip. `plannedRoundTotal` now makes that distinction from
the `ruleset` block the server ALREADY publishes per viewer
(`ranked_public/projections._ruleset_view` -> `ruleset_id`), which the
frontend simply never parsed. A rapid-recall stage is open-ended to the
client — the shape an hp match has always had — so it keeps the sliding
window and drops the denominator. Nothing invents, shortens or pads a length.

### Finding 3 — Champion Basics `0` was a COUNT PROJECTION BUG
`/api/quiz/sets` counted stored `quiz_questions` rows only, while the serving
path (`/api/quiz/questions?set=`) draws stored rows AND runtime-composed keys
(`_runtime_keys_for_pull`, QCA4). Champion Basics is entirely runtime-backed,
so it advertised 0 while production genuinely served `champion_stat_level`
questions from it (verified live). This breaks the endpoint's own stated
invariant ("question_count must equal what the serving path can hand out") in
the opposite direction to the DC1 over-advertising defect. Fixed by counting
the same runtime pool the pull uses, narrowed per set exactly as the SQL join
narrows. It is UNRELATED to the Daily: the Daily draws from
`quiz.runtime_casual` and the certified shared-bank pools, never from
`quiz_questions`.

### Files changed
Backend (League_Combat_Simulator) — no product/runtime change to Daily:
* `routes/quiz.py` — sets listing counts the runtime pool too (Finding 3).
* `test_dcmod_stage_length_contract.py` (new, 23 tests) — what a resolved
  stage's `match_length` MEANS, per ruleset.
* `test_quiz_sets_active_count.py` — 3 tests for the runtime-backed count.

Frontend (mogsy):
* `src/lib/ranked-core/stagePlan.ts` (new) — `plannedRoundTotal`: the one
  place that decides plan vs ceiling.
* `src/lib/ranked-public/contracts.ts` — parse the `ruleset` block's
  `ruleset_id` (absent/unreadable reads as null = standard).
* `src/pages/quiz-ranked/QuizRankedMatch.tsx` — pass `totalRounds` to
  `projectRoundTimeline`; entry card takes the plan, not the raw length.
* `src/pages/quiz-ranked/rankedViews.ts` — `moduleProgressLabel` counts
  against the plan; a rapid-recall stage shows the module number alone.
* `src/lib/ranked-core/stagePlan.test.ts` (new, 13 tests).
* `src/components/ranked-arena/QuestionStageGeometry.test.tsx` — its source
  assertion follows the new expression (intent unchanged: no "MODULE" word).

### Authoritative behaviour now
* Standard / Review: the strip draws exactly `match_length` slots — four for
  Champion Fundamentals — and the counter reads "n / 4". The displayed total
  IS the playable stage length.
* Time Trial / Survival: open-ended. Sliding window, module number with no
  denominator; the stage ends on the bank, the strikes, or genuine candidate
  exhaustion, and the ceiling is never drawn or advertised.
* No repeat padding anywhere: a Standard plan's slot sources are distinct and
  `match_length <= len(pattern)`, so the cycling index never comes round; a
  rapid-recall corpus too thin for one lap is REFUSED (`ContentUnavailable`),
  never padded.

### Tests
Backend: `test_dcmod_stage_length_contract` 23 passed;
`test_quiz_sets_active_count` 10 passed (7 existing + 3 new); DCMOD A/B/C/D +
integration + retired + no-Level-2 + points-only + the quiz-route suites:
283 passed / 7 skipped. Full `test_quiz*`/`test_qca*` sweep vs unmodified
HEAD with deterministic ordering: 166 failing nodes on BOTH trees, byte-
identical lists — zero new failures (they need a populated `lol_calc.db`).
Frontend: `stagePlan` 13 passed; ranked-core / quiz-ranked / ranked-arena /
ranked-public / Daily suites 2016 passed with only the documented baseline
failures (QuestionStageGeometry x3, AnswerGrid.elimination x2 — all fail on
`origin/main`). `tsc`: 20 errors, all in untouched files, none in the changed
ones. `vite build` passes.
