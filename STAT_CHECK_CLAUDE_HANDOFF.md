# Stat Check Claude Handoff

## 1. Project Identity

- Game name: Stat Check
- Worktree path: `C:\Users\bobbu\OneDrive\Desktop\mogsy_stat_check_v2`
- Branch: `codex/stat-check-tabletop-v2`
- Implementation baseline checkpoint: `1c08ec68025100352e0bb6cc62713ffcf02fe238`
- Development route: `/dev/stat-check`
- Framework: Vite + React + TypeScript
- Relevant libraries:
  - `framer-motion` for overlay/travel/reveal animation.
  - `lucide-react` for UI icons.
  - local shadcn-style UI primitives under `src/components/ui`.
  - Vitest + Testing Library for engine and page regression tests.
  - Playwright is available in the repo for browser-oriented QA, though localhost browser tooling has been inconsistent in Codex.

This handoff is intended to let a fresh Claude agent continue from the current Stat Check implementation without relying on prior Codex conversation context.

## 2. Product Goal

Stat Check is a League champion stat card duel. The current prototype is focused on proving the core allocation and preservation loop before adding items, abilities, rarity, deckbuilding, collectible progression, multiplayer, or large visual effects.

Current intended rules:

- Each match uses one shared unique champion pool.
- Each side starts with a six-card hand.
- Each round presents three category lanes.
- The player plays three cards, one per lane, and preserves the other three cards.
- The bot also plays three cards from its hidden six-card hand.
- Played cards are permanently discarded.
- After each resolved round, both sides draw replacements back toward six from the shared pool.
- The player sees a broad future stat-family clue for one upcoming category, not exact direction/category data.
- Match health is HP-based.
- Damage comes from board wins, sweep bonus, and decisive category wins.

The design goal is to validate whether choosing what to spend now versus preserve for later is fun and strategically legible.

## 3. Current Implemented Systems

### Engine State

Core engine state lives in `src/pages/dev/stat-check/statCheckEngine.ts`.

Important types and functions:

- `StatCheckCard`
- `StatCategory`
- `MatchState`
- `RoundResolution`
- `RoundDamage`
- `createMatch`
- `assignCard`
- `resolveCurrentRound`
- `startNextRound`
- `selectBotAssignments`
- `validateMatchInvariants`

`MatchState` currently contains:

- `seed`
- `phase`
- `round`
- `playerHp`
- `botHp`
- `drawPile`
- `playerHand`
- `botHand`
- `playerDiscard`
- `botDiscard`
- `currentCategories`
- `nextCategories`
- `assignments`
- `lastResolution`
- `outcome`
- `endReason`

### Shared Draw Pile

The old split `playerDeck` / `botDeck` model has been removed. The authoritative remaining champion pool is `drawPile`.

At match creation:

1. `createMatch(deck, seed)` de-duplicates eligible cards by champion `id`.
2. It shuffles once with `shuffleDeterministic`.
3. The first six shuffled cards go to `playerHand`.
4. The next six go to `botHand`.
5. The remaining cards become `drawPile`.

No engine draw logic uses `Math.random`. Seeded randomness flows through `createSeededRandom` and `shuffleDeterministic`.

### Replacement Draw Order

`startNextRound` preserves unplayed cards, discards played cards, then draws from the single shared `drawPile`:

1. Player draws replacements first.
2. Bot draws replacements second from the remaining pile.

This order is intentional, deterministic, and covered by tests.

### Discard Representation

Discard remains split by owner for the current UI:

- `playerDiscard: StatCheckCard[]`
- `botDiscard: StatCheckCard[]`

The lists are permanent for the match. Played cards are appended in current lane order. There is no discard reshuffle and no fabricated replacement card.

### Deck Exhaustion

If `startNextRound` cannot leave either side with at least three legal cards, the match transitions to `match-over` and resolves by current HP:

