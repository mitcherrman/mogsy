# Study Hall

## Objective

Lock the smallest product and technical architecture for Study Hall before UI or behavior work. Study Hall is the complete Free practice product: a finite daily menu of Mogzy-authored or Mogzy-personalized drills. Quiz Forge is the Premium unlimited/custom practice product.

This is an audit/decision handoff only. No Study Hall behavior was implemented.

## Locked product definition

- Study Hall chooses the activity, curriculum, length, and—where applicable—the subject. The player receives a useful but finite daily allowance.
- Every card has a server-authoritative UTC-day attempt limit. Clicking a button is not consumption; a successfully created canonical match is.
- Study Hall compiles a drill to `RankedFormat` and uses canonical Bot Ranked / `QuizRankedMatch`. It does not own another runner, result screen, generator stack, or attempt recorder.
- Quiz Forge owns arbitrary filters, subject choice, lengths, mixtures, saved recipes, and unlimited replay.
- SH1 must not add Premium gating.

## Current architecture

```text
current content authorities
  -> server-owned preset or personalized resolver
  -> validated RankedFormat
  -> POST /api/ranked/queue (match_with_bot=true)
  -> create_bot_match(..., format_override=...)
  -> frozen ranked_matches.format_snapshot_json
  -> QuizRankedMatch / canonical Ranked lifecycle
  -> ranked_submissions (+ generated-Mastery attempt bridge where already present)
  -> learning_attempts_for_user()
```

Ranked-style knowledge scoring is fixed-length points-only. Static curricula are normal named presets. Personalized drills should be server-resolved inputs compiled immediately to a `RankedFormat`; the client must never submit module versions, scoring, timers, or arbitrary format JSON.

### Current checkout warning

The backend path named in this task is at `0df11fdc` (LH2.4). The locked LH2.5 League Fundamentals work exists in linked worktree/branch `codex/lh25-practice-packs`, commit `7738e41a`, but is not merged into that checkout. The audit below treats the commit as the locked LH2.5 artifact and flags reconciliation before coding.

## Existing first-party presets

| Preset | Exact composition | Length and points | Status / weakness |
|---|---|---:|---|
| `practice.champion_fundamentals` | `champion_resource`, `champion_highest_base_stat`, `champion_stat_compare`, `champion_stat_level`; all current `quiz.runtime_casual` authorities through `quiz.v2` | 4 questions; correct points 2/2/2/3; +1 frozen speed bonus per slot | Permanent-ready. Small, coherent baseline. Attack type is intentionally absent pending transform/state ambiguity pruning; recognition families need a media bridge. |
| `practice.item_fundamentals` | `item_cost`, `item_exact_stat`, `item_multi_stat`, `item_builds_into_v2`, `item_component_v2`, `item_three_unique_stats`; current shared-bank pools through `quiz.v2` | 6 questions; 2 correct points each; +1 speed bonus | Permanent-ready. LH2.5's Jack of All Trades absorption leaves no execution gap: cost, exact/multi/three-stat, and both graph directions are represented. It remains a short factual drill, not exhaustive item mastery. |
| `practice.league_fundamentals` | `objective_spawn`, `camp_respawn`, `environment_mechanic`, `summoner_spell_cooldown`, `jungle_smite_timing`, `jungle_objective_interaction`; one `easy_game_knowledge` question per family | 6 questions; easy-tier points (2 correct) and +1 speed bonus | Implemented in LH2.5 commit `7738e41a`, absent from named checkout HEAD. Mechanically clean, but the name and curriculum do not align: four of six slots are jungle/objective-specific and two are explicitly jungle. Owner decision required. |

Smallest name-aligned alternative using current authorities: keep `objective_spawn`, `environment_mechanic`, and `summoner_spell_cooldown`; replace `camp_respawn`, `jungle_smite_timing`, and `jungle_objective_interaction` with runtime `rune_tree`, `rune_type`, and `rune_keystone`. This stays six questions and uses already adapter-compatible current sources. If the existing six remain, rename the card to **Jungle & Objective Fundamentals** rather than calling it general League Fundamentals.

