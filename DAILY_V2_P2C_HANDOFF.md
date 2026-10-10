# DV2-P2C — one opening beat on a v5 Daily

Date: 2026-10-09 · Frontend only · branch `dv2/p2c-single-opening`, **not merged, not published (Lovable)**. Backend untouched.

## 1. Why

Playtesting showed two intro screens in a row when a fresh v5 Daily opened:

1. the Daily intro (`daily-intro`): date, "Daily Challenge", "Today's Challenge", the Standard tag, the content line, Standard's rule, "More Challenges and Review open after — both optional";
2. Standard's own stage tag (`stage-intro`): "Today's Challenge", the Standard tag, the content line, the rule.

The decision: for v5+, show exactly one opening beat that says **Daily Challenge**, then go into Standard.

## 2. Base

| Ref | SHA |
|---|---|
| Frontend `origin/main` (fetched 2026-10-09) | `cecdba76ff8a337195f8314025973e89b0a2fd9d` |

The command center had last seen `b9e2e493`. `origin/main` has since moved one commit, to `cecdba76` (the S1-INT3 OWN1.1 merge). That commit doesn't touch the Daily. The DV2-P2 integration (`ef2a9907`) is an ancestor of `cecdba76`.

## 3. Confirmed duplication (source read, before any change)

- `useDailyRun` sets `dailyIntroUp` on every fresh arrival: Play (`autoStart`), a reload onto an untouched run, and `start()` (Try again after a failed start). `projectDailyFlow` turns that into `daily-intro` for `DAILY_INTRO_MS`.
- The stage-tag effect is gated on `!dailyIntroUp`. Once the intro clears, the untouched Standard gets `stageIntroFor`, so `stage-intro` plays for `STAGE_INTRO_MIN_MS`. The launch effect is also gated on `!dailyIntroUp` and on `stageIntroFor === stage.id`.
- So the two beats are deliberately run one after the other. The second beat is the one that covers Standard's child creation.

## 4. Change

The Daily intro is skipped for v5+. Standard's tag becomes the opening. All stage-launch machinery is untouched.

- `flow.ts` has two new pure predicates:
  - `opensWithDailyIntro(run)` is true only for v1–v4.
  - `isDailyOpeningStage(run, stage)` is true only for the v5 MAIN stage (Standard, index 0).
- `useDailyRun.ts`: all three fresh-arrival sites now call `playDailyIntro(run)`, which only sets the latch for v1–v4.
  - Nothing else changed: the stage-tag effect, the launch effect, `launch()`, retries, interaction ids, `introduced`, `freshChildren` and the P2A.1 latch.
- `DailyRunBeats.tsx`:
  - `StageIntroBeat` draws the v5 opening as a `major` beat containing only `<h2>Daily Challenge</h2>`, with `data-opening="main"` and the same `daily-stage-intro` test id.
  - A failed launch still shows its error and Try again there. That block is now a shared `LaunchError`.
  - `MainDailyIntro` was removed. `DailyIntroBeat`'s v5 branch is no longer reached; if it ever were, it would only show the title.
- `DailyRunPage.tsx`: while the opening is up, the header names no stage (`stage={null}`), the same header the old Daily intro had: "Daily Challenge" and the exit link. Once gameplay starts, the header shows "Today's Challenge · Standard · content" as before.

### Why launch safety is unchanged

On a v5 day, the opening is still Standard's stage tag:
- It is set by the same effect.
- It holds for the same `STAGE_INTRO_MIN_MS`.
- It stays up while there is no child (the projection's `!playable` rule).
- It is the beat the launch runs behind, as before.

The only difference is that the launch starts when the opening appears instead of `DAILY_INTRO_MS` later. That is still behind a beat that is up, never during gameplay, so the child's clock still never starts behind an unrelated screen. Recovery, `optional-entry`, the P2A.1 optional-launch latch, the leave guard and every optional or legacy tag go through code this change doesn't touch.

## 5. Tests

New file `src/pages/quiz-daily-challenge/run/dailyV2P2C.opening.test.tsx` (13 tests). It drives the real controller and page against the in-memory backend:

- **Seam:** v1–v4 (and a missing plan version) open with the intro and v5/v6 don't. Only the v5 main stage is the opening; no optional stage and no legacy stage is.
- **Fresh v5 via Play:**
  - The opening's text is exactly "Daily Challenge".
  - The page contains none of: Standard, Today's Challenge, optional, More Challenges, Review, the stage count, the date, the content line, the rule.
  - Exactly one launch (`launch:0`) happens behind the opening, and leaving is guarded.
  - The beat holds until the tag's minimum, then the arena mounts with entry `fresh`.
- **Beat count:** exactly `["opening"]` before gameplay on v5, and `["daily-intro", "stage-intro"]` on v4.
- **Other fresh-arrival paths:** a reload onto an untouched v5 run and Try again after a failed start both show the same single opening with one launch.
- **Failed Standard launch:** the error and Try again appear on the opening, with no automatic retries. Retry reuses the same interaction id and then plays.
- **Live Standard child on reload:** handled as a recovery, with no opening, no intro and no launch.
- **Optional stages:** after the main result, the Time Trial tag still shows its mode, "More Challenges · Optional", its rule, and a header that names the stage.
- **Legacy:** with no plan version and with v4, the Daily intro (date, "4 stages today", ladder) plays with nothing launched behind it, then the stage tag with "Stage 1 of 4". A v4 run with Standard at index 0 is still a legacy tag.

I updated `dailyV2P2A.hierarchy.test.tsx` test C so its opening matches the new single beat. Everything else in that file is unchanged.

| Run | Result |
|---|---|
| Focused Daily suites: `src/pages/quiz-daily-challenge/run` (incl. P2A hierarchy, P2A.1 launch race, navigation, compat, P2C) + `src/lib/daily-challenge` + PlaytestParticipant | **13 files, 216/216 pass** |
| V4 production-payload smoke (out of repo, temporary copy) | **11/11** |
| Seam mutants (v5 plays intro; no opening stage; header names stage; legacy loses intro; opening drops error; every v5 stage is the opening) | **6/6 killed** |
| `tsc -p tsconfig.app.json` | 2 errors, both pre-existing (OnboardingProfile, identity/connections) |
| `eslint` on changed files | clean |
| `git diff --check` | clean |

Vitest ran through an esbuild scratch config because the shared `@swc/core` is broken (see the vitest-without-swc note).

Visual check: a throwaway harness (removed, never committed) ran the real page on vite with fixture backends.

| Case | What rendered |
|---|---|
| v5 opening | the header (Daily Challenge, Exit) plus a beat that says only "Daily Challenge"; no overflow at 375px |
| v5 failed launch | the same opening, plus the error and Try again |
| v5 live launch | the opening at +0.3 s; at +4.3 s the arena, with the header showing Today's Challenge · Standard · content |
| v4 | the old Daily intro, then "Stage 1 of 4 · Time Trial" |

No console errors. Screenshots could not be captured because the pane was not drawing; the DOM and text were checked instead.

## 6. Not changed

Backend; result screens; the main result; the hierarchy after Standard; `optional-entry`; scoring; History; Daily content; pacing constants.

## 7. Deploy note

This is FE-only and safe on today's v4 backend: v4 behaves the same (smoke 11/11). It only takes effect once v5 runs exist, after BE `ec3500d0` ships. It can ship with or after the DV2-P2 FE publish.
