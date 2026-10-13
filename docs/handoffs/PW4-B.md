# PW4-B — Worlds 2026 Featured tournament (frontend)

| | |
|---|---|
| Branch | `pw4b/worlds-featured` (worktree `C:\Users\mlmit\mogzy-wt\pw4b`). Pushed as a review branch. **Not merged, published or deployed; no Lovable Publish** |
| Base | FE `origin/main` `b2b1804afdd1eee1a328629033a6c074128a7e3d` (PW1-C), as expected; it had not moved when fetched |
| Backend authority | PW4-A `0e7209969ce08ac4e812f0b77873d920956da0ec` (`docs/handoffs/PW4-A.md` in the backend repo), live in production (§1) |
| Scope | Frontend only: v2 contract client, Worlds tournament page, featured-event policy, tests, this handoff |
| Status | **Verified locally. STOP for control-center review** |

## 0. Result in one paragraph

`/lol/pro-play/tournament/worlds-2026` now renders the backend's `tournament_context_v2`. It shows:
- a phase-aware header (live or next match, the transition between stages, or the champion);
- a real double-elimination Play-In bracket drawn from upstream cells and slot edges;
- Swiss seeding tiers, then records and upstream rounds;
- a Quarterfinal → Semifinal → Final bracket;
- the 19-team field by region;
- the full 46-match schedule in local time.

Data derivation stays in the backend. The page groups and labels what it is served, and every degraded source (no schedule, partial schedule, no standings, stale copy, unsupported or malformed contract) gets one honest state.

DCGI (v1) renders exactly as before. The hub's single `PRO_PLAY_FEATURED_TOURNAMENT = "dcgi-2026"` is replaced by a configured, calendar-day policy:
- DCGI until 14 Oct;
- Worlds from 00:00 on 15 Oct, Los Angeles time;
- Worlds kept as an archive after 14 Nov until a successor is configured;
- never a fallback to DCGI, including when the Worlds read fails.

## 1. Source contract and versions (Step 1, production, read-only)

`curl` GETs, no auth, 2026-10-13T00:09:40Z. Evidence is in `docs/handoffs/pw4b/production-evidence.json`.

| Endpoint | Finding |
|---|---|
| `/api/live-esports/tournament/worlds-2026` | 200. `contract_version: "tournament_context_v2"`, `source_ok: true`, `stale: false`.<br>Top-level `sources.schedule` (`pages_read: 2`) and `sources.standings`, each with its own `ok` / `stale` / `fetched_at`.<br>**19 participants** across LPL, LCK, LEC, LCS, LCP and CBLOL; **46 matches**; stages `play_in`, `swiss`, `knockout`.<br>`state.phase: "pre_event"`, `phase_detail: null`, `calendar_stage: "pre_event"`.<br>`state.play_in` / `swiss` / `knockout` present; `coverage` is `{basis: "standings", complete: true, found 46/46}`; `warnings: []`.<br>Every participant has `lineup_status: "not_certified"` and `lineup: []`.<br>Play-In cells, slot origins (`draw` / `winner_of` / `loser_of`) and Swiss `swiss_round` 1–5 (8/8/8/6/3) match the PW4-A §7a sample |
| `/api/live-esports/tournament/dcgi-2026` | 200. `contract_version: "tournament_context_v1"`. No `sources`, no v2 state keys. `phase: "knockout"`, 27 matches, 12 participants |

One difference from the PW4-A sample: production now lists **C9 v KC at 15 Oct 18:00Z** and **FUR v MVK at 23:00Z** (the sample had FUR v MVK first). The page does not hardcode either; match numbering follows play order (§3.3).

The real Worlds body is committed as the test base, `src/lib/pro-play/__fixtures__/tournamentWorldsPreEvent.json`.

## 2. Typed v2 support (`tournamentApi.ts`)

