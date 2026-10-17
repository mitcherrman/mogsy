# MISC Wave 2D: server-authoritative countdown, sound and TIME'S UP (F10–F12)

Issue: mitcherrman/mogsy#61 · Branch `fix/misc-w2d-countdown-feedback` · Draft PR mitcherrman/mogsy#63
Owner session: Claude Code, Opus 5.5, high effort · Date 2026-10-17

## Status

**Implemented, tested and captured in a browser. Draft PR open; not merged, not deployed.** No backend change, no Docker, no production write. No change to deadlines, skew, input gating, submission, scoring or timeout algorithms.

| | SHA |
|---|---|
| Base (`origin/main`, fresh fetch) | `f248f840` (F08, PR #57) |
| Code | `c575fca9` (F10–F12) and `598d0592` (one-lock segment timeouts) |
| Docs + evidence | `e50e0864` (PR opened at that head); later lines are updated by docs-only commits |
| Draft PR #46 (Journey CSS) inspected | `64e45176` |
| Draft PR #59 (F09 frontend test) inspected | `a3a47cca` |
| Wave 2C branch inspected | `fix/misc-w2c-daily-discoveries` @ `7f416915` |

## What the player gets

- **F10, sound.** In the last **5, 4, 3, 2, 1** seconds of a running answer clock there is one woodblock knock per second. Weight and pitch rise in three steps: 5–4 warn, 3–2 strong, 1 final. The knocks go through the shared SFX engine, so they follow global mute, Audio Studio bindings and the user-gesture audio unlock. They are silent once the viewer's answer is in or in flight, while the clock is paused or held, and when the context is suspended (a late knock is worse than none).
- **F11, pulse.** Each beat scales and glows the digits once. Peak scale is 1.08 for warn, 1.17 for strong and 1.30 for final. Only transform and text-shadow change, so nothing lays out: the clock box, the header and the answers are pixel-identical at every beat (measured below). Reduced motion turns off all motion, whether set by the OS or by the app's own Settings → Reduce Motion (`html.reduce-motion`). It leaves a static glow that still escalates (6 / 9 / 12 px).
- **F12, TIME'S UP comes only from the server.**
  - A local zero now says **"Settling…"** on the centre clock (it used to say "Time's up").
  - Stat Check's card clock says **"Next card…"** at its own local zero (it used to say "Time's up — next card…").
  - A server-settled timeout gets the `quiz.answer.timeout` cue and a heavier amber **TIMED OUT** stamp on both the card and the centre face. An answer that is accepted or still in flight settles as correct or incorrect, so it can never produce the cue.

## Inventory: verified timed hosts (source, not names)

| Host | Clock source (server) | Presenter(s) | Settled-timeout evidence | F10 | F11 | F12 |
|---|---|---|---|---|---|---|
| **Ranked duel, quiz rounds** (queue/bot via `QuizRankedPage`) | `active_round.active_deadline` + `server_time` skew (`projectTimer`, `useCountdownNow`) | `CentralStage` (desktop) and `MobileMatchBar` (phone): both mounted, both render the one `header.timer` | resolved round `players[].outcome:"timeout"`, `timed_out:true` (adapter → `timed_out`) | ✅ | ✅ | ✅ cue + amber stamp (card, centre, rail) |
| **Stat Check** (Meta Reflex v4+) | header: the block's round deadline; card: `own_card_deadline` + `card_timer_ms` (6 s) | header (both presenters) + `metaReflexModule` `Countdown` | `own_card_reveals[].outcome:"timeout"` | ✅ header clock only (decision 2) | ✅ header + card | ✅ cue; local-zero copy neutral |
| **Order Forge / Reconstruct / Scrub / Assembly** (one-lock segments) | header round clock | header | settled `segment_reveal.players[viewer].segment_result:"timeout"` (real captures for OF, Reconstruct, both Assembly families) | ✅ | ✅ | ✅ cue (2nd commit) |
| **Journey Standard, historical pooled** (`active_time_*`, 150 s) | `projectJourneyTimer` pool remainder; paused through reveals and beats | header | `own_timed_out_challenges[i]` flips true (real capture `j4/voli.standard.exhaust`) | ✅ one clock per module (`…:pool`) | ✅ | ✅ cue; **was "incorrect"** |
| **Journey Standard F09 v2** (5 × 30 s, backend draft #46) | `card_timer_ms` + `own_card_deadline` | header | same flags | ✅ one clock per child (`…:card:i`) | ✅ | ✅ |
| **Journey Survival** (per-child 30 s) | same as F09 | header | same flags (code path shared with F09; no real Survival *timeout* capture exists, see gaps) | ✅ | ✅ | ✅ |
| **Daily stages** (Standard / Survival / Time Trial via `DailyRunPage` → hosted `QuizRankedMatch`) | as the module above | header (hosted) | as the module above | ✅ (browser-verified via `?host=daily`) | ✅ | ✅ |
| **Daily Time Trial bank** (`DailyStageChrome.TimeBankMeter`) | `live.time_bank` (server reading + projection while answerable) | bank readout | the server's own bank reading `remaining_ms = 0` (the stage result's `ended_by:"time_bank_exhausted"` page belongs to Wave 2C and is unchanged) | ✅ one clock per stage | ✅ | ✅ cue |
| Playtests (`PlaytestMatchHost`) | hosted `QuizRankedMatch` | header | as above | ✅ | ✅ | ✅ |

**Out of scope.** These are decorative clocks, or modes with no server answer clock:
- Worlds and Pro Play schedule countdowns, Combat Battles event countdown, Role Challenge reset.
- Quiz Broadcast: a stream presenter with its own asset-first `broadcast.countdown.tick`, left untouched.
- Perfect Timing.
- Pro Play quiz arena and More Challenges games: `timer: null`, so the backend has no answer clock to support.
- Legacy `item_cost_duel` v1–v3, an owner playtest renderer that the registry routes away from; its legacy clocks are untouched.
- The dev-only staff duel `TimerDisplay`: copy only, its local-zero line no longer says "Time's up".

## Architecture (minimal shared mechanism)

```
src/lib/quiz-timer/countdownFeedback.ts      pure: beats, intensity, observeCountdown, observeServerTimeout, attrs
src/lib/quiz-timer/useCountdownFeedback.ts   useCountdownSfx / useServerTimeoutSfx (one owner per clock)
src/components/quiz-timer/CountdownDigits.tsx keyed digits span → replays the one-shot pulse
src/lib/audio/sfx-registry.ts + sfx-renderers.ts   quiz.countdown.{tick,urgent,final}, quiz.answer.timeout (built-in synth)
src/index.css                                pulse + reduced motion + timeout stamp (block after .ranked-timer-urgent)
```

- **Sound is decided once, in the controller.** `QuizRankedMatch` builds the one `timer` and calls `useCountdownSfx` beside it. The presenters only spread `countdownDataAttrs(timer)` and wrap the digits. That keeps two mounted presenters from double-knocking.
- **Clock identity** comes from `answerClockKey(matchId, round, journeyClock)` in `rankedViews.ts`:
  - a per-card Journey child is `…#seg:card:<own_card_index>`;
  - a pooled Journey budget is `…#seg:pool` (one clock, so a remainder resumed after a reveal never re-sounds);
  - anything else is `r<round>`.
- **Dedupe works in three layers:**
  - Event ids: `quiz-countdown:<clock>:<second>` and `quiz-timeout:<settled>`. Ranked timeouts reuse the observer's existing `ranked:<match>:round:N:result` and `…:child:i:result` ids, so the engine's 512-id `eventId` set renders each id once per page session.
  - The observer: the first sample is a baseline, so mount, reconnect, History and resume are silent. Only the current second sounds, so a long task or a backgrounded tab gives one knock and never a burst.
  - **One clock owns the beat** (review edge C): the first clock to knock in its final window holds a 1.1 s lease, renewed by each of its own knocks. Another clock (the Time Trial bank beside a question clock) knocks only after the owner goes quiet. This replaced a 350 ms gap that let staggered clocks knock twice a second.
- **TIME'S UP sources** are all server fields:
  - the round's `timed_out`;
  - Stat Check card `outcome:"timeout"`;
  - Journey `own_timed_out_challenges`;
  - one-lock `segment_result:"timeout"`;
  - the Daily bank's server reading of 0.

  Each is wired into the existing `observeRankedSfx` baseline semantics, or `observeServerTimeout` for the bank.

## Decisions (1 and 2 confirmed by the owner on 2026-10-17)

1. **The timeout word stays "TIMED OUT"** *(owner-confirmed)*. The arena has one timeout word (`centralStage.VERDICT_WORD`, `pointsFeedback`, `QuestionResultOverlay`, the rails). F12 is met with a distinct amber stamp and the cue. Switching to a literal "TIME'S UP" is a one-word change in those places together.
2. **The Stat Check card clock gets visual escalation only** *(owner-confirmed)*. A 6 s reflex card would knock through almost its whole life, so the block's header clock carries the sound.
3. **No knocks after the viewer has answered.** The digits keep counting for the shared round; the sound is a call to act.
4. **The voices are built in and on by default.** There is no per-browser legacy toggle; global mute and Audio Studio govern them. `broadcast.countdown.tick` stays voiceless as specified. The engine's existing rule still applies: no built-in sounds while Audio Studio config is unknown (`configReady`).
5. **The dev probe has a `?timeout=1` switch** (`RankedShellProbe`, with `?sfx=1`) that settles the viewer as server-timed-out. It is dev-only and is how the browser evidence shows a real settlement path.

## Boundaries and concurrent work

- **Wave 2C (#60).** No Daily result, composition or score component was touched. `DailyStageChrome.tsx`, which this lane owns, changed only in `TimeBankMeter`. `stageResultModel`'s server-driven "Time's up" headline is unchanged. The branch `fix/misc-w2c-daily-discoveries` @ `7f416915` merges cleanly (`git merge-tree`: 0 conflicts, no shared files).
- **Draft PR #46 (Journey CSS, `64e45176`)** already conflicts with `main` itself in 3 files (it is 95 commits behind). With this branch the `index.css` conflict is the **same 2 hunks**, shifted by +63 lines (16832/19647 → 16895/19710). My block sits at line ~1964; #46's is at ~16818. No new conflict.
- **PR #59 / F09 (`a3a47cca`).** Merges cleanly. The per-child identity is proven on PR #59's own adaptation of the historical Standard capture (`answerClockFeedback.test.tsx`), and the historical pooled capture still uses one pooled clock. Backend #46 lives in the backend repo; nothing here assumes its grading.

## Tests (exact)

The new suites, all on virtual time or real captures:

| File | Tests | Proves |
|---|---|---|
| `src/lib/quiz-timer/countdownFeedback.test.ts` | 15 | beats, escalation, baseline, catch-up, pause, disarm, per-card ids, skew re-emit = same id, timeout once / baseline |
| `src/lib/quiz-timer/useCountdownFeedback.test.tsx` | 9 | real `useCountdownNow` + real SFX engine (fake AudioContext): 5 knocks at the deadline's own boundaries and 8 oscillators; remount, long-task snap, double owner, answered, mute, locked, suspended |
| `src/lib/quiz-timer/countdownContracts.test.ts` | 9 | built-in voices, gain hierarchy, voice length < 250 ms, stylesheet: no layout properties in keyframes, both reduced-motion switches |
| `src/pages/quiz-ranked/useRankedMatchSfx.timeout.test.ts` | 14 | round `timed_out`; in-flight answer gives no TIME'S UP; Stat Check card; **real Journey captures** (pooled exhaust and reference child timeout: was *incorrect*, now TIME'S UP, once, nothing on resume); **real one-lock server captures** (OF, Reconstruct, 2 × Assembly) |
| `src/pages/quiz-ranked/answerClockFeedback.test.tsx` | 17 | `answerClockKey` on real pooled / Survival / F09-v2 captures; beats on captured clocks at exactly 23–27 s; both presenters draw the same beat and own no sound; the digits remount while the clock box is stable; centre face stamps only a settled verdict |
| `src/pages/quiz-daily-challenge/run/TimeBankMeter.countdown.test.tsx` | 4 | bank knocks while draining only; a projected 0 is not a timeout; the server's 0 sounds once; re-entry is silent |

The new suites add **68 tests**. Updated assertions: `CentralStage.test.tsx`, `QuizRankedMatch.geometry.test.tsx`, `metaReflexModule.test.tsx` (local zero no longer says "Time's up") and `useRankedMatchSfx.test.ts` (the Order Forge timeout states no verdict, and now sounds TIME'S UP from `segment_result`).

**Local runs.** This machine can't run the repo's vitest config: swc is blocked and the rollup native binary is blocked by App Control. Runs use the esbuild scratch config and the rollup-wasm hook (see the memory notes), split into chunks, on both this branch and a detached base checkout at `f248f840`.
- Focused and touched set: **25 files / 360 tests pass**.
- Affected chunks, head versus base (audio, quiz-timer, ranked-core, ranked-arena, quiz-ranked, quiz-daily-challenge, daily-challenge lib, journey, playtest): **the same 15 failures on both.** They are source and stylesheet regex tests that fail on a CRLF working copy (`AnswerGrid.elimination`, `CanonicalArena.boundary`, `DailyOnCanonicalArena.boundary`, `QuestionStageGeometry`, `rankedAssets.rfx1b2`, `masterySliceModule.jp5`, `masterySliceModule.visualLanguage` × 3, `orderForgeModule`).
- Two more failed only under load in the first head pass: `QuizRankedMatch.rfx1b3` (a 282 ms wall-clock drift against a 250 ms bound) and a 5 s sweep timeout. **Both pass in isolation.**
- Final pass on `598d0592`: audio 178/178, quiz-timer 33/33, ranked-core 1156/1162, ranked-arena 626/635, quiz-ranked **779/779**, quiz-daily-challenge 204/204, shell probe 4/4. The failures are **exactly the 15 base failures, none new**.
- `tsc -p tsconfig.app.json`: the same 2 errors as base (`OnboardingProfile.tsx`, `identity/connections.ts`); 0 from this change.
- ESLint on the changed files: 0 errors. 4 warnings, all of which exist on base.

GitHub CI (LF checkout) is the authority for the CRLF-sensitive tests; see the PR checks.

## Browser evidence (`docs/handoffs/misc-w2d/`)

Harness: `logs/cap.cjs`, headless Edge through Playwright. It runs the real `QuizRankedMatch` in `/dev/ranked-shell-probe?q=opts4&sfx=1&timeout=1&entry=fresh&lead=6000&host=daily`: a live server-anchored clock, the user's first gesture unlocks audio, then the round reaches local zero and a server settlement times the viewer out. Every SFX request, the oscillators started, and the DOM and geometry at each beat are logged in `logs/after-*.json` and `logs/before-*.json`.

| Run | Knocks (ms) | Oscillators | Clock box at every beat | Local 0 | Settled timeout |
|---|---|---|---|---|---|
| desktop 1440×900 (video) | 32403, 33406, 34399, 35403, 36398 | 8 for the 5 knocks (1/1/2/2/2) + 3 for the timeout | `[661.2,13,117.5,48]` unchanged | "Settling…", no timeout claim, answers still enabled | `quiz.answer.timeout` once; amber TIMED OUT stamp on card + centre |
| 390×844 (video) | 32525 … 36528 (≈1 s) | same | `[170.5,57.1,49,20]` unchanged | same | same |
| 320×568 | 32960 … 36961 | same | `[135.5,57.1,49,20]` unchanged | same | same |
| OS reduced motion | 5 knocks | same | unchanged; `transform:none`, `animation:none` | same | stamp static |
| app Reduce Motion (`html.reduce-motion`, 390) | 5 knocks | same | unchanged; static glow 6 → 9 → 12 px | same | stamp static |
| muted | 5 requests | **0** | pulse still shown | same | requested, 0 rendered |
| **before** (base `f248f840`), desktop and 390 | **none** | 0 | unchanged, no pulse | **"Time's up"** shown at local zero (desktop) | — |

The same flow was also driven live in the Claude Browser pane against the nested `/quiz/ranked` probe frame: 5 knocks at 53165 / 54165 / 55164 / 56160 / 57161 ms, digits at `scale(1.17)` during "3", "Settling…" at local zero, then a single `quiz.answer.timeout` alongside the `data-timeout` stamp.

**Answer submissions are unaffected:**
- No line of `useRankedMatch`, submission, `inputOpen`, permissions, deadline or skew code changed (see the diff).
- Answers stay enabled through local zero in every capture.
- The existing submission, geometry and rfx suites pass unchanged.

Files: `after-desktop.webm`, `after-390x844.webm`, `before-desktop.webm`, `before-390x844.webm`; `after/*.jpg` (003 = "3 strong", 001 = "1 final", 000 = local zero, `timeout` = settled); `before/*.jpg`.

## Review amendment (command-center review of `36a52cef`)

Each edge was reproduced with a failing-before regression, then fixed in the smallest place. Wording ("TIMED OUT", amber) and the silent Stat Check card clock are unchanged. No deadline, settlement or scoring rule changed. PR #62's Daily result components (`DailyRunPage`, `DailyMainResult`, `DailyStageResult`) and `src/index.css` were not touched.

| Edge | Evidence (before) | Fix | Regression |
|---|---|---|---|
| **A: final-round timeout** | All three real one-lock server captures (Reconstruct, Order Forge, Assembly Roster Lock): `resolved_timeout.match_over = true`, `completion_reason: "segments_complete"`, and `resume_final.public` is terminal. **The server exposes no non-terminal settlement for the final round.** `observeRankedSfx` gated the settlement cue on `!terminal`, so the timeout was silent. **5 failing before.** | `useRankedMatchSfx.ts`: a terminal-only branch sounds `quiz.answer.timeout` under the same `round:N:result` id, only when `previous.sawLive` (a watched match). Correct/incorrect at terminal is unchanged; the match sting stays at the outro beat. | `useRankedMatchSfx.timeout.test.ts` "review edge A": the 3 captures replayed live → terminal (once, and no repeat on re-poll); completion snapshot before the settlement fetch; reconnect / History onto the finished match is silent; a quiz `timed_out` final round plus the outro sting; correct/incorrect at terminal still silent. |
| **B: bank → stage result** | Fixture transport + `DailyRunPage` flow: a live Time Trial bank at 7 s goes straight to `ended_by: "time_bank_exhausted"`, and no `quiz.answer.timeout` plays. **1 failing before.** | `useDailyRun.adopt()` (not in #62), in the existing "stage this mount watched finish" branch: when `result.endedBy === "time_bank_exhausted"`, play `quiz.answer.timeout` with id `quiz-timeout:daily-bank:<stageId>`, the bank readout's own id, so a prior bank-zero cue is not doubled. | `dailyBankTimeout.test.tsx`: direct transition gives one cue with the bank id (plus the stage sting once); a content-ended stage stays silent; re-entering an already-ended stage stays silent. |
| **C: staggered clocks** | Two `useCountdownNow` clocks (question and bank) with boundaries 500 ms apart: **10 knocks in 5 s** (both clocks). **2 failing before.** | `useCountdownFeedback.ts`: a single beat owner with a 1.1 s lease replaces the 350 ms gap. | `useCountdownFeedback.test.tsx` "review edge C": exactly r1's 5 knocks; when the bank outlives the question clock, it owns its later 3, 2, 1 after the owner goes quiet. |

Amendment test results (local, esbuild scratch config, chunked):
- Edge suites before the fixes: **A 5 failed / 19 passed; B 1 failed / 2 passed; C 2 failed / 9 passed.** After: all pass.
- Affected chunks on the amended head: audio 178/178, quiz-timer 35/35, ranked-core 1156/1162, ranked-arena 626/635, quiz-ranked **789/789**, quiz-daily-challenge **207/207**, shell probe 4/4. The failures are **exactly the 15 base failures** (CRLF regex tests), none new and none fixed.
- `tsc`: the same 2 base errors. ESLint on the changed files: 0.
- New tests in this amendment: **15** (A 10, B 3, C 2), on top of the original 68. Edge A before the fix was 5 failed of the 10 new tests: the other 5 are the "no replay" and "unchanged verdict" guards, which already held.

## Known gaps / next actions

1. **There is no real Survival *timeout* capture.** The Survival per-child timeout cue shares its code path with the pooled and reference captures, which are proven. Capture one with the backend before release.
2. ~~The Daily bank cue needs the chrome to see the server's 0 reading.~~ **Resolved (review edge B):** `useDailyRun.adopt()` now sounds the same cue when a stage this mount watched completes with `ended_by: "time_bank_exhausted"`.
3. **Owner calls:** none open. The owner confirmed decisions 1 and 2 as built on 2026-10-17.
4. **Reproduce:** start a worktree dev server (scratch vite config + rollup-wasm hook), then run `node docs/handoffs/misc-w2d/logs/cap.cjs <out> desktop http://localhost:<port> 1` with the worktree as cwd.
