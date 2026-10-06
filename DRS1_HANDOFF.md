# DRS1 — Daily stage-result stability

Local only. Not pushed, not published.

## 1–2. Base / branch
Base `d84c0ddd1785f7829206a14d2379691c28a329a6` (origin/main, SCBS1). Branch `drs1/daily-result-stability`, worktree `.worktrees/drs1`.

## 3. Real result-variant census (settled, measured in the real `/quiz/daily-challenge` page)
| kind | snapshot tiles | snapshot section 1280 / 375 | headline | closing row |
|---|---|---|---|---|
| Standard / Weak Areas | Answered, Accuracy, Points, For Review (hint) = 4 | 93 / 156 | Stage complete | Up next |
| Time Trial | + Finish ("The bank ran out") = 5 | 174 / 237 | Time's up / Stage complete | Up next |
| Survival | + Finish ("Out of mistakes") = 5 | 174 / 219 | Out of strikes / Survived | Up next |
| Review | Answered, Accuracy, Points = 3 (no For Review, no early end) | 74 / 137 | Review complete (**2 lines at 375**) | none / "Nothing to review" |
| pending (all) | — | one "Scoring stage…" line (18 / 16.5) | "Stage over" | none |

Other measured regions (same in every kind): StageTag 30, subheading 20, hero score row 60 / 48 plus label (hero +99 / +87 once scored), ladder 26.5 / 61 (5 stages wraps to 3 rows at 375), Continue 44.

## 4. BEFORE (base components, the new spec, frame-by-frame; card top / height pending → settled)
| 1280×800 | pending | settled | movement |
|---|---|---|---|
| Standard | 196.3 / 431.5 | 90.3 / 643.5 | **106.0 up, +212 tall** |
| Time Trial | 196.3 / 431.5 | 49.8 / 724.5 | **146.5 up, +293 tall** |
| Survival | 196.3 / 431.5 | 49.8 / 724.5 | **146.5 up, +293 tall** |
| Review | 196.3 / 431.5 | 118.8 / 586.5 | **77.5 up, +155 tall** |

375×812: the card grows 265–346px (Review 243), the ladder, snapshot, Continue and the hero's lower half all move 87–346px, and Review's headline wraps (+36). Survival's chrome also changes (see §11).

## 5. Derived frame contract
Every part that arrives when the server states the result has a slot already present while pending:
- **Hero score + label**: `ResultHero reserveScore` — an invisible, aria-hidden row in the score's own type (`text-5xl/sm:text-6xl leading-none` and the 10px label), holding 60/48px + the label. No digit or word is printed.
- **Headline**: a Review has one headline whatever its result, so the pending model states it (`Review complete`). The other kinds keep "Stage over" (one line at both widths).
- **Snapshot**: `SNAPSHOT_FLOOR[kind]` — the measured height of the section with every optional tile for that kind, rounded up to the next quarter-rem: review `8.75rem / sm 4.75rem`, standard & weak areas `10 / 6`, time trial & survival `15 / 11`. (Cell count bounds the rows: 3 / 4 / 5 tiles; the Finish tile wraps to two lines in a quarter-width tile; the For Review tile carries a hint.)
- **Up next / closing**: a one-row slot, `1.375rem` (the 22px tag row).
- **Ladder**: `StageLadder reserveMarks` holds the highlighted stage's "✓" width (only the stage being scored can change status). Without it a five-stage ladder re-wraps on a phone.
Settled content fills these; a result with fewer tiles than its kind's maximum leaves the slot partly empty.

## 6. Files changed
`src/pages/quiz-daily-challenge/run/DailyStageResult.tsx`, `…/StageTag.tsx` (opt-in `reserveMarks`), `src/components/game-results/ResultHero.tsx` (opt-in `reserveScore`, default off), `src/lib/daily-challenge/run/stageResultModel.ts` (Review pending headline); new `e2e/nav1/daily-result-stability.spec.ts`, `DailyStageResult.frame.test.tsx`. CanonicalArena, the hosted handback, SCBS1 and Daily timing are untouched.

## 7. Implementation
As §5. No ResizeObserver, no DOM measurement at runtime, no delays, no animation, no invented figures, no data-flow change. Shared components change only through default-off props.

## 8. AFTER (same spec, same frames)
Card top / height identical pending → settled for every kind: 1280×800 Standard 88.8 / 646.5, Time Trial 48.8 / 726.5, Survival 48.8 / 726.5, Weak Areas 88.8 / 646.5, Review 98.8 / 626.5; 375×812 Standard 149 / 717, Time Trial 149 / 797, Survival 162.5 / 797, Weak Areas 149 / 751.5, Review 142.5 / 767.5. **0.0px** on shell, run box, StageTag, hero, headline, subheading, snapshot slot, next slot, ladder, Continue, and DailyStageChrome, in every painted frame (≈120–180 pending frames, ≈74 settled per run).

## 9. Base failure proof
The same spec run against `d84c0ddd`'s four source files (swapped in place, then restored): **10 / 10 fail**. Candidate: **10 / 10 pass**.

## 10. Tests
- New browser spec, 10/10 (5 kinds × 1280×800, 375×812): real `DailyRunPage` + hosted match to terminal, per-frame rects, no clipping (card inside its run box), no vertical scroll at 1280 and an unchanged scroll extent at 375.
- Unit: `DailyStageResult.frame.test.tsx` 7/7; `quiz-daily-challenge`, `game-results`, `lib/daily-challenge`: 119/119 (11 files).
- SCBS1 focused regression on this tree: 8/8. Daily stage-play smoke (Standard/Review, Time Trial, Survival through reveals) at 1280×800 and 375×812: 6/6.
- `tsc`: 6 errors, none in touched files (same 6 as base); ESLint clean on touched files. Not run: the Phase-1 matrix.

## 11. Visual tradeoffs / findings
- Phone cards are ~4px taller than the old settled card (quarter-rem slack) and a Review is ~40px taller (it now holds the closing row it rarely fills). The result card on a 375×812 phone is taller than the viewport for Standard and up (page scroll 66–160px) — it already was once settled; the **pending** card now scrolls identically instead of jumping to it.
- "Scoring stage…" sits at the top of its reserved snapshot area, with empty space below until the numbers land.
- Font slack: floors were measured with the CI fallback font; a wider production face could exceed a floor by a few px (the slot then grows, the previous behaviour). Quarter-rem slack mitigates, it does not remove.
- **Not fixed (separate, DailyStageChrome):** on a phone a Survival stage's chrome prints "N answered ·" while the hidden child settles and drops it at the result, so the chrome un-wraps a row (−20px). The spec compares the Survival-phone card within the chrome and does not assert that chrome.
- Historical I1 untouched, as instructed.

## 12–13. Result SHA / readiness
See `git log -1` on the branch. Ready for command-center review.
