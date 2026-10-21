# PT5.3 — Blind Timing, Automatic Flow and Effect Durations

Status: **PT5.3A (blind automatic flow) implemented on `perfect-timing/pt53a-blind-auto-flow`, draft PR mitcherrman/mogsy#114, not merged, not published (see "PT5.3A — implementation progress" at the end). PT5.3B (effect durations) not started; no production changes.** Original status: planning/specification committed; code NOT implemented. Owner approved exploring the full workstream on 2026-10-19. Branch `perfect-timing/pt53-blind-flow-research`. Read `PT52_HANDOFF.md`, `PT51_HANDOFF.md` and `PT5_HANDOFF.md` first.

## Product objective

Make Perfect Timing a high-tempo, **blind** game of LoL timing intuition. The game controls **when an event starts**; the player controls **when it ends**. Reuse the polished PT5.2 Arcane Chronometer, artwork and sounds, but stop exposing elapsed seconds or periodic elapsed-time cues. Add a curated **Effect Durations** category (stasis, resurrection, protection, CC, stealth, buffs/debuffs, DoT) alongside the existing cooldown challenges.

## Delivery lanes — keep separate

**A. PT5.3A (first PR; frontend/game-engine only): Blind automatic flow.**
- A clear, loud but accessible **3, 2, 1 → CAST/ACTIVATE** countdown opens each round, with a fixed count-in animation and sound. It is *pre-start* only.
- The timing engine accepts an explicit `AUTO_START` event with monotonic timestamp, not synthetic pointer/key events. The event must be recorded at the **actual executed start**, never backdated to an animation/CSS timestamp.
- After auto-start, the player only presses once to **STOP**. Reject attempts before start and guard any 3→2→1 key/press bleed. Preserve min-run, dedupe, visibility void, exact engine-submitted elapsedMs, server lock contracts.
- Blind run: **no stopwatch digits**, no whole-second ticks, no every-fifth accent, no synchronized sweep/pulse/progress representing elapsed time. Maintain a static/ambient clock face and finite cast/lock effects. No time cues tied to hidden target.
- On stop show lock burst, then authoritative reveal with YOU vs TRUE, error and rank/item lesson. Brief *readable* dwell; then automatically proceed. For Mastery Slice play Rank Up/Item Equipped transition before the next count-in. Don't require Continue to advance normal rounds.
- Decide explicit control policy during review: owner recommendation **pause only between attempts**; resume re-counts in, not silently starts. Allow exit and accessibility/reduced-motion without breaking zero-scroll. Provide user-settable pacing or a nonintrusive "Hold" between-round control if browser evidence shows feedback is too rushed.
- **Initial timing suggestions only, subject to playtest**: first countdown 3 s, reveal ~2.5 s, slice lesson transition ~1.5 s; no extra waiting beyond these. Never auto-advance away from a live server error, interrupted round or unresolved submission; keep recovery actionable.
- Test race conditions (slow tab, throttling, canceled countdown, backgrounding, resume, unmount, double-press, keyboard and touch), full 14 viewport zero-scroll matrix, reduced motion, no leaked target, Real Browser.

**B. PT5.3B (subsequent backend+frontend PRs; independent of A): Effect Durations authority and playable catalog.**
- **Do not put effect durations into existing `cooldownRaw` or pretend they are cooldowns.** Introduce explicit `challenge_kind`, `event_start`, `event_end`, `duration_ms`, `conditions`, rank/variant and independently verifiable patch provenance. Prefer a versioned editorial manifest + backend validation and server-authoritative deal/lock/reveal; client never receives secret duration before lock.
- Patch scope: **PC League Summoner's Rift** with an explicit frozen patch. On 2026-10-19, patch 26.20 is live; 26.21 is scheduled for 2026-10-21 (recheck on rollout). Do not automatically equate Mogzy's older canonical cooldown snapshot (26.18) with certified 26.20 durations.
- A candidate is playable only once its exact rank, target event, conditional scenario, exact integer milliseconds, source and reviewed patch revision are certified; otherwise keep it research-only.
- Different semantic outcomes: end of stasis, resurrection completed, root/sleep ending, protection-zone expiry, stealth ended, DoT expired (single application/no refresh). Don't label all protections as "invulnerable."
- Duration grading can reuse existing relative-error tiers *only after explicit tests and product acceptance*, but must use backend-authoritative targets. Very short durations may need a difficulty/fairness review.
- Presets can deliver "mixed" runs and thematic effect packs after the initial curated cohort passes acceptance. Existing Random Run/Mastery Slice preserved until owner chooses distribution.
- Sounds: original Mogzy synthesized event-specific cues (cast, stasis, revive, sleep, burn), respecting mute. Do not extract or redistribute Riot-recorded ability/item SFX until license/rights are verified.

