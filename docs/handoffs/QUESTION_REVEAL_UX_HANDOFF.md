# Question Reveal UX: handoff

Programme: MOGZY Question Reveal Timing. **Phase 1 (QRT1): Mastery Journey reveal durations.**
This file is kept identical in `mitcherrman/mogsy` and `mitcherrman/League_Combat_Simulator`.

Last updated: 2026-10-23 (release certification, see "Release certification").

## Current state

| Item | State |
|---|---|
| Backend branch | `reveal/qrt1-backend`: master `890534c5` merged in (`f45e97da`); code unchanged since the original pass |
| Frontend branch | `reveal/qrt1-frontend`: main `18a33eff` merged in (`f7bf7747`), plus certification fix `dbf50e55` |
| PRs | [Frontend #134](https://github.com/mitcherrman/mogsy/pull/134) and [backend #97](https://github.com/mitcherrman/League_Combat_Simulator/pull/97), drafts; neither merged or deployed. |
| Verdict | **GO** (2026-10-23): the owner accepted local backend evidence in place of CI and approved `dbf50e55`. Merge, publish and deploy are still the owner's to do |
| Deploy / production data | none. Nothing was deployed or published, and no production data or env was read or written. |
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
5. **No server-side "latency allowance".** Adding slack to the window would hand fast clients a longer reveal than the owner's target and still not bound slow ones. The client minimises delivery loss instead. Residual loss: answer = one-way ack latency; timeout = 60 ms + one read. Against a bot opponent the ack also waits for the route's `_drive_bot` step (`routes/ranked_public.py`, after `submit_challenge`); the hold still ends at `reveal_until`, it only starts that much later. Unchanged by QRT1; measure it live.
6. **Equation Unfold fold point unchanged (3.2 s).** I tried moving it to 4.2 s (so the added second went to the expanded derivation), but that rewrites a measured, test-pinned JP5 design across ~9 tests, so I reverted it. With 7000 ms the derivation is expanded for 3.2 s, then the compact chain is shown for 3.8 s (was 2.8 s) and can be tapped open. **Owner decision (2026-10-22): keep the fold at the measured 3.2 s for Phase 1.**
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
* `src/lib/ranked-core/modules/masterySliceModule.tsx`: the hold carries its end instant (Journeys only, `dbf50e55`).
* `journeyAckReveal.ts` (`dbf50e55`): the overlay also states the paused pooled remainder (`active_time_remaining_ms`) the next snapshot will.
* Tests: new `masterySliceModule.qrt1.test.tsx` and `useRankedMatch.journeyReveal.test.tsx`; `masterySliceReveal.test.tsx` gains the non-Journey hold check.

## Tests and evidence (original pass, 2026-10-22, on the old bases; superseded by "Release certification")

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

## Release certification (2026-10-23)

**Verdict: GO** (2026-10-23; was CONDITIONAL GO until both owner conditions below were met). The code is release-ready on current defaults. Merging, publishing and deploying remain owner actions; none has been done.

1. ~~**Backend CI cannot run** (GitHub billing, below).~~ **Resolved 2026-10-23 by owner decision:** "I accept the local backend evidence in place of CI for PR #97." The local run of the six workflows' exact commands (below) stands in for CI.
2. ~~**Review certification fix `dbf50e55`**~~ **Approved 2026-10-23 by the owner:** "I approve certification fix dbf50e55 (pooled-clock remainder during ack reveal; end-instant hold for Journeys only)."
3. **Release order unchanged:** publish frontend first, then deploy backend; then measure live (see "Next phase").

### Reconciliation (isolated worktrees, merge not rebase: the PRs are open)

| Repo | Behind before | Merged | Overlap with QRT1 |
|---|---|---|---|
| Frontend | 4 (main `18a33eff`) | `f7bf7747` | none. Atlas cross-section dev route only (`src/lib/atlas-cross-section`, `src/pages/dev/atlas-cross-section`, App/Layout route lines, a workflow); nothing imports ranked/Mastery code |
| Backend | 28 (master moved twice during the pass; final `890534c5`) | `f45e97da` | none. Worlds Dynasty (`dynasty/`, `routes/dynasty_*`, two `api_server.py` router lines) and item/rune AD/AP attribution (#98/#99); the only ranked references are docs and an `exact_ref` import |

After each merge, `git diff <default> HEAD` is exactly the original QRT1 change. Both merges were clean.

### Backend CI: infrastructure, not a regression (verified)

Every workflow on every backend branch fails within 2–4 s, master included. Check-run annotations (GitHub REST `check-runs/{id}/annotations`) on all six PR #97 runs, for heads `00aa7a0f` and `e337d82c`, and on master pushes `b8b629cf` / `fafb42ed`, read: *"The job was not started because recent account payments have failed or your spending limit needs to be increased."* The jobs ran no steps, and job logs are unavailable (BlobNotFound) because nothing ran. The last successful backend workflow anywhere was 2026-10-20 09:07 UTC. The backend repo is private, so it uses metered minutes. The frontend repo is public and its CI is green: all 4 workflows on `7eda9282` and `1f5ba92e` (ranked-deployment-recovery, role-challenge-review, practice-modernization-acceptance, practice-pm2-acceptance).

The six blocked workflows' exact commands were run locally on master `890534c5` and the merged branch `f45e97da`. Environment: Windows, Python 3.14.7, pytest 9.1.1, SQLite 3.50.4; CI uses Python 3.12 on Ubuntu.

| Workflow (step) | master | QRT1 branch |
|---|---|---|
| creator-replay-backend | 75 passed, 2 skipped | identical |
| database-concurrency (online backup …) | 91 passed | identical |
| database-concurrency (lease, import, migration) | 49 passed | identical |
| Daily question repeat audit (audit, avoidance, compat) | 37 passed | identical |
| Daily question repeat audit (avoidance flow) | 4 passed | identical |
| question-intelligence | 69 passed | identical |
| role-challenge-review (RC1–RC5) | 293 passed, 45 skipped, 179 subtests | identical |
| role-challenge-review (queue controls) | 10 passed | identical |
| role-challenge-review (Reconstruct timing) | 40 passed | identical |
| storage-lifecycle-safety | 215 passed, 4 skipped | identical |
| tracked-files-unchanged checks | clean | clean |

### Contract review (submit ack ↔ snapshot)

The review covered both diffs, `segment_flow.CardSchedule`, `segment_state_view`, the submit route and every host. A second, independent review of the same code found no correctness defects.

* **Final child:** a Journey block resolves only once the final reveal has run (`everyone_terminal(…, now)` is false until `complete_at`). So the final answer's ack carries `finished: true`, null next-card fields, `reveal_until = complete_at` and `reveal_window_ms` = that child's own window (the final hold is the last reached child's window). The overlay sets `ownCardIndex: null`. All of these match `segment_state`. A strike-stopped block has no final hold and sends no timing, again matching the snapshot.
* **Idempotent retries:** a duplicate submit restates the same `reveal_until` while that child is still revealing, and sends nothing after it. The racing-writer retry sends no timing and `challenge_reveal: null`, so the client keeps the poll path. An ack that arrives after `reveal_until` shows no reveal (`serverStillRevealing` false, hold 0).
* **Stale and out-of-order responses:** the overlay applies only to the same match, segment number and child, and only to a snapshot that has neither the reveal nor a later position. An older poll that lands after the ack is overlaid the same way. A reveal-parse failure is caught and leaves the reveal to the poll. A leftover ack is inert once the snapshot moves on, and it is reset on match change.
* **Timeouts:** the deadline poll uses `own_card_deadline`, which the server publishes for both clocks (pooled Standard: `opened + remaining`; per-card Survival). It is disabled once `own_finished`.
* **Clocks:** the hold's end instant is `reveal_until − skew` on the client clock, capped at the full window, with the same sign convention as `msUntilServerInstant`. The pooled clock is paused through the reveal, as the server reports. The transition beat (`next_card_started_at` after `reveal_until`) comes from the same chain.
* **Hosts:** Daily (`DailyRunPage`), Creator Replay (`CreatorReplayRunPage` → `DailyRunPage`) and Tournament Arena (`ArenaMatchRoom`) all render `QuizRankedMatch`, which applies the overlay to the presented segment.
* **Non-Journey backend:** `_own_reveal_timing` returns `{}` first, so the key set is unchanged. `_reveal_phase` is a line-for-line extraction. `journey_base_window_ms` is called only from `_generate_journey`.
* **Approved values, unchanged:** `JOURNEY_REVEAL_WINDOW_MS = 2250`; working windows `physical_ability_raw_damage` 5000, `physical_ability_damage` 7000, `cooldown_under_haste` 7000; `REVEAL_WINDOW_MS = 1750`; Equation Unfold `UNFOLD_COMPRESS_AT_MS = 3200` (`src/lib/journey/reasoning.ts`, not touched).

**Two deviations found and fixed (`dbf50e55`, frontend only; each new test fails with its fix removed):**

1. *The Standard pooled header showed a stale remainder during an ack-sourced reveal.* The overlay paused the clock but kept the live snapshot's `active_time_remaining_ms`, so the header could read up to one poll interval too high until the next poll landed. On the final child it stayed at the stale value. The overlay now states what the next snapshot will. For a non-final child that is `next_card_deadline − next_card_started_at`, because the server cuts a pooled deadline as `opened + remaining`. For the final child it is the answered child's deadline − (`reveal_until − reveal_window_ms`). Pinned on the real captures: 110000 → **104000** (child 1) and **88000** (final), equal to the server's own snapshots.
2. *The end-instant hold also reached the block-clocked, non-Journey Ranked Mastery Slice*, shortening its 1750 ms hold by the render-to-effect time. It is now passed for Journeys only, so that slice is exactly as before ("Unchanged" above holds).

### Test evidence (current defaults; exact commands under "How to rerun")

| Suite | Base (default branch) | QRT1 head | Verdict |
|---|---|---|---|
| Backend targeted: 94 files (journey/jp/jref/jl1/jlib/jlong/jhaste/jx2/mastery/segment/reveal/qrt/dcmod/daily_journey/meta_reflex/ranked_public/ranked_module/ranked_bot/rbot2/creator/reconstruct/ranked_admin_bot/daily_user_history/daily_challenge), no DB | 218 failed / 1473 passed / 421 skipped / 12 errors | 218 / **1493** / 423 / 12 | **identical failure set**; +20 passed +2 skipped = `test_qrt1_journey_reveal_timing.py` |
| Same 94 files on a private copy of the local canonical DB | 192 failed / 1926 passed / 6 errors | 193 / **1947** / 6 | one extra failure, `test_ranked_public_routes.py::test_submission_flow_and_resume`: a ranked-duel quiz round, not Mastery; **flaky on both** (5 reruns each: base 1/5 pass, head 2/5 pass). Otherwise identical |
| `test_qrt1_journey_reveal_timing.py` with DB | — | 22 passed | |
| Frontend chunk 1: `src/lib/journey`, `ranked-core`, `ranked-public`, `question-feedback`, `src/components/journey` | 6 failed / 1908 passed | 6 / **1931** | identical failures (rankedAssets.rfx1b2, jp4/jp5/visualLanguage stylesheet, orderForge) |
| Frontend chunk 2: `src/features/mastery`, `src/pages/quiz-daily-challenge`, `src/features/tournament-arena` | 1 / 718 | 1 / 718 | identical: `dailyChallengeEntry` "no client for any retired Daily endpoint", a 5 s source-scan timeout under load; it passed on the first head run |
| Frontend chunk 3: `src/pages/quiz-ranked` | 0 / 795 | 0 / **800** | +5 `useRankedMatch.journeyReveal` |
| Frontend chunk 4: `src/pages/admin`, `src/components/ranked-arena`, `src/pages/journey`, `src/App.*` | 14 / 1410 | 14 / 1410 | identical (App routing/route-guard and arena boundary/geometry source scans) |
| `tsc --noEmit -p tsconfig.app.json` | 2 errors | 2 errors | identical (`src/lib/identity/connections.ts` Supabase typing) |
| ESLint, touched files | — | 0 errors | 7 warnings, all on lines QRT1 does not touch |

Pre-existing failures are environment-bound in this checkout (no `onnxruntime`/`numpy`, admin 403s, stale test modules importing removed names such as `AUTH_METHOD_KEY` and `SCORING_ADDITIVE`, CRLF/stylesheet scans). They are identical between base and head.

### Browser acceptance (`/dev/journey-arena`, real JP5 Zed/Ahri capture, DOM observer, from the answer instant)

Probe: `?capture=jp5-ref-zed-ahri&step=<live step>&revealMs=<W>&revealChild=<child>`, headless Edge (Playwright), served by the QRT1 head (`dbf50e55`) Vite dev server. The server's reveal ends exactly W ms after the answer.

Each cell is two runs, in ms from the answer:

| Viewport | Child (server window) | Reveal drawn | Fold | Reveal ended | Overshoot, QRT1 head | Overshoot, base main `18a33eff` |
|---|---|---|---|---|---|---|
| 1024×768 | ordinary (2250) | 69, 66 | — | 2273, 2273 | +23, +23 | +23, +22 |
| 1024×768 | raw calculation (5000) | 37, 34 | — | 5011, 5008 | +11, +8 | +24, +21 |
| 1024×768 | armor calculation (7000) | 38, 41 | 3244, 3245 | 7014, 7009 | +14, +9 | +49, +57 |
| 375×812 | ordinary (2250) | 24, 24 | — | 2260, 2270 | +10, +20 | +17, +16 |
| 375×812 | raw calculation (5000) | 29, 27 | — | 5020, 5013 | +20, +13 | +17, +17 |
| 375×812 | armor calculation (7000) | 29, 27 | 3219, 3225 | 7011, 7014 | +11, +14 | +36, +43 |

* **Fold:** 3.2 s after the reveal is drawn, as approved. Only the armor/haste working folds; the raw calculation has no fold.
* **End:** the reveal ends within 8–23 ms of the server's end instant on head, against 16–57 ms on base. What remains is the render after the timer fires.
* **Layout:** no horizontal page overflow at either width.
* **Images:** at 1024 px, 2 stage images never loaded from the remote asset host on either tree (the asset host, not the code).
* **Machine:** these runs were taken on a quieter machine than the 2026-10-22 numbers, which showed +138 ms for the base.

The harness drives `masterySliceModule` (hold, fold, end); the ack → overlay path itself is covered by the jsdom suites above and the backend's real `submit_challenge` tests. The live measurement after release (see "Next phase") is the end-to-end proof.

### How to rerun

* Backend workflow commands: as in `.github/workflows/{creator-replay-ci,database-concurrency,daily-question-repeat-audit,question-intelligence,role-challenge-review,storage-lifecycle-safety}.yml`, run as `python -m pytest -q -p no:cacheprovider -rfE <files>` with `PRO_STATS_WARMUP=0 PATCH_OPS_ENABLE_EXTERNAL_VISION=0`, after deleting any 0-byte `lol_calc.db` in the checkout.
* Backend targeted set: the same, plus `--continue-on-collection-errors`; once without `LOL_CALC_DB_PATH`, once with it pointing at a **copy** of the canonical DB. Run base and head on separate checkouts.
* Frontend: Vitest per chunk (`--maxWorkers=4 --reporter=verbose`; the full suite OOMs in one process). On this machine it needs a scratch config without `@vitejs/plugin-react-swc` and a WASM rollup require-hook. Diff the `×` lines against a detached base checkout.

## PRs

* **Frontend draft PR #134:** https://github.com/mitcherrman/mogsy/pull/134, base `main`; code head `dbf50e55`.
* **Backend draft PR #97:** https://github.com/mitcherrman/League_Combat_Simulator/pull/97, base `master`; code head `f45e97da`.
* Neither merged, published or deployed.


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

**Owner decision (2026-10-22): keep longer wrong/timeout holds** in Reconstruct/Scrub (4000 vs 3400 ms), Match Grid (4500 vs 3000 ms), and Assembly (4400 vs 3600 ms). Error correction requires more comparison time than a perfect solution. Do not equalize these timings during Phase 2.

## Next phase

* Owner decision (2026-10-22): retain longer wrong/timeout reveal holds in Reconstruct, Scrub, Match Grid and Assembly; preserve existing authoritative per-mode windows until Phase 2 readability testing. The Equation Unfold fold stays at 3.2 s.
* After both PRs merge and deploy: on a live Journey, measure `reveal_until − first paint` for an answer and a timeout (expect about one-way latency, and about 60 ms + one read). If the Railway env still sets `RANKED_MASTERY_REVEAL_WINDOW_MS`, confirm new Journey segments freeze 2250.
* Phase 2 per the recommendation above, in separate PRs.
