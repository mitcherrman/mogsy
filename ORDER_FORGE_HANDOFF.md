# ORDER FORGE — Handoff (OF1)

## Objective

Ship **Order Forge**, Mogzy's first structured-response interaction. The
player gets 4–6 cards, drags them into the correct order and locks the
sequence. The server generates and grades the round. The act of building the
sequence *is* the answer: this is not multiple choice, not Meta Reflex, not
Data Duel, and not five separate questions.

This workstream covers Order Forge only. Reconstruct, Scrub, Match Grid and
Stat Drop come later. Graph Hunt is rejected.

## Decisions

### Locked by the owner
- Objective facts only; 4–6 entries; strict total order; **no ties in V1**.
- Generation and grading happen on the server. The client never sees the
  canonical order before it submits.
- The client submits an ordered list of opaque entry ids. Only the exact
  sequence counts as correct.
- The reveal shows the player's order next to the canonical order.
- Reuse the existing points, timers, history, review, Ranked shell and result
  infrastructure. No new arena, scoring system, runtime or history system.
- Add the smallest structured-response capability that Order Forge needs. Do
  not build a generic framework.

### Made by this audit (OF1-0)
| # | Decision | Why |
|---|---|---|
| D1 | Order Forge is a **new RoundModule `order_forge` v1** with `challenge_count = 1` and `legacy_quiz = None`. | A module with a payload always takes the phased multi-challenge path (`service.py:1642`), even with one challenge. `mastery_slice` already runs one challenge on that path, so the storage, index gate, idempotency, bot driver and resolution all come for free. |
| D2 | The wire choice is `{"order": [id, …]}`. It is a new, fourth spelling in `SegmentChallengeIn`, and exactly one of the four is allowed. | The key name `order` is not in `FORBIDDEN_PRE_REVEAL_KEYS` (`answer_safety.py:23`). The choice is echoed back pre-reveal as `own_submitted_choices`, so it **must not** be named `answer`. |
| D3 | Entry ids are **positional tokens in the display order the server shuffled** (`"e0"…"e5"`). They carry no entity names. | An id derived from rank or entity would leak the answer. A seeded shuffle that equals the canonical order is re-rolled. That leaks only that one of the 120 orderings is wrong, which is acceptable. |
| D4 | Exact-sequence grading only. The reveal shows per-position correctness, but **no partial credit**. | V1 rule. The per-position marks are for display only and derived in the same pass as the grade. |
| D5 | Points: `correct_points` for an exact match, plus a speed bonus when the player was strictly faster (`points.single_points` / `strictly_faster`). Speed comes from `context["durations_ms"][pid][0]`. | The phased path supplies ms `durations_ms`, not quiz's µs `response_us`. The reveal must satisfy `points_view.resolved_scoring` (`scoring:"points"`, `base + bonus == awarded`). |
| D6 | The in-viewport reveal uses the **existing Mastery per-challenge reveal path**: `supports_challenge_reveals = True`, `challenge_reveals(...)`, and a `reveal_window_ms` frozen in the public payload. | This path already exists (`service.py:4810-4847`) and is lifted out of the pre-reveal guard. The player sees their own reveal only after locking. The opponent never sees it pre-resolution. |
| D7 | `declares_child_refs = False` in V1. Each player gets one `ChildOutcome` with `canonical_question_ref=None`, `family="order_forge:item_cost"` and `answer=[ids]`. | Nothing in Ranked play checks the refs flag. The only consequence is that Daily refuses the format (`wiring.py:229`) and learning attempts skip the round. An `order:` ref namespace is a later task. |
| D8 | The first proof surface is an **admin-only session preset** (`status="test"`, `rating_eligible=False`), modelled on `zed_ahri_reference_journey_format`. | This is the least invasive option. The frontend `joinQueue` already sends `preset`. It does not touch the public ladder, Daily or Practice. |
| D9 | The first content family is **item gold cost, cheapest → most expensive**, 5 entries. It uses the Item Cost Duel pool (`ranked_item_catalog.load_duel_item_pool`), requires pairwise-distinct costs with a minimum gap of **≥ 100 g**, and fails closed with `RANKED_MODULE_DATA_UNAVAILABLE`. | This pool is already proven in production and already has media and integer `shop_price`. Duplicate prices are common, so the distinct-value filter and minimum gap are mandatory. Champion stats and ability cooldowns tie too often for V1. |
| D10 | The input primitive is a new **MIG primitive `OrderForge`** in the interaction-grammar layer, with a `*Public` / `*Reveal` type boundary. `orderForgeModule` hosts it. | This is the same seam Data Duel (DD1) uses. The primitive never grades, and the caller owns the phase. |
| D11 | Drag and drop uses **framer-motion `Reorder`**, which is already a dependency (`^12.34.3`). The drag starts from a grip handle with `touch-action:none`, and every card also has ▲/▼ buttons. | This adds no dependency. The page still scrolls on phones because only the handle captures touch. The buttons cover keyboard, screen-reader and reduced-motion users. |

## Verified baseline (read from origin, 2026-09-29)

- **Frontend:** `origin/main` @ `cb2ccff7`.
  - Worktree: `mogsy/.worktrees/of1-order-forge`, branch `of1/order-forge`.
  - ⚠ Local `main` is **14 ahead / 255 behind** origin. Its unpushed commits are the ranked-hub mobile parchment work. Do not branch from local `main`.
- **Backend:** `origin/master` @ `1002230a`.
  - Worktree: `League_Combat_Simulator/.worktrees/of1-order-forge`, branch `of1/order-forge`.
  - ⚠ Local `master` is 132 behind origin.
- Both primary checkouts sit on `envvis1-batch1-scene-channel` with unrelated uncommitted edits. They were not touched.

The brief's architecture claims hold on origin:
- `CanonicalArena` and `ModuleRenderer` exist; the registry is at `src/lib/ranked-core/modules/registry.ts`.
- The quiz, Meta Reflex (`item_cost_duel` v4+), Item Cost Duel and Mastery Slice renderers exist.
- `SegmentChoice` is `{itemId}|{cardId}|{selected: scalar}` (`client.ts:510`).
- The backend has a version-pinned registry (`ranked_modules/registry.py`) and the `GeneratedSegment` public/private split and `SegmentResolution` (`ranked_modules/contract.py`).
- `SegmentChallengeIn` accepts exactly one of `item_id`, `card_id` or `selected` (`schemas/ranked_public_schemas.py:172`).

## Design

### 1. Frontend changes

| File | Change |
|---|---|
| `src/lib/ranked-public/client.ts:510-537` | Add `\| { order: readonly string[] }` to `SegmentChoice`. The serializer gets an explicit `order` branch. The `item_id` branch becomes explicit too, not a fall-through, so no new variant can silently send `item_id: undefined`. |
| `src/lib/ranked-public/contracts.ts` | 1. **`readSegmentBlock` (:1293):** dispatch `order_forge` on `moduleId` *before* the version fall-through. Add a `SegmentBlockView` variant `{contract:"order_forge", prompt, metricLabel, directionLabels, entries[]}`. Today an unknown id falls to `item_cost` and throws on `left`. 2. **`readSubmittedChoices` (:1331):** add an `order_forge` branch that reads the `order` list. Widen the element type from `string\|null` to `string\|readonly string[]\|null`, and audit the few consumers. 3. **`ownChallengeReveals` reader:** add an `order_forge` shape. 4. **`readSegmentReveal` (:1731):** add an `order_forge` challenge branch, because today's is left/right only and `choices` is parsed with `nstr`. 5. **`readMatchReview` (:2424):** add `kind:"order_forge"`, because an unknown kind currently throws for the *whole* review. |
| `src/lib/interaction-grammar/types.ts` | Add `OrderForgePublic`, `OrderForgeReveal` and `OrderForgeResponse = {order: readonly string[]}`, with the compile-time `extends SegmentChoice` assertion. Update the "scalar subset" header comment. |
| `src/components/interaction-grammar/OrderForge.tsx` *(new)* | The primitive. Props: `content`, `phase`, `value` (order), `onChange`, `onLock`, `reveal`. |
| `src/lib/ranked-core/modules/orderForgeModule.tsx` *(new)* | `ownsSubmission:true`, `projectQuestion:()=>null`, and a `summaryLabel`. The Viewport maps `segmentState.block` to `OrderForgePublic` and keeps the local order keyed on `(segmentNumber, challengeIndex)`, not on snapshot identity, because the arena re-renders every second. Lock calls `actions.submitChallenge(0,{order})`, and pending is released when that returns `false`. The reveal comes from `ownChallengeReveals`. |
| `src/lib/ranked-core/modules/registry.ts` | Add `[ORDER_FORGE_MODULE_ID]: [orderForgeModule]`. |
| Label helpers | Add an `order_forge` case to `SegmentTranscript.segmentTitle` (an unknown id currently falls to "Item Cost Duel"), `centralStage.liveModuleTitle`, `rankedResultsModel.moduleSubject`, `ModuleSigil`, `questionIcons`, `QuestionReviewCard` (new `OrderForgeBody`) and `reviewRoles`. |
| `src/lib/ranked-public/fixtures.ts`, `src/pages/dev/ranked-shell-probe/RankedShellProbe.tsx` | Add `orderForgeSegmentMeta` and `orderForgeState` builders, plus a `?q=orderforge` probe state that renders through the real `QuizRankedMatch`. |