## Current player surface audit

The player route is `/quiz` (`Quiz.tsx` -> `LeaguecraftHub`). The desktop middle/lower surface is:

1. Ranked-first three-column lobby hero.
2. A six-tile category rail. Five tiles immediately launch ten-question legacy Practice sessions in the local `Quiz.tsx` runner; Vision is unavailable. `loadPracticeCategoryQuestions()` provides the questions.
3. A two-column start row: compact **Practice Packs** on the left and **Time Trial** on the right. Every pack calls `handleSelectSet`, starts a `quiz_sessions` history row, fetches ten questions from `/api/quiz/questions`, and enters the local runner.
4. The Premium **Practice Builder** sits below the pack chips. It selects bank/owned/missed/weak pools plus category, source, difficulty and allowed length, then hands an answer-safe list to the same local runner. Saved sets remain there.
5. **Leaguecraft Record** tabs: `History`, `Review`, `Trends`, addressable as `/quiz#history`, `/quiz#review`, `/quiz#trends`. Review exposes owned/missed records; Trends reads legacy Practice + official Time Trial attempts and can preset Builder weakness filters.
6. A low-priority `/quiz/mastery` link remains below the hub.

Other routes: `/quiz/daily` is Time Trial; `/quiz/daily-challenge` is Daily Challenge v2; `/quiz/ranked` is the canonical live-match host; `/quiz/mastery` and `/quiz/mastery/:masterySetId` are the standalone Mastery journey; `/quiz/matchup` is the legacy matchup surface.

None of the three first-party Practice presets currently has a player launcher. The generic Ranked client can send a preset, but the visible pack/category/Builder handlers still enter the legacy `Quiz.tsx` runner.

## Candidate daily drills

| Drill | Purpose and authority | Proposed composition / length | Implementation status | New-user fallback |
|---|---|---|---|---|
| Weak Areas | Repair concepts with enough demonstrated evidence. Authority: `learning_attempts_for_user()`, aggregated by canonical **family**, not legacy display category. | Last 90 days; require 5 attempts in a family; choose up to 3 lowest-accuracy families below the user's overall accuracy; compile 6 slots, round-robin across selected families. Tie: more evidence, then stable family id. | Needs a small family-to-current-source resolver and personalized format compiler. Existing Builder logic (90 days/8 category attempts, `quiz_attempts` only) is historical guidance, not the authority. | Serve Item Fundamentals until evidence exists; label it as a baseline, not a claimed weakness. |
| Recent Review | Revisit concepts behind recent errors across current modes. Authority: newest incorrect `LearningAttempt` events with canonical refs. | Inspect the latest 50 attempts, dedupe by family, choose up to 3 missed families, compile 6 fresh questions round-robin. Prefer regenerated/current equivalent by family. Exact replay only when no safe generator/pool family resolver exists. | Needs the same resolver as Weak Areas plus recency selection. | Champion Fundamentals (short baseline) or Item Fundamentals; recommendation: Champion Fundamentals to avoid duplicating Weak Areas' fallback. |
| Champion Fundamentals | Basic champion stat/resource fluency. Current runtime-casual authorities. | Existing fixed 4-question preset. | Build now; preset exists in active backend checkout. | It is itself a day-one drill. |
| Item Fundamentals | Core price/stat/build-path fluency. Current stored shared-bank authorities. | Existing fixed 6-question preset. | Build now; preset exists in active backend checkout. | It is itself a day-one drill. |
| League Fundamentals | General map/rules/systems fluency. Current shared-bank and runtime authorities. | Six questions. Owner must choose the current jungle-heavy curriculum, rename it, or use the name-aligned replacement above. | LH2.5 implementation exists off current checkout; reconcile first. | It is itself a day-one drill. |
| Extended Champion Mastery | A bounded, broader one-champion generated lesson. Current `mastery_slice.v1` + `synthesize_champion_mastery`. | One Mastery segment, target 10 challenges (owner may choose 8–12); 1 point per correct plus +1 only when perfect and strictly faster than the bot. Live readiness must prove the chosen champion has N publishable unique prompts. | No generator change is required: `challenge_count` already requests exactly N, dedupes effective prompts, rotates candidates by match seed, freezes ordered steps, and fails instead of under-filling. Needs subject-selection policy and preset/resolver. | Rotate from the supported roster using a server-owned UTC schedule. |
| Matchup Drill | Practice comparative matchup knowledge without exposing a selector. Current `mastery_slice.v1` + `synthesize_matchup_mastery`. | One 8-question segment recommended for planning; generator combines comparison candidates with both champions' atomic banks, dedupes, rotates by seed, and validates exact count. | Runtime supports it now; needs curated pair catalog/rotation and readiness checks. Content quality varies by pair, so only pairs passing live readiness may be scheduled. | Replace unavailable pair with the day's Extended Mastery champion; never present a dead card. |
| Speed Trial | Accuracy under time pressure. Current Daily Score Attack/Time Trial authority. | Current 30-question frozen daily pool, 90-second run; actual answered volume may be below 30. | Exists as a separate engine. Recommended migration is product-policy work, not an immediate rewrite. | Always available when the daily pool materializes; no history needed. |