- Higher HP wins.
- Equal HP is a draw.
- `endReason` is `"Deck exhausted before either side could field three cards."`

This is a simple prototype rule. There is no fatigue system.

### Categories

Categories are defined in `STAT_CATEGORIES` in `statCheckEngine.ts`. Each category owns:

- `id`
- `label`
- `shortLabel`
- `direction`
- `decisiveThreshold`
- `explanation`
- `getValue`
- `formatValue`

Implemented category families include health, attack damage, armor, magic resist, move speed, attack range, and attack speed.

`generateCategoryBoard(seed, round, previous)` creates three unique categories per round with seeded deterministic randomness and avoids repeating the exact previous full board. It does not yet enforce richer family-redundancy constraints.

### Future Clue

`StatCheckPage.tsx` renders `NextRoundIntel`. It shows only a broad stat family using `statFamilyLabel`, plus the copy `One upcoming stat family`.

It intentionally does not reveal exact category labels, level scope, or higher/lower direction.

### Decisive Formulas

`compareCategory` calculates a winner and margin.

For higher-wins categories:

- Margin is `(winningValue - losingValue) / winningValue`.

For lower-wins categories:

- Margin is `(losingValue - winningValue) / losingValue`.

This is implemented through `relativeMarginForCategory` and `relativeMargin`.

### Damage Model

`calculateRoundDamage` implements:

- Board win: `2`
- Sweep bonus for a 3-0 board: `+1`
- Each decisive category win: `+1`
- Tied categories do not award decisive damage.
- Tied boards can still deal decisive damage from decisive category wins.
- Both sides can deal damage in the same round.

Constants live in `STAT_CHECK_RULES`.

### Match Ending

`resolveCurrentRound` applies damage to HP and calls `matchOutcome`.

Outcomes:

- Player HP and bot HP both zero: draw.
- Player HP zero: bot wins.
- Bot HP zero: player wins.
- Otherwise the match stays resolved and may advance to the next round.

### Bot Behavior

`selectBotAssignments(hand, categories)` chooses three legal unique cards from the bot hand. It maximizes category values from the bot perspective with deterministic tie-breaking by hand order. It does not do future planning, discard inference, preservation strategy, HP-aware strategy, or bluffing.

### Animation State Architecture

Animation state lives in `animationState.ts` and `StatCheckPage.tsx`.

`PresentationStep` models the UI timeline:

- selecting
- placement pickup/travel/landing/accepted
- returning card
- locking
- opponent reveal 1-3
- resolve lane 1-3
- board result
- damage
- resolved
- discarding
- dealing
- match-over

`animationStepReducer` accepts `AnimationEvent` transitions. Helpers such as `revealedOpponentCount`, `activeResolvedLane`, `stepAfterLane`, `stepBeforeDamage`, and `allowsPreLockInteraction` control what can be shown or clicked.

Timing constants live in `animationConfig.ts`:

- `STAT_CHECK_ANIMATION`
- `STAT_CHECK_ANIMATION_SPEEDS`
- `REVEAL_TIMELINE`
- `animationDuration`

### Fan Layout

Hand fan math lives in `fanLayout.ts`.

Important helpers:

- `normalizedCardIndex`
- `centeredNormalizedPosition`
- `responsiveFanParameters`
- `horizontalFanPosition`
- `verticalFanCurve`
- `rotationCurve`
- `stableFanZIndex`
- `fanCardLayout`

The hand adapts to card count and viewport width. Center cards sit higher with stronger z-index priority. Selected cards lift and unrotate for readability.

### Overlay Travel

`StatCheckPage.tsx` tracks `travelingCards`, snapshots DOM rects, and renders animated card overlays through `TravelingCardsOverlay` / `TravelingCard`.

Travel kinds:

- `place`
- `return`
- `lane-move`
- `discard`
- `deal`

The ID for a traveling overlay uses `Date.now()` plus `Math.random()` only for React key uniqueness in presentation state. It is not engine randomness and does not affect draw order, category generation, or game outcomes.

