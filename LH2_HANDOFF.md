# LH2 — Practice Composition → Canonical Bot Ranked

## Objective

Identify the smallest current seam through which Study Hall and Quiz Forge can define a curated Practice session and execute it as an unrated Bot Ranked match in the current Ranked shell. This is an architecture audit only; no product behavior was changed.

## Locked product/architecture decisions

- Ranked is the canonical gameplay shell and lifecycle.
- Bot Ranked is the canonical Practice executor.
- Study Hall and Quiz Forge are configuration producers, not gameplay engines.
- Do not add a Practice renderer, Practice match state, or a second generator ecosystem.
- Reuse current content authorities and Ranked modules.
- Retire legacy Practice execution only after every caller has migrated.
- History redesign, Time Trial migration, desktop UI, and mobile are out of scope.
- Practice / Study Hall / Quiz Forge must consume current family and generator authorities. They must not revive retired legacy casual-question banks or treat historical quiz_questions rows as canonical truth merely because those rows still exist.

## LH2.1 implementation — Item Fundamentals

LH2.1 is complete. The first production Practice activity is the server-owned
`practice.item_fundamentals` preset. It compiles to the frozen Ranked format
`practice_item_fundamentals` v1 and launches only through
`POST /api/ranked/queue` with `match_with_bot: true`.

Exact fixed composition (six modules, one question each, `quiz.v2`, additive
points, +1 frozen speed bonus):

1. `easy_item_cost` → `item_cost` (easy, 2 correct points)
2. `medium_item_stats` → `item_exact_stat` (medium, 2 correct points)
3. `medium_item_stats` → `item_multi_stat` (medium, 2 correct points)
4. `medium_item_graph` → `item_builds_into_v2` (medium, 2 correct points)
5. `medium_item_graph` → `item_component_v2` (medium, 2 correct points)
6. `medium_item_stats` → `item_three_unique_stats` (medium, 2 correct points)

These are the current active Ranked pool declarations. The graph slots use the
current `_v2` families; the retired empty `item_builds_into` and
`item_component` duplicates remain retired. No `quiz.runtime_casual` adapter,
copied rows, new provider, or new generator was added.

The format is `bot_eligible=True`, `rating_eligible=False`, uses the points
scoring model, and has `match_length=6`. Creation follows the existing path:

`QueueJoinIn.preset` → `service.preset_format()` →
`create_bot_match(..., format_override=...)` → `create_match_rows()` → frozen
`RankedFormat` → registered `quiz.v2` → canonical Ranked settlement/results.

The existing Playtest-only grant remains exclusive to `playtest`. A Practice
preset uses the ordinary Bot Ranked Premium/admin authorization and still
requires `match_with_bot`. The queue schema now accepts namespaced dotted keys;
no new DTO or endpoint exists.

Preset identity persists through the existing smallest seam: the immutable
`format_snapshot_json.format_id` maps back to
`session_preset="practice.item_fundamentals"`. No telemetry column or recipe
system was introduced.

The frontend required no product code. The generic Ranked client already sends
an optional preset to `/api/ranked/queue`, and `/quiz/ranked` mounts
`QuizRankedMatch`. A boundary test pins that route and confirms the canonical
Ranked match files do not reference the legacy Practice `QuizPhase`, question,
or attempt endpoints. The old Practice UI remains present for unmigrated
callers but is not entered by this preset.

Attempt behavior is unchanged Ranked behavior: answers write immutable
`ranked_submissions`; correctness is derived server-side; stored-bank identity
is frozen as `canonical_question_ref="quiz:<question_key>"`; and the same
transaction updates `ranked_question_discoveries` (`times_answered` /
`times_correct`). Shared-bank Ranked does not mirror these answers into legacy
`quiz_attempts`, and the preset does not add a special Practice recorder or a
new activity column. Match-level Practice attribution is the persisted preset
identity described above.

Files changed:

- Backend: `ranked_formats/schema.py`, `ranked_formats/__init__.py`,
  `ranked_public/service.py`, `ranked_public/projections.py`,
  `routes/ranked_public.py`, `schemas/ranked_public_schemas.py`,
  `test_lh21_practice_item_fundamentals.py`, and a test-fixture-only exposure
  of its mutable clock in `test_ranked_playtest_preset.py`.
- Frontend: `src/pages/quiz-ranked/PracticePreset.boundary.test.ts` and this
  handoff.

Focused verification:

- LH2.1 backend: 8 passed. This includes exact format/family validation,
  snapshot round-trip, ordinary queue launch, bot/unrated/preset persistence,
  bot-required rejection, alternating correct/incorrect settlement, six-module
  completion, points result, immutable submissions, canonical question refs,
  and discovery correctness counts.
- RB3 regression subset: 5 passed (authorized launch, ordinary Premium refusal,
  unknown-preset refusal, bot/unrated semantics, persisted preset identity).
- Frontend boundary: 2 passed (`QuizRankedMatch` route and absence of legacy
  Practice execution calls).
- Python compile check passed for all touched backend production modules.
- A broader opportunistic run reached 95 passing tests but also hit 14
  unrelated/pre-existing fixture/environment failures (missing shared-bank
  setup in old Playtest ordinary-bot cases and Meta Reflex reveal-timing tests);
  no broad suite result is claimed.

Limitations: this is intentionally one fixed first-party preset. There is no
Study Hall launcher yet; an entitled caller can launch the key through the
ordinary queue contract. History has no new dedicated activity field, and
shared-bank Ranked continues to use Ranked submissions/discoveries rather than
legacy `quiz_attempts`.

Migration/deletion status: no legacy Practice code was deleted. Its callers
are not yet migrated. This preset proves the replacement execution path and
never uses the legacy gameplay or result renderer.

## Current canonical Bot Ranked path

The current player path is one ordinary queue request with a bot flag; the old standalone bot endpoint/client is retired.

