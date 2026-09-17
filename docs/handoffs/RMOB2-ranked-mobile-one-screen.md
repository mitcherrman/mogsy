# RMOB2 — Ranked Mobile One-Screen Arena

## Status
IMPLEMENTED and committed on `rmob2/ranked-mobile-one-screen` — **NOT merged**. Awaiting owner review on a real phone.

## Baseline
- `origin/main` re-fetched: **`0f23467c`** (main had moved past the expected `92318ebc`: RR1 header result-record fix, JPM1 jungle pet media, RBOT2 tests, Patch Brief hub centering). None of those touch `CanonicalArena.tsx`; no reconciliation needed.
- The branch name already existed pointing exactly at `0f23467c` with no commits and no worktree; it was reused for `../mogsy-wt-rmob2`. Shared checkout untouched.
- BEFORE measured on a clean `0f23467c` worktree (`../mogsy-wt-rmob2-base`) with only the dev-probe changes applied, so both sides render the identical live match shape.

## Owner decisions (from the brief)
- Phones get a purpose-built composition; desktop stays pixel/geometry-identical.
- Ordinary, short and Meta Reflex rounds: one screen. Stress / Combat Calculation: fit if possible, else graceful whole-page overflow. No inner scroll, no clipping, no type shrink.
- One unified match bar; show the real username (all Ranked screens); two recent-result bubbles; compact HUD; Report · 5-node timeline · Rules bottom row; no mascots on phone Report/Rules; no mobile media cap that clips values.

## Mobile hierarchy (below `lg`, Ranked duel arenas only — `data-phone-arena`)
```
compact global HUD (40px)
match bar (60px):  [crest] name ◆  score ●● status | 0:24 / 4 / 10 | status ●● score  ◆ name [crest]
question card (fills the rest; question centred in it)
forfeit row
bottom bar (49px): [Report]  [ 2 3 [4] 5 6 ]  [Rules]
```
The frame is a **viewport floor** (`min-height: 100dvh − HUD reservation`, safe-area aware), never a lock: a round that cannot fit grows the page and scrolls it whole.

## What was built
1. **Unified match bar** — `MobileMatchBar.tsx` replaces RMOB1's `MobileDuelStrip` AND hides the header strip on phone Ranked arenas. Per side: 40px crest box with the role mascot at full-box `cover` (was a 20px glyph inside a thick frame), username, `RoleEmblem` beside the name, score (or HP for hp matches), exactly two most recent settled modules as compact `ModuleBubble`s (newest nearest the score), status line. Centre: timer (urgent/zero state as desktop) and the header's own module title (`4 / 10`). Crests sit at the plate edges (shell side padding 16→8px).
2. **Real names** — `QuizRankedPage` reads `useProfileIdentity(viewerUserId)` (the canonical `profiles` read already used elsewhere) and passes `viewerDisplayName` to `QuizRankedMatch`, which names the viewer in the combatant views (desktop banners, phone bar, match-over identity), the final scoreline label and the Meta Reflex transcript header. `"You"` remains ONLY as the fallback for an account with no display name. Scoreline test ids stay `final-score-you/opponent`.
   - **Opponent name: NOT possible frontend-only.** The live round projection (`ranked_public/projections.py::project_public`) injects roles but not display names, although `ranked_participants.display_name` is stored and `RankedMatch.display_names()` exists. The opponent therefore still reads `Opponent`/`Bot` (existing fallback). Follow-up: backend inject `display_name` per player (mirroring `_inject_roles`) + contract parse. Not done — cross-repo, needs approval.