### Click Placement

Click flow:

1. Select a hand card.
2. Click a lane.
3. `placeCard` queues travel and calls `assignCard`.
4. Clicking an occupied lane with no selected card returns that card to the hand.

Cards already assigned to a lane are hidden from the visible hand fan so no duplicate visual assignment remains.

### Pointer Drag

Pointer drag flow:

- `beginCardPointer` creates a pending `dragSession`.
- `moveCardPointer` promotes it to dragging after `DRAG_THRESHOLD_PX`.
- Hover and acceptance feedback uses `laneReaction`.
- `endCardPointer` drops on a lane if valid or calls `returnDraggedCardToHand`.
- Escape and pointer cancel clean up active drags.

Drag is covered by component tests. Codex browser drag QA has been flaky in headless/local tooling, so manual drag QA should be repeated by the next agent or by a human.

### Lane Hover And Acceptance

Lane hover state is held in `laneReaction`. Lanes can show hover, accepted, or invalid reaction states. This is presentation-only and should be cleared on restart, blur, animation-speed changes, and route unmount.

### Reveal, Damage, Discard, And Deal

Locking calls `resolveCurrentRound` immediately at engine level, then presentation steps reveal bot cards and resolve lanes over time.

The UI uses `activeResolution = match.lastResolution?.round === match.round ? match.lastResolution : null` so stale results from a previous round do not render over a new selecting round.

`nextRound` clears timers and transient presentation state, queues discard travel, dispatches `discard`, calls `startNextRound`, then schedules `deal` and `select` presentation steps.

### Reduced Motion

`usePrefersReducedMotion` reads the media query. `animationDuration` returns `STAT_CHECK_ANIMATION.reducedMotionMs` for reduced motion. In reduced motion, reveal jumps to resolved/match-over without waiting through the full staged timeline.

### Animation-Speed Control

`useSessionAnimationSpeed` stores speed in `sessionStorage` under `stat-check-animation-speed`. Changing speed during active travel/drag clears transient overlays and cancels active interaction state by design.

## 4. Architecture Map

- `src/pages/dev/stat-check/statCheckEngine.ts`
  - Pure-ish engine state, category definitions, deterministic shuffle, match creation, assignments, bot assignment selection, round resolution, round advancement, damage, margin calculations, and invariant validation.

- `src/pages/dev/stat-check/statCheckEngine.test.ts`
  - Engine regression coverage for category comparison, margins, thresholds, board/damage rules, HP endings, shared draw pile, deterministic deal/draw order, discard, preservation, exhaustion, and bot assignment legality.

- `src/pages/dev/stat-check/StatCheckPage.tsx`
  - React route and presentation shell. Owns interaction state, timers, drag state, overlay travel, render logic, lane UI, hand UI, discard UI, next-round intel, restart, speed controls, and motion/reduced-motion integration.

- `src/pages/dev/stat-check/StatCheckPage.test.tsx`
  - Component tests for placement, return, overlay cleanup, speed persistence, drag threshold/drop/cancel behavior, reduced motion, reveal resolution, next-round stale-state cleanup, restart cleanup, discard/intel continuity, and shared-pool label.

- `src/pages/dev/stat-check/animationConfig.ts`
  - Central animation timing constants, animation speed options, reveal timeline, duration helpers.

- `src/pages/dev/stat-check/animationConfig.test.ts`
  - Unit tests for animation duration, reduced motion, and speed validation.

- `src/pages/dev/stat-check/animationState.ts`
  - Presentation-step state machine and helper functions for reveal visibility and interaction gating.

- `src/pages/dev/stat-check/animationState.test.ts`
  - Unit tests for animation transitions and helper behavior.

- `src/pages/dev/stat-check/fanLayout.ts`
  - Pure normalized fan-layout helper module.