`Quiz.tsx` Ranked entry / `useRankedQueue.joinWithoutClass(...)`
→ `src/lib/ranked-public/client.ts::joinQueue`
→ `POST /api/ranked/queue` with `match_with_bot: true`
→ `schemas/ranked_public_schemas.py::QueueJoinIn`
→ `routes/ranked_public.py::join_queue`
→ `_authorize_ranked_bot` (verified account; effective Premium or admin)
→ `_create_admin_bot_match`
→ `ranked_public.service.create_bot_match`
→ `create_match_rows`
→ `format_for_creation(..., target="public")` for an ordinary match, or an explicitly supplied preset `format_override`
→ freeze the complete `RankedFormat` in `ranked_matches.format_snapshot_json`
→ resolve `SegmentSpec` with `ranked_formats.schema.resolve_segment_spec`
→ resolve the pinned `(module_id, module_version)` through `ranked_modules.registry`
→ generate/freeze the segment through `ranked_public.segment_flow` and the module
→ return the normal matched queue projection.

Frontend handoff:

`QueueStatusView.matchId`
→ navigate to `/quiz/ranked` with `location.state.matchId`
→ `QuizRankedPage::RankedMatchHost`
→ `QuizRankedMatch`
→ `useRankedMatch` and the ordinary Ranked match/segment endpoints
→ canonical `CanonicalArena` / `ArenaShell`, module renderers, timeline, settlement, and `MatchOverFrame`/`GameResultsShell`.

Bot versus human is an opponent and rating distinction, not a format distinction. `create_bot_match` creates a synthetic second participant, stamps `is_bot_match`, uses `creation_source="bot_playtest"`, and is skipped by rating. Unless a named preset supplies a format override, bot and human creation both use the `public` format target.

Results are `ranked_results`, exposed by `GET /api/ranked/matches/{id}/result`, review, discoveries, and `GET /api/ranked/history`. Ranked submissions remain authoritative. Shared-bank questions preserve canonical `question_key` identity through Ranked discovery refs; generated Mastery challenges additionally opt into `quiz_attempts` through `MasterySliceModule.supports_generated_attempts` and `service._record_generated_attempt`. Do not replace either path in Practice.

## RB3/RB4 Playtest reconciliation

### What existed and what survives

RB3 still exists and is active:

- Frontend route: `/quiz/playtest` in `src/App.tsx`.
- Gate/entry: `QuizPlaytestPage`, `useRankedPlaytestAccess`, `PlaytestMatchHost`.
- Request: the normal `joinQueue` call with `{ matchWithBot: true, preset: "playtest" }`.
- Backend gate: `routes.ranked_public._authorize_preset` permits a current playtest grant or admin and requires a bot request.
- Resolver: `ranked_public.service.PRESET_FORMATS` → `preset_format`.
- Composition: `ranked_formats.schema.guided_playtest_format()` returns an ordinary validated `RankedFormat`.
- Creation: `create_bot_match(..., preset=...)` passes the resolved format as `format_override` to `create_match_rows`; it does not mutate a match after creation.
- Identity: the frozen `format_id == "ranked_playtest_guided"` is projected as `playtest.session_preset == "playtest"` for compatibility.

RB4A replaced RB3's seven-slot demonstration with a temporary exhaustive audit: currently 51 segments / 82 answers across shared-bank families, four Meta Reflex groups, and generated Champion, Matchup, and applied-chain Mastery. It uses only production modules and sources, but its ordering, damage headroom, analytics tags, derived sample subjects, and exhaustive family census are audit scaffolding, not a product curriculum.

### Durable idea

The reusable seam is:

named/authorized session selection
→ resolve or compile to a validated `RankedFormat`
→ pass it as `format_override` during canonical bot-match creation
→ freeze and run it through ordinary Ranked.

The Playtest did **not** add a renderer, endpoint, question bank, scoring engine, or post-creation state mutation. This is exactly the basis Practice should use.

### Temporary scaffolding not to promote

- `playtest` entitlement semantics and `/quiz/playtest` visibility gate.
- `PlaytestMatchHost`, `usePlaytestSession`, and placeholder interstitial copy unless a specific Study Hall experience actually needs pauses.
- Hardcoded interstitial boundaries keyed to RB3 segment counts.
- `_guided_playtest_segment_pattern`, `_rb4a_*`, temporary timers/damage, exhaustive coverage arithmetic, and audit analytics tags.
- `projections._PRESET_BY_FORMAT_ID` as a general recipe identity store; it is a compatibility inference for one known format.
- `admin_bot` saved-format target. It is deliberately dormant for player product paths and is not a Practice lane.

## Current composition model

### Format

`ranked_formats.schema.RankedFormat` is the authoritative full-session composition. It owns `format_id`, version/status, ordered/cycling `segment_pattern`, bot/rating eligibility, scoring model, and (for points formats) exact `match_length`. It is validated once and frozen in the match.

Code-defined formats coexist with DB-backed admin format configuration in `ranked_format_configs`; ordinary public creation reads the latest `public` revision, while a session preset intentionally bypasses that mutable lane with a frozen override.

### Segment

`SegmentSpec` is one ordered slot. It pins `module_id`, `module_version`, `challenge_count`, timers, scoring/damage or point values, `module_config`, and an optional `analytics_tag`. `resolve_segment_spec` cycles the pattern by segment number.

### Module

`ranked_modules.contract.RoundModule` is the interaction lifecycle boundary: deterministic generation, input validation, correctness, bot choice, public view, reveal, and resolution. Modules cannot mutate Ranked HP/points, match completion, persistence, rating, or XP.

Registered current module versions include:

- `quiz.v1`: one ordinary Ranked question, outcome/HP scoring.
- `quiz.v2`: the same question/provider, additive points scoring.
- `item_cost_duel.v1-v5`: current v4/v5 are mixed Meta Reflex blocks.
- `mastery_slice.v1`: generated Champion, Matchup, or applied-chain Mastery.

### Interaction/question and generator hooks

- `quiz` uses the match provider or a named `ranked_public.shared_bank` pool. `module_config.pool` selects a pool; optional `families` narrows it to families already declared by that pool.
- Meta Reflex uses `item_cost_duel.v4/v5`; `module_config.families` narrows its existing factual-duel candidate families.
- `mastery_slice.v1` uses `ranked_modules.mastery_config`: `champion`, `matchup`, or `applied_chain` configuration. It synthesizes from current canonical data when the segment opens and freezes the result.
- Every module is rendered by the current Ranked frontend contracts/renderers; no Practice renderer is needed.

