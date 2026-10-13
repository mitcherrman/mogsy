# UX1 — Worlds 2026 premium interactive experience (prototype)

| | |
|---|---|
| Branch | `ux1/worlds-experience-prototype` (worktree `C:\Users\mlmit\mogzy-wt\ux1-worlds`), pushed as a review branch. **Not merged, deployed or published** |
| Base | FE `origin/main` `20a252eca6d43102226f2012e28c25515bb97e30` (PW4-B1), as expected; it had not moved when fetched |
| Route | **`/lol/dev/worlds-experience`** (development builds only; `/dev/worlds-experience` redirects there) |
| Scope | Frontend only. No backend, Supabase, Railway or Lovable change. The published `/lol/pro-play/tournament/worlds-2026`, the hub's Featured link and the 15 Oct switching policy are untouched |
| Status | **Built and verified locally. STOP for owner visual / UX review** |

## 1. Objective and what was wrong with the page

Turn the Worlds page from a long document into a tournament application. UX1 builds the shell for five screens (Overview · Stages · Teams · Schedule · Discover) and implements the first two.

Limitations of the published page (PW4-B, `docs/handoffs/pw4b/worlds-pre-event-1440.png` is 4,291 px tall at 1440 wide):
- Everything is on one page: header, Play-In, field, Swiss, Knockout and a 46-row schedule. The reader scrolls to find where they are.
- There is no notion of "now". The status panel is one card among many.
- Pre-event, the Knockout section is seven TBD cards and the Swiss stage is a seeding grid with an empty rounds tab.
- Bracket cards are links straight to the match centre. There is no in-place detail and no way to follow a slot's origin.
- On a phone the double-elimination bracket stacks into one long column, and the connector lines are dropped.

## 2. Interaction architecture

```
WorldsExperienceDev (dev page: data source, clock, scenario picker)
└─ WorldsExperience (shell)            components/pro-play/worlds-experience/
   ├─ TournamentKitProvider            (PW4-B's kit: ctx, state, names, byCode, byId, now)
   └─ ExperienceProvider               URL ⇄ state, direction, desktop/phone, reduced motion
      ├─ CommandBar                    identity · primary nav · feed / phase status
      ├─ StatusStrip                   one line per degraded source (stale, partial, standings, refresh, unknown)
      └─ Workspace                     AnimatePresence, keyed by screen, slides by direction
         ├─ OverviewScreen             Hero · Road to the Final · At stake · Coming up
         └─ StagesScreen               stage switcher · stage area (local scroll) · context panel / phone sheet
            ├─ PlayInWorkspace         lanes + final + Swiss end cap | phone: round stepper
            ├─ SwissWorkspace          seeding → record-pool map → outcomes; round pairings
            └─ KnockoutWorkspace       pre-draw schematic | published SingleElimStage, selectable
```

**The URL is the state** (`lib/pro-play/worldsExperience/navigation.ts`):

| Part | Meaning |
|---|---|
| `<base>` | Overview |
| `<base>/stages[/play-in\|swiss\|knockouts]` | Stage Explorer. With no stage it opens the stage in play or next (`defaultStageKey`) |
| `?match=<id>` | The selected match (Stages only) |
| `?round=<n>` | The Swiss round shown |
| anything else (`scenario`, `now`) | Carried through every navigation untouched |

A future screen's path (`/teams`) or an unknown stage slug is corrected in place with `replace`. It is never drawn.

**History rules** (`ExperienceContext.tsx`):
- A screen or stage change pushes a new entry.
- Opening a match detail pushes one entry (state `ux1Panel`). Switching matches while it is open replaces that entry. Closing pops it. Back therefore closes the detail, including the phone's back gesture.
- A deep-linked detail closes with `replace`.
- A Swiss round choice replaces the current entry.

**Direction** (`navDirection`):
- between screens it follows screen order (Overview → Stages slides left);
- between stages it follows stage order;
- back/forward produce the mirror image, because direction is read from the previous entry to the current one.