## Consolidated candidate inventory

Indicative durations below are **NOT production-certified** unless separately signed off against the frozen target patch.

| Effect | Event to time | Indicative seconds | Conditions and priority |
|---|---|---:|---|
| Zhonya's Hourglass | stasis activation → stasis ends | 2.5 | Priority A, fixed. Legacy Mogzy Zhonya timing game should be located/audited; not yet located. |
| Guardian Angel | death triggers resurrection → player revives | 4 | Priority A, must mark correct start event. |
| Vladimir W | Sanguine Pool begins → untargetability ends | 2 | Priority A. |
| Xayah R | Featherstorm untargetability start → ends | 1.5 | Priority A, verify event endpoint. |
| Tryndamere R | Undying Rage activation → death prevention ends | 5 | Priority A; **cannot die**, not universally invulnerable. |
| Kindred R | Lamb's Respite zone created → zone expires | 4 | Priority A; zone duration, **not blanket invulnerability**. |
| Lillia R | sleep begins (AFTER drowsy) → sleep ends | **2.5 / 2.75 / 3** at R rank 1/2/3 | Riot **26.20** verified, no wake-up damage; rank progression candidate. |
| Neeko E — FIRST target | first E hit applies root → normal root ends | **0.7 / 0.9 / 1.1 / 1.3 / 1.5** at E ranks 1–5 | Patch 26.20 champion-data listing; zero tenacity, no cleanse. Need source certification and 0.7 s fairness playtest. |
| Neeko E — AFTER passing through an enemy | empowered E hits later target → root ends | **2 / 2.25 / 2.5 / 2.75 / 3** at E ranks 1–5 | Riot 26.20 **empowered** values; projectile has already struck another enemy (minion/champion), not first target; zero tenacity. Show the through-target geometry/condition clearly. |
| Kayle R | Divine Judgment invulnerability begins → ends | **2.5 at all R ranks** | Riot 13.9 removed previous 2/2.5/3 rank scaling; do not create rank-varying duration lesson. |
| Zilean R — buff | Chronoshift buff applied → 5 s revive-protection window expires | 5 | Only if no lethal damage triggers it. |
| Zilean R — rebirth | lethal damage triggers Chronoshift → resurrection completes | 3 | Clock begins **on lethal trigger**, NOT when Zilean casts R. |
| Liandry's Torment | last qualifying hit applies burn → burn expires | 3 | One application; no refresh. Distinguish tick cadence. |
| Blackfire Torch | last qualifying hit applies burn → burn expires | 3 | One application; no refresh; distinct from Liandry, confirm canonical item ID. |
| Fizz E | start untargetability → normal max untargetability ends | ~1.25 | No early recast; multi-phase endpoint not certified; later wave. |
| Talon R | stealth begins → maximum stealth ends | up to 2.5 | No attack/recast; later wave. |
| Kha'Zix evolved R | evolved single invisibility activation begins → ends | 2 | Evolved only, one activation, NOT total recast window; later wave. |
| Akali W | shroud appears → base shroud lifetime ends | 5 / 5.5 / 6 / 6.5 / 7 | Verify by patch; shroud duration is NOT uninterrupted stealth. |
| Bard R | Tempered Fate stasis begins → ends | ~2.5 | Verify. |
| Morgana Q | Dark Binding root applied → root ends | rank dependent | Verify all five ranks; zero tenacity, no cleanse. |

