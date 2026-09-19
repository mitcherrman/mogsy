# GR1 — Reusable state architecture audit

**AUDIT ONLY. Nothing was implemented, no runtime code changed, no generator, composer, tie
policy, Applied-chain, Combat Lab, schema or UI was touched.** The purpose is to measure how
close the current architecture is to a model where **questions consume a reusable,
data-driven game state** instead of owning or hard-coding it, and where two composition
modes (FULL and SLICE) read one question universe.

Nothing below is a recommendation. Section 13 lists owner decisions as questions.

| | SHA | Note |
|---|---|---|
| Backend audited | `origin/master` **`fc2e8be9`** | The brief named `2387e8f5`. `origin/master` moved **fast-forward** past it (items/runtime work and the QCA quiz-architecture series). `git diff 2387e8f5 fc2e8be9 -- mastery/` is one file (`mastery/chains/summoner_spell_mastery.py`, +24). **One upstream commit in that range changes what Mastery serves — see §0.** |
| Frontend audited | `origin/main` **`4c29f7ba`** | The brief named `791027de`, an ancestor. The range is ranked-arena and question-surface art; no Mastery contract file changed. |
| Method | Clean detached worktrees at both heads. Read-only probes against the local `lol_calc.db` (`mode=ro`), with `LOL_CALC_DB_PATH` set so the identity registry resolves the full roster rather than falling back to the curated six. | The local DB lags production (live patch 26.16 locally). Counts are local; structure is code. |

`V` = verified by reading code or running a read-only probe. `I` = inferred.

---

## 0. Read this first — Mastery lost half its Champion corpus after the GR1 passes

This is outside this audit's brief, but it changes the baseline that every later section
measures, so it goes first. **Nothing was changed to address it.**

**Commit `b7ccf8e0`** — `feat(qca8): six simple families move to runtime composition`,
2026-09-14, on `origin/master` (which auto-deploys), **not** in `2387e8f5` — narrowed two
family contracts in `quiz/family_contract.py`:

| Family | Before | After |
|---|---|---|
| `champion_stat_level` | `modes=(PRACTICE, DAILY, RANKED, MASTERY)` | `modes=(PRACTICE,)` |
| `champion_stat_compare` | `modes=(PRACTICE, DAILY, RANKED, MASTERY)` | `modes=(PRACTICE,)` |

The commit's rationale is *"All six narrow to PRACTICE, the only surface with a runtime
consumer"*. The Mastery publication gate **is** a consumer of `modes`:
`mastery/publication_gate/policy.py` rejects any candidate whose family does not declare
`MASTERY` with `family_mode_ineligible`. The commit message does not mention Mastery.

**Measured, same local DB, same probe, only the commit differs** (`b7ccf8e0~1` = `23d0f688`
vs `fc2e8be9`):

| | Before qca8 | Now |
|---|---|---|
| Champion Mastery servable candidates, all 173 | **6,695** (cooldown 2,185 · cost 1,028 · level-stat 3,482) | **3,213** (cooldown 2,185 · cost 1,028 · level-stat **0**) |
| Matchup comparisons, 150-pair random sample | **3,279** (cooldown 1,970 · base stat 1,309) | **1,970** (cooldown 1,970 · base stat **0**) |
| Pairs with zero servable comparisons | 0 | **880 of 14,878** — exactly the structural audit's "880 base-stat-only" pairs |

Consequences observed, not remedied:

* **Champion Mastery no longer asks anything at a champion level.** Its only remaining
  context axis is ability rank. The readiness pass's level-stat wording fix now reaches no
  generated question.
* **Matchup Mastery is now cooldown comparisons plus atomic fallback.** For the 880 pairs
  involving `aphelios`, `elise`, `jayce`, `nidalee` or `udyr`, the "matchup" pool contains
  **no comparison at all**. Probe: `aphelios × ahri` → 15 candidates, **all 15 are Ahri
  atomic recall**.
* The structural audit's figures (40.2% base stat, 65% base-stat 8-question slices, the tie
  analysis of `base_magic_resist`/`movement_speed`) describe the generator **before**
  `b7ccf8e0`. The tie cap and deprioritization are now operating over a cooldown-only
  comparison pool.
* Reach: no public format names `mastery_slice`, so exposure is admin-bot matches and the
  Admin Generator Lab.

Whether Mastery should follow `family_contract` modes (and therefore this change) or should
have been excluded from it is an owner/QCA decision, listed in §13. This audit counts the
generator as it is on `origin/master` and says where each number predates `b7ccf8e0`.

---

## 1. Inventory — every structure that represents part of game state

Legend — **Kind**: I = input state, D = derived state, P = presentation, S = persistence/provenance.
**Reuse**: can another feature consume it without importing the owning feature's assumptions?

### 1.1 Backend — generated Mastery lineage (Champion, Matchup)

| Structure | File | Fields it owns | Kind | Reusable? | Generator-specific assumptions | Canonical / duplicated |
|---|---|---|---|---|---|---|
| `FactContext` | `mastery/facts/contract.py:187-213` | `ability_rank`, `champion_level`, `form` | I (per fact) | Mastery-wide | **By design excludes scenario axes**: docstring — *"never a matchup, never a question mode, never a scenario constant such as an ability-haste value"* | Canonical for facts |
| `ChampionFact` | `mastery/facts/contract.py:301-371` | champion_id, subject, subject_ref, metric, context, value, unit, precision, certification, source_agreement, provenance, comparison key | D (a single resolved value) | Mastery-wide | A fact is intrinsic, i.e. item-free, rune-free, patch-implicit | Canonical |
| `ChampionFactSet` (projection) | `mastery/facts/projection.py:180-258, 321-363` | cached `champion_stats` row, ability rows, cooldown authority | D (resolves stat-at-level on demand, `_scaled_stat:208`) | Mastery only | Base + growth only; no bonus-stat input | Canonical Mastery projection; curve from `champion_stat_profile` |
| `ChampionQuestionCandidate` | `mastery/knowledge/contract.py:288-349` | category, metric, subject_ref, **context**, interaction kind, template, prompt semantics, explanation, family hint, difficulty_class | D + P | Mastery only | Per-fact question; the context is the question's own | Canonical |
| `BANK_LEVELS = (6, 11, 18)` | `mastery/knowledge/bank.py:49` | the only levels ever asked | policy constant | — | **Level axis is a constant**, not an input | Reused by Matchup as `COMPARISON_LEVELS` (`composer.py:50`) |
| `STANDARD_RANKS` + eligibility ranks | `quiz/ability_question_eligibility.py:89` | Q/W/E 5, R 3 | policy constant | shared with quiz | Rank never checked against level | Shared |
| `MatchupBank` / `ComparisonOutcome` | `mastery/matchup/composer.py:113, 409-530` | two ids, display names, `patch_key_digest` (left side only, `:337,520`); per comparison winner/tie, `rank_independent` | D | Mastery only | **One shared context per comparison** | Canonical |
| `SelectionRequest` | `mastery/manifest/contract.py:104-135` | category, count, difficulty_class, interaction, metric, subject_ref, domain, is_comparison, **`ability_rank`, `champion_level`**, block | composition filter | Mastery only | The two context filters exist but **synthesis never sets them** (`recipe.py:214-218`); only hand-authored manifests did | Canonical |
| `RepetitionPolicy` | `mastery/manifest/contract.py:178-247` | adjacency, run length, distinct-question, context diversity, discriminating context, tie cap | composition policy | Mastery only | Budget-oriented (see §10) | Canonical |
| `MasteryManifest` / `ResolvedMasterySnapshot` / `SequencedStep` | `mastery/manifest/contract.py:296, 404, 372` | source, requests, sequencing, repetition, identity material; resolved ordered steps | composition result | Mastery only | Needs a fixed `question_count` | Canonical |
| `KnowledgeMasteryStep` / `KnowledgeMasteryArtifact` | `mastery/questions/knowledge_artifact.py:84-99, 54, 234` | step fields incl. `fact_refs`, `content_digest`, `patch_key_digest`; artifact `state_model` | S | Mastery only | **`state_model` defaults to `STATELESS`**; `before_snapshot_id = None` (`:143-147`) | Canonical |
| `normalized_config` | `ranked_modules/mastery_config.py:95-100, 294-315` | `{mastery_mode, champion_id}` / `{…, champion_a_id, champion_b_id}` / `{…, attacker_champion_id, ability_key, target_champion_id}` | I (generator config) | Ranked only | **Unknown keys are refused** (`:231-236`); no level/item/rune/patch key can be expressed | Canonical |
| `mastery_artifact` block | `mastery/serving/artifact.py:141-178` | schema version, generator type/version/config, subject_key, count, instance id, source {set id, digest, display revision, patch_key_digest, patch_display, title, is_prototype}, served {match, segment}, salt | S | Ranked + Lab + attempts | None | Canonical (Phase 4) |
| Public/private challenge rows | `ranked_modules/mastery_slice.py:243-273, 423-442, 1018-1026` | prompt, options, `prompt_semantics.context` / `comparison_semantics.context`, presentation, patch_display, input_constraints, roles; private answer, explanation, `canonical_ref`, `champion_subjects` | P + S | Ranked + Lab + review | Context rides inside semantics | Canonical frozen form |
| `StatedContext` | `quiz/public_presentation.py:596-647` | `champion_level` (1–18), `ability_rank` (1–5) — **closed, two fields, pinned by a contract test** | P | All presentation | No item/rune/build channel | Canonical presentation |

