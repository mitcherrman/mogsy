# RMOB1 — Ranked Mobile Audit

## Status
IMPLEMENTATION COMMITTED on `rmob1/ranked-mobile-audit` — NOT merged to main. Awaiting review.
(Phase 1 audit below is kept as the baseline record; implementation follows at the end.)

## Baseline
- `origin/main` = `598bb9c9` (RD2 mascot duel reactions, on top of RS2 `7b9a815e`). Main had moved past the expected `7b9a815e`; RD2 touches mascots only.
- Branch/worktree: `rmob1/ranked-mobile-audit` at `../mogsy-wt-rmob1`. Shared checkout untouched.
- Harness: existing `/dev/ranked-shell-probe` (RS1/RS2 states), Playwright with system Chrome, `isMobile`, `hasTouch`, dark scheme, DPR 2.

## Matrix
Viewports (portrait): 430×932, 412×915, 393×852, 390×844, 375×812, 360×800, 360×740.
Rounds: `media` (cinematic Item Analysis), `family` (Combat Calculation), `realP99`, `realMax`, `stressA`, `stressB`, `short`, `opts2` (2-answer), `opts4` (compact/sparse, no art), `metareflex`.
70 cases measured. Landscape not audited.

## Screenshots (local, uncommitted: `.rmob1/`)
- `montage-{430x932,390x844,375x812,360x800,360x740}.png` — media/family/realMax/stressB/opts2/metareflex, full page, fixed overlays hidden.
- `shots/<vp>-<q>-full.png` (full page) and `shots/<vp>-<q>-fold.png` (first viewport, as a player sees it) for 430/390/375/360×800/360×740.
- `shots/defect-390x844-media-scrolled-bottom.png`, `shots/defect-360x800-metareflex-scrolled-bottom.png` — dock covering the Module Rail.
- Raw data: `.rmob1/measure.json`, `.rmob1/matrix.txt`. Tooling: `.rmob1/measure.mjs`, `rail.mjs`, `bottom.mjs`, `montage.mjs`.

## Current scroll model (below `lg`)
Natural document flow, single page scroller, **no inner scroll containers anywhere** (verified all 70 cases). Order:

1. Global HUD (fixed, 48px) + "Turn on the Radio!" notice pill
2. Match Header — y=80
3. Player Columns — `grid-cols-2`: both banners SIDE BY SIDE (not stacked), each ~half width
4. Question Stage (`col-span-2`)
5. Ability Hotbar (132px) → status line → Forfeit
6. Module Rail (62px) — last element
Fixed on top of flow: Friends button (bottom-left), Report/Rules docks (bottom corners, 46px).

## Measurements (y = document offset, px)

| vp | header | player cols (each) | stage top | first answer (media / realMax / opts4 / MR) | rail top | scrollHeight (media / stressB / MR) |
|---|---|---|---|---|---|---|
| 430×932 | 80+127 | 219+361 | 592 | 848 / 771 / 719 / 684 | 1288 (media) | 1374 / 1626 / 977 |
| 412×915 | 80+127 | 219+361 | 592 | 841 / 771 / 719 / 684 | 1280 | 1366 / 1626 / 977 |
| 393×852 | 80+**171** | 263+361 | 636 | 902 / 815 / 763 / 728 | 1342 | 1428 / 1793 / 1021 |
| 390×844 | 80+171 | 263+361 | 636 | **901** / 815 / 763 / 728 | 1341 | 1426 / 1793 / 1021 |
| 375×812 | 80+171 | 263+**378** | 652 | 911 / 857 / 779 / 744 | 1350 | 1436 / 1836 / 1037 |
| 360×800 | 80+171 | 263+378 | 652 | 904 / 857 / 779 / 744 | 1344 | 1430 / 1836 / 1037 |
| 360×740 | 80+171 | 263+378 | 652 | 904 / 857 / 779 / 744 | 1344 | 1430 / 1836 / 1037 |

**Before the question starts (header + columns + gaps): 512px at ≥412 wide, 556–572px at ≤393 wide — 60–77% of the first viewport.**

Question Stage internals:
- Stage width 296 (360) → 366 (430); padding 12px (`p-3`).
- Prompt 18px / 26.1px line-height at every phone width. realMax/stressB wrap 3–7 lines (157–183px).
- Media region: cinematic 118–149px; family band **227–259px**; text-only rounds still render a 64px compact category plate.
- Answers: 14px text, 12px padding. Short labels 49–54px tall (good). Longest labels 72px (≥412) and **94px (≤393, 3-line labels)**; four of them = 407px.
- Stage height range: 248 (opts2) → **918px** (stressB at 375/360).
- Meta Reflex: two choice cards side by side, 131×120 (360) → 166×120 (430); stage 257px.