- **v1 types are untouched.** The v2 types are added beside them:
  - `TournamentResponseV2`, `TournamentStateV2` (phases `pre_event | play_in | swiss | knockout | between_stages | complete | unknown`), `CalendarStage`;
  - `SlotSource`, `MatchBracketCell`, `TournamentMatchV2` (`bracket`, `swiss_round`, `teams[].slot`);
  - `TournamentParticipantV2` (`esports_team_id`, `name`, `entry_stage`, `swiss_tier`, `qualification`, `lineup_status`);
  - `TournamentStageV2` (`bracket`, `standings_slug`, `expected_matches`, `wins_to_advance`, `losses_to_eliminate`);
  - `BracketSummary` (with `bracket_authority`), `SwissSummary`, `ScheduleCoverage`, `SourceFreshness`.
- **`parseTournament()` branches explicitly on the version:**
  - v1, or no version → the v1 shape check (as before);
  - v2 → a structural check (stages, participants, all state summaries, coverage, two-team matches);
  - an unknown version, or an unknown v2 phase → `TournamentUnsupported`;
  - a body without its shape, or a non-JSON 200 → `TournamentMalformed`.
- **Retries:** `useTournament` does not retry NotFound, Unsupported or Malformed. Other errors keep the existing 2 retries.

## 3. UX / IA decisions

### 3.1 Page structure (v2 only; `ProPlayTournament.tsx` dispatches by version)

**Header:**
- event mark, official name, `15 Oct – 14 Nov 2026`, `19 teams · 6 regions`, and "15 straight to Swiss · 4 in the Play-In" (computed);
- a **status panel**: Live now, else the stage transition, else the next match with its countdown, else the champion;
- three **stage tiles** (dates, venue; anchor links to the sections) marked Now, Next or Complete **only as the phase states it**. An earlier stage the phase does not certify is left unmarked.

**Sections, ordered by phase** (`sectionOrderV2`, from `context.stages`, not a fixed swiss → knockout list):

| Phase | Order |
|---|---|
| `pre_event` | Play-In · Field · Swiss · Knockout · Schedule |
| `play_in` | Today · Play-In · Swiss · Field · Schedule · Knockout |
| `between_stages` (Play-In → Swiss) | Swiss · Play-In · Schedule · Knockout · Field |
| `swiss` | Today · Swiss · Schedule · Knockout · Play-In · Field |
| `between_stages` (Swiss → Knockout) | Knockout · Swiss · Schedule · Play-In · Field |
| `knockout` | Today · Knockout · Schedule · Swiss · Play-In · Field |
| `complete` | Knockout (with champion) · Swiss · Play-In · Schedule · Field |
| `unknown` | Field · Swiss seeding (registry facts only) |

### 3.2 Play-In: double elimination

- **Rows and columns come from upstream cell names.** "Upper Bracket - …" is the upper row, "Lower Bracket - …" the lower, and the remaining cell is the Play-In Final. Within a column, matches are in play order.
- **The page never falls back to single elimination.** If cells are missing or unrecognised, the stage is listed by cell instead.
- **Connector lines** are drawn from the backend's `winner_of` edges. Each line is measured from the rendered cards to the exact team row it fills (`Connectors` in `TournamentBracket.tsx`), so a line exists only where upstream has the edge. Completed edges are gold. No lines are drawn in the stacked phone layout.
- **Each card carries:**
  - name, Bo, local time, state, series score;
  - routing from the inverse slot edges, e.g. "Winner → Upper Final · Loser → Lower Semifinal";
  - TBD slots labelled "Winner of FUR v MVK", "Loser of Upper Final" or "Decided by draw".
- **"Out" and "Play-In winner" tags** appear only when `bracket_authority === "standings"` and the backend served them. "Out" also needs the loss to be the one whose loser goes nowhere, so FUR losing the Upper Final is not marked out.

### 3.3 Match names

- Names come from cells: "Upper Semifinal", "Lower Final", "Play-In Final", "Quarterfinal", "Round 3".
- A cell with several matches is numbered **by start time** (then standings order), so "Upper Semifinal 1" is the match played first (C9 v KC today).

### 3.4 Swiss

