# Daily V2 — existing mode reuse matrix (lane D)

Baselines: frontend `mitcherrman/mogsy` main `9ca66118`, backend `mitcherrman/League_Combat_Simulator` master `a018bc0c`. The backend was read only (`git show` / `git grep` at that SHA). Nothing was run against a database, and nothing was deployed.

The `MOGZY_DAILY_V2_THREE_ACTS_SPEC_2026-10-20.md` spec was not available to this lane. Where an answer depends on it, it is listed as an open question (section 6) rather than guessed.

## 0. How Daily V2 reaches a renderer

Daily is a parent run. Each playable stage is a canonical Bot Ranked **child match**, and every graded answer is a **segment** of that match (`src/lib/daily-challenge/run/contracts.ts:1-22`). The arena picks a renderer per segment through `rendererForSegment` → `getModuleRenderer(module_id, module_version)` (`src/lib/ranked-core/modules/registry.ts:56-80`). The backend registry is the same idea: an exact `(module_id, version)` lookup that never falls back (`ranked_modules/registry.py:35-63`).

So Daily V2 adds **no renderer**. It needs:
- a format whose `SegmentSpec`s pin the pairs below (lanes B and E);
- a Daily allow-list on the client, so an off-list pair renders the shell's neutral unsupported state. That is `src/lib/daily-v2/adapters/modeReuse.ts`, which delegates to the registry and returns the registry's own object (the tests assert identity).

## 1. Compatibility table

