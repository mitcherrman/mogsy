# Question Reveal UX: handoff

Programme: MOGZY Question Reveal Timing. **Phase 1 (QRT1): Mastery Journey reveal durations.**
This file is kept identical in `mitcherrman/mogsy` and `mitcherrman/League_Combat_Simulator`.

Last updated: 2026-10-22.

## Current state

| Item | State |
|---|---|
| Backend branch | `reveal/qrt1-backend` (off `origin/master` `b3814e26`) |
| Frontend branch | `reveal/qrt1-frontend` (off `origin/main` `a5d97120`) |
| PRs | branches pushed; PRs to be opened from the compare links below. Not merged. |
| Deploy / production data | none. Railway was unavailable, so nothing was deployed and no production env was read. |
| Phase 2 (sitewide answer-result component) | not started; inventory and recommendation below |

## What the owner asked for (final targets, not additions)

| Mastery Journey reveal | Old (ms) | New (ms) | Where it lives |
|---|---|---|---|
| Ordinary child | 1750 | **2250** | `ranked_modules/mastery_slice.py` `JOURNEY_REVEAL_WINDOW_MS` |
| Physical ability raw damage (`physical_ability_raw_damage`) | 4000 | **5000** | `JOURNEY_WORKING_REVEAL_WINDOWS_MS` |
| Physical ability damage after armor (`physical_ability_damage`) | 6000 | **7000** | `JOURNEY_WORKING_REVEAL_WINDOWS_MS` |
| Cooldown under ability haste (`cooldown_under_haste`) | 6000 | **7000** | `JOURNEY_WORKING_REVEAL_WINDOWS_MS` |

Correct, wrong and timed-out children of one calculation get the same window. The window is chosen at freeze from the child's typed working, never from the outcome.

**Unchanged:** the non-Journey Ranked Mastery Slice (`REVEAL_WINDOW_MS` = 1750) and the legacy `/quiz/mastery` player (`MASTERY_REVEAL_DURATION_MS` = 1750).

## How the reveal timing works (verified in code, not assumed)

* **Frozen per segment.** `_generate_journey` freezes `reveal_window_ms` (the base) and, when the children differ, `reveal_windows_ms` (one entry per child) into the public payload. Every reader (`segment_flow.reveal_windows_from_payload`) reads the payload, never the constants. A Journey frozen before QRT1 keeps 1750/4000/6000 for its whole life.
* **Server schedule.** Child `i+1` opens at `settled_i + window_i (+ open_delay)` (`segment_flow.card_schedule`). The pooled clock (Standard) and per-card clock (Survival) are paused through every reveal. Response durations subtract the window. The final child holds `complete_at = end + window_last` before the block resolves. The bot waits out the same windows.
* **Reveal phase.** `own_revealing_card_index` / `own_reveal_until` come from the same chain (`service._reveal_phase`, extracted in QRT1 so the submit response shares it).
* **Client hold.** `masterySliceModule` holds a reveal only while the server says it is revealing. It ends at `own_reveal_until` and is never lengthened: the next child's answer clock is already running after that.

### The visible-duration problem (why a longer window alone was not enough)

The visible reveal = `reveal_until` − the moment the client first draws it. Before QRT1:

| Path | When the client learned of the reveal | Lost from the window |
|---|---|---|
| Answer | the poll triggered after the submit ack (and any poll already in flight ahead of it). The Mastery module ignored the ack's inline `challenge_reveal`. | ack travel + one full public read. The live stack measured 0.5–2 s per public read, and up to 2–11 s under load (`useRankedMatch` JOURNEY5-LIVE note). |
| Timeout | the next ordinary 1.5 s poll. Nothing polled at the deadline. | up to 1.5 s + one read |
| Any | the hold timer was armed in an effect with a delay computed in render | **overshoot**: measured +138 ms past `reveal_until` in the browser, more on a slow phone, while the next child's clock was already running |

## Decisions

