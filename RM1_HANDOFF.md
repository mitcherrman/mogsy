# RM1 — Ranked Match Shell Refinement

- **Audit:** complete (read-only).
- **Pass 1 — module scoring/history plumbing:** COMPLETE. Branch `rm1/pass1-module-history`,
  worktree `/Users/macmoney/mogsy-wt-rm1-pass1`, based on `origin/main` (`a3a35921`). Uncommitted.
- **Pass 2 — banner + Match Header redesign:** NOT STARTED. Awaiting review of Pass 1.

Audited: `mogsy` frontend. Backend repo `League_Combat_Simulator` inspected for payload
availability only — **no backend change was made or is needed.**

## Objective

Restyle the Ranked match shell — Player Columns as floating dark-navy pointed banners,
a simplified header with a large central timer that rotates into the personal result,
animated score awards, and per-module history bubbles — **without touching scoring,
matchmaking or game logic.**

## Approved decisions

- Keep existing Ranked structure and functionality.
- Player Columns keep mascot, identity/role, points, answer state, match history.
- Restyle Player Columns → floating dark-navy banner shapes with pointed bottoms.
- No top rod / hanging hardware. No large academy crest. No bottom slogans.
- Question Stage: largely unchanged.
- Module Rail (round timeline): largely unchanged for now.
- Match Header: simplified; timer much larger and more central.
- Timer resolves → rotates into the personal result: `CORRECT` then `+2 POINTS`.
- No `LOCKED IN` phase in the header.
- After the result, briefly show the next module title, then start the next timer.
- Player Column scores animate on award; base points pop, then a separate `+1` for speed bonus.
- Meta Reflex: per-question `+1` feedback plus a bonus popup when the speed goal is met.
- Module-history bubbles in each Player Column: `+0`/`+1`/`+2`/`+3`, green for positive,
  red for `+0`, small white dot top-right = that module also earned the `+1` speed bonus.
- Same bubble language later reused on the end screen (player row over opponent row, 10 modules).

## Relevant files

| Concern | File |
| --- | --- |
| Outer frame / stage floor / header row geometry | `src/components/ranked-arena/ArenaShell.tsx` |
| Arena composition: header strip, 3-column grid, HUD, timeline | `src/components/ranked-arena/CanonicalArena.tsx` |
| **Player Column** (both sides) | `src/components/ranked-arena/CombatantPanel.tsx` |
| Timer | `src/components/ranked-arena/TimerDisplay.tsx` |
| Header result plates | `RoundResultBeat.tsx`, `SegmentResultBeat.tsx`, `CardResultBeat.tsx` |
| Question Stage | `CanonicalArena.tsx` `data-testid="ranked-question"` + `.ranked-question-stage` in `src/index.css` |
| Module Rail | `src/components/ranked-arena/RoundTimeline.tsx` + `src/lib/ranked-core/roundTimeline.ts` |
| View-model contract | `src/lib/ranked-core/arenaView.ts`, `src/lib/ranked-core/viewTypes.ts` |
| Ranked projector (mode → view model) | `src/pages/quiz-ranked/QuizRankedMatch.tsx` |
| Match state / settlement log | `src/pages/quiz-ranked/useRankedMatch.ts` |
| Combatant identity projection | `src/pages/quiz-ranked/rankedViews.ts` |
| Award projection | `src/lib/ranked-core/pointsFeedback.ts` |
| History projection | `src/lib/ranked-core/settlementViews.ts` (`projectRoundHistory`) |
| Skin (`.ranked-academy`, `.ranked-panel`, `.ranked-folio`, `.ranked-score-bump`) | `src/index.css` |
| End screen | `MatchOverFrame.tsx`; on `origin/main` also `src/components/game-results/*` + `src/pages/quiz-ranked/rankedResultsModel.ts` |

## Current architecture

`QuizRankedMatch` (the mode) projects one `ArenaViewModel` per render.
`CanonicalArena` renders it and owns **no** data access. Layout is four stacked bands
inside `ArenaShell`: header strip → 3-column grid (`23fr / 54fr / 23fr`) → HUD row → timeline.

- **Player Column** = `CombatantPanel`, a single `<section>` with `rounded-xl border-2 bg-card`.
  Order: `RoleCrest` (mascot) → identity header (name + role tag + optional Lv badge) →
  `ScoreTally` (or `HealthMeter`) → `RoundLedger` (`flex-1`) → optional `ExperienceMeter` →
  one reserved row that is either `OutcomeState` (reveal verdict + `+base` + `⚡+bonus` chip)
  or `RoundStatus` (`Answer locked` / `Thinking…`).
  The opponent column is a strict horizontal mirror driven by `isMirroredSide()`.