What can already be expressed without a new runtime:

- A champion-scoped drill: one or more `mastery_slice.v1` segments using `champion_config(champion_id)`.
- A matchup drill: `mastery_slice.v1` with `matchup_config(a, b)`.
- Stored production-bank drills: `quiz.v1/v2` segments selecting existing pools and optionally their declared families.
- Meta Reflex blocks narrowed to current supported families.
- Any ordered heterogeneous mixture of those segments, subject to current validation/readiness and scoring constraints.

What is not currently generic: arbitrary champion filtering inside shared-bank `quiz` pools, arbitrary runtime-casual generators, and fixed-length points sessions containing `mastery_slice.v1`.

## Recommended composition seam

Use the existing RB3 seam, generalized narrowly:

`Practice selection`
→ server-authorized recipe/preset resolver
→ validated `RankedFormat`
→ `create_bot_match(..., format_override=resolved_format)`
→ `create_match_rows`
→ frozen canonical match.

For LH2.1, add one first-party preset factory beside `PRESET_FORMATS`; do not add a general recipe framework or persistence. The existing `RankedFormat`/`SegmentSpec` graph already is the compiled session representation.

Later, Quiz Forge should submit a constrained user recipe to a server compiler that maps allowed choices to `SegmentSpec`s and then uses the same `format_override`. Never accept an arbitrary client-supplied `RankedFormat`, module version, timer, scoring, or generator payload.

## Minimal recipe/preset contract

No new recipe type is required for LH2.1. A stable preset key plus a server-owned factory returning a validated `RankedFormat` is sufficient and matches RB3.

If/when Study Hall recommendations or Quiz Forge require data rather than one named factory, introduce one small **input** contract and compile it immediately into existing types:

```text
PracticeRecipeInput {
  key                 // stable first-party/saved recipe identity
  modules[]           // allow-listed module choice + its safe selector + count
}
```

Each `modules[]` entry is a discriminated safe selector such as Champion Mastery `{ champion_id, count }`, Matchup Mastery `{ champion_a_id, champion_b_id, count }`, shared-bank `{ pool, families?, count }`, or Meta Reflex `{ families?, count }`. The compiler, not the caller, chooses module/version, timers, scoring, point/damage values, and converts these to `SegmentSpec`.

Only two fields are justified now:

- `key`: required by lookup, authorization, stable `format_id`, diagnostics, and future saved-recipe identity.
- `modules`: required to produce `RankedFormat.segment_pattern` and module configuration.

Do not put title, origin, bot/unrated flags, presentation copy, timestamps, ownership, or telemetry into the execution recipe yet. The launcher/catalog can own title/origin; Practice creation always supplies bot/unrated policy; `SegmentSpec.analytics_tag` already exists when measurement is needed. Add durable source identity to match storage only when a real consumer exists rather than extending the current `format_id` inference prematurely.

## Content-source compatibility

| Source | Current Ranked support | Adapter needed? | LH2.1 scope? |
|---|---|---|---|
| Stored `quiz_questions` | A — `shared_bank.POOLS` + `quiz.v1/v2`, Ranked mode gate, stable `question_key` discovery refs | No for existing pools/families; a new pool is content policy, not a runtime | Optional; use only if it cleanly supports the chosen preset |
| Runtime casual generators (`quiz.runtime_casual`) | D — Practice endpoint can compose them, Ranked cannot consume that provider directly | Yes; a future Ranked module/provider adapter, not a copied generator | No |
| Champion Mastery | A — `mastery_slice.v1` + `champion_config`, synthesized on demand | No | Yes; cleanest proof source |
| Matchup Mastery | A — `mastery_slice.v1` + `matchup_config` | No | Not required; proves Quiz Forge compatibility later |
| Applied combat chain | A — `mastery_slice.v1` + `applied_chain_config` for certified combinations | No | No |
| Meta Reflex | A — `item_cost_duel.v4/v5`, current factual-duel families and family narrowing | No for supported families | Optional, not needed for the smallest proof |
| Environment/canonical stored questions | A where their families are in `easy_game_knowledge` and Ranked-eligible | No for existing pool entries | No requirement |
| Environment/runtime-only questions | C/D depending on family; no generic runtime provider in Ranked | Small provider/module adapter only after a concrete preset needs it | No |
| Standalone `/api/quiz/matchup` sessions | D as a runtime; its generator concepts are already available through Matchup Mastery | Do not adapt the session engine; use `mastery_slice` | No |
| Legacy Ranked candidate/placeholder sources | Existing compatibility authorities, not preferred Practice sources | No | No |

## Legacy Practice execution map

| Component/system | Current role | Future owner | Action | Deletion condition |
|---|---|---|---|---|
| `src/pages/Quiz.tsx` local `QuizPhase`, question/answer arrays, timers, active/result branches | Legacy Practice gameplay host for category, pack, missed replay, and Builder sessions | Ranked shell | REPLACE / DELETE AFTER MIGRATION | All Practice callers launch canonical bot matches and no route renders its active/result branches |
| `QuizAnswerOptions`, `QuizAnswerFeedback`, Practice result assembly in `Quiz.tsx` | Legacy renderer/feedback/result UI | Ranked module renderers and canonical result | DELETE AFTER MIGRATION where no non-Practice harness uses them | Reference audit shows no remaining product caller |
| `quizApi.getQuestions`, `/api/quiz/questions` | Selects stored + runtime Practice questions and returns answer-safe rows | Content authorities / future recipe compiler adapters | KEEP AS AUTHORITY where useful; MIGRATE CALLER | Do not delete until all non-Ranked consumers are audited |
| `/api/quiz/attempts`, `/api/quiz/sessions`, completion | Legacy Practice recording and History/Trends inputs | Existing Ranked submissions/results/discoveries; generated Mastery attempt bridge where already canonical | MIGRATE CALLER; DEFER deletion decision | Product/analytics owners decide required projections after every Practice caller migrates; History remains untouched now |
| Practice Pack definitions (`seed_quiz_sets.py`, `quiz_sets`, `quiz_set_categories`) | First-party legacy category bundles | Study Hall first-party preset catalog | KEEP intent, MIGRATE definitions, then DELETE obsolete execution plumbing | Equivalent first-party recipes exist and old pack launches are gone |
| `LeaguecraftHub` Practice pack/category launch callbacks | Current selection UI | Study Hall | MIGRATE CALLER | Study Hall launches named Ranked presets/recipes |
| `PracticeBuilderPanel`, `usePracticeBuilder`, `builderApi`, `/api/quiz/builder/*` selection | Premium stored-bank configuration and launch | Quiz Forge | REPLACE UI/caller; reuse only validated ideas | Quiz Forge covers desired controls and saved configurations are migrated or deliberately retired |
| `quiz_saved_practice_sets.config_json` | Persisted Builder filter configuration, not question ids | Future Quiz Forge persistence | DEFER / MIGRATE DATA if usage justifies | A versioned user-recipe store and migration policy exist |
| Missed replay and weakness presets | Select legacy questions from attempt analytics | Study Hall recommendations / Record handoff later | MIGRATE CALLER; KEEP analytics authority for now | New selectors can address the canonical Ranked/content identities |
| Time Trial route, UI, `daily_score_attack` service/tables | Special 30-question/90-second/daily contract | Time Trial | DEFER | Separate later design preserves official contract |
| History/Review/Trends | Existing federated record surfaces | Record | KEEP / DO NOT TOUCH | Out of scope |
| `/quiz/playtest`, `PlaytestMatchHost`, playtest interstitial machinery | RB3/RB4 guided audit wrapper | None, or a future curated narrative only if deliberately retained | DELETE after the new proof supersedes the audit | No active RB playtest program depends on it |

