# DCGI1 — Demacia Cup Global Invitational 2026 tournament surface

Pass date 2026-10-01 (event starts 2026-10-03). Local only: not pushed, not
merged, not deployed, no production DB written.

| Repo | Worktree | Branch | Base | Commits |
|---|---|---|---|---|
| Backend `League_Combat_Simulator` | `.worktrees/dcgi1-backend` | `dcgi1/tournament-context` | PPH3 `1ade573e` | `7255a42c` policy · `ba4539f3` context + route · `769976c5` league media |
| Frontend `mogsy` | `.worktrees/dcgi1-frontend` | `dcgi1/tournament-surface` | PPH3 `267e3507` | `932e0d36` page + hub · `6414f0c6` layout fixes |

Both branches sit on the unmerged PPH3 branches, so PPH3 has to land first (or with these).

## Verified before building

**Existing behaviour (code)**
- `/api/live-esports/upcoming` reads `getSchedule()` with no league filter (PPH3). It is not changed here.
- LIVE1-only canonical rows store the lolesports slug (`lck`) as `league_slug`. The policy only knows Leaguepedia names, so those rows count once the historical merge arrives. That applies to every league, not just DCGI.
- The media authority accepted only `player` and `team`. The table enforced `CHECK (entity_type IN ('player','team'))`, despite a docstring saying no schema change was needed. `/resolve` caps a batch at 40 entities.
- `worlds_focus.py` is a watchlist only: no team has a qualification claim.

**External facts (read 2026-10-01)**
- **Upstream league:** `demacia_cup`, id `117126995932274206`, name "DCGI", region `INTERNATIONAL`. Tournament `demacia_cup_2026` (`117133773242499009`, 10-02 → 10-17).
- **Upstream schedule** (`getSchedule?leagueId=…`, one page of 27 matches):
  - Round 1: six Bo1 matches on Oct 3, 08:00–13:00 UTC;
  - Swiss: 14 Bo3 matches, Oct 4–8;
  - QF Oct 12–13, SF Oct 14–15, Final Oct 17, all Bo5.
  - Every post-Round-1 slot is TBD.
- **Upstream team names are not canonical:** "RED Kalunga", "Xi'an Team WE", "Beijing JDG Esports", "kt Rolster", "LGD GAMING".
- **Identity:** all 12 team keys and all 60 lineup player keys were checked against production `/api/pro-play/media/resolve` and `/research/search`: all canonical, roles consistent. Jiwoo's registered team is still Kiwoom DRX Challengers, which is exactly why event lineups are stored separately from rosters.
- **Leaguepedia Cargo `Tournaments`:** "Demacia Cup Global Invitational 2026" has **League = `Demacia Cup Global Invitational`** (IsOfficial 1). Every earlier edition has `Demacia Cup`.
- **Upstream Worlds schedule:** Play-Ins start 2026-10-15, the Final is 2026-11-14, and every team is TBD.

## Competition policy: changed (the smallest change that fixes it)

The policy matches `Demacia Cup` exactly, so DCGI games would have been imported but **excluded** from default content, item backfill and Graph1. `DEMACIA_CUP_GLOBAL_INVITATIONAL_LEAGUE` now joins `SEASON_GATED_LEAGUES` with the same 2026 threshold. That applies the existing owner decision ("the upcoming Demacia Cup and every one after it") to the new league name, and player scopes stay excluded, as they are for Demacia Cup. `POLICY_VERSION` is now `pro_default_v3`. There is still no substring rule.

## Backend contract — `GET /api/live-esports/tournament/{context_id}`

Public and read-only, like `/upcoming`. It has its own per-league cache: 120 s, with the same stale fallback (a page up to 15 min old is served with `stale: true`).