## 3. Navigation decisions

**Desktop (≥ 1024 px)**
- The frame is exactly `--app-viewport-h`: the global HUD band, a 56 px command bar, then the workspace.
- Content that is genuinely larger scrolls inside its own region with `overscroll-behavior: contain`: the stage area, the context panel and the fixture list. The site footer stays below the frame.
- Command bar:
  - left: back to Pro Play, then the Worlds mark and "Worlds 2026";
  - centre: `01 Overview · 02 Stages · 03 Teams · 04 Schedule · 05 Discover`, with a gold ink line that travels between items;
  - right: feed freshness (≥ 1536 px) and a phase chip (`Starts 15 Oct` / `Play-In live` / `Play-In complete` / …).
- Teams, Schedule and Discover are dimmed `aria-disabled` spans with a tooltip. They are not links and not focusable.
- Stage switcher: three wide segments, each with its index, name, Now/Next/Done (only as `stageProgress` certifies), dates, venue and team count. An ink frame slides between them.
- Context panel (360 px; 320 px below 1536 px):
  - with nothing selected, the stage brief: stakes figures, format note, the Play-In four, or the Swiss seeding and Play-In slot, or the qualified teams;
  - with a match selected, the match detail.
  - It never covers the bracket.

**Phone (390 × 844)**
- A sticky compact bar has two rows: identity + phase chip, then the five-slot nav (48 px targets, future slots dimmed).
- The stage switcher is a three-way segmented control (52 px).
- The page scrolls naturally, and the screen scrolls to the top on a screen change.
- The Play-In is a round stepper (`Upper Semifinal › Upper Final › Lower Semifinal › Lower Final › Final`), opening on the round of the live or next match. Each card still states "Winner → … · Loser → …", and previous/next buttons step through.
- Swiss: tier summary (pre-event), R1–R5 tabs, that round's pools with occupants, pairings, then outcome tiles.
- Knockouts: the schematic in two columns.
- Match detail is a Radix dialog bottom sheet. Close button, drag down, overlay tap, Escape and Back all dismiss it, and focus is trapped.
- Horizontal swipe on the workspace moves between the built screens. It is ignored inside `[data-swipe-ignore]` regions (the round rails) and for mostly vertical drags. It is never the only way to navigate.

**Keyboard**
- Arrow keys, Home and End rove along the primary nav and the stage switcher, but only while focus is in them; focus moves, and Enter navigates.
- No global arrow handler.
- Escape closes the desktop detail, except when focus is in a field, dialog, listbox or menu.
- Bracket cards are `aria-pressed` toggle buttons inside the prototype.
- Screen and stage changes are announced in a polite live region.

## 4. Motion specification (`worlds-experience/motion.ts`)

| Move | Distance | Duration | Curve |
|---|---|---|---|
| Primary screen | 56 px slide + fade | 280 ms | `cubic-bezier(0.22, 1, 0.36, 1)` (quick out, soft landing; no spring, no overshoot) |
| Stage | 28 px slide + fade | 240 ms | same |
| Context panel content | 16 px settle (exit −8 px) | 220 ms | same |
| Nav ink / stage frame | `layoutId` travel | 280 / 240 ms | same |
| Live score change | 8 px vertical swap | 200 ms | same |
| Selection | border + glow transition | 200 ms | CSS |

- Entering and leaving content move together (`AnimatePresence mode="popLayout"`). A click is answered on the next frame, not after an exit.
- **Reduced motion** (`useReducedMotion`) removes all travel. What is left is a 120 ms opacity change, plus instant ink moves, no sheet drag and no live-dot pulse. The workspace exposes `data-motion` and `data-direction` for tests.
- Measured in a real browser (headless Edge):
  - 90 ms after clicking Stages, the outgoing screen sits at x = −32 and the incoming one at x = +24;
  - Back from Stages reverses this (+46 / −10);
  - with `reducedMotion: "reduce"` both sit at x = 0.