### 1.2 Backend — canonical-state lineage (hand-authored chains, Applied-chain)

This lineage is **not retired** (§4). It is the only place in the repository with a full state object.

| Structure | File | Fields | Kind | Reusable? | Assumptions | Canonical / duplicated |
|---|---|---|---|---|---|---|
| `ChampionCanonicalState` | `mastery/state/canonical_state.py:104-131` | `champion_id`, `level`, `ability_ranks`, `inventory` (item-name tuple), `runes`, `current_health`, `resource_type`, `current_resource`, `shields`, `buffs`, `debuffs`, `active_effects`, `stacks`, `marks`, `charges`, `cooldowns`, `custom_state`, **`derived`** | I (+ D evidence) | Structurally general; used only by chains | AD/AP/armor/MR/haste are **not** state fields — they live in `derived`, documented *"NEVER used as authoritative validation evidence"*; gold lives in `custom_state` | Canonical for chains |
| `CanonicalMasteryState` | `mastery/state/canonical_state.py:225-339` | `champion_a`, **`champion_b` (nullable — one or two champions)**, `validation_context`, `contract_version`, `calculation_engine_version`, `provenance`, lineage; `snapshot_id` = content hash excluding lineage/provenance | I | Structurally general | *"The SOLE canonical patch reference is `validation_context.patch_key_digest`"* | Canonical |
| `ValidationContext` / `InventoryPolicy` | `mastery/state/validation_context.py:28-97` | `patch_key_digest`, stat-calc/resource-model versions, champion profile versions, **ability rank limits**, **certified bounds**, **inventory policy** (slot limit, unique groups, consumables), source revisions | I (rules for a valid state) | Structurally general | Certified slice only | Canonical |
| `MasteryStateTransition` + `apply_transition` | `mastery/transitions/transitions.py:35-64, 158-206, 654` | 24 transition types incl. `HEALTH_CHANGE`, `BUFF_APPLICATION`, `LEVEL_CHANGE`, `ABILITY_RANK_CHANGE`, `GOLD_SET`, `GOLD_SPEND`, `ITEM_ACQUIRE` (`ITEM_SALE` refused) | I → I | Structurally general | Pure, fail-closed, evidence-bearing | Canonical |
| `TimelineCheckpoint` | `mastery/chains/timeline.py:70-125` | `champion_level`, ranks, gold, items (stats read from the item record) | I (progression) | Chains | — | Canonical |
| `BuildCandidate` / `ItemRef` / `CandidateClassification` | `mastery/data/build_candidates.py:30-100` | candidate_id, label, **classification ∈ {curated, generated, professional, common_build}**, source, confidence (never "high"), level, ranks, items (Riot id + name + cost + stats), runes (names only, excluded from calc), supported calcs, unsupported assumptions, patch descriptor | I (a build template with a declared SOURCE) | Ahri only today | Hand-authored; `is_proven_meta: False` | **The only build-source concept in the repo** |
| `StandardTargetProfile` | `mastery/data/target_profiles.py:39-122` | benchmark target level/HP/armor | I | Applied-chain | Hand-picked | Duplicate of canonical champion values |
| `SCENARIO_LEVEL = 11` | `mastery/synthesis/applied_chain.py:85` | the Applied-chain level | policy constant | — | Rank = highest legal at that level (`:120-136`) | — |
| `CompositePatchDescriptor` / `SLICE_PATCH_DESCRIPTOR` | `mastery/provenance/patch_descriptor.py:67-129`; `mastery/data/slice_patch.py:28-39` | ddragon version, stats/formula/item/cost revisions, `rune_revision=None`, engine versions, `provenance_status=mixed_snapshot` | S | Chains + Applied-chain | **Hand-pinned literal**; certified-adapter registration key | Canonical for certified slice |
| Certified champion modules | `mastery/data/{ahri,syndra,lux,jarvan,maokai,olaf}.py`, `champion_scaling.scaled_stat` | per-champion base stats, ability arrays, ratios, each with a `SourceBinding` | D (frozen copies) | Certified slice only | 6 champions | **Duplicate** of `champion_stats`/`champion_abilities`, provenance-checked since Phase 2 |
| `RuneProvenanceRecord` | `mastery/runes/rune_provenance.py` | every rune `UNVERSIONED` / `UNCERTIFIED` | S | — | *"Rune numerical effects must be excluded from authoritative calculations"* | Canonical statement of a gap |

### 1.3 Backend — Combat Lab / simulator (read-only)

| Structure | File | Fields | Kind | Reusable? | Assumptions | Canonical / duplicated |
|---|---|---|---|---|---|---|
| `CombatLabBuildPreviewPayload` → `/api/combat-lab/build-preview` | `schemas/combat_schemas.py:198-205`; `routes/combat_lab.py:287` | `champion_name`, `level=18`, `item_names[]`, `rune_names[]`, `summoner_names[]`, `base_stats{}` override, `state{}` | I → **D** (`base_stats`, `loadout_stats`, `build_stats`, `runtime_stats`) | **The closest existing "loadout → derived stats" service** | No ranks, no shards, no patch; UPPER_SNAKE keys mixed with internal keys | Route duplicates `build_runtime_champion_stats` inline (`:293-338`) |
| `build_runtime_champion_stats(...)` | `services/combat_helpers.py:432` | champion, level, items, runes, base_stats, state | D | Called by team sim executor, sequence execution, engine tests | Level clamped 1–20; **missing champion → all-zero stats, not an error** (`:287-291`) | Own copy of the level curve (`:259-271`) |
| `TeamSimCombatantInput` | `schemas/team_simulation_schemas.py:310` | `champion`, `level` 1–18, `items[]`, `runes[]`, `ability_ranks{}` (validated), `crit_mode`, `starting_hp` | I | Team sim | Rank ceiling checked; rank-vs-level legality not | The cleanest per-combatant input shape in the repo |
| `EffectiveBuild` | `schemas/team_simulation_schemas.py:556-566` | echoed input + `max_hp`, `starting_hp_source`, **`data_version{patch: None, catalog_digest}`** | D + S | Team sim | `patch` is always `None` (`services/team_simulation_catalog.py:86-91`) | The only build-with-version echo in the repo |
| `CombatPayload` (legacy 1v1) | `schemas/combat_schemas.py:6` | attacker/target champion, level, items CSV, runes CSV, **`stat_shards[]`**, flags, `p/q/w/e/r_rank` | I | Legacy routes | — | **The only request model anywhere with stat shards** |

### 1.4 Backend — quiz bank and other generators

| Structure | File | Fields | Kind | Note |
|---|---|---|---|---|
| `champion_item_builds.json` | `quiz/data/champion_item_builds.json`, reader `quiz/champion_item_builds.py` | 173 champions × ordered build paths, primary role; `source_patch_basis` "26.16/26.17 working approximation" | I (build source) | Self-described *"whitelist and broad timing prior, not … pick-rate authority"*. Consumed by `quiz/cooldown_under_items.py` and cooldown generators — **a live precedent of a question family taking its item state from data**. Not read by Mastery. |
| `quiz/combat_scenarios/resolver.py` | `:26, 37, 83-93` | champion, level, rank, items; `validate_rank_for_level` | I | Explicitly **rejects** runes and shards ("structure only in V1"). The only rank-vs-level legality check outside the chain transitions. |
| Runtime `champion_stat_level` / `champion_stat_compare` | `quiz/runtime_casual.py:1385-1445` (`LEVELS=(11,18)`) | provenance holds `value`, `linear_value`, `curve` | D | Shares the curve with Mastery, not Mastery's fact layer. |