1. **Journey base is a floor, not a fallback** (`journey_base_window_ms`): `max(deployment flag, 2250)`. Before, `reveal_window_ms or JOURNEY_REVEAL_WINDOW_MS` meant a deployment with `RANKED_MASTERY_REVEAL_WINDOW_MS=1750` (the documented Phase C value) would have kept every Journey at 1750, so the owner's change would silently not apply. Railway was unavailable to check the env, so the code no longer depends on it. A deployment that sets a *longer* window still keeps it.
2. **The reveal starts from the submit response.** The backend adds `challenge_reveal_timing` to the submit ack, for Journey segments only. It is derived by the same `_reveal_phase` as `segment_state`, at the same `now`. The client overlays it (and the inline `challenge_reveal`) on a snapshot that has not caught up yet (`withJourneyAckReveal`), so the reveal draws one response after acceptance instead of a response plus a poll. It is a no-op once a snapshot carries the reveal. It is never applied across match, segment or child, and never past `reveal_until`.
3. **Poll at the open child's deadline** (Journey only, scheduling only), so a timeout's reveal arrives about one read after the server settles it.
4. **Hold against the end instant.** `useRevealAutoAdvance(key, cb, delayMs, endsAtMs)` measures the wait when the timer is armed. Browser-measured end overshoot went from +138 ms to +22–25 ms (just the render after the timer fires).
5. **No server-side "latency allowance".** Adding slack to the window would hand fast clients a longer reveal than the owner's target and still not bound slow ones. The client minimises delivery loss instead. Residual loss: answer = one-way ack latency; timeout = 60 ms + one read.
6. **Equation Unfold fold point unchanged (3.2 s).** I tried moving it to 4.2 s (so the added second went to the expanded derivation), but that rewrites a measured, test-pinned JP5 design across ~9 tests, so I reverted it. With 7000 ms the derivation is expanded for 3.2 s, then the compact chain is shown for 3.8 s (was 2.8 s) and can be tapped open. **Owner decision pending:** move the fold to 4.2 s?
7. **Click acknowledgment** is unchanged and verified. A tap marks the tablet `selected`, locks the grid, and paints no correct or wrong until the server's reveal arrives. A refused submit releases the lock.

## Changes

**Backend (`League_Combat_Simulator`, `reveal/qrt1-backend`)**
* `ranked_modules/mastery_slice.py`: `JOURNEY_REVEAL_WINDOW_MS` 2250 (decoupled from `REVEAL_WINDOW_MS`); working windows 5000/7000/7000; `journey_base_window_ms()` floor.
* `ranked_public/service.py`: `_reveal_phase()` (one derivation for `segment_state` and the ack); `_journey_reveal_timing()`; `submit_challenge` adds `challenge_reveal_timing` on fresh and idempotent Journey acks.
* Tests: new `test_qrt1_journey_reveal_timing.py`; `test_journey5_release.py` and `test_journey3_daily.py` now read the Journey constant instead of pinning 1750.

**Frontend (`mogsy`, `reveal/qrt1-frontend`)**
* `src/lib/ranked-public/client.ts`: `revealTiming` on the challenge ack (`readJourneyAckRevealTiming`, fail-closed → null).
* `src/lib/ranked-core/journeyAckReveal.ts` (new): `withJourneyAckReveal`.
* `src/pages/quiz-ranked/useRankedMatch.ts`: keeps the accepted Journey ack; overlays it on `segmentState`; adds the deadline poll.
* `src/pages/quiz-ranked/QuizRankedMatch.tsx`: overlays it on the presented segment.
* `src/features/mastery/interactions/revealState.ts`: `endsAtMs` on `useRevealAutoAdvance`; doc note that Journey windows are server-owned.
* `src/lib/ranked-core/modules/masterySliceModule.tsx`: the hold carries its end instant.
* Tests: new `masterySliceModule.qrt1.test.tsx` and `useRankedMatch.journeyReveal.test.tsx`.

## Tests and evidence

| Suite | Clean base | With QRT1 |
|---|---|---|
| Backend: reveal and Journey related files (55 files, no canonical DB) | 80 failed / 1656 passed / 374 skipped | 80 failed / **1676** passed / 374 skipped. **Identical failure set**, +20 new tests |
| Backend: Journey e2e on a local canonical `lol_calc.db` (read-only), 13 files | 25 failed / 332 passed | 25 failed / **352** passed. **Identical failure set**. JP5 e2e now asserts 2250/5000/7000 |
| `test_qrt1_journey_reveal_timing.py` | — | 22 passed with the DB (20 + 2 skipped without) |
| Frontend: journey, ranked-core, mastery, quiz-ranked, ranked-public, daily, journey pages | same 8 failures on clean `main` | 8 failed / **3423** passed. **Identical failures** (stylesheet/asset assertions in jp4/jp5/visualLanguage/orderForge/rankedAssets) |
| `masterySliceModule.qrt1.test.tsx` + `useRankedMatch.journeyReveal.test.tsx` | — | 19 + 5 passed. The overlay and deadline-poll tests fail when either feature is disabled (mutation-checked). |
| `tsc --noEmit` / eslint on touched files | — | clean / 0 errors |