Extra candidate families for later exploration: ignite/grievous-wounds debuffs, Nasus W Wither, stun/root/knockup durations, stealth and invisibility, cleanseable marks, shield durations, damage-over-time ticks versus total lifespan. Keep unverified families OUT of playable pool.

## Neeko E correctness — user specifically emphasized this

The first enemy that E strikes gets **normal** root duration. The projectile becomes **empowered after striking an enemy**, making later hits use the **empowered** root. The first enemy can be a minion or champion. Build two distinct question variants:
- `neeko_e_first_target`: "E hits this champion directly as its first target" (normal duration).
- `neeko_e_pass_through`: "E passes through a minion/champion, then roots this champion" (empowered duration).
Never use empowered 2–3 s if the champion is first hit; never assume the same target receives both root durations.
Reference Riot 26.20: https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-20-notes/
Patch-26.20 champion-data listing: https://pharos.wiki/lol/en/champions/Neeko?patch=26.20
Patch history for first-versus-subsequent hit mechanics: https://leagueoflegends.fandom.com/wiki/Neeko/LoL

## Sources / patch authority

- Riot 26.20 official Lillia 2.5/2.75/3 and empowered Neeko 2/2.25/2.5/2.75/3: https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-20-notes/
- Riot 14.18 previous Lillia normalization: https://www.leagueoflegends.com/en-us/news/game-updates/patch-14-18-notes/
- Riot 13.9 Kayle normalization: https://www.leagueoflegends.com/en-gb/news/game-updates/patch-13-9-notes/
- Riot patch schedule (26.21 expected Oct 21): https://support-leagueoflegends.riotgames.com/hc/en-us/articles/360018987893-Patch-Schedule-League-of-Legends
- Further wiki candidates and owner history documented in the conversation's `PT53_EFFECT_DURATION_CANDIDATES.md` research ledger; source links should be integrated during B editorial certification, not trusted blindly.

## Acceptance / sequencing

1. Ship **no code** as part of this research/spec commit. Keep branch for Claude handoff.
2. Fresh implementation instance reads this handoff and existing PT5.x handoffs, checks current `main` and opens a **separate PT5.3A branch** (not from stale spec branch).
3. Implement, test, record desktop/phone video of auto-start blind loop, owner review/PR; **do not merge/deploy without explicit approval**.
4. Another scoped PT5.3B backend authority investigation: research canonical content sources for active patch; implement versioned audited effect manifest, tests, then FE category and original sound palette. Never ship guessed targets.
5. User acceptance should judge pacing and actual gameplay fun before considering public rollout; owner-only stays until approved.

## Implementation environment
Frontend `mitcherrman/mogsy` (`main`, Lovable deployment), backend `mitcherrman/League_Combat_Simulator` (`master`, Railway production); **no Docker**. Use isolated worktrees, handoff updates, screenshot/video captures, preserve all Perfect Timing input safety and zero-scroll guarantees.

---

# PT5.3A — implementation progress (blind automatic flow)

**Status 2026-10-21: implemented on `perfect-timing/pt53a-blind-auto-flow` (from `origin/main` `657b4a91`), pushed, draft PR open, NOT merged, NOT published.** Frontend only (`mitcherrman/mogsy`). No backend, API contract, scoring, authorization or flag change. Effect durations are **not** in this PR (PT5.3B).

## A.1 Owner decisions taken in this pass

