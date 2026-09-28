# HUB6.3A — Premium Analytics Data & Contract Blueprint

Status: **audit / specification only.** No production frontend or backend code, migration or fixture was changed. Not pushed.

Authority chain: `HISTORY_ANALYTICS_SPEC.md` (main checkout, untracked) → `HISTORY_ANALYTICS_B_HANDOFF.md` (backend) → `HUB5_HANDOFF.md` → `HUB6_HANDOFF.md` → **this file** for HUB6.3.

## 0. Bases inspected

| Repo | Ref | Role |
|---|---|---|
| Frontend `mogsy` | `hub6/ranked-hub-visuals` `39231649` (worktree `.worktrees/hub6-visuals`) | HUB6.2 shell (frozen interaction architecture) |
| Frontend | `origin/main` | 29 commits not in HUB6; only `QuestionReviewCard*` overlaps History files |
| Backend `League_Combat_Simulator` | `codex/history-analytics-b` `1ffa624c` (worktree `.worktrees/history-analytics-b`) | HUB2.3 History projection + Workstream A provenance |
| Backend | `origin/master` `f6b6f012` | **Production.** Contains JOURNEY3–5. Does **not** contain HA-A/HA-B/HUB2.x (6 commits) |

Files read directly: `history/daily.py`, `routes/history.py`, `migrate_history_analytics_{a,b}.py`, `daily_challenge/run/service.py` (review link, skip paths), `daily_challenge/wiring.py` (`review_format`), `ranked_public/service.py` (`_frozen_child_identity`), `quiz/public_category.py`, `daily_challenge/recipe.py` (both refs), `JOURNEY5_RELEASE_HANDOFF.md`; frontend `src/lib/history/contracts.ts`, `QuestionTimeline.tsx`, `questionIcons.ts`, `historyFormat.ts`, `StageAnalytics.tsx` (facts), Timmy fixture pipeline + golden. Two read-only sub-audits covered Ranked settlement, ruleset ledgers, family sources, Weak Areas/Review writers, entitlement, aggregates/scheduling, streaks and records; their load-bearing claims were spot-verified.

---

## 1. Findings that change the plan (read these first)