**Unchanged:** `CanonicalArena`, `ArenaShell`, `QuizRankedMatch`, `useRankedMatch` and the timers. The header timer already derives from `activeRound.activeDeadline`.

### 2. Backend changes

| File | Change |
|---|---|
| `ranked_modules/order_forge.py` *(new)* | `OrderForgeModule` v1. See §4 and §5. Flags: `supports_points_scoring=True`, `supports_challenge_reveals=True`, `declares_child_refs=False`, `supports_per_card_timers=False`. It must also define `bot_schedule`: the phased bot driver calls it directly (`service.py:4144`) even though it is not in the Protocol. Copy the shape from `item_cost_duel.py:470`. |
| `ranked_modules/registry.py` | `register(OrderForgeModule())`. |
| `ranked_modules/contract.py` | Doc-only: `ChildOutcome.answer` is JSON-serializable. It is no longer "a JSON scalar", because the column is `answer_json TEXT` and the field is typed `Any`. |
| `schemas/ranked_public_schemas.py:172-234` | Add `order: Optional[List[StrictStr]]`, with 4–6 items of 1–16 characters each. Extend the exactly-one rule and its message to four spellings, and add an `as_choice` branch. |
| `ranked_public/service.py` | In `_generate_segment` (:1814-1893), add an `order_forge` branch that injects `item_pool` (reuse `_item_pool`) and the frozen `reveal_window_ms`. Add a preset constant to `PRESET_FORMATS` and `ADMIN_ONLY_PRESETS` (:459-467). |
| `ranked_formats/schema.py` | Add an `order_forge` `module_config` validator: `family ∈ {"item_cost"}`, `entry_count ∈ 4..6`, `min_gap`. **Today an unknown module's config is accepted without validation.** Add the preset format (`status="test"`, `rating_eligible=False`, and 3 order_forge segments with `timer_seconds≈30`). |
| `ranked_public/readiness.py:713` | `assert_format_servable`: the item pool must yield at least `entry_count` distinct costs with the minimum gap. |
| `ranked_public/review.py:656-695` | Add an `_order_forge_round` branch, gated on `revealed`: `entries[{entry_id,label,media,value_display}]`, `viewer_order`, `canonical_order`, `outcome`, `position_correct[]`. Today an unknown id falls to `_quiz_round`, which gives a blank round. |
| `ranked_public/projections.py:163` | Optional: add a `_PRESET_BY_FORMAT_ID` entry. |

**Unchanged:** routes, persistence, migrations, `segment_flow`, `points.py`, `points_view`, the quiz path and `ranked_submissions`.

### 3. Wire format

```http
POST /api/ranked/matches/{id}/segments/{n}/challenges/0
{"order": ["e3", "e0", "e4", "e1", "e2"]}
```

The request rules:
- `extra="forbid"`: the body carries no timing, correctness or index; the index is in the path.
- The body carries exactly one of `item_id`, `card_id`, `selected` or `order`.
- The body is stored verbatim as `ranked_segment_challenges.choice_json`, a TEXT column with no shape CHECK.
- An idempotent retry compares `json.loads(stored) != choice`, which is order-sensitive. That is correct: a reordered resubmit is a conflict, not a new answer.

### 4. Public and private payload

**Public** (frozen `segment_payload_json`, projected through `public_view()`):

```json
{
  "family": "item_cost",
  "prompt": "Order these items by gold cost",
  "metric_label": "Gold cost",
  "direction_labels": {"first": "Cheapest", "last": "Most expensive"},
  "reveal_window_ms": 2500,
  "challenges": [{
    "challenge_index": 0,
    "entries": [
      {"entry_id": "e0", "label": "Kindlegem", "media": {"src": "…", "alt": ""}}
    ]
  }]
}
```

- Entries are listed in the shuffled display order.
- The public payload holds **no value, cost, rank or ordering field.** It must also pass `assert_pre_reveal_safe`, which forbids `cost`, `price`, `answer`, `correct`, `value_display`, `gap`, `result`, `metadata` and others.
- `challenges` stays a list of dicts, because `segment_reveal_items` (`service.py:4895`) walks it with `.get`.

**Private** (`segment_private_json`, which is never projected pre-resolution):

```json
{
  "canonical_order": ["e3", "e0", "e4", "e1", "e2"],
  "values":        {"e0": 800, "e1": 2600, "…": 0},
  "value_display": {"e0": "800 g", "…": ""},
  "entity_ids":    {"e0": "3067", "…": ""},
  "source": "item_canonical.shop_price"
}
```

Generation is a pure function of `(seed, match_id, segment_number, config, item_pool)`:
1. Pick N items with pairwise-distinct costs and adjacent gaps of at least the minimum.
2. Take the canonical order as ascending cost.
3. Shuffle the display order with a seed, and re-roll if it equals the canonical order.
4. Fail closed if the pool cannot satisfy these constraints.

### 5. Validation and grading

`validate_challenge_input` raises `RANKED_INVALID_ANSWER` unless:
- `raw_choice` is a dict whose only key is `order`,
- `order` is a list of strings,
- it has the same length as the public entries, with no duplicates, and
- its set equals the set of public entry ids.

It also refuses `item_id`, `card_id` and `selected` by name.

`challenge_is_correct` is `raw["order"] == private["canonical_order"]`.

`resolve_segment` works as follows:
- **Outcome:** no submission → `timeout`; exact match → `correct`; anything else → `incorrect`.
- **Points:** `correct_points` comes from `context["points"]`. If it is absent, fail closed with `RANKED_MODULE_STATE`, as quiz v2 does. The speed bonus applies only when the player is correct **and** strictly faster on `durations_ms[pid][0]`. Durations are whole ms, so ties are slightly more common than on quiz; a tie gives no bonus.
- **Reveal:**
  - `{module_id, module_version, scoring:"points", correct_points, speed_bonus_points, canonical_order, entries:[{entry_id,label,value_display}]}`
  - `players:{pid:{order, position_correct[], base_points, speed_bonus_points, points_awarded, finished_first, duration_ms}}`
- **Children:** one `ChildOutcome` per player. `answer` is the submitted list, and `family` is `"order_forge:item_cost"`.
- The whole result is a pure function, so it replays identically.

`challenge_reveals(answered=[0], choices)` returns the same per-player slice for the viewer only: their order, the canonical order, the value displays and `position_correct`.

The bot answers the canonical order with probability `BOT_ANSWER_ACCURACY` (0.75), using a deterministic `_unit(seed, n, "of", 0)`. Otherwise it swaps one adjacent pair chosen by a seed, which is always a valid permutation. It submits through the same `validate_challenge_input`.

### 6. History and review

- **Raw truth:** `choice_json` holds `{"order":[…]}`. The child record's `answer_json` holds `[…]`. Both need no migration.
- **Match review:** `review.py` gets a new `order_forge` round kind. The frontend `readMatchReview` and `QuestionReviewCard.OrderForgeBody` render two columns: *Your order* and *Correct order*. Each row shows the item and its gold value, with a ✓ or ✗ for each position.
- **Result and transcript:** the frontend `readSegmentReveal` gets an `order_forge` branch, and `SegmentTranscript` shows a compact "4/5 in place — ✗" line.
- **Not in V1:** learning attempts, Weak Areas, Daily replay and the `order:` ref namespace. These need `declares_child_refs`, a `discovery._REF_PREFIXES` entry and a replay planner.
- `history/personal.unit_of` returns `None` for the new module, which is harmless. Personal history will not group these rounds as units until a later task adds a case.

### 7. How ModuleRenderer fits into CanonicalArena

`QuizRankedMatch` resolves `rendererForSegment(surfaceRound.segment)`. Because `ownsSubmission` is true, the arena:
- hides the quiz answer flow and ability tray,
- mounts `<Viewport … segmentState actions skewMs />` in `ranked-question-body`, and
- keeps the header timer, HUD, forfeit, result beats and points.

Phases inside the Viewport:

| Viewport state | Phase |
|---|---|
| open | `phase="open"` (drag enabled) |
| pending submit | `"locked"` |
| after `ownNextChallengeIndex > 0` | `"locked"` + "waiting for opponent" |
| `ownChallengeReveals[0]` present | `"revealed"` |

A refused submit (the promise resolves `false`) reopens the input. **No arena file changes.**

### 8. Mobile drag and reorder