* **Scope: owner lab only.** The blind flow is the default at `/admin/playtests/perfect-timing` (Random Run and Mastery Slice). The **public PGM2 game** (More Challenges → Perfect Timing) shares the Random Run component and **keeps the PT5.2 visible flow** until the owner approves a rollout (the PR is a no-op for public players). `?flow=visible` plays the PT5.2 flow in the lab for comparison; `PerfectTimingPage` takes `flow?: "blind" | "visible"`.
* **Browser runs: CI only.** No local browser automation (AGENTS.md). The viewport sweep and the gameplay videos run on GitHub's headless Chromium (`.github/workflows/perfect-timing-blind-flow.yml`).
* **Control policy: pause between attempts only** (the handoff's recommendation). Hold is offered during a count-in, on a reveal and on a slice transition — never while a round is timed. A held count-in resumes from 3.

## A.2 What changed

### Engine (`lib/perfect-timing/timingEngine.ts`, `useTimingEngine.ts`)

* New phase **`countdown`**: `ARM { roundId, start: "auto" }`. Every press is refused there (reducer returns the same state; the hook reports an `early` diagnostic and does **not** remember it, so the dedupe window cannot swallow the real stop). `aria-disabled` is true; the label is "Timing starts after the countdown". Document Space/Enter are heard (never scroll) and refused.
* New event **`AUTO_START { roundId, t }`**: only from `countdown`, only for that round, only once, only for a finite non-negative `t` → `running` with `t0 = t`. Hook: `autoStart(roundId, t)`.
* Everything after the start is the PT2 machine unchanged: one press stops it; `MIN_RUN_MS` (250) swallows a press that bled over from the count-in; hidden/pagehide void a running round (and void nothing while counting in); `MAX_ELAPSED_MS`, `elapsed_ms` integer, lock contract unchanged. The press-to-start `ARM` default is untouched (public flow, PT2 tests).

### Count-in (`lib/perfect-timing/countIn.ts`, `useCountIn.ts`)

* 3 at 0 ms, 2 at 1,000, 1 at 2,000, start due at 3,000 (`COUNT_IN_MS`). Identical for every round; it never sees the ability, item or target.
* One `requestAnimationFrame` loop while counting in; the beat is derived from **real** elapsed time (a stalled frame shows the current beat and skips a passed one — never replays it). State changes only on a beat (3 renders per count-in).
* **The start:** on the first frame at/after 3,000 ms the hook reads `performance.now()` again — the moment the start is *executed*, never the scheduled 3,000, the frame's own timestamp or a CSS time — and calls `onStart(roundId, t)` inside `flushSync`, so the running state (the CAST) is committed in that same frame and the cast cue plays from it. Tested in jsdom (clock read at execution ≠ frame timestamp) and in the browser (the lock's `elapsed_ms` equals key time − the moment CAST hit the DOM, ±25 ms).
* Cancelled by: going inactive (Hold, a new round, reset), unmount, `visibilitychange → hidden`, `pagehide`. Visible again / `pageshow` → a **new pass** from 3 (never a silent or mid-count start). A frame that lands while hidden never starts the round.

### The blind instrument (`components/perfect-timing/ArcaneChronometer.tsx` → `BlindChronometer`)

Same brass dial and box (fit budget = PT5.2), no frame loop at all:

| Phase | Centre | Plate | Notes |
| --- | --- | --- | --- |
| count-in | **3 / 2 / 1** (big gold numeral, one-shot scale-and-glow like the quiz countdown beat; 1 strongest; a one-shot gold ring per beat) | GET READY | the slice "what changed" mark plays now (it was armed-only) |
| held | still pause mark | HELD | hint line: **Resume** |
| running | the ability's **slot letter**, engraved, still; **CAST** flashes once at the start (760 ms) | PRESS TO STOP | **no digits, no sweep, no per-second pulse, no tick, nothing periodic** |
| stopped / submitting | the player's own locked time (engine `elapsedMs`, gold) | LOCKED | the measurement is over; same text as the reveal's "You" |
| voided | struck dash | VOIDED | |

Hint line during a count-in: "NOT READY? · [HOLD]" in the hint's own 24 px line (a 44 px invisible halo for touch, so nothing moves).

### Sound (`PerfectTimingArena.tsx`, `lib/audio/sfx-registry.ts`)

* Count-in: `perfect-timing.countin` (3, 2) and `perfect-timing.countin.final` (1) — new registry events bound to the **quiz countdown's own voices** (`sfx.quiz.countdown-urgent` / `-final`), so Audio Studio can rebind them for this mode. Event ids `perfect-timing:<round>:<pass>:countin:<n>` (a re-count is heard again; a re-render never is).
* Cast at the automatic start (`perfect-timing.cast`), lock, verdict — unchanged voices. The old `ranked.module.start` is replaced by the count-in in the blind flow.
* **Nothing sounds while a round runs** (the PT5.2 tick/mark are not wired in the blind flow). Every pre-start cue and the cast use `dropIfNotRunning` and are skipped on a suspended context: a late start cue would mislead.
* Note: a direct link (`?run=random`) has had no gesture yet, so the first count-in may be silent until the player's first stop unlocks audio; entering through the mode pick or the Playtests hub is a gesture.

