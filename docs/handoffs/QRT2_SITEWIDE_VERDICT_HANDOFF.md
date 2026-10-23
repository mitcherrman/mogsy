# QRT2 — sitewide verdict clarity and readable reveal timing

State: **Phase 2A implemented** (Ranked + hosted Daily answer-result presentation), draft PR [mitcherrman/mogsy#136](https://github.com/mitcherrman/mogsy/pull/136) (head `8977797f`), nothing merged, published or deployed. QRT1 companions stay as they were: frontend #134, backend #97 (both still draft). Frontend branch `qrt2/sitewide-verdict-clarity`, forked from `main` `18a33eff` on 2026-10-22 (still `main`'s tip on 2026-10-23: no drift). The sections after the Phase 2A report are the original scope notes and remain the plan for later phases. This is the durable handoff for a **fresh Claude instance**; start here and inspect current code/history before edits.

# PHASE 2A REPORT (2026-10-23)

## What a player sees now

| | Before (`a2eebc89`) | After |
|---|---|---|
| Verdict stamp | 1.05rem pill (16.8px) on a phone; TIMED OUT was 1.2rem, *smaller than CORRECT beside it* | CORRECT / INCORRECT / TIMED OUT at 1.5rem–2rem (TIMED OUT 1.4rem–1.9rem), 3px ring, same icon + words as before |
| Vocabulary | stamp: CORRECT / INCORRECT / TIMED OUT; `VerdictLine`: "Correct!" / "Incorrect" / "Time!" | one set, `VERDICT_HEADLINE` in `question-feedback/model.ts` ("Correct" / "Incorrect" / "Timed out", drawn upper-case); both surfaces read it |
| Correct answer | a quiet blue tablet under the shared Button's 50% disabled dim: as washed-out as the three bystanders, marked only by a small check | the one lit tablet: emerald, fully opaque, 2px inset ring, check icon **and a "Correct answer" tab in words** |
| Player's wrong pick | rose tablet, 9px "Your pick" text at the bottom edge | full-strength rose tablet with its own ring, ⊗ icon, and a gold "Your pick" tab. Right answer and wrong pick are told apart by words, icon and hue |
| Evidence line | `#e8c97a` gold on parchment: **1.09:1** measured on the painted pixels (present in the DOM, invisible to the eye) | `#2a1a04` dark ink: **≥ 4.5:1** measured on the pixels under the verdict's green/red wash |
| Daily first-miss `VerdictLine` | 28px tall, `text-sm` | 32px, `text-lg`, inside the stage's 33px feedback slot; timeout takes the danger hue but keeps its hourglass icon and its own words |
| Selected acknowledgment | tablet turns `selected`, no verdict | **unchanged** (asserted: a click draws no stamp, no tag and no `correct` state) |

Before/after pairs: [`qrt2-evidence/`](qrt2-evidence/) (17 side-by-side JPEGs: Ranked and hosted Daily × correct / incorrect / timeout at 360×640, 390×844, 430×932 and 1280×720; the Daily retry states; the *selected* frame is identical before and after on purpose).

## Files

* `src/lib/question-feedback/model.ts` — `VERDICT_HEADLINE` reworded; `feedbackVerdictOfRound` (`timed_out` → `timeout`, a pure rename).
* `src/components/ranked-arena/QuestionResultOverlay.tsx` — the stamp reads the shared vocabulary; `data-verdict` on the node.
* `src/components/question-feedback/VerdictLine.tsx` — shared words, larger, timeout hue.
* `src/components/quiz/QuizAnswerOptions.tsx`, `ranked-arena/AnswerGrid.tsx`, `question-surface/InteractiveScenarioSurface.tsx`, `ranked-core/modules/quizModule.tsx` — a new **opt-in** `verdictTabs`, passed only by `quizModule` (Ranked, the hosted Daily and the Tutorial). Every other surface renders exactly what it did.
* `src/index.css` — stamp scale (and the separate TIMED OUT override), the emerald/rose tablet skin scoped to `[data-verdict-tabs]` (the original blue/rose rules are kept for everyone else), evidence ink on the parchment stage.
* `src/pages/dev/ranked-arena-inspector/RankedArenaInspector.tsx` — two fixture states for the Daily judged-card states (`surface-daily-retry`, `surface-daily-resolved`).
* Tests: `QuestionResultOverlay.qrt2.test.tsx` (11), `InteractiveScenarioSurface.qrt2.test.tsx` (11), `resultPresentation.qrt2.css.test.ts` (7), `e2e/qrt2-verdict-clarity.spec.ts` (19 browser tests, registered in `playwright.arena.config.ts`).
* **Not touched:** `pacing.ts`, `useRankedMatch.ts`, any timer, any backend file, `RoundResultBeat` / the HUD plate, and every file in QRT1 draft PR #134 (verified: zero overlap with `git diff origin/main...origin/reveal/qrt1-frontend`).

## Findings from inspecting the active render path (read before extending)

1. **Ranked and the hosted Daily are one render path.** `DailyRunPage` hosts `QuizRankedMatch` → `CanonicalArena` → `quizModule` → `InteractiveScenarioSurface` → `AnswerGrid` → `QuizAnswerOptions`. The verdict is drawn by `QuestionResultOverlay` (on the card, `pointer-events: none`, absolute: it costs no height). One change covers both.
2. **`RoundResultBeat` is not the active verdict on a phone.** Its plate is `hidden md:flex`; below `md` the player sees the overlay stamp and `MobileMatchBar`'s small "Incorrect" label. On desktop it is a fixed 2.5rem plate inside `.ranked-record-window` CSS that sizes it to its window. I left it alone on purpose (requirement: do not overflow the fixed top HUD); enlarging it needs its own pass against `.ranked-record-window`.
3. **The Daily "retry" state has no production caller in this checkout.** `feedbackFromDailyCard` / `feedbackFromRankedRound` / `feedbackFromMetaReflexCard` are exercised only by tests; nothing in `src/` outside `lib/question-feedback/` imports them, and nothing outside the feedback model reads `scoreLocked` / `retryAvailable`. The surface *does* support the state (`feedback` prop → `VerdictLine`, struck-out options, the disclosure gate), so I improved and tested it (unit tests + inspector captures), but there is no live Daily screen that renders it today. The live Daily's questions reveal through the same stamp as Ranked.
4. **The probe's reveal lasts ~860 ms, not 1500 ms.** `/dev/ranked-shell-probe` anchors its hold to its own fixture `started_at`. Every browser measurement therefore reads the page inside one in-page animation-frame task the first time a tablet is lit (`firstRevealSnapshot`), and screenshots use `animations: "disabled"`. Do not "fix" the spec by sleeping.
5. **Existing live regions that mention the verdict (pre-existing, not changed, not fixed).** During a reveal the page has `ranked-last-result` (`role=status`), `mobile-status-userA/B`, `outcome-userA/B` and the overlay's sr-only status: six regions say the result. `BeatPlate`'s comment says it avoids `aria-live`, but `role=status` implies polite. Whether this double-announces depends on the screen reader and needs a real screen-reader pass. What Phase 2A guarantees (asserted in the browser spec): it adds **no** live region. The stamps and the tablet tabs are decoration outside any live region, and the overlay's single status is the only one this surface owns.
6. **The shared stamp also draws over other arena modules** (Mastery slice, Meta Reflex cards; modules that `ownsResultReveal` suppress it). I spot-checked Meta Reflex at 360×640: the stamp clears the card content. The tablet tabs and skin are **not** applied to those modules (opt-in).

## Verification

| Check | Result |
|---|---|
| New unit tests | 29 passed (`QuestionResultOverlay.qrt2`, `InteractiveScenarioSurface.qrt2`, `resultPresentation.qrt2.css`); `EvidenceLine.test.tsx` updated for the shared wording |
| Browser spec `e2e/qrt2-verdict-clarity.spec.ts` | **19 passed** (360×640, 390×844, 430×932, 1280×720: selected → CORRECT → INCORRECT in one mount; TIMED OUT; live-region discipline; reduced motion; hosted Daily at 360 and 1280; the bank's three longest rows at 360×640; evidence contrast on painted pixels) |
| Same spec against the unmodified base (`a2eebc89`) | **fails**: 4 of the 5 sampled tests (390×844 ×2, reduced motion, evidence); evidence contrast measures 1.09:1. The suite detects what it claims to |
| Affected suites (ranked-arena, question-surface, quiz, pro-play, question-feedback, ranked-core, quiz-ranked, ProPlayQuiz, dev pages, journey, mastery; 414 files on head, 411 on base) | head 30 failed / 6885 passed; base 29 failed / 6857 passed. The one extra head failure (`LobbyPreviewPage.premiumAnalytics` L1) passes on rerun (load flake). With `index.css` normalised to LF, the stylesheet-reading files fail **identically** on both (17 = 17, empty `diff`): pre-existing environment failures such as `QuestionStageGeometry`, `AnswerGrid.elimination`, `*.boundary`, `RankedPlayGem` |
| `tsc --noEmit -p tsconfig.app.json` | 2 errors, both in files this branch does not touch (`OnboardingProfile.tsx`, `identity/connections.ts`) |
| eslint on touched files | 0 errors (4 pre-existing `react-refresh` warnings) |
| Phone one-screen | `scrollHeight − innerHeight ≤ 0` at 360×640, 390×844 and 430×932 for selected, correct, incorrect and timeout. `realP99` / `stressA` overflow 640px by 8 / 60 px **before** any answer (that is what they are for); the reveal adds none |
| Layout stability | prompt top, first tablet top, last tablet bottom and every tablet height are identical (≤ 0.5 px) between the selected question and its reveal |

To run the browser spec: serve Vite on :8123 (`node node_modules/vite/bin/vite.js --port 8123 --strictPort`, cwd = this checkout) and `npx playwright test -c playwright.arena.config.ts e2e/qrt2-verdict-clarity.spec.ts`. On this machine vitest needs the esbuild-config workaround (the shared `@swc/core` is broken).

## Timing: left exactly as it is

No timer, hold or pacing constant changed. Ordinary rounds still use `REVEAL_HOLD_MS` 1500 ms (2600 ms with evidence or a level-up), `REVEAL_HOLD_MIN_MS` 900 ms, and the server's `RESULT_HOLD_MS` 1500 / `RESULT_HOLD_RICH_MS` 2600 + `MODULE_TITLE_MS` 1400 (`ranked_public/pacing.py` at `origin/master`). Reconstruct, Scrub, Match Grid and Assembly keep their longer incorrect-answer holds (owner decision 2026-10-22). QRT1's windows (2250 / 5000 / 7000 ms for Journey) and PRs #134 / #97 are untouched.

## Remaining modes that still need adoption

"Vocabulary" = `VERDICT_HEADLINE`; "tabs" = `verdictTabs` on the mode's answer grid.

| Mode / surface | Renderer today | What is left |
|---|---|---|
| Ranked Mastery Slice | prose path: **adopted** (tabs + headline, see the adoption report); atomic-recall / comparison: headline only | tabs for the atomic and comparison tablets (shared Mastery components); check `DataDuel` (own "Your pick") |
| Mastery Journey | `JourneyStageQuestion` → surface; `journey-reveal__verdict--*`; own `.journey-question` tablet CSS | adopt vocabulary + tabs after QRT1 #134 merges (same reveal surface); the Equation Unfold fold stays 3.2 s |
| Meta Reflex / Stat Check | card beat + `CardResultBeat`; already has its own "YOUR PICK · CORRECT" tab; overlay stamp | vocabulary only; keep its comparison rows |
| Order Forge | `ownsResultReveal` (own reveal; stamp suppressed) | vocabulary only |
| Reconstruct, Scrub, Match Grid, Assembly | module renderers, `ownsResultReveal`; per-outcome server holds | vocabulary only. **Do not equalise holds** |
| Practice / missed replay | **adopted** (tabs + shared footer words; `PracticeArena`) | decide whether simple Practice takes the new ordinary timing baseline; reader-controlled pause stays |
| Pro Play / Worlds quizzes | **adopted** (tabs + shared sentence; manual Next kept) | label "Correct answer" on wide pair tiles via a container query |
| Legacy `/quiz/mastery` | `MasteryPlayerLive`, `MASTERY_REVEAL_DURATION_MS` 1750 | vocabulary |
| Standalone `Quiz.tsx` | `QuizAnswerOptions` directly (no `markSelectionOnReveal`) | out of scope until the arena language is accepted |
| HUD plate (`RoundResultBeat`, desktop only) | fixed 2.5rem plate, `text-sm lg:text-base` | its own pass against `.ranked-record-window`; phones never see it |
| Daily retry (DC1 cards) | adapters unwired | wire `feedbackFromDailyCard` where the retry screen is built; the surface is ready |
| Live-region audit | six regions mention the verdict (finding 5) | a real screen-reader pass; consolidate to one |

## Proposal: timing changes to reach ~2250 ms of ordinary feedback (NOT implemented; needs coordinated FE + BE)

**Why a longer constant alone does nothing.** The next round's `started_at` is `resolve + hold + title` (`pacing.module_transition_ms`, written once into the settlement as `presentation_ms`). The client holds `max(900, min(nominal, msUntilNextAnswerable − title))` (`anchoredRevealHoldMs`). So:

* raising only the backend leaves the client's ceiling at 1500 ms: the extra time becomes dead air in the title window;
* raising only the frontend changes nothing: the hold is bounded by `started_at − title`;
* and a client learns of a resolution up to `POLL_MS` 1500 + RTT 400 ms late, which is subtracted from the hold. **Today's visible reveal for an ordinary round is `1500 − lag`, floored at 900 ms: roughly 0.9–1.5 s, not 1.5 s.** That is why it reads short.

**Proposed pair (both sides in lockstep; a pinning test already ties `pacing.ts` to `pacing.py`):**

| Constant | Now | Proposed |
|---|---|---|
| FE `REVEAL_HOLD_MS` / BE `RESULT_HOLD_MS` | 1500 | **2250** |
| FE `REVEAL_HOLD_EVIDENCE_MS` (= `LEVEL_UP`) / BE `RESULT_HOLD_RICH_MS` | 2600 | **3200** (≥ 3000 for evidence-bearing reveals) |
| `REVEAL_ABSORB_CAP_MS` (= the level-up hold) | 2600 | 3200 (it must stay ≥ the new nominal) |
| `MODULE_TITLE_MS` / `REVEAL_HOLD_MIN_MS` | 1400 / 900 | unchanged |
| Ordinary `presentation_ms` | 2900 | **3650** (+750 ms per module) |
| Evidence `presentation_ms` | 4000 | **4600** (+600 ms) |

Why this does **not** consume the next question's clock: the offset is applied to the next round's `started_at` (the "round opens in the future" mechanism already used for module titles and Meta Reflex card windows); `active_deadline = started_at + duration`, so the configured answer time begins later and is never shortened. The cost to the match is +0.75 s per ordinary module (+7.5 s over ten), paid in presentation time, not answer time. A match in flight keeps its frozen `presentation_ms`, as QRT1's frozen windows do.

**To make 2250 ms actually *visible*, shrink the discovery lag; the budget above does not cover it:**

1. a deadline poll for timeouts (QRT1's `useRankedMatch` already does this for Journey: poll at the open card's deadline + ~60 ms);
2. a short "waiting for the opponent" poll (~600 ms instead of 1500 ms) after the viewer has submitted, so a resolution triggered by the opponent's answer is seen within ~600 ms + RTT;
3. optionally carry the settlement in the submit response for the participant whose answer resolves the round (QRT1's `challenge_reveal_timing` pattern).

With (1) and (2) the worst-case lag drops from ~1.9 s to ~1.0 s, so the visible reveal becomes `2250 − lag` ≈ 1.25–2.25 s. Closing the remainder needs either a larger server budget (a discovery allowance, which adds dead air for fast clients unless the client's absorb cap clips it, as the Meta Reflex entry already does) or the submit-response settlement. That is a product choice: measure live `reveal_until − first paint` first, as QRT1 prescribes.

**Verify before building it (read from `origin/master` source, not run):**

* the FE "rich" test is `conciseEvidence(...)` present; the BE test is `settlement["question_explanation"]` truthy (`settlement_is_rich`). Confirm they agree for every evidence-bearing question, or FE and BE will hold different lengths;
* `special_transition_ms` (final-round warning 5450 ms, Meta Reflex entry 5950 ms) is built from `hold + RESOLVE_DISCOVERY + HEADROOM + visible + margin`: the hold term moves with `RESULT_HOLD_MS`, so those budgets grow by 750 ms; decide whether the absorb cap should take it;
* the Daily's quiz stages and Meta Reflex card windows (`segment_flow.card_schedule`, `CARD_REVEAL_WINDOW_MS` 1500) are separate server schedules, so `pacing.py` alone does not cover the Daily;
* Order Forge's two pacing layers (FE 1500 beat + 420 dwell; BE `DEFAULT_REVEAL_WINDOW_MS` 2500) and Practice's reading-time hold (`max(2600, 1200 + 45 ms/char)`) are independent and must not be changed by the ordinary-round pair;
* backend tests that pin 1500 / 2600 / 2900 / 4000, and `src/lib/ranked-core/pacing.test.ts`.

**Rollout order for that follow-up (same as QRT1):** frontend first (the ceiling and absorb cap rise; harmless against the old schedule because the hold is bounded by `started_at − title`), then backend, then measure the live answer-and-timeout visible duration.

## Deployment dependencies for Phase 2A

* **Frontend only.** No backend change, no migration, no flag, no data. Publishing is the owner's step (Lovable). Rollback is a revert of the PR.
* **Independent of QRT1 #134 / #97.** No shared files (verified) and no shared contract; merge in either order. A rebase onto a merged #134 should be mechanical (`index.css` is not in #134's file list).
* **Independent of the Phase 2B timing pair above**, which is optional and sequenced after this.
* Owner review gate: look at `qrt2-evidence/` on a phone, and note that the stylesheet-test environment failures listed in the verification table are identical on base.

---

# PHASE 2A-ADOPT REPORT (2026-10-23): Mastery slice, Pro Play / Worlds, Practice

Stacked draft PR [mitcherrman/mogsy#138](https://github.com/mitcherrman/mogsy/pull/138) on top of #136 (base `qrt2/sitewide-verdict-clarity`, branch `qrt2/phase2a-adopt-modes`). Frontend only, presentation only, no timer or backend change.

## What each mode now does

| Mode | Before | After |
|---|---|---|
| **Pro Play / Worlds** | correct tablet blue with a small check; "Your pick" as 9px text (or a top tab on content tablets); verdict only in an sr-only sentence | "Correct answer" and "Your pick" tabs, emerald/rose tablets (the #136 skin), `verdictSentence` built from `VERDICT_HEADLINE`; manual Next unchanged |
| **Practice** | same tablets as Pro Play; footer "Correct!" / "Incorrect" in `text-sm font-semibold` | same tabs and skin; the footer word is the shared headline ("Correct" / "Incorrect"), set heavy and upper-case like the arena stamp (`data-testid="practice-verdict"`); "Answer not verified" untouched |
| **Mastery slice, prose path** (arena surface) | during the server's held reveal the tablets showed only the player's pick as `selected`: **the right answer was not marked on the tablets at all**, only in the text box below | tablets carry the server's answer (`Correct answer`) and the player's pick (`Your pick`), emerald/rose skin; the inline reveal has a headline row |
| **Mastery slice, atomic-recall and comparison paths** | own tablet components with outline tones | headline row only (see "left undone") |
| **Standalone `/quiz/mastery` player** | inline reveal said "Correct: x" / "Answer: x" | same headline row (it shares `MasteryInlineReveal`); no timeout word, because that wire has no expiry flag |

Pro Play, Worlds and Practice all mount their question through the **same `CanonicalArena` `questionSurface` seam**, so adopting them is one opt-in (`verdictTabs`) at that seam, not three. The arena-question dev probe rides it too.

## Design decisions and findings

1. **Mastery verdict headline** (`MasteryInlineReveal`): icon + shared word on the same row as "Answer: x", so a phone's card gains no line. `VERDICT_TONE` is now exported from `VerdictLine` and shared.
2. **TIMED OUT in the Mastery slice comes from the server's flag.** `MasteryQuestionReveal.timedOut` is set from the segment's `own_timed_out_challenges[challengeIndex]` (the same flag `useRankedMatchSfx` reads). A missing pick without the flag is "Incorrect", never "Timed out" (unit-tested). The standalone player and any reveal frozen before the flag existed simply never say "Timed out".
3. **The prose surface now receives a `reveal` only while the server's own per-challenge reveal is held.** `surfaceRevealFor` maps the server's `correctValue` to the option whose label equals it (exactly what `choiceTone` does for the other renderers); a value matching no option lights nothing. Before the reveal and between challenges the surface still gets `reveal={null}`, so nothing is disclosed early (unit-tested: no tab, no `correct` state, no verdict before a reveal).
4. **Compact tabs for narrow tablets.** A two-up pair (Pro Play) or a picture choice (Practice, Pro Play) is ~145-155px wide on a phone; the two tabs together (~170px) spilled off the tablet's left edge. They are now set tighter (9px, 0.08em) and the answer's reads "Correct" when the player's pick shares the edge (~128px total). On those layouts the label is chosen by layout, not by measured width, so a Pro Play desktop pair says "Correct" as well; a container query would let wide tiles say "Correct answer" again (follow-up).
   * **Rejected: pick tab on the bottom edge.** It fixed the width but `e2e/pm2`'s "tablet text clipped" measure treats a tab hanging off the bottom as overflow (the tablet's scroll box grows). Caught by running PM2; the top-edge compact version passes.
5. **Existing 10px phone re-centre in the Mastery card** (the submit button becomes the reveal box): identical on the base, left alone, and pinned in the browser spec at 10 ± 1px (0 on desktop).
6. **Pro Play's fixture page scrolls** (846 / 616 / 346px at 360×640 / 390×844 / 1280×720): identical on the base, not this PR's.
7. **Tests that pinned the old behaviour were updated on purpose:** Practice's "Correct!" text, and `CanonicalArena.regionsSeam` (a question surface now has top-edge tabs on label tablets; it had a bottom-right "Your pick"). `CanonicalArena` has a source guard that forbids naming modes, so the opt-in comment names none.
8. **Dev fixture:** `/dev/ranked-shell-probe?q=masteryRecall&mreveal=right|wrong|timeout[&mprose=1]` holds a Mastery slice's own reveal (long window) so it can be captured and measured; `mprose=1` serves the recall challenges without prompt semantics, which is what routes them to the arena surface.

## Files

* `CanonicalArena.tsx` (one opt-in), `PracticeArena.tsx`, `proPlayRevealModel.ts`
* `MasteryInlineReveal.tsx`, `revealState.ts` (`timedOut`), `MasterySliceChallengeSurface.tsx` (`surfaceRevealFor`, `verdictTabs`), `masterySliceModule.tsx` (reads the flag), `AtomicRecallQuestionView.tsx` / `ComparisonQuestionView.tsx` (pass the flag)
* `VerdictLine.tsx` (`VERDICT_TONE` exported), `QuizAnswerOptions.tsx` (compact tabs)
* `RankedShellProbe.tsx` (dev fixture)
* Tests: `masterySliceModule.qrt2.test.tsx` (11), additions to `PracticeArena.test.tsx` (+3) and `ProPlayArenaRun.reveal.test.tsx` (+1), two pinned tests updated, `e2e/qrt2-adoption.spec.ts` (18 browser tests, registered in `playwright.arena.config.ts`)

## Verification

| Check | Result |
|---|---|
| New unit tests | Mastery slice 11, Practice 3, Pro Play 1: all pass |
| `e2e/qrt2-adoption.spec.ts` | **18 passed** (Mastery slice prose right / wrong / timeout and pre-reveal at 360×640, 390×844, 1280×720; Pro Play pick 0 / pick 1 at the same sizes). Asserts the lit tablet is opaque and tagged, the pick tab sits on the tapped tablet, a timeout has no pick tab, every tab is one line, inside the viewport, inside its own tablet, off the letter plate and off the other tab, no tab is in a live region, no tablet changes height, the page does not scroll in the Mastery card, and Pro Play keeps its manual Next |
| Same spec on the base (#136 head `5e02f010`) | **fails** (5 of 6 sampled at 390×844; the one that passes is the "nothing before the reveal" test) |
| #136 browser spec `qrt2-verdict-clarity` after this change | 19 / 19 pass |
| `e2e/pm2` (Practice one-screen, its own fixture backend) | 12 passed across 360×640, 390×844, 430×932, 844×390 and 1280×800 (its measures: no overflow, tablets and the reveal box do not move on reveal, no clipped tablet text) |
| Affected unit suites (three chunks: `src/features` + `src/lib/*`, `src/components/*`, `src/pages`) head vs base | failure sets identical except `LobbyPreviewPage.premiumAnalytics.test.tsx`, which is **flaky on the base too** (1, 2 and 3 failures on three consecutive base runs; 1, 3, 1 on head) |
| `tsc --noEmit` | the same 2 pre-existing errors (`OnboardingProfile.tsx`, `identity/connections.ts`), none in changed files |
| eslint on changed files | 0 errors (react-refresh warnings only) |
| Merge with QRT1 #134 | `git merge-tree` is clean, although both PRs touch `masterySliceModule.tsx` (different hunks); rerun `masterySliceModule.qrt1.test.tsx` and `masterySliceModule.qrt2.test.tsx` after #134 lands |

Before/after pairs: [`qrt2-evidence-adopt/`](qrt2-evidence-adopt/) (11 side-by-sides: Mastery prose right/wrong/timeout, desktop wrong and the atomic headline; Pro Play at 360, 390 and 1280; Practice text and picture tiles).

Local-run note: AGENTS.md prefers GitHub Actions for browser matrices. These ran headless on the bundled Chromium (no installed Edge/Chrome, nothing headed). `playwright.arena.config.ts` is not wired to CI, and `e2e/pm2`'s config starts Vite with a Unix-style path that fails on Windows (start the server yourself with `VITE_E2E_AUTH=1 … vite --mode e2e --port 8126`).

## Left undone

* **Mastery atomic-recall and comparison tablets** have no "Correct answer" / "Your pick" tabs: their tablets are Mastery components (`MasteryBooleanInput`, the comparison cards), shared with the standalone player, with their own outline tones (`CHOICE_TONE_CLASS`). Adopting them is a separate change to those components.
* **Journey** (waits for #134), **Meta Reflex, Order Forge, Reconstruct/Scrub/Match Grid/Assembly** (vocabulary only), legacy `/quiz/mastery` tablets, HUD plate, Daily retry wiring, live-region audit, and the timing pair: unchanged from the #136 table.
* The compact tab label by container width rather than layout (finding 4).

## Deployment dependencies

* **Stacked on #136**: merge #136 first (this PR needs `verdictTabs`, `VERDICT_HEADLINE` and the `[data-verdict-tabs]` skin). The PR's base is #136's branch; GitHub retargets it to `main` when #136 merges.
* Frontend only: no backend, migration, flag or data. Owner publishes via Lovable after merge. Rollback is a revert.
* The Mastery `timedOut` flag is read from a field the backend already sends (`own_timed_out_challenges`); an older backend that omits it just yields "Incorrect".

---

# ORIGINAL SCOPE (2026-10-22, still the plan for later phases)

## Objective / owner requirements

An answer click must acknowledge selection instantly, then show a server-authoritative, unmistakable **CORRECT / INCORRECT / TIME'S UP** result with (when disclosure is allowed) the correct answer, the player's selected wrong answer, and any short explanation/evidence. Give the player real time to read it; do not steal next-card answer time to fake a longer reveal.

QRT1 already handles **Mastery Journey** exact reveal windows (ordinary 2250 ms; raw calculation 5000 ms; mitigated damage / haste 7000 ms) and submit-ack presentation. Companion **draft** PRs: frontend [#134](https://github.com/mitcherrman/mogsy/pull/134), backend [#97](https://github.com/mitcherrman/League_Combat_Simulator/pull/97). They are **not merged** as of this handoff; don't duplicate, cherry-pick or conflict with their files without explicitly coordinating. QRT1's Equation Unfold fold point stays **3.2 seconds**.

## Product decisions

- **Preserve outcome-dependent server reveal holds in puzzle modes**: Reconstruct / Scrub exact 3400 ms, wrong or timeout 4000 ms; Match Grid all exact 3000 ms vs wrong 4500 ms; Assembly exact 3600 ms vs wrong 4400 ms. These corrections need longer reading time after an error. Preserve frozen sessions and the server's current pacing.
- For ordinary quiz rounds, current FE `src/lib/ranked-core/pacing.ts` still uses 1500 ms nominal, 2600 ms when level-up/evidence, and a 900 ms late-poll minimum. This is **not** the requested sitewide result. Proposed product baseline for review: **2250 ms ordinary, >=3000 ms with real evidence**, but verify server scheduling/clock compensation in backend before changing. Do NOT extend a frontend hold past next answerable time.
- For Meta Reflex, current backend is 1500 ms; Order Forge has two pacing layers. Do not raise frontend-only timers. Audit actual state deadlines and make coordinated backend adjustments where appropriate.
- Practice already pauses auto-advance on focus/hover/hidden and uses 1500ms simple or explanation-length reading time. Preserve reader-controlled pauses; audit whether simple Practice also needs the proposed ordinary-question baseline.
- Pro Play / Worlds quizzes have manual Next; don't replace it with forced auto-advance.
- Daily unresolved retry: **never disclose correct answers before the backend says `disclosureAllowed`**. Distinguish a scored miss from a fully resolved question.
- Do not invent a verdict, correct index, explanation or state client-side. Treat timeout separately from incorrect. Correctness and selected/correct answer come from canonical server payloads.
- Never make a fixed overlay block answer buttons, introduce mobile scroll, shift layout during reveal, or cause the next question timer to count invisibly.

## Current code anchors (verified by GitHub source inspection)

- `src/lib/question-feedback/model.ts`: existing `ResolvedFeedback`, `FeedbackVerdict`, `VERDICT_HEADLINE`, `sealed`. Reuse rather than build an independent verdict model.
- `src/components/ranked-arena/QuestionResultOverlay.tsx`: current viewer and delayed opponent stamps, accessibility `sr-only` status, reduced-motion support.
- `src/components/ranked-arena/RoundResultBeat.tsx`: current fixed-height top result, viewer `text-sm` / `lg:text-base`; outcome/tone already `font-black`; don't enlarge blindly on 360px phones.
- `src/components/ranked-arena/RevealBanner.tsx`: existing `resultHeadline` and `text-lg` verdict, but not necessarily the active Ranked screen.
- `src/components/quiz/QuizAnswerOptions.tsx`: `data-choice-state` (idle/selected/correct/incorrect-selected), `markSelectionOnReveal`, per-option art; already marks selected and correct without leaking answers before reveal.
- `src/lib/ranked-core/pacing.ts`: `anchoredRevealHoldMs`, `serverPacedHoldMs`, `finalServerPacedHoldMs`; holds and server title/next-card deadlines matter.
- QRT1 handoff: `docs/handoffs/QUESTION_REVEAL_UX_HANDOFF.md` in `reveal/qrt1-frontend` or [PR #134](https://github.com/mitcherrman/mogsy/pull/134), including the complete inventory of result renderers, timings and recommended shared-component approach.

## Suggested implementation slices

1. **Audit and test first**: map active result surfaces (do not modify inactive banners), verdict source, selected/correct highlights, disclosure and timing contract per mode. Reproduce too-small verdict/too-fast reveal with deterministic tests and mobile captures.
2. **Shared presentation foundation**: unify `FeedbackVerdict` -> labels, icons, tones and selected-vs-correct treatment. Make one small `VerdictLine`-based heading or adapter; avoid one monolithic mega-renderer. Introduce clear accessible text even in color-blind and reduced-motion cases; preserve no-double-announcement intent.
3. **Incremental mode adoption**: Ranked/Daily quiz questions first, then Practice, standalone/legacy Mastery, Meta Reflex, puzzle modes, Pro Play/Worlds. Where layouts genuinely differ, share semantics/tokens instead of forcing a single layout.
4. **Clock-safe reading time**: modify FE/BE timing only in coherent pairs where authoritative scheduling requires it. Include retries, incorrect, timeout, final card, reload/resume, late arrival, server failures and locked-next-question visibility. Do not regress QRT1's submit-ack or frozen windows.
5. **Acceptance**: 360x640, 390x844, 430x932, desktop; normal long-copy, image choices, selected wrong vs correct, correct, timeout, retry-limited Daily, 1.5s-poll delays, reduced-motion, screen reader; no page scroll or layout shift; full allotted visible reveal when network allows; no new failures versus the same clean baseline.

## Execution and release gates

- Use a fresh isolated worktree; both other local repo checkouts were dirty. Work on this branch or update it against current main after review; avoid changing `main` directly.
- Before finalizing, reconcile QRT1 PR #134 / #97 and rebase/reconcile any overlapping changes; don't merge pending timing changes implicitly.
- Maintain this handoff with decisions, files, tests, screenshots/metrics, PR links, blockers and next task.
- No Docker, Railway access assumption, production data writes, merge, publish or deployment. Submit scoped draft PR(s) with local/baseline differential evidence and explicit ordered rollout.
- Quality first; explain any hard-to-prove live timing limitations rather than calling them fixed.

## Current dependencies and blockers

As checked 2026-10-22 local, QRT1 frontend #134 was 4 commits behind main and backend #97 26 commits behind master. The backend showed six GitHub Actions failures; logs were not retrievable through the connector, so root cause is **unknown**. Both PRs are mergeable and draft. Address these release gates in parallel, without blocking UI work that can be safely developed in isolation.

**Next task (updated 2026-10-23):** Phase 2A is done (see the report at the top). Next, in separate PRs: (1) done in the stacked adoption PR (Mastery slice prose path, Pro Play/Worlds, Practice); still open: the Mastery atomic/comparison tablets; (2) after QRT1 #134 merges, Journey; (3) the Phase 2B timing pair plus faster resolution discovery; (4) a real screen-reader pass over the six live regions.