- The layout is one vertical column of 4–6 rows, about 56 px each (6 × 56 plus a header fits a 360×740 viewport). A rank rail runs down the left side, labelled "Cheapest" at the top and "Most expensive" at the bottom.
- Drag uses `Reorder.Group axis="y"` with `Reorder.Item dragListener={false}`. `useDragControls` starts from a ≥44 px grip handle styled `touch-action:none`. The card body keeps `touch-pan-y`, so the page still scrolls on phones, which have no inner scroller (`data-phone-arena`).
- **Alternatives to drag:** ▲/▼ buttons on every row (≥44 px). These are also the keyboard and screen-reader path. An `aria-live` region announces "Kindlegem moved to position 2 of 5".
- **Reduced motion:** use `useReducedMotionPreference()`, which covers both the OS setting and the in-app setting. When it is on, the layout transition duration is 0.
- **Lock:** a full-width button, always enabled. Locking the initial order is allowed.
- **Deadline:** the client does not auto-submit at the deadline. Server authority means an unlocked round is a `timeout`, which matches every other module.
- **Reveal:** the player's order stays in place with a ✓ or ✗ on each row and each value shown. A "Correct order" column (a stacked list on phones) shows the canonical sequence.
- **Fit certification:** add `orderforge` to `e2e/ranked-arena-fit.spec.ts` for desktop and for 360×740 and 360×800 touch viewports. The desktop question panel is `overflow-hidden` and height-locked.

### 9. First content family

**Item gold cost, cheapest → most expensive, 5 entries, minimum gap 100 g**, drawn from `load_duel_item_pool`.

Rejected for V1:
- **Champion base stats.** The values are rounded to integers (false ties), and move speed and range have few distinct values.
- **Ability cooldowns.** They are rank strings with frequent ties and have no provider.
- **Pro Play metrics.** They need a separate authority.

### 10. Tests

**Backend** (`python -m pytest …`, all at the repo root):
- `test_order_forge_module.py` *(new)*:
  - Generation is deterministic and has distinct values with the minimum gap.
  - The shuffle is never the canonical order, and it fails closed on a thin pool.
  - The public payload passes `assert_pre_reveal_safe` and contains no value, rank or entity id.
  - Validation refuses duplicates, a wrong length, unknown ids, extra keys and the other three spellings.
  - Exact match grades correct, and any single swap grades incorrect.
  - Timeout; points and speed bonus, including the equal-ms case; the reveal shape satisfies `points_view.resolved_scoring`.
  - Children validate.
  - The bot always sends a valid permutation, is deterministic and hits roughly 75 %.
  - Replay yields identical results.
- `test_order_forge_flow.py` *(new)*, run through the service against SQLite:
  - Preset match creation (admin-only; refused for non-admins).
  - Submit, then a conflicting resubmit.
  - `own_submitted_choices` echo, pre-reveal safety of the `segment_state`, and `own_challenge_reveals` present only after locking.
  - Resolution and points; the review round contents.
- Updates to existing tests:
  - `test_ranked_modules_quiz_parity.py`: registry pin and engine-import boundary.
  - `test_ranked_live_blockers.py`: `SegmentChallengeIn` spellings.
  - `test_ranked_playtest_preset.py`.
  - Schema validator tests.

**Frontend** (`npm test`; Playwright with `-c playwright.arena.config.ts`):
- `OrderForge.test.tsx`:
  - ▲/▼ reorder and the `aria-live` announcement.
  - Lock emits `{order}`; `locked` and `revealed` disable input.
  - The reveal renders ✓/✗ from the supplied reveal only.
  - The primitive never renders a value before reveal.
- `orderForgeModule.test.tsx`:
  - Submits `(0,{order})`, and pending is released on `false`.
  - Local order survives a re-render with a new snapshot object.
  - Renders the reveal from `ownChallengeReveals`.
- Contracts tests:
  - `readSegmentBlock`, `readSubmittedChoices`, `readSegmentReveal` and `readMatchReview` for `order_forge`.
  - A payload with forbidden keys throws.
- `client` serializer test: `order` goes out as `{order:[…]}` and never as `item_id`.
- `registry.test.ts`: update the id list.
- Keep the boundary tests green: `CanonicalArena.boundary`, `sharedLayer.boundary` and the `masterySlice.generic` vocabulary scan.
- `e2e/ranked-arena-fit.spec.ts`: add `?q=orderforge` at desktop and phone sizes.

### 11. Risks: what is unsafe or invasive

1. **Stale local trunks.** Local `main` and `master` are far behind origin. Always branch from `origin/main` and `origin/master`.
2. **Old clients cannot parse the new module.** The frontend readers throw for an unknown module id ("This match needs a newer client"); they do not show the arena's unsupported-module panel. **Deploy the frontend before exposing any format that contains `order_forge`.** The admin-only preset keeps the blast radius to admins.
3. **Unvalidated config.** A new module's `module_config` is accepted without validation. The validator must land with the module.
4. **Hidden requirement.** `bot_schedule` is required by the phased bot but is not in the Protocol, so a missing method fails only at runtime. Cover it with a test.
5. **Pre-reveal guard.** The name-based guard applies at every depth. Public card fields and the choice key must avoid forbidden names such as `cost`, `price`, `answer`, `value_display` and `gap`. `order`, `entries` and `entry_id` are safe.
6. **Ties in the data.** Duplicate prices are common, so the distinct-value filter plus minimum gap and fail-closed behaviour are mandatory, and readiness must check for them.
7. **Review fallback.** Review silently falls back to a blank quiz round for an unknown module, so the review branch must ship in the same slice.
8. **Widened choice type.** `ownSubmittedChoices` changes from `string|null` to include `readonly string[]`. Audit its consumers; this is the only cross-module type change on the frontend.
9. **Not invasive:** DB and migrations, routes, the scoring engine, `points_view`, the arena, `QuizRankedMatch`, timers and the quiz path are all untouched.

## Current state

- **OF1-C (integration and certification): DONE. Verdict and the FINAL contract are in the last section, "OF1-C", which supersedes every shape written earlier in this file.**
- **OF1-A (backend): DONE**, commits a7e5fdbd, 55c7fd85, then the OF1-C fixes 48c5092a and 4ffff8f5. Not deployed.
- **OF1-B (frontend): DONE**, commits 6ffa725f, a022eb06, then the OF1-C commit `45d0daec`. Not deployed.
- Historical: the backend had no commits when OF1-B ran, so OF1-B was built against assumed shapes. OF1-C checked those against real server bytes and found three mismatches in the settled reveal (fixed on the backend).

## OF1-A: backend implementation (DONE)

**Backend repo** `League_Combat_Simulator`, worktree `.worktrees/of1-order-forge`, branch `of1/order-forge`, commits **`a7e5fdbd`** (implementation) and **`55c7fd85514b83ad2ac5acc1e04c4fe2e8d2a935`** (review flattening + `segment_result`), on top of origin/master `1002230a`. Not deployed. Frontend repo untouched.

### Files changed
- `ranked_modules/order_forge.py` (new): `OrderForgeModule` v1, config parser, item-pool validator, generator.
- `ranked_modules/registry.py`: registers it. `ranked_modules/contract.py`: doc-only (`ChildOutcome.answer` is JSON-serializable).
- `schemas/ranked_public_schemas.py`: `order` field (4-6 strings, 1-16 chars each); exactly-one-of-four rule; `as_choice` branch. `routes/ranked_public.py`: docstring only.
- `ranked_formats/schema.py`: `_validate_order_forge_config`, `order_forge_test_format()`.
- `ranked_public/service.py`: `PRESET_ORDER_FORGE = "admin.order_forge"` in `PRESET_FORMATS` and `ADMIN_ONLY_PRESETS`; `item_pool` injected in `_generate_segment`.
- `ranked_public/readiness.py`: pre-launch item-data check (`_order_forge_readiness`, wired into the report and `assert_format_servable`).
- `ranked_public/review.py`: `order_forge` round kind. `ranked_public/projections.py`: format id -> preset name.
- Tests: `test_order_forge_module.py` (91), `test_order_forge_flow.py` (41), pins updated in `test_ranked_modules_quiz_parity.py` and `test_jref2_admin_reference_journey_preset.py`.

### Wire contract as implemented
`POST /api/ranked/matches/{id}/segments/{n}/challenges/0` with `{"order": ["e3","e0","e4","e1","e2"]}`. Body allows exactly one of `item_id|card_id|selected|order`; `extra=forbid`. Order must list every public entry id exactly once. Errors: 422 from the schema (length/shape/extra keys); `RANKED_INVALID_CHOICE` for wrong ids, dupes, other spellings, forbidden fields (**not** `RANKED_INVALID_ANSWER` as the design said; that code does not exist, the codebase uses `RANKED_INVALID_CHOICE`); `RANKED_WRONG_CHALLENGE_INDEX` for index != 0 (checked before the module).

Submit response (existing shape): `{status, match_id, segment_number, challenge_index, idempotent, conflicting, segment_resolved, next_challenge_index, reveal_window_ms, challenge_reveal}`. A reordered resubmit returns `idempotent:true, conflicting:true` and the reveal of the ORIGINAL stored order.

`segment_state` (module_id `order_forge`, module_version 1): `challenges` is the public view:
`{family:"item_cost", prompt, metric_label, direction_labels:{first:"Cheapest", last:"Most expensive"}, challenges:[{challenge_index:0, entries:[{entry_id:"e0", label, media:{src, alt:""}|null}, ...]}], reveal_window_ms}`. `media.src` is the repo-relative `asset_path` (the value Item Cost Duel sent as `asset_path`); the frontend must resolve it as it does for ICD. `own_submitted_choices: [null | {order:[...]}]`; `own_challenge_reveals: []` until locked, then one entry:
`{challenge_index:0, order, is_correct, position_correct:[bool], canonical_order:[ids], entries:[{entry_id,label,value_display}] (canonical order)}`. `reveal_window_ms` is also top-level on segment_state.

