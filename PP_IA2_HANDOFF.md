# PP-IA2: Match Center truth and scope cleanup (handoff)

**Status: implemented and tested on local branches. Not merged, pushed or deployed.** It needs control-center review before integration.

| | Branch | Worktree | Base | Head |
|---|---|---|---|---|
| Frontend | `ppia2/match-center-truth` | `C:\Users\mlmit\mogzy-wt\ppia2-frontend` | `a1958ff3` (origin/main at start) | see `git log` |
| Backend | `ppia2/live1-result-truth` | `C:\Users\mlmit\mogzy-wt\ppia2-backend` | `62774dfd` (origin/master) | see `git log` |

**Repo heads.** Both repos matched the expected heads when the pass began. During the pass, frontend `origin/main` moved to `d84c0ddd` with two commits, `SCBS1` (Stat Check Arena, `src/pages/dev/ranked-shell-probe/*` and similar). They touch no Pro Play, esports, route or `App.tsx` file. Backend `origin/master` did not move.

**Product rule applied.** The core board answers one question: *what happened in THIS game?* Every number in it is either this game's own, from the feed, or a result from Riot's series record. Anything wider sits behind a labelled scope change.

---

## 1. Which PP-IA1 claims reproduced

Each claim was checked against current code and real production data: anonymous GETs on 2026-10-05, the whole 1,276-row `/history` catalogue, and `/games/{id}` for all 1,257 finished games.

| PP-IA1 claim | Reproduced? | Evidence |
|---|---|---|
| Duration is a wall-clock frame span, wrong both ways | **Yes** | `lib.ts gameClock` = `first_frame_ts` → `freshness.source_frame_ts`. The final's spans are G1 20:27:19→20:53:40 (26:21), G2 21:15:39→21:58:47 (43:08), G3 22:20:27→23:01:59 (41:32) and G4 23:23:09→23:58:29 (35:20). Production rendered "Game 4 · 35:20" (`docs/pp-ia2/before-prod-1440.jpg`). |
| The gold-graph axis uses the same clock | **Yes** | The `/gold` `t` is seconds since the first stored sample. The production G4 axis runs 9:50→35:20. |
| The winner is a heuristic | **Yes**, and it is measurably wrong | The heuristic `isWinner` / `history.winning_side` decides by inhibitors, then a tower lead above 2. Across the corpus, mapped by team id, the series record (§3) disagrees with it on **6** games: base races and comebacks, e.g. LCK KT–DK G2, CBLOL FUR–LOS G1, Prime League KHK–USE G1. It abstains on **28** more that the record decides. |
| "Series 2–1" on G4 is the score before the game | **Yes** | The `/live` page prints `seriesContext` as "Series 2–1" (`series_wins` is captured while a game is current). The hub's pinned G4 chip showed no series score at all, because the final had aged out of the 6-game feed tail. |
| The big "15 : 1" is unlabelled | **Yes** | It had only an `aria-label`; sighted readers saw "15 : 1". |
| Runes never render | **Yes** | All 10 G4 players carry `runes = {style_id, sub_style_id, perks[]}`. `RuneOrSkillBlock` called `Array.isArray(raw)` on that object, so it rendered nothing, and `LivePlayer` had no `runes` field. |
| Hub "Drakes 4" hides the dragon types | **Yes** | `team_state.dragons` is an ordered type list (G4 TLAW: chemtech, ocean, mountain, mountain). The hub summed it. |
| Career and champion-pair context in the lane | **Yes** | The G4 top lane showed "JAX VS GNAR 122–125 · 247 games" and "Career 697 games · 313–384…" (`docs/pp-ia2/before-prod-390.jpg`). |
| Ask Pro Play and "Most games" beside the selected game | **Yes** | They formed the right column at 1440 (`before-prod-1440.jpg`). |
| "Clear all" on Pro Stats drops `?game=` | **Yes** | `ProStatsExplorer.clearAll` → `setSearchParams({view})` on the shared hub URL. |