### Champion selection options for Extended Mastery

- A — server-rotating supported champion: clearest Study Hall/Quiz Forge split and day-one safe. **Recommended for v1.**
- B — recent champion signal: useful later, but current learning attempts do not provide a reliable universal “recently played champion” dimension.
- C — one limited user choice: technically easy, but spends much of Quiz Forge's champion-selection boundary.
- D — weakness-personalized champion: requires a champion ontology not present in the unified attempt seam and is unnecessary for v1.

### Matchup selection options

- Curated UTC rotation from a server-owned list, skipping pairs that fail readiness: **recommended**.
- Recent-champion/role signal: defer until a trustworthy signal and fallback policy exist.
- Letting the user choose either/both champions: do not ship in Study Hall; that is Quiz Forge.

## Weak Areas authority

`services.learning_attempts.learning_attempts_for_user(cur, user_id)` is the clean current read authority. It unions event-level `quiz_attempts` and `ranked_submissions`, normalizes stored/runtime questions to `canonical_question_ref`, derives `question_key` and family when possible, and retains mode/session/preset/difficulty. It intentionally excludes discovery rollups so executions are not double-counted.

Use family as the first aggregation key because it maps to current pools/generators and is more precise than legacy category. Do not revive Builder's direct `quiz_attempts` query: it excludes ordinary Ranked and uses display categories. Keep the model simple: a 90-day cutoff, 5-event per-family floor, raw accuracy, at most 3 families. No Bayesian score, cross-user comparison, or recurring-weakness model is needed.

Known coverage gap: generated Mastery appears only through its existing best-effort attempt bridge; Time Trial practice writes no learning events; current Daily Challenge is not in `learning_attempts_for_user()`. These are telemetry facts, not reasons to query discovery rollups.

## Recent Review design

Use concept-level regeneration, not exact-question replay:

1. Read recent incorrect events from `learning_attempts_for_user()` newest-first.
2. Dedupe by family, retaining recency and evidence count.
3. Resolve each family to its current source (`shared_bank` family, `runtime_casual` family, or supported Mastery resolver).
4. Generate a fresh fixed format and freeze it at match creation.

`canonical_question_ref` is the durable cross-mode identity; `question_key` is available for `quiz:` refs and should be used for family extraction and optional exact fallback. Runtime-generated questions already carry stable semantic keys. Replaying the identical frozen prompt/options by default encourages answer memorization and can preserve stale content, so exact replay is a last resort and must still use the original snapshot rather than rejoining current bank rows.