### 1.5 Frontend (mogsy `4c29f7ba`)

| Structure | File | Fields | Kind | Reusable? | Canonical / duplicated |
|---|---|---|---|---|---|
| `MasteryFactContext` | `src/features/mastery/contracts/promptSemantics.ts:35-39` | `abilityRank`, `championLevel`, `form` | I (per question) | Mastery | Mirrors backend `FactContext` |
| `MasteryComparisonSemantics` | `comparisonSemantics.ts:33-74` | A/B display names, metric, dimension, **one shared `context`**, unit, ability names A/B, `rankIndependent` | I + P | Mastery | — |
| `MasteryPlayerQuestion` | `playerQuestion.ts:71-151` | ids, sequencing, `state` (nullable), `patchDisplay` (string), matchup identity, semantics, answer union | P + S | Mastery | The Ranked adapter sets `state: null` (`MasterySliceChallengeSurface.tsx:104`) |
| `MasteryStateView` / `MasteryChampionView` | `stateView.ts:23-77` | HP/resource, effects, inventory, **level, abilityRanks, AP, AH, base/bonus/total AD, gold, armor, MR**; per state `snapshotId`, `patchKeyDigest`, A/B | D (backend-projected, display only) | Journeys player only | *"the frontend never derives max HP, resources, or effect magnitudes itself"* |
| `TransitionView` | `transitionView.ts` | `authored_effect`, `health_change`, `state_unchanged`, `level_change`, `ability_rank_change`, `gold_set`, `gold_spend`, `item_acquire` | D | Journeys | Mirrors `mastery/publication/projections.py` |
| `MasterySliceChallengeView` | `src/lib/ranked-public/contracts.ts:239-293` **and** `:428-446` | challenge fields, raw semantics records, patch_display, input constraints | P | Ranked | **Declared twice** via interface merging, kept "in step by hand" (`:440-441`); plus `MasterySlicePreviewChallenge`, `ReviewMasteryChallenge`, `SegmentRevealMasteryChallenge` — four more copies |
| `TeamSimCombatantRequest` / `CombatantDraft` / `EffectiveBuild` | `src/lib/combat-lab/team-sim/contract.ts:334-343, 452-465`; `draft.ts:129-141`; `request.ts:96-116` | champion, level, items, runes, ability_ranks (sorted for stable serialization), crit, starting HP; `data_version` | I (+ S) | Team sim | Catalog-driven bounds (hardcoded 1..18 mirror removed) |
| Combat Lab 1v1 request types | `src/lib/combat-lab/api.ts:50-62, 177-196, 321-343` | champion, sequence CSV, items, runes, target, free-form `stats{LEVEL…}`, ranks | I | Combat Lab | Hardcoded defaults (`DEFAULT_ATTACKER_STATS` L18/AD100/AP300, `CombatLab.tsx:139-151, 1919-1938`) |
| League Docs / Stat Check stat math | `src/lib/league-docs/api.ts:529-555`; `src/pages/dev/stat-check/statCheckEngine.ts:257-374` | `statAtLevel`, `attackSpeedAtLevel` | **D, client-side** | League Docs, Stat Check | Duplicates the backend curve |
| Broadcast cooldown explanation | `src/components/quiz-broadcast/BroadcastRenderer.tsx:440-481` | `100/(100+haste)` × base | **D, client-side** (explanation only) | Broadcast | Duplicates backend haste formula |
| Scenario-card subjects, media entities | `src/components/quiz-broadcast/scenario-cards/types.ts:64-199`; `questionMediaEntities.ts:36-82` | level, rank, item icons, total haste; role-tagged champions/items/runes with status (starting/purchased/…) | P | Quiz presentation | The only role-tagged attacker/target/items model on the client |
| Format Builder / Generator Lab config | `src/lib/admin/rankedFormatApi.ts:37-41, 279-344`; `MasteryGeneratorLab.tsx` | `module_config` (mode + subjects), `challenge_count`, `seed`; provenance display | I + S | Admin | No level, rank, item, rune, shard or patch input |

**Count.** At least **eight** independent client-side models of "a champion in some state"
(Mastery state view, Combat Lab 1v1, Team Sim, League Docs, Stat Check, League Swipe,
Broadcast scenario cards, Generator Lab config) and at least **five** of "champion base stats".
None imports another (V, grep).

---

## 2. Champion Mastery today — trace (Ahri)

```
champion_stats (1 row)  champion_abilities (4 slots)  cooldown authority JSON  champion_ability_formulas
        │                         │                        │ (arbiter + shape,       │ (corroboration only)
        │                         │                        │  fail-closed)           │
        └──── mastery/facts/sources.py:131-148, 221-256, 342-419, 432-454 ─────────┘
                                   │
        project_champion  (projection.py:321-363) → ChampionFact{context=FactContext(rank|level|form)}
                                   │   level-stats resolved on demand: _scaled_stat (:208-258)
                                   │   value = base + growth × riot_level_multiplier(L)
        build_bank (knowledge/bank.py:516-580) → ChampionQuestionCandidate per fact
                                   │   levels = BANK_LEVELS (6,11,18); ranks = eligibility list
                                   │   candidate_key e.g. ability_cooldown_rank:Ahri:W:r3 / champion_stat_level:Ahri:armor:lvl11
        publication gate (publication_gate/gate.py, policy.py:137-177) — family_contract modes
                                   │   Ahri today: 49 raw → 15 eligible (cooldown 10, cost 5)
                                   │   21 level-stat blocked family_mode_ineligible (§0), 13 family_unmapped
        eligible_champion_pool (synthesis/service.py:112-137)  ── counts only
        recipe.synthesize_champion_manifest (recipe.py:235-267) → SelectionRequests (budget allocate)
        resolver.publish → _build_universe re-projects from the DB (resolver.py:99-114)
                                   │   seeded rotation, used_patterns, adjacency, CURRICULUM_V2
        KnowledgeMasteryArtifact (state_model=STATELESS)
        MasterySliceModule.generate_segment (mastery_slice.py:755-850)
                                   │   steps[:n] → public + private challenge rows + mastery_artifact
        ranked_rounds (write-once)  →  quiz_attempts (source='ranked_mastery', no XP)
```

| Question | Answer (V) |
|---|---|
| Where does **level** live? | A `FactContext` axis on level-stat facts only. The levels asked are the constant `BANK_LEVELS = (6, 11, 18)`; level 1 excluded on purpose (`bank.py:49-53`). **Today no level-bearing candidate passes the gate (§0).** |
| Where does **ability rank** live? | A `FactContext` axis on ability facts, enumerated from the source array length / `STANDARD_RANKS`. When a value is flat across ranks the ranks collapse to one rank-free candidate (`bank.py:405-432`). Rank is never checked against a level. |
| Where does **patch** live? | Not an input. (a) `projection_patch_key` (`projection.py:291-316`) — a digest of **table-wide** `updated_at` ranges and row counts plus the cooldown authority's revision span and a literal; global, identical for every champion, unconnected to `league_patches`. (b) `patch_display` from `league_patches` — label only, excluded from identity. |
| Can **items / runes / loadout** affect generation? | **No.** `synthesize_champion_mastery(conn, champion, *, question_count, revision, display_revision, patch_display, selection_salt)` (`service.py:175-181`) has no state parameter; the config parser refuses any extra key; grep across projection/bank/composer/recipe/resolver/gate finds items/runes/haste only in prose. |
| Are derived stats computed from a **state object** or from **source facts**? | From source facts, one fact at a time: `_scaled_stat` reads the cached `champion_stats` row and multiplies growth by the shared curve. No object represents "Ahri at level 11 with ranks Q5 W1 E3 R1". |
| What would have to exist for the same generator to consume a different valid state without code changes? *(observed hard points only)* | 1. A state parameter on `project_champion` / `build_bank` / `synthesize_*` — none exists. 2. `FactContext` would need axes it explicitly forbids (items, haste, runes). 3. `BANK_LEVELS` and the rank list are module constants. 4. The resolver re-projects from the DB inside `_build_universe`, so a state passed to the first half would not reach the second. 5. `normalized_config` refuses unknown keys. 6. `StatedContext` is closed at two fields and test-pinned. 7. Stat-at-level has no bonus-stat input — the projection has no place to add an item's armor. |

