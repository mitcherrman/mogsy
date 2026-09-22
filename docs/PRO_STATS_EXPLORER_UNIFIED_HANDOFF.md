# PSE-UNIFY — the Pro Stats Explorer as one Search / View / Filters product

*(2026-09-22. Frontend `main` + backend `master`. Route: `/lol/pro-play`,
component `src/components/pro-play/ProStatsExplorer.tsx`.)*

## 1. The old architecture (audited, measured)

| Piece | Before |
|---|---|
| Route | `/lol/pro-play` (hub) renders `ProStatsExplorer` inline below the module tiles; state is the hub URL's query string |
| Search surface | a separate page, `/lol/pro-play/search` (`ProPlaySearch.tsx`), linked from a hub tile "Search Pro Play" |
| Search backend | `GET /api/pro-play/research/search` (2-char floor, ambiguity verdicts, compound "Faker Azir"), `GET /api/pro-play/research/autocomplete` (prefix, one kind per call, players/teams only) |
| Table endpoints | `GET /api/pro-play/stats/{players,teams,champions}` — server-side sort/pagination, default scope = latest season when no scope is named |
| Filter metadata | `GET /api/pro-play/stats/filters` — leagues (323 formal names), patches, champions, roles, years |
| Entity-type controls | the View tabs (Players/Teams/Champions) **and** Player / Team / Champion filter pickers **and** the hub's Search tile ("Find players, teams and champions") — the same three nouns asked three ways |
| Filter state | URL params `view, year, league, patch, role, player, team, champion, min_games, sort, dir, page`; all server-side |
| Aliases | none for leagues. `league=LCK` returned **zero rows** (`league_slug` is "LoL Champions Korea"); "Worlds" matched nothing in search |
| Loading | skeleton rows existed, but every filter select read **"All"** with an empty list while `/filters` was pending |

### Why the first load took ~15–30 s (measured on production, 2026-09-22)

Live `mogzy.lol`, cold, one navigation:

```
T+1.6s   shell (DOMContentLoaded)
T+3.5s   ProPlayHub chunk + researchApi chunk loaded
T+3.8s   /stats/filters and /stats/players start (in parallel — no waterfall)
T+14.7s  /stats/filters done   (10.9 s)
T+18.4s  /stats/players done   (14.6 s)  -> first rows
```

Same endpoints, repeated: filters **0.39 s**, players **0.84 s**; first
`/research/autocomplete` after a deploy **5.1 s**, then **0.24 s**.

**The bottleneck is the cold first touch, not the SQL and not the frontend.**
Every deploy (master auto-deploys many times a day) restarts the process and
the Railway volume's SQLite page cache is cold; the explorer's first screen
then pays 7–15 s per endpoint, two or three at once, and the search index
(built lazily on first search) another ~5 s. A never-before-read slice
(e.g. players 2017) costs ~4.5 s cold vs 0.7 s warm. Payloads are small
(7–11 KB); there is no request waterfall between the table and the filters.

## 2. The new model

```
Search   -> find an entity/context by name, from the first paint
View     -> Players | Teams | Champions: what ONE ROW is
Filters  -> which population is counted (chips show every active one)
Table    -> the sortable statistical result
```

* **Search** — `ExplorerSearch.tsx`, one input, placeholder
  *"Search players, teams, champions, leagues, events…"*. Backed by the new
  `GET /api/pro-play/stats/lookup?q=` (one request, five kinds, grouped).
  Choosing a result **applies** it (writes URL filter params); player / team /
  champion rows carry a secondary **Profile** link; the footer's **All
  results** opens `/lol/pro-play/search?q=` for disambiguation and compound
  queries. It never waits for the table or the filter options.
* **View** — the one `role="tablist"` labelled **View**. Nothing else on the
  page selects a row type.
* **Filters** — Year, League / Event, Patch, Role, Min. games in the bar.
  Player, team and champion are filters too, but are **set by Search** and
  shown as chips — the three per-field pickers are gone from the bar, which
  is what removed the duplicated Players/Teams/Champions vocabulary.
* **Active filters** — every URL filter is a chip (`League LCK ×`,
  `Year 2025 ×`, `Player Faker ×` …); entity chips link to the profile; a
  defaulted season shows as a non-removable `Latest season · 2026`; **Clear
  all** keeps the view. Graph this and its "staying with the table" note are
  unchanged.

### Search-tab decision