### Automatic progression (`useSettledAdvance.ts`, `PerfectTimingReveal.tsx`, `SliceTransition.tsx`, both runs)

* `useSettledAdvance` gains `autoAdvanceMs` + `paused`: once settled, the screen moves on by itself after the dwell (source `"auto"`), once — whichever of the dwell, a key or a click comes first is the only advance. The dwell runs only while the page is visible (hidden stops it, visible starts it over) and never while held.
* **Reveal:** dwell `REVEAL_DWELL_MS` = **2.5 s after it settles** (~1.7 s choreography), so a result is on screen ~4.2 s and fully readable for 2.5 s. A quiet fill along the way-on button shows it coming (none under reduced motion). Hold sits beside Next (Next still advances at once; Space/Enter too).
* **Slice transition:** `TRANSITION_DWELL_MS` = **1.5 s after it is ready** (~0.9 s entrance) → straight into the next stage's count-in. Hold beside Continue.
* Count-in 3 s. Loop: count-in 3 s → the player's interval → lock hold 0.42 s → reveal ~4.2 s → (transition ~2.4 s) → next count-in. All four values are single constants in `presentation.ts` / `countIn.ts` (initial playtest values).
* **Never automatic:** voided rounds, lock errors (409 / exhausted retries), deal errors, a pending (slow) lock, expired/resumed slices, the results screen. Their recovery stays the player's.
* Races: `advance` in both runs is once-only through a `stageRef` (an automatic advance racing a press or a late click moves the run one state); the count-in start is applied only for the round on screen and only in `play`; Hold is accepted only between attempts.

### Fixed on the way: the PT5.2 lock hold could strand the reveal

`useLockHold` (PerfectTimingArena) armed its timer only when `holding` flipped. A timer that fired a fraction of a millisecond before `performance.now()` agreed the 420 ms were over (the two round differently) woke a render that still computed "holding", and nothing re-armed, so the reveal stayed hidden ("Locked. Checking the archive.") until some other render. Found because CI flaked `MasterySliceRun.test.tsx`; reproduced on the clean base under CPU stress (1 of 8 runs); in the blind flow it would be a hang. The effect now re-arms after every wake (`woken` in its deps) with 1 ms slack. Regression test in `PerfectTimingArena.test.tsx` (fails before, passes after); 16 stressed runs green after.

### Unchanged

Backend, `api.ts`, contracts, scoring, haste, Random Run generation, slice progression and recovery, authorization (`AdminRoute`, `require_admin`, flag), zero-scroll screen (`useFixedViewport`), PT5.1 transitions/typography, PT5.2 visible flow (public).

## A.3 Files

New: `lib/perfect-timing/{countIn.ts, useCountIn.ts}`, tests `lib/perfect-timing/{timingEngine.autoStart.test.ts, useTimingEngine.autoStart.test.tsx, useCountIn.test.tsx, useSettledAdvance.auto.test.tsx}`, `components/perfect-timing/BlindFlow.test.tsx`, `pages/admin/perfect-timing/BlindAutoFlow.test.tsx`, `.github/workflows/perfect-timing-blind-flow.yml`.
Edited: `lib/perfect-timing/{timingEngine.ts, useTimingEngine.ts, useSettledAdvance.ts, viewModel.ts}` (`PtPhase` + `countdown`, `PtStageModel.flow`, `PtBlindFlowView`), `components/perfect-timing/{ArcaneChronometer.tsx, PerfectTimingStage.tsx, PerfectTimingArena.tsx, PerfectTimingReveal.tsx, SliceTransition.tsx, presentation.ts, perfectTiming.css}`, `pages/admin/perfect-timing/{PerfectTimingPage.tsx, MasterySliceRun.tsx, runShared.ts}` (+ their tests pinned to `flow="visible"`), `lib/audio/sfx-registry.ts`, `e2e/perfect-timing-owner.spec.ts`.

