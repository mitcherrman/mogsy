# UX4 — Worlds 2026: absolutely no scrolling

| | |
|---|---|
| Branch | `ux4/worlds-zero-scroll` (worktree `C:\Users\mlmit\mogzy-wt\ux4-noscroll`), pushed. **Not merged, not deployed, not published** |
| Base | FE `origin/main` `a874b27211393185167b9919911df1200b2fa891` (verified 2026-10-16; the tracked `.env` sets `VITE_WORLDS_EXPERIENCE_ENABLED="true"` and mogzy.lol serves the experience — the "before" evidence in §2 was measured there) |
| Implementation | 10 commits on `a874b272`, `c6b28cba` … **`b20d1643`** (the final code; the verification-driven fixes are separate commits) |
| This handoff | the branch tip (docs + evidence commit on top) |
| Scope | Frontend only. No backend, Railway, Supabase, data-contract or `.env` change. No flag change |
| Status | **STOP for command-center review** |

## 1. Result

The Worlds experience (Overview, Stages: Play-In / Swiss / Knockouts, Teams, Schedule, match and team details, phone sheets, loading and error states) is a fixed-screen application at every tested size:

- the document never scrolls (its height is exactly the viewport) and is locked while the experience is mounted;
- no element inside the frame is a scroll container, and no box hides content (checked by measurement in a real browser on every screen, every data state, 7 viewports);
- everything that does not fit at once is reached through visible controls: pages ("Matches 5–8 of 8"), view tabs, round/region controls, previous/next day, an "All dates" picker;
- the Footer and the floating Community button are not rendered inside the experience; both are unchanged everywhere else, and the lock is released on the way out.

## 2. Scroll root-cause inventory (main `a874b272`, before)

Measured on the published mogzy.lol with the same audit (`docs/handoffs/ux4/before-audit.json`):

| Viewport | Document height (visible) | Notes |
|---|---|---|
| 1440 × 900 | 1250 px (900) on every screen | Footer (~350 px) below a viewport-tall frame |
| 1280 × 600 | 1026 px (600) on every screen | Footer, plus the frame's `min-h-[620px]` |
| 390 × 844 | 1419–2438 px (844) | phone frame was a `min-h` scrolling column; Overview 2438 px |

| Cause | Where | Replacement |
|---|---|---|
| Footer rendered under the frame | `Layout` → `Footer` | Footer hidden on the flagged Worlds surface and the dev prototype only (`Footer.tsx`) |
| Desktop frame `h-[var(--app-viewport-h)] min-h-[620px]` | `WorldsExperience.Frame` | `h-[var(--app-viewport-h)]`, no minimum, `overflow-clip`, safe-area bottom inset, at every width |
| Phone frame `min-h-[var(--app-viewport-h)]`, sticky bar, `pb-24` columns | `Frame`, every phone screen | the same fixed frame; bar in flow; screens composed to fit |
| `window.scrollTo({top:0})` on phone screen change | `Workspace` | removed (nothing to scroll) |
| Overview `h-full overflow-y-auto` + grid `min-h-[600px]` | `OverviewScreen` | fit cascade: 2-row grid → one-row short-desktop layout; phone: hero + views |
| Overview "Coming up" `overflow-y-auto` | `ComingUp` | paged list of every upcoming fixture (and every result) |
| Stage area `overflow-auto` (`stage-scroll`) | `StagesScreen` | removed; each stage fits (§4) |
| Play-In `min-w-[860px]`, phone round chips `overflow-x-auto` | `PlayInWorkspace` | whole → tight → regions → one round; phone round tabs in one row |
| Swiss `min-w-[800px]`, phone `RoundTabs overflow-x-auto`, phone column | `SwissWorkspace` | whole map → compact → Map / Round views; phone round grid + views |
| Knockouts `min-w-[760/860px]`, phone stacked rounds | `KnockoutWorkspace` | whole → tight → round focus; phone round focus |
| Match detail / stage brief `overflow-y-auto` | `MatchDetail` | compact → two views ("Match", "What it decides"); brief compacts |
| Teams selector `overflow-y-auto`, TeamFocus body `overflow-y-auto`, phone region chips `overflow-x-auto` | `TeamsScreen` | grouped → grid → paged selector; team body two-column → three views; chips wrap into a grid |
| Schedule date rail `overflow-x-auto` + `scrollIntoView` | `ScheduleScreen` | windowed date bar around the selected day + previous/next + "All dates" picker |
| Schedule board `overflow-y-auto` (`schedule-scroll`), phone stage filter `overflow-x-auto` | `ScheduleScreen` | fixtures paged to the board's measured height; filter fits one row |
| Bottom sheet `max-h-[86dvh] overflow-hidden` with scrolling children | `Detail.BottomSheet` | capped, `overflow-clip`; content compacts / divides into views |
| Experience loading / error states inside a `min-h-screen` column | `ProPlayTournament` | the same fixed frame and lock (`ExperienceFrame`) |
| Floating Community button over the fixed frame's corner | `Layout` | not rendered on the experience (§7) |
| Multi-line status strip (one row per notice) | `StatusStrip` | one line: full text where it fits, else a short form with "Details"; several notices stepped "1 / 3" |

