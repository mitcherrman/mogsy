# PT5.1 — Perfect Timing: between-stage transitions and readable typography

**Status 2026-10-16: implemented and verified on one branch, pushed, not merged, not deployed.** Frontend only (`mitcherrman/mogsy`). Branch `perfect-timing/pt51-transitions-typography`, from `origin/main` `c5521d3e`. No backend, contract, scoring, cooldown, haste, flag or auth change.

Read first: [PT5_HANDOFF.md](PT5_HANDOFF.md) (the slice), [PT44_HANDOFF.md](PT44_HANDOFF.md) (the fixed screen: zero scrolling).

## 1. What the owner asked

1. Changes between slice stages were too subtle: a player must *see* "my ability ranked up / I equipped an item, so my timing must change".
2. The ornate (Cinzel) lettering was hard to read and too small: bold, modern, larger.

## 2. What changed

### 2.1 A transition state of its own (Mastery Slice only)

`MasterySliceRun` gains `Stage = { kind: "transition"; to }`. Leaving a revealed (or voided / failed) stage goes **reveal → transition → armed stage**, never straight into the next round.

| Transition | Headline | Shows | Cooldown line |
| --- | --- | --- | --- |
| Stage 1 → 2 | **RANK UP** (gold, rises) | ability icon + rank medal, `Rank 1 → Rank 3`, ability-style rank pips lighting one by one | "Cooldown changed" |
| Stage 2 → 3 | **ITEM EQUIPPED** (blue-and-gold, snaps in) | ability icon + equipment slot, the item icon flying into the slot, item name, `+10 Ability Haste`, "Still rank 3 / 5" | "Cooldown reduced" |

Both end on a gold **ADJUST YOUR TIMING** ribbon and a Continue button. Component: `components/perfect-timing/SliceTransition.tsx` (copy helpers, `hasTransition`, ready delays in `presentation.ts`).

* **Everything comes from the server-authorized deal**: champion, ability, icon, rank, rank count, item name/id/haste/icon. A unit test deals "Trinity Force +20/+35" and the transition prints it; nothing about Sheen or +10 is hardcoded.
* **No cooldown, target or duration is shown** (unit + e2e assert no `\d s/ms` text and no truth in the DOM). "Reduced" is printed only for an equipped stage with positive haste (`cooldownChangeText`); the deal reader already refuses an item without haste, so it is always true there. A rank step says "changed": the certified progression does not promise a direction.
* **Nothing is armed and no clock runs** in the transition: no seal exists. `currentRoundId` is cleared; the round is armed only by Continue.
* **Finite motion**: ~1 s entrance, opacity/transform only (no layout shift). The three effect layers (burst, light sweep, slot ring) use `animation-fill-mode: backwards` so a held end frame cannot enlarge the card's scroll area. Nothing loops. Reduced motion (OS or the app's switch) is the finished frame from the first paint (`data-animate="false"`) and is ready after 250 ms.
* **Voided / expired**: a voided stage still gets the transition (the rank still goes up). If the slice expired while the player read, Continue re-deals the *same ability* from that stage (the PT5 `beginStage` expiry check) — same behavior as before, one state later. A lock 404 → resume re-arms the same stage directly (the transition was already seen).

### 2.2 Input rules (reused, not duplicated)

* `useSettledAdvance` (new, `lib/perfect-timing/`) is the **one** document key listener of the two settled screens. `PerfectTimingReveal` now uses it (behavior unchanged: focus the button after 1.7 s / 0.32 s reduced, Space/Enter once, never on a repeat, never when a control owns the key); the transition uses it with a 900 ms / 250 ms settle. Before it settles nothing advances: the double-tap that left the reveal cannot also leave the transition.
* The timer's own listener is still subscribed only while a round is armed/running, so the two can never both be live.
* Continue arms the stage and sets the existing 250 ms **`keyGuard`** *and* a new engine option **`pointerGuard`** (off by default, only the slice sets it), because on a phone Continue sits where the seal will be: a second tap cannot cast the stage it just armed. Random Run is untouched.
* `stageRef` makes every exit from a revealed/voided/failed stage (and from the transition) once-only and non-stale: a double press or late click moves the run at most one state, and a `lock` can never be sent for the wrong round.
* Focus: Continue is focused when settled; after Continue the seal takes focus (`autoFocusSeal` prop on `PerfectTimingArena`). A `role="status"` live region announces the change ("Item equipped. Ezreal Q, Mystic Shot. Sheen +10 Ability Haste. Cooldown reduced. Adjust your timing.").