## Current Time Trial audit

- Routes: player `/quiz/daily`; diagnostic `/dev/daily-score-attack`; backend `/api/daily-score-attack/today`, `/runs`, `/practice-runs`, `/runs/current`, `/runs/{id}/answers`, `/finalize`, `/results`, question image, and `/history`.
- Frontend: `QuizDailyScoreAttack` is a thin production wrapper over `DailyScoreAttackPage`, with `DailyScoreAttackEntry`, countdown, game, shared result shell, and review breakdown.
- One official run per verified non-anonymous account per UTC date, enforced by partial unique index `ux_dsa_official`. Starting twice resumes/returns the existing run. This is an exact one-per-day authority, not an N-per-activity authority.
- Signed-in accounts must finish today's official run before practice. Verified anonymous users may practice without an official run. Practice runs are otherwise unlimited.
- A date/version deterministically samples 30 unique active, multiple-choice, `TIME_TRIAL`-eligible stored questions. Complete prompt/options/correct answer/explanation/category/difficulty/media path and order are frozen once for the day. Every official and practice run that day uses that identical pool and order.
- Runtime-generated rowless questions are not supported; this mode selects stored `quiz_questions`. Safe stored media is served through an opaque authenticated endpoint.
- Timer: 90 seconds for the whole run, maximum 30 questions.
- Scoring: easy/medium/hard base 100/125/150; speed bonus falls from 100 at <=2s to 0 at >=12s; correct-answer combo multipliers are 1x (1–2), 1.25x (3–5), 1.5x (6–9), 2x (10+); a miss resets combo and awards 0.
- Rewards: per-question XP plus a 250 completion bonus and daily streak on an official participated run, transactionally/idempotently guarded. Practice does not award the official streak/bonus.
- Persistence: frozen challenges/questions, official/practice runs, per-answer resolutions, score/combo/highest combo, completion reason, reward flags and streak value. History returns terminal official rows, personal best, and current streak.
- Telemetry: official resolved answers are mirrored transactionally into `quiz_attempts` with `source=daily_score_attack`; practice answers have no learning-attempt record. Frontend emits `dsa_*` funnel events.

### Time Trial product job and recommendation

Time Trial is the only shipped speed/score-chasing loop: a shared frozen daily field, 90-second urgency, combo optimization, PB, streak, and replayable review. Fundamentals, Weak Areas, Recent Review, and Mastery are learning curricula; they do not replace that competitive self-improvement job.

Recommend **B now, converging toward C**: keep one official daily Speed Trial inside the Study Hall menu and remove/unoffer unlimited same-day practice when Study Hall launches. Preserve the existing engine initially; later give it Study Hall catalog/status identity and telemetry rather than forcing its timer/combo model through Bot Ranked. Do not retire it, and do not keep unlimited practice in the Free product. Whether Study Hall grants one or a few official speed attempts is an owner decision; the current database contract supports exactly one.

## Daily Challenge boundary

Daily Challenge v2 at `/quiz/daily-challenge` is a separate finite daily authored run: 11–15 scored cards, including exactly one five-card Meta Reflex block, one peak, opening/build/close waves, first-attempt scoring, grade, XP, completion bonus and streak. It has one official run per identity/date (`ux_dc2_official`) and a frozen daily plan. It is not Time Trial: no global 90-second race, no speed bonus/combo/PB, and it uses a composed learning arc rather than a random 30-question speed pool.

It overlaps Study Hall in “daily finite knowledge activity” but not in purpose: Daily Challenge is the single shared daily event/reward ritual; Study Hall is a menu of repeatable guided drills. Keep Daily Challenge in the Play record, not as a Study Hall attempt card. Use distinct copy and avoid awarding a second indistinguishable “daily completion” streak from Study Hall.

## Daily entitlement architecture

Existing reusable ideas:

