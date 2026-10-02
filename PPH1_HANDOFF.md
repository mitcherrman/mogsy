# PPH1 — Pro Play hub V1 (Match Center · Match Workspace · Discovery)

Worktree `.worktrees/pph1-hub`, branch `pph1-pro-play-hub`, based on
`origin/main` 6231bfb6. Local only: not pushed, not merged.

Source contract: the read-only Pro Play hub audit (previous session,
2026-09-30), approved with these owner decisions: no Upcoming until an
authoritative schedule endpoint exists; no match-specific quiz; never expose
the admin-only Matchup Explorer from the workspace.

## Uncommitted WIP in the primary checkout — NOT touched

The primary `mogsy` checkout (branch `envvis1-batch1-scene-channel`, 274
behind origin/main) carries someone's uncommitted edits:

| File | What it is | Status here |
|---|---|---|
| `src/lib/pro-play/statsApi.ts` | `getProPlayerEarlyGame` + `EarlyGameMetric` types. Field names (`games`, `coverage_pct`, `first_game_date`…) do not match the backend (`contributing_games`, `canonical_coverage_pct`, …) | Not present on origin/main; this worktree does not contain or import it |
| `src/pages/pro-play/ProPlayPlayerProfile.tsx` | "Early Game / Laning" panel on top of the above | Same |
| `src/pages/CombatLab.tsx` + header test | Unrelated Combat Lab change | Same |

PPH1 does not edit `statsApi.ts`, `ProPlayPlayerProfile.tsx` or
`CombatLab.tsx` at all.

## Plan

### 1. Data layer (no Live behaviour change)

- `src/lib/live-esports/hooks.ts` (new)
  - `useLiveFeed()` — the feed query exactly as the Live page runs it
    (`["live-esports","feed"]`, 10 s poll, refetch on focus), plus memoised
    `live` / `recent` / `selectable` and `failing`.
  - `useLiveMatch(gameId, feedSummary)` — the four per-game queries
    (`game`, `players`, `gold`, `insights`) with the Live page's exact
    cadence rules, plus `selected` (feed summary, else the detail read's own
    summary) and `isFinal`.
  - Same React Query keys, so the hub and the match centre share a cache.
- `EsportsLivePage.tsx` consumes both hooks; selection, states and
  rendering are unchanged. `isWinner` moves to `live/lib.ts` (exported) so
  the hub can use the same rule. `ChampionIcon` in `components.tsx` is
  exported (unchanged).
- `src/lib/pro-play/hubSelection.ts` (new, pure + tested)
  - `pickHubGame(live, recent)`: first live → first recent with freshness
    `final` → first recent → null.
  - `nextHubAutoGame(current, live, recent)`: keeps the current auto pick
    while it is still in the feed and is either live or nothing is live;
    otherwise re-picks (so a game going live takes over an auto-selected
    recent game, but two live games never flip-flop on poll order).
  - `?game=` always wins and is never rewritten by the auto pick.
  - `laneMatchups(players)`: top/jungle/mid/bottom/support pairs from
    `role` + `side` (upstream `participantMetadata.role`, verified one per
    side in BE `live_esports/insights.py:69`). A lane missing either side is
    not offered.
- `src/graph1/featuredHref.ts` (new): `selectionHref` moved out of
  `ProPlayGraphs.tsx` (re-exported there, unchanged) so the hub can render
  `FeaturedGraphs` without importing the graphs page.

### 2. Hub UI

`src/pages/ProPlayHub.tsx` becomes the composition; new components under
`src/components/pro-play/hub/`:

- `MatchCenter.tsx` — rail (`MatchCard`, plus a card for a pinned game not
  in the feed), compact summary (`StatusPill`, `MatchContext`, two
  `TeamPanel`s, top insight rows + game story via `insightRows` /
  `buildStory`), gold chart only when ≥2 gold points exist, links to the full
  match centre (`proPlayLiveGameUrl`) and the archive. Existing empty /
  failing / paused / pinned-missing states, worded for the hub.
- `MatchWorkspace.tsx` — props only (`game`, `players`, `manifest`): lane
  picker, the two lane players (`useEntityStats("players", lp_page)`,
  profile / graph / stats-row links; unresolved players stay plain text),
  team profile links, `ChampionMatchupPanel` via `useGraph1ChampionMatchup`
  (blue champion = subject), and study links: Combat Lab, Leaguecraft
  matchup study, Pro Data pair graph, Archives page per champion. No
  Matchup Explorer link, no quiz.
- `ProPlayDiscovery.tsx` — search form → `/lol/pro-play/search?q=`,
  `FeaturedGraphs`, full-tool tiles (existing `HexPanelLink` set + archive).
- `ProStatsExplorer` stays on the hub, unchanged, at `#pro-stats`. When the
  hub opens with Stats Explorer params (`view`, `player`, `year`, …) — i.e.
  from a profile's "View in Pro Stats" link — the page scrolls to it.