## 3. How it fits (the toolkit, `worlds-experience/fit.tsx`)

- **`FitCascade`** — a component's compositions from spacious to compact; after each commit (layout effect, before paint) it measures its box and steps down while the content overflows. Re-runs from the top when the box resizes or the content changes. The last level is the design's floor.
- **`FitPages`** — a list shows as many rows as its region holds (measured region height ÷ measured row height, grid columns read from the first row) and pages the rest with a visible pager (`Matches 1–4 of 8`, Previous / Next, `aria-live`). A selected item's page is the one shown; paging away from it closes the detail; a new day/filter starts on page 1. The page size is derived from real space, never hard-coded.
- **Nested fits** — a box inside a clipped box cannot be seen by its parent's measurement, so an inner cascade that ran out of levels (or a list that cannot hold its minimum rows) marks itself `data-fit-exhausted` and asks the enclosing cascade to re-check; the parent treats it as its own overflow. This is what lets e.g. the Overview switch to its short layout because the Coming-up list can't hold two rows.
- **`overflow: clip`, not `hidden`** — clip boxes are not scroll containers; not even focus or `scrollIntoView` can scroll them.
- **`viewportLock.ts`** — reference-counted `html.worlds-viewport-locked` (`overflow:hidden; overscroll-behavior:none`), added by the frame, the loading and the error frames, removed on unmount; resets a carried-in scroll offset to 0. It is the backstop, not the fit.
- **`ViewTabs`** — the explicit control for content divided into views (arrow keys, `role=tab`, abbreviated labels carry their full name as `aria-label`).

Without a layout engine (jsdom) nothing measures: the first composition and whole lists render, which is what the existing unit tests read.

## 4. Layout decisions, per screen

**Shell.** Command bar unchanged (desktop 56 px; phone 44 px identity row + 5-tab nav). Phone phase chip says it in fewer words ("Play-In now") so it no longer collides with the title at 360 px. Status strip is one line.

**Overview.** Desktop tall: hero (3 densities) over At stake + Results & fixtures, road rail beside (3 densities). Desktop short (1280×600): one row — hero · [Fixtures | At stake] views · road. Tablet: hero + three panels. Phone: hero + [Coming up | At stake | Road] views; the shortest phones (360×640) make the hero a view too: [Now | Fixtures | At stake | Road]. Coming up / Results page through every fixture (43 upcoming today), not a truncated three.

**Play-In.** Whole bracket (1440+), tighter bracket, then **regions** (Upper · Lower · Final, each with its own winner-edge connectors; every card keeps its "Winner → / Loser →" line), then one round at a time (1280×600). Phone: round tabs `UB SF · UB F · LB SF · LB F · Final` (full names as accessible names), `?step=` in the URL as before; the Final step shows the Swiss end cap.

**Swiss.** Whole pool map + the round's pairings (1280×800+); compact map; then **views** `Pool map | Round N fixtures` sharing the round selection (round heads in the map), legend beside the tabs, outcomes in two columns at the floor. Phone: 5-column round tabs, views `Fixtures · Records (Seeding before a result) · Format`; Format splits into pools / outcomes if needed. No standings → `Matches | Seeding` views with every served match paged (was the published page's long Swiss stage).

**Knockouts.** Pre-draw schematic (honest unassigned slots, times, venue, "set by the draw") whole → tight → round focus `Quarterfinals · Semifinals · Finals`; drawn bracket = the published `SingleElimStage` whole, else round focus with the same cards; champion banner only when certified. Phone: round focus always.

**Teams.** Desktop selector: grouped by region where it fits; else one grid (tiles say their region); else paged. Field view: 3 densities down to compact chips. A team: two columns (way through Worlds + matches paged | lineup + region mates), else views `Overview · Matches · Lineup` — all from served data (path, matches, certified lineup or the honest uncertified note, region mates). Phone: region chips in a 4-column grid, 4/5-column crest tiles (entry chip and standing as marks; name, region, entry and standing in the accessible name); all 19 on one page at 360×640; team sheet has a fixed height with the same three views.