- **Before a result:**
  - the certified tiers T1–T4 (4/4/4/3) from the registry;
  - the Play-In slot as a separate, unresolved item, resolved only by upstream placement (`swiss.placed_codes`) or the certified Play-In winner;
  - the stage `format_note`;
  - **no 0–0 table**.
  - The Play-In slot is **not** placed into Tier 4 by inference. The registry has no tier for it; the backend's format note (shown) says Tier 4.
- **After results:**
  - the backend's `records` grouped by W–L in its order, with a note that no tiebreak is published;
  - `advanced` / `eliminated` exactly as served;
  - the `unverified_completed_matches` > 0 note.
- **Rounds** are upstream's `state.swiss.rounds`, one tab each, focused on the live or next open round. A round with no published pairings is one summary line ("8 matches · Bo1 · Fri 23 Oct · first match 10:00 · Pairings are published by the official draw"), not eight TBD rows.
- **Without standings**, Swiss matches are listed by day (never numbered from dates).

### 3.5 Knockout

- Quarterfinals → Semifinals → Final from upstream cells. They are reordered by the winner edges only when they form a full tree (which enables connectors); otherwise standings order is kept.
- Quarterfinal draw slots show "Teams decided by draw" once per card.
- The champion banner appears only with `bracket_authority === "standings"` and a `champion_code`, with the final's score.

### 3.6 Know the field

- Six region cards, each team with:
  - crest and official display name (`participant.name`, e.g. "Team Liquid Alienware"), linked to the profile by canonical `team_key`;
  - code, and the qualification seed where present ("LOS · CBLOL1");
  - entry tag "Play-In" or "Swiss · T2";
  - status only as served: Champion, Out, or a Swiss record.
- Lineups are `not_certified`, so there is **one sentence** and no roster blocks or portraits. A `registered` lineup would render (the code path exists).
- Titles are computed. There is no "Twelve teams" copy in v2.

### 3.7 Schedule

- All 46 matches from the tournament endpoint (not `/upcoming`), grouped by the viewer's local day.
- Filter chips: All / Play-In / Swiss / Knockout, with counts. The default is the stage in play or next.
- Rows link with the existing `matchHref` (`?game=<latest stored game>` / `?next=<match_id>`, none for an all-TBD slot). Match Center selection and pinning are not touched.

### 3.8 Honest states (one notice each, at the top of the body)

| State | Behaviour |
|---|---|
| `unknown` | "Schedule unavailable. …" with **Try again**. The phase label reads "Schedule unavailable"; no next match, no schedule, no stage marks; field and seeding only. Never pre-event copy |
| stale (`stale` or `sources.*.stale`) | "Showing a recent copy of the official schedule/standings from HH:MM …" with **Try again**. It recovers on the next good read (the poll or the button). The "updated" source line is hidden while stale |
| `coverage.complete === false` | "Partial schedule. 40 of 46 matches could be read …" Only the matches that exist are drawn |
| `coverage.basis === "unverified"` | One notice. No bracket layout, slots, routing, tags or champion; matches are listed with times and results |
| `bracket_authority === "incomplete"` | A per-stage notice; outcomes are not derived |
| `results_behind_calendar` warning | An info notice |
| Unsupported / malformed | "This tournament can't be shown on this version of the page" or "could not be loaded", plus an explanation. Nothing is drawn from the body |

**Shared fix (v1 too):** the error block now shows only when there is no data. Before, a failed background refetch drew "This tournament could not be loaded" **above** a still-valid page.

### 3.9 Hub

- `TournamentSpotlight` stays the compact pill in the existing header row. It reads both contracts.
  - v2 phase label, e.g. "Play-In complete".
  - v2 shows "Live X vs Y" at `2xl` when a match is live. v1 keeps its "Next" line unchanged.
  - When the featured event's read fails (anything but 404), the pill keeps the configured identity (mark + "Worlds") with `data-state="unavailable"` instead of disappearing.
- Match Center's position, the layout and PW1's Worlds selection rules are untouched.

## 4. Featured-event policy (`src/lib/pro-play/featuredTournament.ts`)