- `src/pages/dev/stat-check/fanLayout.test.ts`
  - Unit tests for fan layout symmetry, center priority, one-card layout, responsive parameters, and selected-card lift.

- `src/pages/dev/stat-check/fixtureDeck.ts`
  - Deterministic fallback champion card list. The route prefers League Docs stats when enough API-derived cards are available.

Related route registration:

- `src/App.tsx`
  - Lazy-loads `StatCheckPage` at `/dev/stat-check`.

Related data hooks:

- `src/hooks/useChampionBaseStats`
  - Provides League Docs stat rows.

- `src/hooks/useChampionAssets`
  - Provides champion image/icon assets.

## 5. Important Invariants

- Champion IDs are unique in the eligible roster used by `createMatch`.
- A champion identity should exist in only one location at a time:
  - `drawPile`
  - `playerHand`
  - `botHand`
  - `playerDiscard`
  - `botDiscard`
- A champion cannot be both active and discarded.
- Player assignments must reference cards owned by `playerHand`, except after a resolved/exhausted state where the cached resolution may still reference cards now in discard for presentation.
- Bot assignments must use three unique cards from `botHand`.
- A player card may be assigned to at most one lane.
- The player must assign exactly three cards before lock-in.
- Unplayed cards remain in hand across rounds and keep their identity.
- Played cards move permanently to discard and never return to `drawPile`.
- Replacement cards come only from the remaining shared `drawPile`.
- Draw order must stay deterministic.
- Bot cards stay concealed until the reveal sequence.
- The broad future clue must not leak exact category, level scope, or higher/lower direction.
- Input should be blocked during lock/reveal/resolution phases.
- Restart must clear timers, drag state, lane reaction, traveling overlays, selected card, cached presentation, discards, HP, assignments, and round state by recreating a fresh match.
- Route unmount and animation-speed/reduced-motion changes must not leave pending timers or stale overlays.

## 6. Current Verification Status

Latest Codex verification before this handoff:

- Stat Check test suite: passed.
  - Command:
    - `cmd /c npx vitest run src/pages/dev/stat-check/animationConfig.test.ts src/pages/dev/stat-check/animationState.test.ts src/pages/dev/stat-check/fanLayout.test.ts src/pages/dev/stat-check/statCheckEngine.test.ts src/pages/dev/stat-check/StatCheckPage.test.tsx`
  - Result:
    - 5 test files passed.
    - 70 tests passed.

- Changed-file ESLint after the shared-pile implementation: passed.
  - Command:
    - `cmd /c npx eslint src/pages/dev/stat-check/StatCheckPage.tsx src/pages/dev/stat-check/StatCheckPage.test.tsx src/pages/dev/stat-check/statCheckEngine.ts src/pages/dev/stat-check/statCheckEngine.test.ts`

- Production build: passed.
  - Command:
    - `cmd /c npm run build`
  - Existing warnings:
    - `VITE_COMBAT_API_URL` not set, so champion doc and pro-data sitemap entries are omitted.
    - No Supabase anon key, so blog sitemap entries are omitted.
    - Existing Supabase dynamic/static import chunk warning.
    - Existing large chunk warning.

- Browser QA actually completed in Codex:
  - Earlier in the V2 branch, browser QA verified desktop click placement, speed control, next-round stale-state cleanup, restart, and mobile placement smoke.
  - During the shared-pile pass, in-app browser localhost navigation was blocked with `ERR_BLOCKED_BY_CLIENT`.
  - A local production static server plus Playwright confirmed the route loaded, the `Shared pool` label rendered, private deck labels were gone, initial hand count was six, and a desktop click placement/lock/reveal/resolution path worked.
  - Full repeated browser QA for three rounds and drag across all resolutions has not been reliably completed in Codex due localhost/headless interaction timing issues.

## 7. Known Limitations

- Category-board generation is still basic:
  - It avoids duplicate exact categories in one board.
  - It avoids repeating the exact previous whole board.
  - It does not yet enforce stat-family diversity or redundant-profile constraints.