**Schedule.** Stage filter in one row (phone: label over count). Date bar shows as many match days as its width holds around the selected day (stage label over each run, gaps marked), Previous / Next match day, and "All dates" (a 7-column grid of all 19 match days, stage-coloured) when not every day is in the bar. Board pages fixtures to its height; `?match=` opens on the match's day **and page**.

**Details.** Match detail: spacious → compact → two views ("Match" | "What it decides"); header and footer (Match centre, Show in Stage / Schedule, the Match Centre note) always visible. Stage/Day brief compacts. Phone sheets: capped at `min(88dvh, 46rem)`, `overflow-clip`, safe-area inset; focus trap, Escape, overlay, drag-down and Back still close them.

## 5. Files

| File | Change |
|---|---|
| `worlds-experience/fit.tsx` | **new** — `FitCascade`, `FitPages`, `Pager`, `ViewTabs`, nested-fit propagation |
| `lib/pro-play/worldsExperience/viewportLock.ts` | **new** — document lock |
| `worlds-experience/WorldsExperience.tsx` | fixed frame + lock; compact bar in flow; one-line status strip with Details / stepping; phone phase chip; no scrollTo |
| `OverviewScreen.tsx` | densities, short-desktop and phone layouts, paged fixtures/results |
| `StagesScreen.tsx`, `PlayInWorkspace.tsx`, `SwissWorkspace.tsx`, `KnockoutWorkspace.tsx` | per §4 |
| `TeamsScreen.tsx`, `ScheduleScreen.tsx` | per §4 |
| `Detail.tsx`, `MatchDetail.tsx` | fixed-height column and sheet; detail views; brief compacts |
| `pages/pro-play/ProPlayTournament.tsx` | experience loading / error in the fixed frame (`ExperienceFrame`, `TournamentError`); flag-off rendering unchanged |
| `components/Layout.tsx` | no floating Community trigger on the experience (flag-gated path + dev prototype) |
| `components/Footer.tsx` | hidden on the flag-gated Worlds surface + dev prototype |
| `index.css` | `html.worlds-viewport-locked` rule |
| tests | `fit.test.tsx` (new, 11), `FixedViewportPaging.test.tsx` (new, 4: deep link to a match's day **and page**, paging closes the detail, last fixture/team reachable), `Footer.ux4.test.tsx` (new, 10), `WorldsExperience.test.tsx` (phone layout rewritten for the new controls + fixed-viewport tests: lock/release, no scroll containers on any screen at either layout, frame geometry, one-line notices), `App.ux3aRoutes.test.ts` (the gate's second, gated use in Layout) |

Data authority, `navigation.ts` URL model, `ExperienceContext` history rules, `tournamentApi`, `featuredTournament.ts`, App routes and the UX3C rollback redirects are **unchanged**.

## 6. Evidence

All browser runs: headless Edge against a **production build** (`vite build`, flag on) served by `vite preview`; every page in a fresh context. Logs and screenshots: `docs/handoffs/ux4/`.

### 6.1 The audit (run on every page and state)

For each page, before and after deliberate scroll attempts:
- document `scrollHeight ≤ clientHeight` and `scrollWidth ≤ clientWidth`;
- no element with `overflow: auto|scroll` whose content exceeds it; no element with any non-zero `scrollTop/scrollLeft`;
- no `hidden|clip` box whose content exceeds it (= hidden content); text truncated with an ellipsis is listed separately and reviewed;
- no leaf, button or link outside the viewport or below the frame;
- no control overlapping another control, and **no text running under a control** (modal sheets/popovers over the page excluded);
- no control spilling its own content; the title and phase chip included;
- the frame seen is the experience (or its error frame), never the loading frame; any page error fails the page;
- scroll attempts: wheel down/up/sideways, Space, PageDown, End, ArrowDown, and touch scroll gestures (CDP synthesized) on touch viewports — afterwards the window and every element must still be at 0.

### 6.2 Every screen × every data state × every viewport