Resolved settlement `segment_reveal` (**as of 55c7fd85; superseded by OF1-C, which added `challenge_count`, the tallies and the win/loss vocabulary; see the last section**): `{module_id, module_version, scoring:"points", correct_points, speed_bonus_points, canonical_order, entries:[{entry_id,label,value_display}], players:{pid:{order|null, position_correct, base_points, speed_bonus_points, points_awarded, finished_first, duration_ms}}}`. Both players' orders are visible after resolution (as with other modules). `module_points` is filled by `points_view` as usual.

Review round (`kind:"order_forge"`), fields at ROUND level (no `challenges` nesting): `family, prompt, metric_label, direction_labels, entries:[{entry_id,label,media,value_display}] (display order), viewer_order, canonical_order, position_correct, outcome:"correct"|"incorrect"|"timeout", is_correct`, plus the usual `viewer_submission` counts. `canonical_order`, `position_correct`, `outcome`, `is_correct` and every `value_display` are null unless the round resolved.

### Behaviour notes
- Points: 2 for an exact sequence, +1 only if correct and strictly faster (whole ms; ties give none). No partial credit; per-position marks are display only. Timeout: 0.
- Preset: 3 x order_forge, `timer_seconds=30`, `pressure_seconds=0.0`, `status=test`, `rating_eligible=False`, `match_length=3`. Admin-only at the route (403 `RANKED_PRESET_NOT_AUTHORIZED` otherwise).
- Bot: 75% canonical, else one adjacent swap; recorded think time 6-12s via `bot_schedule` (tested).
- Generation fails closed with `RANKED_MODULE_DATA_UNAVAILABLE`; readiness refuses creation (`FORMAT_UNSERVABLE`) if the pool cannot supply 5 items with prices >= 100g apart and image paths.

### Deviations from the design (code contradicted it)
1. Error code `RANKED_INVALID_CHOICE`, not `RANKED_INVALID_ANSWER`.
2. `reveal_window_ms` is frozen from the format's `module_config` (preset uses 2500; 0 omits it and disables compensation), not injected from the Mastery env gate `mastery_reveal_window_ms()`. Only an admin-only format can reach it. For a single challenge, reveal compensation adds 0s to the deadline.
3. New schema rule: an `order_forge` segment must declare `pressure_seconds` explicitly. Left unset, the engine's default 5s pressure shortening fires during settlement feed and rejects a human who locked in the last 5 seconds (reproduced). The preset sets 0.0.
4. Private payload is flat (one challenge) and includes `labels`, so resolution and reveal need no public payload.

### Tests / results
- New + pinned files run together: 165 passed, 4 skipped (`test_order_forge_module.py`, `test_order_forge_flow.py`, `test_ranked_modules_quiz_parity.py`, `test_jref2_admin_reference_journey_preset.py`). One failure in that run, `test_jref2...::test_an_ordinary_bot_match_is_unchanged`, also fails on the baseline.
- Full backend suite (`python -m pytest -q --continue-on-collection-errors`, ~57 min): 25,794 passed, 5,343 failed, 346 errors, 1,346 skipped. This environment's DB lacks many canonical tables, so thousands of failures are unrelated to this work, and 6 files fail collection (`test_quiz1_per_card_timers.py`, `test_quiz1_meta_reflex_additive.py`, `test_champion_onhit_runtime.py`, `test_item_effect_loader.py`, `test_item_support_runtime_batch_13.py`, `engine_tests/test_sim2_attack_speed_authority.py`).
- To attribute failures I re-ran the 50 ranked/format/quiz/preset-related files that had failures on a clean baseline (stash): 606 failures before vs 608 after. Of the 7 differences, one was real (a preset-set pin in `test_jref2_...`, since fixed); the other 6 pass in isolation and are order/environment-dependent. I did NOT run the whole suite on the baseline, so failures outside those files are not individually attributed.

### Reconciliation with OF1-B assumptions 1-6 (checked against the backend as committed)
1. Matches, incl. `media:{src,alt}|null` and `reveal_window_ms` inside `challenges` (also top-level on segment_state).
2. Matches.
3. Matches: `{challenge_index, order, is_correct, position_correct, canonical_order, entries:[{entry_id,label,value_display}]}` (list form, not a map).
4. **Did NOT match (found by OF1-C, fixed in 48c5092a / 4ffff8f5).** This line claimed a match with `segment_result` as `correct|incorrect|timeout`; the frontend reader accepts only Ranked's `win|loss|draw|timeout`, requires `segment_reveal.challenge_count`, and reads `correct/incorrect/unanswered`. See the last section.
5. Matches after 55c7fd85 (round-level fields). `viewer_submission` is populated (correct_count 0/1 once resolved), not all-null.
6. Yes. Note the backend keeps the reveal window as a frozen 2500 ms in the preset.
No frontend field renames should be needed; still run the OF1-C flow with the real serializer bytes.

### For the frontend (OF1-B)
Section 1 stands, with these adjustments: `SegmentBlockView` reads `entries[].media.{src,alt}`; reveal `entries` are in CANONICAL order while review `entries` are in DISPLAY order; `readSubmittedChoices` elements are `{order:[...]}` objects; the preset name for `joinQueue` is `admin.order_forge` and `session_preset` reports the same. Unknown-module readers still throw, so deploy the frontend first.

### Remaining integration risks
- Old clients cannot parse `order_forge` (the admin-only preset limits exposure).
- `asset_path` resolution is unverified against production data; readiness requires a non-empty path but does not check the file exists.
- Learning attempts, Weak Areas and Daily skip the round (`declares_child_refs=False`); personal history `unit_of` returns None for it.
- A submit retried after the segment already resolved errors, as for every module (pre-existing).
- Check the readiness report against the production item pool before the admin smoke test.

## OF1-B result: frontend implementation

### Files changed

| Area | File |
|---|---|
| Primitive (new) | `src/components/interaction-grammar/OrderForge.tsx` |
| Module (new) | `src/lib/ranked-core/modules/orderForgeModule.tsx` |
| Registry | `src/lib/ranked-core/modules/registry.ts` (`order_forge` v1) |
| MIG types | `src/lib/interaction-grammar/types.ts` (`OrderEntry`, `OrderForgePublic`, `OrderForgeReveal`, `OrderForgeResponse`, compile-time `extends SegmentChoice`) |
| Transport | `src/lib/ranked-public/client.ts` (`SegmentChoice` gains `{order: readonly string[]}`; explicit `order` and `itemId` branches plus `assertNever`, so no variant can silently send `item_id: undefined`) |
| Readers (the adapter boundary) | `src/lib/ranked-public/contracts.ts` |
| Labels / review | `SegmentTranscript.tsx` (compact settled comparison), `QuestionReviewCard.tsx` (`OrderForgeBody`), `questionIcons.ts`, `ModuleSigil.tsx`, `questionTimelineParts.tsx`, `centralStage.ts`, `rankedResultsModel.ts`, `roundMedia.ts` (art preload) |
| Probe / fixtures | `src/lib/ranked-public/fixtures.ts`, `src/pages/dev/ranked-shell-probe/RankedShellProbe.tsx` (`?q=orderforge`, `&forge=locked` or `&forge=revealed`) |
| Tests | `OrderForge.test.tsx`, `orderForgeModule.test.tsx`, `contracts.orderForge.test.ts`, `client.test.ts` (+1), `registry.test.ts` (updated), `e2e/ranked-arena-fit.spec.ts` (+22) |

**Not touched:** `CanonicalArena`, `ArenaShell`, `QuizRankedMatch`, `useRankedMatch`, the timers, any backend file, Meta Reflex, Data Duel, Daily / Weak Areas / history. There is no mode branch in the arena: `ownsSubmission: true` is the whole integration.

### Interaction behaviour