`FEATURED_EVENTS` is ordered by start day. Each entry has `contextId`, `from` (calendar day or null), `ends`, `timeZone`, and a fallback identity:

| Entry | from | ends | zone |
|---|---|---|---|
| `dcgi-2026` | null (the floor) | 2026-10-17 | Asia/Shanghai (status only) |
| `worlds-2026` | 2026-10-15 | 2026-11-14 | America/Los_Angeles |

`featuredTournament(now)` returns the **last** entry whose `from` day has arrived in **its own** timezone (`Intl.DateTimeFormat` with `timeZone`), with `status` set to `current` or `archive`.
- The switch instant is **2026-10-15T07:00:00Z** (00:00 PDT) for every visitor.
- After 14 Nov, Worlds is `archive` and stays featured. A successor needs only a new entry.
- The hub re-reads it every minute (its existing clock), so an open hub crosses midnight in Los Angeles without a reload.
- The choice is by calendar only: a failing Worlds read cannot bring DCGI back.

`PRO_PLAY_FEATURED_TOURNAMENT` is removed from `routes.ts`; its only consumer was `ProPlayHub.tsx`.

## 5. Exact changed files

| File | Change |
|---|---|
| `src/lib/pro-play/tournamentApi.ts` | v2 types, `parseTournament`, `isTournamentV2`, `TournamentUnsupported` / `TournamentMalformed`, retry policy |
| `src/lib/pro-play/tournamentV2View.ts` | **New.** Pure helpers: phase labels, stage progress, match names, slot labels, routes and edges, double- and single-elimination layouts, Swiss rounds and tiers, Play-In slot, section order, schedule default, freshness, champion, media keys, team names and captions |
| `src/lib/pro-play/featuredTournament.ts` | **New.** Featured-event policy |
| `src/lib/pro-play/routes.ts` | Removed `PRO_PLAY_FEATURED_TOURNAMENT`, with a pointer comment |
| `src/components/pro-play/tournament/TournamentParts.tsx` | **New.** Kit context, Section, Notice, TeamLine (slot provenance), MatchLine / MatchLines |
| `src/components/pro-play/tournament/TournamentBracket.tsx` | **New.** BracketMatchCard, measured Connectors, DoubleElimStage, SingleElimStage, ChampionBanner |
| `src/components/pro-play/tournament/TournamentSwiss.tsx` | **New.** Seeding, records, round tabs |
| `src/components/pro-play/tournament/TournamentV2.tsx` | **New.** Header, status panel, stage path, field, schedule, notices, phase-ordered body |
| `src/pages/pro-play/ProPlayTournament.tsx` | Version dispatch (the v1 body is untouched), contract-error copy, error-only-without-data, v2 SEO description and media keys |
| `src/components/pro-play/hub/TournamentSpotlight.tsx` | Both contracts, `fallback` identity, v2 live line |
| `src/pages/ProPlayHub.tsx` | `featuredTournament(now)` replaces the constant |
| `src/lib/pro-play/__fixtures__/tournamentWorldsPreEvent.json` | **New.** Real production body (§1) |
| `src/lib/pro-play/__fixtures__/worldsScenarios.ts` | **New.** Simulated phases written onto the real body: Play-In day 1, Play-In → Swiss, Swiss mid, Swiss → Knockout, Knockout mid, complete, partial, no standings, stale, unknown |
| Tests | **New:** `featuredTournament.test.ts` (9), `tournamentApi.test.ts` (17), `tournamentV2View.test.ts` (24), `pages/pro-play/ProPlayTournamentWorlds.test.tsx` (23).<br>**Changed:** `pages/ProPlayHub.test.tsx` (+5 tests, a per-context backend option, and DCGI pill tests pinned to 12 Oct so they stay valid after 15 Oct) |
| `docs/handoffs/PW4-B.md`, `docs/handoffs/pw4b/` | This file, screenshots, `captures.json`, `production-evidence.json` |