---

## 3. Matchup Mastery today — trace (Ahri / Syndra)

```
project_champion(ahri)          project_champion(syndra)
        │                               │
   index by (metric, subject_ref, FactContext)   (composer.py:233-235)
        └──────────── intersect ────────┘   (composer.py:442-445; comparable() requires SAME context,
                        │                    facts/comparison.py:122-130)
          MatchupQuestionCandidate + ComparisonOutcome (winner|tie, rank_independent)
          key: ability_cooldown_compare:Ahri:W:vs:Syndra:W:r2
                        │
   universe = comparisons ∪ atomic(ahri) ∪ atomic(syndra)     (service.py:162-172)
   gate → Ahri/Syndra today: 51 composed comparisons → 9 eligible (all cooldown) + 34 atomic = 43
                        │
   synthesize_matchup_manifest (+ distinct_facts, diversify context, prefer discriminating, tie cap)
   → same freeze / persistence as Champion; subject_key matchup:ahri:syndra (order-independent)
```

| Question | Answer (V) |
|---|---|
| What is truly **pair state**? | Only the join result: `ComparisonOutcome` (winner/tie, direction) and `rank_independent`. `MatchupBank` holds two ids, display names and a `patch_key_digest` taken from the **left** side only. |
| What is merely **two independent fact banks**? | Everything else. Each side is projected alone; the atomic half of the universe is literally both Champion banks concatenated. |
| Where does **opponent context** exist? | Only as "the other bank" and as a display string. No object says "Ahri, laning against Syndra". |
| Is there a single shared **matchup state object**? | No. |
| Could each side carry a **different level/rank/items/runes**? | **No, structurally.** A comparison exists only when both facts have the *same* `FactContext` signature; the candidate key carries one rank suffix; `MatchupPromptSemantics.context`, the frontend `MasteryComparisonSemantics.context` and `StatedContext` each hold **one** context. Same-slot pairing only (`SLOT_RELATIONS`, `composer.py:54-56`). |
| Where do assumptions force **symmetry or static values**? | Same context both sides; same slot both sides; flat-vs-flat collapses to the lowest shared rank with `rank_independent=True` (`composer.py:461-471`); level comparisons only at 6/11/18 and base+growth only (and currently gate-blocked); base stats only at `champion_level=None` (currently gate-blocked, §0). |

**Contrast worth recording.** `CanonicalMasteryState` (§1.2) already models `champion_a` +
`champion_b`, each with its **own** level, ranks, inventory and runes. The asymmetric
matchup the generated path cannot express is representable in the older lineage — and it is
exactly what `first_ahri_syndra` used (Ahri and Syndra at different levels).

---

## 4. The Ahri/Syndra architecture — it is not retired

### 4.1 Correction to the brief's premise (V)

`mastery/chains/first_ahri_syndra.py` (433 lines) is at HEAD. `mastery/publication/registry.py:1023-1088`
builds **13 identity-pinned artifacts at process start**, including Ahri-vs-Syndra v1 and
**v2, which is `default_set_id`**. `PublishedRegistry.list_sets()` returns the default first
(`:249-257`), `GET /api/mastery/sets` serves it (`routes/mastery.py:233-236`), and the
frontend `/quiz/mastery` Mastery Journey page lists it. That page is linked from the Quiz hub
behind `HUB_MODULES.masteryJourney`, which is **`true`** (`src/pages/Quiz.tsx:146, 1723`).
The public catalog adds Olaf cooldown+mana and Summoner Spell Mastery
(`PUBLIC_CATALOG_SET_IDS`, `registry.py:1017-1020`).

**What MC1 (`c17c55de`, 2026-09-11) retired** was the *Ranked* static Mastery Set catalog
(`COMPATIBLE_MASTERY_SETS`), `jarvan_penetration`, two hand-authored Ahri manifests that
duplicated the generator, two dev routes and a flag. The standalone Journey product and its
whole lineage were classified "kept" (backend `docs/workstreams/MC1_STATIC_CONTENT_RETIREMENT.md`).
`ranked_formats/retired_mastery_sets.py` decodes the three retired Ranked ids to generator
configs on the read path only; it never touches the Journey artifacts.

### 4.2 History (V)

| SHA | What it added |
|---|---|
| `381b0f08` | G3.1 — `mastery/state/` |
| `940c9a0e` | G2.2 — certified Ahri/Syndra data, `slice_patch.py` |
| `eee9f502` | G4.2A — Ahri E / Syndra E certified adapters |
| `1307e8f0` | G4.2B — question-step and artifact contracts |
| `c1002a30`, `f7fe0466` | G4.2C — `first_ahri_syndra.py`, `haste.py`, HP transition tied to Q5 |
| `e93cf3e1` | G4.2D — ranked capsules |
| `65a95a84` | H1/G7 — publication registry, projections, sessions, `/api/mastery`, migration |
| `e95257ff` | J1 — v2 (Q6 overkill, third transition) |
| `81c75f48`, `ea44c8eb`, `da45a731` | G4 timeline generator, level/rank/gold/item transitions, branching, generic adapters |
| `ea12c325` … `6a5c1670` | Lux, Jarvan, Maokai, Olaf journeys |
| mogsy `8d35837b` | `MasteryPlayerLive`, state/transition views |

### 4.3 How it modelled things (V)

* **State:** an immutable, content-hashed `CanonicalMasteryState` of one or two
  `ChampionCanonicalState`s under a `ValidationContext`.
* **Transitions:** declarative `MasteryStateTransition`s applied by a pure, fail-closed
  `apply_transition` that returns before/after evidence. Haste is an authored
  `BUFF_APPLICATION` with a versioned effect id, **read back from state** by
  `resolve_authored_ability_haste`. Damage → HP is the calculation *proposing* a
  `HEALTH_CHANGE` that the chain then applies. Leveling and purchases are
  `LEVEL_CHANGE` / `ABILITY_RANK_CHANGE` / `GOLD_SPEND` / `ITEM_ACQUIRE` between timeline
  checkpoints, item-checked against a certified recall-item slice with slot limits.
* **Questions ↔ state — hybrid.** Each `MasteryQuestionStep` (`questions/step.py:82-109`)
  carries `before_snapshot_id`, `after_snapshot_id`, `transition_id`, `canonical_inputs`, the
  full calculation result and source records, and the answer is always computed. **But most
  adapter inputs were module literals, not reads from state:** `_AP = 100.0`,
  `_TARGET_MR = 30.0`, `_TARGET_HP_START = 480.0` (`first_ahri_syndra.py:74-81`), Q6's
  `target_current_hp: 230.0` (`:352`). Only haste is resolved from the snapshot (`:268`).
  The chain then **asserts** the state agrees (`:323-338`). Prompts and explanations are
  hand-written with the numbers in them (`:258-261, 311-312`). The scenario values are
  teaching values: Syndra is level 18, but HP 480 / MR 30 sit below her certified level-1
  values (I, from `syndra.py:110,114`).
* **Calculations:** reusable primitives with steps, provenance and a recompute cross-check —
  `calculations/cooldown.final_cooldown`, `mitigation`, `health.health_result`, `economy`,
  `resource`. The first adapters were champion-hardcoded; `certified_adapters/generic.py`
  (`81c75f48`) later parameterized them.

### 4.4 Classification