## 5. Screens

**Overview (01)** at 1440 × 900 is one composed screen. It needs no scrolling at 1440 × 900 or 1280 × 800.

- **Hero** (8 columns) shows one of these:
  - next match: Worlds watermark; both teams with xl crests, 48 px codes, names, region · seed · entry; start in local time with venue; a days/hrs/min countdown; **View in the bracket** (opens Stages with the match selected) and **Match centre** (existing `matchHref`);
  - live: a LIVE badge, an animated series score and "Bo5 · first to 3";
  - between stages: "Play-In complete", when and where the next stage begins, the placed or winning team and the eliminated teams (only as served), and the first match of the next stage with its countdown;
  - champion: only with standings authority;
  - schedule unavailable, with a link to the Swiss seeding.
- **Road to the Final** (right rail):
  - each stage shows its progress (only as certified), dates and venue, and a stakes line such as "4 teams · Bo5 · 1 advances";
  - a dot funnel shows how many go on, and a completed/total bar appears once matches are played;
  - below that, the field by region and "Open the Stage Explorer".
- **At stake**: the stage in play or next.
  - Its size, how many go on and how many go home, all from served structure. Play-In 4 / 1 / 3, Swiss 16 / 8 / 8, Knockouts 8 / 1 / 7.
  - During Swiss, the served counts of advanced, alive and eliminated teams.
  - The format note, the Play-In four, or the qualified eight.
- **Coming up**: the next fixtures by local day. An unnamed pairing reads as its match name, with its sides' origins underneath ("Winner of FUR v MVK · Winner of C9 v KC"). Once results exist, the latest results show first, with their date. Every row opens its match in the Stage Explorer.

**Stage Explorer (02)**
- **Play-In**: the whole double-elimination bracket fits at 1440 × 900 with no scroll.
  - The upper lane is gold-washed and the lower lane neutral, each with a vertical lane label; columns are aligned across lanes.
  - The Play-In Final sits beside them, with a "To Swiss" end cap showing the slot unresolved, won or placed (`playInSwissSlot`).
  - Cards and connectors are the published page's own.
  - The detail panel says what the result decides. Routes come from upstream edges and are clickable. Where a side has no route, the stage's rule applies: "Eliminated", or "Advances to Swiss".
  - Unnamed sides show their origin as a link to the source match.
- **Swiss**: a record-pool map.
  - Seeding tiers (with the Play-In place as `PI` until served) feed 0–0. Round columns hold their pools (1–0 / 0–1, …, 2–2) and lead to outcomes: Through 3–0 / 3–1 / 3–2 and Out 2–3 / 1–3 / 0–3.
  - Win paths are solid gold and loss paths dashed. The selected round is highlighted.
  - Crests sit on a pool only from served records. There is none before the first result, so there is no 0–0 table.
  - Under the map: the round's pairings (selectable), or one line while the draw is unpublished.
  - The map is drawn only when the pool arithmetic reproduces upstream's round sizes (8/8/8/6/3). Otherwise, and without standings, it falls back to the published `SwissStage`.
  - A live decider's detail shows "Played at 2–2 · Winner advances · Loser eliminated".
- **Knockouts**: before the draw, a schematic.
  - Seven compact nodes (name, Bo5, local day/time), connectors along upstream winner edges, and a champion cap with "Brooklyn, NY".
  - One line explains that pairings come from the draw. There are no TBD rows.
  - Once teams are placed, the published `SingleElimStage` is used, selectable, with the champion banner when certified.

## 6. Reused components and data