Not touched: backend, Railway, database, ingestion, identity registry, PW2/PW3, LIVE1 identity resolution, Match Center selection and pinning, Ranked, Daily, Arena, Studio, Matchup Explorer, subscriptions and auth.

## 6. Tests and build

**Toolchain note (this machine).** Windows Application Control now blocks rollup's native `.node` binding in the shared `node_modules` (`ERR_DLOPEN_FAILED: An Application Control policy has blocked this file`), and the shared swc is still broken.
- Vitest and the Vite build were therefore run with:
  - a scratch config (esbuild JSX instead of the swc plugin);
  - a `--require` hook mapping `@rollup/rollup-win32-x64-msvc` to rollup's own WASM build (`@rollup/wasm-node@4.64.3`, installed only in the session scratchpad).
- No repo or shared `node_modules` file was changed.
- `pnpm` was not run.

| Check | Clean base `b2b1804a` (detached worktree, same toolchain) | `pw4b/worlds-featured` |
|---|---|---|
| Focused set: `ProPlayHub.test.tsx`, `pages/pro-play`, `lib/pro-play`, `components/pro-play`, `lib/live-esports`, `pages/esports`, `lib/route-prefetch` | **42 files, 1836 / 1836** | **46 files, 1914 / 1914** (+78 new, 0 failures) |
| `tsc --noEmit -p tsconfig.app.json` | 2 errors already on main (`OnboardingProfile.tsx`, `identity/connections.ts`) | the same 2, nothing new |
| `eslint` on every touched source and test file | — | 0 errors; 1 warning: `react-refresh/only-export-components` for the `useKit` hook exported beside its provider |
| `vite build` (scratch outDir) | OK; `ProPlayTournament` chunk 15.83 kB (4.68 kB gzip); `ProPlayHub` 48.94 kB | OK in 42 s; `ProPlayTournament` 56.79 kB (14.52 kB gzip, lazy route only); `ProPlayHub` 50.49 kB (+1.5 kB) |

The prerender and verify steps of `npm run build` were not run; they need the swc / native toolchain.

**The brief's 16 scenarios, and where each is tested:**

| # | Scenario | Test |
|---|---|---|
| 1 | DCGI v1 unaffected | `ProPlayTournament.test.tsx` (all 13 original tests unchanged and green); `ProPlayTournamentWorlds › DCGI (v1) is untouched`; `tournamentApi › reads DCGI as v1, unchanged` |
| 2 | Worlds pre-event, 19-team field | `Worlds pre-event` (3 tests: order, field / tags / links / no rosters, next match + stage tiles) |
| 3 | Play-In double elimination + slot labels | `Play-In: double elimination` (2 tests); `tournamentV2View › bracket layouts`, `match names and slot provenance` |
| 4 | Play-In complete / between stages | `Play-In complete, between stages` |
| 5 | Swiss tiers, TBD draws, records | `Swiss: tiers, draws and records` (3 tests) |
| 6 | Swiss advanced / eliminated | `Swiss: advanced and eliminated, exactly as served` (2 tests) |
| 7 | Knockout progression + champion | `Knockout: progression and champion` (3 tests) |
| 8 | Partial schedule | `degraded sources › partial schedule` |
| 9 | Standings unavailable | `degraded sources › standings unavailable` |
| 10 | Stale schedule and recovery | `degraded sources › stale schedule` (Try again → fresh read; the page never blanks) |
| 11 | `unknown` phase | `degraded sources › unknown phase` |
| 12 | Unsupported contract | `unsupported or malformed contracts` (2 tests); `tournamentApi` (version, phase and 7 malformed shapes) |
| 13 | 14 → 15 Oct switch | `featuredTournament › the 14 → 15 October switch`; hub `PW4-B · featured tournament by calendar day` (23:59 PDT vs 00:00 PDT) |
| 14 | Visitor timezones at the boundary | `featuredTournament › is the same answer in every visitor timezone` (`process.env.TZ` = Kiritimati, Tokyo, London, New York, LA, Pago Pago) |
| 15 | Post-Worlds archive | `featuredTournament › keeps Worlds as a completed archive …`, `never falls back …`; hub `keeps a completed Worlds featured after 14 Nov` |
| 16 | Pinning, fixture selection, profile navigation | All 109 existing hub tests green (PW1 / PW1-A / PW1-C pinning included); `navigation into the match centre and profiles` (`?game=` latest game, `?next=`, none for all-TBD); the field's profile links |