Module Rail: 62px tall, full width, **9-node sliding window** (`visibleNodes`), 10th node parked off-clip by design (enters as the window advances) — no wrap, no page overflow. Nodes 32–40px wide.

Header: title 11px uppercase; record/timer window 184×40. At <412 wide the header wraps: eyebrow/title stack left, timer drops to its own row → 171px with ~70px of empty plate.

## Defects by severity

### Serious
1. **No answer is visible on first load at any phone viewport** (except Meta Reflex/short at 430×932 and partially `media` at 430). First answer at 684–1150px on 740–932px screens. Cause is chrome, not the question: 512–572px of header + player banners precede the stage. *(excessive vertical chrome, Player Column density)*
2. **Fixed Report/Rules dock covers the Module Rail at the bottom of the page.** No bottom clearance: at max scroll the docks (46px) sit on rail nodes 1–3 and 7–9 including the current-round marker (390×844 rail 768–829 vs docks 791–837). Friends button also sits over the Forfeit row. Encoded as a `test.fail` in the fit spec. *(safe area / bottom chrome)*

### Moderate
3. **Player banners are ~361–378px of mostly empty space.** Side-by-side half-width banners: "NO MODULES YET" area ~150px empty; names truncate to "Opp…"/"Oppo…", roles to "TA…"/"MA…" at ≤390; "Thinking."/"Picking.." pills overflow the banner edge (right edges 190 vs banner 189 at 390; 344 vs 328 at 360) and are clipped mid-word; "XP0 xp · Level 1 (max)" collides label with value and wraps at 360. *(Player Column density, mobile typography)*
4. **Match Header wraps to 171px below 412 wide** with a large dead band between title and timer; the only information is round, opponent, timer. *(excessive vertical chrome)*
5. **Match state disappears while answering.** Timer and scores are ~600px above the answers, the rail ~400px below; nothing is sticky (correctly not added). On a 30s round a player can't see the clock and answers at once. *(excessive document scrolling)*
6. **Family band dominates on phones:** 227–259px of art over a 157–183px prompt (stressB stage 892–918px, four 94px answers). *(media dominance)*

### Cosmetic
7. Text-only rounds render a 64px compact plate whose category is truncated ("CHAMPION ABI…").
8. Item Analysis hero: "ITEM ANALYSIS" chip overlaps the "BUILD PATH" label ("UILD PATH").
9. Chamber backdrop ends abruptly mid-page (~y 950); lower page is flat navy.
10. "Turn on the Radio!" notice pill overlays the header/stage edge.
11. Ability hotbar descriptions truncate ("Locked — unloc…", "Clear abi…" at 360).
12. Long answer cards (94px × 4) are readable and large but visually heavy — not a tap problem.

### Not defects (verified)
- No horizontal page overflow from the arena. The 4–5px `scrollWidth` excess is the **dev probe's own fixed switcher** (`RankedShellProbe.tsx:310`), not production.
- No clipped answer tablets, no media spill, no nested scrollers — all 70 cases.
- Tap targets: answers ≥49px tall, full stage width; Meta Reflex cards 120px tall. Comfortable.
- Prompt 18px is readable; hierarchy prompt > answers holds.
- Module Rail fits the width; 9-node window is intentional.

## Component recommendations
- **Match Header:** needs a mobile variant — one compact row (round · timer · score), target ≤64px.
- **Player Columns:** need a true mobile variant. The banner art at half width is the single largest cost (~360px) and carries little. A compact dual "duel strip" (name, role icon, HP bar, status) ≈ 64–80px would replace both. Module history/XP secondary on mobile.
- **Question Stage:** keep prompt 18px and answer sizing. Cap family/cinematic band height on phones (e.g. ~140–160px); drop or shrink the text-only compact plate.
- **Module Rail:** does NOT need a replacement; needs bottom clearance from the fixed dock (padding-bottom ≥ dock height + `env(safe-area-inset-bottom)`).
- **Meta Reflex:** works; no dedicated treatment needed beyond the shared chrome fixes.
- **Scrolling:** document scrolling is appropriate for phones; it is excessive because of chrome, not because of the question. Keep one page scroller; don't add inner scrollers. Whether to add a compact sticky timer is an owner decision for a later phase.

## Proposed mobile hierarchy
1. Compact header row (round · timer · score)
2. Compact duel strip (both players, HP, status)
3. Question Stage (capped media → prompt → answers) — first answer targeted within the first viewport for ordinary rounds
4. Ability hotbar
5. Module Rail + Forfeit, clear of fixed docks

