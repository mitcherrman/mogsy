# Quiz Hub main screen — fit the phone (Daily + PLAY seal)

Branch `fix/quiz-hub-main-mobile-fit` (from `main`), PR [#85](https://github.com/mitcherrman/mogsy/pull/85) (draft).
Frontend only. No gameplay, routing, backend, or account change. Not merged, not deployed.
Status: **conflict-free on `main` `6334913f`** (PR #68 squash included) and green in cloud CI — see *Final results*.

This is the **main `/quiz` screen** (the centre parchment: Daily / Role / Ranked tabs, *Today's
Challenge*, Mogzy, the record, the red PLAY seal). It is **not** the Play popup that PR #68 fixes.

## Root cause

Below `lg` the three hub sheets stack, and the centre sheet is exactly as tall as the **Ranked**
composition whichever tab is showing (`CentreModePane`: Ranked is the in-flow "sizer", Daily and Role are
laid into its box). Ranked is a carousel + seal + two queue records, so the sheet is ~760–950 px tall on a
phone. Its frame adds more: `.lc-scroll` pads 17 % / 19 % / 18.5 % **of its width**, so a 30 rem column
spends ~170 px of a landscape phone's ~250 px on padding alone. The Daily pane was laid into that box
and its PLAY seal landed 130–600 px under the fold, with the page needing a scroll to reach it.

## What changed

| File | Change |
|---|---|
| `src/index.css` | One new block, *QUIZ HUB — THE MAIN SCREEN FITS THE PHONE* (before *The unfurl*). Everything in it is inside `@media (max-width: 1023px)` or a narrow-sheet `@container`, except two custom properties. |
| `src/components/quiz/centre-stage/DailyModePanel.tsx` | Class hooks only (`lc-daily-panel`, `__head/__title/__status/__stats/__cta/__caption/__results`). No behaviour or copy change. |
| `e2e/quiz-hub-main-fit.spec.ts`, `playwright.quiz-hub-fit.config.ts`, `.github/workflows/quiz-hub-main-fit.yml` | Real-browser geometry acceptance, run in GitHub Actions. |
| `src/components/quiz/centre-stage/hubFit.styles.test.tsx` | Stylesheet contract (scope) + the Daily pane's hook classes. |

**Portrait (≤ 1023 px wide).** While Daily is the mode on the sheet, the sheet gets
`max-height: max(26rem, 100svh − (--app-header-h + 0.75rem) − (0.5rem + env(safe-area-inset-bottom)))`
(`vh` fallback first). The sheet is a flex column, so the stage — its only flexible child — gives up the
difference; the Daily pane fills the stage and Mogzy is the one region that flexes. Ranked's hidden sizer
is left in flow, so a viewport with room for the whole Ranked sheet gets *exactly* the old sheet (a cap,
never a target). The seal steps 8 → 6.5 rem (≤ 700 px tall) → 6 rem (≤ 600 px); still ≥ 96 px.
`svh` (not `dvh`) so the sheet does not re-lay-out as a mobile address bar collapses and returns.

**Narrow sheet record.** On a 320 px phone the three equal stat cells were 59 px each and the Today
value truncated to **"Co…"** (`Complete`) and clipped `In progress` — the completion state itself.
Below 17 rem of writing width the cells size to content (`max-content`, tighter label tracking) and still sit
inside the writing area (the pane clips overflow, so nothing borrows margin). Values keep 16 px on 375 / 390 px
phones and step to 14 px bold only below 13 rem of writing width (320 / 360 px phones).

**Landscape phones (≤ 1023 wide, landscape, ≤ 600 tall), Daily only.** The head and foot rolls keep their
artwork (same slices of the 1086×1448 image, ×`1448/145` and ×`1448/165`) but are drawn 36 px / 40 px
tall; padding becomes `cap + 0.25rem` top/bottom and 15.5 % sides (clear of the drawn paper edge at 13.1 %);
the column opens to 40 rem; the Daily pane re-composes as a grid — title across the top, Mogzy left,
status + record centre, seal in its own 6 rem column on the right. At ≤ 340 px tall the seal is 5 rem.
The "Complete" pill is hidden there (it was wider than Mogzy's cell; Today = Complete and the status
line say it).

**Not changed on purpose.** Role and Ranked keep their natural height and layout (they are fill/sizer panes
of the same box; capping them would force inner scrolling). The tab row (29.75 px tall, WCAG 2.2 AA ≥ 24 px)
is untouched. Desktop (≥ 1024 px) is untouched: measured identical (below).

## Interpretation of "no page scrolling"

The hub page keeps its lower sections (Quick Study, More Challenges, history…), so the *document* still
scrolls below the first screen as it always has. What is guaranteed and asserted: at `scrollY = 0` the
whole centre sheet — tabs, title, status, record, Mogzy and PLAY — is inside the viewport, PLAY needs no
scroll, there is no horizontal scroll, and the Daily pane has no inner scrollbar.

## Before / after (cloud headless Chromium, mobile emulation, account, Daily "available")

"Before" is `main` at the PR base (already containing the Ranked-pause release #90), measured by the same
spec with assertions disabled (`HUBFIT_MEASURE_ONLY=1`). Pixel values are CSS px, viewport coordinates.

| Viewport | Before: sheet bottom / PLAY bottom / PLAY visible | After: sheet bottom / PLAY bottom / PLAY visible | PLAY after |
|---|---|---|---|
| 320×568 | 818 / 747 / **no** (0/5 hit-test points) | 560 / 488 / yes (5/5) | 96 px |
| 360×640 | 834 / 755 / **no** (0/5) | 632 / 553 / yes (5/5) | 104 px |
| 375×667 | 840 / 758 / **no** (1/5) | 659 / 577 / yes (5/5) | 104 px |
| 390×844 | 846 / 762 / yes | 836 / 751 / yes (5/5) | 128 px |
| 568×320 landscape | 897 / 779 / **no** (0/5) | 312 / 248 / yes (5/5) | 80 px |
| 667×375 landscape | 1018 / 882 / **no** (0/5) | 367 / 286 / yes (5/5) | 92 px |

* After: the Daily sheet ends at `viewport − 8 px` wherever the cap binds (568, 640, 667, 320 and 375 tall,
  and 836 of 844); document height drops 10–650 px (e.g. 3068 → 2483 at 568×320).
* Sheet heights, Role and Ranked, unchanged at every phone viewport (e.g. 758 / 774 / 780 / 786 / 837 / 950).
* 390×844: Ranked-pause made Ranked 786 px; Daily is capped to 776.
* Desktop 1024×768, 1280×800, 1440×900, 1920×1080: left / centre / right sheet boxes **identical** to
  the base (e.g. 1440×900 centre `448,6,544,821`).
* Tablet 768×1024 (stacked): Daily sheet 983 → 948 (ends 8 px above the bottom edge); seal stays 9 rem.

Screenshots (`docs/handoffs/quiz-hub-main-fit/`): `before-320x568`, `after-320x568-in-progress`,
`before-568x320-landscape`, `after-568x320-landscape-complete`, `after-375x667-complete`,
`after-390x844-complete`, `after-360x640-finished`, `after-320x568-finished-guest`,
`after-568x320-landscape-available-guest`. Raw per-case JSON and 48 PNGs (account, plus `…__guest` /
`…__no-session`) are the workflow's `quiz-hub-fit-after` / `quiz-hub-fit-before` artifacts (14-day retention).

## Test evidence

Workflow *Quiz Hub Main Screen Fit* (GitHub Actions, ubuntu, Playwright's bundled headless Chromium —
no local Edge/Chrome and no Docker; nothing browser-based was run locally). Final green run: head `39321731`
(run 39409418818, merged with current `main` `f6835049`): 68 browser tests, 25 unit tests, type check of
touched files.

Browser assertions (DOM geometry, not screenshots), at **320×568, 360×640, 375×667, 390×844,
568×320, 667×375**, for Daily **available / active / complete (More Challenges open) / finished
(results button)**, account (all four states) and guest + cold visitor (available, finished):

1. PLAY fully inside the viewport at `scrollY = 0`; ≥ 44 × 44 px.
2. PLAY is the top element at five points (`elementsFromPoint`); a real touch `tap()` starts the Daily
   (`/quiz/daily-challenge`) with no scrolling.
3. No horizontal scroll; no inner scrollbar on the Daily pane; whole sheet inside the viewport.
4. Tabs, title, status, three figures, caption, Mogzy, pill: inside the viewport and the sheet's writing
   area (between the rolls, inside the paper edge); no two groups overlap; **no figure truncated
   (`scrollWidth`) and no text outside its own box**; **nothing cut off by any clipping ancestor**
   (the check that caught the clipped "In progress"); status ≥ 11.5 px, values ≥ 14 px, mascot ≥ 48 px.
5. Completed and incomplete states (`1,840` and `9/12` asserted in *complete*).
6. Role and Ranked: sheet uncapped, one shared box, content inside it, tabs do not move; returning to
   Daily restores the same box and the same fit.
7. Desktop 1024/1280/1440/1920: no cap, rolls keep `1086/145` and `100% auto`, centre box equal across modes
   (parchment continuity). Tablet 768×1024 as above.
8. Viewport changes: 390×844 → 700 → 640 → 844 resize; rotate 375×667 → 667×375 → 375×667 → 568×320;
   a simulated 34 px bottom safe-area inset (headless Chromium has none, so the spec overrides the
   `--lc-hub-below` token the cap reads).

PR #68 compatibility: PR #68 is squash-merged into `main` (`6334913f`) and merged into this branch with no
conflicts (its `index.css` hunks and this block coexist). The workflow's `compat-play-popup` job runs the
popup's own `playScroll.shortViewport` stylesheet test and `play-scroll-short-phone` browser spec **and** this
spec on the merged tree, and the dedicated *Play Selector Short Phone Acceptance* workflow also ran on this
PR: all green. The Ranked-pause release (#90) is in the branch as well.

## Final results (after merging `main` `6334913f`)

* **Conflict-free:** `git merge origin/main` was clean; nothing from either mobile fix was lost.
* **CI on `39321731`:** Quiz Hub Main Screen Fit (fit acceptance, baseline, popup compatibility), Play Selector
  Short Phone Acceptance, History Review Acceptance, Mobile Recording Fit, mobile-arena-visibility, Journey
  Mobile Space, role-challenge-review, combat-estimate-public, practice-modernization: all success.
* **Screenshot review** (all four Daily states at the six viewports for the account; Daily available and
  finished for a guest with an anonymous session and for a cold visitor): no clipped text, buttons, pills or
  artwork. The figures read in full (`Ready`, `In progress`, `Complete`, `1,840`, `9/12`); the seal and the
  results button sit wholly inside the parchment above the foot roll; Mogzy is whole at every size. Guests
  show the HUD *Sign up* chip, which does not touch the sheet.
* **Polish pass (two visual issues from the first review), both fixed and asserted:**
  * **Ranked *COMING SOON* ribbon over the "RANKED" label.** Owned by PR #90 / `main`
    (`FeatureRibbon size="tab"`, a 96 px diagonal band sized for a ~117 px tab; phone tabs are 54–68 px and the
    short label fills them: the band covered 448 px² of the tab, from x = 24 of 54). Corrected with CSS only,
    leaving `FeatureRibbon`, `RankedLobbyHero` and PR #90's copy untouched: below 21 rem of writing width (the
    short-label tabs) the ribbon becomes a slim corner tape (2.25 rem × 7 px, text hidden; the ribbon is
    `aria-hidden` and the pause is still stated under the Ranked seal and by the disabled seal), and on the
    320 px sheet the Ranked label steps to 10 px so it ends before the tape. 568×320 landscape gets the same
    tape (3 label pixels were still touched there); 667×375 keeps the full legible ribbon. Desktop and
    other widths keep the original ribbon.
  * **Complete pill over Mogzy's hat.** On narrow sheets the pill is a notch smaller and the art is drawn
    2.25 rem shorter (`.lc-daily-hero--complete`, set only on a completed day), so the pill and Mogzy never
    share pixels, including while the art breathes. Cost: Mogzy is ~77 px tall (was ~110) on the 320×568
    completed state, ~150–190 px on 360–390 phones. Landscape hides the pill (unchanged).
  * **New assertions:** the ribbon's rotated band is built from its own geometry and the Ranked label's glyph
    pixels are sampled against it (0 allowed); the Complete pill and Mogzy overlap ≤ 2 px² at every phone.
    Screenshots: `after-ribbon-tabs-320-360-375-390`, `after-pill-complete-finished-320-360-375`,
    `after-landscape-568-667-complete`.
* **Flake seen once:** *Practice modernization acceptance* (`pm1`, a desktop 1440×900 Practice run, 150 s
  timeout) failed on one push and passed on the next with no change to anything it covers; it is unaffected
  by this CSS (all of it is below 1024 px and Daily-scoped).
* **Defects found and fixed during review:** `Complete` truncated to `Co…` and `In progress` clipped on
  320–360 px sheets (the pane clips overflow and centred text overflows both sides, which `scrollWidth`
  cannot see); the Complete pill cut off in landscape; a results button that squeezed Mogzy to 19 px. The spec
  now fails on any truncated figure, text outside its box, or element cut by a clipping ancestor.
* **History Review Acceptance:** green on the last runs here. Its earlier intermittent red (*art › a failed
  image request leaves a fully rendered card*) is being investigated separately; no History Review code is
  touched by this PR.

## Notes and risks

* **Continuity on short phones.** On phones the Daily sheet is now *shorter* than Ranked/Role's (cap binds
  at ≲ 800 px tall), so switching tabs changes the sheet's height there. On desktop and on viewports tall
  enough for Ranked, the box is still identical across modes. Making Ranked and Role fit short phones too is
  a larger change (Ranked's carousel is a fixed 252 px stage; Role would need its footer compacted) — not done.
* **Landscape**: the Daily sheet is re-proportioned (squashed rolls, wider column); tapping Role/Ranked in
  landscape shows the normal tall sheet. Mogzy is ~64 × 88 px at 568×320.
* **Tab hit area** stays at the existing 29.75 px height. 44 px would cost 14 px of the 320×568 budget.
* **`:has()`** scopes the cap to Daily (Chrome 105+, Safari 15.4+, Firefox 121+).
* **Safe area**: the repo's viewport meta has no `viewport-fit=cover`, so insets are normally 0; the cap
  already subtracts `env(safe-area-inset-bottom)` for when that changes.
* **Ranked tab** now carries PR #90's "COMING SOON" ribbon, which overlays the label at phone widths. Not
  this PR's concern, visible in the after screenshots.
* Not run: Academy Core browser benchmarks (per instructions); full-suite vitest (only `centre-stage`,
  which includes the existing `centreStage.test.tsx`).