## 7. Visual evidence (`docs/handoffs/pw4b/`, inspected)

How the captures were made:
- headless Edge (Playwright), served from this branch;
- a scratch review server: Vite plus a mock API that serves a chosen v2 body and forwards every other GET read-only to production, so crests and live feeds are real;
- the page clock set by a dev-only shim (scratch config, not repo code);
- the page scrolled before capture so every lazy crest loaded. `captures.json` records 0 pending images, 0 page errors and no horizontal overflow (`scrollWidth == clientWidth`) for every frame.

| File | Data |
|---|---|
| `worlds-pre-event-1440.png` / `-390.png` (full page) | **Real** production body |
| `worlds-play-in-live-1440.png` / `-390.png` (full) | **Simulated** results: C9 3–1 KC, FUR v MVK live |
| `worlds-between-play-in-swiss-1440.png` | Simulated: the Play-In complete, KC wins; R1 draw |
| `worlds-swiss-mid-1440.png` (full) / `-390.png` | Simulated: Swiss after 3½ rounds |
| `worlds-knockout-live-1440.png` (full) | Simulated: QF1–2 played, QF3 live |
| `worlds-complete-1440.png` (full) / `-390.png` | Simulated champion (Gen.G — **invented for the test**) |
| `worlds-unknown-1440.png`, `worlds-standings-unavailable-1440.png`, `worlds-stale-1440.png`, `worlds-partial-1440.png` | Degraded sources (simulated) |
| `hub-oct14-dcgi-1440.png`, `hub-oct15-worlds-1440.png`, `hub-oct15-worlds-390.png` | The hub before and after the switch (production feeds; the clock set to 23:30 PDT 14 Oct and 01:00 PDT 15 Oct) |
| `dcgi-unchanged-1440.png` | DCGI page from **real** production (knockout phase) |

All simulated results are fixtures (`worldsScenarios.ts`) and not predictions. The structure (ids, cells, edges, times) is upstream's.

## 8. Known limitations

1. **No Worlds league art.** The event mark is the `WORLDS` monogram until the media authority registers a `worlds` logo (as in PW1 §8.2).
2. **Two structural readings in the frontend:**
   - the inverse of slot edges (routing text and connectors);
   - the stage team count (two per match of the opening cell or round, e.g. 8 R1 matches → "16 teams").

   Both are presentation of upstream structure, not results.
3. **Bracket positions** come from the cells upstream uses today. A future renamed cell (neither "Upper Bracket -" nor "Lower Bracket -") makes the Play-In fall back to the cell list, by design.
4. **Calendar copy is from registry dates.** "Swiss begins 23 Oct" is the registry date, not localised. Match times are the viewer's local time.
5. **The tournament poll is 120 s** (unchanged). A live score on this page can lag the Match Center.
6. **The stale notice's "Try again"** re-requests immediately, but the backend's 30 s retry cooldown (PW4-A1) may serve the same stale copy until it elapses.
7. **Live data is untested.** No live Worlds match exists yet, so every live/completed frame is simulated.

## 9. Remaining launch blockers / dependencies

- **Owner review** of this branch, then merge, then Lovable Publish. It must be live **before 2026-10-15T07:00Z**, or the switch simply happens on the first load after publish.
- **PW2 LIVE1 identity (TES, TLAW, LØS).** Match Center / `live1_link` may mis-resolve these teams during Worlds. This page does not use the resolver and adds **no aliases**.
- **PW2 D2 / D6 lineups.** Rosters stay hidden until the backend serves `lineup_status: "registered"`.
- **Media:** the `worlds` league logo (optional).
- **Not verifiable until 15 Oct:** a real live Play-In match through this page and the hub (scores, `live1_game_ids` → `?game=` link).