- **Data**: `tournament_context_v2` through the published page's `useTournament("worlds-2026")` (scenario `live`, the default). There is no new endpoint and no backend change.
- **Logic reused as is**: `tournamentV2View.ts` (names, slots, routes, winner edges, layouts, Swiss rounds and tiers, Play-In slot, freshness, champion) and `tournamentView.ts` (days, `matchHref`, date ranges).
- **Components reused**:
  - `TournamentKitProvider` / `useKit`, `BracketMatchCard`, `Connectors`, `useBracketEdges`, `AuthorityNotice`, `CellList`, `SingleElimStage`, `ChampionBanner`, `SwissStage` (fallback);
  - `TeamCrest`, `EventMark`, `MatchStateBadge` and `ProPlayMediaProvider`.
- **No artwork was invented.** The only art is the existing crests and marks, which fall back to monograms (the FUR and MVK crests are monograms today). Decoration is CSS: gradients, hairlines and a typographic watermark.
- **The one shared-component change** is in `TournamentBracket.tsx` and is opt-in:
  - an exported `BracketSelectContext` (`selectedId`, `onSelect`, `dense`). Inside a provider a card is a toggle button with a selected state, and `dense` puts an upcoming card's start time on its header line (the column label carries the day).
  - Without a provider (the published page) the card renders exactly as before.
  - The other change is exports only (`Connectors`, `useBracketEdges`, `daySpan`, `AuthorityNotice`, `CellList`).

## 7. Files

| File | Change |
|---|---|
| `src/lib/pro-play/worldsExperience/navigation.ts` | new: screens, URL parse/build, direction |
| `src/lib/pro-play/worldsExperience/experienceView.ts` | new: overview focus, stage size / stakes, match onward, Swiss pool map / occupancy / match stakes, countdown |
| `src/components/pro-play/worlds-experience/*` | new: shell, context, motion, Overview, Stages, Play-In, Swiss, Knockout, detail / brief, parts |
| `src/pages/dev/worlds-experience/WorldsExperienceDev.tsx`, `scenarios.ts` | new: dev page, data source, clock, scenario picker |
| `src/components/pro-play/tournament/TournamentBracket.tsx` | opt-in selection context + exports (§6) |
| `src/App.tsx` | DEV-gated lazy import and two routes (`/lol/dev/worlds-experience/*`, `/dev/worlds-experience` → redirect) |
| `src/components/Layout.tsx` | the prototype path is full-bleed (one `startsWith`) |
| tests (4 new files) | §9 |
| `docs/handoffs/UX1.md`, `docs/handoffs/ux1/` | this handoff and the screenshots |

## 8. Prototype route and data

Run a development server (`npm run dev`) and open **`/lol/dev/worlds-experience`**. On this machine, use the review setup in §11.