| Good ideas — already resemble the reusable-state direction | Hard-coded / static | Should NOT be resurrected |
|---|---|---|
| Immutable, content-hashed state with `snapshot_id`; lineage kept out of identity | Scenario constants typed into each chain module | A closed catalog of named prebuilt sets as a second content authority (MC1 retired it; `test_mc1_static_content_retirement.py` enforces it) |
| One **or two** champions per state, each with its own level/ranks/inventory/runes | Prompts with the numbers baked in — drift guarded only by asserts | Hand-typed item stats beside item names (MC1 §11 removed them) |
| Declarative, fail-closed transition vocabulary with before/after evidence | Per-champion Python data modules — a frozen copy of canonical data | Champion-hardcoded adapter classes |
| "Calculation **proposes** a state change; the chain **applies** it" | `SLICE_PATCH_DESCRIPTOR` literal ("Mixed verified snapshot — League 26.13 context") | Question inputs that duplicate state instead of reading it |
| Generic calculation primitives with steps and recompute checks | `recall_items.py`, `target_profiles.py` — frozen / hand-picked copies | Identity pinned by literal expected digests as the immutability mechanism for generated content (Phase 4's freeze-on-serve already replaces it) |
| `SourceBinding` per value; `CompositePatchDescriptor` with an honest `mixed_snapshot` status | Registry identities pinned by hash — a correct data change is a code edit | `custom_state` as an untyped escape hatch |
| `ValidationContext` with rank limits, certified bounds, inventory policy | The Ahri-specific first adapter | |
| `BuildCandidate.classification` — a **build source** as a first-class, declared field ("curated / generated / professional / common_build", confidence never "high") | | |
| Capsule eligibility (`standalone_state_complete`, `DEPENDS_ON_PRIOR_STEP`) — a question knowing whether it can stand alone | | |
| Display-safe state/transition projections the frontend never recomputes | | |

### 4.5 Applied-chain — the bridge between the lineages (V)

Applied-chain is the **only generator on the canonical-state lineage**:
`physical_penetration_set.py:50` builds `CanonicalMasteryState`. It carries both sides at
`SCENARIO_LEVEL = 11`, rank = highest legal at 11, **one item** in the attacker inventory,
and `current_health`/`current_resource` placeholders of `100.0` on both sides (`:108-114`).
One read-only step per artifact, `transition_chain=()`. The calculation reads its `inputs`
(`ability_rank`, `attacker_level`, `item_name`, `target_champion_id`, `target_level`), **not
the snapshot** (`physical_penetration_adapter.py:94-117`).

**Two sources in one calculation:** item stats are read **live** from `item_canonical`
(`list_penetration_items`, `physical_penetration_chain.py:256-302`); champion AD and target
armor come from the **frozen certified copies** (`champion_scaling.scaled_stat`). Level,
rank, item and target level reach the player only as **prose** — the public challenge is
`interaction_kind=legacy_combat` with no `presentation` and `prompt_semantics=None`
(`mastery_slice.py:246-256`).

---

## 5. Build / setup authority

| Domain | Source of truth | Current? | Normalized enough to feed a state? | Competing authorities | Versioning | Propagates to generated content today? |
|---|---|---|---|---|---|---|
| **Recommended items / builds** | **No authority.** Nearest: `quiz/data/champion_item_builds.json` (173 × build paths, "whitelist and timing prior", patch basis free text, last `92508ff9` 2026-08-26); `mastery/data/build_candidates.py` (Ahri only, curated, "not proven meta") | Approximate | Item **names** only in the JSON; `BuildCandidate` has Riot ids + stats | Two, disjoint | Free-text patch basis | JSON → stored cooldown-under-items quiz questions only; never Mastery |
| **Item data** | `item_canonical` — 333 rows, 237 `validated_current` + `is_current_sr`; Riot item id, `stats_json` with canonical keys, wiki `source_revision`, `fetched_at`, `parser_version` | Yes (one revision, 2026-08-14 locally) | **Yes** — the best-normalized authority in scope | Legacy `items` (125) + `item_stats` (470); `item_graph_nodes`; `item_sheet_metadata`; frozen `recall_items.py` | Whole table **deleted and reinserted** per refresh (`item_canonical/pipeline.py:56-61`) | Read live by Applied-chain, item quiz authorities, Combat Lab |
| **Item effects** | Python — `item_runtime_rules.py` + ~30 `item_*_{authority,runtime}.py`; `item_effects` table has 0 rows locally | — | No (code) | — | None | Combat only |
| **Runes** | `runes` (34: name, tree, type; **no Riot perk id**, no revision), `rune_stats` (9 flat stats), `rune_effects` (34), `rune_effect_scalings` (11); behaviour numbers are constants in `rune_runtime_rules.py` | Unknown — no revision exists | Name-keyed; no perk-id mapping anywhere | DB tables vs runtime constants | **None** | Combat only; Mastery excludes runes by declaration |
| **Stat shards** | **No table.** Three literals in `champion_stat_profile.apply_stat_shards` (`:189-205`: attack speed, adaptive force, scaling health); unknown shards ignored | — | No identity | — | None | Legacy combat routes only; live Combat Lab and team sim have **no shard input** |
| **Ability rank / skill order** | **No authority.** The standard skill-point rule exists in code (`transitions._min_level_for_rank`, `combat_scenarios/resolver.validate_rank_for_level`). LIVE1 `live_player_state.abilities_json` holds real level-up orders for live pro games (80 rows locally) | — | LIVE1 rows use Riot ids with no mapping | — | Per live game | No |
| **Champion base stats** | `champion_stats` — 173 rows, typed base + growth columns keyed by name | Yes (patch ops) | Yes | Frozen certified copies (6); `champion_values` sheet cells; `patch_history` vocabulary (0 rows) | `updated_at` only; **overwritten in place** | Generated Mastery reads at generation time; stored quiz rows are flagged/held by Patch Ops |
| **Abilities** | `champion_abilities` (692 slots; `authority_revision_id` per row), `champion_ability_formulas` (1,720), cooldown authority JSON (arbiter + shape) | Yes | Progressions are slash-strings; `cost_resource` typed | Certified copies; `compiled_effect_definitions` | Wiki revision id per row; overwritten in place | Generated Mastery reads at generation time |
| **Patch** | Three answers: `league_patches` (416 rows, one `live`), `knowledge_engine/patch_identity.resolve_canonical_patch` (Patch Ops operations), pinned `SLICE_PATCH_DESCRIPTOR` | — | `league_patches` is a clean catalog | Three | The `live` row is set by a build script literal (`scripts/build_historical_patch_catalog.py:132`); no code path moves a patch to `live` (I, grep) | Label only |
| **Pro-play builds** | Historical corpus: **no item, rune or skill columns** (`pro_canonical_player_game_stats`, `esports_champion_games`). `esports_player_game_items` ingestion code exists (`447ebeee`) but the table is absent locally | — | — | — | — | No |
| **External providers referenced** | wiki.leagueoflegends.com (items, abilities, summoner spells), Leaguepedia + Oracle's Elixir (pro), U.GG (roles CSV provenance only). Data Dragon named as the historic ability import and as "a banned source". No op.gg/lolalytics/mobalytics. | | | | | |

**Answer to "is current/recent build data available?"** Item and champion values: yes.
Recommended builds, rune pages, stat shards and skill order: **no authority exists**; the
closest things are one hand-curated whitelist, one hand-curated Ahri file and a small LIVE1
live-game sample.

---

## 6. State derivation — what exists

| Capability | Where | Classification |
|---|---|---|
| Base + level-scaled stats | `champion_stat_profile.riot_level_multiplier` / `calculate_base_champion_stats` (`:5, 127`) | **Already reusable** — imported by Mastery projection, `champion_scaling`, GRAPH1, `quiz/champion_stat_authority`, `runtime_casual`, cost family |
| … duplicates of the curve | Combat Lab `services/combat_helpers.py:259-271` (**live Combat Lab and team sim**, clamped 1–20, zero-fill on miss); `stat_check_public/engine.py:97-105`; `knowledge_engine/automation/impact.py:1001-1013` (deliberate, test-asserted equal); inline in `rune_runtime_rules.py:210`, `champion_onhit_runtime.py:3232`, `champion_lifecycle_authority.py:814`; frontend `league-docs/api.ts:529-555` | Several docstrings call `champion_stat_profile` "the single implementation" — **false** for the live Combat Lab path |
| Attack speed at level / finalize | `champion_stat_profile.py:47, 220`; `stat_modifier_engine.py:757` | Reusable |
| Item stat aggregation | `item_canonical/runtime_stats.load_canonical_item_stats` (`:205`, fails closed); `calculate_build_stats(item_names)` (`calculate_build_stats.py:67`, Rabadon ×1.3, MS%, crit) | **Already reusable** |
| Rune flat stats | `calculate_rune_stats`, `calculate_loadout_stats(items, runes)` (`calculate_loadout_stats.py:59, 105`) | Reusable over 9 flat rows |
| Rune behaviour | `rune_runtime_rules.py` (2,006 lines), `registered_rune_effects.py` | **Feature-specific** (inside the simulator) |
| Stat shards | `champion_stat_profile.apply_stat_shards` (3 shards) | **Partially reusable**, legacy path only |
| Ability haste → cooldown | `calculate_cooldown.haste_to_cooldown_multiplier` (`:7, 39`, self-described shared formula); duplicates in `mastery/calculations/cooldown.py:16`, `quiz/cooldown_under_items.py:282` (rounds 0.1), `quiz/combat_scenarios/resolver.py:26`, `quiz/generate_combat_cooldown_prototype.py:56`, frontend `BroadcastRenderer.tsx:465`; in-sim `ability_cooldowns.ability_haste` (`:198`) | Formula **reusable**; haste *totals* from a loadout are simulator-assembled |
| AD / AP totals, bonus AD | `finalize_preview_stats` (`combat_helpers.py:335`, `BONUS_AD = AD - BASE_AD`) | **Partially reusable** via `build_runtime_champion_stats` |
| Bonus HP / armor / MR | Not derived in the build path (I, grep); `BONUS_HP` only holder-side (`holder_side_runtime.py:154`) | **Absent** in the build path |
| HP / resource | `combat_resource_state.base_resource_for` / `resolve_resource` (`:105, 145`); `combat_mana.cast_cost` (`:151`); 47 champions held from the mana ledger | Feature-specific |
| Armor / MR mitigation, penetration | `penetration.calculate_effective_resistances` (`:59`, "the only authority", % pen 0–100); `damage_mitigation.mitigate_damage`; **duplicate** `mastery/calculations/mitigation.effective_resistance` (`:22`, **% pen as 0–1**) | **Reusable**, with a unit disagreement between copies |
| Movement speed | `movement_speed_model.resolve_movement_speed` (`:115`) | Partially reusable |
| Cooldowns / costs per rank | `services/canonical_ability_facts.get_ability_facts` (`:196`, cached, invalidated by Patch Ops); Mastery projection reads the same rows its own way | Reusable data read; per-feature projection |
| Rank legality | `champion_state.ability_rank_ceiling`; rank-vs-level only in `quiz/combat_scenarios/resolver.validate_rank_for_level` and the chain transitions | Scattered |
| Live stat modifiers | `stat_modifier_engine.apply_all_stat_modifiers` (`:928`) | Partially reusable — needs a `CombatState` (an empty one works) |

**Nearest thing to the requested service:** `build_runtime_champion_stats(champion, level,
items, runes, base_stats, state)` / `POST /api/combat-lab/build-preview`. It returns derived
stats for champion + level + items + runes. It takes **no ability ranks** (applied separately
by `apply_ability_ranks_to_attacker_stats`), **no stat shards**, **no patch**, returns an
UPPER_SNAKE dict mixed with internal keys, and zero-fills a missing champion rather than
failing. **No service takes champion + level + ranks + items + runes + shards + patch and
returns a derived state.** Mastery's own state object deliberately does not compute derived
values — it carries them as non-authoritative `derived` evidence.

---

## 7. Mutability — what has to change when the game changes

| If tomorrow… | Canonical/source-data update | Generator code change | Static content rewrite | No change |
|---|---|---|---|---|
| **Recommended items change** | `champion_item_builds.json` (a file edit, for the stored quiz families that read it) | — | — | **Champion / Matchup Mastery** (they have no items) |
| **A new build becomes preferred** | same file | **Applied-chain**: no "preferred build" input — its item comes from the penetration pool; `build_candidates.py` is Python | `mastery/data/build_candidates.py` (Python module) | Champion / Matchup |
| **Skill order changes** | — (no authority) | `_min_level_for_rank` rule is code; `SCENARIO_LEVEL` is code | Every hand-authored chain / timeline that pins ranks | Champion / Matchup (they enumerate all ranks independent of order) |
| **Runes change** | `runes` / `rune_stats` tables (combat); `rune_runtime_rules.py` is **code** | Combat rune behaviour is code | — | Mastery (excludes runes) |
| **Stat shards change** | — (no table) | `champion_stat_profile.apply_stat_shards` literals | — | Everything else (no shard input anywhere live) |
| **An item changes** | `item_canonical` refresh | Item **effects** are code (`item_*_runtime.py`) | `mastery/data/recall_items.py`, `build_candidates.py` (`ItemRef` stats typed in), Journey registry pins → startup fails closed until re-pinned | Applied-chain (reads live) |
| **A champion changes on a new patch** | `champion_stats` / `champion_abilities` / `champion_ability_formulas` via Patch Ops; cooldown authority JSON regenerated by `scripts/dc1_ability_semantic_audit.py` | — | `mastery/data/<6 champions>.py` + Journey pinned digests (only if one of the 6); `SLICE_PATCH_DESCRIPTOR` if re-certifying; stored `quiz_questions` are flagged/held — only cooldowns have a regenerator | **Champion / Matchup Mastery** — next generation reads the new values; served artifacts stay frozen |
| **A new patch goes live** | `league_patches` row | The `live` choice is a build-script literal | — | Mastery label follows the catalog |

**Every place a state change currently requires code or content edits rather than data:**
`BANK_LEVELS`; `STANDARD_RANKS`; `SCENARIO_LEVEL`; `_min_level_for_rank`; `apply_stat_shards`
literals; `rune_runtime_rules.py` constants; item effect runtimes; `build_candidates.py`;
`recall_items.py`; `target_profiles.py`; the six certified champion modules;
`SLICE_PATCH_DESCRIPTOR`; the Journey registry's expected digests; every hand-authored chain
module; `scripts/build_historical_patch_catalog.py:132` (which patch is `live`); frontend
Combat Lab defaults (`DEFAULT_ATTACKER_STATS`, `defaultConfig`, 1..20 clamps) and the Stat
Check `ITEMS` table.

**What already updates automatically:** Champion and Matchup Mastery's *values* (they read
`champion_stats` / `champion_abilities` at generation), Applied-chain's *item* values, Combat
Lab, GRAPH1, the patch label. What they cannot absorb is a change of **scenario** — there is
no scenario to change.

