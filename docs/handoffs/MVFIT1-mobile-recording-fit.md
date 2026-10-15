# MVFIT1 — Mobile Recording Viewport Fit (2026-10-15)

## Objective
Keep every answer and the question timeline visible without a scrollbar in the
509×709 Shorts recording window, while preserving the October 14 MAF1
no-clipping fallback and VISCONT1 stable answer positions. This is the canonical
phone Ranked/Daily arena, **not** a recording-only or Daily-only fork.

## Evidence / root cause
- RMOB2 uses viewport *min-height*, not a height lock. VISCONT1 reserves
  124px for media, 124px for prompt, 210px for answers even on short phones.
- Live-frontend Chromium audit used the real `/dev/ranked-shell-probe` with
  `frame=0&lol=1` (one arena under production typography). At 509×709:
  compact questions overran the page by 16px, rich item questions by 61px.
- Exploratory audit initially omitted `frame=0`, creating an extra ArenaShell,
  24px extra vertical/4px horizontal overflow. Those were **fixture-only**;
  no global overflow-hiding patch was made.
- Item hero's earlier computed `max-height:min(120px,100%)` did not cap a
  158px aspect-ratio box because percentage height was indefinite.
  An explicit definite cap in Chromium worked.

## Decisions
1. Height-sensitive *viewport-wide* media/prompt minimums below 640px wide and
   760px tall, smooth via `clamp()`, rather than per-question height that jumps
   on reveal. At 509×709: 112px media / 105px prompt. At 360×640:
   88px media / 60px prompt. Back to original 124/124px at taller heights.
2. Original 210px answer region, 48px per option, feedback reserve,
   Report · timeline · Rules bar, and interactive semantics are unchanged.
3. Art height cap interpolates between 100px at 709px screen height and
   natural aspect by roughly 826px, with no discontinuity at 760/761px.
4. Long unavoidable content may grow the entire page on very short phones;
   it must never clip answers or create a nested scroller. Desktop, Journey,
   Stat Check and non-duel phone compositions remain outside these selectors.
5. No backend, DB, grading, state, or deployment changes in this PR.

## Relevant files
- `src/index.css`: MVFIT1 scoped phone-height CSS appended after MAF1.
- `e2e/mobile-recording-fit.spec.ts`: real canonical arena + 6 viewport
  matrix × 5 shapes; checks scroll, timeline, answers, and steady anchors.
- `playwright.mobile-recording.config.ts`: isolated frontend-only Chromium.
- `.github/workflows/mobile-recording-fit.yml`: PR-only CI, build and artifact.

## Current state / completed
- PR #29 on branch `fix/mobile-recording-viewport-fit-20261015`.
- Initial run with 3 viewport sizes: 16/16 Chromium tests passed,
  answer-grid anchor spread 0px at 509×709, Vite production build succeeded.
- This commit extends the test matrix to 509×739, 509×761 and 600×820,
  and smooths the art cap across the 760px seam.

## Next
Wait for final PR check run. Inspect the 509×709 artifact screenshot and
full Daily Challenge creator replay visually. Do NOT merge/publish without
a green browser/production build and visual acceptance, especially the
item title/icon legibility. If a seam test fails, repair only this branch.
