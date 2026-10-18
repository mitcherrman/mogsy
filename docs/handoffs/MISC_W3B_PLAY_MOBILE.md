# MISC Wave 3B: Play selector on short phones (F06)

Issue: mitcherrman/mogsy#66 · Branch `fix/misc-w3b-play-mobile` · Draft PR [mitcherrman/mogsy#68](https://github.com/mitcherrman/mogsy/pull/68)
Owner session: Claude Code, Sonnet 5.5, high effort · Date 2026-10-17

## Status

**Implemented, measured before and after, tested in Edge and Firefox. Draft PR only: not merged, not deployed.** CSS-only change plus tests. No change to matchmaking, auth, routing, close callbacks, queue logic or audio. No Daily result component, countdown file, Friends trigger or audio runtime was touched. No backend, no Docker, no production write.

| | SHA |
|---|---|
| Base (`origin/main`, fetched at session start) | `67118b2b` (F10–F12 countdown, PR #63) |
| Code head | `79420f77` (docs-only commits may follow; the PR shows the tip) |
| `origin/main` when the PR opened | `3d5cb057` (unrelated billing merge; a trial merge with this branch is clean) |
| Draft PR #46 (Journey CSS), not rebased in | unrelated conflicts, left alone as the issue says |

Files changed:

| File | Change |
|---|---|
| `src/index.css` | the one real fix, plus compact head and 44px hit areas (about 170 lines, mostly comments) |
| `src/components/quiz/play-scroll/playScroll.shortViewport.styles.test.ts` | new, pins the declarations the fix depends on |
| `e2e/play-scroll-short-phone.spec.ts` | new, 40 browser tests |
| `docs/handoffs/misc-w3b/` | this evidence: harness, scripts, JSON, five screenshot pairs |

## The defect, measured

The Play selector (`PlayScrollRecord`, the "Choose Mode" scroll) sits in `.play-scroll-frame`, a `position: fixed` box that does not scroll. The sheet's height follows its width (the parchment slices are `100% auto` and the margins are percentages of width), so the sheet is capped with `max-height` on `.play-scroll-sizer` and the writing area (`.play-scroll__body`) is meant to scroll inside it.

The short-viewport rule at `@media (max-height: 620px)` did the opposite. It set `.play-scroll-sizer { max-height: none; }`, so on any screen 620px tall or less the sheet grew past the fixed frame. Nothing scrolled: `.play-scroll__body` measured `scrollHeight == clientHeight`, so the cut-off modes were unreachable by touch, wheel or keyboard.

Separately, the other caps (`95vh`, and `97vh` under 640px wide) are viewport units. `vh` is the large viewport on phones, so with the browser toolbar showing the sheet was taller than the frame that holds it.

Baseline, Edge (Chromium), `/dev/play-scroll` menu view, before any change:

| viewport | sheet | result |
|---|---|---|
| 320×568 | 663px | 103px past the screen; **Invite and Practice unreachable, not scrollable** |
| 360×640 | 618px | fits |
| 375×667 | 609px | fits |
| 390×844 | 624px | fits |
| 568×320 landscape | 726px | 414px past the screen; **all three modes and Practice unreachable** |
| 667×375 landscape | 690px | 323px past; **Daily, Invite, Practice unreachable** |
| 844×390 landscape | 661px | 279px past; **Daily, Invite, Practice unreachable** |
| 1440×900 | 787px | fits |

The live `/quiz?play=1` hub (guest, so no rating or streak line, which makes its cards a little shorter) fails the same way: 605px sheet at 320×568 (45px past the screen, foot roll cut off), 668/632/620px sheets in the three landscape sizes. On the Invite view the roster could not even be opened in landscape: Playwright could not click the Invite card because it was off-screen.

## The fix

All in `src/index.css`.

1. **Bound the sheet by its frame.** `.play-scroll-sizer` is `max-height: 100%` instead of `95vh`. The narrow-screen `97vh` override and the short-viewport `max-height: none` override are deleted. The frame is `position: fixed; inset: 0`, so a percentage resolves against the real visible area on phones and already has the frame padding taken out. On a desktop it computes to the same number as `95vh` did (measured: 787px sheet at 1440×900, unchanged). The width cap also gets a `dvh` line (`min(100%, 47rem, 84dvh)`, with the `vh` line kept as the fallback).
2. **The one scroll region is `.play-scroll__body`**, which already had `min-height: 0; overflow-y: auto; overscroll-behavior: contain`. Title, close stamp and role stepper stay pinned above it, so the close control and the role are always on screen. It needs no new attributes: every card and Practice is a real button, so keyboard focus scrolls them into view.
3. **A compact head at `max-height: 620px`**, so most phones fit without any scrolling. The role band becomes one row `[<] Jungle (crest) [>]` (the decorative mascot is `display: none` at this height only, DOM order and tab order unchanged), the three cards keep all their copy with a smaller plate and gutter, and the Practice footer tightens. A second step under it handles the narrowest landscape sheet (about 270px wide) where the title and role name were being cut to an ellipsis.
4. **44px hit areas.** The close stamp (32px) and the role arrows (40px) keep their look; a `::after` extends the clickable area to 44px (verified with `elementFromPoint`).

Nothing changes at heights above 620px: 360×640, 375×667, 390×844 and 1440×900 measure the same sheet height, writing area and control positions as before (table below).

### After, Edge (Chromium), `/dev/play-scroll` menu view

| viewport | before | after |
|---|---|---|
| 320×568 | 663px sheet, 103px past the screen, Invite/Practice unreachable | **546px, fits, all in view, no scroll** |
| 360×640 | 618px, fits | 618px, fits (unchanged) |
| 375×667 | 609px, fits | 609px, fits (unchanged) |
| 390×844 | 624px, fits | 624px, fits (unchanged) |
| 568×320 landscape | 726px, 414px past, nothing reachable | **304px, fits; one scroll region (126px of 430), everything reachable** |
| 667×375 landscape | 690px, 323px past | **359px, fits; region 160px of 356** |
| 844×390 landscape | 661px, 279px past | **374px, fits; region 170px of 309** |
| 1440×900 | 787px, fits | 787px, fits (unchanged) |

Live `/quiz?play=1`: 320×568 goes from a 605px sheet (45px past) to 488px; the three landscape sizes go from 668/632/620px (clipped, not scrollable) to 304/359/374px (fit, scrollable). Ranked-queue and Invite views get the same treatment (Invite at 320×568: 652px → 542px). The 360–390px widths and desktop are unchanged on every view.

The full tables, from the harness JSON, are reproducible with `node docs/handoffs/misc-w3b/digest.cjs docs/handoffs/misc-w3b/evidence fixture menu` (and `live menu`, `fixture ranked`, `fixture invite`).

### What does not fully fit, said plainly

In **landscape phones** a full fit is not possible. The sheet's width is capped by the screen height (`84vh`), because its margins are a percentage of width and a wider sheet would spend more vertical room on margin, not less. At 667×375 the sheet is 315px wide and the writing area is 160px, so you see about 1.6 cards and scroll for the rest. That is the issue's fallback ("one clear accessible scroll region"), and it is one scrollable box with a pinned head, not several. A two-column landscape layout would be a design change and is out of scope; it is the natural follow-up if the owner wants landscape to show all three modes at once.

## Accessibility and behaviour

- **Touch targets.** Close 44px (32px visible), role arrows 44px (40px visible), mode cards 56px+ tall, Practice link 30px tall (meets the 24px minimum; not raised to 44px, which would cost 14px of height on the screen that now just fits).
- **Keyboard / Escape.** Escape closes (new test, 6 viewports). Tab walks arrows → modes → Practice and each stop lands inside the scroll region (new test).
- **Scroll lock.** Scrolling the region, by script and by wheel, never moves the page behind it. Radix's dialog scroll lock and `overscroll-behavior: contain` are unchanged.
- **Reduced motion.** `prefers-reduced-motion` still turns the veil and unfurl animation off (`animation-name: none`, tested). No animation was added. The new block adds no transitions.
- **Focus return, close callbacks, Escape rules while a queue is live** (`closeIsSafe`) are untouched TSX, covered by the existing `RankedPlayScroll.test.tsx`.
- **Screen readers.** The hidden mascot is decorative art (the role is written out beside it) and the role is still named by the live-region name beside the arrows. Nothing focusable is hidden.
- **Horizontal overflow.** None at any viewport on any view (`documentElement.scrollWidth <= innerWidth`, asserted at six sizes).

Known small cost: at heights of 620px or less the mascot `<img>` is `display: none` but still mounted (`loading="eager"`), so the browser still fetches it. Avoiding that needs a TSX change (render it by media query) that this fix deliberately does not make.

## Tests

| Suite | Result |
|---|---|
| `e2e/play-scroll-short-phone.spec.ts` (new), Edge-class Chromium, fixed code | **40/40** |
| Same spec, Firefox, fixed code | **40/40** |
| Same spec against the unfixed base | **15 fail**, proving it detects the defect (`evidence/e2e-against-base.txt`) |
| `playScroll.shortViewport.styles.test.ts` (new) | passes |
| `src/components/quiz/play-scroll`, `Quiz.playScroll`, `LeaguecraftHub.playCommit` vitest | **5 files, 210 tests, all green** |
| `src/pages/Quiz*` + `src/components/quiz` vitest | 155 of 158 files green; **7 failures in 3 files, identical on the unmodified base** (below) |
| `eslint`, `tsc -p tsconfig.app.json` on the changed files | clean |

The 7 pre-existing failures reproduce one-for-one on a detached checkout of `67118b2b` (`evidence/vitest-base-3files.txt`): `Quiz.hub.test.tsx` (3: one h1, QUICK STUDY order, category rail), `Quiz.rankedRole.test.tsx` (1: "commits NOTHING for Practice after a role change") and `QuizCategoryRail.test.tsx` (3). None involves the play-scroll CSS.

Environment note: `playModeCard.styles.test.ts` has two tests that slice `index.css` on `\n}` and fail on a CRLF checkout (`core.autocrlf=true` on this machine; reproduced on the untouched base). They pass on an LF copy, and on CI. After converting `index.css` to LF locally all 210 tests in the play-scroll set passed.

### Browser evidence

Edge (Chromium, `channel: msedge`, `isMobile` + touch) and Firefox 1555 (viewport + touch; Firefox rejects `isMobile`). Firefox geometry matches Edge to within a pixel at every size (for example 667×375: sheet 359px, region 160px in both). Screenshots, 2× DPR, in `docs/handoffs/misc-w3b/shots/`:

| | before | after |
|---|---|---|
| 320×568 | `before-fixture-320x568.png` | `after-fixture-320x568.png` |
| 667×375 landscape | `before-fixture-667x375-landscape.png` | `after-fixture-667x375-landscape.png` |
| 568×320 landscape | `before-fixture-568x320-landscape.png` | `after-fixture-568x320-landscape.png` |
| live `/quiz`, 320×568 | `before-live-320x568.png` | `after-live-320x568.png` |
| 360×640 (unchanged) | | `after-fixture-360x640.png` |
| Firefox 320×568 | | `after-firefox-320x568.png` |

### Not covered

- **A real phone with a live toolbar.** Headless Edge/Firefox cannot show the toolbar-resize case that motivates replacing `vh` with a percentage. The change is correct by construction (the frame is the visible area) but I could not observe it. Worth a check on a real Android or iOS device.
- **A signed-in live hub.** The live `/quiz?play=1` run is a guest (no rating, no streak line, no bot toggle), so its cards are shorter than a ranked player's. The fixture view carries the full rating and streak lines, which is the tighter case and is the one the tests assert.
- **iOS Safari / WebKit** was not run (Playwright WebKit is not installed here).

## Reproduce

```bash
# from this worktree, dev server on 5366 and a detached base checkout on 5367
node node_modules/vite/bin/vite.js --port 5366 --strictPort
bash docs/handoffs/misc-w3b/run-batch.sh http://localhost:5367 http://localhost:5366      # Edge
bash docs/handoffs/misc-w3b/run-firefox.sh http://localhost:5367 http://localhost:5366    # Firefox
npx playwright test -c playwright.frontend.config.ts e2e/play-scroll-short-phone.spec.ts
npx vitest run src/components/quiz/play-scroll
```

`cap.cjs` options: `VP=320x568,667x375-landscape` limits viewports, `REDUCED=1` emulates reduced motion, `ENGINE=firefox` switches engine.

## Decisions for the owner

1. **Landscape phones.** Accept the pinned-head scroll region (this PR), or ask for a two-column landscape layout as a separate design pass. Recommendation: accept; landscape is rare for this screen.
2. **Practice link target.** It is 30px tall, above the 24px minimum, below 44px. Raising it costs 14px of height at 320×568, which currently fits to the pixel. Left alone.
