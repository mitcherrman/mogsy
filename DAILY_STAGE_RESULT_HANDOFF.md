# DC-LANE-C — Daily stage result (frontend)

Frontend only. No backend changes.

## Baseline
- `origin/main` = `1d4ed80f`. It is an ancestor of `dcsurv/survival-ux` @ `fe33aaa7`, so that branch still applies cleanly. This branch (`dclane-c/daily-stage-result`) is built on top of it.
- Backend contract read, not modified: `League_Combat_Simulator` `dcsurv/integrate-master` @ `622b7bf1` (`ranked_rulesets/contract.py` `view()`, `daily_challenge/wiring.py` `_live`).

## Flow
stage gameplay → Daily stage result (Ranked end-screen language) → **Continue** → next stage tag … → Review → Review's stage result → **See today's results** → final completion (unchanged).

- The result no longer disappears on a timer. It stays up until the player presses Continue.
- Continue exists only in the `stage-result` phase, and that phase only exists after the parent run has advanced past the stage. `continueFromResult` clears a presentation latch. It never calls the transport. A boundary test guards this.
- The next stage is not launched until Continue, so no child clock starts behind the result.
- While the stage is scoring (`stage-settling`), the same screen is shown with "Scoring stage…" and a disabled "Scoring…" button.
- Review now gets its own stage result before the final completion. The final completion screen itself is not redesigned.

## Reuse
`DailyStageResult` renders `ResultHero` (the mascot, eyebrow, headline and score used by Ranked and the other modes), `ResultStatGrid` and `ResultActions`. `buildDailyStageResult` fills the shared `GameResultsModel`:
- `state: "complete"` always. The screen never says Victory, Defeat or Draw.
- The eyebrow reads `Daily Challenge · Stage N of M`, or `Final stage` for Review.
- The only action is Continue. There is no Play Again, no Ranked queue and no lobby exit.

| kind | headline | score |
|---|---|---|
| Standard / Weak Areas | Stage complete | correct / answered |
| Time Trial | Time's up (bank drained) · Stage complete | correct / answered |
| Survival | Out of strikes · Survived | correct, with **no denominator** |
| Review | Review complete | correct / answered, with no "for Review" stat |

## Monetization placement (not wired)
`DailyRunPage` takes an optional prop `stageResultPlacement(ctx) => ReactNode`. Its output renders between the result content and Continue, and only once the result is settled. `ctx` contains ids and the stage kind, and nothing it could use to advance the run. Continue sits outside the slot and never waits on it. Production passes nothing.

## Survival contract
- `ranked-public/contracts.ts` reads `payload.ruleset.live_strikes` and `payload.ruleset.own_stage_finished`. Both are null when absent.
- `survivalHumanFinished`: when `own_stage_finished` is a boolean, it is the whole answer. The DC-SURV-UX inference is only a fallback for older payloads.
- `survivalStatus.strikesUsed` = `live_strikes ?? strikes`.
- Daily `live.strikes.live` and `live.own_stage_finished` are read. `projectDailyFlow` moves a Survival stage to `stage-settling` when `own_stage_finished` is true. The child stays mounted but hidden and keeps polling. Whichever signal arrives first wins: the arena's or the Daily's.
- The chrome shows the larger of Daily `used`/`live` and the arena's live count.

## Remaining backend dependency
- `dcsurv/integrate-master` (which provides `live_strikes` / `own_stage_finished` in both the Ranked public projection and Daily `_live`) must reach backend `master` and production. Until then the frontend falls back to the DC-SURV-UX inference, and no Daily `own_stage_finished` arrives.
- The stage result (`correct`, `answered`, `score`, `ended_by`, `misses`) is read unchanged from the existing `result` contract. Survival shows no strike count on the result because the settled `result` does not carry one. A `strikes` field on the result would allow it.