- Time Trial and Daily Challenge prove UTC date keys plus database uniqueness for one official run.
- Combat Lab proves an atomic `(user_id, usage_date)` UPSERT bounded by a daily limit, but its credits, Premium bypass, fail-open policy, and table are the wrong product authority.
- The canonical entitlement service answers Premium capability; SH1 must not consult it.

Add one narrow Study Hall authority, not a generic entitlement framework:

```text
study_hall_drill_catalog (code-defined)
  key, version, title, resolver_kind, daily_limit, expected_questions

study_hall_attempts (durable rows)
  id, user_id, activity_key, activity_version, activity_date_utc,
  ordinal, match_id UNIQUE, created_at
  UNIQUE(user_id, activity_key, activity_date_utc, ordinal)
```

The launch service owns one transaction:

1. Resolve identity, UTC date, catalog entry, and remaining count.
2. Resolve/validate the static or personalized `RankedFormat` and run readiness.
3. Create the canonical bot match and persist its frozen format.
4. Insert the Study Hall attempt row referencing that match before commit.
5. Return match + `limit/used/remaining/reset_at`.

Consumption therefore occurs only when durable match creation succeeds, in the same transaction as the match. A failed button request, resolver failure, readiness failure, or rolled-back match consumes nothing. A retried request needs a short client idempotency key (or launch id) so a lost response cannot create two attempts. Do not consume on first answer: that permits creating unlimited frozen matches before answering and complicates abandoned-match accounting.

`GET /api/study-hall/today` should return the catalog and server-computed state; `POST /api/study-hall/activities/{key}/launch` should atomically launch. Static definitions retain durable preset keys. Personalized activities use stable activity keys (`study_hall.weak_areas`, `study_hall.recent_review`, etc.) plus a unique resolved `format_id`/snapshot; they do not need user-visible saved presets or a recipe table.

Telemetry minimum: activity key/version, fallback reason, selected families/subjects in non-secret format analytics tags/snapshot metadata, launch success/refusal, attempt ordinal, match id, completion, answers/correctness from existing Ranked records. Never duplicate answer facts in the Study Hall ledger.

## Day-one experience

Show a full usable menu, never dead cards:

- Champion Fundamentals — normal.
- Item Fundamentals — normal.
- League Fundamentals (or renamed Jungle & Objectives) — normal.
- Weak Areas — labeled “Build your baseline” and resolves to Item Fundamentals curriculum for that launch.
- Recent Review — labeled “Start your review record” and resolves to Champion Fundamentals curriculum for that launch.
- Advanced rotating slot — server-rotated Extended Mastery champion, curated matchup when ready, or Speed Trial according to the chosen roster.

Fallback launches must retain the card's attempt bucket but record the fallback resolver in telemetry; otherwise the UI and server counters disagree. Do not invent onboarding questions or show empty/locked personalized cards.

## Daily roster options

Question totals below are capacity, not guaranteed completion; Speed Trial is timer-capped and may end below 30.

### Option A — six fixed cards (recommended first release)

Weak Areas 6; Recent Review 6; Champion Fundamentals 4; Item Fundamentals 6; League Fundamentals 6; Speed Trial up to 30.

- Per pass: up to 58 questions.
- Strengths: every job is legible; uses three ready fundamentals; retains the differentiated speed loop; only two new content resolvers.
- Drawbacks: no Mastery/Matchup exposure; Speed Trial dominates raw volume.
- Complexity: lowest coherent product, except the Time Trial catalog/limit migration decision.

### Option B — six cards with a rotating advanced slot

Weak 6; Recent 6; Champion 4; Item 6; League 6; rotating Extended Mastery 10 / Matchup 8 / Speed Trial 30.

- Per pass: 36 on Mastery day, 34 on Matchup day, up to 58 on Speed day.
- Strengths: varied guided curriculum, bounded exposure to current generators, no selector creep.
- Drawbacks: uneven daily volume and harder card explanation; Matchup coverage/readiness needs curation.
- Complexity: medium; needs advanced resolver and rotation catalog.