| | `quiz` v2 (MCQ) | `item_cost_duel` v5 (Meta Reflex) | `order_forge` v2 | `mastery_slice` v2 (Journey) | Stat Drop |
|---|---|---|---|---|---|
| **Canonical source** | Shared quiz bank: `pool`/`families`, `runtime_family` or `question_ref:"quiz:<key>"` (`ranked_formats/schema.py:672-747`) | `meta_reflex_content.content_for(conn)` snapshot, `DECLARED_FAMILY_IDS` (`meta_reflex.py:822-858`, `schema.py:559-631`) | Same `meta_reflex_content` snapshot, plus OF5 exclusions (`order_forge.py:724-740,858-1113`). 14 families | `mastery/setup_state/data/journey_recipes.v1.json`. 14 servable recipes (5 `featured_launch` + 9 `p1_ready`) | **None.** A captured fixture of 6 rounds (`numeric_lab/fixtures/stat_drop_mig1_rounds.json`), marked "not re-certified" |
| **Backend module / version** | `QuizPointsModule` v2 (`quiz.py:353-394`) | `MetaReflexPointsModule` v5 (`meta_reflex.py:1263-1298`) | `OrderForgeV2Module` v2 (`order_forge.py:1653-1679`) | `MasterySlicePerChildModule` v2 (`mastery_slice.py:2493-2548`) | No module. `ranked_modules` has 0 hits for stat_drop/tolerance/closeness |
| **Config** | `{question_ref}`, `{runtime_family}` or `{pool, families}`. `challenge_count 1`, `timer_seconds`, `correct_points` | `{families}` or `{replay_target}`. `challenge_count` **any N** (>1 with card timers), `card_timer_seconds 6.0` | `{family, entry_count 4–6, min_gap, reveal_window_ms, role_scope, replay_target}`. `challenge_count 1`, `timer_seconds`, `correct_points`, `pressure_seconds 0` | `{journey_recipe_id, journey_recipe_version, journey_plan, journey_seed}`. `challenge_count` ∈ {3 survival, 5 standard} (`content_sets/products.py:91,348-354`). One clock per segment | — |
| **Public `segment_state`** | None: a quiz is unphased (`{"active":false}`). Public `question` `{question_id, prompt, options, category, topic, presentation, option_media}` | `challenges.challenges[] {challenge_index, prompt, kind, entity_kind, champion_level, left, right, left/right_card_id}`; no values | `{family, prompt, metric_label, direction_labels, challenges[0].entries[{entry_id,label,media}]}`; no values, no order | Per-child allow-list plus a `journey` block for the reached prefix only (`journey_cursor`) | — |
| **FE reader** | `readPublicRound` → `segment` (`LEGACY_SEGMENT` default) | `readSegmentBlock` → `{contract:"meta_reflex"}` | → `{contract:"order_forge"}` | → `{contract:"mastery_slice"}` + `journey` (`readJourneyJ3`) | — |
| **Existing FE renderer** | `quizModule` (`modules/quizModule.tsx`; serves any version) | `metaReflexModule` (`servesVersion ≥ 4`); counts from `challengeCount`, **no hard-coded 5** | `orderForgeModule` → `<OrderForge/>` (serves any version) | `masterySliceModule` → Journey stage; child count read from `journey.child_count` | `StatDrop` primitive only. Hosted by the lab renderer (`mig_lab.stat_drop`) and `StatDropGame` (bonus) outside Ranked |
| **Answer** | `{round_number, answer:int}`. Exact index (`quiz.py:252-262`) | `{card_id:"c<i>:left\|right"}`. Exact entity (`meta_reflex.py:1003-1019`); expiry counts as incorrect | `{order:[ids]}`. **One exact sequence**; `position_correct` is display only (`order_forge.py:470-478`) | `{selected}`. Exact match; numeric is exact at a declared precision, **not a tolerance** | Lab lock `{value}`; `graded:false` |
| **Server-graded response** | Resolved envelope: `correct_option_index`, `question_explanation`, `module_points` | `own_card_reveals[] {outcome, selected/correct_card_id, left/right {label, value_display}}`, 1500 ms reveal | `own_challenge_reveals[0].order_forge {order, canonical_order, is_correct, position_correct, entries.value_display}` | `own_challenge_reveals[] {is_correct, player_answer, correct_answer, correct_answer_display, explanation, combat_working, comparison_values}` | none |
| **Frozen review ref** | `quiz:<key>` on the round **and** on its one child row | `reflex:<family>\|<kind>\|<a>\|<b>\|<L>\|<target>` **per card** (child rows) | `order:<family>\|<n>\|<sorted ids>` per board (child row). The match-review round's `canonical_question_ref` is **null** (real capture) | `mastery:<candidate_key>` **per child** (child rows); the round row has none | none; nothing reaches Ranked, Daily, Review or Weak Areas |
| **Timer contract** | `timer_seconds` → `active_round.active_deadline` | `card_timer_ms` per card (6 s), server `own_card_deadline` | `timer_seconds` → `challenge_started_at/deadline` | Survival `card_timer_ms 30000` (the same value for every child); Standard pooled `active_time_ms 150000` | — |
| **Contract probe** | `modeReuse.test.ts` · quiz.v2 | `modeReuse.test.ts` · 3-card v5 block | `modeReuse.test.ts` · real capture `orderForgeServerCapture.json` (backend B3) | `modeReuse.test.ts` · real captures `jp5/ahri.survival`, `jp5/voli.standard` | `statDropHost.test.tsx` · proposed contract |
| **Readiness** | **Reusable** | **Reusable** (3 cards legal by config) | **Content-gated** | **Content-gated / release decision** | **Not servable** |

Backend citations come from the read-only inventory at `a018bc0c`. The full report with all file:line references is shared with lane E in the session notes (`lane-D-backend-module-inventory-a018bc0c.md`).

## 2. Per-mode findings

### quiz v2
- Reused as is. E/M/H timers (18/33/48 s) are plain `timer_seconds` values. Today's Splash uses 20/25/35 (`content_sets/fundamentals.py:36-57`), so V2 only changes config.
- One answer per round, with one `quiz:` ref on both the round and the child. Review/History/Weak Areas already key on it.

### item_cost_duel v5 — Meta Reflex sprint of 3
- `challenge_count: 3` is legal today (`choose_families(..., challenge_count)`). Precedent: the RB4A audit format uses 2 cards.
- The frontend renderer is count-agnostic. Progress, waiting copy and the sting all read `state.challengeCount`. The probe parses a 3-card v5 block and keeps the pre-reveal leak guard.
- Value display on settled cards is lane A's work (`metaReflexModule.tsx`). Lane D does not touch it.
- **Gap:** `wiring.py:1130` hard-codes `meta_reflex_cards: 5` in the client stage shape (E).