The pre-existing failures are unrelated to reveal timing. They occur identically on untouched `origin/master` / `origin/main` in this environment.

**Deterministic coverage:** ack arrival at 0/120/400/900 ms shows exactly `window − lag` and ends at `reveal_until`; the pre-QRT1 poll path loses the read (1200 ms); a late ack (after `reveal_until`) shows nothing; a duplicate ack, a stale poll and the catching-up poll keep one hold to the same instant; unmount mid-hold leaves zero timers; correct/wrong/timeout hold the same window; frozen pre-QRT1 windows (1750/4000/6000) are preserved; a 2250 ordinary child holds 2250; a slow commit cannot push the hold past the end instant; an older-backend ack and a foreign-segment ack change nothing; timeouts are polled at deadline + 60 ms; the backend ack equals `segment_state` (pure, and real `submit_challenge` on the canonical DB, including idempotent retries).

**Browser acceptance** (`/dev/journey-arena?capture=jp5-ref-zed-ahri&step=17&revealMs=7000&revealChild=3`, real client path, DOM-observer timings from the answer instant):

| Viewport | Reveal drawn | Fold | Reveal ended (server end = 7000) |
|---|---|---|---|
| Before end-instant fix, 1024×768 | 128 ms | 4242 ms* | **7138 ms** (overshoot) |
| 1024×768 | 47 ms | 3242 ms | 7025 ms |
| 375×812 | 30 ms | 3232 ms | 7022 ms |

\*during the reverted 4.2 s fold experiment.

At 375 px the full derivation (85 → 24 → 100/(100+24) → 0.806 → 19.4% → 68, plus the damage bar) fits the card with no horizontal overflow. Note: in the in-app browser pane, CSS entrance animations stayed at `currentTime 0` (a pane artifact), so raw screenshots look dimmed. Legibility screenshots were taken after finishing pending animations; timers are unaffected.

## Compatibility and release ordering

* **Either order is safe.** An old client ignores `challenge_reveal_timing` and already reads per-child windows from the payload. A new client against an old backend gets no timing block and behaves exactly as before (the deadline poll and the end-instant fix are harmless on their own).
* **Recommended: frontend first, then backend**, so the ack-driven reveal and the overshoot fix are live before the longer windows reach players.
* **In-flight segments** finish under their frozen windows. Only newly generated Journey segments get 2250/5000/7000.
* **Daily Challenge:** its Journey module gets the new windows from the next generated segment. Scoring is unaffected: reveals are excluded from response time, the pooled clock is paused, and block deadlines are compensated. A Daily that spans the deploy mixes old and new reveal lengths with no effect on scores. Windows are not part of any Daily digest or avoidance key.
* **Creator Replay / Journey Library / admin presets:** same generator; `test_creator_journey_selection`, `test_jlib1_journey_library`, `test_jref*`, `test_jl1*` and `test_jlong1` show no new failures.
* **Reload/resume:** unchanged. The hold is still derived from `own_reveal_until` on every snapshot, and a seen reveal never replays.
* **Grading/answer authority:** untouched. The ack's reveal is the server's graded reveal, read by the same reader as a polled one.

## PRs

Both branches are pushed. The PRs were **not opened by the agent**: no GitHub CLI was installed and the browser was not signed in. Open them from:

* Backend: https://github.com/mitcherrman/League_Combat_Simulator/compare/master...reveal/qrt1-backend?expand=1 (base `master`)
* Frontend: https://github.com/mitcherrman/mogsy/compare/main...reveal/qrt1-frontend?expand=1 (base `main`)

Merge and deploy order: frontend, then backend (see above). Neither is merged or deployed.

## Phase 2: inventory of answer-result components (read-only)