### Option C — seven fixed cards

Weak 6; Recent 6; Champion 4; Item 6; League 6; Extended Mastery 10; Speed Trial 30.

- Per pass: up to 68 questions.
- Strengths: stable menu and daily Mastery depth.
- Drawbacks: visually busy, high Free volume, Matchup has no home, and Speed still dwarfs other cards.
- Complexity: medium-high.

Do not launch seven fixed cards plus Matchup; that is an eight-card catalog and begins to resemble an unlimited hub rather than a guided daily menu.

## Attempt-limit options

Volumes use the exact/proposed lengths above and count a Time Trial run as its 30-question maximum.

| Model | Option A max | Option B max | Option C max | Notes |
|---|---:|---:|---:|---|
| 1. Two attempts per drill | 116 | 68–116 depending rotating slot | 136 | Simplest counter model. Very generous once Speed Trial is included twice. |
| 2. Fundamentals 3; personalized/advanced 2; Speed 1 | 98 (`3*(4+6+6) + 2*(6+6) + 30`) | 76 Mastery / 72 Matchup / 98 Speed | 118 (`48 + 24 + 20 + 30`) | Recommended shape for owner consideration; rewards repeat fundamentals without multiplying the speed pool. |
| 3. One official + one replay for learning drills; Speed official only | 86 | 68 Mastery / 64 Matchup / 86 Speed | 106 | Clear “first run + correction run” story; replay is still a consumed second attempt, not unlimited practice. |

These are policy options, not chosen limits. If Time Trial remains one official attempt and its unlimited practice is removed, raw daily capacity stays understandable. If Time Trial keeps unlimited practice, no Study Hall maximum is real.

## Study Hall vs Quiz Forge boundary

Study Hall may expose only server-authored card identity, today’s resolved subject/curriculum, fixed length, attempt state, and launch. It must not expose:

- unlimited sessions or arbitrary replay;
- arbitrary session length;
- arbitrary pool/family/question-type/difficulty/generator controls;
- unrestricted champion or matchup selection;
- arbitrary mixed curricula or client-supplied `RankedFormat`;
- saved recipes/sets;
- whole-bank, owned-bank, or missed-bank browsing as a launch selector;
- a general “weakest categories” configuration screen.

Quiz Forge should eventually compile allow-listed user recipe input into the same `RankedFormat` seam. The current Practice Builder demonstrates useful filters and saved-set custody, but its legacy stored-bank list and local runner must not become the new architecture.

## Legacy ownership/deletion map

| Existing surface/infrastructure | Future owner | Eventual action / deletion condition |
|---|---|---|
| Compact Practice Packs and category-rail Practice launches | Study Hall | Replace with daily cards; delete handlers after every pack/category intent has a canonical drill or explicit retirement. |
| `Quiz.tsx` local Practice phase machine, answer/result rendering, `/api/quiz/questions`, session/attempt callers | Study Hall executor is Bot Ranked; content authorities may survive | Delete runner/callers only after all player Practice entry points migrate and History requirements are projected. |
| Practice Builder, weak/missed/owned pools, saved sets | Quiz Forge | Replace UI and compiler; migrate or deliberately retire saved-set custody before deleting. |
| Trends as a launch path / weakest-category handoff | Study Hall Weak Areas | Remove launch responsibility; retain analytics only if History still needs longitudinal reporting. Do not call Trends itself “Study Hall.” |
| Review execution and immediate “practice missed” replay | Study Hall Recent Review | Replace exact local replay with concept resolver; keep Review as a record surface. |
| History/Leaguecraft Record | History | Keep. Add Study Hall identity by projection, not another answer ledger. |
| Standalone Mastery journey | Quiz Forge or retire after product decision | Study Hall uses bounded generated slices, not Full Mastery. Do not delete until journey ownership is decided. |
| Standalone matchup selector/session | Quiz Forge | Study Hall gets curated pairs only. Retire legacy execution after Quiz Forge migration. |
| Time Trial official engine | Study Hall Speed Trial | Keep initially; surface through Study Hall status/catalog. Remove unlimited practice path if owner approves. |
| Daily Challenge | Daily Challenge | Keep separate. |