- **Score updates** propagate: backend round settles → `useRankedMatch` adapts it →
  `combatants[].score` from `scoreByPlayerId` (`rankedViews.ts`) → `rail()` in
  `QuizRankedMatch` → `CombatantPanel` → `ScoreTally`. The tally already animates:
  `key={score}` remounts the span and replays `.ranked-score-bump` (520ms, reduced-motion safe).
- **Speed bonus** is already first-class: `ModulePointsAward = { basePoints, speedBonusPoints,
  pointsAwarded, scoreBefore, scoreAfter }`, per player, on every settlement
  (`settlement.modulePoints[playerId]`). `projectPointsFeedback` splits it into
  `baseLabel` / `basePoints` / `speed{label,points}`; the `⚡+1` chip already renders.
- **Meta Reflex** live feedback is `CardResultBeat`, fed by `projectCardBeat`
  (`ArenaCardBeat = {outcome, cardNumber, challengeIndex, roundNumber}`). Its `+1 POINT` /
  `+0 POINTS` string is a **client-side constant**, not a server number. The block's speed
  bonus only exists at block settlement, via `speedBonusPoints` on the segment's award.
- **Module Rail** = a 9-node moving window anchored at index 4, node plate = `QuizTimelineNode`.
- There is **no `LOCKED IN` phase in the header** today — that copy lives only as the
  `Answer locked` chip inside each Player Column.

## Data availability

| # | Question | Answer |
| --- | --- | --- |
| 9 | Opponent role/mascot identity in the live payload? | **Yes.** `rankedViews.ts` projects `roleId`, `tag` and `identityMode` for both participants; `identityMode` is a property of the **match**, so both columns take the same layout. Opponent *name* is a derived label (Ranked publishes no display names on the live view). |
| 10 | Per-module base points + speed-bonus flag live for **both** players? | **Yes, already on the wire.** `settlement.modulePoints[playerId].basePoints` / `.speedBonusPoints` exist for every player on every settled round. The gap is purely frontend: `projectRoundHistory` currently keeps only `pointsAwarded` (the total) and **discards** base/bonus. |
| 11 | Can the end payload render both players' 10-module rows? | **Not as-is, but no backend work is required.** The result payload carries only `finalScores`. `MatchReviewView.rounds[].viewerSubmission` is **viewer-only and carries no points**. The workable source is the client settlement log, which holds both players and both award fields — but `DAMAGE_LOG_LIMIT = 8` in `useRankedMatch.ts` truncates it below a 10-module match. Raising it to cover `scoring.matchLength` (and widening the `backfillDamageLog` range, which already uses the per-round `getResolvedRound` endpoint) closes it frontend-only. |

**Nothing in the approved RM1 plan requires new backend or API work**, provided the end-screen
rows are sourced from the settlement log rather than the review payload. The one thing the
backend does *not* publish is a per-card Meta Reflex award — the live `+1` there stays a
presentation constant, and the block speed bonus still arrives only at block settlement.

## Risks

1. **Branch divergence.** This checkout (`fb1/question-and-page-reporting`) has **deleted**
   `rankedResultsModel.ts`, `useMatchTimeline.ts` and the `MatchOverFrame` `identity` slot that
   exist on `origin/main`, and lacks `src/components/game-results/*` entirely. RM1 must be
   branched from `origin/main`, not from here.
2. **ES1 / results collision.** `MatchOverFrame` and `CombatantPanel` are the shared surface.
   `MatchOverFrame` renders `CombatantPanel` for both duelists (no ledger), and on `main`
   Ranked replaces that with a compact `identity` strip. The bubble language lands in
   `CombatantPanel`; the end-screen rows land in the `game-results` stack. Keep the bubble as
   its own small component so both consume it rather than forking it.
3. **Shared non-Ranked callers of `CombatantPanel`:** Daily Challenge (`dailyArenaView.ts`),
   the staff duel prototype, the arena inspector, the playtest host. A banner silhouette must
   stay opt-in or be verified against all four (Daily is an HP/score panel with different rows).
4. **Layout invariants that existing tests enforce.** `QuizRankedMatch.geometry.test.tsx`
   forbids internal scroll containers; `bottomInvariant.test.tsx` forbids a result surface
   below the HUD; the header strip reserves `min-h-[3.5rem]`; `OutcomeState` and `RoundStatus`
   share **one** reserved row so settlement moves nothing. A much larger timer and a
   rotating result must not change the strip's reserved height mid-match.
5. **`.ranked-panel` is `overflow: hidden`.** A pointed-bottom banner drawn with a clip-path or
   pseudo-element must not rely on overflow, and anything hung off the header (the transcript
   popover precedent) must stay absolutely positioned with an explicit z-index — `.ranked-shell > *`
   pins every child to `z-index: 1`.