---

## 8. Identity and versioning

| Concept | Identity today | Stable across patches? | Note |
|---|---|---|---|
| Patch | `league_patches.patch_id` (`lol-2026-16`), `display_version`, `machine_key`, lifecycle | Yes | **Nothing in Mastery references it** except via a display string |
| Patch (machine, generated path) | `projection_patch_key` — digest of table timestamps/counts | **Changes on any row touch, for every champion** | Not a patch id; not per champion |
| Patch (machine, certified path) | `SLICE_PATCH_DESCRIPTOR.patch_key_digest` | Pinned literal | Adapter registration key |
| Patch (combat) | `EffectiveBuild.data_version.patch` | Always `None` | `catalog_digest` exists |
| Champion | slug (`ChampionIdentity.champion_id`), `champions.name`; `riot_id` only for 6 | Yes | **`candidate_key` and therefore the durable `mastery:` ref embed the DISPLAY NAME** (`Ahri`), not the slug — a rename would move the ref while `candidate_id` would not (I) |
| Item | `item_canonical.canonical_item_id` = Riot id; PK `canonical_name` | Yes | State inventory holds **names** |
| Rune | `runes.id` autoincrement + `rune_name` | Name only | No Riot perk id; LIVE1 has perk ids with no mapping |
| Stat shard | **None** | — | — |
| Question semantics | `fact_id` (value-free), `content_digest` (with value), `candidate_id`, `candidate_key`, `mastery:<candidate_key>`, `effective_question_key` (not persisted) | `fact_id` / `candidate_key` yes; `content_digest` no | Context (rank, level) is **inside** the question's identity |
| Generated artifact | `mastery_set_id`, `artifact_digest`, `snapshot_digest`, `generation seed`, `artifact_instance_id` | — | Four Phase 4 levels, unconflated |
| State | `snapshot_id` — **chain lineage only** | — | Nothing in the generated path identifies an input state |
| Config inputs | `normalized_config`, `subject_key`, `selection_salt` | — | Subjects only |
| Build/setup source | `BuildCandidate.candidate_id` + `classification` (Ahri, curated) | — | Nowhere else |

**Is canonical data versioned per patch? No (V).** `champion_stats`, `champion_abilities`,
`champion_ability_formulas` are updated in place by Patch Ops writers
(`knowledge_engine/apply/db_writer.py:710-760` and siblings); `item_canonical` is deleted and
reinserted. The audit ledgers (`knowledge_apply_history` 61 rows, `…formula…` 0,
`…structural…` 7) record deltas with a free-text `patch_version`, not snapshots. The designed
per-patch store (`patch_history` → `parameter_states`, immutable by trigger) has **0 rows** and
no consumer, and its vocabulary covers ability parameters, not items. **No query returns a
champion or item value "as of" patch N.**