### 2.3 In-round stage clarity

The hero keeps the change after the transition is gone: a gold **▲ RANK UP** badge with a big `RANK 3 / 5 from 1` on the rank-up stage; the item icon chip `SHEEN +10 ABILITY HASTE` on the equipped stage (name over haste on narrow phones). The three-pill track is larger. PT4.4's full-screen presentation and the splash art are unchanged.

### 2.4 Typography

* **Font decision.** The mode's Cinzel display face is replaced by **Inter**, already loaded app-wide (`index.html`), with the system sans stack behind it — no new dependency or request. Numbers are Inter with tabular figures (the Space-Mono-style digits are gone from plates, rail and results).
* **Weights.** The app loads Inter **400–700 only**, so 800/900 would render as 700 anyway. All heavy text uses the token `--pt-heavy` (= 700, documented in the stylesheet). **Owner call:** loading Inter 800/900 app-wide (a one-line `index.html` change, but it would also make other pages' `font-extrabold` text heavier) would give a blacker headline; raise the token then and re-run the fit matrix (Black is wider).
* **Hierarchy.** Champion 26–52 px (was 22–42), ability 16–26 (was 13–19), rank 14–20 and no longer muted all-caps with 0.18em tracking, status 14–17, seal word/sub, hint and buttons 13–17 (was 10.5–13), reveal tier unchanged in size but untracked, error figure 26–44, YOU / TRUE COOLDOWN plates 21–32 with 12–14 px labels, rail labels 12–13, comparison line 14–17, provenance 12–14, results score 50–128, stats 19–28, ladder titles 14–17 / sub 12–14. Letter-spacing on caps cut from 0.14–0.3 em to ≤ 0.08 em.
* Also applied to the Random Run and the public PGM2 Perfect Timing page (they share the components); the transition belongs only to Mastery Slice.

### 2.5 Fit (nothing scrolls)

Bigger type needed re-budgeting, all at a cost to gaps/icons, not to words: taller narrow hero for slices (and a smaller icon), name-over-haste chip, a short-landscape reveal/results compaction, slice ladder rows that wrap to two lines (and drop the mini bar on narrow screens), "figure + unit" never split (`.pt-nw`), the transition card stacks in portrait ≤ 900 px. `assertFits` now also checks the transition card does not clip its own content (it has `overflow: hidden`).

## 3. Files

New: `components/perfect-timing/SliceTransition.tsx` (+`.test.tsx`), `lib/perfect-timing/useSettledAdvance.ts`, this file.
Edited: `pages/admin/perfect-timing/MasterySliceRun.tsx` (+test), `components/perfect-timing/{perfectTiming.css, presentation.ts (+test), PerfectTimingStage.tsx, PerfectTimingReveal.tsx, PerfectTimingResults.tsx, RunLadder.tsx, PerfectTimingArena.tsx}`, `lib/perfect-timing/useTimingEngine.ts` (+`pointerGuard`; keyGuard test extended), `e2e/perfect-timing-owner.spec.ts`.
Untouched: backend, `api.ts`, contracts, `viewModel.ts`, `timingEngine.ts`, scoring, `index.html`, shared theme.

## 4. Verification (2026-10-16)

| Check | Branch | Clean base `c5521d3e` |
| --- | --- | --- |
| Vitest PT set (`src/lib/perfect-timing`, `src/components/perfect-timing`, `src/pages/admin/perfect-timing`, `src/pages/admin/playtests`) | **310 / 310** | 284 / 284 (+26: transition component 12, run 10, presentation 2, pointerGuard 2) |
| Vitest PT + public game + public-modes (`+src/pages/quiz-more-challenges`, `src/lib/public-modes`) | 372 / 372 | — |
| Vitest wider set (`src/pages/admin`, `src/components/admin`, `src/lib/{playtests,admin,ranked-arena}`, `src/test/guards`, `src/App*`) | 10 failed / 1,159 passed | 10 failed / 1,149 passed — **identical 10 failing tests** (App.routeGuards, App.routing-contract ×2, admin-registry.routes ×2, AdminPlatformPolicies, AdminQuizReview.proPlay, noStaticLeagueFacts, users1AudienceIdentity ×2) |
| `tsc -p tsconfig.app.json` | the same 2 errors (`OnboardingProfile.tsx`, `identity/connections.ts`) | same 2 |
| ESLint `src/components/perfect-timing src/pages/admin/perfect-timing src/lib/perfect-timing e2e/perfect-timing-owner.spec.ts` | 0 problems | — |
| Playwright `e2e/perfect-timing-owner.spec.ts` (`playwright.arena.config.ts`, Vite :8123, stand-ins from the captures) | **61 / 61** | 17 / 17 PT5 subset (55 in PT5's own run) |

Playwright (all pass): the PT4.4 Random Run and fit matrix unchanged; the PT5 full slice by keyboard (1440×900) and touch (390×844) now walk **both transitions** (kind, title, icons, Rank 1→3 / Sheen +10, effect line, no duration, no truth, waits to be ready, Continue → armed); **every state fits at all 14 sizes** (1920×1080 … 320×568, 844×390, 667×375): mode pick, dealing, each stage armed/running/revealed, **each transition settled**, results, resume, voided — document/screen/main/stage/card overflow ≤ 1 px, no test-id'd element outside the viewport or clipped by the card, `<html>`/`<body>` `overflow: hidden`, keys and wheel scroll nothing. New PT5.1 specs (6): early Space/Enter cannot skip; a held key and a double press move one state; the key that continued cannot cast (re-pressed inside the guard it stays armed, after it casts); no looping animation ever and the entrance has finished inside 2.2 s; nothing animates in the transition while a stage is timed; reduced motion (`emulateMedia`) = no animation, ready < 1.5 s; a voided stage still shows the transition; a slice that lost its server state re-deals the same ability; touch: a tap before it is readable does nothing, and a quick second tap cannot cast.

Jsdom covers the rest: Rank up/Equipped copy and pips, deal-driven item name/haste/icon (Trinity Force +20/+35), no duration text, inert-until-ready (aria-disabled), repeat/field/double-click once-only, keyboard-generated click counts as a key, listener removed on unmount, focus on Continue then seal, expiry at Continue → resume from stage 2, live-region text, reduced motion, `pointerGuard`, `cooldownChangeText` (reduced only with positive haste).

Evidence (outside the repo): `C:/Users/mlmit/mogzy-wt/pt51-evidence/` — `before/` (baseline run of the same specs on `c5521d3e`), `after/` (final run; transitions at every size are `fit-WxH-slice-transition-{1,2}.png`, plus `*-slice-transition-{1,2}.png` at 1440×900 / 390×844), `compare/` (13 side-by-side before/after composites: desktop, mobile, landscape, 320×568).

## 5. Risks / not done

* **Real devices** (iOS Safari, Android Chrome) not run, as in PT4.4/PT5. Headless Chromium only.
* **Not run against a live backend in a browser**: stand-ins answering from the backend capture, as in PT5. The first owner smoke after deploy is the integration proof.
* **Inter 800/900 is not available** (see 2.4); headlines are Inter Bold.
* The ~1 s entrance is judged from stills and timing assertions, not from a recording; a video capture for the owner is the natural next review.
* A tap on Continue within 250 ms after it arms is ignored by the seal (`pointerGuard`); a deliberate fast tap is not realistic inside that window.
* `PerfectTimingPage` is shared with the public PGM2 Perfect Timing game: its text is larger too (covered by its tests and the Random Run e2e).

## 6. Release (owner-only)

Frontend publish only; no backend dependency beyond PT5's. Merge `perfect-timing/pt51-transitions-typography` → `main`, Lovable **Publish**, then play one Mastery Slice at `/admin/playtests/perfect-timing` and one Random Run. Rollback: revert/publish the previous frontend (PT5 behavior returns exactly).
