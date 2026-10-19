# PT5.2 — Perfect Timing: the Arcane Chronometer

**Status 2026-10-19: implemented and verified on one branch, pushed, not merged, not deployed.** Frontend only (`mitcherrman/mogsy`). Branch `perfect-timing/pt52-arcane-chronometer`, from `origin/main` `e2fee510`. No backend, API contract, scoring, cooldown, haste, Random Run generation, Mastery Slice progression, flag or auth change.

Read first: [PT51_HANDOFF.md](PT51_HANDOFF.md) (transitions, typography), [PT44_HANDOFF.md](PT44_HANDOFF.md) (the fixed, zero-scroll screen), [PT5_HANDOFF.md](PT5_HANDOFF.md) (Mastery Slice).

## 1. What the owner asked

A visible stopwatch for Perfect Timing, built as the approved **Arcane Chronometer** concept (brass rim, navy/blue dial, engraved ticks, cyan arcane light, big bold Inter numerals, compact SECONDS, a clear CAST / PRESS TO STOP state, the champion art and ability kept), with a coherent sound identity (cast, whole-second ticks, lock), inside the zero-scroll screen, without a second grading clock. The visible clock changes the difficulty; that is approved for the owner-only experiment and scoring is not adjusted in this pass.

## 2. What changed

### 2.1 The instrument

The seal's face **is** the chronometer (`components/perfect-timing/ArcaneChronometer.tsx`). It is drawn inside the seal's existing box (`.pt-seal-face`, `--pt-seal`), so the stage's fit budget is exactly PT5.1's: the brass rim and notches are the old seal ring; inside it, an SVG dial (bezel, 60 engraved ticks with a long brass mark every five, inner ring, cyan track, rune circle), a cyan sweep with a short comet tail (one revolution per minute), a static arcane "well" of light behind the digits (warm armed, cold cyan running, gold locked, grey voided), the ability icon as a medallion at twelve o'clock, the numerals, a compact **SECONDS** label and the state plate.

| Phase | Numerals | Plate | Light |
| --- | --- | --- | --- |
| Armed | `0.00` | **CAST** (gold) | warm |
| Running | live, counting up, two decimals (truncated) | **PRESS TO STOP** (cyan) | cyan; the medallion darkens like an ability on cooldown |
| Stopped / submitting | frozen on the engine's submitted value | **LOCKED** (gold) | gold; the sweep's pip settles gold |
| Interrupted | stops where it was, dimmed and struck through | **VOIDED** (ember) | grey |
| Dealing | `0.00` dimmed | DEALING | grey |