## Recommended implementation sequence

1. **SH1.1 — branch reconciliation + catalog/attempt authority.** Merge/rebase the locked LH2.5 preset into the implementation base; decide League curriculum/name; add code-defined Study Hall catalog, durable atomic attempt ledger, idempotent launch endpoint, and today/status projection. Wire only existing static presets in backend tests; no player UI.
2. **SH1.2 — personalization resolver.** Add the shared family-to-current-source map, then Weak Areas and Recent Review selection/fallbacks over `learning_attempts_for_user()`. Prove cross-mode events, evidence floors, fresh generation, fallbacks, and frozen format identity.
3. **SH1.3 — advanced resolver.** Add server-owned Champion rotation and curated Matchup rotation with live readiness. Use existing `mastery_slice.v1`; do not alter generators or build Full Mastery.
4. **SH1.4 — Speed Trial policy migration.** After the owner chooses its fate, expose current official state in the Study Hall catalog and either disable/unoffer unlimited practice or define the new official count. Add missing practice telemetry only if practice survives.
5. **SH1.5 — desktop Study Hall UI and caller migration.** Replace the temporary pack/Builder/Time Trial start row and category-rail practice behavior with today cards, counters, fallbacks, and canonical Ranked launch. Preserve History/Review as records. Stop before mobile redesign, Quiz Forge, or broad deletion.
6. **SH1.6 — legacy cleanup (separate approval).** Delete only callers proven unreachable after History/Quiz Forge ownership is resolved.

## Owner decisions required

1. Reconcile the implementation base: merge/cherry-pick LH2.5 commit `7738e41a`, or choose a different branch before SH1.1.
2. League Fundamentals: keep the jungle-heavy six, rename it **Jungle & Objective Fundamentals**, or approve the proposed general six.
3. Choose roster A, B, or C. Recommendation: A for first release; graduate to B after advanced readiness is proven.
4. Choose daily limit model. Recommendation for consideration: Model 2, but no limit is locked here.
5. Time Trial: approve the recommendation to keep one official Speed Trial and remove/unoffer unlimited practice; decide whether the name remains Time Trial or becomes Speed Trial.
6. Extended Mastery length (8, 10, or 12) and champion policy. Recommendation: 10, server UTC rotation.
7. Matchup length and curated-pair ownership. Recommendation: 8, server UTC rotation from readiness-proven pairs.
8. Weak Areas evidence parameters: proposed 90 days, 5 attempts/family, top 3, six-question session.
9. Whether day-one fallback copy may reveal the fallback curriculum or should use a neutral “baseline” label.
10. Whether Study Hall is account-only. Canonical Bot Ranked currently requires effective Premium/admin, which conflicts with Study Hall as the Free product; SH1.1 must add a narrow Study Hall authorization path without making ordinary Bot Ranked Free.

## Current state

- No Study Hall UI, counters, resolver, catalog, or entitlement table exists.
- Champion and Item Fundamentals are in the named backend checkout.
- League Fundamentals exists only in the LH2.5 linked worktree/commit noted above.
- The frontend still launches legacy Practice for every visible pack/category/Builder path.
- Time Trial and Daily Challenge each have their own one-official-run UTC authority; neither generalizes to N attempts per Study Hall activity.
- `learning_attempts_for_user()` is the correct personalization seam, with the documented telemetry gaps.
- No behavioral files were changed by SH1.0.

## Next task

After the owner resolves decisions 1–5, begin **SH1.1 — Study Hall catalog + atomic daily attempt authority + static-preset launch**, with no UI and no Premium gating.