```
{ contract_version: "tournament_context_v1", generated_at, source: "getSchedule",
  source_ok, stale, fetched_at,
  context: { context_id, name, short_name, league:{slug,id}, tournament:{id,slug},
             starts, ends, regions[], stages[{key,name,block_names,starts,ends,venue,format_note}],
             participants[{code, team_key, region, lineup[{role, player_key, handle, change}]}],
             related[{name, league_slug, starts, ends, relation}], sources[], notes[] },
  state:   { phase: pre_event|swiss|knockout|complete, next_match_id,
             matches[{match_id, scheduled_start, stage, block_name, best_of,
                      state: completed|live|upcoming,
                      teams[{code, upstream_name, team_key, tbd, game_wins, outcome}],
                      winner_code, live1_game_ids[]}],
             swiss_records[{code, team_key, wins, losses, played}],   // [] until a Swiss match completes
             knockout_teams[], counts, warnings[] } }
```

- **Registry:** `pro_authority/tournament_context.py` (`TournamentContext`, validated when the module loads). It is editorial only: identity, venues, the code → canonical `team_key` map, event lineups, and the Worlds relation. It holds no results.
- **State:** `live_esports/tournament_state.py`, pure. A match with a game win but still `unstarted` upstream counts as LIVE (the PPH3 rule). Records count completed Swiss matches only. `knockout_teams` are the teams upstream has written into a knockout match. Rounds, seeds, eliminations and tiebreaks are never derived. An unknown code raises an `unmapped_team_code` warning and is never resolved by name.
- **Lineup notes:** these are the only `change` notes, all owner-verified: JDG Xiaofang and Angel ("DCGI lineup change"), GAM Tiphat ("On loan for DCGI"; Gloryy plays mid), RED Aegis ("Replaces STEPZ for DCGI"). The roster tables are untouched.

## Event media — `league` entity in the media authority

- `ENTITY_LEAGUE` is keyed by upstream slug and verified against LIVE1's `live_leagues` through a new optional `league_conn`. Media type `league_logo`; assets go under `assets/esports/leagues/`.
- `/api/pro-play/media/resolve?league=<slug>` and `/media/league/{slug}` serve it. Requests with only teams and players behave exactly as before.
- **Schema:** `ensure_schema()` rebuilds a pre-DCGI1 table in place to widen both CHECK constraints. Rows and `media_id` are copied unchanged, it is idempotent, and the indexes are recreated. Checked on a copy of the local corpus: 91 rows kept, ids 1–100 intact, `integrity_check` ok. `migrate_add_esports_media_assets.py --db … [--apply]` reports and applies it.
- **Ingest:** `media_ingest.ingest_league_logo()` plus `scripts/ingest_league_media.py <slug> [--apply]` copy `getLeagues.image` into `assets/`. The upstream URL is kept only as provenance and is never served.
- **NOT RUN:** the real DCGI mark has not been downloaded. Until it is ingested (and the media migration applied in prod), the slot shows the gold "DCGI" monogram.

## Frontend

| File | Change |
|---|---|
| `src/pages/pro-play/ProPlayTournament.tsx` | NEW page at `/lol/pro-play/tournament/:contextId`. Section order depends on phase: pre-event = next match → field → Worlds → schedule; Swiss = today → records → next → …; knockout/complete = bracket first. |
| `src/lib/pro-play/tournamentApi.ts` | NEW types, `fetchTournament` (rejects unexpected shapes), `useTournament` (polls every 120 s, no retry on 404) |
| `src/lib/pro-play/tournamentView.ts` | NEW pure grouping helpers: region, local day, record groups, bracket, links, `SECTION_ORDER` |
| `src/components/pro-play/hub/TournamentSpotlight.tsx` | NEW one-line hub band (phase, dates, next match). Not drawn while loading or on error |
| `src/lib/pro-play/mediaApi.ts` | `league` entity type, `leagues=`, splits requests into chunks of ≤ `MEDIA_BATCH_MAX` (40) and merges them; if any chunk fails, the whole answer is null |
| `ProPlayMediaProvider.tsx`, `EventMark.tsx` | Provider takes `leagues`. `EventMark` resolves its slug through the authority (an explicit `src` still wins). Adds an `lg` size |
| `src/pages/ProPlayHub.tsx` | Spotlight band; event-mark slugs added to the hub's one media request |
| `routes.ts`, `App.tsx`, `route-prefetch.ts` | Route, URL builder, `PRO_PLAY_FEATURED_TOURNAMENT = "dcgi-2026"`, lazy chunk (15.7 kB / 4.7 kB gz) |