## A.4 Verification

| Check | Result |
| --- | --- |
| Vitest PT set (`src/lib|components|pages/admin/perfect-timing`, `src/pages/admin/playtests`, `PerfectTimingGame.test.tsx`) | **423 / 423** (base `657b4a91`: 356 / 356; +66 PT5.3A, +1 lock-hold regression; the PT5.2/PT5.1 page suites unchanged except `flow="visible"` and a 4 s async wait for shared CI runners) |
| Vitest `src/lib/audio` + `src/lib/quiz-timer` | 213 / 213 |
| Vitest wider set (`src/pages/admin`, `src/components/admin`, `src/lib/{playtests,admin,ranked-arena,public-modes}`, `src/test/guards`, `src/App.route*`, `src/pages/quiz-more-challenges`, `src/pages/quiz-daily-challenge`) | 7 failed / 1,517 passed — all 7 on the known pre-existing list (admin-registry.routes ×2, AdminPlatformPolicies, AdminQuizReview.proPlay, noStaticLeagueFacts, users1AudienceIdentity ×2); none touches Perfect Timing |
| `tsc -p tsconfig.app.json` | the same 2 baseline errors (`OnboardingProfile.tsx`, `identity/connections.ts`) |
| ESLint (PT folders, `sfx-registry.ts`, the spec) | 0 problems |
| Playwright (CI, headless Chromium) | see A.5 |

New unit coverage (66): engine `countdown`/`AUTO_START` (refusals, exact `t0`, stale/repeat/non-finite starts, bleed inside `MIN_RUN_MS`, hidden while counting, re-arm); hook (early presses refused and not remembered, document keys heard and refused, exact interval, stale starts, PT2 press-start unchanged); count-in (schedule, beats from real time, start at first frame ≥ 3 s with the clock read at execution, stall skip, hold/new round/hidden/pagehide/unmount cancel, re-count as a new pass, StrictMode one start, flushSync commit); dwell (after settle, held, hidden restarts, key/click/dwell race once, unmount); presenters (no digits/sweep/beat/frame loop while running, count numeral per beat and pass, locked time, voided, Hold/Resume focus, reduced motion, stylesheet finite, identical for every round); arena sound (count-in voices, cast, nothing while running, lock, verdict, held = silent, re-count heard once, `dropIfNotRunning`); integrated runs (five rounds by stops only with automatic reveals and results, presses during the count-in refused, Hold on reveal / count-in, hidden during count-in / running, slow lock, failed lock, public host + `?flow=visible` keep PT5.2, Mastery Slice with automatic transitions and Hold on a transition).

## A.5 Browser evidence (GitHub Actions)

Workflow `.github/workflows/perfect-timing-blind-flow.yml` (push to this branch, PRs touching Perfect Timing, manual): unit job; the browser sweep as four jobs (blind PT5.3 block / every PT4.4–PT5.2 spec on the visible flow, each in two shards, `--workers=1`, headless Chromium); gameplay videos (`PT_VIDEO=1`).

**Final: run 4 (`49735ebc`, pull_request run 39601412714 and push run 39601407812): all 12 jobs green — unit 636 / 636 (PT + audio + quiz timer), browser 110 / 110 (blind 21 + 20, visible-flow 34 + 33), videos 2 / 2.**

Run 3 (`495ff61e`): unit green on both runs (the lock-hold fix); the pull_request run fully green; the push run failed one spec once — under reduced motion the instrument's 220–240 ms colour/filter *transitions* were still running at the instant the round started (only keyframe animations were switched off). Reduced motion now also switches the instrument's transitions off (`49735ebc`: every state change is instant; the stylesheet unit test asserts it).

Run 2 (`e1650b97`, actions run 39596421326): **browser 110 / 110** — PT5.3 blind 41 (20 + 21), visible-flow 67 (33 + 34), videos 2 — no skips (the real-Chromium sound test ran: 2 count-in voices + 1 final + 1 cast + 1 lock per round, 0 ticks, nothing between the cast and the stop). The unit job hit the lock-hold flake above, fixed in the next commit; the PR records the final run.