## Configuration/storage status

- Built-in Ranked formats and the RB3/RB4 preset are code-defined Python factories in `ranked_formats/schema.py`.
- Admin-editable Ranked formats are persisted as validated `RankedFormat.to_dict()` JSON revisions in SQLite `ranked_format_configs`, separated into `public` and dormant `admin_bot` targets.
- The Playtest itself has no persisted recipe. Its complete compiled format is frozen per match in `ranked_matches.format_snapshot_json`.
- Historical static Mastery sets were removed. `mastery_slice` now stores generator configuration and synthesizes from canonical truth at segment open.
- Saved Practice Builder sets persist version-1 stored-bank filter configs in `quiz_saved_practice_sets`; they are useful as evidence that users save configurations, but their schema is too tied to stored rows (`pool`, category, `source_type`, difficulty) to become the canonical recipe unchanged.

Shortest safe path:

- First-party Study Hall recipes: code-defined preset factories initially.
- User Quiz Forge recipes: persist a later versioned, constrained input contract, not compiled `RankedFormat` JSON and not frozen question ids. Revalidate/compile on launch, then freeze the resulting format on the match.
- Do not use `ranked_format_configs` as the user-recipe store; it is a global admin lane, not per-user content.

## LH2.1 proof specification

Implement one first-party preset, provisionally `practice_champion_fundamentals`, through the existing RB3 seam.

1. Backend: add a server-owned factory returning a validated Practice `RankedFormat`; initially use current production Champion Mastery via `mastery_slice.v1` and `champion_config(<chosen champion>)`. If mixed shared-bank content cannot be champion-filtered safely, do not fake it—keep the proof Mastery-backed and rename the displayed preset narrowly if necessary.
2. Register the key in the existing preset resolver (or rename that tiny map to a neutral session-preset name); keep Playtest authorization separate from Study Hall access. Practice still passes the existing Bot Ranked authorization and is always unrated.
3. Extend the strict queue request only enough to name the first-party preset. Do not add a Practice endpoint.
4. Launch from one minimal temporary/test entry through `joinQueue(..., { matchWithBot: true, preset: key })`, then navigate to `/quiz/ranked` with the returned match id. Do not use `PlaytestMatchHost` unless the preset truly requires interstitials.
5. Render only `QuizRankedMatch` and the current Ranked shell. Use existing submit, bot driver, settlement, generated-attempt/discovery, result, and review paths unchanged.
6. Add tests that prove: preset resolves to expected frozen format; request requires bot; match is `is_bot_match`, `creation_source=bot_playtest`, and rating-skipped; the format survives reload; its module config invokes the production Mastery generator; ordinary Bot Ranked still resolves `public`; the frontend makes only `/api/ranked/queue` then canonical match calls; no legacy Practice active/result component is mounted.
7. Do not migrate packs, Builder, History, or Time Trial in this proof.

Important scope choice: an HP-scored Mastery preset can prove the seam now, but it does not guarantee exactly 10 modules because HP formats end by HP and cycle their pattern. Do not claim a fixed length until the scoring issue below is resolved.

## Quiz Forge compatibility

The same seam can support a future user recipe:

`{ champion: Ahri, opponent: Syndra, modules: [...] }`
→ server maps allow-listed choices to `mastery_slice` `champion_config` / `matchup_config`, eligible shared-bank pool/family specs, and/or Meta Reflex specs
→ validates readiness and compiles one `RankedFormat`
→ canonical `create_bot_match(format_override=...)`.

No second runtime is required. Current blockers are configuration, not rendering/lifecycle:

- `QueueJoinIn.preset` is a short named string and `PRESET_FORMATS` factories take no parameters; parameterized recipes need a separately validated request/reference, not raw format JSON.
- Shared-bank `quiz` configuration narrows by named pool/family, not arbitrary champion/opponent. Champion/matchup targeting should use Mastery adapters until a safe family-specific bank selector exists.
- Only points formats have exact `match_length`, and every segment in one must support additive scoring. `mastery_slice.v1` does not currently declare additive scoring, so a fixed 20-module recipe mixing Mastery cannot be represented honestly today.
- `RankedFormat.segment_pattern` cycles; HP formats may end before or after one pass. Recipe UI must not promise an exact question/module length on that model.
- A `mastery_slice` is one Ranked module containing multiple challenges. Product wording must distinguish module count from question count.
- Current preset identity is inferred from one format id in projections; durable user recipe/source identity may eventually need an explicit frozen metadata field, but LH2.1 has no consumer requiring it.

## Risks / unresolved questions

