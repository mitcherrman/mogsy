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
    `content_assignments_json` once per day. Today's matrix: Time Trial and
    Survival draw two distinct Fundamentals; Standard rotates over the rest
    (third Fundamentals, Champion Mastery, Matchup — seen over 90 days).
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
  requires a signed-in non-anonymous account (children are Ranked matches);
  503 `DAILY_RUN_NOT_WIRED` when Ranked is disabled.
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


## Current state
Both branches pushed (see report). Deploy branches untouched.

## Remaining blockers / next action
- Owner review + merge of both branches together (backend first: the new
  frontend needs `/api/daily-run`).
- Prune the LH2.4-stale HP-era tests (179 + 2 modules) in a dedicated cleanup;
  they fail identically at the LH2.4 commit.
- Invite IA: with Ranked closed, PLAY bypasses the popup, so Invite is not
  reachable from the seal (known D follow-up; not invented here).
- Anonymous players cannot play the Daily now (403 `ACCOUNT_REQUIRED`,
  message "Sign in to play…") because every stage is a Ranked match.
- Mastery/Matchup Standard stages contribute no Review items (multi-card
  rounds carry no `quiz:` ref). Review replays quiz questions only.
- The hosted child still shows Ranked's "RANKED DUEL / vs bot" strip label,
  the Level-2 ability choice (existing RFX progression, with its existing
  "damage"/"shield" ability copy) and a "Forfeit match" link — existing
  canonical Ranked chrome, left as-is; product may want host-aware copy.
- dc2_*/dsa_* tables remain dormant for the Content Factory export and
  production audit scripts; drop once those are retired.