6. **Beat sequencing.** "result → next module title → next timer" must sit inside the existing
   `revealHold` window, which the mode already owns and lengthens for level-ups and evidence.
   The arena must not grow its own clock.

## Next implementation step (as planned at audit time — steps 1–4 DELIVERED in Pass 1 below)

Branch from `origin/main`. Then, in file order:

1. `src/lib/ranked-core/viewTypes.ts` — add `basePoints` and `speedBonus: boolean` to `RoundHistoryEntry`.
2. `src/lib/ranked-core/settlementViews.ts` — populate both in `projectRoundHistory` from `settlement.modulePoints[playerId]`.
3. `src/pages/quiz-ranked/useRankedMatch.ts` — raise `DAMAGE_LOG_LIMIT` to cover a full points match and widen `backfillDamageLog`'s round range to match.
4. New `src/components/ranked-arena/ModuleBubble.tsx` — the `+N` bubble (green / red, white speed dot). One component, used by the column and later by the end screen.
5. `src/components/ranked-arena/CombatantPanel.tsx` — replace `RoundLedger`'s rows with a bubble strip; apply the dark-navy pointed-banner silhouette behind an opt-in prop so the Daily / prototype / inspector callers are unaffected.
6. `src/components/ranked-arena/TimerDisplay.tsx` — large central timer variant, plus the resolve→result rotation driven by props (no internal clock).
7. `src/components/ranked-arena/CanonicalArena.tsx` — simplify the header strip around the enlarged timer; keep the reserved min-height and the single result slot.
8. `src/index.css` — banner silhouette, timer rotation and award-pop keyframes, all transform/opacity only, all reduced-motion guarded.
9. `src/pages/quiz-ranked/QuizRankedMatch.tsx` — supply the next-module title and the result-rotation state from the existing `revealHold` window. No scoring, matchmaking or settlement logic changes.


---

# Pass 1 — module scoring/history plumbing (COMPLETE)

Scope honoured: data/history layer plus the reusable bubble component **only**. No banner
styling, no Match Header change, no `CombatantPanel` redesign, no new score animations, no
Meta Reflex visual change, no end-screen UI, no backend change, no scoring-rule change.

## Files changed

| File | Change |
| --- | --- |
| `src/lib/ranked-core/viewTypes.ts` | `RoundHistoryEntry` gains `basePoints?: number \| null` and `speedBonusPoints?: number \| null`. |
| `src/lib/ranked-core/settlementViews.ts` | `projectRoundHistory` reads `settlement.modulePoints[playerId]` once and passes base, bonus and total through unchanged. |
| `src/pages/quiz-ranked/useRankedMatch.ts` | `DAMAGE_LOG_LIMIT` 8 → 12. `mergeSettlements` and `backfillDamageLog` both read that one constant, so retention and resume-recovery moved together. |
| `src/components/ranked-arena/CombatantPanel.tsx` | New `LEDGER_VISIBLE_ROWS = 8`; `RoundLedger` caps its drawn rows at it. **Behaviour-preserving only** — the visible ledger is byte-for-byte what it was before the buffer grew. |
| `src/components/ranked-arena/ModuleBubble.tsx` | **NEW.** The reusable bubble. |
| `src/components/ranked-arena/ModuleBubble.test.tsx` | **NEW.** 7 tests. |
| `src/lib/ranked-core/settlementViews.moduleHistory.test.ts` | **NEW.** 7 tests, including the end-screen feasibility proof. |
| `src/pages/quiz-ranked/useRankedMatch.test.tsx` | Harness now publishes `module_points` (exported `awardFor(n, playerId)` rule); 4 new retention/backfill tests. |

## Data flow: settlement → history → ModuleBubble

```
backend resolved-round projection  (module_points, per player_id)
  → adaptBackendSettlement()       ResolvedRoundView.modulePoints[playerId]
                                     = { basePoints, speedBonusPoints, pointsAwarded, … }
  → useRankedMatch                 damageLog: ResolvedRoundView[]
                                     • live capture as each round settles
                                     • backfillDamageLog() on resume, via getResolvedRound
                                     • mergeSettlements(): dedupe on roundNumber,
                                       sort ascending, trim to DAMAGE_LOG_LIMIT (12)
  → projectRoundHistory(log, id)   RoundHistoryEntry[] — oldest first, one row per module,
                                     carrying basePoints / speedBonusPoints / pointsAwarded
  → <ModuleBubble basePoints speedBonusPoints />
```

