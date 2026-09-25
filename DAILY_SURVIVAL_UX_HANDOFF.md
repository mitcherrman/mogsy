# DC-SURV-UX — Survival frontend completion

Frontend only. No backend, GR1, scoring, timer or strike-computation changes.

## Baseline
- Fetched `origin/main`: `1d4ed80f0220ae34ba008d358618360326c30eff` (unchanged from the ATLAS2 integration)
- Branch `dcsurv/survival-ux`, worktree `mogsy/.worktrees/dcsurv-ux`
- Backend read (not modified): `dcsurv/survival-design` @ `b74a41e6` (`DAILY_SURVIVAL_HANDOFF.md` §11, §12.8)

## Files changed
| file | change |
|---|---|
| `src/lib/ranked-core/survivalFinish.ts` (new) | `survivalHumanFinished`, `survivalStatus`: pure reads of server state |
| `src/lib/ranked-public/contracts.ts` | `StageRulesetView` also reads `max_strikes`, `strikes`, `questions_settled`, `stage_ended` (optional, null when absent) |
| `src/lib/ranked-core/flow/matchHost.ts` | optional `onPlayerFinished`, `onSurvivalStatus` on the existing hosted-match seam |
| `src/pages/quiz-ranked/QuizRankedMatch.tsx` | hosted Survival: at the finish, stop presenting gameplay (host placeholder) and report once; relay status |
| `src/lib/daily-challenge/run/flow.ts` | `finishedChild` latch → the existing `stage-settling` phase |
| `src/pages/quiz-daily-challenge/run/useDailyRun.ts` | handlers for the two new host callbacks |
| `src/pages/quiz-daily-challenge/run/DailyRunPage.tsx` | while settling, the child stays mounted **hidden** so it keeps polling |
| `src/pages/quiz-daily-challenge/run/DailyStageChrome.tsx` | Survival readout: `N answered · ✕✕○ x / 3`; the header wraps on narrow widths |
| tests | `survivalFinish.test.ts` (new), `QuizRankedMatch.hosted.test.tsx`, `DailyRunPage.test.tsx` |

Reused, not duplicated: `MatchHost` handback seam, the `stage-settling` / `StageResultBeat` interstitial, `StrikesMeter`, `plannedRoundTotal` (it already returns no denominator for Survival).

## `own_finished` handling
`own_finished` alone is **not** the signal, because every one-card Splash sets it on each answer. The human's Survival is over when:
- ruleset is `survival` **and** `own_finished` **and** one of:
  - `own_challenges_completed < challenge_count`: the PRE-4 early stop, which only strike exhaustion causes, or
  - the public ledger's `stage_ended === true`.

Flow once that is true (hosted match only):
1. The arena stops presenting gameplay at once. It renders the host's placeholder, with no question, no later child and no opponent cards, and calls `host.onPlayerFinished(matchId)` once.
2. The Daily moves to `stage-settling` at once and shows the `StageResultBeat` in its pending state ("Scoring stage…").
3. The child match stays mounted but hidden. Its polls are what drive the bot (`_drive_bot` runs inline on the player's own requests), so the server can finish settling.
4. When the server ends the match, the ordinary `onMatchSettled` handback fires. That triggers the existing `sync`, the parent advances, and the result beat and next stage tag follow.

The client never advances the parent on its own. It only changes what is presented.

## Status / denominator
- Chrome shows `12 answered · [✕][✕][ ] 2 / 3`. "Answered" is the ledger's `questions_settled` from the public round.
- Strikes are the larger of two server ledger readings: the Daily `live.strikes` and the public ruleset `strikes`. Strikes never go down within a stage.
- There is no denominator anywhere. `plannedRoundTotal` is already null for Survival, and the 175 ceiling is never shown.
- The bot has no ledger, so its mistakes cannot change these numbers.

## Mobile / desktop
Checked in a real browser with a throwaway probe (not committed):
- 375px: the header wraps into a title row and a status row, with no overlap.
- 1280px: the header stays on one row, with no overflow.
- A 4px horizontal overflow at 375px (`scrollWidth` 379) is **pre-existing**. It measures the same with the Survival status removed.

## Tests
- Focused suites: 125 files, 1478 tests, all pass (`src/lib/{ranked-core,ranked-public,daily-challenge}`, `src/pages/{quiz-daily-challenge,quiz-ranked}`).
- Full `npm run build` passes.
- `tsc -p tsconfig.app.json`: 35 errors, all pre-existing and identical to baseline. 0 new.

## Remaining backend integration dependency
- **Gap: strike 3 on the last child of a block, including any Splash.** The ledger folds a block's mistakes only at settlement, which waits for the bot. The finish signal therefore fires once `stage_ended` publishes, and not at the instant of the answer. Because the bot acts inline on the player's request, this is normally one poll. A per-player live `strikes` value that includes the unsettled block, or `own_eliminated` in `segment_state`, would make it exact. The mid-block case is exact today.
- Survival backend must be integrated to production before any of this is reachable.
- If the child never settles, the pending beat waits without timing out. The hidden child keeps polling, and the existing sync error and retry apply after the handback.
