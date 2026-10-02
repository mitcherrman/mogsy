# PPH3 — compact match dossier for the Pro Play hub

Owner-approved pass (2026-10-01). Builds on PPH2.1 (`pph1-pro-play-hub`
`d170e4bf`). Local only: not pushed, not merged.

| Repo | Worktree | Branch | Base |
|---|---|---|---|
| Frontend `mogsy` | `.worktrees/pph3-dossier` | `pph3/match-dossier` | `d170e4bf` (PPH2.1) |
| Backend `League_Combat_Simulator` | `.worktrees/pph3-upcoming` | `pph3/upcoming-schedule` | `origin/master` `9440d5e1` |

Owner decisions applied: hub sections **LIVE NOW · PREVIOUS MATCH · UP NEXT**;
match states **LIVE · COMPLETED · UPCOMING**; a real upcoming read from the
existing schedule capability, never the stale `scheduled` rows; league media
deferred to the media authority, with a designed event-media slot now.

## What changed for a reader

- **Rail per series, in three labelled groups.** Games sharing a `match_id`
  are one chip: state badge, both teams (crest when approved), series score,
  best-of. An empty LIVE NOW group is not drawn: PPH2.1 removed
  "nothing is live" copy, and the board's COMPLETED badge already says it.
- **Event band.** The league's event-media slot (typographic fallback),
  then league · tournament · stage · round in upstream's words, then the scope
  chip and best-of · date · patch on one wrapping line. On the right: the
  series score and one tab per played game, each naming its winner.
- **State badge.** LIVE (solid, pulsing), COMPLETED (solid neutral, check),
  UPCOMING (outlined, clock): word, shape and colour each carry it. A stale
  or failing game keeps the live page's own STALE / SOURCE FAILING pill and
  is never forced into one of the three.
- **Lane rows: player → champion → matchup → champion → player.** Portrait
  (only when approved art exists, by the crest rule), name, the inventory as
  item icons, K/D/A over gold, champion icon with a level badge, and the
  existing lane label + lane gold difference in the middle. CS moved to the
  K/D/A tooltip and the lane expansion. A resolved name's disambiguation
  qualifier is dropped in the row only ("Guti", tooltip and expansion keep
  "Guti (Moon Jeong-hwan)"). Phones keep PPH2.1's row; face and items move
  into the lane expansion.
- **UP NEXT.** Upstream's next fixtures (both-TBD bracket slots left out of
  the rail; at most four). Selecting one writes `?next=<match_id>` and shows
  identity, local start time and a countdown — no empty scoreboard, no lanes.
- **Full match centre (`/lol/pro-play/live`)**: the item bug is fixed there
  too, with the same shared strip.

## The item bug

LIVE1 serves `items` as Riot item IDs. `PlayerRow` read `.name` off each, so
every inventory drew as blank grey squares with empty tooltips, and the
expanded view printed nothing useful. Both surfaces now use one
`ItemStrip`: every served ID, in order, duplicates kept, trinket moved last,
art from the asset store's `assets/items/{id}.png`, names from `/api/items`.

## Data and media paths reused (no parallel resolver)

| Need | Path |
|---|---|
| Team crests | `ProPlayMediaProvider` → `/api/pro-play/media/resolve?team=` keyed by LIVE1 `resolved_page`; `TeamCrest` (`media/EntityCrest`) |
| Player portraits | Same provider, `player=` keyed by `resolved_player_page` (resolved identities only, `lanePlayerKey`); new `PlayerPortrait` in `EntityCrest` uses `useEntityMedia` and the dossier's face-crop |
| One request per screen | The hub's single provider now carries every rail team, upcoming team, and the selected game's ten players |
| Champion icons | The live page's `ChampionIcon` (champion manifest, `useChampionAssets`) |
| Item icons | `resolveAssetUrl("assets/items/{id}.png")` — the quiz/Mastery convention |
| Item names | Public `/api/items` index (`{slug,name,id}`), React Query, loaded once per session |
| Series results | Next game's `series_wins` (score entering it); the last game's own `team_state` through `isWinner` (= archive `winning_side`) using the board's own `["live-esports","game",id]` query key |
| Feed / per-game data | PPH1's `useLiveFeed` / `useLiveMatch`, unchanged |