The largest architectural risk is **session length versus Ranked scoring**. Practice wants a defined number of modules/questions. Current Ranked supports exact length only for additive points formats, while the production `mastery_slice.v1` used for champion and matchup content is outcome/HP-scored. The RB4A Playtest works around this with survivable HP damage and a cycling pattern; that is acceptable audit scaffolding, not a clean product contract. The next design decision must be the smallest canonical fix: likely a versioned points-capable Mastery module or a Ranked-level fixed-length settlement rule. Do not solve it with a Practice-only counter or by terminating/mutating matches outside Ranked.

Secondary real questions:

- Which champion should the first first-party proof use, and should its product name be narrower than “Champion Fundamentals” if the clean proof is Mastery-only?
- Should ordinary Study Hall presets require Premium Bot Ranked entitlement, or does curated Free Practice need a distinct authorization rule while still using the same bot executor? This is policy at the existing gate, not a new runtime.
- When a real telemetry/history consumer exists, what minimal frozen recipe identity beyond `format_id` is required? History redesign remains out of scope.

## Relevant files

Frontend:

- `src/App.tsx`
- `src/pages/Quiz.tsx`
- `src/pages/quiz-ranked/QuizRankedPage.tsx`
- `src/pages/quiz-ranked/QuizRankedMatch.tsx`
- `src/pages/quiz-ranked/useRankedQueue.ts`
- `src/pages/quiz-ranked/useRankedMatch.ts`
- `src/pages/quiz-ranked/QuizPlaytestPage.tsx`
- `src/lib/ranked-public/client.ts`
- `src/lib/ranked-public/contracts.ts`
- `src/components/playtest/PlaytestMatchHost.tsx`
- `src/lib/playtest/preset.ts`
- `src/lib/playtest/usePlaytestSession.ts`
- `src/components/quiz/LeaguecraftHub.tsx`
- `src/lib/quiz/api.ts`
- `src/lib/quiz/practiceCategories.ts`
- `src/components/quiz/builder/*`
- `src/lib/quiz/builderApi.ts`

Backend:

- `routes/ranked_public.py`
- `schemas/ranked_public_schemas.py`
- `ranked_public/service.py`
- `ranked_public/format_config.py`
- `ranked_public/segment_flow.py`
- `ranked_public/projections.py`
- `ranked_public/persistence.py`
- `ranked_public/discovery.py`
- `ranked_public/shared_bank.py`
- `ranked_formats/schema.py`
- `ranked_formats/retired_mastery_sets.py`
- `ranked_modules/contract.py`
- `ranked_modules/registry.py`
- `ranked_modules/quiz.py`
- `ranked_modules/meta_reflex.py`
- `ranked_modules/mastery_slice.py`
- `ranked_modules/mastery_config.py`
- `ranked_modules/item_cost_duel.py`
- `routes/quiz.py`
- `routes/practice_builder.py`
- `services/practice_builder.py`
- `services/saved_practice_sets.py`
- `quiz/runtime_casual.py`
- `quiz/family_contract.py`
- `quiz/mode_gate.py`
- `routes/quiz_matchup.py`
- `mastery/synthesis/*`
- migrations for Ranked public/segments/format configs and Practice sessions/Builder storage
- `test_ranked_playtest_preset.py`
- `test_rb4a_exhaustive_playtest.py`
- `test_ranked_format_config_consumption.py`
- `test_ranked_mastery_on_demand.py`

Relevant history inspected:

- Backend `fe936fe7` — RB3 preset over canonical Ranked.
- Backend `97e40ef9` — RB4A exhaustive content audit.
- Backend `1f97b780` / merge `fbd23157` — format/segment/module foundation.
- Backend `5dc96d7b` — Ranked Mastery module proof.
- Backend `c17c55de` — static Mastery sets replaced by generators.
- Backend `8e37b00e` / `5017ba02` — fixed-length Ranked v2 points format.
- Frontend `20abb195` — guided Playtest around the unchanged arena.

## Commands/tests used

- Read `LH1_HANDOFF.md` first.
- Used `rg`, `Get-Content`, `git log --all`, `git show`, and `git status --short` across both repositories to trace live code and the RB/MS history.
- Attempted targeted backend tests: `python -m pytest ...` and `py -m pytest ...`; neither Python launcher exists in this environment, so no tests ran and no dependencies were installed.
- No Docker and no network access were used.

## Current state

- LH2.0 audit and LH2.1 execution proof are complete.
- `practice.item_fundamentals` is a real first-party server preset running as
  a fixed six-module, points-native, unrated canonical Bot Ranked match.
- Both worktrees contained pre-existing unrelated changes/untracked files; they were not modified.
- The exact Practice composition seam already exists and is proven by RB3.
- RB4A's production-source coverage is useful evidence, but its sequence is temporary scaffolding.
- `RankedFormat` is the compiled configured-session abstraction. A new type is unnecessary for the first proof.
- Exact-length points-native stored-bank Practice is now proven. Exact-length
  heterogeneous Practice containing current runtime-generated Mastery remains
  a later scoring/module-version question.

## Next task

LH2.2: make the CURRENT `quiz.runtime_casual` generator authority consumable by
Ranked composition without reviving or re-materializing retired casual banks.
Do not begin Study Hall/Quiz Forge UI, History redesign, or legacy Practice
deletion as part of that adapter task.

## LH2.2 — Learning telemetry convergence

LH2.2 is complete. The canonical learning read seam is
`services.learning_attempts.learning_attempts_for_user(cur, user_id)`. It is a
read-only application projection over the two answer-level authorities:
`quiz_attempts` and `ranked_submissions` joined to frozen `ranked_rounds` and
`ranked_matches`. No table, migration, public API, gameplay path, History path,
or duplicate Ranked-to-quiz write was added.

### Persistence source matrix