**Distinguishing the three kinds of state today:**

| Concept | Representation today |
|---|---|
| Current dynamic / default state | **Implicit** — "whatever the tables hold now" plus policy constants. No object names it. |
| Resolved exact state | `CanonicalMasteryState` — chain lineage only. The generated path resolves individual facts, never a state. |
| Historical frozen state | `ranked_rounds` payloads (write-once) — **content** frozen, **state** not. |

**Phase 4 frozen artifact — preserves:** the rendered questions, options, answers,
explanations, media, patch label, `prompt_semantics.context` (rank/level), and the
`mastery_artifact` block (generator type/version/config, subject, count, instance id, set id,
artifact digest, patch_key_digest, patch_display, is_prototype, served coordinates, salt).

**Does not preserve:** per-step `candidate_id`, `content_digest`, `fact_refs`,
`source_records`; the source values behind an answer (the number survives only as the answer,
the options and prose); `champion_stats` / `item_canonical` rows or revisions; the cooldown
authority `content_sha256`; the full `CompositePatchDescriptor` or a `league_patches.patch_id`;
`snapshot_digest`, generation seed, resolution diagnostics. For Applied-chain, level, rank,
item and target level exist only in prose.

**Can it already freeze richer state safely?**
* **Private side — structurally yes.** `segment_private_json` is JSON; `mastery_artifact` is
  additive and absent-means-unknown (`artifact.py:64-68`); no set-equality test pins its
  top-level keys (I). The `source` sub-dict **is** pinned by exact equality
  (`test_gr1_phase4_artifact_persistence.py:64-72`).
* **Reaching any reader requires deliberate edits:** `review_view` is a positive allow-list
  (`artifact.py:195-222`, and the Lab test asserts equality with it);
  `ranked_public/review.py:505-523` projects challenge fields by an explicit list.
* **Public side — constrained.** `PUBLIC_CHALLENGE_FIELDS` (`mastery_slice.py:1018-1026`)
  drops unknown keys; `StatedContext` is closed at two fields; reveal-secrecy tests pin reveal
  keys. A resolved state that contains the answer's inputs (a computed stat) would be
  answer-revealing if made public (I).
* **Determinism.** `build()` is pure; a frozen state would have to be too, for
  `artifact_instance_id` to stay reproducible.

---

## 9. Reuse by existing systems

| System | Overlap with a resolved state | Contract boundary | Duplicated logic / data | Likely compatibility | Blockers |
|---|---|---|---|---|---|
| **Question generation (Mastery)** | Total — it would be the consumer | `synthesize_*` signatures; `normalized_config`; `FactContext` | Two lineages with two state notions | Generated path: low without new inputs (§2). Chain lineage: high — it already *is* a state consumer | `FactContext` forbids scenario axes; resolver re-projects from DB; config key allow-list |
| **Other quiz generators** | Stat-at-level, cooldown-under-items (item states from `champion_item_builds.json`), combat scenarios (level/rank/items) | Each family's own generator; `family_contract` | Haste formula ×5, curve shared, `combat_scenarios` resolver rejects runes/shards | Medium — they already take level/rank/items as data in places | Stored rows snapshot numbers; only cooldowns regenerate |
| **Quiz analytics / statistics** | None directly — champion lives only in `provenance_json.subject_key` / `generator_config`; level/build not persisted | `quiz_attempts` v2 (`question_key` version-free by design); `personal_analytics`, `practice_builder`, `quiz_stats` | `category` means two things (practice category vs Mastery family); `EXCLUDES_MODES` declared but not applied to `source` (`personal_analytics.py:110-112`) | A state reference could only go into `provenance_json` today | No champion/patch/level/build columns; several reports INNER JOIN `quiz_questions`, so generated rows drop out (I) |
| **User saved / custom sets** | None — Practice Builder saves a **filter** config, not questions or state | `quiz_saved_practice_sets.config_json`; `quiz_packs`; `ranked_format_configs` (admin-global); `mastery_generated_recipes` | — | Would need a new notion; nothing pins a patch or state | Missing table locally; `missed` pool keys on `question_id` (excludes generated attempts) |
| **Combat Lab** | Highest — it already resolves champion + level + items + runes → stats | `/build-preview`, team sim `TeamSimCombatantInput` / `EffectiveBuild` | Own curve copy; own request shapes per surface (CSV vs list, `q_rank` vs `ability_ranks{}`) | High for **derivation** (`build_runtime_champion_stats` is callable) | No shards, no ranks in preview, no patch, zero-fill on a missing champion (Mastery fails closed), level cap 20 vs 18 |
| **Graphs / visualization (GRAPH1)** | Champion stat growth/snapshot datasets | `graph1/stat_growth.py`, `stat_snapshot.py` | Shares the curve function with Mastery | High for base stats | Levels 1–20 across the whole roster; no items/runes |
| **Admin Generator Lab** | Shows exactly what a generator produced | `/admin/mastery-slice/preview` runs the real `generate_segment`; `/coverage` counts the real pools | None — reuses production code (a strength) | Any field added to `artifact.build` **and** whitelisted in `review_view` would appear automatically | Inputs are subjects, count, seed only |
| **Mastery Journeys (`/quiz/mastery`)** | Already a state consumer end-to-end (state views, transitions, reveal with before/after) | `routes/mastery.py`, `MasteryStateView`, `TransitionView` | Frozen champion copies; pinned digests | Highest conceptually | Hand-authored scenarios; six champions |
| **Summoner Spell Mastery** | Builds `CanonicalMasteryState` / `ValidationContext` | `mastery/chains/summoner_spell_mastery.py` | — | Already on the state lineage | Chain-authored |
| **Meta Reflex / Item Cost Duel / ranked candidate generation / Daily** | Level-1 `champion_stats`, `item_canonical` | Own frozen payloads | — | Low relevance | — |

**No generator outside `mastery/` consumes Mastery facts or Mastery state (V/I).**

---

## 10. Full vs Slice compatibility

Evaluated only: can one question universe feed a Full composer and a Slice composer without
duplicating question generation?

### Champion Mastery

| Criterion | Finding |
|---|---|
| Candidate generation separate from composition? | **Yes, named and enforced since Phase 3/5** — `eligible_champion_pool` is the first half; `recipe` + resolver the second. Caveat: `publish()` re-projects the universe from the DB inside `_build_universe`, so "the universe" is computed twice and is not a value handed from one half to the other. |
| Ordering metadata? | `CATEGORY_ORDER`, `CURRICULUM_V2` (a category order), per-role `block`, `_pattern_group`, `_phase_for`, `difficulty_class` (constant per category — Ahri's candidates all `2`). **No state order**: nothing says "this question belongs before that one because the game state advanced". |
| State/context identity? | Only per-fact `context` inside `candidate_key` / `candidate_id`. No identity for a state as a whole. |
| Can candidates attach to an incremental resolved state? | Not today: candidates are intrinsic facts; level and rank are enumerated independently of each other (rank 5 at level 6 is a valid candidate). The chain lineage's `before_snapshot_id` field exists on `KnowledgeMasteryStep` and is `None`. |
| What makes exhaustive ordered traversal hard? | A required `question_count` (≤ pool; Ranked slices `steps[:n]`); `allocate()` distributes a **budget**; seeded rotation; `used_patterns` deliberately **avoids** asking a fact's other ranks; dedupe by rendered question; adjacency/run reordering; `BANK_LEVELS` removes 15 of 18 levels before composition starts. All of these are Slice virtues and are the opposite of "cover everything in order". |

### Matchup Mastery

| Criterion | Finding |
|---|---|
| Separation | Same as Champion (`eligible_matchup_pool`). |
| Ordering metadata | Comparisons-first sequencing; no pair-state progression. |
| State/context identity | One shared context per comparison. |
| Incremental resolved state | Not representable — one context for both sides, no opponent state. |
| Traversal obstacles | All of Champion's, plus the tie cap and tie deprioritization (which skip variants on purpose), `diversify_context_within_pattern` (picks one rank per fact), and the atomic half — **1,150,680 atomic candidates are unreachable at n ≤ 8** (structural audit) and, since `b7ccf8e0`, the atomic half is the whole universe for 880 pairs. |

**What does already fit "one universe, two composers":** the pool is a named first half; the
invariants module (`mastery/synthesis/invariants.py`) judges finished steps independent of
how they were chosen; the freeze/attempt path does not care how a step was selected;
coverage counts and slices read the same pool. **What does not:** the universe is a bag of
intrinsic facts, not a sequence of states, so there is nothing for a Full composer to walk
*through* — Full would need an ordering the candidates do not carry.

---

## 11. Structural strengths — verified, not assumed

1. **Canonical fact authority with fail-closed source integrity** (Phase 2): cooldown
   authority arbitration with provenance, certified-copy drift detection, `SourceIntegrityError`.
2. **Generator/candidate separation is real and named** (`eligible_*_pool`), and coverage reads
   the same pool as generation.
3. **Deterministic, seeded composition** — same salt ⇒ same slice; reversed pair ⇒ identical
   digest.
4. **Layered semantic identity** — value-free `fact_id` vs value-bearing `content_digest`;
   `candidate_id`; four unconflated artifact identities.
5. **Frozen artifact persistence** (Phase 4) — write-once rounds, absent-means-unknown,
   `generator_version` as provenance never dispatch, historical immutability proved by a
   double assertion. **Additive private JSON can already hold more.**
6. **One per-challenge renderer** shared by the arena and the Lab; **the Lab runs production
   generators**.
7. **A complete, immutable, content-hashed state model already exists** —
   `CanonicalMasteryState` (one or two champions, each with level, ranks, inventory, runes,
   vitals, effects) with a `ValidationContext` (rank limits, inventory policy, patch digest),
   a declarative transition vocabulary with evidence, and display-safe projections the
   frontend never recomputes.
8. **A build-source concept already exists** — `BuildCandidate.classification` with honest
   confidence.
9. **Reusable derivation primitives exist** — the level curve, item stat aggregation
   (`calculate_build_stats`), loadout aggregation, penetration/mitigation, haste formula,
   `build_runtime_champion_stats`.
10. **A clean patch catalog exists** (`league_patches`), even though nothing keys on it.
11. **The cleanest input shape in the repo is Team Sim's** (`TeamSimCombatantInput`: champion,
    level, items, runes, validated ranks) with a `data_version` echo.