## Upcoming-match contract — `GET /api/live-esports/upcoming`

Backend commit `1ade573e`. Public, read-only, like the rest of LIVE1.

```
{ enabled, generated_at,
  source: "getSchedule",
  source_ok: bool,          // false when upstream failed
  stale: bool,              // true when an older cached page was served
  fetched_at: iso | null,
  horizon_days: 14, limit: 12 (max 12; ?limit= narrows),
  matches: [{
    match_id, scheduled_start /* UTC */,
    league: { slug, name, region, scope /* domestic|international|null */ },
    block_name, best_of,
    teams: { a: { name, code, resolved_page, tbd }, b: {…} } }] }
```

An event is upcoming only when it is a `match`, `unstarted`, starts strictly
after the request's clock and within 14 days, **neither team has a game win**
(upstream keeps a running series `unstarted` between games — observed live:
the 15:00 EMEA Masters Bo3s at 1–1 at 17:10), and LIVE1 has not already seen
the match start. The raw page is cached 120 s and the filter re-runs per
request; on upstream failure a page under 15 min old is served with
`stale: true`, otherwise `matches: []` and `source_ok: false`. Teams resolve
through the existing `IdentityResolver`; TBD is never resolved. The store's
`scheduled` rows are not read.

Frontend: `fetchUpcoming` / `useUpcoming` (`live-esports/api.ts`, `hooks.ts`):
120 s poll, no retry, an older backend's 404 simply means no UP NEXT.

## Files

### Backend (`1ade573e`)
- `live_esports/upcoming.py` — NEW, pure filter
- `routes/live_esports.py` — `GET /upcoming`, cache, stale fallback
- `test_live_esports_upcoming.py` — NEW, 13 tests

### Frontend
| File | Change |
|---|---|
| `src/components/pro-play/hub/MatchCenter.tsx` | Rail per series in LIVE NOW / PREVIOUS MATCH / UP NEXT; game tabs after the selected chip; event band; state badge under the score; upcoming board; responsive crest |
| `src/components/pro-play/hub/MatchWorkspace.tsx` | Lane rows: art-only portrait, item strip, K/D/A over gold, champion + level; expansion carries CS, and the face + items on phones |
| `src/components/pro-play/hub/MatchStateBadge.tsx` | NEW. LIVE / COMPLETED / UPCOMING |
| `src/components/pro-play/media/ItemIcon.tsx` | NEW. `ItemIcon`, `ItemStrip`, `inventory`, `itemIconUrl`, `useItemNames` |
| `src/components/pro-play/media/EventMark.tsx` | NEW. League/event media slot, typographic fallback, fixed geometry |
| `src/components/pro-play/media/EntityCrest.tsx` | NEW `PlayerPortrait` (media authority, face crop, `artOnly`) |
| `src/lib/pro-play/hubSeries.ts` | NEW. `groupSeries`, `gamesNeedingResult`, `gameState`, `seriesOf`, `countdown`, `localStart`, `leagueMonogram`, `railUpcoming` |
| `src/lib/pro-play/hubSelection.ts` | `laneRowShortName` |
| `src/lib/live-esports/api.ts`, `hooks.ts` | `UpcomingMatch` types, `fetchUpcoming`, `useUpcoming` |
| `src/pages/ProPlayHub.tsx` | Series + final-result queries, `?next=`, one media request for every rail team, upcoming team and lane player |
| `src/pages/esports/live/components.tsx` | `PlayerRow` uses the shared item strip (the bug fix) |
| Tests | NEW `hubSeries.test.ts` (13), `ItemIcon.test.tsx` (5); `ProPlayHub.test.tsx` (+12, 2 updated for the new structure), `hubSelection.test.ts` (+2), `EsportsLivePage.test.tsx` (+1) |
| `docs/pph3/` | Screenshots |

## Tests

- Backend: `test_live_esports_upcoming.py` 13/13; with the neighbouring LIVE1
  suites (phase4a read models, poller routes, phase4b1 competition, history
  archive, core) 143/143.
