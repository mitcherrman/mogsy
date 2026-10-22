# PM2 — One-screen mobile Practice

Read `AGENTS.md` first: browser tests run on GitHub Actions only, never on the
owner's desktop. Read `docs/PRACTICE_MODERNIZATION_HANDOFF.md` (PM1) for how
Practice reached the canonical arena.

## Objective

Bring the live Practice gameplay screen (`/quiz`, a Quick Study subject or a
set) up to the Daily Challenge / Ranked phone presentation:

1. the whole question on one phone screen (390x844 target, 360x640 supported);
2. no vertical or horizontal scrolling for ordinary questions;
3. no Next Question / See Results controls — the reveal advances by itself;
4. a one-line `PRACTICE … mogzy.lol` header with a discreet way back;
5. grading, scoring, XP, reporting, history, analytics, replay and the leave
   guard unchanged.

No backend, database, Ranked rating, matchmaking or Daily score change.

## What changed (and why)

### The phone composition — reuse, not a new layout

PM1 put Practice in `CanonicalArena` with two `panel` flanks, so on a phone it
took the *stacked* path (`data-phone-stacked`): header strip, stage, HUD row,
nine-node rail, in one tall column that scrolled. Ranked and the Daily already
have a better phone composition — RMOB2's one-screen frame, with the VISCONT1
stage allocation, the MVFIT1 short-phone budget and the bottom bar (Report ·
five-node timeline window · Rules) — but it switched on only for the duel
(`mobileDuel`: both flanks Ranked banners).

PM2 adds ONE additive flag, `ArenaViewModel.phoneOneScreen`. When set, the
arena uses that same frame (`data-phone-arena`) for a non-duel mode: header
strip hidden below `lg`, panels hidden (they already were), RMOB2 bottom bar
mounted, dock clearance padding dropped. The duel's match bar is NOT drawn — a
mode that opts in carries its identity in its own chrome row. Every existing
caller leaves the flag unset and renders byte-identically (Ranked, Daily, Pro
Play). Desktop is untouched by the flag.

All the existing phone rules then apply to Practice with no copies: viewport
floor, centred stack, fixed media/prompt/answer reserves, prompt and tablet
text-density tiers, the 48px tablet floor, short-phone clamps, the sticky
bottom bar fallback.

### The header — the Daily's pattern

`PracticeChrome` is the Daily's `DailyStageChrome` pattern: one
`arenaHeaderRowClass` row, `!flex-nowrap`, below the HUD band on phones and
inside the reclaimed band from `lg`:

`[←]  PRACTICE  3 / 10 ……… mogzy.lol`

- `←` is the only way back now (PM1 had two, one per breakpoint); it still
  goes through the unchanged NAV1 leave guard. `aria-label` "Back to League hub".
- `PRACTICE` is the page's `h1` (`aria-label` "Leaguecraft Practice").
- The position shows below `lg` only (the desktop strip keeps "Question n / N").
- `mogzy.lol` is `SITE_DOMAIN` (never a dev hostname), plain text — not a link,
  so a recording frame carries the brand without inviting a navigation away
  from a guarded run.

### The reveal — held box, compact, no button

- The HUD row holds a reveal box of ONE height from the question's first frame
  (`.practice-reveal-slot`): `--practice-reveal-h` = 5.75rem on phones,
  4.5rem on phones under 760px tall, `lg:min-h-[4.625rem]` on desktop. The reserve before grading and the footer
  after it share it, so grading moves nothing above.
- Desktop: the box's text starts 32px in (`lg:pl-8`) to clear the signed-in
  Community button, which floats over the row's left end.
- Contents: verdict + XP chip (+ a compact "Source" chip for pro-data questions
  on phones; the full `ProDataSourceLink` block on desktop), then the
  explanation. The "Correct answer:" line is gone — the revealed grid marks the
  right tablet, as on Ranked and the Daily; the results review still lists it.
- Explanation density tiers by length (`practiceExplanationDensity`, VISCONT1's
  rule): ≤100 chars 12px; 101–150 12px (11px under 760px tall); 151–220 11px
  (10.5px short); 221+ 10.5px. Measured in the local canonical DB (6,500
  explanations): median 94, p90 149, p95 185, max 305.
- Short phones (under 760px tall, MVFIT1's band) also give Practice's art
  plate a 72px allocation and draw picture-choice art at 56px, so a three-line
  prompt and a 2x2 picture grid seat on a 360x640 screen.
- The failed-grade state uses a one-line note and 36px controls (44px hit
  areas via `::before`) so it fits the same held box.
- Practice never mounts the evidence line, so the stack's held evidence slot
  (`::after`, `--qs-feedback-h`) is released for `.practice-arena` — ~41px back
  on phones.
- Practice's own art plate takes the stage's media allocation
  (`height: var(--qs-media-h)`) on phones instead of a fixed 112px, so the
  MVFIT1 short-phone allocation reaches it.
- The Community trigger is hidden below `lg` while Practice is on screen — it
  floats over the bottom bar's Report tab (same precedent as the Ranked phone
  arena hiding the radio nudge).