## 10. Next recommended task

**PW4-C — launch verification on 15 Oct**, after publish:
1. capture the real live Play-In (C9 v KC, 18:00Z) on the tournament page and hub at 1440 and 390;
2. confirm `live1_game_ids` links and the `results_behind_calendar` behaviour;
3. replace the simulated "live" screenshots;
4. confirm the featured switch on the published site at 07:00Z.

Separately, the backend could serve a `worlds` league logo, and PW2's LIVE1 alias set (WS-D3) is still needed for Match Center identities.

## 11. PW4-B1: final frontend integration

| | |
|---|---|
| Branch | `pw4b/worlds-featured-integration`, on GitHub `main` `8c9c1f739685121e5606342e6e585c4c47e68178` (verified at fetch) |
| Content | PW4-B `364616b8` cherry-picked without conflicts (`4ad90158`), plus this pass. The reviewed `pw4b/worlds-featured` is untouched |
| Main delta | One commit, `8c9c1f73` "Enable Vision tile in Quiz Hub Quick Study" (5 Quiz Hub files). Those files are byte-identical to main on this branch |

### A: integration

There was no overlap with PW4-B files. The integrated tree has both the Quiz Hub change and every PW4-B file.

### B: browser-side refresh failure

The problem: a background refetch that fails in the browser kept the old React Query data on screen with no warning.

The fix:
- `ProPlayTournament` passes `query.isRefetchError` to `TournamentV2` as `refreshFailed`.
- When it is set, `Notices` adds `notice-refresh-failed`: "Couldn't get the latest update. What's shown is from the last successful response (HH:MM); it will update when the service answers again."
- The notice has a **Try again** button. It never says updated, fresh or verified.
- The last valid data stays visible.
- The backend notices (stale, partial, standings) and the 120 s polling are unchanged.
- React Query clears the notice on the next successful read.
- v1 (DCGI) is not changed.

### C: partial-schedule copy

The notice now reads: "Missing matches aren't shown, and stage outcomes are only stated where they are verified on their own." It no longer implies that a certified earlier stage becomes unfinished.

### Files

- `src/components/pro-play/tournament/TournamentV2.tsx`: the notice, the copy, and the `refreshFailed` prop.
- `src/pages/pro-play/ProPlayTournament.tsx`: one prop.
- `src/pages/pro-play/ProPlayTournamentWorlds.test.tsx`: +1 regression test and a `renderPageWithClient` helper. The test runs: success, then a failed background refetch (the outage spans the hook's two retries), then the warning with the prior data kept, then a successful retry, then the warning gone.

### Verification

Run on current main `8c9c1f73`, as a detached baseline and on the branch, with the same toolchain as §6. The focused set is §6's paths plus `src/pages/Quiz.hub.test.tsx` and `src/lib/quiz`, to cover main's new commit.

| Check | Main `8c9c1f73` | Integration branch |
|---|---|---|
| Focused set | 85 files; 2360 passed, **9 failed**, 3 skipped | 89 files; 2439 passed, **9 failed**, 3 skipped (+79 = PW4-B's 78 + 1) |
| The 9 failures | `quiz-screenshot/command.parser` + `command.reviewKey` (they spawn `/bin/sh`, which this Windows machine lacks); `Quiz.hub.test.tsx` "Leaguecraft hub" ×2 | **identical set**, all pre-existing on main; none in Pro Play |
| `ProPlayTournamentWorlds.test.tsx` | — | 24 / 24 |
| `tsc` | the 2 known errors | the same 2 |
| ESLint (touched files) | — | 0 errors |
| `vite build` | — | OK; `ProPlayTournament` chunk 57.24 kB (14.66 kB gzip) |

### Release readiness

**Ready for release approval.** Blockers outside this branch are unchanged from §9:
- publish before 2026-10-15T07:00Z;
- PW2 LIVE1 identities (TES / TLAW / LØS);
- certified lineups;
- the Worlds logo.

No merge, deploy or publish was done.