**Links:**
- Team and player rows link to their canonical profiles.
- A match that LIVE1 has stored links to the hub at `?game=<latest game>`.
- An upcoming match with named teams links to the hub at `?next=<match_id>`.
- TBD slots have no link.
- There are also links to the Pro Play quiz and to search. No quiz content specific to DCGI is claimed.

## Tests

- **Backend new:**
  - `test_tournament_context.py`: 17 tests (registry, real-page state, Swiss/knockout/complete transitions, route with cache/stale/404, LIVE1 game ids);
  - `test_pro_play_media_league.py`: 12 tests (identity, migration, route, ingest);
  - 4 new policy tests.
- **Backend neighbouring suites** (all `test_live_esports*`, media, policy, Graph1 scope/source, comparison, bounded scopes, item backfill, specimens): **857 passed, 2 failed, 51 skipped**. Both failures (`test_graph1_scope::test_the_scope_values_endpoint_answers`, `test_live_esports_production::test_archive_dir_unwritable_fails_cleanly`) fail the same way on the untouched PPH3 base.
- **Gotcha:** a 0-byte `lol_calc.db` left in a worktree root by an earlier test run turns 10 `TestRealCorpus` tests from skipped into failures. That happens on base too. Delete it before a run.
- **Frontend new:** `tournamentView.test.ts` (9), `mediaApi.leagues.test.ts` (3), `ProPlayTournament.test.tsx` (13, which includes the spotlight).
- **Frontend focused run** (hub, pro-play libs/components/pages, live-esports, esports/live, Graph1 page, route prefetch): **1132 passed, 5 failed**. The 5 are the `ArchivePage` timeouts PPH3 already documented on its base.
- **Checks:** `tsc` shows the same 6 errors as base, none in touched files. ESLint: 0 errors. `npm run build` is green.

## Visual verification

Done in the in-app browser with a local proxy (`dcgi1_proxy.py`). The proxy served the new route from the backend worktree against **live upstream** and forwarded everything else to production. Checked at 1440×900, 834×1112 and 390×844: no horizontal overflow, no broken images, and every image loaded once scrolled into view. With live data: 4 crests and 6 portraits drew art (WE, Vitality and their players; the rest are monograms, as the media inventory predicted).

Swiss and knockout layouts were checked against a **synthetic** copy of the real page with invented results, for layout only. Those screenshots are labelled `synthetic-*`.

Screenshots in `docs/dcgi1/`: `pre-event-top-1440`, `pre-event-worlds-schedule-1440`, `pre-event-field-834`, `pre-event-top-390`, `pre-event-schedule-390`, `synthetic-knockout-1440`, `synthetic-knockout-390`, `hub-spotlight-1440`, `hub-spotlight-390`.

Fixed during verification: the bracket's narrow columns crushed the full row layout (now a compact stacked row), and on phones the state badge took its own line (now on the time line).

## Not changed

LIVE1 ingestion/poller, `/upcoming`, Matchup Explorer, roster/identity tables, `worlds_focus.py`, team/player media behaviour, production data.

## Open items / owner decisions

1. **Event mark:** approve downloading upstream's DCGI image (`http://static.lolesports.com/leagues/1788253732774_94x-81.png`, a 94×81 PNG) and running `scripts/ingest_league_media.py demacia_cup --apply`, plus the media migration on deploy. Note the upstream image is small; a better source would replace it through the same path.
2. **Worlds 2026 field:** there is no verified source. Upstream still lists every team as TBD and `worlds_focus` is a watchlist. The relation block therefore states the region-level fact and the dates only.
3. **Swiss round numbers / pairing rules / seeding:** upstream doesn't publish them, so matches are grouped by day. Records come only from results; elimination is not inferred.
4. **Hub height:** the spotlight band adds ~66 px above the PPH3 board at 1440×900, so the board no longer ends inside the first screen. If that matters, move the band into the Discovery column or show it only on match days.
5. **Deploy order:** backend (policy, route, media migration) before the frontend. An older backend's 404 just hides the spotlight, and the page shows "could not be loaded".
6. **The TournamentContext pattern is reusable** (Worlds 2026 would be one more registry entry), but only DCGI is registered.