| Source | Authoritative answer record | Identity and metadata | LH2.2 coverage |
|---|---|---|---|
| Ordinary quiz/study and legacy Practice | `quiz_attempts` (optional `quiz_sessions`) | `question_key` is canonical; nullable numeric `question_id`; frozen category, difficulty, correctness, timestamp; session mode/id when present | Fully covered |
| Ordinary single-question Ranked | immutable `ranked_submissions` + frozen `ranked_rounds`/`ranked_matches` | `(match_id, round_number, user_id)` event; `canonical_question_ref`; frozen category/module/config; submitted timestamp | Fully covered when the round has a canonical ref |
| `practice.item_fundamentals` | same Ranked records | `quiz:<question_key>` plus frozen `format_id=practice_item_fundamentals`, mapped to `session_preset=practice.item_fundamentals` | Fully covered |
| Runtime/generated quiz questions | `quiz_attempts` | nullable `question_id`, durable `question_key`, snapshots/provenance | Fully covered; no current-bank join required |
| Champion Mastery in current Ranked path | `ranked_segment_challenges` is execution authority; its existing best-effort generated-attempt bridge writes `quiz_attempts` | generated Mastery `question_key`, category and frozen snapshots | Partially covered through the existing attempt bridge; raw multi-challenge execution is not independently projected, avoiding duplicate facts |
| Official Time Trial | `dsa_runs`/answer persistence; official resolved answers are transactionally mirrored to `quiz_attempts` today | fallback `question_key`, frozen question/category/difficulty, `source=daily_score_attack` | Fully covered at answer level through the existing mirror |
| Time Trial practice | Time Trial runtime, with no answer-level learning event | none available to read | Not yet covered; defer instrumentation to its focused migration |
| `ranked_question_discoveries` | lifetime per-user rollup, not execution authority | canonical ref plus counts/first/last provenance | Deliberately excluded from the attempt UNION; reading it would double-count Ranked executions |

The normalized identity is always `canonical_question_ref`. A quiz attempt with
`question_key=k` projects as `quiz:k`; a Ranked `quiz:k` ref safely parses back
to the same `question_key`. Non-`quiz:` Ranked refs remain intact with a null
question key. Family is the current question-key prefix when available, with
the frozen Ranked category as the conservative fallback. Subject is the
attempt/round's frozen category. This preserves retired and runtime identities
without joining to the current question bank.

### Current consumers and disposition

| Consumer | Current read | Disposition |
|---|---|---|
| `services.personal_analytics` (trends, recent performance, weakness categories) | `quiz_attempts`, assumes category/timestamp/correctness and optional quiz session mode | KEEP + migrate later to the unified seam/aggregate |
| Practice Builder “Questions I have missed” | `quiz_attempts.question_id` | DELETE WITH LEGACY BUILDER; intentionally not modernized |
| Practice Builder “My weakest categories” | `quiz_attempts` category aggregates | REPLACE WITH STUDY HALL; intentionally not modernized |
| Practice Builder “Owned” | `ranked_question_discoveries`, and only resolvable `quiz:` refs | DELETE/MIGRATE with legacy Builder; it is a collection query, not attempt analytics |
| Quiz History | `quiz_sessions` plus session-scoped `quiz_attempts` | HISTORY — LEAVE ALONE |
| Ranked History/review/results | Ranked match, round, result and submission projections | HISTORY — LEAVE ALONE |
| Ranked question library | `ranked_question_discoveries` | KEEP as collection ownership; not a learning-attempt source |
| Admin/global quiz performance exports | `quiz_attempts` | Out of Study Hall scope; leave unchanged |

### Exact implementation and proof

- Added `services/learning_attempts.py` with immutable `LearningAttempt`, safe
  identity helpers, `learning_attempts_for_user`, and the small
  `aggregate_by_family` proof primitive.
- Added `test_lh22_learning_attempts.py`. It covers quiz and Ranked
  normalization, correct/incorrect values, Practice preset identity, ordinary
  Ranked, two executions of one logical question remaining two events,
  exclusion of discovery-rollup duplicates, retired rows, runtime keys, safe
  canonical-ref parsing, and the two-attempt `item_cost` 50% aggregate.
- Existing write paths are untouched. Ranked quiz submissions still write only
  Ranked execution/discovery records; ordinary quiz attempts still use the
  existing recorder; official Time Trial keeps its existing transactional
  mirror. No schema change exists.
- `practice.item_fundamentals` and ordinary Ranked can now feed future Study
  Hall calculations through the same read call.

Verification on 2026-09-20: both new files passed `py_compile`, and a stdlib
SQLite execution proof produced two same-identity cross-source attempts and a
50% `item_cost` aggregate. The available bundled Python has no `pytest` module
and the machine has no `py`/`python` launcher, so the pytest files (including
the LH2.1 regression) could not be executed in this environment; no dependency
was installed.

Known caveats: Ranked rows with no canonical ref are omitted because inventing
an identity would be unsafe. Generated multi-challenge Mastery depends on its
pre-existing best-effort `quiz_attempts` bridge and is therefore partial rather
than claiming raw-execution completeness. Time Trial practice has no event to
project. Cross-mode concept ontology remains intentionally deferred.

### Next task

LH2.3 — make the CURRENT `quiz.runtime_casual` generator authority consumable
by Ranked composition without reviving retired stored casual-question families.
Do not start LH2.3 as part of LH2.2.

## LH2.3 — Runtime casual → Ranked

LH2.3 is implemented. The chosen seam is a small question-provider adapter,
`ranked_public.runtime_casual.RuntimeCasualQuestionProvider`, injected into the
already-registered `quiz.v1` / `quiz.v2` module when a frozen `SegmentSpec`
declares `module_config.runtime_family`. There is no new module id, renderer,
endpoint, question runtime, numeric id space, or gameplay path.

The adapter calls the current `quiz.runtime_casual` authority directly:
`available_keys(..., mode="practice")` supplies eligible current keys and
`compose(conn, question_key)` supplies the prompt, options, correct answer,
category, explanation, difficulty and provenance. It converts that result to
the existing immutable `ranked_duel_gameplay.QuestionRecord`. The serving id
is the nonnumeric `<question_key>#r<round_number>` and the durable semantic
identity is `canonical_question_ref="quiz:<question_key>"` through the existing
`ranked_public.discovery.canonical_ref_for_question_key` helper.

Generation occurs only when Ranked opens a new segment. `_open_segment` writes
the complete prompt, option order, correct index, category, canonical ref and
explanation/provenance into `ranked_rounds`. All reads, reconnects, grading,
bot answers, reveal, review and replay consume that frozen row; they do not
call the runtime generator again. No `quiz_questions` row is looked up or
created. Runtime-source readiness is checked before match creation using the
same adapter and current canonical database.