3. **Compact phone HUD** (`index.css`, below `sm`, every route): row 48→40px; visible controls 44→36px, marks 36→30px, tighter cluster; every control keeps a **44px-tall hit area** via an invisible `::after` (Playwright-verified with `elementFromPoint`). `--app-header-h` is NOT changed (no other page moves); only the phone Ranked frame pulls up 8px.
4. **Bottom bar** — `MobileBottomBar.tsx`: Report · `RoundTimeline` drawing `windowTimelineView(timeline, 5)` · Rules. The window is a pure presentation slice (clamped: `[1]2345`, `23[4]56`, `678 9[10]`); every node's state/outcome/kind comes from the existing projection. Report/Rules are the **dock's own tabs**, hosted in the bar through a new `useMogzyDockTabHost` (MogzyDock) — panels, open state, exclusivity, focus return and the rules-seen record are unchanged; hosted tabs draw a compact icon+label form (no mascot, 32px pill, 44px hit area) and panels lift clear of the bar. The bar mounts only when `matchMedia(max-width: 1023.98px)` matches, so desktop and jsdom DOM have no bar; the 9-node desktop rail is CSS-hidden on phone arenas.
5. **Question density** (phone arena only): parchment padding 12→8/10px, stack gap 12→8px, answer tablets `min-height: 3rem` with 9px vertical padding and 6px gutters (auto height, labels never clipped), cinematic hero aspect 16/5.75 capped at 7.5rem (art scales — container units — rather than crops). Prompt 18px unchanged.
6. **Combat Calculation compact band** — attacker → target on ONE row (32px portraits, arrow unrotated), names and the ability/item name WRAP instead of truncating, both fact tablets (`RAW PHYSICAL 600`, `ARMOR 60 → 100`) intact; only the detail's duplicate mini-icon is dropped. `PostMitigationBand` gained `data-combat-*` hooks only (no class change), scoped CSS does the rest. 227–259px → **112–124px**.
7. **Meta Reflex** — cards unchanged; the parchment fills the screen with the comparison centred.
8. **Shell glow bleed fix** — `.ranked-shell::before` has a −0.25rem horizontal bleed; on a full-width phone frame it was 4px of real horizontal overflow, which made mobile browsers zoom the page to 394px and turned an exactly-one-screen arena into 853px of an 844px screen. **This corrects RMOB1**, which attributed the 4–5px overflow to the dev probe switcher (hiding the switcher changes nothing).
9. The Community (Friends) floating button steps out while a phone Ranked match hosts the dock tabs (it sat over the lower-left answer).
10. The radio's first-visit "Turn on the Radio!" nudge is hidden during a phone Ranked match (it covered the opponent's name).

## Before → after (live shape; px)
BEFORE = clean `0f23467c`, AFTER = this branch. Probe: `?points=4:7-5&name=Kalista_Enjoyer&role=mid&orole=support&progression=0&frame=0`.

| case | HUD | top chrome (hdr + strip → bar) | bottom chrome | media region | prompt | answer heights | card | doc/client | scroll |
|---|---|---|---|---|---|---|---|---|---|
| 390×844 Item Analysis | 48 → 40 | 78 + 63 = 153 → **60** | 62 rail + 46 fixed tabs → **49** | 145 → 127 | 52 → 52 | 54×4 → 48×4 | 512 → 644 | 932/844 → **844/844** | yes → **no** |
| 390×844 Combat Calculation | 48 → 40 | 153 → 60 | → 49 | 227 → **124** | 157 → 130 | 49×4 → 48×4 | 678 → 644 | 1097/844 → **844/844** | yes → **no** |
| 390×844 Stress A | 48 → 40 | 153 → 60 | → 49 | 145 → 127 | 157 → 130 | 72×4 → 66×4 | 687 → 644 | 1106/844 → **844/844** | yes → **no** |
| 390×844 Meta Reflex | 48 → 40 | 153 → 60 | → 49 | – | – | 120×2 → 120×2 | 257 → 644 | 853/844 → **844/844** | yes → **no** |
| 360×800 Item Analysis | 48 → 40 | 153 → 60 | → 49 | 132 → 116 | 78 → 52 | 54×4 → 48×4 | 525 → 600 | 945/800 → **800/800** | yes → **no** |
| 430×932 Item Analysis | 48 → 40 | 153 → 60 | → 49 | 163 → 141 | 52 → 52 | 54×4 → 48×4 | 530 → 732 | 949/932 → **932/932** | yes → **no** |
| 360×740 Stress B | 48 → 40 | 153 → 60 | → 49 | 259 → 124 | 157 → 157 | 94×4 → 66×4 | 892 → 613 | 1311/740 → 805/740 | yes → yes (+65) |

Media region = hero (≤120px) plus its bezel frame. `window.innerHeight` = `100dvh` = clientHeight in every case.

## One-screen results (all 70 cases)
**BEFORE: 0/70 fit. AFTER: 67/70 fit.**

| phone | fits one screen | overflows |
|---|---|---|
| 430×932, 412×915, 393×852, 390×844, 375×812 | all 10 shapes | — |
| 360×800 | 9 | Stress B (+5px) |
| 360×740 | 8 | Stress A (+57), Stress B (+65) |