### order_forge v2 — ordering
- Grades exactly one sequence for 4–6 entries. The renderer reuses `<OrderForge/>` with no change.
- **R-OF-1 (content):** no Daily recipe uses Order Forge. Only `champion_stat:hp@lvl18` and `item_cost` are enabled in any preset (admin), although all 14 families were reported READY. A Daily slot needs an owner choice of family set, entry count, timer and points.
- **R-OF-2 (review):** the match-review round has `canonical_question_ref: null`. The durable `order:` ref lives only on the child row. Daily Review already replays `order:` refs (`wiring.py:489-545`), so this works if E keys Review/History on child rows, as it does for Mastery.
- **R-OF-3 (range family): missing.** The only range family is `champion_stat:attack-range` (champion basic-attack range). There is **no** ability, ward, Farsight, Lux or Ziggs range family; the grep returns nothing. Ziggs ability ranges exist only in the Rangefinder bonus fixture. This needs a new certified authority and family. **It must not be faked with a frontend sort.**

### mastery_slice v2 — Journey
- **A servable 3-child Journey exists.** All 14 servable recipes declare a 3-child `survival` plan, and Daily Survival serves it in production paths (`recipe.py:1006-1178`). The real capture `jp5/ahri.survival` reads `module_version 2`, `challenge_count 3`, `plan "survival"`, `card_timer_ms 30000`, and resolves to the existing `masterySliceModule`.
- The Daily **Standard** Journey has 5 children on a pooled 150 s clock (capture `jp5/voli.standard`). **It does not fit a 3-slot set**, and nothing here assumes it does.
- **Timer contract:** one clock per segment (`segment_flow.per_card_timer` is a scalar). A survival Journey gives every child the same answer window. **Per-child E/M/H windows of 18/33/48 s cannot be configured.** Only reveal windows (1750/4000/6000 ms) and beats vary per child.
- **Review refs:** correct. There is one `mastery:<candidate_key>` per child in `ranked_segment_child_results`, and Review re-asks one child via `replay_target` + `journey_target`.
- **Chaining:** later children depend on the canonical state and on earlier children's **correct** answers (revealed), never on what the player answered (`mastery/setup_state/journey.py:1975-1999`). Later premises can disclose earlier answers, which is why the public view stops at the reached prefix **inside one segment**.
- **Conflict with lane B's linked-set shape:** lane B models a linked set as 3 `slice_child` records, compiled as 3 segments. Splitting one Journey into 3 segments runs into three problems:
  - the backend locks Journey child count to {3, 5};
  - the reached-prefix cursor is per segment;
  - the Journey stage UI (beats, rail, Reasoning Chain) is per segment.

  What can be reused without new module work is **one 3-child survival Journey segment with a single per-child timer**. That shape is a release decision (O-2).
- No downgrade to generic MCQ is proposed.

### Stat Drop
- Primitive: `src/components/interaction-grammar/StatDrop.tsx`. It covers the slider, keyboard (arrows, PageUp/PageDown, Home/End, Enter), ±44 px buttons, reduced motion and the `aria-live` reveal. It is **ungraded by design**.
- The backend serves it only as an admin lab and a public bonus session: 6 fixture rounds, `graded:false`, in-memory sessions, plus a `public_mode_rounds` history row. There is no module id, no SegmentSpec, no canonical ref and no child record.
- Scales are stored per round in the fixture. Answer independence is asserted by a note, **not enforced in code**.
- Lane D adds **only** a proposed host contract (`src/lib/daily-v2/adapters/statDropHost.ts`):
  - **Public block** `{prompt, metric_label, unit, context, scale{min,max,step,decimals}, subject}`. The reader refuses any reveal-only key at any depth (`canonical_value`, `value_display`, `outcome`, `points`, `band`, `error`, …) and any malformed scale: min ≥ max, step ≤ 0, a step that does not divide the range, more than 2000 positions, or non-integer decimals.
  - **Reveal row** (inside `own_challenge_reveals[i].stat_drop`) `{selected, canonical_value, canonical_display, outcome, points, evidence, source}`. `outcome` and `points` are the **server's** values, relayed verbatim (`null` = ungraded), and are never passed into the primitive.
  - **Mappers** onto the existing `StatDropPublic` / `StatDropReveal`. Tests render the **unmodified** primitive in the open and revealed phases.