### First runtime Practice preset

Preset key: `practice.champion_fundamentals`.

Frozen format: `practice_champion_fundamentals` v1; active, bot-eligible,
rating-ineligible, points model, exactly four `quiz.v2` single-question
segments. Every segment uses normal additive Ranked points and the frozen +1
speed bonus:

1. `champion_resource` — easy timer, 2 correct points
2. `champion_highest_base_stat` — medium timer, 2 correct points
3. `champion_stat_compare` — medium timer, 2 correct points
4. `champion_stat_level` — hard timer, 3 correct points

Launch remains exactly `POST /api/ranked/queue` with
`{"match_with_bot": true, "preset": "practice.champion_fundamentals"}`.
It resolves through `preset_format()` and `create_bot_match(...,
format_override=...)`, freezes the format snapshot, creates an unrated bot
match, and renders through the ordinary `/quiz/ranked` `QuizRankedMatch` host.
The legacy Practice gameplay, attempt endpoint and result renderer are not
entered.

Attack type is deliberately absent from the proof. The current runtime
authority has no centralized form/state ambiguity exclusion for Kayle, Gnar,
Jayce, Nidalee, Elise, and any equivalent transform/state-dependent champion.
No narrow guard was required because the preset does not use the family; the
future content-quality pass should add one at the generator authority before
that family is promoted into a first-party preset.

### Runtime-family compatibility inventory

| Runtime family | LH2.3 classification | Finding |
|---|---|---|
| `champion_resource` | READY FOR RANKED VIA NEW ADAPTER / USED IN PROOF | Current `champion_facts` authority; text-answerable and row-less |
| `champion_highest_base_stat` | READY FOR RANKED VIA NEW ADAPTER / USED IN PROOF | Current `champion_stat_authority`; stable stat-subject key |
| `champion_stat_compare` | READY FOR RANKED VIA NEW ADAPTER / USED IN PROOF | Current stat authority; deterministic pair key/options |
| `champion_stat_level` | READY FOR RANKED VIA NEW ADAPTER / USED IN PROOF | Current stat authority and growth curve; deterministic level key |
| `rune_tree` | NOT USED IN PROOF BUT SHOULD WORK | Text-answerable current rune authority |
| `rune_type` | NOT USED IN PROOF BUT SHOULD WORK | Text-answerable current rune authority |
| `rune_keystone` | NOT USED IN PROOF BUT SHOULD WORK | Text-answerable current rune authority |
| `item_single_stat` | NOT USED IN PROOF BUT SHOULD WORK | Text-answerable current item-stat authority |
| `champion_attack_type` | AMBIGUITY GUARD REQUIRED | Adapter-compatible mechanically; do not promote until transform/state ambiguity is centrally pruned |
| `ability_recognition` | NEEDS SPECIAL HANDLING | The image is required; Ranked needs a typed-presentation bridge for runtime `image_path` |
| `item_recognition` | NEEDS SPECIAL HANDLING | Same required-media constraint |
| `rune_recognition` | NEEDS SPECIAL HANDLING | Same required-media constraint |
| `summoner_spell_recognition` | NEEDS SPECIAL HANDLING | Same required-media constraint |
| Environment/runtime content outside `quiz.runtime_casual` | OUT OF SCOPE / DIFFERENT GENERATOR | Do not route through this adapter without a separate focused authority audit |

The adapter's allow-list intentionally excludes the four recognition families
until their required media can be translated to Ranked's existing typed
`presentation` contract. This is a fail-closed rendering constraint, not a
second content authority.

### Settlement and learning projection

The preset uses unchanged `quiz.v2` validation, backend correctness, bot
choice, answer lock, additive points and speed-bonus settlement. Answers write
immutable `ranked_submissions` plus the existing discovery rollup. There is no
Ranked-to-`quiz_attempts` mirror. `learning_attempts_for_user()` reads the
Ranked submission and frozen round, parses the `quiz:` ref back to the exact
runtime `question_key`, derives the family from its prefix, and maps the frozen
format id to `session_preset="practice.champion_fundamentals"`.

### Exact files/types/functions

Backend additions/changes:

- `ranked_public/runtime_casual.py` — provider adapter and fail-closed family compatibility set.
- `ranked_formats/schema.py` — validated `runtime_family` selector and `practice_champion_fundamentals_format()`.
- `ranked_modules/quiz.py::QuizModule.generate_segment()` — selects the injected runtime provider without changing scoring/rendering.
- `ranked_public/service.py::_generate_segment()` and preset registry — inject provider and register preset.
- `ranked_public/readiness.py` — live runtime-family servability before row creation.
- `ranked_public/projections.py` and `services/learning_attempts.py` — existing format-id-to-preset mapping extended for the new identity.
- `ranked_formats/__init__.py` — exports the new format.
- `test_lh23_runtime_casual_ranked.py` — focused adapter, format, queue, freeze, settlement, row-less identity and learning-projection proof.

Frontend production code is unchanged. The LH2.1 boundary still pins
`/quiz/ranked` to `QuizRankedMatch` and excludes legacy Practice execution.

### Verification and limitations

On 2026-09-20, bundled Python successfully compiled every touched production
module and the new focused test module. A direct format probe validated the
four-slot snapshot round trip and preset resolution. `git diff --check`
passed. The bundled Python runtime does not contain `pytest`, and no other
Python/pytest installation is present, so the focused pytest campaign could
not execute in this environment; no dependency was installed. The test file
covers correct and incorrect settlement, points results, immutable Ranked
submissions, zero `quiz_attempts` growth, absence of materialized question
rows, freeze/reconnect behavior, learning projection/family/preset identity,
and the unchanged Item Fundamentals/Playtest/ordinary resolver paths.

Recognition visuals remain the one known adapter limitation. Broader content
quality, including attack-type ambiguity pruning, remains explicitly deferred.

### Legacy migration implications

The old Champion Basics pack no longer needs stored-row counts for the four
proof concepts. Future Study Hall presets can select current runtime champion,
rune and item facts through the same compiled Ranked seam, and Quiz Forge can
eventually expose allow-listed current generators rather than retired banks.
No old Practice Pack/Builder caller was migrated or deleted in LH2.3.