- `?scenario=` selects the data. The picker sits in the desktop bar, or as a floating pill on a phone.
  - `live` (default) reads production through `useTournament`.
  - `snapshot` is the **real** production body from 13 Oct (PW4-B's fixture).
  - These are **simulated**: `play-in-live`, `play-in-done`, `swiss-r3`, `swiss-r5`, `knockout-drawn`, `knockout-live`, `complete`, `partial`, `no-standings`, `stale` and `unknown` (all built by `worldsScenarios.ts`).
- Simulated data always shows a striped **SIMULATED** chip: in the bar on desktop, and on its own row under the nav on a phone. Its tooltip reads "Not real Worlds 2026 data".
- `?now=<ISO>` pins the clock. Simulated phases otherwise run on a clock that suits them.
- **Isolation**:
  - `import.meta.env.DEV` is the literal `false` in production builds, so the import, the routes and every fixture are removed. The paths 404 there.
  - No production module imports the shell or the scenarios. This is asserted by `ux1Isolation.test.ts` and checked in the built bundle (§9).

## 9. Tests, build and visual evidence

**New tests (71)**:
- `navigation.test.ts`: URL model, carried keys, direction, swipe neighbours.
- `experienceView.test.ts`: stakes on real data, focus per phase, countdown, onward routes, Swiss pool arithmetic cross-checked against upstream, occupancy (none before a result), Swiss match stakes, and no sizes without standings.
- `WorldsExperience.test.tsx`, covering:
  - nav, and future screens that are not links;
  - forward/back/forward with direction;
  - stage selection and its history;
  - deep links, unknown slugs and unknown match ids;
  - the Overview on real and simulated phases;
  - selection, the panel, route edges, and close by button, Escape and re-click;
  - Play-In, Swiss and Knockout rendering, including the schematic vs bracket;
  - partial, standings-unavailable, stale and refresh-failed states;
  - keyboard roving with no global arrow capture, and Escape left alone in fields;
  - reduced motion;
  - the phone stepper, sheet open/close/Escape/Back, Swiss tabs, and swipe guards.
- `ux1Isolation.test.ts`: DEV-gated import and routes; no production importer; the published route, page, featured policy and hub are untouched.

**Results** (Vitest, run per the machine workarounds in §11):

| Run | Base `20a252ec` | Branch |
|---|---|---|
| Focused: `src/pages/pro-play`, `src/lib/pro-play`, `src/components/pro-play`, `hub5Isolation`, `App.teamSimRoutes`, `Layout`, plus UX1 | 43 files / **1590** passed | 47 files / **1661** passed (+71 new, 0 regressions) |
| `tsc --noEmit -p tsconfig.app.json` | 2 errors (`OnboardingProfile.tsx:180`, `identity/connections.ts:263`) | the same 2, none new |
| ESLint, touched files | — | 0 errors; 10 `react-refresh/only-export-components` warnings (the codebase's usual pattern) |
| `vite build` (production, esbuild-JSX scratch config, §11) | — | succeeds; the only prototype trace in the bundle is Layout's `startsWith("/lol/dev/worlds-experience")` check. No shell, screen, scenario or fixture code (`Road to the Final`, `swissPoolMap`, `scenarioClock`, `Prototype data`: 0 files) |

**Real-browser interaction** (headless Edge; `docs/handoffs/ux1/interaction-results.json`): **23/23 pass**.
- Desktop navigation:
  - slide directions measured mid-flight;
  - back/forward restore screen and stage;
  - selection opens the panel, Escape closes it, and a route edge selects its target;
  - Back closes the detail in one step;
  - arrow roving plus Enter; deep links; the `/dev/worlds-experience` redirect.
- The published page still renders `TournamentV2`, and no page errors were logged.
- Reduced motion produces no travel.
- Phone:
  - the sheet opens and closes, by button and by Back;
  - nav, stage and round targets are ≥ 44 px (48 / 52 / 44);
  - there is no horizontal page overflow.

**Screenshots** (`docs/handoffs/ux1/`). Every stage and overview shot is taken after a navigation transition, not on first paint. Each name says its viewport.

| | Viewport | Files |
|---|---|---|
| Real snapshot | 1440 × 900 | `ux1-overview-pre-event-1440` (Stages → Overview), `ux1-stages-play-in-1440` (Overview → Stages), `ux1-stages-play-in-match-detail-1440`, `ux1-stages-swiss-1440`, `ux1-stages-knockouts-1440`, `transition-mid-*` (mid-slide frames) |
| Real snapshot | 1280 × 800 | `ux1-overview-pre-event-1280`, `ux1-stages-play-in-match-detail-1280`, `ux1-stages-swiss-1280`, `ux1-stages-knockouts-1280` |
| Real snapshot | 390 × 844 | `ux1-m-overview-390` (Stages → Overview), `ux1-m-overview-full-390`, `ux1-m-play-in-390`, `ux1-m-match-detail-sheet-390`, `ux1-m-swiss-390`, `ux1-m-knockouts-390` |
| Simulated | 1440 × 900 | `ux1-sim-*`: Play-In live (overview + stage), between stages, Swiss R3, Swiss R5 with the live decider's detail, Knockouts live, complete, partial, standings unavailable, stale, schedule unavailable. Also `ux1-sim-swiss-round-3-1280` and `ux1-m-sim-*` |

I inspected each capture myself. Defects found and fixed during review:
- ambience runes showing through the frame;
- the dev picker covering the Overview CTA;
- Play-In lanes needing 56 px of scroll at 1440 (now vertical lane labels and dense card headers);
- Knockout bracket overflow;
- Swiss records breaking at the en dash at 1280;
- the hero footer wrapping at 1280;
- the bar collision at 1280 with the picker;
- the Simulated chip overlapping the title on a phone;
- cramped fixture rows;
- "15 teams" claimed for Swiss without standings;
- results with no date.

## 10. Known limitations

- At 1280 × 800 the Play-In (≈ 42 px) and a mid-event Swiss stage (≈ 95 px, the second pairing row) scroll inside the stage area. At 1440 × 900 everything shown fits, except Swiss round 5 mid-event (≈ 69 px).
- The Swiss pool map shows where each team is now, not each team's path through the rounds. Drawing paths would need per-team match history: derivable from completed matches, but deliberately not built here.
- Swiss pool sizes ("4 teams") are format arithmetic. They are drawn only when they match upstream's round sizes, and do not claim which match belongs to which pool before pairings.
- The phone Play-In round choice is local state: it is not in the URL and not restored by Back.
- Edge-to-edge swipe is wired on the workspace only. Swiping inside the bracket rails scrolls them instead.
- No `live` capture is committed: the screenshots are deterministic (snapshot or simulated). The `live` source was exercised in the browser pane during development.
- Team names and profile links follow PW4-B (`participant.name`, canonical `team_key`). There is no roster or player content, because lineups are `not_certified`.

The build check was `vite build` only. The repo's `npm run build` adds the sitemap and item/champion prerender steps. They don't touch these routes and were not run here.

## 11. Machine notes (for whoever continues)

- **swc and rollup**: on this machine `@swc/core` fails to load and Windows Application Control blocks rollup's native binary. Run Vitest, Vite dev and build with:
  - an esbuild-JSX scratch config (no `plugin-react-swc`);
  - a `--require` hook that maps `@rollup/rollup-win32-x64-msvc` to `@rollup/wasm-node@4.64.3` installed in a scratch directory.

  The same pattern is used in PW4-B (memory: rollup-native-blocked-wasm-hook). Do not run `pnpm` in worktrees.
- The review dev server for this branch was Vite on :5271 from the worktree root. Captures used headless Playwright `channel: "msedge"`.

## 12. Decisions for the owner

1. **The model itself**: is a viewport-sized application frame with horizontal screen travel the direction to complete (Teams, Schedule, Discover)?
2. **Swiss pool map**: keep it as the primary Swiss view? An alternative is records as the lead, with the map secondary.
3. **Knockouts pre-draw schematic** in place of TBD cards: approve?
4. **Context panel width**: 360 px on wide screens and 320 px below 1536 px. Is it always visible on desktop, or collapsible to give the bracket the full width?
5. **Production URL shape** if approved: `/lol/pro-play/tournament/worlds-2026/stages/swiss?match=` (this branch's model with `base` swapped). The alternative is query-only. The current published URL would become the Overview.
6. **Phone nav placement**: top (as built, away from the Community button and the dock) or a bottom tab bar.
7. Should **"What the result decides"** state "Eliminated" for an upcoming lower-bracket match? It is derived from upstream's edges and the stage's single-winner rule, and only with standings authority.

## 13. Next task if approved

**UX2**:
- build Teams (19-team field by region, entry, status; certified lineups when registered) and Schedule (46 matches by local day, stage filters, the detail panel shared with Stages) on this shell;
- define Discover's slot for verified discoveries only;
- then move the shell to the production route behind an explicit owner-approved switch. The published page stays the fallback.
- Before production, move `knockoutPreDraw` and the exported bracket helpers into lib modules (clears the fast-refresh warnings), and add a URL key for the phone Play-In round.