Run 1 found two things, both fixed: (1) the fit matrix measured slice transitions at "ready", mid-entrance, where the effect layers' transforms enlarge the clipped card's scroll box (what PT5.1 avoided by measuring after the entrance) — the matrix now holds the transition and measures after the entrance; the layout itself fit in every screenshot; (2) the first video opened on ~8 s of a cold dev server — the video test now warms it first.

What the blind specs prove, at 1440×900 (keyboard), 390×844 and 375×812 (touch), and the 14-size matrix (1920×1080 … 320×568, 844×390, 667×375):
* every round counts in and the GAME starts it; an early Space / tap is refused; nobody presses Next or Continue — five Random Run rounds and a whole Mastery Slice (both transitions) play by stops alone, and the reveal is never cut short (≥ 4.2 s on screen); the results do not start a new run;
* while a round runs: no digit on the stage but the hero's rank plate, no chronometer reading, no sweep, no truth in the DOM, nothing looping, and nothing animating at all once the cast flourish is over;
* the start is the CAST on screen: the sent `elapsed_ms` equals the key's timestamp minus the moment the running state hit the DOM (±40 ms tolerance), after a 3.0–3.6 s count-in;
* a key held through the start carries nothing over; one stop locks once; Hold during the count-in starts nothing until Resume, which counts in from 3 with focus on the seal; a tab hidden during the count-in re-counts from 3; hidden while running voids, and the void waits (no automatic advance, focus on Next round); a slow deal shows no count-in; a 6 s lock holds "Locked at …" and never advances, then reveals and moves on; reduced motion: numerals and words, no animation in the instrument, no fill, the reveal still moves on;
* zero scrolling for every blind state at all 14 sizes: count-in, held count-in, running, locked, reveal, held reveal, voided, lock error, each slice stage's count-in and reveal, both transitions (held), results — document/screen/main/stage/card overflow ≤ 1 px, nothing outside the viewport or clipped by the card, `<html>`/`<body>` `overflow: hidden`, keys and wheel scroll nothing.

Evidence (outside the repo): `C:/Users/mlmit/mogzy-wt/pt53-evidence/` — `ci-run4/videos/` (the final run's videos, same script as run 2), `ci-run2/videos/pt53-blind-gameplay-{desktop-1440x900,mobile-390x844}.webm` (~82 s each: three Random Run rounds with one held reveal, then a full Mastery Slice with Rank up and Item equipped moving on by themselves), `ci-run2/shots-blind-{1,2}/` (every blind state at every size, `pt53-*` full-run shots), `ci-run1/` (the first run, including the mid-entrance captures). The same files are the run's artifacts (`pt53-gameplay-videos`, `pt53-shots-*`, 14–30 days).

## A.6 Risks / open (owner)

* **Pacing** (3 s / 2.5 s after settle / 1.5 s) is a first guess; judge it in play. Hold covers "too rushed"; a user-settable pace was not built.
* **Public rollout** of the blind flow is an owner decision: the public host plays `flow="visible"` today (the default in `PerfectTimingPage` for a public host).
* **Scoring** is unchanged; the blind game is harder than PT5.2's visible stopwatch again (closer to PT5.1).
* **The first count-in may be silent** on a direct link with no prior gesture (browser autoplay policy); entering through the hub or the mode pick unlocks audio.
* **Real devices** (iOS Safari, Android Chrome) not run; headless Chromium on CI only (no local browser runs, AGENTS.md).
* Mid-entrance, the slice transition card's scroll box is briefly larger than the card (clipped, never scrollable, focus uses `preventScroll`) — pre-existing PT5.1 behaviour, unchanged.

## A.7 Release (owner-only)

Frontend publish only, after review: merge the PR → Lovable **Publish** → play one Random Run and one Mastery Slice at `/admin/playtests/perfect-timing` with sound on (`?flow=visible` to compare). Rollback: revert the merge (the PT5.2 flow returns; no data or backend involved). Next lane: **PT5.3B** effect-duration authority (backend first), independent of this PR.