### Next task

LH2.4 — resolve clean Mastery Practice composition/scoring/session-length
semantics so Champion Mastery can become a first-class Practice preset without
RB4A HP-cycling scaffolding. Do not start LH2.4 as part of LH2.3.

## LH2.4 — HP/outcome scoring eradication

LH2.4 is implemented. Mogzy has one current scoring architecture for
Ranked-style knowledge activities: points. Old HP/damage/outcome scoring is
removed, not deprecated. Current dependencies must migrate rather than
preserve it.

### Dependency map and decisions

| Dependency | Why it existed | Disposition |
|---|---|---|
| `RankedFormat.scoring_model = hp|points` and `SegmentSpec.scoring = outcome|additive` | RP1 introduced points beside the original knockout contract | Current schema is points-only; schema v2 rejects `hp`, `outcome`, and removed damage fields |
| `SegmentSpec.full_damage/reduced_damage` | Tuned zero-sum answer damage and Playtest survivability | Deleted from the format contract, serialization, builder catalog, and all current format definitions |
| `SegmentResolution.damage` / `supports_additive_scoring` | Transported module awards through the combat damage channel | Replaced with required `points` / `supports_points_scoring` contracts |
| Quiz v1 outcome settlement | Original ordinary Ranked question contract | Registered version now provides points; every current format uses `quiz.v2` with frozen tier points and speed bonus |
| `mastery_slice.v1` winner/loser outcome scoring | Champion, Matchup, and applied-chain generators were wired to the old zero-sum path | Generator survives unchanged; resolution awards one point per correct challenge plus the existing +1 perfect-and-faster bonus |
| Meta Reflex additive “damage” | Its card score was originally expressed as simultaneous damage | Same additive card/perfect/speed arithmetic is now an explicit point award |
| RB4A Playtest damage headroom/cycling | Kept a 51-segment audit alive under knockout termination | Deleted as a runtime requirement; Playtest is an exact 51-segment points match and settles once |
| Match engine hp/points branch | Supported both knockout and fixed-length results | Current match config accepts only points and terminates only at `match_length`; module points are banked directly |
| Frontend HP fallback | Allowed missing/pre-RP1 scoring blocks to render as HP matches | Removed; scoring blocks are required and only `model: "points"` parses |
| Admin Ranked Builder damage fields | Exposed old per-question damage tuning | Replaced by `correct_points` and `speed_bonus_points`; Quiz builder target is v2 |

The low-level duel calculation types still contain inert HP/damage quantities
because class-combat/prototype code outside Ranked also uses that engine. The
current Ranked integration neutralizes those quantities and never treats them
as score, termination, or public scoring authority. Historical migration files
remain migration history only; no compatibility loader was added for old HP
snapshots.

### Final module architecture

- Champion Mastery: current synthesis → `mastery_slice.v1` interaction →
  per-correct points + existing perfect/strict-speed bonus → fixed-length
  Ranked result.
- Matchup Mastery: current matchup generator → the same points-native Mastery
  interaction and settlement.
- Applied/certified calculation: current applied-chain generator → the same
  points-native Mastery interaction. Damage remains question content only.
- Meta Reflex: existing per-card correctness, perfect, and speed rules are
  retained as additive points.

Current ordinary Ranked, Bot Ranked, `practice.item_fundamentals`, and
`practice.champion_fundamentals` all freeze points formats. The current
Playtest preset freezes 51 modules and no longer relies on a second pattern
cycle or health headroom. Preset identity and canonical Bot Ranked execution
are unchanged.

### Daily Challenge and Time Trial

Daily Challenge has no HP/outcome scoring dependency. Its only Ranked import
is shared presentation/type vocabulary; its completion model was already
non-HP, so no redesign was made. Time Trial has no dependency on Ranked HP or
outcome settlement and retains its 30-question/90-second/official-attempt
contract unchanged.

### Persistence and frontend

No database column migration was required for the scoring contract: format
and match composition are frozen JSON. Current format schema version 2 no
longer serializes obsolete scoring/damage properties and intentionally refuses
old HP snapshots; fake/dev history compatibility is not preserved. Match
results, `ranked_submissions`, discoveries, and
`learning_attempts_for_user()` remain the authorities they were before.

The frontend contract now accepts only points scoring and requires the live
and result scoring blocks. The legacy missing-block → HP fallback is gone, so
the current Ranked UI cannot select HP rails or HP result vocabulary.

### Anti-regression guard

`test_lh24_points_only_scoring.py` proves that all current production,
Practice, and Playtest formats are fixed-length points formats; every
registered module advertises a points contract; `scoring="outcome"`,
`full_damage`, and `reduced_damage` are unknown segment fields; and
`scoring_model="hp"` is rejected.

### Legitimate retained HP/damage content

Champion/base-stat HP, health growth, armor/resistance, mitigation, lethal
thresholds, combat simulation, damage-chain questions, Meta Reflex HP-stat
cards, and Daily/Time Trial question content remain. Low-level combat engine
quantities used by Combat Lab and the separate staff prototype also remain;
they are gameplay simulation state, not Mogzy quiz scoring.

### Verification

- Python compilation passed for every touched backend production module.
- Direct points-only guard probe passed: all current formats resolve to
  `points`, exact lengths match their patterns, every registered module is
  points-capable, and banned schema values are rejected.
- Direct format/preset probe passed for Ranked v2 (10), Item Fundamentals (6),
  Champion Fundamentals (4), modern Ranked (12), and Playtest (51).
- Frontend `tsc --noEmit` passed using the existing local toolchain.
- `git diff --check` passed after cleanup.
- Backend pytest could not run because the bundled Python environment has no
  `pytest` module. Frontend Vitest could not start because esbuild was denied
  access while resolving the workspace config; no dependency/network changes
  were attempted.

Backend commit: `0c33ef42` — `LH2.4 eradicate HP outcome scoring`.

Frontend/handoff commit is recorded in the repository history for this section.

### Next task

LH2.5 — migrate useful old Practice Pack concepts into modern first-party
Ranked presets using current stored/runtime/generator authorities, then begin
retiring their old execution infrastructure. Do not begin LH2.5 here.