**New finding, not in PP-IA1: some games have their sides swapped.** In **7 of 1,257** finished games, all LES (e.g. UCAM–MKF, HRTS–MKF), the schedule's blue/red team ids (`live_games`, from getEventDetails) are the reverse of the telemetry's (`live_team_state`, from the game feed's own metadata). On those boards every number sits under the other team's name. This pass makes results fail closed on those games (§3) but does not relabel the boards. See §9.

---

## 2. Game duration: no authoritative source exists

Every place a clock could come from was searched:

- **Livestats `window` frames:** `rfc460Timestamp`, `gameState` (`in_game | paused | finished`), team and participant stats. There is no in-game time field (fixtures `research/live1/fixtures/window_*.json`).
- **Livestats `details` frames:** `rfc460Timestamp` and participant stats only.
- **getEventDetails:** games have `number`, `id`, `state`, sides and `vods[]`. The VOD `startMillis`/`endMillis` are video offsets that include the draft and the post-game (e.g. 2,890 s for a game). They are not a game clock.
- **getSchedule / getLive:** match-level `result.gameWins` only.
- **Stored data:** `live_games` holds `first_frame_ts`, `frame_ts` and `scheduled_start`; `live_frames` holds wall-clock timestamps. Nothing is discarded that could serve as a clock.
- **Canonical / OE:** OE has `game_length_seconds`, but production stops at 2026-07-10 and no L↔C game link exists.

**Decision.** No duration is shown anywhere: the hub header, the `/live` match line, the selector cards and the facts line. The gold-graph axis, the objective timeline and the insight cards keep their frame offsets, but each is now labelled **feed time** ("since the first captured frame, pauses included, not the game clock"). The game-story sentences dropped their timestamps and keep only the order of events. The "first frame where gold ≥ 2,500" anchor was **not** implemented, as instructed.

---

## 3. Winner: an authoritative source, derived from Riot's series record

Upstream publishes no per-game winner. It does publish the series record, `match.teams[].result.gameWins`, and LIVE1 already stores two readings of it:

- `live_games.series_{blue,red}_wins`: the score **entering** each game. The poller writes it while the game is the match's current game.
- `live_series.team{1,2}_wins` plus `upstream_state`: the score when the daily series sync ran. This is the **final** score once the series is `completed`.

When the record rises by exactly one win for exactly one team between two consecutive readings, that team won the game in between. That is Riot's published result, read back.

**Validation (fails closed to `unconfirmed`):**

- An entering reading must total `game_number − 1`. A reading taken after the game ended totals `game_number` and is refused.
- The final score is used only when the series is `completed` and its total equals the last played game's number.
- Both readings must name the same two team ids, and the step must be exactly `[0, +1]`.
- Teams are matched by esports team id, never by side.
- On a game whose sides are swapped, `winner_side` is `null`: the board marks no side and names the team instead.

**Corpus check (production, 2026-10-05):**

- The entering-total invariant holds on **1,263 of 1,263** readings. 13 games carry no reading (daily-only ingestion).
- The derivation confirms **808** games. The rest stay unconfirmed in a replay without `live_series`, which the public API does not expose; in production the daily sync supplies most series' final games.
- On the TLAW–LYON final: G1 TLAW, G2 TLAW, G3 LYON (all `series_progression`), and G4 TLAW (`series_final`, 3–1).

**Code.**

- Backend: `live_esports/results.py` (pure, plus a batched read helper and `series_row_from_event_details`). `/games/{id}` gains `result` and `series`, with the request-time final read described above. `/history` rows gain `result` (store only) beside the legacy inferred `winner`.
- Frontend: `gameTruth.gameResultView`. The `isWinner` heuristic is deleted, and `hubSeries` no longer falls back to team state.

**A series' last game: a request-time read of the same record.**

- Earlier games confirm as soon as the next game starts.
- A series' **last** game needs the completed final. In production only some leagues' dailies write `live_series`: the PRODATA1 audit found the hot-store cap refusing dailies and only LCK being synced. Without a fallback, the LCS final's G4 would read "Result not confirmed".
- `/games/{id}` therefore reads that match's **getEventDetails** at request time, but only when every played game is finished and the store has no usable completed final.
- The row passes the same `_final` validation as a stored one. `series.score.final_source` is `live_series` or `upstream_read`.
- **Caching:** a completed read is cached for the life of the process (a final never changes); a failure or an unfinished series retries after 120 s. `/history` never reads upstream, so the archive's last games can still be unconfirmed.
- **Switch:** `LIVE_ESPORTS_SERIES_FINAL_READ` (default on). `conftest.py` turns it off so no route test reaches the network.
- **Verified end to end against real upstream:** with **0** `live_series` rows, G4 returns `official`, TLAW, `final_source: upstream_read`, 3–1. Upstream getEventDetails says G1–G4 `completed`, G5 `unneeded`, TLAW 3 – LYON 1.
- **Independent ground truth** (Leaguepedia, per PRODATA1): TL / TL / LYON / TL. It matches all four derived results.

---

## 4. Series score correction

The series score now comes only from the record:

- **Completed series:** "**Final · TLAW 3–1 LYON**", from Riot's final score. It shows in the hub event band (`data-testid="series-final-score"`), the `/live` header and the rail chip (`score.final`).
- **Series not yet final:** "Series · TLAW 2–1 LYON", built from entering scores plus confirmed results. When a finished game is unconfirmed, the score carries `*` and a tooltip saying it may be short.
- **Entering score:** never shown unlabelled. `seriesContext` / `matchLine` no longer print it. The archive's existing "at 2–1" (titled "Series score entering this game") stays, because it is intentional and labelled.

A pinned historical game outside the feed tail (the final today) still has a chip without a score. Its event band now carries the final score from the detail's `series`.

---

## 5. The resulting Match Center scope

**Core board (THIS GAME only):**

- **Event band:** league, stage, Bo, date, patch, plus the series score from the record.
- **Header:** team identity, with "Winner" only when the result is official. Below it, **KILLS 15–1**, the state badge and "Game 4". No clock. "Result not confirmed" when the record cannot say.
- **Lane rows:** player, champion with level, K/D/A, **CS and gold** (CS is now visible on desktop rows), items, and the lane gold difference.
- **Lane expansion ("This game"):** CS, items (phone), **keystone and both trees** (icon from the asset host), KP, damage share, wards.
- **Objectives:** gold, towers, **dragons** (count plus an ordered type list, Elder included when the feed lists it), inhibitors, barons.
- **Gold lead chart:** feed-time axis, labelled. Game story without times.

**Go deeper — beyond this game** (a labelled `<nav>` inside the expansion; every link carries a scope chip):

- each player's profile (CAREER);
- "Jax vs Gnar in pro play" (HISTORICAL · ANY ROLE);
- Combat Lab (SIMULATION);
- Matchup study (STUDY);
- each champion in pro play (ALL PRO GAMES);
- "Jax reference" (GAME DATA; this was "Archives: Jax").

No historical number is drawn on the board.

**Removed from the core, not deleted:**

| Removed | Where it is now |
|---|---|
| `CareerLine` (career W–L / KDA) | Player profile and Pro Stats |
| `ChampionPair` (Graph1 all-time pair record) and its disclaimer | The pair graph, one click from Go deeper |
| The "Champion graph" and "Stats row" lane links | Profile and Pro Stats |

**Right column → Explore band.** The board now takes the full width. Below it sits **"Explore pro history — Not about the match above"**, holding the Ask Pro Play cards, a Pro Stats entry card and the full tools. The "Most games" leaderboard glimpse is removed from the hub; that table is Pro Stats itself.

**DCGI.** The pill stays in the page header as compact global context, with a visible **FEATURED** kicker. It is outside `#match-center`, and DCGI1 is unchanged.

Herald and voidgrubs are **not** shown: the live feed does not carry them.

---

## 6. Pro Stats route decision

**Moved to `/lol/pro-play/stats`** (`PRO_PLAY_STATS_ROUTE`, `pages/pro-play/ProPlayStats.tsx`). The explorer itself is unchanged.

The URL contract was audited first. The only builder of hub-with-query URLs is `statsExplorerUrl` (player, team and champion profiles); no backend, sitemap or other hardcoded link exists.

- `statsExplorerUrl` now builds `/lol/pro-play/stats?…`.
- **Redirect.** A hub URL with any explorer key (`view, year, league, patch, role, champion, player, team, min_games, sort, dir, page`) and no `game` / `next` is redirected (`replace`) to the stats route carrying exactly those keys (`proStatsRedirect`). Old shared and "View in Pro Stats" URLs land on the same table. A hub URL that also selects a match stays on the hub.
- Filters stay copyable: the explorer owns its URL outright. "Clear all" (now `?view=players`) can no longer touch a Match Center selection.
- The header "Player statistics" anchor became a "Pro Stats" link, and a route-prefetch entry was added.

---

## 7. Files changed

**Backend** (`ppia2/live1-result-truth`, two commits: `f122a784` results and series, `743e5ea8` request-time final):

- `live_esports/results.py` (new): series-record results and score; fail-closed validation; side check; `series_row_from_event_details`.
- `routes/live_esports.py`: `/games/{id}` gains `result` and `series` plus the cached upstream final read (`_upstream_series_final`); `/history` rows gain `result`.
- `live_esports/config.py`: `series_final_read_enabled()`.
- `conftest.py`: autouse switch-off of that read.
- `live_esports/fixtures/ppia2_lcs_final_2026.json` and `ppia2_eventdetails_lcs_final_2026.json` (new): the real final, from production and upstream GETs.
- `test_live_esports_ppia2_results.py` (new) and `test_live_esports_history_archive.py` (browse contract now lists `result`, added deliberately).

No ingestion, schema or canonical change. The only new upstream call is the cached, read-only getEventDetails read on `/games/{id}`, the same pattern `/tournament` and `/upcoming` already use.

**Frontend** (`ppia2/match-center-truth`):

- **New:**
  - `src/lib/live-esports/gameTruth.ts`: result view, series score view, rune summary.
  - `src/lib/live-esports/runeData.ts`: generated from Data Dragon 16.19.1, identical to 16.17.1, plus the shards.
  - `src/lib/live-esports/__fixtures__/ppia2LcsFinalG4.json`: real G4 detail and players, plus the backend's result and series.
  - `src/pages/pro-play/ProPlayStats.tsx`.
  - `docs/pp-ia2/*.jpg`.
- **Changed:**
  - `src/lib/live-esports/api.ts`: `LiveRunes`, `LiveGameResult`, `LiveSeriesRecord`; optional `result` / `series` on the detail; `result` on `ArchiveGame`.
  - `src/pages/esports/live/lib.ts`: `gameClock` and `isWinner` removed; `FEED_TIME_NOTE`; `seriesContext` / `matchLine` carry no entering score and no clock.
  - `src/pages/esports/live/components.tsx`: `RunePage` and `RuneIcon`; feed-time labels on the gold chart and the timeline; no clock on selector cards.
  - `src/pages/esports/live/insights.ts`: feed-time card labels; timeless story sentences.
  - `src/pages/esports/live/EsportsLivePage.tsx`: official winner only; series score; result note.
  - `src/pages/esports/live/archive.ts` and `ArchivePage.tsx`: `archiveWinner` uses the official result, and the legacy field only when `result` is absent.
  - `src/lib/pro-play/hubSeries.ts`: record-only winners and the final score.
  - `src/components/pro-play/hub/MatchCenter.tsx`: kills label, no clock, official winner, series score in the event band, typed dragons.
  - `src/components/pro-play/hub/MatchWorkspace.tsx`: game-only expansion, runes and KP, Go deeper.
  - `src/components/pro-play/hub/ProPlayDiscovery.tsx`: the Explore band; glimpse removed.
  - `src/components/pro-play/hub/TournamentSpotlight.tsx`: `label` prop.
  - `src/pages/ProPlayHub.tsx`: full-width board, Explore below, stats redirect.
  - `src/lib/pro-play/routes.ts`: `PRO_PLAY_STATS_ROUTE`, `proStatsRedirect`.
  - `src/lib/pro-play/entityStats.ts`, `src/App.tsx`, `src/lib/route-prefetch.ts`.
- **Tests:**
  - New: `gameTruth.test.ts`.
  - Updated: `hubSeries.test.ts`, `ProPlayHub.test.tsx`, `EsportsLivePage.test.tsx`, `lib.matchContext.test.ts`, `insights.test.ts`, `archive.test.ts`, `ProPlayPublicProfile.test.tsx`.

---

## 8. Tests

**New regression tests for statistical scope and truth.** They pin the new behaviour; the core ones fail on the base:

| Requirement | Test |
|---|---|
| Career lines do not render in the core lane | `ProPlayHub.test` "keeps the lane expansion to THIS GAME…": no `career-line`, no `/api/pro-play/stats/players` request, no "career / games / win rate / x–y" text in the lane players |
| Global champion-matchup W–L does not render in the core lane | Same test: no `champion-matchup`, no `/api/graph1/champion-matchup` request. Plus "reaches the historical champion pair in one click, under a labelled scope change" |
| The "Most games" leaderboard is not on the board | "Explore band › says it is not about the match, and carries no leaderboard"; "orders the page Match Center → Workspace → Explore, with nothing beside the board" |
| Game kills are labelled | "labels the big number as KILLS — never a bare score — and shows no duration" |
| A proxy duration is never shown as duration | That test plus the facts-line `\d+:\d\d` guard; `lib.matchContext.test` "carries no duration"; `EsportsLivePage.test` (header has no m:ss; the timeline says feed time); insight cards say "feed"; the story has no times |
| An unknown or inferred winner is never authoritative | "never crowns a team from a structure lead…" (2–0 inhibitors, 9–2 towers, unconfirmed, so no Winner); "claims no result at all from a backend that sends none"; `hubSeries.test` "…a structure lead never decides"; `gameTruth.test` fail-closed cases; `archive.test` "archiveWinner"; `EsportsLivePage.test` "crowns nobody while the record cannot confirm" |
| A completed series shows the correct final score | `ProPlayHub.test` "…FINAL score in the event band, not the score entering the game" (TLAW–LYON shape); `hubSeries.test` "a completed series shows Riot's FINAL score…"; `gameTruth.test` real G4 → "Final · TLAW 3–1 LYON"; `EsportsLivePage.test` on the real G4 fixture |
| Runes render when the feed has them | `gameTruth.test` (all 10 real G4 pages; every perk id known); `ProPlayHub.test` "shows this game's runes…" and "draws no rune line when…"; `EsportsLivePage.test` "renders the rune page the feed published" |
| Pro Stats keeps its query semantics after the move | "Pro Stats route (PP-IA2)": redirect with filters intact, only table keys carried, a match-selecting URL stays; `gameTruth.test` `proStatsRedirect`; `ProPlayPublicProfile.test` stats URL |

**Backend.**

- `test_live_esports_ppia2_results.py`: **16/16**. Covers:
  - the real final with and without the series row;
  - the G4 entering-vs-final score;
  - a refused late reading and a refused final;
  - structures never deciding;
  - swapped sides;
  - unplayed and in-progress games;
  - both routes;
  - the upstream final read: the real getEventDetails payload, a read once then cached, the store winning when it has a final, failure and unfinished series staying unconfirmed, a live series never triggering a read, and `/history` never reading upstream.
- The full LIVE1 suite (`test_live_esports_*.py`): **438 passed, 1 failed**. The failure is `test_archive_dir_unwritable_fails_cleanly`, which also fails on a clean `62774dfd` checkout (Windows permissions). It is pre-existing.

**Frontend.**

- The Pro Play, esports, profile, route and graph set (29 files): all pass except 5 `ArchivePage.test` filter and pagination tests. Those time out at about 15 s under parallel load and fail the same way on the base before any edit. They are pre-existing.
- `tsc -p tsconfig.app.json`: only the 6 baseline errors (Onboarding, identity/connections, practiceLeaveContract ×4).
- ESLint on the changed files: 0 errors; 4 pre-existing warnings.
- The full chunked suite against a clean `a1958ff3` baseline: **no new failures** (§8a).

**Browser certification.** Uses the real final's production data, served through the PP-IA2 backend route by a local proxy.

- **Setup:** the proxy mounts the worktree router over a SQLite built from production GETs and forwards everything else to production read-only. The first run synthesized the completed `live_series` row; the second ran with **no** series row (`PPIA2_NO_SERIES=1`), so G4's result came from the real getEventDetails read. Both rendered `Final · TLAW 3–1 LYON`, tabs G1 TLAW / G2 TLAW / G3 LYON / G4 TLAW, and TLAW WINNER. Vite runs from the worktree (`ppia2` entry in `mogsy/.claude/launch.json`, port 5311; proxy 8791). Proxy script: session scratchpad `ppia2_proxy.py`.
- **Geometry:** 390×844, 834×1112 and 1440×900 all have `scrollWidth == clientWidth`, and the Explore band starts below the board's bottom edge (390: board ends at 1,918 px, Explore starts at 1,934 px). At 1440×900 the whole board, header to fifth lane, fits the first screen.
- **Redirect:** `/lol/pro-play?view=players&player=Faker` → `/lol/pro-play/stats?view=players&player=Faker`, with Faker's row. "Clear all" → `?view=players` on the stats route.
- **`/live`:** "Final · TLAW 3–1 LYON", one WINNER (TLAW), no m:ss in the header. No console errors.
- **Proxy artifact:** its DB lacks the tournament and stage sync tables, so the local event band reads "LCS · Finals" where production reads "LCS · Split 3 2026 · Playoffs · Finals". This is not a code change.
- **Screenshots** (`docs/pp-ia2/`): `before-prod-1440.jpg`, `before-prod-390.jpg` (production, current), and `after-1440.jpg`, `after-834.jpg`, `after-390.jpg`, `after-800-gold-explore.jpg`.

### 8a. Full chunked frontend suite

Run in four chunks with `--maxWorkers=4` (the full suite OOMs in one process). Each chunk was diffed by test name against a clean detached checkout of `a1958ff3`.

| Chunk | Branch | Base `a1958ff3` | Failures only on the branch |
|---|---|---|---|
| `src/pages` | 4,357 passed / 20 failed / 4 skipped | 4,344 / 20 / 4 | **none** (identical set) |
| `src/lib` | 4,671 / 16 / 3 | 4,657 / 16 / 3 | **none** (identical set) |
| `src/components` | 3,405 / 35 | 3,405 / 35 | **none** (identical set) |
| `graph1`, `hooks`, `features`, `academy`, `video`, `test`, `App*` | a worker OOMs (`ERR_IPC_CHANNEL_CLOSED`) | the same OOM | n/a (pre-existing harness limit; this pass changed no file there) |

The extra passing tests on the branch are the new PP-IA2 tests. Every failure is pre-existing on the base: Ranked arena, quiz workspace, welcome tome, the feedback contract, the quiz-screenshot shell parser, the ArchivePage timeouts, and others.

---

## 9. Remaining data blockers and known gaps

- **PP-DATA1, freshness.** Canonical and OE stop at 2026-07-10. Every Go deeper destination (profiles, pair graph, Pro Stats) still shows that frozen window. The board no longer *displays* those numbers, but the destinations are stale until PP-DATA1 lands.
- **Authoritative duration.** Only OE `game_length_seconds` or Leaguepedia `Gamelength` carry one, and both need PP-DATA1 freshness **and** a LIVE1↔Canonical game link (PP-IA1 roadmap D2). Until then, "no duration" is the correct state.
- **The archive's last games** (`/history`) stay unconfirmed wherever no daily synced `live_series`. Only `/games/{id}` reads upstream, so as not to fan out one upstream call per browse row (§3).
- **The hot-store cap** refusing non-LCK dailies is a PRODATA1 / ops item. Fixing it would make the stored final the normal path again.
- **Heralds and voidgrubs, first-X, draft, bans, summoner spells:** not in LIVE1, so none were invented.
- **Swapped-side games (7, all LES):** results fail closed, but the boards still put each team's name over the other team's telemetry. The fix is to reconcile `_game_summary` sides against the telemetry team ids at read time. That is a small backend read-model change, flagged rather than done because it changes every summary payload's sides.
- **Pre-existing, untouched:**
  - At 390 the red team name breaks mid-word beside its crest ("LYO/N"), the same on production today.
  - The hub rail shows no score for a pinned game outside the 6-game feed tail; the event band now carries it.
  - The gold `/gold` series' first point is the first *picked* sample, so the axis starts above 0:00.
- **No index on `live_games.match_id`.** The series read scans about 1,300 rows; the schema was not changed.

---

## 10. Deploy order and the exact next step

**Deploy order (when approved): backend first** (both commits; no migration). The frontend tolerates a backend without `result` / `series`, but it then claims no winners and shows no series score. The archive falls back to its legacy field only while `result` is absent.

**Exact next step:** a control-center review of this handoff and the screenshots. Then decide:

1. Approve or reject the request-time getEventDetails read on `/games/{id}` (`743e5ea8`). It is what makes the anchor game's result official in production today. It can be dropped independently of `f122a784`, in which case last games stay unconfirmed where no daily ran.
2. Approve the swapped-side read-model fix (§9) as a small follow-up.

After that, integrate backend `ppia2/live1-result-truth` and then frontend `ppia2/match-center-truth` onto current mains (the frontend rebases cleanly over `SCBS1`; no overlap). Then begin Phase 1 (Game P0) per PP-IA1, with PP-DATA1 running in parallel.
