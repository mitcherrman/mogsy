# MISC Wave 3A — compact Daily result, rewards and completion on small screens (F05)

Issue: [mitcherrman/mogsy#65](https://github.com/mitcherrman/mogsy/issues/65) · branch `fix/misc-w3a-daily-mobile` · base `origin/main` = `67118b2b` ("feat(quiz): authoritative countdown sound, urgency pulse and timeout cues (F10–F12)", fetched 2026-10-17; F04 #62 and F10–F12 #63 are both in it). Code commit `852b53a9`; the PR head is the docs commit that follows it. Frontend only. Nothing merged, deployed or written to any backend. Worktree `C:\Users\mlmit\mogzy-wt\misc-w3a-daily-mobile` (a detached checkout of `67118b2b` at `mogzy-wt/misc-w3a-base` served the untouched comparisons).

## 1. Objective

Cut the vertical travel a player spends on a phone getting from "my score" to "Continue / Done" across the Daily Standard result, the bonus-stage results, the earned-discovery panel and the final completion, **without hiding, clipping or truncating any fact or control**, and without changing score/discovery timing, reduce-motion, focus order, error/retry, stage navigation or the settlement frame (DRS1: pending and settled are one frame).

## 2. Decisions

1. **Density only.** Every change is padding, gaps, type size, tile columns or the size of a decorative figure. No DOM is added, removed or reordered, no `hidden`/`sr-only`/clamp/`overflow-hidden` is introduced (a unit test forbids them), and no timer, sound or flow code is touched.
2. **Tuned from outside the shared components.** `ResultHero`, `ResultStatGrid`, `ResultActions` and `DiscoveryReveal` are shared with Ranked and are outside this lane's ownership, so they are not edited. The Daily result frames key Tailwind arbitrary variants on their stable `data-testid`s (`max-sm:[&_[data-testid=result-hero]]:py-4`). Specificity beats the components' own single-class utilities; no `!important` except one `!gap-2` on the completion beat (`.ranked-beat__inner` sets its own gap in `index.css`, which is not ours).
3. **Two tiers.** `max-sm:` (< 640px, every portrait phone) and `[@media(max-height:540px)]:` (a landscape phone). Anything ≥ 640px wide and taller than 540px gets none of it: desktop is unchanged.
4. **Every class is a literal in `dailyResultDensity.ts`.** Tailwind finds classes by scanning text; a template-built `${tier}:gap-2` is silently never generated (this bit the first pass: the landscape tier did nothing until the strings were literals). `dailyResultDensity.test.tsx` runs the real Tailwind over that file and fails if any class produces no CSS.
5. **What changed, by block (phone):**

   | Block | Before | After |
   | --- | --- | --- |
   | Frame gap | 16px | 12px (8px landscape) |
   | Hero | py-6, space-y-3, Mogzy 80px, headline 3xl, score 5xl → 320–356px | py-4, space-y-2, Mogzy 56px, headline 2xl, score 4xl → 248–280px |
   | Snapshot | 2 columns; floors 10rem (Standard/Main) / 15rem (TT, Survival) / 8.75rem (Review) | Main, Review, TT, Survival → 3 columns (tile padding/type sized for ~90px tiles); the 4-tile kinds stay 2 × 2 with tighter tiles. Floors re-measured: Main 5.5rem, Review 4.25rem, TT/Survival 9rem, Standard/Weak/Order Forge 10rem. **`sm` floors unchanged** |
   | Mode tag | `text-sm` chip | `text-xs` chip (the chrome row above also names the stage; the chip is kept) |
   | Up-next ladder | label above each section's chips | label inline with its chips when they fit |
   | Optional box (Main) | px-4 py-3 | px-3 py-2.5, tighter gaps |
   | Discovery panel | py-4 / space-y-3, headline lg, Mogzy 56px | py-3 / space-y-2, headline base, Mogzy 40px. Cards, growth line and CTA untouched |
   | Completion beat | py-10 + `min-height: min(70vh, 38rem)` | py-5 (sm: py-10) and the 70vh floor only from `sm`; tighter recap rows |
6. **Touch targets improved, not just kept.** "Try again" (26px) and the completion's two links (20px) are now 44px (`min-h-[44px]`), paid for by the compaction above. The stage/main `ResultActions` buttons were already 44px.
7. **Focus clearance.** A compact page can leave an already-visible action under the floating Community trigger (`focus()` does not scroll an element that is already visible). `scroll-mb-20` on the discovery CTA and the result buttons (phones only) makes focus bring them clear of the trigger's bottom-left band. The trigger itself is global (#64) and is not touched.
8. **Rejected:** a sticky bottom action bar (would collide with the fixed Community trigger and the Mogzy dock tabs — the #64 global overlay problem); removing the mode tag or the Optional box on phones (they are facts); a landscape two-column layout (reorders DOM); editing `ResultHero`/`ResultStatGrid`/`DiscoveryReveal` (not this lane's files).
9. **Closed discovery slot.** It still adds zero height until earned: its negative margin now cancels the frame's gap in every tier (`-mt-4 / max-sm:-mt-3 / short:-mt-2`, pinned by a unit test), so the earned panel still opens without a jump.

## 3. Files

Changed (this lane's files): `src/pages/quiz-daily-challenge/run/DailyCompletion.tsx`, `DailyMainResult.tsx`, `DailyStageResult.tsx`, `DailyDiscoveries.tsx` (styling only; hold times, read gating, cue and CTA untouched).
New: `run/dailyResultDensity.ts` (all density classes, one place), `run/dailyResultDensity.test.tsx`, `e2e/misc-w3a/{harness.html,harness.tsx,measure.cjs,table.cjs,daily-result-compact.spec.ts,budgets.json}`, `playwright.daily-result-compact.config.ts`, this file and `docs/handoffs/misc-w3a-daily-mobile/{baseline.json,after.json,shots/}`.
**Not touched:** `src/index.css`, `src/components/quiz/play-scroll/**`, `src/pages/quiz-ranked/**`, the shared `game-results`/`ranked-arena` components, SFX/timer code, the Friends trigger, `DailyRunBeats.tsx` (see §6).

## 4. Baseline and after (measured in Microsoft Edge)

Harness: the REAL `DailyMainResult` / `DailyStageResult` / `DailyCompletion` / `OptionalEntryBeat` in the real `ArenaShell` + `DailyStageChrome`, wrapped like `Layout` + `DailyRunPage` (html `dark theme-lol`, header-band reservation, `main` column, `flex flex-1 flex-col justify-center`). The discoveries read is answered from the real backend projection fixture (`dailyMatchDiscoveries.backend.json`, 3 cards). 18 states × 7 viewports = 126 captures each side, from the same harness on the untouched base (`baseline.json`) and on this branch (`after.json`), recording `scrollHeight`, region rects, primary-action position, control sizes, clipping and layout shifts (`measure.cjs`). The baseline was captured before any source edit.

Each cell is `document height / viewport height (+vertical travel)`, with `✓` when the primary action is inside the first viewport; `before→after`. In all 252 captures: zero page errors, no clipped text (the one box wider than itself is the discovery panel's absolutely-positioned decorative sheen, pre-existing), and horizontal overflow is the pre-existing 4px glow bleed on both sides.

| state | 320x568 | 360x640 | 375x667 | 390x844 | 1280x800 | 667x375-land | 844x390-land |
|---|---|---|---|---|---|---|---|
| main-pending | 1001/568 (+433)→850/568 (+282) | 1001/640 (+361)→790/640 (+150) | 1001/667 (+334)→790/667 (+123) | 1001/844 (+157)→844/844 (+0) ✓ | 800/800 (+0) ✓→800/800 (+0) ✓ | 818/375 (+443)→660/375 (+285) | 818/390 (+428)→660/390 (+270) |
| main-settled-cards | 1503/568 (+935)→1304/568 (+736) | 1463/640 (+823)→1217/640 (+577) | 1453/667 (+786)→1201/667 (+534) | 1420/844 (+576)→1184/844 (+340) | 1155/800 (+355)→1155/800 (+355) | 1235/375 (+860)→1069/375 (+694) | 1235/390 (+845)→1069/390 (+679) |
| main-settled-nocards | 1001/568 (+433)→850/568 (+282) | 1001/640 (+361)→790/640 (+150) | 1001/667 (+334)→790/667 (+123) | 1001/844 (+157)→844/844 (+0) ✓ | 800/800 (+0) ✓→800/800 (+0) ✓ | 818/375 (+443)→660/375 (+285) | 818/390 (+428)→660/390 (+270) |
| main-flip | 1001/568 (+433)→850/568 (+282) | 1001/640 (+361)→790/640 (+150) | 1001/667 (+334)→790/667 (+123) | 1001/844 (+157)→844/844 (+0) ✓ | 800/800 (+0) ✓→800/800 (+0) ✓ | 818/375 (+443)→660/375 (+285) | 818/390 (+428)→660/390 (+270) |
| main-error | 1067/568 (+499)→930/568 (+362) | 1067/640 (+427)→870/640 (+230) | 1067/667 (+400)→870/667 (+203) | 1067/844 (+223)→870/844 (+26) ✓ | 804/800 (+4)→822/800 (+22) | 884/375 (+509)→736/375 (+361) | 884/390 (+494)→736/390 (+346) |
| tt-pending | 1060/568 (+492)→845/568 (+277) | 1049/640 (+409)→834/640 (+194) | 1049/667 (+382)→834/667 (+167) | 1049/844 (+205)→844/844 (+0) ✓ | 834/800 (+34) ✓→834/800 (+34) ✓ | 914/375 (+539)→748/375 (+373) | 914/390 (+524)→748/390 (+358) |
| tt-settled | 1112/568 (+544)→897/568 (+329) | 1101/640 (+461)→886/640 (+246) | 1101/667 (+434)→886/667 (+219) | 1101/844 (+257)→886/844 (+42) ✓ | 834/800 (+34) ✓→834/800 (+34) ✓ | 914/375 (+539)→748/375 (+373) | 914/390 (+524)→748/390 (+358) |
| tt-settled-cards | 1613/568 (+1045)→1351/568 (+783) | 1563/640 (+923)→1313/640 (+673) | 1553/667 (+886)→1296/667 (+629) | 1519/844 (+675)→1279/844 (+435) | 1251/800 (+451)→1251/800 (+451) | 1331/375 (+956)→1157/375 (+782) | 1331/390 (+941)→1157/390 (+767) |
| tt-flip | 1112/568 (+544)→897/568 (+329) | 1101/640 (+461)→886/640 (+246) | 1101/667 (+434)→886/667 (+219) | 1101/844 (+257)→886/844 (+42) ✓ | 834/800 (+34) ✓→834/800 (+34) ✓ | 914/375 (+539)→748/375 (+373) | 914/390 (+524)→748/390 (+358) |
| surv-settled | 1148/568 (+580)→897/568 (+329) | 1101/640 (+461)→886/640 (+246) | 1101/667 (+434)→886/667 (+219) | 1101/844 (+257)→886/844 (+42) ✓ | 834/800 (+34) ✓→834/800 (+34) ✓ | 914/375 (+539)→748/375 (+373) | 914/390 (+524)→748/390 (+358) |
| weak-settled | 1005/568 (+437)→850/568 (+282) | 1005/640 (+365)→850/640 (+210) | 969/667 (+302)→850/667 (+183) | 969/844 (+125)→850/844 (+6) ✓ | 800/800 (+0) ✓→800/800 (+0) ✓ | 887/375 (+512)→721/375 (+346) | 834/390 (+444)→668/390 (+278) |
| review-settled | 985/568 (+417)→790/568 (+222) | 985/640 (+345)→758/640 (+118) | 985/667 (+318)→758/667 (+91) | 985/844 (+141)→844/844 (+0) ✓ | 800/800 (+0) ✓→800/800 (+0) ✓ | 867/375 (+492)→701/375 (+326) | 814/390 (+424)→648/390 (+258) |
| stage-error | 1178/568 (+610)→977/568 (+409) | 1167/640 (+527)→966/640 (+326) | 1167/667 (+500)→966/667 (+299) | 1167/844 (+323)→966/844 (+122) | 900/800 (+100)→918/800 (+118) | 980/375 (+605)→824/375 (+449) | 980/390 (+590)→824/390 (+434) |
| legacy-standard | 861/568 (+293)→729/568 (+161) | 861/640 (+221)→729/640 (+89) | 825/667 (+158)→729/667 (+62) | 844/844 (+0) ✓→844/844 (+0) ✓ | 800/800 (+0) ✓→800/800 (+0) ✓ | 763/375 (+388)→597/375 (+222) | 763/390 (+373)→597/390 (+207) |
| optional-entry | 641/568 (+73) ✓→641/568 (+73) ✓ | 641/640 (+1) ✓→641/640 (+1) ✓ | 667/667 (+0) ✓→667/667 (+0) ✓ | 844/844 (+0) ✓→844/844 (+0) ✓ | 800/800 (+0) ✓→800/800 (+0) ✓ | 577/375 (+202)→577/375 (+202) | 529/390 (+139)→529/390 (+139) |
| completion | 798/568 (+230)→730/568 (+162) | 799/640 (+159)→731/640 (+91) | 802/667 (+135)→734/667 (+67) | 844/844 (+0) ✓→844/844 (+0) ✓ | 800/800 (+0) ✓→800/800 (+0) ✓ | 782/375 (+407)→758/375 (+383) | 787/390 (+397)→763/390 (+373) |
| completion-perfect | 857/568 (+289)→788/568 (+220) | 859/640 (+219)→789/640 (+149) | 862/667 (+195)→792/667 (+125) | 864/844 (+20) ✓→844/844 (+0) ✓ | 800/800 (+0) ✓→800/800 (+0) ✓ | 826/375 (+451)→802/375 (+427) | 831/390 (+441)→807/390 (+417) |
| completion-legacy | 638/568 (+70)→584/568 (+16) ✓ | 641/640 (+1) ✓→640/640 (+0) ✓ | 667/667 (+0) ✓→667/667 (+0) ✓ | 844/844 (+0) ✓→844/844 (+0) ✓ | 800/800 (+0) ✓→800/800 (+0) ✓ | 643/375 (+268)→619/375 (+244) | 653/390 (+263)→629/390 (+239) |

Reading it:
- **Portrait phones:** the sum of vertical travel over the 9 comparable states × 4 phone sizes falls **42%** (19,311px → 11,165px). Every settled result without earned cards now fits a 390×844 phone with Continue in the first viewport (Main, Review, legacy Standard, the three completions). Time Trial / Survival / Weak Areas have Continue in view with ≤ 42px of scroll (the tail is the secondary buttons).
- **Hero** 320–356px → 248px (280px at 320px, where the eyebrow wraps). **Main snapshot** 160px → 86px. **TT/Survival snapshot slot** 240px → 144px.
- **Earned cards** are inherently tall (a ~400px panel): −236px at 390×844 and −246px at 360×640 on a Standard result, still one scroll. Primary-action page position at 390×844: Main 937 → 726 (no cards), 1356 → 1120 (cards); TT 985 → 770; Review 921 → 694.
- **Desktop 1280×800:** identical height in every state except the two error states (+18px: "Try again" is now a 44px target).
- **Landscape phones** (667×375, 844×390): about −160px on results; they still scroll because 375px cannot hold hero + snapshot + actions. Completion −24px.
- **Not owned, unchanged:** `optional-entry` is `OptionalEntryBeat` in `DailyRunBeats.tsx` (not this lane). Its numbers are identical before and after and are pinned in the budgets as a tripwire.
- **No jump on settle:** pending → settled on one mount moves neither the hero nor the primary action (0.0px at all 7 viewports for Main and Time Trial). Layout-shift totals are ≤ 0.007 (the existing reward-enter animations), down from 0.0155 at 320px.
- **Real page cross-check** (the F04 check driving the real `/quiz/daily-challenge` with the hosted `QuizRankedMatch` and an intercepted API): settled Standard / with-cards page height at 390×844 1001 / 1453 → 853 / 1201; at 360×640 1001 / 1486 → 790 / 1217; at 320×568 1030 / 1549 → 850 / 1346; at 1280×800 800 / 1155 → 800 / 1155. (That script uses `isMobile` contexts, where the ≤ 12px glow bleed widens the layout viewport to 853px at "390×844": the page fits exactly.)

Screenshots (before/after pairs, JPEG, half scale for phones): `docs/handoffs/misc-w3a-daily-mobile/shots/` — Main settled 390×844 fold, 360×640 and 375×667 full; Time Trial settled 360×640 and 320×568; Main with cards 390×844; stage error 360×640; Review 390×844; perfect completion 320×568 (fold and full); landscape 667×375; desktop 1280×800 (unchanged).

## 5. Tests

| Check | Result |
| --- | --- |
| `npx vitest run src/pages/quiz-daily-challenge/run/dailyResultDensity.test.tsx` (new) | 16/16. Every density token compiles through the real Tailwind from the file's own text (catches template-built and mistyped classes); no hiding/clipping class; the closed-slot margin equals the frame gap in every tier; every override is scoped to a phone or short viewport; per-kind phone floors, unchanged `sm` floors, one layout pending and settled; 3-column vs 2-column kinds; DOM/focus order; Continue/Done/More Challenges/Try again still fire; completion keeps its title, perfect line, per-stage numbers and both exits, has no inline `min-height`, and its links are 44px |
| Related suites: `src/pages/quiz-daily-challenge`, `DailyOnCanonicalArena.boundary`, `src/lib/daily-challenge`, `src/components/game-results`, `DiscoveryReveal*`, `useMatchDiscoveries` | **364 passed, 2 failed (366)** on this branch vs **348 passed, 2 failed (350)** on a clean `67118b2b` checkout. The **same two pre-existing failures**: `DailyOnCanonicalArena.boundary` › "names no manual progression control" and › "the parent run is the ONLY Daily runtime" (stale file list, unchanged since F04). Not touched, not weakened |
| `npx tsc -p tsconfig.app.json --noEmit` | only the two pre-existing errors (`OnboardingProfile.tsx`, `identity/connections.ts`) |
| `eslint` on the 6 changed/new source files | 0 errors; 3 pre-existing `react-refresh/only-export-components` warnings (`DailyDiscoveries.tsx` ×2, `DailyMainResult.tsx`) |
| `PW_CHANNEL=msedge npx playwright test -c playwright.daily-result-compact.config.ts` (new) | **128 passed.** Per state × 7 viewports: height budget (a ratchet = after + 8px), fit at 390×844, no clipped text, no sideways scroll beyond 12px, every action/link/Try again ≥ 44px, no hero/action movement on settle, earned cards open with Continue enabled and reachable at the bottom; plus reduced motion opens the cards with no hold (< 1.5s) |
| `node <vite-node> e2e/f04/daily-discoveries.check.ts` (real page, F04) | **34/34.** Cards 1.23 s after the settle (unchanged), 0.00px drift on none/401/403/404/network, no horizontal overflow, Continue enabled. It caught one real regression in my first pass (a focused discovery CTA left under the Community trigger once the page had become short) → fixed by decision 7 (focus now lands with 71px below the CTA at 390×844, 100% reachable) |
| Existing `e2e/nav1/daily-result-stability.spec.ts` (DRS1) | **Cannot run here**: Playwright's loader rejects the JSON fixture imports under Node 24 (`needs an import attribute of "type: json"`), identically on `67118b2b`. The same property (no hero/action movement on settle) is covered by the new spec and the F04 check |

Failed-before / pass-after: the new Playwright spec fails on the untouched components (4/4 sampled cases: tt-settled 1101 > 894, main-settled-nocards 1001 > 852, stage-error 1167 > 974, completion-perfect 864 > 852) and passes on the branch. The unit test's Tailwind-scanner check is new behaviour.

Re-run: start `npx vite --mode e2e --host 127.0.0.1 --port 8131` (cwd = the worktree), then `node e2e/misc-w3a/measure.cjs` (`W3A_OUT`, `W3A_SHOTS`, `W3A_ONLY`, `W3A_VP`, `W3A_REDUCED`) and `node e2e/misc-w3a/table.cjs before.json after.json`. Never edit `src/` while a sweep runs (HMR kills the page). Re-baseline `budgets.json` only deliberately.

## 6. Risks, gaps and notes for the reviewer

- **Not verified published.** F04 (#62) and F10–F12 (#63) were not confirmed published in Lovable. This PR preserves their timing and layering (the F04 check re-proves cards at 1.23 s) but was not tested on Lovable.
- **Harness vs production.** The harness reproduces the shell and wrappers but not the global overlays (HUD, Community trigger, Mogzy dock). Those are #64's area. The F04 check on the real page does include the Community trigger, and its overlap/focus scenarios pass (the pre-existing left-edge overlap at one scroll class on 320px is unchanged).
- **Landscape phones still scroll** (+270–285px on Main). The hero cannot be made short enough without reordering content; a two-column landscape layout is the follow-up, if wanted.
- **`OptionalEntryBeat` / `DailyIntroBeat`** (`DailyRunBeats.tsx`) share the same `py-10` + `70vh` beat frame as `DailyCompletion`. They are outside this lane's listed files, so unchanged; the same two-line fix would give them the same win (optional-entry is already within 73px at 320×568).
- **4-tile kinds** (legacy Standard, Weak Areas, Order Forge) keep two columns, so their phone saving comes from the hero and gaps only (~120px).
- **Pending → settled** still adds the secondary buttons ("More Challenges", "Done for now") below Continue on a bonus stage when it settles. This is pre-existing and below the action, so nothing above moves.
- **`!gap-2`** on the completion beat is the only `!important`; `.ranked-beat__inner`'s gap lives in `index.css`.
- **Environment:** Edge via Playwright; no Docker, no production write.

## 7. Next task

1. Review the draft PR; if accepted, the owner publishes in Lovable (frontend-only) and spot-checks a real phone.
2. Optional follow-ups, each its own small PR: the same beat-frame compaction for `OptionalEntryBeat`/`DailyIntroBeat` (`DailyRunBeats.tsx`); a landscape-specific result layout; promote the density constants into `ResultHero`/`ResultStatGrid`/`DiscoveryReveal` as a real `compact` prop if another surface wants them (shared components → coordinate with their owner).
3. #64 (global overlay / Friends trigger) remains separate.