### 3. Tests

- `src/lib/pro-play/hubSelection.test.ts` — selection + lanes.
- `src/lib/live-esports/hooks.test.tsx` — cadence parity (final game stops
  polling; pinned archived game resolves from detail).
- `src/pages/ProPlayHub.test.tsx` — updated for the new hub (match center
  default/pinned/empty/failing, workspace lanes + links, no Explorer link in
  the workspace, search entry, featured graphs, explorer kept).
- Existing `EsportsLivePage.test.tsx`, `ArchivePage.test.tsx`,
  `ProPlayGraphs.test.tsx` must stay green unchanged.

### 4. Visual pass

One gold Pro Play language across the three sections (section kickers,
framed Match Center stage, consistent card surfaces), checked in the browser
at 375 / 768 / 1280.

## Known interactions / limits (by design for V1)

- The Stats Explorer's "Clear all" writes `?view=` only, which also drops
  `?game=`; the hub then returns to its auto pick. Not changed (Explorer is
  out of scope).
- Live → canonical game mapping does not exist, so no meeting/game dossier,
  early-game numbers or per-match quiz.
- Upcoming is absent (no authoritative schedule endpoint).

## Status — implemented (local, not pushed)

Commits on `pph1-pro-play-hub`:

- `ba634b76` — structural/data layer, hub sections, tests.
- `f10cddf0` — visual pass.
- docs commit — this handoff + `docs/pph1/` screenshots.

### What changed

| File | Change |
|---|---|
| `src/lib/live-esports/hooks.ts` | NEW. `useLiveFeed`, `useLiveMatch` — the Live page's queries, keys and cadence, moved verbatim |
| `src/pages/esports/live/EsportsLivePage.tsx` | Uses the two hooks. Selection, states and rendering unchanged |
| `src/pages/esports/live/lib.ts` | `isWinner` moved here (exported), unchanged |
| `src/pages/esports/live/components.tsx` | `ChampionIcon` exported, unchanged |
| `src/lib/pro-play/hubSelection.ts` | NEW. `pickHubGame`, `nextHubAutoGame`, `laneMatchups`, lane identity helpers |
| `src/graph1/featuredHref.ts` | NEW. `selectionHref` + graph param names moved out of the graphs page |
| `src/pages/lol/ProPlayGraphs.tsx` | Imports/re-exports `selectionHref`; `PARAM` now aliases the shared constant |
| `src/components/pro-play/hub/HubSection.tsx` | NEW. Shared section frame + gold kicker |
| `src/components/pro-play/hub/MatchCenter.tsx` | NEW. Rail, compact summary, states, full-match/archive links |
| `src/components/pro-play/hub/MatchWorkspace.tsx` | NEW. Lane picker, lane players, champion pair, study links, team links |
| `src/components/pro-play/hub/ProPlayDiscovery.tsx` | NEW. Search entry, 6 featured graphs, full-tool tiles (+ Match Archive tile) |
| `src/pages/ProPlayHub.tsx` | Rewritten as the composition; owns `?game=` selection; Stats Explorer kept at `#pro-stats` with scroll-on-arrival |
| Tests | NEW `hubSelection.test.ts` (15), `hooks.test.tsx` (4); `ProPlayHub.test.tsx` rewritten (31) |

`statsApi.ts`, `ProPlayPlayerProfile.tsx`, `CombatLab.tsx`, `ProStatsExplorer.tsx`
and the ArchivePage are untouched.

### Verification

- New + affected suites: `ProPlayHub`, `hubSelection`, `hooks`,
  `EsportsLivePage`, `ProPlayGraphs` — 111/111 green. The `EsportsLivePage`
  tests are unchanged and still pass after the hook extraction.
- Broad run (Pro Play pages/components, esports, lol, graph1, lib/pro-play,
  lib/live-esports, quiz/legacy redirect): 1670/1672. The 2 failures are
  `ArchivePage.test.tsx` filter tests timing out under parallel load. They
  were already failing the same way on the untouched origin/main baseline
  before any PPH1 edit (5 timeouts at the default 5s) and pass when the file
  is run alone (re-run after PPH1: 67/67).
- `vite build` succeeds; the hub chunk `ProPlayHub-*.js` is 60.4 kB (17.9 kB gzip).
- `tsc -p tsconfig.app.json`: no errors in touched files. The repo has
  existing errors elsewhere (onboarding, identity, quiz tests).
- Browser (dev server against the production API, 2026-09-30): real data
  (CBLOL LOS vs KBM, final). Checked at 1280 / 768 / 375 with no horizontal
  page overflow. `/lol/pro-play/live` renders unchanged. No console errors.
  Screenshots are in `docs/pph1/`.

### Open owner decisions / what remains

1. **Matchup Explorer tile** is still in Full tools (existing behaviour, with
   its SFX). Public readers land on its auth wall. Drop it, show it to admins
   only, or ungate the Explorer? The workspace never links it.