| Mode | Result surface | Duration source | Equal for correct / wrong / timeout? |
|---|---|---|---|
| Ranked quiz rounds (and the Daily's quiz stages) | `CanonicalArena` → `InteractiveScenarioSurface`, `RoundResultBeat` / `RevealBanner` / `QuestionResultOverlay` | FE `pacing.ts` `REVEAL_HOLD_MS` 1500 (2600 with level-up or evidence; min 900), anchored to the next `started_at`; BE `ranked_public/pacing.py` mirrors it | yes |
| Ranked Mastery Slice | `MasterySliceChallengeSurface` | BE frozen `REVEAL_WINDOW_MS` 1750 (only when `RANKED_MASTERY_REVEAL_WINDOW_MS` is on) | yes |
| Mastery Journey | `JourneyStageQuestion` / `JourneyReveal` | BE frozen per child: 2250 / 5000 / 7000 (QRT1) | yes |
| Meta Reflex | `metaReflexModule` | BE `CARD_REVEAL_WINDOW_MS` 1500, purely server-derived | yes |
| Order Forge | `OrderForge` | FE 1500 beat (+420 dwell); BE `DEFAULT_REVEAL_WINDOW_MS` 2500 for compensation | yes |
| Reconstruct / Scrub | module renderers | BE settlement hold: 4000 wrong or timeout, 3400 exact | **no** |
| Match Grid | `matchGridModule` | BE 4500 wrong, 3000 all-exact | **no** |
| Assembly | `PositionalAssembly` | BE 4400 wrong, 3600 exact | **no** |
| Practice / missed replay | `PracticeArena` | FE `practiceRevealHoldMs`: 1500, or reading time max(2600, 1200 + 45 ms/char), capped at 12 s; can be paused | by text length |
| Pro Play / Worlds 2026 | `ProPlayArenaRun` + `ProPlayRevealFooter` | manual Next | n/a |
| Legacy `/quiz/mastery` | `MasteryPlayerLive` | FE `MASTERY_REVEAL_DURATION_MS` 1750 | yes |

Verdict vocabularies in use: `FeedbackVerdict` (question-feedback/model), `ResultKind` (`data-outcome`), QuizAnswerFeedback tones, QuestionResultOverlay tones, `data-choice-state` (QuizAnswerOptions; DataDuel uses the same set), `MasteryChoiceTone` / `CHOICE_TONE_CLASS`, Journey `journey-reveal__verdict--*`, Assembly `data-verdict`/`data-mark`.
Hold mechanisms: `useRankedMatch` `revealHold`, `pacing.ts` server-paced holds (`SERVER_PACED_REVEAL_MODULES`), `useRevealAutoAdvance`, Meta Reflex's server phase, `usePracticeAutoAdvance`, and Daily discovery holds.

### Recommendation: the smallest shared approach

Do **not** build a new mega-component. Converge on what already exists:

1. **One verdict vocabulary.** Make `ResolvedFeedback` / `FeedbackVerdict` (`lib/question-feedback/model.ts`) the only input to result styling, with a single `verdictTone()` mapping replacing `CHOICE_TONE_CLASS`, the Journey verdict classes and Assembly's `data-verdict`. Rendering is CSS keyed on `data-choice-state` / `data-verdict`, which `QuizAnswerOptions` already emits.
2. **One timing primitive.** Promote `useRevealAutoAdvance(key, cb, delayMs, endsAtMs)` (now end-instant safe) to `lib/question-feedback/useRevealHold`. Every server-paced surface passes the server's end instant; only Practice and the legacy player pass a duration.
3. **One small `VerdictLine`-based header** (it already exists, but Ranked does not use it) for "Correct · 68" / "Wrong" / "Time's up", adopted mode by mode behind visual-regression tests.

Open question for the owner before Phase 2: the server-paced modules deliberately hold a wrong answer longer than an exact one. Keep that, or move to outcome-blind like the Journey?

## Next phase

* Owner: decide on the 4.2 s fold (Decision 6) and the outcome-blind question above.
* After both PRs merge and deploy: on a live Journey, measure `reveal_until − first paint` for an answer and a timeout (expect about one-way latency, and about 60 ms + one read). If the Railway env still sets `RANKED_MASTERY_REVEAL_WINDOW_MS`, confirm new Journey segments freeze 2250.
* Phase 2 per the recommendation above, in separate PRs.