## Tests added
`e2e/ranked-arena-fit.spec.ts`:
- `RMOB1 phone <vp>` × 7 viewports × 10 rounds: tablets inside parchment, no horizontal label clipping, no media spill, arena not wider than viewport (ignoring clipped descendants), no nested scrollers. No fit-one-screen or sizing assertions.
- `RMOB1 known defect` (`test.fail`): fixed dock must not cover the Module Rail at page end — currently fails as expected; remove the marker when fixed.
- Run: `npx playwright test -c playwright.arena.config.ts -g "RMOB1|390x844 — below"` → **72 passed** (incl. expected failure). Desktop matrix not rerun (spec additions only, no runtime change).

## Files changed
- `e2e/ranked-arena-fit.spec.ts` (tests only)
- `docs/handoffs/RMOB1-ranked-mobile-audit.md`
- Uncommitted local tooling/screens: `.rmob1/` (do not commit)

Nothing committed.

## Next implementation task (pending approval)
RMOB2, in order:
1. Bottom clearance for the fixed dock (smallest, fixes a serious defect).
2. Compact mobile Match Header.
3. Mobile Player Column variant (duel strip).
4. Phone media cap for family/cinematic bands; text-only plate.
5. Re-measure first-answer position; then decide on any sticky timer.


---

# RMOB1 Implementation (phase 2)

## Baseline
`origin/main` re-fetched: still `598bb9c9`. Same worktree/branch.

## Decisions
1. **Dock clearance.** No existing token covered the Mogzy dock (`--bottom-nav-clearance` is 0 and feeds `--app-viewport-h` and the desktop stage budget, so reusing it would move desktop). Added `--mogzy-dock-clearance` in `index.css` = dock offset `1rem` + tab `2.875rem` (measured 46px) + `0.5rem` + `env(safe-area-inset-bottom)`. Applied as `pb-[var(--mogzy-dock-clearance)] lg:pb-0` on the match shell. Rail now ends ~32px above the tabs at page end.
2. **Compact Match Header (under `sm`).** No new component: the header was 171px only because it WRAPPED. Below `sm` the timer is now inline beside the eyebrow/opponent/round block (`flex-1`, no `order-last w-full`), padding `px-3 gap-x-2`, and the record window is `max-md:hidden` (its result beats were already `hidden md:flex`, so it was an empty 40px box). `sm`+ classes are byte-identical. Score/standing stays on the timer's secondary line (existing `CentralStage`), and in the strip. Opponent line kept — it fits without a row.
3. **Mobile duel strip.** New `MobileDuelStrip.tsx` (purpose-built, not a squashed banner). Per side: role crest `sm` (or legacy class portrait), name, role/class + `Lv`, HP mini-bar + number (or score on a points match, coloured by `data-standing`), one status line (`Thinking…` / `Locked in` / `· Armed` / reveal verdict). Rendered only when BOTH flanks are Ranked `banner` combatants; banner cells get `hidden lg:block`. Daily/staff card flanks untouched. Lives inside the header wrapper so the arena's known bands (bottom-invariant, scroll-ownership tests) are unchanged. `mobile-*` test ids avoid jsdom duplicates. Module history/XP bar/level-up detail are desktop-only.
4. **Media cap — deliberately NOT added.** Derived from the after-screenshots:
   - Cinematic (Item Analysis, Stress A) is 118–149px on phones (14–16% of viewport height, ~0.4× stage width) and already reads as support. Any cap at or above that is a no-op; below it shrinks legible art. No change.
   - The Combat Calculation band (227–259px) is **not decorative media**: it carries the question's inputs (attacker/ability, target/item, `RAW PHYSICAL 600`, `ARMOR 60 → 100`). A height cap would clip premises. Its height comes from the shared band's `<sm` vertical stack (attacker / arrow row / target / chips), which Daily/Practice also render. Recommended as its own follow-up: a phone arrangement of that band (attacker→target on one row), not a clip.
   - Compact plates and Meta Reflex unaffected.

## Before → after (px; y = document offset)

| vp | round | header | player area | first answer Y | 1st answer on first screen | media | page height |
|---|---|---|---|---|---|---|---|
| 390×844 | media (cinematic) | 171 → 78 | 361 → 76 | 901 → **524** | no → yes | 131 → 131 | 1426 → 1119 |
| 390×844 | family (Combat Calc) | 171 → 78 | 361 → 76 | 1133 → **756** | no → yes | 259 → 259 | 1637 → 1330 |
| 390×844 | Stress A | 171 → 78 | 361 → 76 | 979 → **602** | no → yes | 131 → 131 | 1666 → 1358 |
| 390×844 | Meta Reflex | 171 → 78 | 361 → 76 | 728 → **350** | no → yes | – | 1021 → 853 |
| 360×800 | media | 171 → 78 | 378 → 76 | 904 → **511** | no → yes | 118 → 118 | 1430 → 1106 |
| 430×932 | media | 127 → 78 | 361 → 76 | 848 → **515** | yes → yes | 149 → 149 | 1374 → 1110 |
| 360×740 | media | 171 → 78 | 378 → 76 | 904 → **511** | no → yes | 118 → 118 | 1430 → 1106 |
| 375×812 | realMax | 171 → 78 | 378 → 76 | 857 → **464** | no → yes | 64 → 64 | 1544 → 1220 |
| 390×844 | Stress B | 171 → 78 | 361 → 76 | 1107 → **730** | no → yes | 259 → 259 | 1793 → 1486 |