2. **Upcoming** — needs a schedule endpoint (`getSchedule` + `live_series`
   already exist backend-side). Not built, and there is no placeholder.
3. **Live → canonical game mapping** would unlock the meeting/game dossier,
   early-game lane numbers and any per-match quiz. Backend work.
4. **Champion season row** in the workspace was left out (the champion stats
   request must be year-bounded, which needs the filters call). It's a cheap
   follow-on using the champion profile's pattern.
5. `useEntityStats` is plain `useEffect` state, not React Query, so lane
   switches refetch the player rows (about 250–310 ms each). It could move
   to React Query in its own pass.
6. **Full match centre → profiles**: the live page still links to no
   profiles. It's a cheap follow-on and the hub's lane helpers make it
   trivial.
7. The Stats Explorer's "Clear all" drops `?game=`, so the hub falls back
   to its auto pick. That's a known interaction and the Explorer was left
   unchanged.
8. `FeaturedGraphs` renders its own `h2` ("Start here") inside the Discover
   section's `h2`. This is cosmetic heading nesting from the existing
   component.

---

# PPH2.1 — compact match-board refinement (2026-10-01)

Visual/layout pass only, implementing the approved PPH2.1 concept plus the
seven refinements. No backend, API contract, selection logic, `?game=`,
Live page, Stats Explorer or entity-resolution change. Upcoming, a public
Matchup Explorer link in the match area, and any per-match quiz stay out.

## Composition

- **Header**: back to Academy · small "Pro Play" · search (moved here from
  Discovery so it is usable first) · "Player statistics" anchor. The large
  title block and gold wash are gone.
- **Match Center = one board**: compact rail chips → score header → one
  merged metadata line → lanes | objectives + gold.
  - Team identity: real `TeamCrest` when the canonical team resolves to art;
    otherwise the full team name in restrained side colour (no initials box).
    Team name links to the profile when `resolved_page` exists.
  - Score is the two teams' kills; `StatusPill` + clock under it. "Nothing is
    live" copy removed; FINAL/Done already says it.
  - Objectives (gold/towers/drakes/inhibitors/barons) mirrored; one 5-up row
    on phones. Gold chart is the live page's `GoldChart`. "Open full match
    centre" and "Match archive" are quiet text links.
- **Lanes inside the board**: five mirrored rows (name + CS·gold → KDA →
  44px/40px champion icon toward the centre), thin side stripes, lane label +
  chevron + per-lane gold difference (blue − red from the two players'
  `total_gold`; hidden when either is null). Selected row opens in place —
  no nested card — with compact champion-pair record (+ sample disclaimer),
  one career line per player, player text links, and one row of study links.
- **Discovery** beside the board: 4 featured questions with real champion
  icons, a 3-row glimpse of the Stats Explorer's own default request (same
  React Query key, so no second fetch) fading into "Full player statistics
  below", and the full-tools nav (one quiet line on desktop, tap grid on
  phones).

## Files

| File | Change |
|---|---|
| `src/pages/ProPlayHub.tsx` | Minimal header with search; board + Discovery grid; lanes passed into the Match Center |
| `src/components/pro-play/hub/MatchCenter.tsx` | Rewritten as the single match board |
| `src/components/pro-play/hub/MatchWorkspace.tsx` | Mirrored lane rows + in-place expansion (replaces picker + `ChampionMatchupPanel`) |
| `src/components/pro-play/hub/ProPlayDiscovery.tsx` | Compact search export, featured list, stats glimpse, single tools nav (short labels, description as `title`) |
| `src/components/pro-play/hub/HubSection.tsx` | Unused section frame removed; `HubKicker` kept |
| `src/lib/pro-play/hubSelection.ts` | `laneGoldDiff`, `signedKGold`, `laneRowName` (drops this team's broadcast tag from an unresolved in-game name), `HUB_LANE_SHORT` |
| `src/pages/esports/live/components.tsx` | `ChampionIcon` gains optional `className`; default render unchanged |
| tests | `hubSelection.test.ts` (+3 describes), `ProPlayHub.test.tsx` updated for the board (+5 tests) |

## Verification

- Browser, dev server on the production API, real CBLOL LOS vs KBM (final):
  - 1440×900: whole board ends at 883px; Player Statistics starts at 899. No
    truncated text, no horizontal overflow, no console errors.
  - 390×844 / 375×812: no horizontal overflow; nothing truncated; all hub
    links/buttons ≥44px tall except the search box's inner input (the 44px
    form control is the target). Board ends at 1671px, Discovery at
    ~2070–2124px (≈2.5 screens; the match board alone ≈1.8).
  - `/lol/pro-play/live` unchanged (same 32px icons, no errors).
- Long team name: unit-tested (`names a team in full when no crest resolves`).
- Unresolved player: real data (LOS Zest) shows "Not matched to a Pro Play
  profile — no career record", no profile links.