12 data states: live production data (Play-In in progress on 16 Oct) and 11 controlled states served to the production route (the prototype's scenario bodies, clock pinned to each): Play-In live, Play-In complete, Swiss mid-R3, Swiss mid-R5, Knockouts drawn, Knockouts live, Worlds complete, partial (40/46), standings unavailable, stale copy, schedule unavailable. 6 screens each (Overview, Play-In, Swiss, Knockouts, Teams, Schedule).

| State | 1920×1080 | 1440×900 | 1280×800 | 1280×600 | 1024×768* | 768×1024 | 390×844 | 360×640 |
|---|---|---|---|---|---|---|---|---|
| each of the 12 states | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 |

- **504 / 504** on the 7 required viewports, build `2f264fe7` (`sweep-<vp>.log`).
- *1024×768 (desktop's narrowest; not in the brief's list): 68/72 on `2f264fe7` — the Teams field view with a status notice was 26 px too tall. Fixed in `b20d1643`; Teams + Schedule then re-run in all 12 states at all 8 viewports on `b20d1643`: **192 / 192** (`teams-schedule-recheck-<vp>.log`). `b20d1643` changes only those two screens.
- `sweep-summary.json` lists the per-page results.

### 6.3 Interactions, details and navigation (`i7.log`, build `b20d1643`) — **197 / 197** at 8 viewports

Per viewport: Schedule deep link to the **last fixture of the busiest day** (`?match=` of Swiss R1 #8) opens on its day and its page, selected, detail open; survives a refresh; Escape (desktop) / Close (phone sheet) closes it; Previous/Next pages reach the last fixture; the "All dates" picker reaches the last match day; Teams: the last team (FUR) is reachable through the pages, its detail opens (desktop panel / phone sheet) and each team view (Overview · Matches · Lineup) fits; Back closes it; Play-In, Swiss, Knockout final and QF1 match details fit (incl. the "What it decides" view); Back/Forward across Stages → Teams → Schedule; wheel/keys/touch after navigation move nothing; keyboard (Arrow along the nav, Enter) opens Stages and Space/PageDown don't scroll; leaving via "Back to Pro Play" releases the lock, the hub scrolls and the Footer is back; no page errors. Every intermediate state is audited (§6.1).

Reduced motion (`reducedMotion: reduce`, 1440×900 and 390×844): **51 / 51** (`i5rm.log`; workspace `data-motion="reduced"`).

### 6.4 Flag on / off and the rest of Mogzy (`regress.log`) — **28 / 28** (1440×900, 390×844)

- **Flag off** (build with `VITE_WORLDS_EXPERIENCE_ENABLED="false"`): the published `TournamentV2` at the Worlds URL, with the Footer, no lock, scrolling normally; `/stages/play-in|swiss|knockouts`, `/teams`, `/schedule?match=` → canonical URL (UX3C, unchanged); `/discover` still 404.
- **DCGI** unchanged with the flag on and off (published page, Footer, scrolls, no lock).
- **Hub**: scrolls with Footer; the featured Worlds pill opens the experience (locked, no Footer, at 0); Back returns to a scrolling hub with its Footer; HUB-NEXT1 `?next=` links render the hub.
- Both builds inline the flag as expected (`VITE_WORLDS_EXPERIENCE_ENABLED:"true"` / `"false"`). No prototype or simulated data in the production bundle (`Prototype data`, `scenarioClock`, `Not real Worlds 2026 data`, `scenario-picker`, `play-in-live`, `worldsScenarios`: 0 files).

### 6.5 Before (published main) — `before-audit.json`

Document 1250 px in a 900 px window (1440×900), 1026/600 (1280×600), 1419–2438/844 (390×844); internal scrollers on Overview "Coming up", the Stage area and others (§2).

### 6.6 Unit tests, types, lint, builds (on `b20d1643`)

| | `main` `a874b272` | branch |
|---|---|---|
| Focused Vitest (pro-play pages/lib/components, hub, Layout, Footer, dev prototype, UX3A routes), default env (tracked `.env` = flag on) | 1918 passed / 30 failed | **1953 passed / 30 failed — the same 30** (flag-off suites that the tracked `.env` turns on) |
| Same suites with `VITE_WORLDS_EXPERIENCE_ENABLED=false` | 699 / 699 | **709 / 709** |
| Worlds experience suites | 100 | **125** (fit toolkit 11, paging with measured layout 4, phone layout rewritten for the new controls, fixed-viewport 9) |
| `tsc --noEmit -p tsconfig.app.json` | 2 pre-existing | **same 2** (`OnboardingProfile.tsx:180`, `identity/connections.ts:263`) |
| ESLint (touched files) | — | 0 errors, 8 warnings (`react-refresh/only-export-components`, the files' existing pattern) |
| `vite build`, flag on and off | ok | ok |

### 6.7 Defects found by this verification and fixed

The browser audit found real problems that unit tests could not; each was fixed and re-verified:
- a **render loop** (React #185, page crash) in `FitPages` when wrapped rows differ in height — reproduced in a unit test that fails on the old code;
- match-detail text **running under the footer** buttons (a shrinkable flex body hid its overflow from the measurement) at 1280×600;
- the phone title colliding with the phase chip at 360/390 px; knockout card names truncating in a two-column phone grid; the "All dates" picker taller than a 600 px screen; a date label widening its cell past the bar; nested panels whose overflow the parent couldn't see (fixed by exhaustion propagation); text measured before web fonts loaded.

### 6.8 Screenshots (`docs/handoffs/ux4/`)

Overview 1920/1440/1280×600/768/390/360; Play-In 1440 (whole) and 1280×600 (round focus); Swiss mid-R3 1920 (map + pairings) and 1280×600 (views); Knockouts 1440 (schematic) and live 1280×600 / 360 (round focus); Teams 1440, 1280×600, 390, 360; Schedule 1440, 768, 390, 360; complete 1440, schedule-unavailable 360, stale 1280×600; details: schedule deep link 1440 / 390 (sheet), "All dates" picker 1280×600, team FUR 1440 / phone Matches view, Play-In match 1280×600 / 360; flag-off published page 1440.

## 7. Remaining limitations and release concerns

**Release concerns (owner decisions)**

1. **No Footer and no Riot disclaimer on the experience's screens** — as the brief requires. Privacy, Terms, Security and the disclaimer remain on every other page (and on the published Worlds page with the flag off). If legal wants the disclaimer on every screen, it needs a one-line home inside the frame (e.g. the Day/Stage brief or the Details popover), not the Footer.
2. **The floating Community button is not shown on the experience** (`Layout.showFriendsDrawer`), like the Card Duel tabletop and the admin console. On a fixed screen it permanently covered the bottom-left corner, where pagers and steppers live. Community stays reachable from every other page; the HUD is unchanged. Reversible in one line if unwanted.
3. **Page sizes depend on the device**: "Matches 3–4 of 8" on one screen is "1–6 of 8" on another. Only the selection (`?match=`, `?team=`, `?day=`, `?step=`, `?round=`) is in the URL, never a page number; a shared link opens on the page holding its selection.
4. **`origin/main` moved during this work** to `f6e5f6ca` (PT5 slice, JUX1-F1, PGM1; 102 files). The only file both sides touch is `src/index.css` (different regions); `git merge-tree` of this branch with `f6e5f6ca` is clean. The branch is not rebased or merged; verification here is against `a874b272`.
5. The experience chunk grows from 147 KB (UX3A) to 181 KB (fit toolkit, extra compositions). It is still lazy and never requested with the flag off.

**Limitations**

- ~~**Landscape phones (e.g. 844 × 390) do not fit.**~~ Done in the UX5 follow-up (§9, branch `ux5/worlds-landscape-phones`).
- Safe-area insets are applied (`env(safe-area-inset-bottom)` on the frame, sheets and error/loading frames) but headless Chromium reports 0, so they are verified by code review only, not on a notched device.
- Very large text (the app's `large-text` setting, browser zoom > 100 %) is handled by the same measurements (compositions step down, pages shrink) but was not part of the browser matrix.
- Text that is still single-line-truncated by design: the published `BracketMatchCard` match name on a narrow bracket column (e.g. "Quarterfinal 1 · Bo5" in a two-column desktop round focus); the full name is in the match detail one tap away.
- Desktop vs phone layouts still switch at 1024 px (unchanged): 768 × 1024 tablets get the phone compositions with more room (all panels at once where they fit).
- The flag-on v1 fallback at the Worlds base URL (a v1 body served for Worlds, not expected) renders the published page without the Footer, because the Footer is hidden by path while the flag is on.
- Test environment: the tracked `.env` now enables the flag, so 30 flag-off tests fail on **both** `main` and this branch when run with the default env (identical lists); run with `VITE_WORLDS_EXPERIENCE_ENABLED=false` they all pass on both (§6).

Flaky check, not reproduced: one earlier interaction run had "Back closes the team" fail once at 1280×800 under heavy machine load; it passed on the immediate rerun and in the final run (197/197).

## 8. Machine notes

Same workarounds as UX3A/UX3B: esbuild-JSX scratch configs and the rollup wasm hook (shared swc and native rollup are blocked here); builds with `vite build` (no pnpm). The flag-off build used for §6.4 is from `15bf752c`; later commits change only files inside the experience's lazy chunk, which a flag-off build never requests. Browser runs: headless Edge (Playwright, `channel: "msedge"`) against a `vite preview` of the production build (flag on) on `[::1]:5291`; simulated states served to the production route by intercepting `/api/live-esports/tournament/worlds-2026` with the prototype's scenario bodies and pinning the clock to each scenario's own time.

## 9. UX5 — landscape phones (follow-up)

| | |
|---|---|
| Branch | `ux5/worlds-landscape-phones` (worktree `C:\Users\mlmit\mogzy-wt\ux5-landscape`), off `ux4/worlds-zero-scroll` `589e1312`. Pushed. **Not merged, not deployed, not published** |
| Implementation | `09476397` (code + `LandscapePhone.test.tsx`); this section and `docs/handoffs/ux5/` on top |
| Scope | Frontend only, inside the experience's lazy chunk plus one opt-in field on the shared `BracketMatchCard` selection context. No data, URL, desktop or portrait composition change |

### 9.1 Before

`589e1312` at 844 × 390: **69 / 72** pages failed the §6.1 audit (every screen clipped in every state; the 3 passes were the schedule-unavailable state's near-empty Play-In, Knockouts and Schedule screens). At 740 × 360 (Swiss mid-R3, the one state measured there before) all 6 screens failed. Cause: the HUD band (56 px) + the two-row compact bar (88 px) left ~250 px (~210 px with a status notice) for compositions designed for a portrait column.

### 9.2 What a landscape phone gets

`LANDSCAPE_QUERY = "(orientation: landscape) and (max-height: 560px)"`, below the desktop width only (`x.landscape`, never with `x.desktop`; tests pin it with the `landscape` prop like `desktop`). Every composition below is still measured by `FitCascade` / `FitPages`; nothing is hard-coded to a device.

- **Shell.** One-row command bar (44 px): back · identity · the five destinations · phase. Status strip 36 px (its pager buttons are 36 px).
- **Overview.** The hero beside one panel; the panels are views `Coming up · Results · At stake · Road` (fixtures and results are views of their own so the list keeps the panel's height; "Full schedule" is an icon link at the end of the row). Where that does not fit (in the sweep: the between-stages heroes, and 740 × 360 under a status notice), the hero becomes the first view, **Now**, in a two-column wide form (who plays | when, countdown and actions; transition, champion and quiet heroes likewise) and the panel spans the width (fixtures two abreast). The road runs left to right.
- **Stages.** A 164 px column of the three stages (dates dropped at the tightest level) with the one-line brief and the **Format** sheet beneath; the stage's own phone presentation gets the rest. Swiss: round tabs and `Fixtures · Records · Format` share one row; pairings are one line, two abreast. Play-In / Knockouts: the round's heading shares the pager's row (`FitPages head`), bracket cards put both sides **abreast** (`BracketSelection.abreast`, opt-in — the published page never sets it), the certified champion sits beside the round tabs. The no-standings Swiss fallback drops its format paragraph there (the Format sheet has it).
- **Teams.** All region chips in one row; ten crest tiles per row (19 teams on one page); the team sheet puts identity, status and Team profile in a column beside `Overview · Matches · Lineup`.
- **Schedule.** Stage filter (2 × 2) and the day header in a column; the date bar and the fixtures beside them, fixtures one line each, two abreast. Date cells drop the month line (the day header and each cell's label say it). "All dates" opens as two rows of ten.
- **Sheets.** Up to `calc(100dvh − 0.5rem)` tall and 48 rem wide (match detail divides into its views as before).

### 9.3 Evidence (production build of `09476397`, flag on, headless Edge, §6.1 audit unchanged)

- **Sweep: 720 / 720** (`ux5/sweep-summary.json`) — 10 viewports (844 × 390, 740 × 360 and the UX4 set 1920 × 1080, 1440 × 900, 1280 × 800, 1280 × 600, 1024 × 768, 768 × 1024, 390 × 844, 360 × 640) × 12 data states × 6 screens. Landscape viewports run as phones (`isMobile`, touch; touch scroll gestures included).
- **Interactions: 251 / 251** at the same 10 viewports (§6.3 script: deep link to the last fixture of the busiest day and its page, refresh, close, paging, All dates, last team and its three views, Play-In / Swiss / Knockout details and the "What it decides" view, Back / Forward, keyboard, leaving releases the lock).
- **Reduced motion: 79 / 79** (1440 × 900, 390 × 844, 844 × 390).
- **Unit tests:** Worlds experience suites **139 / 139** (UX4's 125 + 14 in `LandscapePhone.test.tsx`: one-row bar, portrait unchanged, desktop never landscape, each screen's side-by-side composition, sheets, no scroll containers). Focused suites (pro-play pages / components / lib, dev prototype) with `VITE_WORLDS_EXPERIENCE_ENABLED=false`: **1788 / 1788**; with the tracked `.env` (flag on): 1759 passed / 29 failed — the **same 29** flag-off tests fail on `589e1312` (1745 / 29, identical list).
- `tsc --noEmit -p tsconfig.app.json`: the same 2 pre-existing errors only.
- Experience chunk 183 KB → 200 KB (still lazy, never requested with the flag off).
- Desktop and portrait unchanged: the fixed-clock scenario captures at 1920 × 1080, 1440 × 900 and 1280 × 600 are pixel-identical to UX4's (`docs/handoffs/ux4/`); the two 360 × 640 ones differ only in the pulsing live dot and a crest that loaded this time.
- Screenshots: `docs/handoffs/ux5/` (`before_*` from `589e1312`; `<vp>_*` live data on 16 Oct; `<state>_<vp>_*` simulated states; sheets, picker and details from the interaction run).

### 9.4 Limitations

- Landscape is decided by height (≤ 560 px) and orientation, below 1024 px wide. A landscape tablet taller than 560 px (e.g. 960 × 600) keeps the portrait phone compositions, as before; not in the matrix.
- 740 × 360 with a status notice is the tightest case: Schedule fixtures and Swiss pairings show 4 per page there (6 otherwise; the Overview's side-by-side list shows 2); every item stays one Next away.
- Bracket card match names still truncate in the narrow two-column cards ("Quarterfinal 1 · B…", §7); the full name is in the detail.
- The global HUD band (56 px) is unchanged; reclaiming it on landscape phones (as Ranked does) would be a shell decision outside the experience.
- Not checked on a physical device (headless Edge, `isMobile` emulation); safe-area insets as in §7.

## 10. UX6 — integration with current main and release verification

| | |
|---|---|
| Main | `origin/main` `c5521d3e` (PGM2 handoff; includes PT4.4/PT5 Perfect Timing, JUX1-F1 board attention, PGM1/PGM2 More Challenges, Daily and Ranked changes). Merge base was `a874b272`: 25 main commits, 138 files |
| Merge | `64667265` — `origin/main` merged into `ux5/worlds-landscape-phones` (normal `--no-ff` merge, no rebase, no force). PR #52 stays the release PR |
| Conflicts | **None.** The only file both sides touch is `src/index.css`, in different regions (main removed Journey JATTN1 keyframes / rules; UX4 + UX5 add 11 lines for `html.worlds-viewport-locked`). Checked: the merged stylesheet's delta from main is exactly the branch's original delta. Main changes no shell file (`Layout`, `GlobalHud`, Footer, viewport variables); its Perfect Timing `useFixedViewport` (inline `overflow` on `html`/`body` + hidden `#root`) is per-route and independent of the Worlds lock class |
| Fixes needed | None. No source change after the merge |

### 10.1 Evidence (all on the merged code `64667265`; production builds, headless Edge, §6.1 audit unchanged)

- **Zero-scroll sweep: 720 / 720** — 10 viewports (844 × 390, 740 × 360, 1920 × 1080, 1440 × 900, 1280 × 800, 1280 × 600, 1024 × 768, 768 × 1024, 390 × 844, 360 × 640) × 12 data states (live 16 Oct + Play-In live/complete, Swiss R3/R5, Knockouts drawn/live, complete, partial, standings unavailable, stale, schedule unavailable) × 6 screens. Landscape phones as `isMobile` + touch with touch scroll gestures. 718 / 720 pages reach **exactly the same fit levels and page sizes** as UX5's run; the two that differ are live-data Overviews (the live schedule moved on since UX5's capture). Ellipsis truncations: the identical list to UX5 (§7, §9.4).
- **Interactions: 251 / 251** at the same 10 viewports — schedule deep link to the last fixture of the busiest day opens on its page with its detail, survives refresh, closes (Escape / Close); Previous/Next paging to the end; "All dates" picker; the last team (FUR) through the pages, its detail and its three views; Play-In / Swiss / Knockout final and QF1 details incl. "What it decides"; Back/Forward across Stages → Teams → Schedule; keyboard; wheel/keys/touch move nothing; leaving via "Back to Pro Play" releases the lock (hub scrolls, Footer back). Every intermediate state audited.
- **Reduced motion: 79 / 79** (1440 × 900, 390 × 844, 844 × 390; workspace `data-motion="reduced"`).
- **Flag on / off and HUB-NEXT1: 28 / 28** (1440 × 900, 390 × 844) — flag off: published `TournamentV2` at the Worlds URL with Footer, no lock, scrolling; `/stages/*`, `/teams`, `/schedule?match=` → canonical URL (UX3C rollback links); `/discover` 404. DCGI unchanged with the flag on and off. Hub scrolls with Footer; the featured Worlds pill opens the locked experience without Footer; Back restores the hub's scrolling and Footer; HUB-NEXT1 `?next=` renders the hub. Both builds inline the flag as expected; no prototype / scenario strings in either bundle.
- **Other Mogzy pages vs main** (new check, main `c5521d3e` build vs merged build, both flag on; 1440 × 900, 390 × 844, 844 × 390): `/lol`, `/lol/pro-play`, `/quiz/more-challenges`, `/quiz/journeys`, DCGI, `/lol/patch-reports`, `/quiz/ranked`, `/quiz/daily-challenge` — **24 / 24** same document height, `html`/`body` overflow, Footer and scrolling as main, never locked; first-screen screenshots pixel-identical except animation frames (the levitating mascot on `/lol`, HUD shimmer at 844 × 390). In-app navigation away from Worlds through a HUD link: lock released and the page scrolls; Back returns to a locked Worlds at 0; Back again restores the scrolling hub with its Footer. 36 / 39 checks; the 3 "misses" were the harness expecting a Footer on `/lol`, which has none on main either (state otherwise identical to main) — not a regression. No page errors.
- **Unit tests** (esbuild-JSX scratch config, chunked; main `c5521d3e` detached checkout vs merged):

| Chunk | main `c5521d3e` | merged `64667265` |
|---|---|---|
| Pro-play pages / components / lib, Worlds dev prototype, Layout, Footer, `App.*` routes, LolHub, HUD — tracked `.env` (flag on) | 2136 / 32 failed | **2185 / 32 failed — identical list** (29 flag-off suites the tracked `.env` turns on + 3 historical `App.routeGuards` / `App.routing-contract`) |
| Same, `VITE_WORLDS_EXPERIENCE_ENABLED=false` | 2165 / 3 failed | **2214 / 3 failed — identical** (the 3 historical) |
| Worlds experience suites (flag on and off) | — | **139 / 139** both |
| Main's new areas: Perfect Timing, More Challenges, public modes, Daily run, Ranked, admin PT/playtests, LeaguecraftHub | 1695 / 0 | 1694 / 1 → **15 / 15 on 3 reruns** (`QuizRankedMatch.rm1Feedback` "timed-out module", timing-sensitive under the concurrent browser sweep; the branch touches nothing it imports) |
| Every test that reads `src/index.css` (47 files) | 1244 / 19 failed | **1244 / 19 failed — identical list** (CRLF working-copy stylesheet regexes, see the CRLF note in the machine notes) |

- `tsc --noEmit -p tsconfig.app.json`: the same 2 pre-existing errors on main and merged. ESLint on the 23 branch-touched TS files: 0 errors, 8 warnings (`react-refresh/only-export-components`, as before).
- `vite build` flag on and off: both succeed (~50 s each with the wasm rollup hook). Experience chunk 200 KB (unchanged from UX5), lazy, never requested with the flag off.
- **PR #52 CI** on `5ee2af7d`: `phone-playwright`, `measure`, `mobile-fit` — all **success** (path-triggered workflows; none Worlds-specific). The merge push triggers fresh runs; see the PR.
- Screenshots (`docs/handoffs/ux6/`, merged build): live Overview 1440 × 900 and 844 × 390, live Teams 390 × 844; Swiss R3 Schedule 740 × 360; Knockouts live 1280 × 600; stale Schedule 360 × 640; the deep-link sheet at 844 × 390, team FUR Matches at 740 × 360, "All dates" picker at 1280 × 600; flag-off published page 1440 × 900. `ux6-summary.json` has per-viewport counts and every regression / other-page result.

### 10.2 Known issues and release concerns (unchanged from §7 / §9.4)

- Owner decisions still open from §7: no Footer / Riot disclaimer on the experience's screens; floating Community button hidden there.
- Not checked on a physical device (headless Edge emulation); safe-area insets by code review only.
- Bracket card names truncate in narrow two-column cards (full name in the detail); 740 × 360 with a status notice shows 4 fixtures per page.
- Local test environment: the tracked `.env` enables the flag, so 29 flag-off tests fail with the default env on main and on this branch alike.

### 10.3 Release readiness

The flag is **already on**: main enabled it on 15 Oct (`b5595041`, tracked `.env`), and the published mogzy.lol bundle inlines `VITE_WORLDS_EXPERIENCE_ENABLED:"true"` (checked 16 Oct). Publishing after this merge therefore **replaces the live UX3A scrolling experience with the zero-scroll one at once**. Rollback: revert the merge on main and publish (back to UX3A), or set the flag off and publish (published page + UX3C redirects, verified above).

**GO** for merging PR #52 into main and publishing, conditional on: (1) PR #52's CI on the merge push being green, (2) the owner's acceptance of the §7 decisions (no Footer/disclaimer and no Community button on the experience), and (3) a short post-publish smoke check on the live site (Overview, Schedule deep link, Teams, one landscape phone, leaving restores scrolling), since Play-In and Swiss are live.