1. **HUB2 History is not in production.** HA-A (provenance columns, `question_result_id`, frozen `questions` in `result_json`) and HA-B/HUB2.1–2.3 (`/api/history/v1`) exist only on `codex/history-analytics-b`. `origin/master` moved 16 commits (JOURNEY3–5) through the same writers: `daily_challenge/wiring.py` (+613), `ranked_public/service.py` (+418), `ranked_public/persistence.py` (+91), `recipe.py` (+1207). **Every HUB6.3 backend item depends on first re-landing HA-A/B on `origin/master`.** Expect real conflicts (HA-A's `_frozen_child_identity` was written against the pre-Journey slice).
2. **Perfect and skipped-stage Dailies silently drop out of run analytics.** A Review skipped as perfect writes `result_json = {"perfect": true}` (`service.py:666`); an unservable stage writes `{"skipped_reason": …}` (`service.py:436`). Neither has a `ruleset`, so `_stage_compat` → `None` → `_run_compat` → `None` → run capability `insufficient_evidence / missing_frozen_compatibility` (`daily.py:97,115,504`). **The best possible Daily can never be a personal record.** P0 fix before any record work.
3. **Review → source linkage is exact only when no allocation is dropped.** `_link_review_results` zips ordered allocations with the Review child's results by position (`service.py:565-595`). `review_format` drops unservable allocations and renumbers the served ones (`wiring.py:533-540`); the drop list is discarded. A dropped middle allocation shifts every later link. Persistence fix required before a per-question connector ships.
4. **Weak Areas has no per-question source.** Selection evidence (`WeakAreasEvidence.provenance()`) is computed and discarded (`wiring.py:642-657`). Each slot is a *family*; the served question is any current question in that family, **not the missed question**. Only `evidence_cutoff` and `weak_areas_policy_version` survive (`daily_run_stages.context_json`). "Exact source miss" does not exist to project; the honest provenance is "family F, missed N times before cutoff C".
5. **`family` is not a public grouping, and neither is `category`.** ~130 family strings across three namespaces (84 quiz contracts, ~30 Meta Reflex `family_id`s like `champion_stat:hp@lvl11`, ~13 Mastery enums), with no version and collisions (`ability_cost` vs `ability_cost_rank`). `category` is a bank name for curated rows but the raw family id for Mastery (`cooldown_with_haste`) and Meta Reflex (`champion_stat:hp`). **The public grouping is RG2's `public_category_for(family, stored_category, module_id)`** (10 categories + Meta Reflex + "Question" fallback). History does not project it today.
6. **`concept` is always NULL in real writes** (`ranked_public/service.py:1478` reads `challenges[i].concept_id`; no module writes it). All concept analytics are dead in production; Timmy's concept values are fixture-authored.
7. **Daily score is not monotonic in performance.** Review exists only when there are misses (one per earlier stage) and awards points (curated 2 + 1 speed; generated 1 + 1). A perfect Daily skips Review and earns 0 Review points. Splash/Meta Reflex/Journey also carry a +1 "strictly faster than the bot" bonus. "Highest Daily score" and "Daily score percentile" therefore need an owner decision (§6, §9).
8. **Survival strike attribution *is* derivable.** Contrary to HUB6.1's table: strikes are one per `incorrect`/`timeout` question row, clamped at `max_strikes`, and PRE-4 stops a slice at the striking child (no later rows). So strike *k* is the *k*-th miss in `(round_number, challenge_index)` order for *k* ≤ max. Nothing is persisted, but it is a deterministic server projection.
9. **"Questions played" is truthful for Time Trial.** One `ranked_segment_child_results` row per question shown and terminally settled, including per-question timeouts and the question cut off by the bank (clamped deadline → `timeout` row). Exceptions: the in-flight question of a forfeit/no-contest (no row; `ended_by` reported as `completed`), and a best-effort insert failure (logged, swallowed).
10. **The timeline cannot show timeout today.** `QuestionTimeline` derives its ring from the review payload (`questionOutcome`): `correct | incorrect | unanswered`; a timeout renders as the grey "unanswered" ring, and a multi-question round is "correct" only if every child is correct. The History DTO already carries per-question `outcome ∈ {correct, incorrect, timeout}`.
11. **Standard module 10 is a Journey in production.** `origin/master`: `S S S S MR S S S MR JOURNEY` — 22 interactions, Journey = 5 children on a 150 s pooled active clock; children after pool exhaustion get **no row**. `1ffa624c` (and Timmy's full-length fixture) use the older 4-step block-clocked slice, which writes unreached steps as `timeout`. Fixtures must move to the Journey shape.

---

## 2. Owner requirements

### A. Confidently approved (build these)
Larger persistent timelines with more than five icons when width permits; unmistakable correct/incorrect/timeout outcome; comprehensive Premium analytics; previous Daily and previous same-stage comparisons; personal historical performance; personal records; streak counters and comparisons; global Mogzy comparisons; varied visualizations incl. pie/donut; hover/focus/tap interaction with legends; question/family breakdowns where the grouping is objectively meaningful; charts cross-highlighting the actual question icons; large Premium expansions; Daily and each core stage with their own analytics; a factual "strongest mode".

### B. Cautiously approved (design, keep marked "proposed" until visual review)
Per-module points; per-question population correct rate ("62% of players got this right today"); Review nested donut by source stage; Survival "reached the end" marker; trajectory direction label; historical Review C/A; Weak Areas previous C/A; exact-question exposure history in hover; global family correct rate.

### C. Not approved (do not surface; do not add to new DTO blocks)
Recurring weakness, recovered weakness, mastered/recovered/weak conclusions, learning-state classifications, "recovery" framing of Review, Weak Areas conversion, fewest-strike records, best-accuracy records, composite records.

---

## 3. Terminology decisions

| Topic | Decision | Basis |
|---|---|---|
| Percentage-point differences | UI never prints `pp`. Use "89% vs 79%" + "10 points higher", or "Accuracy +10 points". Backend names (`previous_run_delta_pp`, `accuracy_points`) may stay. | Owner lock |
| Rounding of a displayed difference | **Compute the displayed points from the two displayed (rounded) percentages**, so "90% vs 79%" never reads "10 points". Server sends raw fractions. | Avoids self-contradicting copy |
| Time Trial count | "Questions played" (e.g. "28 questions played", "1 fewer question than previous"). Backend keeps `settled_questions`. **Verified truthful** (finding 9). Edge: a forfeited TT omits the in-flight question; label stays accurate ("played" = settled). | Engine audit |
| Daily/Stage `answered` | `answered` **includes timeouts** everywhere (question-row count). "Correct / answered" is acceptable but slightly inaccurate for timeout-heavy TT; recommend "25 of 28 correct" or "25 / 28" with the timeout count visible. | `daily.py:188` |
| Survival depth | "Depth" = questions played before the end (question grain, includes misses). Not modules/rounds. | `daily.py:433` |
| Standard unit names | Splash, Meta Reflex, **Journey** (production). "Slice" only for legacy/1ffa624c records. Unit name is not projected yet (§10 row S2). | `recipe.py` origin/master |
| Stage/Daily outcome names | correct / incorrect / timed out. Never "unanswered" for a timeout. | DTO outcome enum |
| Question grouping label | RG2 public category label (e.g. "Itemization"), never a raw family id. | Finding 5 |
| Review | "Replayed", "replay correct/missed". Never "recovered"/"mastered". | Owner lock C |

---

## 4. Current data capabilities (exact)

**Wire (`/api/history/v1`, schema 1) → frontend parser (`contracts.ts`):**

| Grain | On the wire | Parsed by frontend | Not parsed |
|---|---|---|---|
| Page | `schema_version, as_of, items, next_cursor` | all | — |
| Run | `run_id, plan_date, completed_at, status, stage_count, basic{score,correct,answered,accuracy}, composition, analytics_capability, analytics, population(null), stages` | all but `composition`, `population` | run compatibility key is **stripped server-side** (`daily.py:532`) |
| Run analytics | `policy_version, historical_average, previous_run_delta_pp, personal_best{score,is_current,tied,earliest_*}, trajectory{direction,slope,fitted_change_pp,values[5]}, category_performance[], learning_signals[], review_recovery_rate` | all | — |
| Stage | `stage_id, order, kind, ruleset{id,version,config{time_bank_ms,max_strikes},compatibility_key}, review_identity.match_id, basic{score,correct,answered,accuracy,ended_by}, questions[], analytics_capability, analytics` | all but `compatibility_key` | — |
| Stage analytics | `historical_samples, category/family/concept_performance, comparison_sufficiency`; TT `settled_questions, terminal`; Survival `depth, strikes_used, terminal`; Review `attempted_allocations`; WA `selected_themes` | all | — |
| Question | `question_result_id, canonical_ref, outcome, review_position, round_number, challenge_index, exact_question_key, family, concept, category, subject{kind,key,label}, generator_version, source_version, source_artifact_id, learning_compatibility_key` | id, ref, outcome, position, ordinals, category, family, concept, subject.label | exact key, subject kind/key, versions, artifact, learning key |

**Evidence the projection already loads per request (5 queries, full user history):** every completed official run, all its stages (incl. frozen `result_json`), every question row, every Review item. Anything computable from these is a **cheap projection** (no new query, no migration).

**Persisted but not loaded by History:** `ranked_rounds.module_id/module_version`, `segment_config_json.analytics_tag` (`daily_standard_v1:<ordinal>:<family|meta_reflex|slice_type>`, `weak_areas:<family>:<n>`, `daily_review:<served_index>`), `ranked_resolved_rounds.settlement_json.players[].points_awarded`, `result_json.completion_reason`, `daily_run_stages.context_json` (WA cutoff/policy), `ranked_matches.format_snapshot_json` (Survival supply ceiling). Loading these = one more bounded query or a join inside the existing question query.

**Not persisted anywhere:** strike count/marker, Weak Areas per-slot evidence, dropped Review allocations and reasons, concept, any cross-user aggregate.

---

## 5. Streak definition audit

Proposed: *longest streak = maximum run of consecutive terminal question outcomes equal to `correct`; `incorrect` and `timeout` reset.*

| Question | Answer |
|---|---|
| Deterministic server-side? | **Yes.** Order = persisted stage `order` → `round_number` → `challenge_index` (the same total order HUB2.2 uses for exposures). |
| Every ruleset has ordered per-question data? | **Yes for new writes** (HA-A). Legacy rows lacking ordinals: return `null` streak with `insufficient` reason, never guess. |
| Meta Reflex cards individual? | **Yes** — one row per card (`challenge_index` 0–4); expired card = `timeout` row. |
| Coherent Slice / Journey children individual? | **Yes** — one row per reached child. Production Journey writes no row for children never shown (pool exhaustion), so an unseen child does not break a streak. Legacy 1ffa624c slice v1 writes unreached steps as `timeout` — those *would* reset a streak on unseen questions (legacy data only). |
| Survival after strike 3? | No rows after the striking child; streak ends naturally. |
| Missing rows? | Forfeit in-flight question and failed best-effort inserts leave gaps that a streak would silently bridge. Mitigation: mark the stage `streak_integrity: "unverified"` when `result_json.completion_reason ∈ {forfeit, no_contest}`. |
| Cross stage boundaries? | **PRODUCT DECISION.** |

**Recommendation (needs owner lock):**
- **Stage streak** = longest run within one stage. Unambiguous.
- **Daily streak = max of the stage streaks, not a streak that crosses stages.** Reason: HUB2.3 established that stage *order* is incidental (Daily shuffles it). A cross-stage streak would make an incidental shuffle change a metric, records and percentiles.
- Open sub-decisions:
  - (a) Do Weak Areas and Review stages count toward the Daily max? Review re-asks misses, and Weak Areas targets weak families. Recommend **include both** as their own stages, because the streak is factual.
  - (b) Also show a "longest across the Daily" counter? Recommend **no**.

Server returns the streak's span (`start`/`end` `question_result_id`), so the UI can highlight the actual icons without computing anything.

---

## 6. Personal records audit

| Record | Compatibility key | Min evidence | Tie | Server "NEW RECORD" | Previous PB excludes current | Status |
|---|---|---|---|---|---|---|
| Daily highest score | run contract key | ≥1 prior compatible run | Tie ≠ new; `tied` status; earliest holder kept (existing rule) | Yes | Yes (`previous_value`, `previous_holder`) | **PRODUCT DECISION**: Review-point non-monotonicity (finding 7); must fix finding 2 first |
| Daily most correct | run contract key | ≥1 prior | same | Yes | Yes | CHEAP (depends on finding 2 fix) |
| Daily longest streak | run contract key | ≥1 prior | same | Yes | Yes | CHEAP + §5 decision |
| Standard highest score | stage contract key | ≥1 prior compatible Standard | same | Yes | Yes | CHEAP |
| Standard most correct | stage key | ≥1 prior | same | Yes | Yes | CHEAP |
| Standard longest streak | stage key | ≥1 prior | same | Yes | Yes | CHEAP |
| TT most correct | stage key | ≥1 prior | same | Yes | Yes | CHEAP |
| TT most questions played | stage key | ≥1 prior | same | Yes | Yes | CHEAP |
| TT longest streak | stage key | ≥1 prior | same | Yes | Yes | CHEAP |
| Survival deepest run | stage key | ≥1 prior | same; depth ties are common at the supply ceiling | Yes | Yes | CHEAP (note the ceiling) |
| Survival most correct | stage key | ≥1 prior | same | Yes | Yes | CHEAP |
| Survival longest streak | stage key | ≥1 prior | same | Yes | Yes | CHEAP |

Record states: `first_attempt` (no prior: show the value, no medal), `new` (strictly greater than every prior), `tied`, `not_record`.

Deliberately not created: best accuracy, fewest strikes, composites.

**Compatibility-key decision (needed before records):**
- The current stage key includes the *observed* generator/source-version set (HUB2.2 flagged the over-fragmentation risk). Sampled content versions that vary day to day would silently split record cohorts.
- Recommend a **record/score contract key**: `kind + ruleset (id, version, config) + format (id, version) + recipe version`. It excludes the sampled content versions. This is HUB2.2's recommended policy, still unimplemented.
- The existing stage key stays for learning analytics.
- Needs backend and owner approval.

---

## 7. Family / question aggregation audit

**Real families → public category (evaluated with `public_category_for` at `1ffa624c`):**

| Family (stored category, module) | Public key | Public label |
|---|---|---|
| `item_cost` | itemization | Itemization |
| `item_exact_stat` | itemization | Itemization |
| `rune_tree` | runes | Runes |
| `objective_spawn`, `camp_respawn` | objectives | Objectives |
| `objective_timer` ("Objective Timers", quiz) | objectives | Objectives |
| `wave_composition` ("Wave Management", quiz) | wave-management | Wave Management |
| `summoner_spell_cooldown` | summoner-spells | Summoner Spells |
| `champion_stat_compare` | champion-stats | Champion Stats |
| `casts_before_oom`, `combat_ability_damage` | abilities | Abilities & Cooldowns |
| `champion_stat:hp@lvl11` (item_cost_duel) | meta-reflex | Meta Reflex |
| `environment_mechanic` (no stored category) | general | **Question** |
| `raw_single_type_damage`, `post_mitigation_single_type_damage`, `health_remaining`, `cooldown_with_haste` (mastery_slice) | general | **Question** |

**Conclusions:**
- **Time Trial is well supported.** It is a Splash-only `quiz.v2` stream, and Splash families map cleanly to the ten public categories. This is the approved nested-donut outer ring.
- **Standard and Survival are partially supported.**
  - Every Meta Reflex card collapses to "Meta Reflex" (module-first rule).
  - Journey/Mastery chain families fall to the "Question" fallback. That makes a meaningless slice.
  - Options:
    - (i) group by **unit** (Splash / Meta Reflex / Journey) for Standard;
    - (ii) ask the RG2 owner to classify the Mastery chain families (they have a subject: champion ability damage → Abilities).
  - Recommend (i) now, and (ii) as a separate RG2 task.
- **Weak Areas:** the slot family maps through the same function; a stage has 3–5 slots, so a donut is thin. Prefer a small list.
- **Never** print raw family ids or `category` strings. HUB4's category bars did (now removed).

| Capability | Support |
|---|---|
| Exact membership (which icons belong to a slice) | `question_result_id` exists → CHEAP (server emits member ids per group) |
| This-stage group C/A | CHEAP |
| Historical group C/A (compatible stage cohort) | CHEAP (rekey existing `family_performance` from raw family to public key) |
| Exact-question prior attempts / previous exposure | CHEAP (existing learning-key exposure stream; emit counts + last, not signals) |
| Per-question / per-family population correct rate | POPULATION AGGREGATE (P2; cautious). Feasible because Standard and TT content is shared per `plan_date` (seeded). |
| Concept grouping | DEFER (concept never written) |

---

## 8. Population architecture recommendation

**Existing state:**
- No cross-user aggregate code exists; `personal_analytics.py` explicitly disclaims it.
- The production store is a single SQLite file on a Railway volume.
- There is no in-process scheduler for user data.
- Scheduled jobs use the **external scheduler → bearer-token internal endpoint** pattern (`routes/internal_live_esports.py`, `routes/internal_patch_ops.py`).

**Recommendation: materialized, pre-aggregated snapshots, read by `/api/history/v1` with one extra bounded query.**

1. **Table `history_population_snapshots`** (new migration, additive):
   - Key: `(policy_version, metric, cohort_type, cohort_key, as_of)`.
   - Columns: `users`, `observations`, `frequency_json`, `median`, `quantiles_json`, `top_code_above`, `bottom_code_below`.
2. **Exact frequency tables, not raw rows.**
   - Every approved metric is a small integer (correct, questions played, depth, score, streak) or a whole-percent accuracy (101 bins).
   - Storing `value → count` gives an **exact midrank percentile** with no user identity: `(below + 0.5·equal) / N`.
3. **Cohorts:**
   - **`day`** — same `plan_date` + same stage record key. This is the primary cohort.
     - Standard and Time Trial content is seed-shared per day, and Survival's slot rotation is seeded per day.
     - `UNIQUE(user_id, policy, plan_date)` guarantees exactly one observation per user.
     - Every Daily player plays all three core stages, so the three core cohorts are the *same population*. This matters for strongest mode.
   - **`rolling_28d`** — same record key, one observation per user (their latest compatible attempt). This is the fallback while day cohorts are small.
   - Run-level cohorts use the run contract key, so 4-stage and 5-stage runs are separate.
   - Weak Areas and Review: no population (personalized).
4. **Refresh:**
   - `POST /api/internal/history/population/refresh` (bearer token), called by the existing external scheduler.
   - Today's day cohort every 15–60 min; closed days once more after `plan_date` + grace, then frozen.
   - Snapshots are append-only by `as_of`; the read picks the latest.
5. **Read path:**
   - `project()` collects the cohort keys of the visible page and runs one `SELECT … WHERE cohort_key IN (…)`, keeping the query count constant at 6.
   - The server computes the user's midrank percentile from the frequency table and returns only aggregates.
   - The population failure mode is `status: "unavailable"` inside the block, never a page failure and never an upsell.
6. **Privacy:**
   - Only aggregates leave the server.
   - Suppress below threshold.
   - Top- and bottom-code tails with fewer than k (e.g. 5) observations, so an extreme bin cannot reveal one account.
   - Exclude non-official policy and (proposed) playtester/admin accounts.
   - Never a leaderboard, and never a rank position ("#12").
7. **Threshold (spec audit):**
   - The spec says "≥100 users and ≥200 runs, ≤1 run per user per cohort". With one run per user, 200 runs implies 200 users, so the pair is inconsistent.
   - Recommend a single rule stated in **distinct users**: proposed ≥100 for `day` and ≥100 for `rolling_28d`.
   - Launch volume may leave most day cohorts insufficient; the rolling fallback exists for that reason.
   - **Owner must set the numbers.**
8. **Why not on-demand:** a percentile needs every user's row for the cohort. That is a full scan of `ranked_segment_child_results` per page view on a shared SQLite writer — unacceptable, and it would put raw cross-user data in the request path.

---

## 9. Strongest mode

**Candidate primary metrics:**

| Mode | Candidate | Pros | Cons |
|---|---|---|---|
| Standard | **score** percentile | The stage's own headline; rewards what the mode rewards | Includes the "+1 faster than bot" bonus; score contract must match |
| Standard | correct-count percentile | Pure knowledge; fixed ~22 denominator | Ignores the mode's scoring; ties at 22 |
| Time Trial | **correct-count** percentile | Combines speed and accuracy; legible ("29 correct") | Correlated with questions played |
| Time Trial | TT score percentile | Mode's own score (tier-weighted, no speed bonus) | Less legible than correct count |
| Survival | **depth** percentile | The mode's objective | Saturates at the supply ceiling; midrank handles ties, but a perfect run caps near the 50–99th percentile depending on share |
| Survival | Survival score | Consistent "own score" rule across modes | Includes speed bonus; less legible |

**Comparability:**
- Percentiles are unit-free.
- Because every Daily player plays all three core stages, the three `day` cohorts contain **the same people**, so "your TT percentile is higher than your Standard percentile" is a like-for-like relative claim.
- Cross-cohort-type mixing (a day cohort for one mode, rolling for another) is **not** comparable. Require the same cohort type for all three.

**Recommendation (owner approval required):**
- **Metrics:** Standard score, TT correct count, Survival depth (as proposed), with policy `strongest-v1` declared in the DTO.
- **Winner:** the highest percentile, only if:
  - (a) all three percentiles are sufficient in the same cohort type; and
  - (b) the leader exceeds the runner-up by ≥10 percentile points.
  - Otherwise `winner: null`, `reason_code: "no_clear_leader"`, and the UI shows the three gauges without a claim.
- The Daily headline cites the statistic ("Time Trial — 87th percentile for correct answers").
- Decide, too, whether "strongest" is judged on **this Daily** (recommended) or over the rolling window.
- With population insufficient: no claim. There is no personal-only substitute, because comparing raw values across modes has no common unit.

---

## 10. Master audit table

**Legend**
- **Appr (approval):** C = confident · Ca = cautious · U = unapproved.
- **FE / BE:** FE = current frontend DTO support; BE = backend persistence.
- **Status:**
  - AVAIL = available now
  - CHEAP = cheap projection
  - PERSIST = needs new persistence
  - POP = needs population aggregate
  - DECIDE = product decision
  - DEFER
- **Keys:**
  - RK = run contract key
  - SK = stage record key (§6)
  - LK = learning key
  - PC = public category
- **Tier:** F = Free · P = Premium.
- **Pri:** P0/P1/P2.
- **Min-prior:** `≥1p` = one prior compatible attempt.

| # | Surface | Metric / capability | Exact definition | Appr | Current authoritative source | FE DTO | BE persistence | Status | Compatibility | Evidence | UI label | Visual | Interaction | Tier | Pri | Backend field / contract | Notes / risk |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Q1 | Question | Outcome ring | `outcome ∈ correct/incorrect/timeout` per occurrence | C | child rows `outcome` | Parsed, **not used by timeline** (review-derived, timeout→grey) | Yes | AVAIL (FE change) | — | n=1 | Correct / Incorrect / Timed out | Ring + glyph (✓ ✕ clock) | Tap/hover → existing Popover/Sheet | F | P0 | `questions[].outcome` (exists) | Multi-question round needs a segmented ring, not an all-or-nothing verdict |
| Q2 | Question | Responsive icon count | Page size = what fits, max raised above 5 | C | — | — | — | AVAIL (FE) | — | — | — | Larger icons, selected stage larger | Paging unchanged | F | P0 | none | `QuestionTimeline` is shared with Ranked rows; add a prop, keep default 5 there |
| Q3 | Question | Unit per round | Splash / Meta Reflex / Journey / Slice | C | `ranked_rounds.module_id` + `analytics_tag` | Only after review loads (`round.kind`) | Yes | CHEAP | — | — | Splash · Meta Reflex · Journey | Node shape | — | F | P0 | `stages[].modules[].unit`, `module_id` | Unit not in `result_json`; load via round join |
| Q4 | Question | Public category | `public_category_for(family, category, module_id)` | C | RG2 `quiz/public_category.py` | No | Inputs yes | CHEAP | — | — | RG2 label | Legend swatch | — | F | P0 | `questions[].public_category` (key) | Mastery chain → "Question" fallback (§7) |
| Q5 | Question | This-stage group C/A | C/A of the question's PC within this stage | C | child rows | No | Yes | CHEAP | — | n≥1 shown with count | "Itemization 3/4 this stage" | Hover card | Hover/focus/tap | P | P1 | `stage.analytics.groups[]` | — |
| Q6 | Question | Historical group C/A | C/A of PC across the compatible stage cohort | C | child rows | Raw-family version exists (`familyPerformance`) | Yes | CHEAP | SK | ≥3 q & ≥2 runs (existing) | "Itemization 71% (24/34) in Time Trial" | Hover card | Hover | P | P1 | `groups[].history{correct,answered,runs}` | Rekey from family to PC |
| Q7 | Question | Exact-question prior attempts | Prior exposures of the same LK: count, correct, last date/outcome | C | exposure stream in `_learning_signals` | Only `previous` inside signals | Yes | CHEAP | LK | 1 prior | "Seen 3× before · 2 correct · last Sep 9 ✕" | Hover card | Hover | P | P1 | `questions[].exposure{prior,prior_correct,last}` | Emit facts, not signals |
| Q8 | Question | Population correct rate | % of day cohort correct on this occurrence/ref | Ca | none | No | No | POP | day cohort, same ref | threshold | "62% of players got this right" | Hover card | Hover | P | P2 | `questions[].population{…}` | Standard/TT content shared per day |
| Q9 | Question | Chart ↔ icon highlight | Group member ids | C | rows | No | Yes | CHEAP | — | — | — | Linked highlight | Hover/tap slice → icons | P | P1 | `groups[].question_result_ids` | — |
| D1 | Daily | Score | Σ stage `score_after` | C | `result_json.score` | Yes | Yes | AVAIL | — | n=1 | Score | Header number | — | F | P0 | `basic.score` | Includes Review points and speed-vs-bot bonus |
| D2 | Daily | Correct / answered / accuracy | ΣC / ΣA (question grain, A includes timeouts) | C | rows | Yes | Yes | AVAIL | — | A>0 | "25 / 28 · 89%" | Ring | — | F | P0 | exists | `answered` includes timeouts (§3) |
| D3 | Daily | Longest streak | max over stage streaks (§5) | C | rows | No | Yes | CHEAP + DECIDE | — | ordinals present | "Longest streak 14" | Streak bar | Highlight span | P* | P0 | `personal.current.longest_streak{length,start_qr,end_qr,stage_id}` | *Current value could be Free: owner |
| D4 | Daily | Previous compatible Daily | Latest earlier run with the same RK: score, C, A, accuracy, streak | C | runs | Accuracy delta only | Yes | CHEAP | RK | ≥1p | "Previous Daily" | Side-by-side | — | P | P0 | `personal.previous{…}` | — |
| D5 | Daily | Exact change | current − previous per field; accuracy in points | C | derived | Accuracy only | Yes | CHEAP | RK | ≥1p | "+2 correct · 1 fewer question · 10 points higher" | Delta chips | — | P | P0 | `personal.change{score,correct,answered,accuracy_points,longest_streak}` | UI points from rounded % (§3) |
| D6 | Daily | Historical averages | Mean correct, mean answered, mean score over prior RK runs | C | runs | No | Yes | CHEAP | RK | ≥3p (existing floor) | "Your average" | Dashed rule | — | P | P1 | `personal.summary{mean_*}` + sufficiency | — |
| D7 | Daily | Historical accuracy | Mean of run accuracies (current HUB2) — pooled ΣC/ΣA as alternative | C | runs | Yes (`historicalAverage`) | Yes | AVAIL | RK | ≥3p | "Average accuracy" | Dashed rule | — | P | P0 | exists (+`pooled_accuracy` optional) | Keep the mean; state it |
| D8 | Daily | Score / accuracy / correct series | Last ≤20 RK runs, dated, oldest first, current flagged | C | runs | Only 5 accuracy values, undated, ≥5 runs | Yes | CHEAP | RK | show from n=2 | "Recent Dailies" | Line chart | Point hover → date/value | P | P0 | `personal.series[]{run_id,plan_date,completed_at,score,correct,answered,accuracy,longest_streak,is_current}` | Spec §12 "line only ≥5" → allow a dot plot below 5 |
| D9 | Daily | Record: highest score | §6 | C | runs | `personal_best` (score) | Yes | DECIDE | RK | ≥1p | "Best score" | Medal | — | P | P1 | `records[]` (§11-D) | Finding 2 blocks it; finding 7 semantics |
| D10 | Daily | Record: most correct | §6 | C | runs | No | Yes | CHEAP | RK | ≥1p | "Most correct" | Medal | — | P | P1 | `records[]` | — |
| D11 | Daily | Record: longest streak | §6 | C | runs | No | Yes | CHEAP + DECIDE | RK | ≥1p | "Longest streak" | Medal | — | P | P1 | `records[]` | Depends on §5 |
| D12 | Daily | Perfect/skipped runs analysable | Skipped stage keeps a compat identity | C | `result_json` skip shapes | — | Skip rows lack ruleset | CHEAP (projection fix) | RK redefined | — | — | — | — | P | **P0** | Stage key for skipped stage = `kind + skip_reason + plan ruleset`, or exclude skipped stages from RK | Owner/backend decision on how skipped stages enter RK |
| D13 | Daily | Accuracy percentile | Midrank in cohort | C | none | `population: null` | No | POP | run day / rolling | §8 threshold | "Better than 72% of players today" | Gauge + distribution | Hover bins | P | P1 | `population.metrics[]` | — |
| D14 | Daily | Score percentile | Midrank of run score | C | none | No | No | POP + DECIDE | RK day | §8 | — | Gauge | — | P | P2 | same | Finding 7 |
| D15 | Daily | Streak percentile | Midrank of Daily streak | C | none | No | No | POP | RK day | §8 | — | Gauge | — | P | P2 | same | After §5 |
| D16 | Daily | Median, histogram, sample, as-of | Cohort aggregates | C | none | No | No | POP | — | §8 | "Median 64% · 1,284 players · as of 14:00" | Distribution strip | Keyboard/tap bins | P | P1 | `population.metrics[].{median,frequency,users,as_of,cohort}` | — |
| D17 | Daily | Strongest mode | §9 | C | none | No | No | POP + DECIDE | same cohort type | all 3 sufficient, 10-pt margin | "Time Trial is your strongest mode today — 87th percentile, correct answers" | 3 gauges + callout | Hover gauges | P | P1 | `analytics.strongest_mode{…}` | — |
| D18 | Daily | Trajectory direction | OLS 5-run ≥5-point rule | Ca | HUB2 | Yes | Yes | AVAIL | RK | 5 runs | "Up / Down / Stable" | Arrow | — | P | P2 | exists | Keep as-is or drop, per review |
| D19 | Daily | Review recovery rate | — | U | HUB2 | Parsed, not shown | Yes | DEFER | — | — | — | — | — | — | — | leave, do not present | Framing not approved |
| S1 | Standard | Score, C/A, accuracy | stage basic | C | `result_json` + rows | Yes | Yes | AVAIL | — | n=1 | — | Band | — | F | P0 | exists | — |
| S2 | Standard | Ten-module course | rounds 1–10, unit per round | C | rows + round unit | Rounds yes; unit after review | Yes | CHEAP (unit) | — | — | "Splash · Meta Reflex · Journey" | Course diagram | Node → Popover | F | P0 | `stages[].modules[]{round_number,unit,module_id,correct,played}` | Production is Journey (finding 11) |
| S3 | Standard | Module outcomes (C/A) | C/A within the round | C | rows | Derivable from questions | Yes | CHEAP (server) | — | — | "4/5" | Node pips | — | F | P0 | `modules[].correct/played` | Prefer server over FE counting |
| S4 | Standard | Module points | `points_awarded` of the round | Ca | `settlement_json` | No | Yes | DEFER | — | — | — | — | — | P | P2 | `modules[].points` | Only if review shows value |
| S5 | Standard | Longest streak | stage streak | C | rows | No | Yes | CHEAP | — | ordinals | "Longest streak" | Streak bar | Highlight | P | P0 | `stage.personal.current.longest_streak` | — |
| S6 | Standard | Previous Standard | latest earlier same SK | C | stages | No (only a count) | Yes | CHEAP | SK | ≥1p | "Previous Standard" | Side-by-side | — | P | P0 | `stage.personal.previous` | — |
| S7 | Standard | Changes | score, correct, accuracy points, streak | C | derived | No | Yes | CHEAP | SK | ≥1p | "+3 score · 8 points higher" | Delta chips | — | P | P0 | `stage.personal.change` | — |
| S8 | Standard | History series + averages | score, accuracy, correct, streak | C | stages | No | Yes | CHEAP | SK | series n≥2; averages ≥3p | "Your Standard history" | Line | Point hover | P | P1 | `stage.personal.series[]`, `summary` | — |
| S9 | Standard | Records | highest score, most correct, longest streak | C | stages | No | Yes | CHEAP | SK | ≥1p | "Best score" | Medals | — | P | P1 | `stage.personal.records[]` | Record key decision (§6) |
| S10 | Standard | Percentiles | score, accuracy, streak | C | none | No | No | POP | day SK | §8 | "68th percentile" | Gauges | — | P | P1 | `stage.population` | — |
| S11 | Standard | Speed-vs-bot bonus | +1 when strictly faster than the bot | — | engine | No | settlement | DEFER | — | — | — | — | — | — | — | — | Affects score comparability only |
| T1 | Time Trial | Correct, questions played, accuracy | rows; played = row count incl. timeouts | C | rows | Yes (`answered`; Premium `settledQuestions`) | Yes | AVAIL | — | n=1 | "25 correct · 28 questions played · 89%" | Band + ring | — | F | P0 | exists | Relabel "Settled questions" → "Questions played" |
| T2 | Time Trial | Timeout count | count `outcome='timeout'` | C | rows | Derivable | Yes | CHEAP | — | — | "3 timed out" | Donut inner | — | F | P0 | `stage.basic.timeouts` | Add to basic for all stages |
| T3 | Time Trial | Terminal condition | `time_bank_exhausted` / completed; raw completion reason | C | `ended_by`, `completion_reason` | Yes (lossy) | Yes | AVAIL (+CHEAP raw) | — | — | "Time ran out" / "Finished the set" | End marker | — | F | P0 | `stage.basic.completion_reason` | Forfeit currently reads "completed" |
| T4 | Time Trial | Longest streak | stage streak | C | rows | No | Yes | CHEAP | — | — | "Longest streak 11" | Streak bar | Highlight | P | P0 | as S5 | — |
| T5 | Time Trial | Previous TT | correct, played, accuracy, timeouts, streak | C | stages | No | Yes | CHEAP | SK | ≥1p | "Previous Time Trial" | Side-by-side | — | P | P0 | `stage.personal.previous` | — |
| T6 | Time Trial | Changes | correct, played, accuracy points, streak | C | derived | No | Yes | CHEAP | SK | ≥1p | "+2 correct · 1 fewer question played · 10 points higher" | Delta chips | — | P | P0 | `stage.personal.change` | — |
| T7 | Time Trial | History + averages | correct, played, accuracy, streak series; means | C | stages | No | Yes | CHEAP | SK | series n≥2; means ≥3p | "Average 24 correct of 27 played" | Throughput lollipop | Hover a run | P | P1 | `stage.personal.series[]`, `summary` | — |
| T8 | Time Trial | Records | most correct, most played, longest streak | C | stages | No | Yes | CHEAP | SK | ≥1p | "Most questions played" | Medals | — | P | P1 | `records[]` | — |
| T9 | Time Trial | Percentiles | correct, played, accuracy, streak | C | none | No | No | POP | day SK | §8 | "Faster than 81% of players" (played) | Gauges + distribution | Bins | P | P1 | `stage.population` | Throughput copy wording TBD |
| T10 | Time Trial | Nested donut inner | correct / incorrect / timeout counts | C | rows | Derivable | Yes | CHEAP | — | — | Legend | Donut inner ring | Slice → icons | P | P1 | `stage.analytics.outcomes{correct,incorrect,timeout, member ids}` | — |
| T11 | Time Trial | Nested donut outer | PC within each outcome, with member ids | C | rows + RG2 | No | Yes | CHEAP | — | — | RG2 labels | Donut outer ring | Slice → icons + group C/A | P | P1 | `stage.analytics.groups[]{public_category,correct,incorrect,timeout,question_result_ids,history}` | TT maps cleanly (§7) |
| T12 | Time Trial | Per-question time | — | U/— | `active_answer_ms` NULL on timeouts | No | Partial | DEFER | — | — | — | — | — | — | — | — | Not requested; unsafe |
| V1 | Survival | Depth, C/A, accuracy | depth = row count | C | rows | Yes (depth Premium) | Yes | AVAIL | — | n=1 | "Depth 13 · 10/13" | Tower | — | F/P | P0 | exists | Free depth = `basic.answered` (HUB6.1 kept it Premium) |
| V2 | Survival | Strikes used | min(misses, max) — verified equals the engine ledger | C | derived | Yes | Derivable | AVAIL | — | — | "3 of 3 strikes" | Pips | — | P | P0 | exists | — |
| V3 | Survival | Strike-producing question | k-th miss in order, k ≤ max | C | rows (engine rule) | No | Derivable | CHEAP | — | ordinals | "Strike 2" | Marker on icon | Highlight | P | P0 | `questions[].strike_index` (Survival only) | Reverses HUB6.1's "not provable" |
| V4 | Survival | Terminal | `strikes_exhausted` / completed; supply ceiling reached | C/Ca | `ended_by`, format snapshot | Partial | Ceiling in snapshot | CHEAP | — | — | "Out of strikes" / "Reached the end" | Tower top | — | F | P1 | `completion_reason`, `stage.analytics.ceiling` | "Reached the end" is cautious |
| V5 | Survival | Longest streak | stage streak | C | rows | No | Yes | CHEAP | — | — | — | Streak bar | Highlight | P | P0 | as S5 | — |
| V6 | Survival | Previous Survival | depth, C/A, accuracy, strikes, streak | C | stages | No | Yes | CHEAP | SK | ≥1p | "Previous Survival" | Side-by-side | — | P | P0 | `stage.personal.previous` | — |
| V7 | Survival | History + averages | depth, accuracy, streak series; mean depth | C | stages | No | Yes | CHEAP | SK | series n≥2; means ≥3p | "Average depth 11" | Depth tower history | Hover | P | P1 | series/summary | — |
| V8 | Survival | Records | deepest, most correct, longest streak | C | stages | No | Yes | CHEAP | SK | ≥1p | "Deepest run" | Medals | — | P | P1 | `records[]` | No fewest-strikes record |
| V9 | Survival | Percentiles | depth, accuracy, streak | C | none | No | No | POP | day SK | §8 | — | Gauges | — | P | P1 | `stage.population` | Ceiling ties → midrank |
| V10 | Survival | Multi-question module structure | rounds with children | C | rows | Yes (`rounds`) | Yes | AVAIL (+unit CHEAP) | — | — | "Journey" | Path | Node → Popover | F | P0 | `modules[]` | — |
| W1 | Weak Areas | Exact questions, C/A, outcomes | rows | C | rows | Yes | Yes | AVAIL | — | n=1 | — | Question cards | Popover | F | P0 | exists | — |
| W2 | Weak Areas | Public category composition | PC per slot | C | rows + RG2 | Raw `selectedThemes` | Yes | CHEAP | — | — | RG2 labels | Chips | — | P | P1 | `groups[]` | Replace `selected_themes` |
| W3 | Weak Areas | Previous WA C/A | factual, no improvement claim | Ca | stages | No | Yes | CHEAP | kind only | ≥1p | "Previous Weak Areas 3/5" | Text | — | P | P2 | `stage.personal.previous` | Content differs by design |
| W4 | Weak Areas | Policy version + evidence cutoff | frozen | C | `context_json` | No | Yes | CHEAP | — | — | "Built from misses before Sep 14" | Provenance line | — | P | P1 | `stage.selection{policy_version,evidence_cutoff}` | — |
| W5 | Weak Areas | Why selected (per slot) | slot family + miss count + last missed | C | discarded | No | **No** | PERSIST | — | — | "From a family you missed 3× (last Sep 12)" | Card footnote | — | P | P1 | `questions[].selection{slot_family,public_category,miss_count,last_missed_at,source_question_result_ids[]}` | The served question ≠ the missed question (finding 4) |
| W6 | Weak Areas | Population | — | — | — | — | — | DEFER | — | — | — | — | — | — | — | — | Personalized |
| W7 | Weak Areas | Weakness / conversion | — | U | — | — | — | — | — | — | — | — | — | — | — | — | Not approved |
| R1 | Review | Replays, correct/attempted, incorrect, timeout | Review child rows | C | rows | Yes | Yes | AVAIL | — | n=1 | "3 of 4 replays correct" | Cards | Popover | F | P0 | exists | "attempted" = served replays |
| R2 | Review | Source stage per replay | allocation → source stage | C | `daily_run_review_items` | No | Yes, but link misaligns on drop | PERSIST (small) + CHEAP | — | — | "From Time Trial" | Connector | Hover replay → source icon | P | P1 | `questions[].review_source{allocation_ordinal,source_question_result_id,source_stage_id,source_stage_kind,source_outcome}` | Finding 3 |
| R3 | Review | Source miss → replay → result | same | C | same | No | same | PERSIST + CHEAP | — | — | — | Source→replay connector | Cross-highlight both rails | P | P1 | + `questions[].replayed_by{review_question_result_id,outcome}` on source | — |
| R4 | Review | Dropped allocations | not served + reason | Ca | discarded | No | **No** | PERSIST | — | — | "1 replay unavailable" | Ghost node | — | P | P2 | `stage.review{allocated,served,dropped[]{ordinal,reason}}` | — |
| R5 | Review | Nested donut (outcome × source stage) | from R2 | Ca | same | No | same | PERSIST | — | — | Stage names | Donut | Slice → icons | P | P2 | from R2 | Only after R2 |
| R6 | Review | Previous / historical Review C/A | factual | Ca | stages | No | Yes | CHEAP | kind + review format | ≥1p | "Previous Review 2/3" | Text/series | — | P | P2 | `stage.personal` | No "recovery" copy |
| X1 | All | Record/score contract key | §6 | C | — | No | — | DECIDE | — | — | — | — | — | — | P0 | `record_key` policy | Blocks records/series/population |
| X2 | All | Streak semantics | §5 | C | — | — | — | DECIDE | — | — | — | — | — | — | P0 | — | Blocks streak items |
| X3 | All | Capability states | existing five | C | HUB2 | Yes | — | AVAIL | — | — | — | — | — | — | — | exists | Population adds its own inner status |
| X4 | All | Learning signals recurring/recovered | — | U | HUB2 | Parsed, hidden | — | DEFER | — | — | — | — | — | — | — | Stop emitting in policy v2 (optional) | — |
| X5 | All | Concept analytics | — | — | never written | Parsed | NULL | DEFER | — | — | — | — | — | — | — | — | Finding 6 |
| X6 | All | Category bars (raw) | — | — | HUB2 | Parsed, removed from UI | Yes | DEFER | — | — | — | — | — | — | — | Replace with PC groups | Raw ids |

---

## 11. DTO proposal (smallest coherent extension; not implemented)

**Envelope:**
- `schema_version` stays **1**. Every addition is an optional field or block, and the frontend parser already ignores unknown keys.
- Bump the analytics `policy_version` to `history-daily-v2` (the compat and streak semantics change).
- No prose in the DTO; enum keys only.
- Every comparative value carries `sufficiency`.

### A. Per-run personal (`item.analytics.personal`)
```json
{
  "record_key_policy": "record-key-v1",
  "compatible_prior_runs": 9,
  "current":  {"score": 173, "correct": 52, "answered": 60, "accuracy": 0.8667,
               "longest_streak": {"length": 14, "stage_id": "…", "start_question_result_id": "…", "end_question_result_id": "…"}},
  "previous": {"run_id": "…", "plan_date": "2026-09-13", "completed_at": "…",
               "score": 165, "correct": 50, "answered": 61, "accuracy": 0.8197, "longest_streak": 9,
               "sufficiency": {…}},
  "change":   {"score": 8, "correct": 2, "answered": -1, "accuracy_points": 4.70, "longest_streak": 5},
  "summary":  {"attempts": 9, "mean_score": 158.2, "mean_correct": 47.1, "mean_answered": 58.3,
               "mean_accuracy": 0.807, "pooled_accuracy": 0.808, "sufficiency": {…}},
  "series":   [{"run_id": "…", "plan_date": "…", "completed_at": "…", "score": 0, "correct": 0,
                "answered": 0, "accuracy": 0.0, "longest_streak": 0, "is_current": false}],
  "records":  [ /* D */ ]
}
```
`series` is the last ≤20 compatible runs, oldest first, including the current run. Existing `historical_average`, `previous_run_delta_pp`, `personal_best` and `trajectory` stay for compatibility.

### B. Per-stage personal (`stage.analytics.personal`, same shape, kind-specific fields)
- **`current` / `previous` / `series[]`** carry:
  - all kinds: `score`, `correct`, `questions_played`, `accuracy`, `timeouts`, `longest_streak`;
  - Time Trial and Survival: `completion_reason`;
  - Survival: `depth`, `strikes_used`.
- **`change`** mirrors the numeric fields.
- **`records`:** see D.

Stage additions outside analytics (basic facts, Free):
- `stage.basic.timeouts`
- `stage.basic.completion_reason`
- `stage.modules[] = {round_number, unit, module_id, played, correct}`
- Survival `stage.analytics.ceiling` (supply length) — cautious.

### C. Question / family (`stage.analytics.groups`, `questions[]` additions)
```json
"outcomes": {"correct": {"count": 25, "question_result_ids": ["…"]},
             "incorrect": {"count": 0, "question_result_ids": []},
             "timeout": {"count": 3, "question_result_ids": ["…"]}},
"groups": [{"public_category": "itemization", "correct": 7, "incorrect": 1, "timeout": 0,
            "question_result_ids": ["…"],
            "history": {"correct": 24, "answered": 34, "runs": 6, "sufficiency": {…}}}]
```
Per question:
- `public_category`
- `unit`
- `strike_index` (Survival, nullable)
- `exposure: {prior: 3, prior_correct: 2, last: {completed_at, outcome}}` (Premium)

### D. Records (run and stage)
```json
{"metric": "questions_played", "value": 31, "status": "new|tied|not_record|first_attempt",
 "holder": {"run_id": "…", "completed_at": "…"}, "tied_count": 1,
 "previous_value": 29, "previous_holder": {"run_id": "…", "completed_at": "…"},
 "sufficiency": {…}}
```
Metric enum:
- run: `score | correct | longest_streak`
- Standard: `score | correct | longest_streak`
- Time Trial: `correct | questions_played | longest_streak`
- Survival: `depth | correct | longest_streak`

### E. Population (`item.population`, `stage.population`, and optionally `questions[].population`)
```json
{"status": "available|insufficient|unavailable", "policy_version": "population-v1",
 "metrics": [{"metric": "correct", "cohort": {"type": "day|rolling_28d", "key": "…", "plan_date": "2026-09-14"},
              "as_of": "…", "users": 1284, "observations": 1284, "user_value": 29,
              "percentile": 87.4, "median": 23,
              "frequency": {"values": [0, 1, "…"], "counts": [0, 2, "…"], "top_code_above": 38, "bottom_code_below": 4},
              "quantiles": {"p10": 15, "p25": 19, "p50": 23, "p75": 26, "p90": 30},
              "sufficiency": {"status": "sufficient", "observed": 1284, "required": 100, "reason_code": null}}]}
```
Run level also has:
```json
"strongest_mode": {"policy": "strongest-v1", "cohort_type": "day",
                   "candidates": [{"stage_kind": "time_trial", "metric": "correct", "percentile": 87.4, "sufficient": true}],
                   "winner": "time_trial|null", "margin_points": 16.0, "reason_code": null}
```

### F. Review linkage
On each Review question:
```json
"review_source": {"allocation_ordinal": 2, "source_question_result_id": "…",
                  "source_stage_id": "…", "source_stage_kind": "time_trial", "source_outcome": "timeout"}
```
On each source question:
- `replayed_by: {review_question_result_id, outcome} | null`
- `review_allocation: "served|dropped|not_allocated"`

On the Review stage: `review: {allocated, served, dropped: [{ordinal, reason}]}`.

### G. Weak Areas provenance
On the stage: `selection: {policy_version, evidence_cutoff}`.

On each question:
```json
"selection": {"slot_family_public_category": "itemization", "miss_count": 3, "last_missed_at": "…",
              "source_question_result_ids": ["…"]}
```
The raw family is kept server-side only.

---

## 12. Visual toolbox — data requirements

| Visual | Supported by current DTO? | Smallest backend addition |
|---|---|---|
| 1. Historical line charts | Only 5 undated accuracy values (≥5 runs) | `personal.series[]` (run and stage) |
| 2. Nested donuts | TT inner derivable; outer needs PC + membership | `outcomes`, `groups[]` with `question_result_ids` |
| 3. Global histograms | No | `population.metrics[].frequency` |
| 4. Percentile gauges | No | `population.metrics[].percentile` + sufficiency |
| 5. Record medals | Run score only (and wrong for perfect days) | `records[]` run and stage + finding-2 fix |
| 6. Streak displays | No | `longest_streak` with span ids; records; series |
| 7. Standard course | Rounds yes; unit after review load; C/A derivable | `stage.modules[]` |
| 8. TT throughput lollipop/history | Current count only | stage `series[]` (`questions_played`, `correct`) |
| 9. Survival depth / tower | Current depth and strikes only | stage `series[]`; `strike_index`; `ceiling` (cautious) |
| 10. Review source→replay connector | No | persistence fix + `review_source` / `replayed_by` |
| 11. Chart ↔ icon highlighting | Ids exist; no group membership | `question_result_ids` on groups, outcomes, streak span, strike |

Frontend note: the timeline must take outcomes from the DTO (`questions[].outcome` per round, segmented for multi-question rounds) and be keyed by `question_result_id`, so charts can address icons.

---

## 13. Timmy Analytics Lab — deterministic fixture matrix

**Design rules:**
- A **new account `analytics_lab`**. Timmy, First Daily, Newcomer and Full-length stay byte-identical, so HUB5/HUB6 certification is undisturbed.
- Same pipeline: raw facts → `dailyFixtureBuilder` → rows → the real backend route → golden → production parser.
- Nothing is computed in TypeScript.
- Anchor `2026-09-15T18:00Z`; runs on plan dates 2026-09-01 … 2026-09-14.
- Standard uses the **production Journey shape**: 22 interactions; module 10 has 5 children; children after pool exhaustion have no row.
- Survival slots are 3-child Journeys (per-card clock).

**Builder extensions required:**
- skipped stages (`perfect`, `weak_areas_unavailable`, `review_items_unavailable`);
- Review with a **dropped middle allocation** (today refused; must be allowed once finding 3 is fixed);
- Weak Areas slot evidence facts;
- Journey pool exhaustion (omitted children);
- forfeit terminal (optional);
- population snapshot rows.

**Population fixtures:**
- A handful of **pre-aggregated snapshot rows** (`history_population_snapshots`), authored as frequency tables and seeded by the generator before driving the route.
- No synthetic users.
- Cohort sizes are chosen to hit each state:

| Cohort | users | Purpose |
|---|---|---|
| day 09-01 (all metrics) | 40 | insufficient (below threshold) |
| rolling_28d | 180 | fallback when day insufficient |
| day 09-05 | 1,284 | low percentile (~12th) for Standard |
| day 09-06 | 1,301 | median (~50th) |
| day 09-08 | 1,410 | high (TT ~94th, Survival ~40th, Standard ~55th) → strongest = TT |
| day 09-11 | 1,356 | Survival specialist (~91st) |
| day 09-12 | 1,390 | Standard specialist (~89th) |
| day 09-13 | 1,402 | no clear leader (three within 10 points) |
| day 09-14 | 1,455 | extreme: TT value in top-coded tail (>99th) |

**Runs:**

| Run | Date | Stages | Scenario exercised |
|---|---|---|---|
| L1 | 09-01 | 4 (TT·Std·Surv·Rev) | First run; every comparison `first_attempt`/insufficient; population insufficient |
| L2 | 09-02 | 5 | First 5-stage run: Daily comparisons insufficient (4≠5 stages) but **stage** previous available vs L1 |
| L3 | 09-03 | 5 | One prior compatible Daily; **worse than previous** on every field |
| L4 | 09-04 | 5 | **More correct, nearly same accuracy** (25/28 = 89.3% vs 24/27 = 88.9%): "+1 correct", "same accuracy (89% vs 89%)" |
| L5 | 09-05 | 5 | Low percentile day; timeout-heavy TT (6 timeouts; donut inner) |
| L6 | 09-06 | 5 | Median day; **high TT throughput, mediocre accuracy** (34 played, 24 correct) |
| L7 | 09-07 | 5 | **Low throughput, high accuracy** (18/18) → all-correct stage; TT accuracy 100% |
| L8 | 09-08 | 5 | **TT specialist**; TT most-correct record; mixed TT families across ≥5 public categories (donut outer) |
| L9 | 09-09 | 5 | **Perfect Daily** (Review skipped `perfect`; TT ends on supply ceiling) → must be analysable and hold records (finding 2) |
| L10 | 09-10 | 5 | **Daily new record** (score, most correct) after the perfect day, or a tie, per the finding-7 decision; **long streak** that ends at a stage boundary and a next stage that opens with corrects (distinguishes the §5 options) |
| L11 | 09-11 | 5 | **Survival specialist**; Survival depth PB; **streak PB** inside Survival; strike 3 mid-Journey (no later rows); `strike_index` 1–3 |
| L12 | 09-12 | 5 | **Standard specialist**; Standard 22/22 all correct; Standard score record; Journey pool exhausted on child 4 (child 5 absent) |
| L13 | 09-13 | 5 | **Tied record** (Daily score = L10); no clear strongest mode; Review with a **dropped middle allocation** (linkage fix); Weak Areas with slot evidence |
| L14 | 09-14 | 5 | Mature history (13 prior; series of 12 compatible); **extreme percentile**; Weak Areas skipped `weak_areas_unavailable` (still analysable) |

**Entitlement variants:** reuse Premium / Free / Unavailable over the same facts. Population unavailability is a separate toggle (snapshot table empty vs refresh error).

**Golden assertions:**
- record status per run;
- `previous` excludes current;
- series oldest first with the current run last;
- streak span ids point at real icons;
- strike indices;
- percentile midrank from the seeded frequencies (hand-checkable);
- insufficient cohorts return `status: insufficient` with counts;
- no user-facing `pp`;
- "questions played" wording;
- 4 vs 5 stage cohort separation;
- perfect day included.

---

## 14. Backend / frontend / persistence changes

**Persistence (backend, additive migrations):**
1. **Review linkage.**
   - Tag Review segments with the **allocation ordinal** (`daily_review:<allocation_ordinal>`), not the served index.
   - Persist dropped allocations (`daily_run_review_items.served` 0/1, `drop_reason`).
   - Link by tag, not by `zip`.
2. **Weak Areas evidence.** Persist the per-slot provenance at stage launch: new table `daily_run_weak_area_slots(run_id, stage_index, slot, family, miss_count, last_missed_at, source_question_result_ids_json, policy_version)`.
3. **Population.** Table `history_population_snapshots` (§8).
4. **Nothing needed for strikes, streaks, records, series or units.** All derive from existing rows and rounds.

**Backend projection (`history/`):**
- Split out modules:
  - `history/personal.py` (previous/change/summary/series)
  - `history/records.py`
  - `history/streaks.py`
  - `history/groups.py` (RG2 PC, outcomes, membership)
  - `history/population.py` (read and refresh)
- `daily.py` stays the orchestrator.
- Changes:
  - finding-2 fix (skipped-stage compat);
  - record key policy;
  - load `ranked_rounds.module_id` + `analytics_tag`, `completion_reason`, `context_json`;
  - add `routes/internal_history_population.py`.
- Query count 5 → 6 (population), plus at most one bounded round/context query.

**Frontend:**
- `src/lib/history/contracts.ts` (+ test): parse A–G, all optional.
- `historyFormat.ts`: "points" (not pp); "questions played".
- `QuestionTimeline.tsx`: optional `outcomes` prop from the DTO, a timeout state, a segmented ring for multi-question rounds, `max` page-size prop (Ranked default unchanged).
- `DailyRunRow.tsx` / `HistoryAnalysis.tsx`: Daily region.
- `StageAnalytics.tsx`: split per kind into `workspace/stage/{Standard,TimeTrial,Survival,WeakAreas,Review}Analytics.tsx`.
- New marks in `workspace/analytics/`: NestedDonut, PercentileGauge, DistributionStrip, RecordMedal, StreakBar, SeriesChart, DeltaChips.
- `lobby-preview/history/`: `analyticsLabFacts.ts`, `populationFixtures.ts`, builder extensions, generator script update, account switcher entry.

---

## 15. Deferred

- Per-module points (cautious).
- Per-question and per-family population correct rate (P2).
- Concept analytics (not written).
- Per-question timing.
- Review/Weak Areas population.
- Weak Areas conversion; recovery/mastery/weakness anything.
- Best-accuracy, fewest-strike and composite records.
- DC2 backfill.
- RG2 classification of Mastery chain families (separate RG2 task).
- Forfeit terminal fidelity beyond projecting `completion_reason`.

---

## 16. Workstream sequence (lowest-conflict)

| Step | Repo / branch (proposed) | Scope | Files | Depends on |
|---|---|---|---|---|
| **HUB6.3B0 — History re-land** | backend, new branch off `origin/master` `f6b6f012` (`codex/history-analytics-c`) | Merge HA-A + HA-B/HUB2.1–2.3 onto production; reconcile `_frozen_child_identity` and the `result_json.questions` freeze with Journey v2; rerun HUB2 + JOURNEY3–5 suites | `daily_challenge/wiring.py`, `daily_challenge/run/service.py`, `ranked_public/{service,persistence}.py`, `api_server.py`, migrations A/B, `history/*` | none — **must be first** |
| Owner decisions | — | §5 streak, §6 record key, finding 7 (Daily score), §8 thresholds/cohorts, §9 strongest mode | — | before B/C/D code merges |
| **HUB6.3B — Writer provenance fixes** | backend, off B0 | Review ordinal tag + drop persistence; WA slot evidence; migration `migrate_history_analytics_c.py` | `daily_challenge/wiring.py`, `daily_challenge/run/service.py`, new migration | B0 |
| **HUB6.3C — Personal projection** | backend, off B0 (parallel to B; different files) | Finding-2 fix; personal/series/records/streaks/groups/units/strike_index; policy v2; tolerant of B's new columns | `history/*` (new modules), `test_history_*` | B0 + decisions |
| **HUB6.3D — Population** | backend, off C | Snapshot table, refresh route, read path, strongest mode | `history/population.py`, new migration, `routes/internal_history_population.py`, `api_server.py` (router), one hook in `daily.py` | C |
| **HUB6.3E — Contract + Analytics Lab** | frontend `hub6/…` successor branch off `39231649` | Parser A–G; lab facts; population fixtures; golden generated through C/D's real route | `src/lib/history/*`, `src/pages/dev/lobby-preview/history/*`, `scripts/hub5-*` | C (D for population) |
| **HUB6.3F — Timeline + Daily analytics** | frontend, off E | Outcome ring from DTO, responsive count, Daily region (series, previous/change, records, streak, percentile, strongest) | `QuestionTimeline.tsx`, `DailyRunRow.tsx`, `HistoryAnalysis.tsx`, `historyFormat.ts`, `workspace/analytics/*` | E |
| **HUB6.3G — Stage analytics** | frontend, off F | Standard/TT/Survival visuals | `workspace/stage/*` (new), `StageAnalytics.tsx` (becomes a switch) | F (shared marks) |
| **HUB6.3H — Review / Weak Areas** | frontend + E regen | Connector, provenance, cautious donut | `workspace/stage/{Review,WeakAreas}Analytics.tsx` | B + G |

**Conflict and integration analysis:**
- **Highest risk: B0.** `origin/master` rewrote the same writer files for Journey. B and C must not start on `1ffa624c`, or their work repeats the re-land conflict.
- **B vs C:** B edits the writers (`daily_challenge/*`) and C the projection (`history/*`), so they are file-disjoint. C reads B's columns tolerantly (the `_table_columns` pattern already used in `daily.py`).
- **D after C:** both touch the `project()` tail; D adds one hook.
- **Frontend:**
  - E, F and G are sequential, because F and G share `workspace/analytics/*` marks and `DailyRunRow`. Splitting stage visuals into new per-kind files keeps G off F's files.
  - `QuestionTimeline` is shared with `RankedMatchRow`: new behaviour is opt-in by prop, so Ranked rows stay pixel-identical (test it).
  - `origin/main` touches only `QuestionReviewCard*` in the workspace. Low risk; rebase E onto `origin/main` first.
- **Goldens:** every backend step changes the generated golden. Regenerate only in E/H, never by hand, and keep the existing accounts byte-identical (new account).
- **Other streams:** JOURNEY (writers — coordinate B0 with its owner), RG2 (`public_category.py`: read-only use; the Mastery chain mapping is theirs), FUNNEL (separate `analytics` naming — keep `history/population`), USERS1 (identity; population excludes non-official accounts).

## 17. Decisions needed from the owner

1. **Daily streak rule:** max of stage streaks (recommended) vs cross-stage. Also whether Review and Weak Areas count.
2. **Record/score contract key:** exclude sampled content versions (recommended).
3. **Daily score:** records and percentile as-is (including Review points and the bot-speed bonus), or on a pre-Review/core-stage score, or not offered.
4. **How skipped stages enter the run key** (finding 2 fix shape).
5. **Population:** thresholds in distinct users; day plus rolling cohort; top-coding k; exclude playtesters.
6. **Strongest mode:** metrics (Standard score / TT correct / Survival depth), 10-point margin, per-Daily scope.
7. **Current-run streak:** Free or Premium.
8. **Survival depth for Free** (currently Premium-only on the wire).
9. **Standard grouping:** unit-based now, RG2 Mastery classification later.
10. **Cautious items** (per-module points, per-question population rate, Review donut, "reached the end"): go/no-go after visual review.