- **Answer-independent scale (server obligation, proposed):** bounds are a function of the **family's public range** (for example the min/max of that metric across the eligible entity set at the frozen patch, rounded outward to the step). They are never a function of the hidden value. A server test should assert that every round in a family shares one scale, or that the scale is identical when the answer is swapped.
- **Closeness bands: OWNER DECISION (O-1). Options, not picked:**
  - (a) **Absolute band** per family, e.g. within ±k steps = correct. Simple, but unfair across magnitudes.
  - (b) **Relative band**, e.g. |err|/value ≤ p%. Matches the bonus feedback's `relative_error`, but behaves badly near 0.
  - (c) **Tiered closeness** (exact / close / off → 3/2/0 points) using (a) or (b). Richer, but it is a points redesign (E: "no score redesign without approval").
  - (d) **Exact at displayed precision only.** Equal to Mastery numeric; a slider makes it a near-guess.
  - (e) **Keep ungraded** and exclude Stat Drop from the 21 graded answers.

## 3. Missing-readiness list

| ID | Gap | Owner |
|---|---|---|
| R-SD-1 | No Ranked `stat_drop` module (scorer, canonical source, scale authority, child refs, Review/Weak Areas path) | backend + O-1 |
| R-SD-2 | Stat Drop content is 6 non-recertified fixture rounds; no canonical feed | C / backend |
| R-SD-3 | FE: no segment-driven `statDropModule` renderer, no `stat_drop` branch in `readSegmentBlock` / `readChallengeReveals` / review reader | E (diff plan in handoff) |
| R-OF-1 | Order Forge in no Daily recipe; 2 of 14 families enabled | B/E + owner |
| R-OF-2 | Order Forge review round `canonical_question_ref` null (ref on child row only) | E |
| R-OF-3 | No ability/ward/Farsight range family (only champion attack range) | C + owner (new authority) |
| R-MS-1 | 3-child Journey is Survival-plan only, with one per-child timer (30 s today); no per-child E/M/H windows | O-2 |
| R-MS-2 | Lane B's 3-segment linked set does not match Journey's single-segment chaining | B/E |
| R-MR-1 | `meta_reflex_cards: 5` hard-coded in the stage shape (`wiring.py:1130`) | E |
| R-GEN-1 | Daily shapes are V1 constants; V2 needs a new recipe version, `PLAN_VERSION` bump and client shape | E |
| R-GEN-2 | Review replay of a slice child pays 1 (+1) where a Splash pays 2–3 (`wiring.py:515-523`) | owner (existing open item) |

## 4. Owner decisions needed

- **O-1** Stat Drop tolerance/closeness: options (a)–(e) above, or exclude it from V2 MVP.
- **O-2** Journey in V2: include **one** 3-child Survival-plan Journey as a set, with one answer window per child (30 s today, or a single owner-chosen value), and accept that its children do not get separate E/M/H timers. The alternative is to hold Journey out of V2 MVP as an explicit release decision. No MCQ substitute.
- **O-3** Order Forge families for Daily (which of the 14 READY families, entry count, timer, points). Range ordering needs a new certified family first.

## 5. Probes and evidence

- `src/lib/daily-v2/adapters/modeReuse.test.ts`: 14 tests, one probe per mode plus fail-closed checks. All inputs are fixtures; no network.
- `src/lib/daily-v2/adapters/statDropHost.test.tsx`: 30 tests.
- Commands and output are in `DAILY_V2_LANE_D_HANDOFF.md`.

## 6. Open questions (some depend on the spec)

1. Spec: are Daily V2 E/M/H timers per **answer** or per **set**? This decides whether a fixed-window Journey can stand in for a set.
2. Spec: is Stat Drop part of the 21 graded answers, or a bonus?
3. Spec: does a set carry a set-level score (for example all 3 correct), or is each answer independent? The Journey's `slice_points` speed bonus fires only when every child is correct.
4. Spec: which content examples need Order Forge (ranges?), and do any assume a range family exists?
5. Should a Journey set count as a set position (E/M/H), or as a set of its own outside E/M/H?
6. Does V2's "position/timer frozen per slot" allow one segment to cover three slots (Journey), or must slots map 1:1 to segments?