* Numerals: Inter `--pt-heavy` (700; see PT5.1 §2.4 on 800/900), `tabular-nums`, `24 %` of the seal (≈ 82 px on desktop, 44 px at 667×375), `19 %` from 100 s up (three integer digits; max is 600 s). Every layer is `position: absolute` inside the face, so a digit change cannot move anything.
* Champion splash art, hero, ability icon, rank / slice badges and PT5.1 typography are untouched; the hero still carries the large ability icon, the dial carries it again as the medallion.
* Hint copy says "click / tap the clock". Status copy: armed "Press to cast. Stop the clock when the ability is back up."; locked "Locked at 5.44 s. Checking the archive." (the engine's value, announced once).

### 2.2 Timing architecture (display only — no second clock)

* `lib/perfect-timing/chronometer.ts` (pure): `runningMs(t0, now)`, `formatRunning` (truncates to the hundredth), `formatLocked` (exactly the reveal's `formatSeconds` without the unit), `sweepDegrees`, `observeSecond` (the beat).
* `lib/perfect-timing/useChronometer.ts`: one `requestAnimationFrame` loop **only while the engine is running**, reading `performance.now()` against the **engine's own `t0`** (the native input timestamp of the cast). It writes into the DOM through a callback; there is **no `setState`**, so neither the stage nor the page re-renders at 60 FPS (jsdom test: zero React commits over 3 s of frames). Written in a layout effect, so the first running value is on screen before the first paint after the cast and the frozen value in the same commit as the stop.
* The page passes `model.clock = { t0: engine.state.t0, elapsedMs: engine.state.elapsedMs }` (new optional `PtStageModel.clock`). When stopped, the display is **the engine's `elapsedMs`** — the exact integer the page sends to `lock` — never a reading of the frame loop. Nothing is read back out of the stopwatch; `onStopped(elapsedMs, roundId)` is still the only path to `lock`.
* The loop is cancelled on stop, reset, a new round (the stage is keyed by round id), interruption, unmount, and directly on `visibilitychange → hidden` (the engine voids the attempt on the same event).
* Untouched: `timingEngine.ts` (`MIN_RUN_MS`, `MAX_ELAPSED_MS`), `useTimingEngine.ts` (dedupe, key/pointer guards, document keys), `api.ts`, contracts, `viewModel` §1, scoring, haste, Random Run and slice logic. The only page edits are the one `clock:` line in each of `PerfectTimingPage.tsx` and `MasterySliceRun.tsx`.

### 2.3 The secret stays secret

The chronometer's inputs are the engine's timestamps and the round id — nothing else. It never sees the ability, rank, item, haste or target. It counts **up** with no end, no colour change near any duration, and no countdown observer: the quiz's 5–4–3–2–1 code (`lib/quiz-timer`) is not used. The only rhythm is the **whole elapsed second** (identical for every round), with a fixed stronger mark every **fifth** second; nothing escalates otherwise. Tests prove two rounds with different targets render and beat identically.

### 2.4 Motion

All finite, all layout-free (opacity, SVG stroke, a transform on the sweep group and the flare layer); there is **no `infinite` animation** in the stylesheet (asserted by a unit test and by the e2e "nothing looping while running" probe).

* **Cast** (~0.7 s): a cyan burst, one light travelling once around the dial (`stroke-dashoffset`), the medallion ringing cyan, the old seal flash. The stopwatch is already counting.
* **Running:** the sweep travels (frame-driven, one revolution / 60 s), the digits count, and on each whole elapsed second a one-shot ring pulse plus a short glow on the digits (gold on every fifth). Two alternating keyframe names restart the one-shot without touching React.
* **Stop:** the digits freeze in gold, a short gold flash and a gold ring settle. **Lock hold:** the arena keeps the frozen, locked instrument on screen for at least `LOCK_HOLD_MS` = 420 ms after the stop before the reveal mounts (`useLockHold` in `PerfectTimingArena`), so the lock reads even when the server answers in a few ms. The lock request still leaves at the stop; with a normal server latency (≥ 420 ms) nothing is added. The verdict cue plays with the reveal.
* **Reduced motion** (OS or Mogzy's switch, via the existing `useReducedMotionPreference` → `data-animate="false"`): no ignition, pulse, flash or sweep (hidden); the digits still count; the lock ring is drawn static.
* Verified in a browser: across two whole-second pulses the seal, digits, medallion, plate, status, hint and hero boxes do not move by a pixel (sampled every 100 ms).

### 2.5 Sound

`components/perfect-timing/PerfectTimingArena.tsx` stays the **one owner** of the mode's sound. New registry group `perfect-timing`, built-in synthesized voices (no assets, no Riot audio, no dependency):

| Event | When | Voice |
| --- | --- | --- |
| `ranked.module.start` (unchanged) | a round is armed | existing |
| `perfect-timing.cast` (new) | armed → running | soft mechanical engage + rising arcane shimmer, ~0.35 s |
| `perfect-timing.clock.tick` (new) | each whole elapsed second | dry escapement click with a faint brass body, < 70 ms, gain 0.62 (below the quiz tick's 0.78) |
| `perfect-timing.clock.mark` (new) | every fifth second | the tick, a touch brighter |
| `perfect-timing.lock` (new, replaces `ranked.answer.lock` here) | running → stopped | clean latch + gold ring, ~0.3 s |
| `ranked.answer.correct / incorrect` (unchanged) | reveal | existing tier verdict |

* **Exactly one tick per elapsed second**: `observeSecond` yields at most one beat per frame, for the newest second, and only within 180 ms of its boundary — a stalled frame **skips** seconds rather than bursting to catch up.
* **Identity**: `perfect-timing:<round>:tick:<n>` (and `:cast`, `:lock`), so the engine's eventId dedupe makes re-renders, StrictMode, remounts and a second presenter unable to double a sound (tested: two arenas on one round render each tick once).
* **No late sound**: a tick is skipped when the engine reports a suspended context, and the engine now accepts `dropIfNotRunning` (new optional `SfxPlayOptions` field, used only by the tick) so a tick is dropped rather than resumed-and-played late when the context is not running at render time. Nothing ticks after a stop, an interruption or a hidden page (the loop is gone).
* Global mute, Audio Studio bindings/disable and `minReplayMs` apply as for every event (tested through the real controller with a fake `AudioContext`). In a real browser (Playwright, Edge/Chromium) 3.55 s of running rendered exactly 3 tick voices, ~1 s apart.

### 2.6 Not done (by choice)

* The optional 3–2–1 pre-cast flourish was **not** built: the brief made the stopwatch the priority and said the flourish must never auto-cast or add a delay. It would be a separate, skippable effect on the armed state; an owner call.
* Scoring is unchanged (as instructed), even though a visible clock makes the game easier.

## 3. Files

New: `components/perfect-timing/ArcaneChronometer.tsx` (+ `.test.tsx`), `components/perfect-timing/chronometerSfx.test.tsx`, `lib/perfect-timing/chronometer.ts` (+ `.test.ts`), `lib/perfect-timing/useChronometer.ts`, `lib/perfect-timing/fakeFrames.testutil.ts` (test helper), this file.
Edited: `components/perfect-timing/{PerfectTimingStage.tsx, PerfectTimingArena.tsx, presentation.ts, perfectTiming.css}` (+ Stage/Arena tests), `lib/perfect-timing/viewModel.ts` (optional `clock`), `pages/admin/perfect-timing/{PerfectTimingPage.tsx, MasterySliceRun.tsx}` (one line each, + tests), `lib/audio/{sfx-registry.ts, sfx-renderers.ts, sfx.ts, types.ts}`, `e2e/perfect-timing-owner.spec.ts`.
Untouched: backend, `api.ts`, `contract.ts`, `sliceContract.ts`, `timingEngine.ts`, `useTimingEngine.ts`, `roundView.ts`, `sliceView.ts`, `runShared.ts`, scoring, `index.html`, shared theme, `lib/quiz-timer`.

## 4. Verification

| Check | Branch | Clean base `e2fee510` |
| --- | --- | --- |
| Vitest PT set (`src/lib/perfect-timing`, `src/components/perfect-timing`, `src/pages/admin/perfect-timing`, `src/pages/admin/playtests`) | **354 / 354** | 310 / 310 |
| Vitest PT + `src/lib/audio` + `src/lib/quiz-timer` | 567 / 567 | — |
| Vitest wider set (`src/pages/admin`, `src/components/admin`, `src/lib/{playtests,admin,ranked-arena,public-modes,audio,quiz-timer}`, `src/test/guards`, `src/App*`, `src/pages/quiz-more-challenges`, `src/pages/quiz-daily-challenge`) | 10 failed / 1,769 passed | 10 failed / 1,767 passed — **identical 10 failing tests** (the same pre-existing list as PT5.1 §4: App.routeGuards, App.routing-contract ×2, admin-registry.routes ×2, AdminPlatformPolicies, AdminQuizReview.proPlay, noStaticLeagueFacts, users1AudienceIdentity ×2) |
| `tsc -p tsconfig.app.json` | the same 2 baseline errors (`OnboardingProfile.tsx`, `identity/connections.ts`) | same 2 |
| ESLint (PT folders, `src/lib/audio`, the spec) | 0 problems | — |
| Playwright `e2e/perfect-timing-owner.spec.ts` (`playwright.arena.config.ts`, Vite :8123, stand-ins from the captures) | **67 / 67** (19.6 min) | 62 in PT5.1's run |

New tests (+44 unit, +5 e2e):

* **Pure** (`chronometer.test.ts`): starts at zero, never negative; counts up from `t0`, truncates; the frozen text equals the reveal's `formatSeconds` for every value; one revolution / minute; exactly one beat per second at 60 FPS, none at 0; unique per round and second; a mark every fifth; a late or stalled frame skips (no burst) with the 180 ms bound exact; repeated frame times never repeat a second; a new round restarts; two rounds with different targets beat identically.
* **Component** (`ArcaneChronometer.test.tsx`, hand-cranked `requestAnimationFrame` + `performance.now()`): 0.00 armed with no loop; counts from the engine's `t0`, first value before paint; stop freezes on the **engine's** `elapsedMs` and cancels the loop (a later frame changes nothing); the frozen value is the engine's even when the loop last drew another; submitting stays frozen; next round 0.00; interrupted keeps the last reading, struck, voided, no loop; a hidden page cancels the loop at once (no render, no beat); unmount cancels; ≥ 100 s widens; **zero React commits over 3 s of frames**; beats once per second with alternating pulse + mark; stalled frame never caught up; StrictMode once; no beat after the stop; decoration to assistive tech (seal name = engine label, status unchanged and digit-free while running); lock announced with the engine's time; CAST / PRESS TO STOP; reduced motion; the stylesheet has no `infinite` animation and switches every effect off under reduced motion; identical rendering for any dealt round; no duration but the reading in the dial.
* **Sound through the real SFX controller** (`chronometerSfx.test.tsx`, fake `AudioContext`): the four voices are registered and the tick is quieter than the quiz tick; start → cast → ticks 1–6 (mark on 5) → lock, each rendered; muted renders nothing; a suspended context gets no tick, no resume and nothing late; two presenters render each tick once; StrictMode once; nothing after an interruption; a new round's seconds are its own.
* **Pages**: Random Run — 0.00 armed, a second press inside `MIN_RUN_MS` keeps it running and sends nothing, the stop freezes on the engine's value, the lock body is exactly the engine's interval, next round 0.00. Mastery Slice — each of the three stages starts at 0.00 and freezes on its own stop; locks carry the captured intervals. The five-round run plays start/cast/lock/verdict once per round and never the old `ranked.answer.lock`. Arena: the lock hold (frozen instrument, then reveal + verdict together); a round first drawn revealed is not held.
* **Browser** (Playwright): 1440×900 keyboard and 390×844 touch — 0.00 → counting up monotonically in real time → frozen on exactly the sent `elapsed_ms` (status "Locked at …") → the reveal's "You" is the same stop → next round 0.00; **the seal, digits, medallion, plate, status, hint and hero boxes do not move by a pixel across two whole-second pulses** (26 samples, 100 ms apart). Reduced motion: digits count, zero animations in the dial, sweep hidden. Interrupted: struck reading that stays still. Sound: 3.55 s of running rendered **exactly 3 tick voices**, 850–1150 ms apart, none after the stop.
* **Existing specs updated, not weakened**: "no digit while running" now removes only the chronometer's own reading (which must match `^\d+\.\d\d$`) and still requires everything else digit-free, no answer in the DOM, no `timer-value`, nothing looping; the slice variant likewise. The fit matrix adds `running 1s` (after the first pulse) and `locked` checks at all 14 sizes.

**Zero scrolling**: every state at all 14 sizes (1920×1080 … 320×568, 844×390, 667×375) for Random Run and Mastery Slice, including running after the first pulse and locked — document/screen/main/stage/card overflow ≤ 1 px, no test-id'd element outside the viewport, `<html>`/`<body>` `overflow: hidden`, keys and wheel scroll nothing, and the page scrolls again after leaving. The seal box is identical to the base at every size (e.g. 340 px desktop, 257 px at 390×844, 211 px at 320×568, 183 px at 667×375), and identical between armed and running (the base moved 0.7 px at 320×568 when its status line changed height; fixed by a two-line `min-height`).

Evidence (outside the repo): `C:/Users/mlmit/mogzy-wt/pt52-evidence/` — `after/` (full Playwright sweep: `fit-WxH-{armed,running,running-1s,locked,revealed,…}.png`, `pt52-*` chronometer shots, slice stages and transitions), `before/` + `after-cap/` (same capture script on base and branch: armed / cast / running / locked / reveal at 1440×900, 1024×600, 390×844, 320×568, 844×390, 667×375), `compare/` (24 side-by-side before/after composites), `clips/video/pt52-{1440x900,390x844}-clip.webm` (cast, ~6 s running with pulses and sweep, stop, lock, reveal), `after-run-full.log`, `wider-*.log`.

## 5. Risks / open

* **Difficulty.** A visible stopwatch makes Perfect Timing much easier (the player can read the elapsed time). Approved for the owner experiment; scoring tiers/points are untouched and probably need an owner pass after playtesting.
* **Real devices** (iOS Safari, Android Chrome) not run: headless Chromium/Edge only, as in PT4.4–PT5.1. The rAF loop pauses in a hidden tab by design (the round is voided anyway).
* **Inter 800/900** still not loaded app-wide (PT5.1 §2.4): numerals are Inter Bold.
* The sound is synthesized; it was judged by structure and level against the existing quiz countdown, not listened to by the owner yet. Each voice is one function in `sfx-renderers.ts` and can be rebound in Audio Studio without code.
* Not run against a live backend in a browser (stand-ins from the captures, as before).

## 6. Release (owner-only)

Frontend publish only. Merge `perfect-timing/pt52-arcane-chronometer` → `main`, Lovable **Publish**, then play one Random Run and one Mastery Slice at `/admin/playtests/perfect-timing` with sound on. Rollback: revert/publish the previous frontend (PT5.1 behaviour returns exactly; no data or backend involved).