- One vertical list of 5 cards with a start rail ("Start: Cheapest", top) and an end rail ("End: Most expensive", bottom); the labels come from the server's `direction_labels`. Each card has a rank number, art (monogram fallback), the label, up / down buttons and a grip handle.
- Drag uses framer-motion `Reorder` with `dragListener={false}` and `useDragControls`: **only the grip starts a drag**. Verified with real pointer events in the browser pane.
- **Lock in this order** is a full-width button under the list, with a "Final once locked" line. It is enabled for the untouched order too (no local judgement). One press emits `{order: [...]}`.
- The local draft is keyed on `(segmentNumber, challengeIndex)`, not on snapshot identity, so the arena's 1s re-render never resets a mid-drag order.
- After Lock In the module goes `locked` immediately (pending). If the server refuses (`submitChallenge` resolves `false`) the input reopens with the player's arrangement intact. The server's `own_submitted_choices[0].order` echo restores the locked order after a refresh.
- The reveal appears in the viewport from `ownChallengeReveals[0]` only: **MY ORDER** (a ✓ / ✗ ring plus the value per row, from the server's `position_correct`) beside **CORRECT ORDER**, an "Exactly right / Not quite" line from the server's `is_correct`, and a waiting line for the opponent. Nothing about the opponent's order is read before the segment settles.
- No local grading anywhere: no comparison with the canonical order, no derived marks, no partial-credit text (source-scan tests pin this).
- A challenge that has not opened yet is `inert`, and Lock In is ignored until `challenge_started_at` / the round's `started_at` (same rule as Mastery).

### Accessibility / mobile

- The page stays vertically scrollable: only the grip has `touch-action: none`; the card body and buttons do not.
- Every control is 44 x 44 px (up, down, grip); Lock In is 48 px tall. Names wrap to two lines instead of truncating (checked at 375 px wide), and art is 32 px on phones.
- Not drag-only: up / down buttons on every row, and ArrowUp / ArrowDown on the focused grip. Focus follows the moved card's control (falls back to its grip at an end).
- Screen readers: `aria-label`s state the card and its position ("Move Long Sword up (currently position 3 of 5)"). A polite live region announces "Kindlegem moved to position 2 of 5", then "Order locked in..." and the verdict. The reveal sections are labelled headings.
- Reduced motion (OS or in-app, via `useReducedMotionPreference`): no layout animation, no spring, no drag scale, and the suspense dots stop pulsing.
- Desktop (`lg`) is compacted to fit the arena's height-locked, `overflow-hidden` question panel at every supported viewport down to 1024 x 768, in both the open and revealed states. This is measured by e2e against the clipping ancestor, not by scroll height.

### Unknown / new module safety

`readSegmentBlock` dispatches `order_forge` on the module id **before** the version fall-through. An unregistered id still resolves to `null` in `rendererForSegment` (the shell's unsupported state), and an unknown review `kind` still throws. The pre-reveal walk now also rejects `canonical_order`, `position_correct` and `value_display` in a live payload. The reveal reader refuses a reveal for a challenge the viewer may still answer. The review reader refuses an unrevealed `order_forge` round that carries the canonical order or values.

### Assumptions about the backend payload

The whole uncertainty lives in `contracts.ts` and `fixtures.ts`.

Frozen and used as specified: `module_id: order_forge`, `module_version: 1`, submit `{"order": [ids]}`, ids are opaque tokens in the shuffled display.

Assumed (from design sections 4-6; **verify against OF1-A when it lands**):

1. `segment_state.challenges` = `{prompt, metric_label, direction_labels:{first,last}, reveal_window_ms, challenges:[{challenge_index, entries:[{entry_id, label, media}]}]}`. `media` may be `null`, a url string, or `{src, alt}`. Read by `readOrderForgeBlock`.
2. `own_submitted_choices[i]` = `{order:[...]}` (or `null`).
3. `own_challenge_reveals[i]` = `{challenge_index, is_correct?, order, canonical_order, position_correct?, entries:[{entry_id,label,value_display}]}`. A `value_display` id-to-string map is also accepted. Read by `readChallengeReveals`.
4. `segment_reveal` (settled) = `{module_id, module_version, canonical_order, entries:[{entry_id,label,value_display}], players:{pid:{order, position_correct, segment_result, points_awarded?, speed_bonus_points?, duration_ms?}}}`. Per-player `correct/incorrect/unanswered` tallies are not required. Read by `readOrderForgeSettlement`.
5. A match review round with `kind: "order_forge"` carries, at round level, `entries:[{entry_id,label,media,value_display}]`, `viewer_order`, `canonical_order`, `outcome` (`correct`, `incorrect` or `timeout`) and `position_correct`. `viewer_submission` may be all null. Read by `reviewOrderForge`. The review timeline outcome uses `outcome`.
6. The reveal is safe to show as soon as it arrives (backend D6); the frontend does not gate it on `reveal_window_ms`.

If any field name differs, the fix is confined to those four readers and `fixtures.ts`; no component reads wire names.

### Tests and results

- `OrderForge.test.tsx` (18), `orderForgeModule.test.tsx` (14), `contracts.orderForge.test.ts` (12), `client.test.ts` (+1, 25 total) and `registry.test.ts` (12): **all pass**.
- Broader run over `src/lib/ranked-core`, `ranked-public`, `components/ranked-arena`, `components/quiz/workspace`, `components/interaction-grammar`, `pages/quiz-ranked` and `pages/dev`: 3961 tests. The failures are **identical to `origin/main` @ `cb2ccff7`**, measured on a detached baseline worktree: `AnswerGrid.elimination` (2), `DailyOnCanonicalArena.boundary` (2), `QuestionStageGeometry` (3), `QuestionTimeline` (14), `ChampionCardDuelPage` (3), `statCategoryIcons` (1). `QuestionReviewHost` has 1 failure on baseline and passes with the change. Five other files timed out under full-suite load and pass in isolation (146 tests). The `CanonicalArena.boundary`, `sharedLayer.boundary` and `masterySlice.generic` suites are green.
- A whole-repo `vitest run` is not usable here: it runs out of heap, and the `PT2E` migration tests fail on baseline too.
- `tsc -p tsconfig.app.json --noEmit`: no new errors (3 baseline errors in `OnboardingProfile`, `identity/connections` and `practiceLeaveContract`). `eslint` on the touched files: 0 errors (only the repo's usual react-refresh warnings). `vite build`: passes.
- Playwright (`playwright.arena.config.ts -g "Order Forge"`): **22 of 22 pass**. That is the open and revealed states at all 10 locked desktop viewports, plus 360 x 740 and 360 x 800 touch phones (scrollable, 44 px targets, no horizontal overflow).
- Manual, in the browser pane: a real pointer drag from the grip reorders; 1280 x 720 and 375 x 812 screenshots were reviewed for the open and revealed states.

### Commit

**6ffa725f** on `of1/order-forge` (frontend only; based on `origin/main` @ `cb2ccff7`). Not pushed, not deployed.

## OF1-C: cross-repo integration and certification (DONE)

**Verdict: READY TO DEPLOY** (frontend first, backend second), with one checklist step still owed before the admin smoke test: the production item-data precheck was **not run** in this session (see "Production readiness").

### Final SHAs

| Repo | Branch | Final SHA | OF1-C commits |
|---|---|---|---|
| Backend `League_Combat_Simulator` | `of1/order-forge` | **`4ffff8f5499c7314555ea0864bba9715f3001550`** | `48c5092a`, `4ffff8f5` |
| Frontend `mogsy` | `of1/order-forge` | **`45d0daec40dce386652cd8bf36355e6c1616194c`** (code and tests) | `45d0daec`, then a docs-only commit recording this SHA at the branch tip |

Neither branch is pushed or deployed.

### How the two sides were reconciled

Not from either handoff. `test_order_forge_wire_contract.py` (backend) plays one `admin.order_forge` match through the real HTTP routes and, with `OF1_WIRE_CAPTURE_PATH` set, writes every response body to JSON. That file is committed in the frontend as `src/lib/ranked-public/__fixtures__/orderForgeServerCapture.json`, and `contracts.orderForge.serverCapture.test.tsx` feeds it through the real readers, the real module viewport, `SegmentTranscript` and `QuestionReviewCard`. Segment 1 is locked wrong, segment 2 exactly right, segment 3 never locked. Regenerate the capture whenever the backend contract changes:

```bash
OF1_WIRE_CAPTURE_PATH=<mogsy>/src/lib/ranked-public/__fixtures__/orderForgeServerCapture.json python -m pytest test_order_forge_wire_contract.py
```

### Reconciliation result (the 15 points)

| # | Point | Result |
|---|---|---|
| 1 | Request field and shape | Match. The serializer's bytes are `{"order":["e0","e1","e2","e4","e3"]}`; the test posts those exact bytes. |
| 2 | Public entry field names | Match: `entry_id`, `label`, `media`. |
| 3 | Entry id | Match: `entry_id`, positional `e0`..`e4` in display order. |
| 4 | Label / image | Match: `label`; `media: {src, alt} \| null`. `src` is the repo-relative `asset_path`, resolved by `resolveQuizAssetUrl` exactly as Item Cost Duel's `asset_path` is. |
| 5 | Direction metadata | Match: `direction_labels: {first, last}`, plus `prompt`, `metric_label`, `family`. |
| 6 | Locked answer | Match: `own_submitted_choices: [{order:[...]}]` (or `[null]`). |
| 7 | Reveal field names | Match for the viewer's own reveal. |
| 8 | Canonical order | Match: `canonical_order: [ids]` in all three places. |
| 9 | Per-position marks | Match: `position_correct: [bool]`; `[]` for no answer in the settled reveal and in a revealed review round, `null` in an unrevealed review round. |
| 10 | Settled reveal players | **Three mismatches, all fixed on the backend** (below). |
| 11 | Review fields | Match at round level. |
| 12 | Module id / version | Match: `order_forge` / `1`. |
| 13 | Config names | Backend-only (`family`, `entry_count`, `min_gap`, `reveal_window_ms`); the frontend reads none of them. `reveal_window_ms` is read and ignored. |
| 14 | Preset name | Match: `admin.order_forge`, reported as `payload.playtest.session_preset`. The frontend has **no UI** that launches it (see known issues). |
| 15 | Errors | Match: both refusals are HTTP 422; the client turns them into a `RankedApiError`, the hook resolves `false`, and the module reopens the input. |

### Reconciliation fixes

All three were in the settled `segment_reveal`, the one payload neither side's own tests had exercised against the other.

1. **`segment_reveal.challenge_count` was missing** (backend `48c5092a`). The frontend's `readSegmentReveal` requires it and threw `segment_reveal.challenge_count must be a number` on every settled Order Forge segment, which would have broken the result beat and the resume envelope for every round. Every other block module's reveal carries it. Now `1`.
2. **`players[].segment_result` used the wrong vocabulary** (backend `48c5092a`). It was the grade (`correct` / `incorrect` / `timeout`); the reader accepts only Ranked's `win` / `loss` / `draw` / `timeout` and read the rest as unknown, so the transcript showed "—". It is now derived from the points just awarded: no submission is `timeout`, otherwise more points than the opponent is `win`, fewer is `loss`, equal is `draw`. Display only; outcomes, points and child records are unchanged. The frontend's own unit fixture already used `win` / `loss`.
3. **`players[].correct / incorrect / unanswered` were missing** (backend `4ffff8f5`). The reader defaulted them to 0, so the beat's accessible scoreline announced "YOU 0/1" for an exact sequence. Now present, out of `challenge_count`.

One frontend fix, found while certifying keyboard support rather than the contract:

4. **An arrow key on the grip moved focus to the up/down button**, so a second arrow press did nothing. `CardRow.onMove` now reports which control asked (`OrderForge.tsx`), and focus stays on the grip. Unit test added.

No frontend reader or field name changed. No scoring changed.

### Final wire contract

```http
POST /api/ranked/matches/{id}/segments/{n}/challenges/0
Content-Type: application/json

{"order":["e0","e1","e2","e4","e3"]}
```

- Exactly one of `item_id | card_id | selected | order`; `extra=forbid`. `order` is 4-6 strings of 1-16 characters at the schema, and must list every public entry id exactly once at the module.
- Response 200: `{status:"accepted", match_id, segment_number, challenge_index:0, idempotent, conflicting, segment_resolved, next_challenge_index:1, reveal_window_ms:2500, challenge_reveal:{...own reveal...}}`. The frontend reads `status`, `segment_number`, `challenge_index`, `idempotent`, `conflicting`, `segment_resolved`, `next_challenge_index` and ignores `challenge_reveal`.
- Same order again: `idempotent:true, conflicting:false`. A different order while the segment is open: `idempotent:true, conflicting:true`, and `challenge_reveal` is that of the ORIGINAL order. Any submit after the segment settled: 4xx `RANKED_STALE_ROUND` (as for every module; the hook treats it as stale and shows no error).
- Refusals, nothing stored: schema failures are 422 with FastAPI's `detail: [...]` list; module failures are 422 `{"detail":{"code":"RANKED_INVALID_CHOICE","message":"order must list every entry id exactly once"}}`. A lock after the deadline is refused with a `RANKED_*` code.
- Preset: `POST /api/ranked/queue {"match_with_bot":true,"preset":"admin.order_forge"}`. Non-admin: 403 `RANKED_PRESET_NOT_AUTHORIZED`. A pool that cannot serve: 503 `RANKED_FORMAT_UNSERVABLE`, no match or queue row created.

### Final public payload (`segment_state`, pre-reveal)

```json
{
  "module_id": "order_forge", "module_version": 1, "active": true,
  "segment_number": 1, "phase": "challenges", "challenge_count": 1,
  "challenge_started_at": "2026-09-09T12:00:04.400000+00:00",
  "challenge_deadline": "2026-09-09T12:00:34.400000+00:00",
  "pressure_applied": false, "reveal_window_ms": 2500,
  "own_next_challenge_index": 0, "own_submitted_choices": [null],
  "own_challenges_completed": 0, "own_finished": false,
  "opponent_challenges_completed": 0, "opponent_finished": false,
  "own_challenge_reveals": [],
  "challenges": {
    "family": "item_cost",
    "prompt": "Order these items by gold cost",
    "metric_label": "Gold cost",
    "direction_labels": {"first": "Cheapest", "last": "Most expensive"},
    "reveal_window_ms": 2500,
    "challenges": [{
      "challenge_index": 0,
      "entries": [
        {"entry_id": "e0", "label": "Item 039", "media": {"src": "assets/items/39.png", "alt": ""}}
      ]
    }]
  }
}
```

(Generic segment fields that are null for this module are omitted above. Five entries, `e0`..`e4`, in the shuffled display order; each is exactly `entry_id`, `label`, `media`.)

### Final reveal shapes

**Viewer's own reveal** (`own_challenge_reveals[0]`, also `challenge_reveal` on the submit response). Present only after the viewer's lock; `own_submitted_choices` becomes `[{"order":[...]}]` and `own_next_challenge_index` becomes `1`.

```json
{
  "challenge_index": 0,
  "order": ["e0", "e1", "e2", "e4", "e3"],
  "is_correct": false,
  "position_correct": [false, true, true, true, false],
  "canonical_order": ["e3", "e1", "e2", "e4", "e0"],
  "entries": [{"entry_id": "e3", "label": "Item 003", "value_display": "250 g"}]
}
```

`entries` is in CANONICAL order.

**Settled reveal** (`payload.segment_reveal` of `GET .../rounds/{n}/resolved`, and of `latest_resolved_round` on resume):

```json
{
  "module_id": "order_forge", "module_version": 1, "challenge_count": 1,
  "scoring": "points", "correct_points": 2, "speed_bonus_points": 1,
  "canonical_order": ["e0", "e1", "e3", "e4", "e2"],
  "entries": [{"entry_id": "e0", "label": "...", "value_display": "450 g"}],
  "players": {
    "<player id>": {
      "order": ["e0", "e1", "e3", "e4", "e2"],
      "segment_result": "win",
      "position_correct": [true, true, true, true, true],
      "correct": 1, "incorrect": 0, "unanswered": 0,
      "base_points": 2, "speed_bonus_points": 1, "points_awarded": 3,
      "finished_first": true, "duration_ms": 1100
    }
  }
}
```

A player who never locked: `order: null`, `position_correct: []`, `segment_result: "timeout"`, `unanswered: 1`, `duration_ms: null`. Both players' orders are present; this payload exists only after settlement. `payload.module_points[pid]` and `payload.players[].outcome` (`correct` / `incorrect` / timed out) are the ordinary Ranked ones, and they are what the beat's "CORRECT +2" line is drawn from.

### Final review shape

`GET /api/ranked/matches/{id}/review`, one entry of `payload.rounds`:

```json
{
  "round_number": 1, "kind": "order_forge", "module_id": "order_forge",
  "revealed": true, "question": null, "category": null,
  "canonical_question_ref": null, "icon_hint": {"kind": "generic", "key": null, "icon": null},
  "topic": {"category": "general", "tier": null, "motif": null, "roles": [], "icon_hint": {}},
  "family": "item_cost", "prompt": "Order these items by gold cost",
  "metric_label": "Gold cost",
  "direction_labels": {"first": "Cheapest", "last": "Most expensive"},
  "entries": [
    {"entry_id": "e0", "label": "Item 039", "media": {"src": "assets/items/39.png", "alt": ""}, "value_display": "2050 g"}
  ],
  "viewer_order": ["e0", "e1", "e2", "e4", "e3"],
  "canonical_order": ["e3", "e1", "e2", "e4", "e0"],
  "position_correct": [false, true, true, true, false],
  "outcome": "incorrect", "is_correct": false,
  "viewer_submission": {"answer_index": null, "is_correct": false,
    "correct_count": 0, "answered_count": 1, "challenge_count": 1}
}
```

- `entries` is in DISPLAY order and carries `media`. Fields are at round level; there is no `challenges` key.
- Never locked: `viewer_order: null`, `position_correct: []`, `outcome: "timeout"`, `is_correct: null`, `answered_count: 0`.
- Not revealed: `canonical_order`, `position_correct`, `outcome`, `is_correct` and every `value_display` are `null`. The frontend reader refuses an unrevealed round that carries any of them.
- Only the viewer's order is in the review; the opponent's is not selected.

### Tests run

**Backend** (`python -m pytest ... -p no:cacheprovider`, in the `of1-order-forge` worktree):

- `test_order_forge_module.py`, `test_order_forge_flow.py`, `test_order_forge_wire_contract.py`, `test_ranked_modules_quiz_parity.py`, `test_jref2_admin_reference_journey_preset.py`, `test_ranked_playtest_preset.py`: **186 passed, 4 skipped, 4 failed**. The 4 failures are all "ordinary bot match" cases (`test_jref2_...::test_an_ordinary_bot_match_is_unchanged` and three in `test_ranked_playtest_preset.py`); the same 4 fail on the untouched baseline worktree at `1002230a`, so they are this environment's missing question bank, not Order Forge.
- The global suite was not re-run (unrelated environment failures, per the brief).

| Certification item | Where it is proven |
|---|---|
| Exact grading, no partial credit | `test_exact_match_is_correct_and_any_single_swap_is_not`, `test_there_is_no_partial_credit_for_any_other_permutation` |
| Invalid / reordered submissions | `test_malformed_orders_are_refused`, `test_other_shapes_are_refused`, `test_client_may_not_add_fields`, `test_http_refuses_bad_bodies_and_stores_nothing` |
| Duplicate idempotence / conflict | `test_duplicate_submission_is_idempotent_and_a_reorder_is_a_conflict`, `test_http_duplicate_is_idempotent_and_a_reorder_conflicts`, wire-contract capture |
| Hidden-answer leakage | `test_segment_state_is_answer_free_before_any_submission`, `test_persisted_public_payload_holds_no_answer`, `test_public_view_is_an_allowlist_rebuild`, `test_snapshot_projects_the_segment_without_the_answer` |
| Viewer-only reveal | `test_submission_echoes_own_order_and_reveals_only_after_locking`, `test_the_opponent_never_receives_an_early_reveal` |
| `bot_schedule` | `test_bot_schedule_is_defined_strictly_increasing_and_bounded`, `test_bot_submits_a_valid_order_through_the_shared_driver` |
| Result validation | `test_children_validate_and_record_the_sequence`, `test_reveal_shape_satisfies_the_points_view_contract`, `test_replay_reproduces_the_stored_settlement` |
| Data-unavailable translation | **new:** `test_a_pool_that_cannot_serve_is_refused_at_the_queue_as_503`, `test_generation_without_data_is_translated_not_a_500` |
| Readiness / min-gap generation | `test_values_are_distinct_with_the_minimum_gap`, `test_fails_closed_when_prices_are_too_close`, `test_readiness_refuses_a_pool_that_cannot_serve`, `test_readiness_passes_a_healthy_pool_and_reports_it`, **new:** `test_the_readiness_report_answers_for_a_database_without_writing` |
| Admin preset | `test_the_preset_is_admin_only_over_http`, `test_an_admin_starts_an_unrated_order_forge_bot_match` |
| Review serialization | `test_full_match_completes_and_review_shows_both_orders`, `test_review_withholds_the_answer_for_an_unresolved_round`, wire-contract capture |
| Service + HTTP flow | `test_order_forge_flow.py` (both halves), **new:** `test_the_wire_contract_the_frontend_readers_depend_on` (a full three-segment match over HTTP) |
| `pressure_seconds` | `test_schema_validates_order_forge_config`, **new:** `test_a_lock_in_the_last_five_seconds_is_accepted_and_scored`, `test_a_lock_after_the_deadline_is_refused` |
| Settlement / timing / speed bonus | `test_points_and_speed_bonus`, `test_correct_and_strictly_faster_earns_the_speed_bonus`, `test_slower_than_the_bot_earns_no_bonus`, `test_a_wrong_order_earns_nothing_even_when_first`, **new:** `test_segment_result_uses_the_ranked_reveal_vocabulary` |

**Frontend** (in the `of1-order-forge` worktree):

- `vitest run src/lib/ranked-public src/components/interaction-grammar` plus the Order Forge module, registry, `SegmentTranscript` and `SegmentResultBeat` tests: **30 files, 378 tests, all pass.** This includes the new `contracts.orderForge.serverCapture.test.tsx` (23 tests, real server JSON) and the new keyboard-focus test.
- `vitest run src/components/ranked-arena`: 7 tests in 3 files fail (the Daily boundary, single answer-path and stage-geometry suites OF1-B already listed as baseline). A temporary baseline worktree at `cb2ccff7` gives the same count: 3 files, 7 failed, 552 passed.
- `tsc -p tsconfig.app.json --noEmit`: the same 3 baseline files error (`OnboardingProfile`, `identity/connections`, `practiceLeaveContract.test`); nothing new. `eslint` on the touched files: 0 errors. `vite build`: passes.
- Playwright `playwright.arena.config.ts -g "Order Forge"`: **22 of 22 pass** (open and revealed at 10 desktop viewports; 360x740 and 360x800 phones). On Windows the config's `webServer` command does not start; run `npx vite --port 8123 --strictPort` first and the config reuses it.
- A throwaway Playwright spec (run once, 12 of 12 passed, not committed) covered what the committed spec does not: the **locked** layout inside the panel at 1920x1080, 1366x768, 1280x720 and 1024x768; **locked and revealed** at 360x740 and 360x800 with no horizontal overflow; a real touch swipe on a card body scrolls the page and does not reorder; a mouse drag from the card body does not reorder and the same drag from the grip does; arrow keys on the grip reorder repeatedly with the move announced in the polite live region; Enter on the down button and on Lock In; and under `prefers-reduced-motion` a move is at rest two frames later.

| Certification item | Where it is proven |
|---|---|
| Serializer emits the backend contract | capture test "the serializer emits the exact bytes the backend accepted"; `client.test.ts` |
| Parser reads the real public payload | capture test "reads the public block exactly as the server froze it" |
| Parser reads the real reveal | capture tests for the own reveal and for all three settled reveals |
| Refresh restores the locked order | capture test "a refresh before the reveal restores the locked order from the echo"; `orderForgeModule.test.tsx` |
| Rejected lock reopens | capture tests for both refusal bodies and the still-open state; `orderForgeModule.test.tsx` "releases pending and reopens" |
| No client correctness knowledge | `OrderForge.test.tsx` source-contract tests; every mark in the capture tests is compared with the server's |
| No opponent reveal leak | capture test "nothing about the opponent is in the viewer's pre-settlement state"; `orderForgeModule.test.tsx` |
| Review renders the real payload | capture tests under "match review" |
| Unknown modules fail safely | `contracts.orderForge.test.ts` "still rejects a genuinely unknown kind"; `registry.test.ts` |
| Mobile scroll, grip-only drag, up/down, keyboard, announcement, reduced motion, 360px, desktop locked/reveal | the committed Playwright spec, `OrderForge.test.tsx`, and the throwaway spec above |

### Production readiness

**NOT RUN.** This session could not read production: both attempts (a read-only query on the production service, and a scan for a local database copy) were refused by the session's permission policy for production reads, and they were not retried another way. Nothing in production was touched. The checked-in `lol_calc.db` in the primary checkout is empty, so there was no local authority to run against either.

What is in place instead:

- `order_forge_readiness_report.py [db_path]` (backend, `4ffff8f5`): read-only (`mode=ro`), runs the same readiness the queue route runs for the preset's frozen format, and lists items excluded for having no image path and image paths that name no file on disk. Exit 0 = ready. Tested against fixture databases only.
- The preset fails closed on its own: `assert_format_servable` runs before any row is written, and a pool that cannot supply five items at least 100 g apart with image paths returns 503 `RANKED_FORMAT_UNSERVABLE`.
- Not covered by readiness: whether each `asset_path` resolves to a real file. A missing file is not a refusal and not a broken image: `SubjectArt` swaps to the card's monogram on a load error. It is still worth knowing, and the report lists these.

**Owner action:** run the report against the production database once the backend is deployed and before the admin smoke test (checklist step 5), and record the output here.

### Known non-blocking issues

1. **In a bot match the in-viewport reveal is never shown.** The bot records its whole block the first time a route drives it, so the human's lock settles the segment immediately (`segment_resolved: true`) and the next snapshot is already the next segment. `own_challenge_reveals`, which the viewport's "MY ORDER / CORRECT ORDER" comparison reads, is only projected while a segment is locked but unsettled, and the preset requires a bot. In the admin proof the player should therefore see: the result beat ("CORRECT +2" / "INCORRECT +0") for the 2.9 s presentation window, the transcript behind the beat's details control (both orders and the correct one as text), and the full two-column comparison in match review afterwards. This sequence is read from the captured responses and the code, not watched on a live stack; confirm it in the smoke test. The submit response does carry `challenge_reveal`, but the client ignores it. Showing the comparison in the viewport during the beat is a product decision and a change to the arena seam, so it was not made here.
2. **No launch UI.** Nothing in the frontend sends `preset: "admin.order_forge"`; the admin smoke test has to call `joinQueue` with it (dev console or a temporary link). `/dev/ranked-shell-probe?q=orderforge` renders fixtures, not a live match.
3. **The probe's default clock never opens the challenge.** `?q=orderforge` alone is inert (canned `server_time` is before the canned `challenge_started_at`); add `&lead=1500` to interact with it. Production clocks advance, so this is probe-only.
4. **`segment_result` reads oddly for two exact orders.** The slower of two correct players is labelled `loss` (2 points against 3). That is the existing Ranked convention, and in a points match the word only appears in the transcript header and the beat's accessible label.
5. **A generation failure past the readiness gate leaves an `active` match row** and returns 503 `RANKED_MODULE_DATA_UNAVAILABLE`. True of every module, and unreachable here because the gate and the generator share one feasibility rule. Pinned (not asserted as desirable) in `test_generation_without_data_is_translated_not_a_500`.
6. Old clients cannot parse `order_forge` (they throw "needs a newer client"): hence frontend first. Learning attempts, Weak Areas, Daily and personal history skip the round by design (`declares_child_refs=False`).
7. `reveal_window_ms: 2500` is frozen and sent but has no effect for a single-challenge segment.
8. The handoff lives only in the frontend repo; the backend branch has no copy.

### Deployment checklist

1. Push both `of1/order-forge` branches and open the PRs. Frontend `45d0daec` (plus the docs commit at the tip), backend `4ffff8f5`. Both are based on old trunks (`origin/main` @ `cb2ccff7`, `origin/master` @ `1002230a`): rebase or merge current trunk first and re-run the targeted tests above, including the capture test on both sides.
2. **Deploy the frontend first.** It is inert until a backend serves `order_forge`. Confirm an ordinary Ranked match and match review still work.
3. **Deploy the backend second.** No migration. Confirm an ordinary Ranked bot match still starts.
4. Confirm a non-admin account gets 403 `RANKED_PRESET_NOT_AUTHORIZED` for `admin.order_forge`.
5. Run `python order_forge_readiness_report.py` against the production database (read-only). Require `READY`; record `max_selectable`, the excluded items and any missing image files in this file.
6. Admin smoke test with `joinQueue(..., {matchWithBot: true, preset: "admin.order_forge"})`: three segments. Check the cards and images load; grip drag, up/down and keyboard reorder; Lock In; the result beat and points (2, or 3 when first); a deliberately wrong order (0 points); letting one segment time out; the end screen; and match review showing "My order" beside "Correct order" for each round, with "You did not lock in an order." for the timeout.
7. On a phone: the page scrolls, only the grip drags, Lock In is reachable.
8. Rollback: revert the backend first (the preset disappears; the frontend stays inert). A match in flight when the backend reverts cannot be resumed.

### Out of scope for V1

Daily / Weak Areas / history integration, SFX for lock and reveal, richer per-position animation, a launch surface for the preset, and showing the comparison in the viewport during the settle beat.

## OF1-D: current-trunk integration (DONE, 2026-09-30)

**Verdict: READY FOR DEPLOYMENT**, with one manual pre-deploy check still owed: the production item-data readiness report (see "Production readiness" below). Nothing was pushed or deployed. This section supersedes step 1 of the OF1-C deployment checklist.

### Starting trunks (fetched 2026-09-30, confirmed with `git ls-remote`)

| Repo | Trunk | SHA at integration | Drift since the OF1 base |
|---|---|---|---|
| Frontend `mogsy` | `origin/main` | `9abc62448308930bb0c553cfc41f486e9f1dcbd7` | 3 commits past `cb2ccff7` (NAV1-WK1 WebKit certification, LS-RETIRE1 League Swipe retirement and its record) |
| Backend `League_Combat_Simulator` | `origin/master` | `1002230adc12beefc24f402520d6dd5dbc646a84` | none; still the OF1 base |

### Integration branches

| Repo | Branch | Worktree | Final SHA |
|---|---|---|---|
| Frontend | `of1d/order-forge-integration` | `mogsy/.worktrees/of1d-integration` | code: **`33278874d8d97ff9d07e6ae6805c5f22c7944b51`**; the branch tip is docs-only commits on top of it (this file) |
| Backend | `of1d/order-forge-integration` | `League_Combat_Simulator/.worktrees/of1d-integration` | **`4ffff8f5499c7314555ea0864bba9715f3001550`** (the certified SHA itself) |

Both branches are local only. The primary checkouts (both on `envvis1-batch1-scene-channel`, dirty) and the `of1/order-forge` branches were not touched.

### What was integrated

**Frontend:** cherry-picked onto `origin/main` @ `9abc6244`, in order. No merge of the old branch.

| Certified commit | Integrated as | Content |
|---|---|---|
| `6ffa725f` | `fcf10bcf` | OF1-B: primitive, module renderer, contracts, review, tests |
| `a022eb06` | `47d26360` | docs only (this file) |
| `45d0daec` | `33278874` | OF1-C: server-capture certification, keyboard-focus fix |
| `82b22c48` | `b5284312` | docs only (this file) |

**Backend:** `origin/master` has not moved since the OF1 base, so the integration branch is `origin/master` fast-forwarded to `4ffff8f5` (`a7e5fdbd`, `55c7fd85`, `48c5092a`, `4ffff8f5`). No cherry-pick was needed and the SHAs are unchanged.

### Conflicts and resolutions

None. All four frontend cherry-picks applied cleanly. The 63 files the trunk changed and the 25 files Order Forge changed do not overlap, and all 24 Order Forge source/test files on the integration branch are byte-identical to the certified tip (`git diff of1/order-forge HEAD` over those paths is empty).

### Seam check against current trunk

- Backend trunk is unchanged, so `SegmentChallengeIn`, response serialization, review/reveal shapes and preset handling are exactly as certified.
- Frontend trunk drift touches no file under `src/lib/ranked-public`, `src/lib/ranked-core`, `src/components/ranked-arena`, `src/components/interaction-grammar` or `src/components/quiz/workspace`; the only ranked-named files are two NAV1 e2e specs. A scan of the drift for `preset`, `joinQueue`, `ModuleRenderer`, `rendererForSegment`, `CanonicalArena`, `SegmentChoice`, `segment_reveal` and `readMatchReview` finds nothing. The `ModuleRenderer` registry semantics, Ranked review/reveal readers, preset handling and `CanonicalArena` ownership are unchanged.

### Tests re-run on the integration branches

**Backend** (`python -m pytest test_order_forge_module.py test_order_forge_flow.py test_order_forge_wire_contract.py test_ranked_modules_quiz_parity.py test_jref2_admin_reference_journey_preset.py test_ranked_playtest_preset.py -p no:cacheprovider`): **187 passed, 4 skipped, 4 failed.** The 4 failures are the same "ordinary bot match" cases OF1-C recorded as failing on the untouched baseline (`test_jref2_...::test_an_ordinary_bot_match_is_unchanged` and three in `test_ranked_playtest_preset.py`): this environment has no question bank. These files cover every item requested: module tests, service/HTTP flow, wire contract, result validation, data-unavailable -> 503, the last-5-seconds lock with `pressure_seconds=0`, `bot_schedule`, review serialization and duplicate submission (see the OF1-C table for the test names).

**Frontend:**

- `vitest run src/lib/ranked-public src/components/interaction-grammar src/lib/ranked-core/modules` plus `SegmentTranscript`, `SegmentResultBeat` and `QuestionReview*`: 52 files, **738 passed, 1 failed**. The one failure was a 50 s Radix popover test in `QuestionReviewHost.test.tsx` timing out under load; re-run alone, that file passes 16 of 16. This set includes the primitive, module, server-capture contract, registry, review, transcript, serializer and keyboard/accessibility tests.
- `vitest run src/components/ranked-arena`: 552 passed, 7 failed in 3 files (`AnswerGrid.elimination`, `DailyOnCanonicalArena.boundary`, `QuestionStageGeometry`). Same files and same count as the baseline OF1-C measured at `cb2ccff7`. Not re-measured on a bare `9abc6244` baseline; trunk drift touches none of these files.
- `tsc -p tsconfig.app.json --noEmit`: only the 3 known baseline files error (`OnboardingProfile`, `identity/connections`, `practiceLeaveContract.test`).
- `eslint` on the Order Forge files: 0 errors, 5 react-refresh warnings.
- `vite build`: passes.
- Playwright `playwright.arena.config.ts -g "Order Forge"`: **all 22 pass, but not in one clean run.** With `--retries=2`: 18 passed first time, 4 passed on retry. Every recorded failure was the dev route rendering a blank page for 60 s (a `waitForSelector` timeout on the Vite dev server in this environment); no recorded failure was a fit or 44 px assertion. Two earlier runs without retries gave 21/22 and 19/22, failing different tests each time.

### Production readiness

**NOT RUN: no production access from this environment.** There is no production database connection or copy here, and the worktree's local `lol_calc.db` is empty (`order_forge_readiness_report.py` stops with `CostAuthorityUnavailable: item_canonical is unpopulated`). Pool sufficiency, the number of qualifying 5-item sets with >=100 g adjacent gaps, missing image paths and exclusions are therefore all **unknown**. This is the only manual pre-deploy check left. The preset fails closed (503 `RANKED_FORMAT_UNSERVABLE`) if the pool cannot serve, and it is admin-only.

### Remaining deployment steps

1. **Manual pre-deploy check:** run `python order_forge_readiness_report.py <production db>` (read-only) from backend `4ffff8f5`. Require exit 0 / `READY`; record `max_selectable`, excluded items and missing image files here.
2. Re-fetch both trunks. If `origin/main` is still `9abc6244` and `origin/master` still `1002230a`, push both `of1d/order-forge-integration` branches and open the PRs (frontend tip; backend `4ffff8f5`). If either trunk moved, re-integrate first.
3. Merge and **deploy the frontend first**. Confirm an ordinary Ranked match and match review still work.
4. Merge and **deploy the backend second**. No migration. Confirm an ordinary Ranked bot match still starts.
5. Confirm a non-admin gets 403 `RANKED_PRESET_NOT_AUTHORIZED` for `admin.order_forge`.
6. Admin smoke test and phone check: OF1-C checklist steps 6 and 7 (there is no launch UI; call `joinQueue` with `preset: "admin.order_forge"`).
7. Rollback: revert the backend first.