- Decisive thresholds are provisional:
  - Thresholds are per category and visible in UI.
  - They have not been calibrated against a large champion-stat distribution or gameplay telemetry.

- Bot strategy is basic:
  - It picks legal cards and maximizes current categories.
  - It does not preserve for future categories, read the future clue strategically, account for HP state, or model opponent behavior.

- There is no multiplayer or server-authoritative state.
- There is no persistence/reconnect support.
- There is no telemetry or balance instrumentation.
- There is no deckbuilding, rarity, items, abilities, champion ownership, or collectible system.
- Discard history is split visible piles of cards, not a richer chronological event log with lane/category metadata.
- Browser drag QA has not been fully repeated across desktop and mobile after the latest shared-pile checkpoint.
- Codex in-app browser blocked localhost during the latest QA attempt, and headless Playwright drag was inconsistent. Component tests still cover pointer drag behavior.
- The route uses League Docs stats when enough supported rows load, otherwise falls back to `fixtureDeck.ts`. QA often observes the fixture path because local env lacks the full data/API.

## 8. Recommended Next Work

### P0

- Fix only genuine correctness regressions:
  - duplicate champion identity bugs;
  - stale round presentation resurfacing;
  - incorrect damage/math;
  - broken restart/timer cleanup;
  - lock/assignment legality regressions.

### P1

- Run repeated human-versus-bot playtesting and deterministic simulation diagnostics.
- Improve category generation quality without changing the rest of the game.
- Add threshold calibration diagnostics for decisive-frequency distribution.
- Repeat manual drag and touch QA on desktop and mobile.
- Add strategic telemetry or debug summaries that help tune preservation decisions.

### P2

- Improve bot strategy once the core loop has enough evidence.
- Tune animation feel after correctness and readability are stable.
- Enrich result presentation and discard history if it helps learning and replayability.

Explicitly defer:

- multiplayer;
- deckbuilding;
- rarity;
- items;
- abilities;
- collectible systems;
- large visual effects;
- server persistence;
- reconnect support.

## 9. Safe Continuation Instructions

For the next Claude agent:

- Start by inspecting the current files and tests. Do not assume this handoff replaces reading the code.
- Reuse the existing engine and animation architecture.
- Do not replace `statCheckEngine.ts`, `animationState.ts`, or the fan-layout helpers wholesale.
- Preserve deterministic seeded tests.
- Keep changes focused and checkpoint one coherent task at a time.
- Avoid unrelated repository cleanup.
- Do not push, merge, deploy, rebase, reset, or remove worktrees unless the user explicitly asks.
- Prefer focused semantic tests over broad snapshots.
- For frontend work, verify desktop and mobile when tooling allows it, and honestly report browser-tool limitations.

## 10. Recent Checkpoint History

Verified with `git show --stat` before writing this document:

- `026b3373a435de8498fb60b34030be06e834137d`
  - Major Stat Check card animation transitions.
  - Added animation config/state files and tests.
  - Expanded page animation behavior.

- `ce70297205ee7c285706d4fcb02b8641377cecd4`
  - Interaction inspection controls.
  - Added pointer drag placement behavior and animation-speed control.
  - Expanded animation/page tests.

- `ff3af6fee38c33a4ad13ad3a8539dfd232d05a47`
  - Canonical lower-wins margin fix.
  - Visible decisive threshold UI.
  - Broad-only future stat-family clue.
  - Added rule-alignment regression tests.

- `1c08ec68025100352e0bb6cc62713ffcf02fe238`
  - Canonical shared champion draw pile.
  - Removed split player/bot deck state.
  - Added shared-pool invariants and tests.
  - Updated UI to show shared remaining pool count.

## 11. Suggested First Claude Task

Run repeated deterministic bot/human simulation diagnostics to inspect category-board quality and decisive-threshold frequency without changing gameplay yet.