`projectRoundHistory` is called once per player (`QuizRankedMatch.tsx` already does exactly
this for `roundHistory.player` / `roundHistory.opponent`), so both rows come from one log in
one order by construction.

## Confirmations

- **Full 10-module retention:** yes. The buffer holds 12 and the resume backfill requests the
  same 12, so a complete 10-module points match is retained with no gaps — module 1 included,
  which is precisely what the old bound of 8 dropped. Verified by test: the log is
  `[1…10]` and every one of the ten rounds is requested from the backend.
- **Still bounded:** yes. An HP match ends on health and may run indefinitely; a 16-round match
  still trims to the most recent 12. This did not become unbounded history.
- **Both players supported:** yes. `modulePoints` is keyed by player id, so the viewer's and the
  opponent's rows are the same projection with a different id. Tested with deliberately
  asymmetric awards (differing in base *and* in bonus) so a projection that read one player's
  award for both would fail rather than pass by coincidence.
- **No scoring change:** no scoring rule was read, restated or re-derived. "Did this earn a
  bonus" is `speedBonusPoints > 0` — the server's own figure — never a timing comparison.
  `pointsAwarded` is still the engine's banked total and is never recomputed.
- **Null is preserved as null.** An hp round, or a settlement from a backend predating
  `module_points`, yields `null` for all three — never `0`. A `+0` bubble is the claim that a
  module scored nothing; "the settlement did not say" is a different statement, and the bubble
  renders that neutrally as `—`.

## ModuleBubble contract

- Prints the **base** award: `+0`, `+1`, `+2`, `+3`, … The bonus is **never** added in.
  `+2` with a dot banked three points and still reads `+2`.
- Positive base → green; zero → red; unscored (`null`) → neutral `—`.
- Speed bonus → small white dot at the top-right, `aria-hidden` decoration.
- Accessible names: `0 points` · `1 base point` · `2 base points` ·
  `2 base points, plus 1 speed bonus` · `Module not scored`.
- Observable without colour: `data-base-points`, `data-speed-bonus`.
- Takes no round number, player, side, mirroring or layout — `className` is for placement only.
  Ready for RM1 Pass 2 (`CombatantPanel` strip) and ES1 (end-screen comparison) without a fork.

## Test results

| Suite | Result |
| --- | --- |
| `ModuleBubble.test.tsx` | 7 passed (+0 no speed; +1 no speed; +2 with speed; +3 with speed; unscored; label vocabulary; glyph does no arithmetic) |
| `settlementViews.moduleHistory.test.ts` | 7 passed (base/bonus/total split; per-player awards; real 0 vs unscored; hp round nulls; **10-module feasibility proof** ×3) |
| `useRankedMatch.test.tsx` | 20 passed (4 new: ten modules retained oldest-first; all ten requested; backfill preserves base+speed for both players; still bounded) |
| Ranked sweep — `ranked-arena` + `ranked-core` + `quiz-ranked` | **95 files / 1179 tests passed** |
| Downstream consumers — Daily Challenge, `game-results`, arena inspector, staff duel, playtest host | **23 files / 398 tests passed** |
| `tsc --noEmit` | no new errors; every reported error is pre-existing and in unrelated files (admin, combat-lab, community, feedback, pglite) |

Run vitest **serially** (one vitest process at a time) and **without** `--poolOptions.forks.singleFork`:
single-fork mode times the sweep out and fabricates ~38 failures.

## Meta Reflex, deliberately unchanged

`CardResultBeat`'s per-card `+1 POINT` is still a client-side presentation constant, and the
block's speed bonus still arrives only at block settlement. The permanent module bubble for a
Meta Reflex round will therefore show the block's **final base total** from `modulePoints`,
which is already in the history rows. Per-card `+1` animation is Pass 2.

## Next implementation step (Pass 2 — awaiting review)

1. `CombatantPanel.tsx` — replace `RoundLedger`'s rows with a `ModuleBubble` strip; apply the
   dark-navy pointed-banner silhouette behind an opt-in prop so the Daily / staff duel /
   inspector / playtest callers stay unaffected.
2. `TimerDisplay.tsx` — large central timer plus the prop-driven resolve→result rotation (no
   internal clock; drive it from the existing `revealHold` window).
3. `CanonicalArena.tsx` — simplify the header strip around the enlarged timer; keep the
   reserved `min-h-[3.5rem]` and the single result slot.
4. `index.css` — banner silhouette, timer rotation, award pops. Transform/opacity only,
   reduced-motion guarded.
5. `QuizRankedMatch.tsx` — supply the next-module title and the rotation state.

ES1 remains the conflict surface: `MatchOverFrame` and `CombatantPanel` are shared, and the
end-screen rows belong in the `game-results` stack consuming this same `ModuleBubble`.