---

## 12. Structural gaps — observed, classified, not converted to work

**State representation**
- The generated path has no state object; context is three scalars per fact, and `FactContext`
  explicitly forbids scenario axes.
- Matchup has one shared context; per-side state is unrepresentable in the generated contracts
  and on the frontend wire.
- Two disjoint state notions: generated (stateless facts) and chain (`CanonicalMasteryState`).
  Neither imports the other.
- `ChampionCanonicalState` holds items by name and derived stats only as non-authoritative
  evidence; gold lives in `custom_state`.
- ≥8 frontend models of a champion-in-state; none shared.

**State derivation**
- No service resolves champion + level + ranks + items + runes + shards + patch → derived state.
- Ranks, shards and patch are absent from the one loadout→stats service
  (`build_runtime_champion_stats`).
- Stat shards have three literals and no table; rune behaviour and item effects are code.
- Bonus HP/armor/MR are not derived in the build path.
- Rank-vs-level legality is enforced in two places only.
- Curve duplicated (live Combat Lab has its own copy, contradicting docstrings), haste ×5,
  mitigation ×2 with a **unit disagreement** (% pen 0–100 vs 0–1).

**Source authority**
- No recommended-build, rune-page, shard or skill-order authority. Nearest: a curated whitelist
  JSON and a curated Ahri Python file.
- Runes have no Riot perk id and no revision; LIVE1 perk ids have no mapping.
- Six certified champions are frozen Python copies; Applied-chain mixes live item data with
  frozen champion data in one calculation.
- `family_contract` modes are a shared gate whose Mastery consumer was not visible to the
  qca8 change (§0).

**Versioning / identity**
- Canonical values are overwritten in place; no "as of patch N" read; the per-patch store is
  empty and has no consumer.
- Three unrelated patch notions (`league_patches`, table-timestamp digest, pinned descriptor);
  nothing links the machine digest to a patch id; combat reports `patch: None`.
- No identity for an input state or a build source in the generated path.
- The durable `mastery:` ref embeds the champion **display name**.

**Composition**
- The universe carries no state order; composition is budget-first by design.
- Level axis is a constant `(6, 11, 18)`; rank and level are enumerated independently.
- `_build_universe` recomputes the universe instead of receiving it.

**Persistence**
- The frozen artifact preserves content, not the resolved state or source values behind it.
- `review_view`, `review.py` and `PUBLIC_CHALLENGE_FIELDS` are positive allow-lists — safe,
  but every new field is a deliberate multi-file edit.
- Analytics rows carry no champion/patch/level/build column; attempts are fail-soft.

**Reuse / contracts**
- Every surface has its own loadout request shape (CSV vs list, `q_rank` vs `ability_ranks{}`).
- Combat zero-fills a missing champion; Mastery fails closed — incompatible failure semantics.
- Level caps differ (18 vs 20).

**Presentation**
- `StatedContext` is closed at level + rank; no item/rune/build channel exists for Mastery.
- Applied-chain state reaches the player only as prose (`legacy_combat`, no presentation).
- `MasterySliceChallengeView` is declared twice and copied four more times on the frontend.
- Patch label logic exists in ≥3 places; the Journey player's legacy
  `player/MasteryQuestionView.tsx:91-94` still renders a hardcoded `"Fixed scenario"` span
  beside the badge (the Ranked slice path does not use that view).

---

## 13. Owner decisions that will eventually be required

Phrased as questions. None is answered here.

1. **qca8 and Mastery.** Should the Mastery publication gate follow `quiz/family_contract.py`
   modes (so `b7ccf8e0` correctly removed level-stat and base-stat comparisons from Mastery),
   or should Mastery's eligibility be declared separately so a Practice-serving change cannot
   move it? Was removing them from Mastery intended?
2. Should **one reusable state contract** be shared by Champion and Matchup — and by
   Applied-chain and the Journeys — or should each generator type have its own?
3. Is **`CanonicalMasteryState`** the starting point for that contract, or is it a
   chain-specific artifact that should stay where it is?
4. Should a Matchup state allow **asymmetric sides** (different levels, ranks, items), or is
   symmetry part of what a Matchup question is?
5. Should default builds be **dynamic references** ("the current recommended build for Ahri")
   or **materialized resolved states** ("these exact items, at this revision")? Where is the
   line between a **state template** and a **resolved state**?
6. What is the **authority for a default build, rune page, stat shards and skill order** — given
   none exists today? Is a curated whitelist acceptable as a default source, and how is its
   confidence exposed?
7. How should **custom/manual states** coexist with recommended/default ones — same contract,
   same identity scheme, same analytics?
8. What must a **frozen artifact** preserve — the rendered content only (today), the resolved
   state, the source values behind each answer, or a real patch id?
9. Should "patch" in a state mean a **`league_patches.patch_id`**, the current table-timestamp
   digest, or a certified descriptor — and must a state be resolvable **as of a past patch**
   (which the data layer cannot do today)?
10. Should **Full and Slice always consume the exact same candidate universe**, or may Full
    include candidates Slice never serves (e.g. every level, every rank)?
11. Does a **Full set** progress through **game states** (level 1 → 18, purchases, rank-ups — the
    Journey model), or through **topics** over a fixed state?
12. Which system is the **derivation authority** for a resolved state — Combat Lab's
    `build_runtime_champion_stats`, the chain calculation primitives, or something neither
    owns today — and whose failure semantics (zero-fill vs fail-closed) and level cap apply?
13. Are **runes, shards and item effects** in scope for derived state before they have
    versioned data, given Mastery currently excludes runes by declaration?
14. What happens to the **hand-authored Journeys** (Ahri/Syndra v2 is the live default) if a
    reusable state model exists — coexist, migrate, or retire?
15. Should the durable question ref key on the champion **slug** rather than the display name?

---

## 14. What this pass did not do

No state model, no generator redesign, no Full mode, no Slice behaviour change, no new Matchup
family, no tie-policy change, no Champion Mastery change, no Applied-chain change, no Combat
Lab change, no new data source, no schema change, no migration, no frontend UI change, no
runtime code change. The qca8 finding in §0 was measured and reported, not remedied.
Probes were read-only (`mode=ro`) and ran in throwaway worktrees; the local `lol_calc.db` was
not written.