- Frontend focused run (hub, pro-play libs/components/pages, live-esports,
  esports/live, ProPlayGraphs): **1107 passed, 5 failed**. The 5 are the
  `ArchivePage` filter/pagination tests, which time out identically on the
  untouched PPH2.1 base (`d170e4bf`, run in `.worktrees/pph1-hub`) — not this
  pass.
- `tsc -p tsconfig.app.json`: 6 errors, all pre-existing (onboarding,
  identity, quiz test); none in touched files. ESLint on changed files:
  0 errors, 4 `react-refresh/only-export-components` warnings (same pattern as
  `ProPlayMediaProvider`). `npm run build`: green; hub chunk 80.2 kB
  (23.6 kB gzip). `public/sitemap.xml` restored after the build.

## Visual verification

Real data, headless Chromium, 1440×900 / 834×1112 / 390×844. Production API
through a local verification proxy that served the NEW `/upcoming` route from
the backend worktree and the backend's own `/assets` mount (production's
asset host was timing out from this machine); every other request was
production's answer.

| Case | Game | 1440 board ends | 834 | 390 |
|---|---|---|---|---|
| Completed Bo5 (unresolved team LOS, no media) | CBLOL LOS 3–0 KBM, G3 | **870** | 1214 | 1690 |
| Completed Bo5, academy teams (no media), G1 aged out of the feed | WSCI T1A 3–1 GL, G4 | **886** | 1204 | 1685 |
| Bo1 (archived, full telemetry) | EMEA Masters BIG vs FEC | **897** | 1232 | 1694 |
| Teams/players WITH approved media | LCK Finals GEN vs HLE, G4 | **893** | 1227 | 1694 |
| Upcoming (real, from getSchedule) | CBLOL LOS vs EST, 21:00 UTC | 407 | 407 | 492 |
| Live | none available: upstream `getLive` had only an EMEA Masters broadcast "show" at 18:54 UTC | — | — | — |

Every case: no horizontal overflow, no clipped text, every visible item icon
and champion icon loaded (61–68 items per desktop board), no page errors.
The media case drew 11 approved portraits and HLE's crest. PPH2.1's board
ended at 883 px at 1440×900; this pass ends at 870–897, so the match stays on
one desktop screen. Phone boards end at 1685–1694 px (≈2.0 screens of 844;
PPH2.1: 1671).

Fixed during verification: item strips clipped by `overflow-hidden` (now
14 px icons that wrap, never drop); long names squeezed by monogram frames
(portraits now art-only); the event band wrapping to three lines (game tabs
moved into the rail); a full-size crest crushing the team name on phones
(44 px below `sm`).

Screenshots: `docs/pph3/` (`<case>-<viewport>.jpg`).

## Known media/data gaps

- **League/event marks**: no league entity in the media authority — the slot
  shows the league's short name (follow-up 1).
- **Gen.G (LCK Finals G4) has no crest**: LIVE1 did not resolve
  "Gen.G Esports" to a canonical team (`resolved_page: null`), so no crest is
  requested — an identity gap in LIVE1, not a media one. HLE resolves and
  draws its crest.
- **Portrait coverage**: academy and lower-league players (T1A, GL, LOS,
  KBM, BIG, FEC) have no approved portraits; rows draw no face for them.
- **Unresolved teams/players** (LOS; LOS Zest) carry no canonical key, so no
  media is asked for them by design.
- **Item names**: the public item index omits trinkets/consumables; those
  icons still draw, titled "Item <id>".
- **Upcoming crests locally**: the roster identity DB is not on this machine,
  so the proxy's upcoming teams were unresolved here (names shown). On
  production the same `IdentityResolver` resolves them.
- **Items are an inventory snapshot** at the latest stored frame, not a
  purchase order; nothing claims a build path.

## Follow-ups

1. **League/event media in the media authority**: add a `league` entity type
   (ingested and approved like crests; upstream `getLeagues.image` is an
   external URL and must be ingested, never hot-linked). `EventMark` already
   takes a `src`; only the caller changes.
2. **Deploy the backend** before merging the frontend's UP NEXT expectations
   (the frontend degrades to "no UP NEXT" until then).
3. Archived pinned games show no series bar (series are grouped from the
   bounded feed); a `match_id` filter on `/history` would fix it.
4. Portrait coverage: only approved players get faces (e.g. Chovy, Faker).
