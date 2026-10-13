# UX3A — Worlds 2026 production integration candidate

| | |
|---|---|
| Branch | `ux3a/worlds-integration-candidate` (worktree `C:\Users\mlmit\mogzy-wt\ux3a-worlds`), pushed. **Not merged, deployed or published. The flag is OFF** |
| Base | FE `origin/main` `4e04448bd0457d6a1cb3d288ffa3cbc817dfa42b` (verified 2026-10-13; 19 commits past UX1's base `20a252ec`, all Premium / Ranked reward work, no shared paths with UX) |
| Integrated | UX2A tip `91128a6f2f98195418274db76b5afda387f8694f` (`ux2/worlds-teams-schedule`, which contains UX1 `56fd28bc` and UX2 `c0542e12`), by a non-fast-forward merge: `cef07384` |
| Result | implementation `23b32c51`; this handoff and its evidence are the docs commit on top (the branch tip) |
| Status | **Release candidate. STOP for command-center review** |

## 1. What this is

The accepted four-screen Worlds application (UX1 + UX2 + UX2A) on current `main`, mounted at the **production Worlds URL** behind a build-time flag that is **off by default**. With the flag off, production is unchanged. With it on, `/lol/pro-play/tournament/worlds-2026` and its screen paths render the experience from the same page, the same data read and the same error handling. No backend, Supabase, Railway or Lovable change. `featuredTournament.ts` is untouched.

## 2. Merge

- `git merge --no-ff origin/ux2/worlds-teams-schedule` onto `origin/main`. **No conflicts**: the 112 UX paths and the 25 paths `main` changed since `20a252ec` do not overlap. UX1, UX2 and UX2A commits keep their SHAs. The UX branches and worktrees were not touched.
- Merge baseline, verified before any routing change (same focused command as UX2A §14, below):

| | `main` 4e04448b | merge cef07384 |
|---|---|---|
| Focused Vitest | 44 files / 1704 passed | 51 files / 1865 passed (+161 = the UX suites), 0 failed |
| `tsc --noEmit -p tsconfig.app.json` | — | 2 errors, both pre-existing (`OnboardingProfile.tsx:180`, `identity/connections.ts:263`) |

## 3. Files changed (after the merge)

| File | Change |
|---|---|
| `src/lib/pro-play/worldsExperience/productionGate.ts` | **new**: the flag, `worlds-2026`, the base and route constants, path predicates |
| `src/lib/pro-play/worldsExperience/experienceSeo.ts` | **new**: per-screen title / description / canonical |
| `src/components/pro-play/worlds-experience/ProductionExperience.tsx` | **new**: the production mount (shell + `SEOHead`), lazy |
| `src/pages/pro-play/ProPlayTournament.tsx` | the adapter (§5): lazy experience branch, frame-shaped loading state, v1 fallback. The flag-off path is unchanged |
| `src/App.tsx` | one flag-gated `<Route>` (+ import) |
| `src/components/Layout.tsx` | one `isFullBleed` term (+ import) |
| `.env.example` | documents `VITE_WORLDS_EXPERIENCE_ENABLED=false` |
| tests | `ProPlayTournamentExperience.test.tsx` (new, 29), `featuredSwitchUx3a.test.tsx` (new, 16), `App.ux3aRoutes.test.ts` (new, 5), `ux1Isolation.test.ts` (contract updated: the page is now the one production importer, lazily) |
| `docs/handoffs/UX3A.md`, `docs/handoffs/ux3a/` | this handoff, browser results, screenshots |

The experience's own code (`worlds-experience/*`, `worldsExperience/*` other than the new modules) is **unchanged** from UX2A. The one published component the merge brings in changed is UX1's opt-in `BracketSelectContext` in `TournamentBracket.tsx`: without a provider (the published page) it renders as before, which the flag-off vs `main` browser comparison confirms (§12). `featuredTournament.ts`, `tournamentApi.ts`, the hub (`ProPlayHub.tsx`, `components/pro-play/hub/`) and `TournamentV2` have no diff against `main`. Layout's Community trigger and Footer rules are untouched.

## 4. Routing design

```
App.tsx (inside <Layout>)
  <Route path="/lol/pro-play/tournament/:contextId"        element={<ProPlayTournament/>} />   published, unchanged
  {flag ? <Route path="/lol/pro-play/tournament/worlds-2026/*" element={<ProPlayTournament/>} /> : null}
```

- **One route for the whole experience.** The static `worlds-2026` segment outranks `:contextId` in React Router's ranking (asserted with `matchRoutes`), and the splat also matches the bare URL. So Overview, `/stages/<stage>`, `/teams` and `/schedule` are the **same route element**: moving between screens never remounts the page, so the shell's transitions, history markers and the single `useTournament` query survive (tested: one tournament read across Overview → Stages → Teams → Schedule → Back ×3 → Forward, same DOM frame).
- **Nothing else moves.** `dcgi-2026`, any other context and unknown contexts still match `:contextId`. `dcgi-2026/teams` still 404s. With the flag off the route does not exist, so `worlds-2026/teams` 404s exactly as on `main`.
- The page reads `contextId` from the param, or, on the flag's static route (which has no param), from `isWorldsExperienceSurface(pathname)`.
- **Inside** the experience nothing changed: UX1/UX2 `parseLocation` / `buildHref` with `base = /lol/pro-play/tournament/worlds-2026`. Discover and unknown screens correct to the Overview, an unknown stage to the default stage (replace). UX2A's reconciliation, detail markers and Back/Forward are the same code.
- `route-prefetch.ts` already matches every `/lol/pro-play/tournament/…` path; no change.

## 5. Production data adapter (`ProPlayTournament.tsx`)

The page keeps ownership of everything it owned:

- **Data**: the same `useTournament(contextId)` (React Query key `["live-esports","tournament",id]`, 120 s poll, 2 retries on transient errors). The experience gets the parsed v2 body, the page's 30 s clock, `refetch`, `isFetching`, `isRefetchError`. No second fetch, no second renderer.
- **Media**: the same `ProPlayMediaProvider` keys (`mediaKeysV2`).
- **States**:
  - loading: a frame-shaped skeleton (`tournament-loading`, `data-experience="worlds"`), also the Suspense fallback while the chunk loads;
  - not found / network / unsupported / malformed: the page's existing error block, on any screen path;
  - stale, partial, unavailable (`phase: unknown`), refresh failure: the experience's status strip (UX1), fed by the same body and `isRefetchError`;
  - a v1 body served for Worlds (not expected): drawn by the published v1 renderer at the Worlds URL; a screen path redirects there (replace).
- **Isolation**: the shell is `lazy(() => import(".../ProductionExperience"))`, with the same chunk-reload recovery as route chunks, and its import is warmed in parallel with the tournament read. `ProductionExperience` passes **no** `simulated`, `badge` or `tools`, and nothing in production imports the scenarios or fixtures (`ux1Isolation.test.ts`).

## 6. The gate

`VITE_WORLDS_EXPERIENCE_ENABLED`, read by `isWorldsExperienceEnabled()` in `productionGate.ts`. It is the established SIM2 pattern (`VITE_TEAM_SIM_ENABLED`, `combat-lab/team-sim/featureGate.ts`):

- **build-time** (Vite inlines it): no URL parameter, storage key, header or backend answer can change it (tested: `?experience=1&VITE_WORLDS_EXPERIENCE_ENABLED=true&scenario=complete` still renders the published page);
- **fail-closed**: only `1`/`true`/`yes`/`on` (trimmed, any case) enable; unset, empty, `false` or a typo are off;
- **one context**: only `worlds-2026`; DCGI and every other event are identical with it on or off;
- **default off**: not in the tracked `.env`, so every current build (Lovable's included) is off;
- no new service or infrastructure. It decides which presentation of public data is offered; it is not a security boundary.

**Considered and rejected**: a runtime `app_settings` row (would make the router's route table depend on a Supabase read that this machine and visitors see flap, and the route set is built at module load) and a URL / localStorage preview switch (publicly controllable, which the assignment rules out).

Flag off, the experience still exists in the bundle as its own **never-requested** chunk (§10).

## 7. Layout

`Layout.isFullBleed` gains `isWorldsExperienceSurface(pathname)`: full-bleed only for the Worlds URL and its screens, and only with the flag on. With it off the published page keeps the reading column (`max-w-7xl`). No other route's classification changed. Measured in a real browser (§9): the frame spans the viewport width, starts exactly at `--app-header-h`, fills the viewport below it on desktop (internal scrolling regions, UX1), the Footer follows the frame, one `<h1>` (the experience bar's) and no body-level horizontal overflow at 1440 and 390.

## 8. SEO

| URL | Title | Canonical |
|---|---|---|
| `<base>` (Overview) | `Worlds — League of Legends World Championship 2026 \| Mogzy` (**the published page's title and description, unchanged**) | `<base>` |
| `<base>/stages/<stage>` | `Swiss — Worlds 2026 \| Mogzy` | `<base>/stages/<stage>` |
| `<base>/stages` (bare) | the stage it shows (`Play-In — …` today) | `<base>/stages/<that stage>` |
| `<base>/teams` | `Teams — Worlds 2026 \| Mogzy` | `<base>/teams` |
| `<base>/schedule` | `Schedule — Worlds 2026 \| Mogzy` | `<base>/schedule` |
| `?team=KC` | `Karmine Corp — Worlds 2026 Teams \| Mogzy` | `<base>/teams` |
| `?match=<id>` (Stages / Schedule) | `C9 vs KC — Worlds 2026 Schedule \| Mogzy` (only when both codes are served) | the screen path |
| `/discover`, unknown screen, unknown stage | corrected in place by the experience (replace) | Overview / that stage |

- **One canonical per screen, never per selection**: every query (`team`, `region`, `match`, `day`, `stage`, `round`, `step`) folds into its screen's canonical, so sharing selections creates no new indexable pages. Titles follow the selection so a shared link and a tab read correctly.
- Four screen pages are the only new canonicals. None is added to the sitemap (the sitemap lists no Pro Play URL today); they are reachable from the experience's own nav links.
- `SEOHead` is a client effect keyed on title/description/path, so it updates on every client move (verified in the browser on each nav step, and in tests on Back/Forward).
- **Flag off**: the published page's metadata is byte-identical to `main` (verified), and the screen paths are the 404 page with `noindex, nofollow`, as on `main`.
- Development prototype: still `noindex` and DEV-only; `/lol/dev/worlds-experience` 404s in both production builds (verified).
- Limitation: metadata is client-rendered, like every Mogzy page; crawlers and link unfurlers that do not run JS see `index.html`'s defaults. Unchanged from the published page.

## 9. The 15 October Featured switch

`featuredTournament.ts` is **not modified** (the diff touches no file under `hub/` and not the policy). It selects by calendar, independent of tournament data and of this flag. Tested with controlled clocks, with the flag **off and on** (`featuredSwitchUx3a.test.tsx`, 16 tests):

| Clock | Featured | URL resolves to |
|---|---|---|
| 2026-10-15T06:59:59Z (14 Oct 23:59:59 LA) | DCGI, current | `:contextId` route (DCGI v1 page) |
| 2026-10-15T07:00:00Z (15 Oct 00:00 LA) | Worlds, current | off: `:contextId` (published page); on: the experience route |
| during (30 Oct), last day (14 Nov 23:59:59 LA) | Worlds, current | as above |
| 2026-11-15T08:00:00Z | Worlds, **archive** (no fallback to DCGI) | as above |

- Clicking the featured pill at the switch opens the right presentation in both states, never the 404.
- **API unavailable at the switch**: the pill stays Worlds (`data-state="unavailable"`, configured identity) and links to the Worlds URL; the page shows "This tournament could not be loaded." in both states. The Featured choice never reads the flag and the flag never reads the Featured choice.

## 10. Build isolation

Production `vite build` (esbuild-JSX scratch config, same `manualChunks`) of `main`, flag off and flag on:

| | `main` | flag off | flag on |
|---|---|---|---|
| `ProPlayTournament` chunk | 57.3 KB | 60.2 KB (+2.9 KB: gate + branch) | 60.2 KB |
| Its static imports | 12 modules | **the same 12** | the same 12 |
| New chunks | — | `ProductionExperience` (147 KB) + 2 small shared (`components` 30 KB, `alert` 1 KB), only imported by it | same |
| Requested on the Worlds page | — | **never** (verified in the browser) | after the tournament read starts |
| `Prototype data`, `scenarioClock`, `Not real Worlds 2026 data`, `scenario-picker`, scenario ids (`play-in-live`…) | 0 files | **0 files** | **0 files** |

The shell's own `Simulated` chip code is in the chunk (UX2 §5 D) but unreachable: it renders only when `simulated` is true, which only the dev page passes. `/lol/dev/worlds-experience` remains DEV-gated (literal `false` in production) and 404s.

## 11. Tests

| Run | `main` 4e04448b | merge cef07384 | **UX3A** |
|---|---|---|---|
| Focused Vitest (`src/pages/pro-play`, `src/lib/pro-play`, `src/components/pro-play`, `ProPlayHub.test.tsx`, `hub5Isolation`, `App.teamSimRoutes`, `src/components/Layout*`, `src/pages/dev/worlds-experience`, + `App.ux3aRoutes`) | 44 / 1704 | 51 / 1865 | **54 / 1915, 0 failed** |
| `tsc --noEmit -p tsconfig.app.json` | 2 pre-existing | same 2 | **same 2** |
| ESLint (all touched + UX files) | App.tsx: 1 warning | — | 0 errors; 8 warnings = App.tsx's existing one + UX2A's 7 `react-refresh` |
| `vite build` | ok | — | ok, both flag states |

New coverage: the gate's values and scope; URL can't switch it; flag off: published page + metadata, screens 404 with no read, DCGI v1; flag on: Overview identity and one `h1`, all four screens by deep link with title + canonical, bare `/stages`, selection titles, unknown team, Discover / unknown screen / unknown stage correction, full nav and Back/Forward with **one read and no remount**, schedule deep link across a fresh router and cache (refresh), UX2A date reconciliation on the production route, reduced motion, phone frame, loading, network / unsupported / malformed / 404 errors on a screen path, unknown context, stale / partial / unavailable strip, refresh failure, v1-for-Worlds fallback, DCGI unchanged with the flag on; route ranking; Layout term; Featured boundaries in both states.

Changed test: `ux1Isolation.test.ts` "no production module imports the shell" now asserts the page is the **only** importer, by dynamic import, with no dev props, and that `ProductionExperience` carries no fixture or dev import.

## 12. Browser verification

Headless Edge (Playwright, `channel: "msedge"`) against **production `vite preview` builds** of `main` (:5276), flag off (:5274) and flag on (:5275), reading the **live production API**. Every check runs in a fresh browser context (clean first visit, no storage). **72 / 72 pass**, no page errors (`docs/handoffs/ux3a/interaction-results.json`).

| Group | Checks |
|---|---|
| **Flag off vs `main`**, 1440 and 390 | identical sections, text (line by line), title / canonical / description, `<main>` width, Footer; experience chunk **never requested**; no overflow; `/teams`, `/schedule`, `/stages/swiss` are the `noindex` 404 page as on `main`; DCGI v1; `/lol/dev/worlds-experience` 404 |
| **Flag on, desktop 1440 × 900** | Overview at the Worlds URL with the published title/canonical; frame 1440 wide, top = header clearance (56 px), height = viewport − header; one `h1`; Footer after the frame; no overflow; LoL theme; no simulation UI; nav Overview → Stages → Teams → Schedule (URL, title, query-free canonical each), Back ×3, Forward; Swiss Round 3 selected (`?round=3`, `aria-pressed`) and kept on refresh; fixture → match detail (`?match=`), canonical stays `/schedule`, Escape closes; schedule deep link `?day=&match=` survives refresh, titled `C9 vs KC — …`; `?team=KC` opens KC (`Karmine Corp — Worlds 2026 Teams`); LCK region clears KC (UX2A); `/discover` → Overview; DCGI unchanged and `dcgi-2026/teams` 404; dev route 404; hub pill → DCGI (13 Oct) |
| **Reduced motion** (`reducedMotion: "reduce"`) | workspace `data-motion="reduced"`; no transform mid-move |
| **Flag on, phone 390 × 844** (touch) | compact frame; sticky bar under the 48 px header; one `h1`; no overflow before or after moves; team tile → bottom sheet (`?team=`), Back closes; fixture → match sheet, Escape closes; Footer reachable below |
| **Broken / partial API** (route interception on a screen path) | 503 (after the hook's retries), 404, unsupported contract → the page's messages; partial, stale, `unknown` → the matching status-strip line |

Two earlier runs each had one flag-off "same text as main" mismatch (once at 390, once at 1440) taken before the page settled. Neither reproduced in three direct repeats or in the final run, both of which compared settled pages line by line (368 / 384 lines, identical). The script now waits 3 s before comparing.

Screenshots (`docs/handoffs/ux3a/`), integration differences only. The screens' designs are unchanged from UX2's captures:
- `ux3a-off-vs-main-{off,main}-1440`: flag off is the published page, the same as `main`.
- `ux3a-on-overview-1440`: the production mount under the global HUD.
- `ux3a-on-footer-1440`: the Footer after the frame.
- `ux3a-on-swiss-round-1440`, `ux3a-on-schedule-match-1440`: production URLs with selections.
- `ux3a-m-on-overview-390`, `ux3a-m-on-team-sheet-390`: phone.
- `ux3a-on-api-503-1440`, `ux3a-on-api-partial-1440`: the page's error state and the status strip.

The built-in Browser pane was also used to spot-check `/stages/swiss` on the flag-on build (title `Swiss — Worlds 2026 | Mogzy`).

## 13. Known limitations

- **Hub `?next=` (separate scope, not changed)**: §15.
- Metadata is client-side only (§8).
- The flag needs a rebuild to change (minutes, via Lovable Publish), not an instant toggle. Chosen deliberately (§6).
- Flag off, the experience chunk ships in the bundle unrequested (§10).
- The page's 30 s clock drives the experience (the dev page used 15 s): the Schedule's "Today", live pulses and countdowns refresh at most 30 s late.
- Two reads happen when a visitor goes from the hub pill to the page (default `staleTime: 0` refetch on mount). This is current behaviour with the flag off too, not introduced here.
- Everything in UX2 §11 and UX2A §14 "Remaining limitations" still applies (1280 × 800 local scrolling, sparse pre-draw Teams column, Today in the viewer's zone, lineups not yet certified).

## 14. Release prerequisites, enable and rollback

**Prerequisites (owner / command center)**
1. Review and approve this branch; merge it to FE `main` **with the flag off**. That merge is itself release-safe: production renders exactly as today (§10, §12).
2. Decide on the hub `?next=` remediation (§15). It is not a blocker for the experience (its own Match Centre links are guarded) but it is for shared hub links.
3. Pick the enable moment. The 15 Oct switch needs nothing from this branch.

**Enable** (one line, one publish):
1. On FE `main`, add to the tracked `.env` (Lovable builds from it): `VITE_WORLDS_EXPERIENCE_ENABLED="true"`.
2. Commit, push, **Lovable Publish**.
3. Verify on mogzy.lol: `/lol/pro-play/tournament/worlds-2026` shows the experience; `/stages/swiss`, `/teams`, `/schedule` deep links and refresh work; titles per §8; DCGI page unchanged; `/lol/dev/worlds-experience` 404s.

**Rollback** (restores the published presentation; no data, backend or Featured change):
1. Revert that one `.env` line (or set it to `false`), commit, push, **Lovable Publish**.
2. The Worlds URL renders `TournamentV2` again; the screen paths 404 (`noindex`). Shared screen links then land on the 404 page, which links home; the canonical Worlds URL keeps working throughout.
3. If a code rollback is ever wanted instead, revert the UX3A merge commit on `main`; the flag line alone is the intended lever.

## 15. Separate release dependency — hub `?next=` (not modified here)

- **Path**: `src/pages/ProPlayHub.tsx`, lines ~142–198 (`explicitUpcoming`, `nextNotice`, `autoUpcoming`). `?next=<match_id>` is looked up only in `/upcoming` and `/upcoming?league=worlds` (each `limit: 12, horizon_days: 14`).
- **Defect**: a legitimate fixture outside that window gets the `gone` notice ("isn't in the current schedule… so the latest match is shown instead") and the board then shows the **automatic pick**, an unrelated match. Demonstrated in UX2 with the Knockout Final `115660540726095133` (`docs/handoffs/ux2/match-centre-*.png`).
- **Exposure with this release**: the experience's own Match Centre button offers `?next=` only when the hub's schedule lists the fixture (UX2 `matchCentreLink.ts`), so it never creates such a link. Shared or hand-made hub links still can.
- **Recommended narrow fix** (owner-approved, own change): in the hub, when `?next=` is not in either schedule read but is a fixture of the featured tournament (`useTournament(featured.event.contextId)`, already cached by the pill), show that fixture as "upcoming, not yet in the live schedule" with its time and a link to the experience's Schedule `?match=` instead of the automatic pick; else keep today's notice **without** substituting a match. Backend alternative: `/upcoming?match_id=`.

## 16. Next recommended action

Command-center review of this branch → merge flag-off → decide §15 → separately authorise the one-line enable and publish (§14). After enabling, re-run the browser script (`docs/handoffs/ux3a/interaction-results.json` lists the checks) against mogzy.lol.

### Machine notes

Same workarounds as UX1 §11 / UX2A: esbuild-JSX scratch configs and the rollup wasm hook (memory `rollup-native-blocked-wasm-hook`). Builds and the browser run used `vite build` / `vite preview` of production bundles on :5274 (off), :5275 (on), :5276 (`main`), headless Edge via the worktree's Playwright. Do not run `pnpm` in worktrees.