Why the three still scroll: Stress A/B are synthetic compound worst cases (the bank's 188-char maximum prompt + four longest 63-char labels + rich media). On a 360-wide phone the prompt is 6 lines and the tablets wrap to 2 lines; fitting them would need smaller type, which the brief rules out. They scroll the page whole — nothing clipped, no inner scroller (Playwright floor test).

All 70 cases: nested scrollers 0, horizontal overflow 0, two bubbles per player, 5 timeline nodes with the current one visible.

## Desktop regression comparison
- **Geometry**: RS2 measure extended (HUD controls, header, grid, both Player Columns, stage, media, hero, prompt, every tablet, rail + every node, dock tabs, dock roots, visible-box count, scroll size) at 1878×797, 1600×800, 1280×720 × 8 shapes, clean main vs branch: **24/24 rows identical in every drawn box.** The only difference is hidden markup: `ranked-mobile-matchbar` (0×0, `lg:hidden`) replaces RMOB1's hidden duel strip (+1 element).
- **Pixels**: 7/24 screenshots byte-identical, the rest ≤1.3% of pixels. A control run of clean main against itself gave 3/24 identical and up to 7.7% — the scenario art motion, mascots and live timer dominate; the branch-vs-main differences are within main's own run-to-run noise.

## Screenshots (local `.rmob2/`, uncommitted)
- `montage-{430x932,390x844,375x812,360x800,360x740}.png` — BEFORE row vs AFTER row, Item Analysis / Combat Calculation / Stress A / sparse 4-option / Meta Reflex, first screen as the player sees it.
- `shots/before-live-<vp>-<q>.png`, `shots/after-<vp>-<q>.png` (5 phones × 10 shapes each); `shots/tablet-768x1024-*.png`.
- `desk-shots-{before,before2,after}/` desktop pixel comparison.
- Data: `before-live.json`, `after.json`, `desk-before.json`, `desk-after.json`, `tsc-before.txt`/`tsc-after.txt`. Harness: `measure.spec.ts`, `desk.spec.ts`, `montage.spec.ts`, `pixdiff*.cjs`, `pw.config.ts`.

## Files changed
- `src/components/ranked-arena/MobileMatchBar.tsx` (new), `MobileMatchBar.test.tsx` (new)
- `src/components/ranked-arena/MobileBottomBar.tsx` (new)
- `src/components/ranked-arena/MobileDuelStrip.tsx` + test — **deleted** (superseded)
- `src/components/ranked-arena/CanonicalArena.tsx` — bar wiring, header hidden on phone arena, `data-phone-arena`, grid hook class, bottom bar
- `src/components/ranked-arena/ArenaShell.tsx` — `phoneArena` prop → `data-phone-arena`
- `src/components/ranked-arena/RoundTimeline.tsx` — optional `testIdPrefix` (desktop DOM unchanged)
- `src/components/ranked-arena/SegmentTranscript.tsx` — `viewerLabel`
- `src/components/ranked-arena/roleIdentity.tsx` — export `NeutralSigil`
- `src/lib/ranked-core/roundTimeline.ts` — `windowTimelineView`; `roundTimeline.window.test.ts` (new)
- `src/components/mogzy-dock/MogzyDock.tsx` — tab host API (`useMogzyDockTabHost`, `useMogzyDockTabsHosted`, `hosted`); `MogzyDock.tabHost.test.tsx` (new)
- `src/components/ranked-rules/MogzyExplainsPanel.tsx` — compact hosted tab + `tabIcon`; `RankedRulesScroll.tsx`, `report/QuestionReportScroll.tsx` — icons
- `src/components/Layout.tsx` — Community trigger steps out while tabs are hosted
- `src/components/hud/GlobalHud.tsx` — `global-hud` hook class
- `src/components/question-surface/family/PostMitigationBand.tsx` — `data-combat-*` hooks
- `src/pages/quiz-ranked/QuizRankedPage.tsx`, `QuizRankedMatch.tsx`, `rankedViews.ts`, `RankedScoreline.tsx` — viewer display name; `rankedViews.viewerName.test.tsx` (new)
- `src/pages/dev/ranked-shell-probe/RankedShellProbe.tsx` — `progression=0`, `orole`, `name`, `frame=0`, served resolved rounds for points states
- `src/index.css` — phone arena, compact HUD, density, compact Combat Calculation band, glow-bleed fix
- `e2e/ranked-arena-fit.spec.ts` — RMOB2 suite (below)

## Tests
- `e2e/ranked-arena-fit.spec.ts`:
  - **RMOB2 one-screen** 7 phones × 10 shapes: match bar within width; timer inside bar; names/status never spill or hard-cut (ellipsis only); exactly 2 bubbles per player; desktop header/rail not drawn; bottom bar within width; Report/Rules inside the bar and not over the timeline; no mascot art in them; 5 visible nodes incl. current; no nested scroll; no sideways page scroll; answers inside parchment; no media spill; `scrollHeight ≤ clientHeight` for ordinary shapes everywhere and stress shapes at ≥812px tall.
  - **RMOB2 compact phone HUD**: 40px row, every control still hit 3.5px above and below its visible box.
  - **360×740 floor**: Stress B scrolls the page whole, nothing clipped (replaces the old "390×844 scrolls" test, which encoded the retired scrolling design).
  - RMOB1's dock-clearance and duel-strip tests removed (superseded); RMOB1 phone correctness loop kept.
  - Mutation check: removing the glow-bleed fix fails the one-screen suite (`page scrolls sideways: 4`).
- Vitest new: `MobileMatchBar` (5), `roundTimeline.window` (6), `MogzyDock.tabHost` (3), `rankedViews.viewerName` (3).
- Results: see "Test results" below.

## Test results
- **Arena fit suite** (`npx playwright test -c playwright.arena.config.ts`, desktop + phone): **366 passed, 0 failed** (12.5m).
- **RMOB phone subset** alone: 156 passed.
- **Vitest** (`src/components/ranked-arena`, `src/pages/quiz-ranked`, `src/pages/dev/ranked-shell-probe`, `src/lib/ranked-core`): 1439 passed, 1 failed in a run executed alongside Playwright — `QuizRankedMatch.rm1Feedback` "timed-out module", which passes **15/15 on two serial reruns** (load contention, not a regression). Serial run of the three arena/page/probe dirs before the new tests: 988/988.
- **Vitest** (`mogzy-dock`, `ranked-rules`, `report`, `hud`, `question-surface`, `audio`, Layout/Friends, `Quiz.rankedRole`): 502 passed, 2 failed — both **fail identically on clean `0f23467c`** (`AcademyRadioControls` "hangs directly below the Radio control", `Quiz.rankedRole` "commits NOTHING for Practice after a role change").
- **New vitest**: 17 tests across 4 files, all passing.
- **tsc** (`tsconfig.app.json`): error set identical to clean main (12 pre-existing, unrelated files).
- **`npm run build`**: passes (exit 0; prerender verify: 173 champion URLs). The first build attempt died on ENOSPC (disk full, machine-wide); rerun after space was freed, no code change.

## Unresolved / compromises
- **Opponent display name** needs the backend projection change above.
- Long usernames truncate with an ellipsis at ≤390px (e.g. `Kalista_Enjo…`, 15 chars); the full name is in the element's `title`.
- The cinematic hero's tiny build-path node labels (`SHEEN`/`PHAGE`) are small at 116–127px — they were already small (~139px); the item title and art stay clear.
- Meta Reflex has no Report tab (that module never publishes a reportable question — pre-existing), so the timeline takes the left side of the bar.
- Meta Reflex parchment now fills the screen with the comparison centred (large calm margins); cards unchanged.
- The Community button and the radio nudge are suppressed during a phone Ranked match.
- Compact HUD applies to every phone route (by design: the controls are global chrome), hit areas preserved.
- Tablets 640–1023 get the phone arena; the card uses the comfortable hero preset there, so the 7.5rem art cap does not apply (768×1024 still fits one screen). Not separately reviewed.
- Pre-existing, unrelated: `AcademyRadioControls.test.tsx` "hangs directly below the Radio control" fails identically on clean `0f23467c`; tsc error set (12, unrelated files) identical before/after.
- Reveal-beat and hp-match (legacy) states of the bar are unit-tested but not screenshot-reviewed.

## Next task
Owner review on a real phone → integration. Then: backend opponent display name; optionally a phone arrangement for other family bands (only post-mitigation was compacted).
