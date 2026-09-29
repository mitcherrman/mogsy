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

- **OF1-A (backend): not started.** The backend worktree
  (`League_Combat_Simulator/.worktrees/of1-order-forge`) had no commits when OF1-B
  ran, so the server's exact public/reveal field names are **not committed**.
  OF1-B was built against the frozen contract plus the assumed shapes below.
- **OF1-B (frontend): implemented and committed** on `of1/order-forge`. Not deployed.

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

See the SHA line at the bottom of this file.

## Next integration task

1. **OF1-A backend** (section 2 above), then reconcile its committed field names with assumptions 1-6 and adjust only the four readers and `fixtures.ts` if they differ.
2. **OF1-C:** deploy the frontend first, then the backend, then an admin smoke test through the admin-only preset (submit, locked, reveal, result, match review). Add a backend flow test that submits the exact bytes the frontend serializer produces.
3. Out of scope for V1: Daily / Weak Areas / history integration, SFX for lock and reveal, richer per-position animation.