The hub tile **Search Pro Play is removed** (it asked the same question as
the explorer's search, on the same page). The **route `/lol/pro-play/search`
is kept**: it still owns ambiguity prompts, compound interpretation
("Faker Azir"), zero-game registry names and indexable `?q=` links, and it is
where the explorer's *All results* and the profiles' breadcrumbs go. No
backend search infrastructure was removed.

## 3. League / event naming — the alias authority

**Authority: backend `pro_authority/competition_search.py`**, built on the
existing `pro_authority/competition_policy.py` (which already classifies
major / international / regional / retired competitions). The frontend holds
**no alias table**: `/stats/filters` now returns a `competitions` catalog
(`slug, code, name, region, kind, note, games, first_year, last_year`) beside
the unchanged `leagues` list, and `/stats/lookup` returns labelled results.
`competition_policy.LEAGUE_DISPLAY_NAMES` (quiz/Graph1 copy) is untouched.

Rules: the filter value is always the stored `league_slug`; an alias names
exactly one slug (validated at import — a duplicate raises); historical names
keep their own identity (EU LCS is shown as "LEC before 2019", never folded
into the LEC); matching folds case, width and punctuation (`LTA-South`,
`lck cl`, `Mid Season Invitational`). A stray source tag `lck` is shadowed
in search so "LCK" never offers two LCKs; it keeps its own name in the list.

| Typed | Resolves to (`league_slug`) | Shown as |
|---|---|---|
| LCK | LoL Champions Korea | LCK · Korea |
| LPL | Tencent LoL Pro League | LPL · China |
| LEC | LoL EMEA Championship | LEC · EMEA |
| LCS | League of Legends Championship Series | LCS · North America |
| LTA | League of Legends Championship of The Americas | LTA · cross-conference championship (LTA North / LTA South listed beside it) |
| LTA North / LTAN, LTA South / LTAS | the two conferences | LTA North / LTA South |
| LCP | League of Legends Championship Pacific | LCP · Asia-Pacific |
| PCS, VCS, CBLOL, LJL, LLA, TCL | the regional championships | code · region |
| LMS, OPL, LCL, GPL, LLN, CLN, CLS | retired regional championships | code · region |
| EU LCS, NA LCS, OGN Champions | the predecessors | code · "LEC/LCS before 2019", "LCK before 2015" |
| LCK CL, CK, LCK AS, LDL, NACL, NA Academy, EMEA Masters, EU Masters, LFL, Prime League, NLC, SuperLiga, LCO | second tiers / national leagues | code · region |
| Worlds, WCS, World Championship(s) | World Championship | **Event** Worlds |
| MSI, Mid Season Invitational | Mid-Season Invitational | **Event** MSI |
| First Stand, EWC, KeSPA Cup, IEM | the international / cup events | **Event** |
| "Worlds 2025", "MSI 2024", "LCK 2024" | slug **+ `year`** | `Worlds 2025` (only offered if that year has games) |

A bare event query also lists its two most recent editions
(`Worlds`, `Worlds 2025`, `Worlds 2024`). Region words ("Korea") list
candidates but never resolve on their own.

## 4. Naming audit (display only — no canonical key changed)

| Before | After | Why |
|---|---|---|
| League (323 formal names: "LoL Champions Korea") | **League / Event**, options shown as `LCK`, `Worlds` with region · official name · years beneath; the official name still matches when typed | the list holds Worlds/MSI too; nobody types the formal name |
| League chip / value `World Championship` | `Event Worlds` | international events are events |
| Role `Bot` | **Bot (ADC)** (value sent is still `Bot`) | both words are in use |
| Min Games | **Min. games** | sentence case, matches the other labels |
| Player / Team (free-standing pickers) | Search + `Player …` / `Team …` chips | one place to find an entity |
| Champion (native select, 172 names) | Search (`Ahri`, `K'Sante`, `ksante`) + `Champion …` chip | same |
| Year | Year (unchanged) | it filters calendar year of game date; "Season" collides with splits |
| Patch | Patch (unchanged) | accurate |
| "Clear filters" | **Clear all** | it clears every chip |

## 5. Loading, empty and error — never confused

* **Immediately:** page shell, Search (interactive at first paint), View,
  Min. games, the table frame with skeleton rows and a *visible* caption
  "Loading player statistics… Search above already works."
* **Filters whose options have not arrived** are disabled and read
  **Loading…** — never "All". A value already in the URL still shows.
* **Refetch after a filter change:** the previous rows stay, dimmed, with
  "Updating for the new filters…"; pagination is disabled meanwhile.
  Placeholder rows are only reused for the **same view** (a Players page no
  longer flashes under Team columns).
* **Zero results:** "No players match these filters." + "The data loaded;
  this combination has no games" + **Clear all filters**.
* **Error:** "Couldn't load player statistics." + the server message + "Your
  filters are kept" + **Try again**. Search has its own error line
  ("Search is unavailable right now. The table and filters below still
  work.") and retries once, not three times.
* `data-state` on `[data-testid=stats-table]` is `loading | updating | ready
  | empty | error` for tests and diagnostics.

## 6. Performance changes

Backend (`pro_authority/stats_cache.py`, `routes/pro_play_stats.py`,
`api_server.py`):

* **Response cache** over `/filters`, league coverage and every leaderboard
  page: corpus fingerprint (`MAX(rowid)` of the three canonical tables — O(log
  n)) + 10 min TTL + stale-while-revalidate up to 6 h + single-flight. A
  changed fingerprint (new games) is never served stale. In-memory databases
  are never cached (tests).
* **Startup warm-up** (daemon thread; `PRO_STATS_WARMUP=0` disables; off under
  pytest): builds the search index, `/filters`, and the three default table
  pages right after boot, so the first reader after a deploy hits memory.
* `/lookup` reads only the in-memory entity index and cached coverage.

Frontend: Search decoupled from the table (its own query); no new waterfall;
placeholder rows restricted to the same view.

### Before / after

| Milestone | Before (live, cold) | After — measured | After — expected once backend deploys |
|---|---|---|---|
| Shell | 1.6 s | unchanged | unchanged |
| Search usable | **no universal search**; per-field autocomplete 5.1 s cold | **at first paint of the explorer (2.1 s on the dev server)**, independent of the table | lookup ≈ 0.2 s round trip (index pre-built at boot) |
| Filter options usable | 14.7 s (showed "All" meanwhile) | shown as Loading… until ready | ≈ network RTT (cached at boot) |
| First rows (default view) | 18.4 s | unchanged until deploy | ≈ network RTT (cached at boot) |
| First rows, never-read slice | ~4.5–16 s cold | same (Search usable meanwhile; loading state explicit) | same first time, instant thereafter |

Re-measure after deploy:

```bash
curl -s -o /dev/null -w "%{time_total}\n" "https://web-production-83e53.up.railway.app/api/pro-play/stats/filters"
curl -s -o /dev/null -w "%{time_total}\n" "https://web-production-83e53.up.railway.app/api/pro-play/stats/players?sort=games&dir=desc&page_size=25"
curl -s "https://web-production-83e53.up.railway.app/api/pro-play/stats/lookup?q=LCK"
```

## 7. URL state

Unchanged keys: `view, year, league, patch, role, player, team, champion,
min_games, sort, dir, page`. Search writes these same keys (one history
entry per selection) — there is no hidden search state. Verified: refresh
restores chips and rows; Back/Forward walk search-applied filters; a shared
`?league=World+Championship&year=2025&view=teams` opens exactly that.

## 8. Files

Frontend: `src/components/pro-play/ExplorerSearch.tsx` (new),
`src/lib/pro-play/explorerSearch.ts` (new),
`src/components/pro-play/ProStatsExplorer.tsx`,
`src/components/pro-play/FilterCombobox.tsx` (keywords, hints, Loading…),
`src/pages/ProPlayHub.tsx`, tests `StatsFilterUx.test.tsx`,
`ProStatsExplorer.test.tsx`, `ProPlayHub.test.tsx`.

Backend: `pro_authority/competition_search.py` (new),
`pro_authority/explorer_lookup.py` (new), `pro_authority/stats_cache.py`
(new), `routes/pro_play_stats.py`, `api_server.py`, `conftest.py`, tests
`test_pro_play_explorer_search.py` (new).

## 9. Tests

* Backend: `test_pro_play_explorer_search.py` 76 tests (aliases, collisions,
  shadowing, events + editions, grouped lookup, punctuation folding, zero-game
  exclusion, malformed queries, cache hit/invalidation/stale/single-flight,
  HTTP, warm-up). Affected suites: 342 passed, 23 skipped, **1 pre-existing
  failure on master** (`test_early_game_filters_apply_to_canonical_scope`,
  unrelated `role` filter on early-game).
* Frontend: `StatsFilterUx.test.tsx` 47, `ProStatsExplorer.test.tsx` 61,
  all pro-play suites 741 passed; hub + Layout + quiz-adjacent 70 passed.

## 10. Remaining, non-blocking

1. The placeholder truncates at 375 px ("Search players, teams, champior…");
   the input is still full-width and first.
2. The Year control stays a native select (fast and accessible); if more
   seasons accumulate a combobox may read better.
3. `lck` (stray source tag, zero player rows) stays in the League list under
   its own name. Cleaning the source row is an ingest task, not a display one.
4. A never-read slice is still cold the first time (~4–16 s). The loading
   state is explicit and Search works meanwhile; precomputing every slice is
   not justified by the data.