### Automatic advance

- `practiceRevealHoldMs` (pure, `src/lib/quiz/practiceArena.ts`):
  - no grade, or a failed submit → `null` (never advances by itself);
  - verdict with no explanation → `REVEAL_HOLD_MS` (1500ms, Ranked's beat);
  - with an explanation → at least `REVEAL_HOLD_LEVEL_UP_MS` (2600ms, the
    Daily's "more to read" beat) plus a reading allowance of 45ms/char over a
    1200ms base, capped at 12s. Median explanation ≈ 5.4s.
- `usePracticeAutoAdvance` (component hook): one timer per reveal, keyed on
  `run:position`; a new key, a null key or unmount clears it; fires at most
  once; a pause banks the time left.
- `usePracticeRevealPause`: holds while the reveal is pressed (touch-and-hold
  to read) or has focus inside it, while a dialog (`role=dialog/alertdialog`,
  e.g. the leave confirmation) or a Mogzy dock panel (the Report panel — it
  reports the question on screen) is open, and while the tab is hidden.
- A 2px countdown hairline drains along the reveal box (CSS animation, paused
  with the hold); hidden for reduced motion. Decorative only.
- `Quiz.tsx` guards (`practiceRunId`, bumped by every run start in
  `startHistorySession`):
  - one submission per question (`submittingRef`) — a double tap cannot post twice;
  - a grade that arrives after its question left the stage (new run, replay,
    hub, unmount) is dropped (`liveQuestionRef`), including its SFX, analytics
    and toasts;
  - one advance per question (`advancedRef`) — a timer that fired twice, or
    Skip pressed as the timer fires, cannot skip a question or complete twice.
- A failed submit shows "Answer not verified" (never Correct/Incorrect, no
  meter, no advance) with **Try again** (re-sends the same answer, no second
  lock-in sound) and **Skip question** / **Skip to results** (leaves it
  ungraded, as the legacy "continue past a failed submit" did).

## Relevant files

| Area | File |
| --- | --- |
| Arena seam (additive flag) | `src/lib/ranked-core/arenaView.ts`, `src/components/ranked-arena/CanonicalArena.tsx` |
| Practice presentation | `src/components/quiz/practice-arena/PracticeArena.tsx` |
| Auto-advance + pause hooks | `src/components/quiz/practice-arena/usePracticeAutoAdvance.ts` |
| Hold timing, density (pure) | `src/lib/quiz/practiceArena.ts` |
| Submission/advance guards, retry | `src/pages/Quiz.tsx` |
| Practice-scoped CSS | `src/index.css` (last block, "PM2 — PRACTICE ON THE PHONE ONE-SCREEN ARENA") |
| Unit tests | `practiceArena.test.ts`, `PracticeArena.test.tsx`, `PracticeArena.pm2.test.tsx`, `Quiz.practiceMissed.test.tsx` |
| Browser acceptance | `e2e/pm2/practice-one-screen.spec.ts`, `playwright.pm2.config.ts`, `.github/workflows/practice-pm2-acceptance.yml` |
| PM1 specs moved to auto-advance | `e2e/pm1/practice-modernization.spec.ts`, `e2e/pm1-prod/production.spec.ts` |

## Tests

### Browser acceptance — GitHub Actions, bundled Chromium, 1 worker

Workflow `practice-pm2-acceptance`, run
https://github.com/mitcherrman/mogsy/actions/runs/39766253886 on `96a03e44`:
`pm2-browser` **12/12 passed** (9.4 min) and `unit-and-build` green (PM2 unit
suites, `tsc`, `vite build`). Artifact `practice-pm2-evidence`:
`test-results/pm2/*.png` (question + reveal for every fixture at every
viewport, results, replay, states) and
`test-results/pm2/artifacts/practice-video-*/video.webm` (390x844, three
questions played unassisted: question → reveal → automatic next question).

Per viewport, a ten-question run (plain text, item art, champion art, picture
choices, a 180-character prompt, four ~90-character answers with a ~290-char
explanation, rune and summoner art, a 3-option and a 2-option question, and a
grading failure → Try again), checked unanswered AND revealed:

| viewport | page scroll (max over all states) | horizontal | smallest tablet |
| --- | --- | --- | --- |
| 360x640 | 0px, except the long-answers stress fixture (12px before / 41px revealed) | 0 | 48px |
| 390x844 | 0px | 0 | 48px |
| 430x932 | 0px | 0 | 48px |
| 844x390 | scrolls (390px of height cannot seat a question; nothing clipped, bar sticky) | 0 | 48px |
| 1280x800 | 0px, whole arena in the viewport | 0 | 42px |
| 1440x900 | 0px, whole arena in the viewport | 0 | 54px |

Also asserted in every state: the header is one line (28px) with `mogzy.lol`
on screen; the full prompt and every tablet inside the stage, unclipped; no
inner scroll container; no Next / See results control; on phones the
Community trigger is not over the arena; the answer grid and the reveal box do
not move when the answer is revealed (≤1px; ≤10px for the dense explanation).
After the run: the position sequence is exactly 1…10 then the results (one
advance per question), one session completion, one attempt per question (two
for the failed one), and analytics `practice_quiz_opened` 1 /
`quiz_question_answered` 10 / `quiz_completed` 1 at every viewport.
Replaying the three misses renders the same arena.

State tests (390x844): an unpaused reveal held 2.8s (verdict + short
explanation) then advanced once and stayed; keyboard-only play (Enter answers,
the run advances, focus lands on the new stem); reduced motion (no countdown
animation, still advances); the Report panel (hosted in the bottom bar) and
the leave confirmation both hold the reveal for 8s, Stay resumes, Leave
reaches `/lol` with no further attempt or completion; all six Quick Study
subjects launch the one-screen arena.

Screenshots reviewed: 390x844 champion question, 390x844 long-prompt reveal,
360x640 picture-choice reveal, 360x640 unverified state, 1280x800 item reveal,
844x390 dense-explanation reveal. The 1280x800 review found the signed-in
Community button overlapping the reveal's left edge; fixed after the run with
`lg:pl-8` (see commits).

### Unit (local, Windows; Vitest via the esbuild/rollup-wasm workaround)

New/updated: `practiceArena.test.ts` (14), `PracticeArena.test.tsx` (11),
`PracticeArena.pm2.test.tsx` (12), `Quiz.practiceMissed.test.tsx` (19, incl.
double-fire advance, single completion, retry, skip, single submission and a
stale grade after leaving), `Quiz.guide.test.tsx` (moved to auto-advance).

Regression, branch vs a detached `origin/main` (e931bc1a) checkout over
ranked-arena, question-surface, quiz components and pages, pro-play, Daily,
Ranked, lib/ranked-core, lib/quiz, lib/question-surface and every test that
reads `index.css` (~7,150 tests): the same pre-existing Windows failures on
both (CRLF source guards, Ranked "coming soon"), no new failures after the
fixes below. `tsc -p tsconfig.app.json`: only the two pre-existing errors in
`OnboardingProfile.tsx` and `identity/connections.ts`.

Not run locally: browsers (AGENTS.md) and `vite build` (blocked here; the CI
build is green).

## Commits and PR

<!-- COMMITS -->

## Outstanding concerns

- **Retry can double-record if a response was lost.** The backend's live
  recorder (`services/attempt_recorder.py`) has no idempotency key; if a submit
  reached the server but its response did not reach the browser, Try again
  records a second attempt (and its XP). Rare (a lost response, not a refused
  request), and the brief requires a retry; a backend idempotency key per
  (session, question) would close it. Not done here (no backend changes).
- **Hold length is a product call.** 1.5s (verdict only) / 2.6s+ reading time
  (explanation), capped at 12s. A creator recording may want shorter; a slow
  reader can press-and-hold the reveal. Tune in `practiceArena.ts` only.
- **Community button hidden on phone Practice.** Signed-in players lose the
  floating friends trigger during a Practice question on phones (it returns on
  results and everywhere else). Remove the one CSS rule to restore it.
- **Very long explanations / prompts on short phones.** Under 760px tall the
  reveal box is 72px: explanations over ~220 characters (~3% of the bank) grow
  it a little, and prompts of four or more lines at 18px (roughly 85+
  characters at 360 wide) can push a 360x640 screen a few pixels past the
  fold. Never clipped; the page scrolls whole. Taller phones (390x844+) fit
  everything tested.
- **Short-phone picture choices** draw their art at 56px (80px elsewhere) so a
  2x2 picture grid fits the stage's answer allocation under 760px tall.
- **Spare parchment on tall phones.** At 390x844 the folio centres the stack
  with ~60px of parchment above and below it — the canonical VISCONT1 phone
  allocation, unchanged here so Practice matches Ranked/Daily exactly. Larger
  art on tall phones would be a shared arena change.
- **The canonical text-only media band** truncates a long category name
  ("CHAMPION RECOGNI…") at 360 wide — existing arena behaviour, decorative.
- **844x390 landscape** cannot fit a question in 390px of height (no phone
  composition can); the page scrolls there, the bottom bar stays sticky, and
  nothing is clipped. Asserted as such.
- The local `vite build` cannot run on this machine (Application Control blocks
  rollup's native binary; the shared `@swc/core` fails its DACL check); the CI
  `unit-and-build` job is the build evidence.

## Deployment

Not published. Lovable does not deploy on push; the owner presses **Publish**
after merging. After publishing, re-run `pm1-production-verify` (its Next
assertion was relaxed for PM2) and spot-check https://mogzy.lol on a phone.