Whole matrix (70 cases): first answer fully on the first screen **21 → 65**. The 5 remaining are all Combat Calculation band rounds on the shortest screens: `stressB` at 375×812, `family` + `stressB` at 360×800 and at 360×740 (first answer at y=756). Chrome above the question: **512–572px → 178px** at every phone width. Every answer on the first screen after: 38/60 standard rounds.

Header 78px and strip 76px at every phone width (constant; no wrap). Question now starts at y=258 everywhere.

## Sticky timer?
**Not recommended now.** Timer sits at y≈80–158. For ordinary, p99, short, 2/4-answer and Meta Reflex rounds, the timer and the whole answer set are on one screen at ≥390×844 (e.g. 390×844 media: last answer ends at 770). Only the Combat-Calculation-band rounds with long prompts (family, Stress B) still need a scroll that hides the clock, and the band follow-up above shrinks exactly those. Re-evaluate after that; keep as an **RMOB2 candidate** only if they still scroll the timer away.

## Screenshots (local, `.rmob1/`, uncommitted)
- After montages: `after-montage-{430x932,390x844,375x812,360x800,360x740}.png` (compare with the audit's `montage-*.png`).
- `shots/<vp>-<q>-fold.png` / `-full.png` now show the after state (before state is in the montages and `before.json`).
- `shots/defect-390x844-media-scrolled-bottom.png` — rail now clear of Report/Rules.
- Data: `before.json` / `after.json`, `after-matrix.txt`, desktop `desk-8132.json` (clean main) vs `desk-8131.json` (branch).

## Desktop unchanged — verified
RS2 measurement script against a **clean `origin/main` server** vs this branch at 1878×797, 1600×800, 1280×720 × 8 shapes (header, grid, both columns, stage, media, prompt, answers, rail, scroll, clipping): **24/24 rows identical.**

## Tests
- `e2e/ranked-arena-fit.spec.ts`:
  - `RMOB1 phone` 7 × 10 shapes (unchanged checks: answers inside parchment, no label clipping, no media spill, no sideways arena overflow, no nested scroll).
  - `test.fail` known-defect replaced by **`RMOB1 dock clearance`** 7 viewports × {media, metareflex}: rail wholly above both dock tabs at page end; shell foot below the rail ≤96px (no spacer footer).
  - **`RMOB1 duel strip`** 430×932 and 360×800: no banner drawn, nothing in the strip outside its box, strip ≤96px, header ≤88px.
- `src/components/ranked-arena/MobileDuelStrip.test.tsx` (new, 2 tests).
- Full arena fit suite: 228 passed on the first run; the other 31 (all RMOB1 phone/dock/strip) failed with `ERR_CONNECTION_REFUSED` when the suite's vite server dropped mid-run, and **passed on re-run (36/36)**. Net: whole suite green.
- Vitest `src/components/ranked-arena`, `src/pages/quiz-ranked`, probe: **963/963** (79 files + strip test). Two structural guard tests were satisfied by keeping their exact class substrings rather than editing the tests.
- `npm run build`: passes.

## Files changed (implementation)
- `src/components/ranked-arena/MobileDuelStrip.tsx` — new.
- `src/components/ranked-arena/MobileDuelStrip.test.tsx` — new.
- `src/components/ranked-arena/CanonicalArena.tsx` — strip mount, banner cells `hidden lg:block` (banner matches only), header `<sm` no-wrap classes, record window `max-md:hidden`, shell dock clearance.
- `src/index.css` — `--mogzy-dock-clearance` token.
- `e2e/ranked-arena-fit.spec.ts`, this handoff.

## Remaining defects / follow-ups
- Combat Calculation band on phones (227–259px, vertical stack) — needs a phone arrangement in the shared band, not a cap.
- Cosmetic, unchanged from audit: "ITEM ANALYSIS" chip over "BUILD PATH"; truncated compact category plate; "Turn on the Radio!" pill over the header edge; ability hotbar descriptions truncate at 360; backdrop seam mid-page.
- Tablet widths 640–1023 also get the strip (it is `lg:hidden`); header there is unchanged. Not separately reviewed.

## Next task
Owner review of the after montages → merge. Then: Combat Calculation band phone layout; re-measure; decide on sticky timer.
