# DCGI1 — Demacia Cup Global Invitational 2026 tournament surface

**Status: re-integrated onto the production-certified PPH3 base and certified
locally (2026-10-01).** Not pushed, not merged, not deployed. No production DB
or media row has been written. The event starts 2026-10-03 (Round 1 from 08:00 UTC).

## Objective

Carry the existing DCGI1 work (tournament page, hub entry, tournament contract,
league media) onto the PPH3 production bases without regressing PPH3. Then:

- fix the hub height regression the original band caused;
- ingest the real DCGI event mark through the canonical media authority;
- certify and stop before production.

## Branches and SHAs

| Repo | Worktree | Branch | Certified base | Final SHA |
|---|---|---|---|---|
| Frontend `mogsy` | `.worktrees/dcgi1-frontend` | `dcgi1/tournament-surface` | `424d392ab79e71e1b2f895940c55c015ba09d3de` (PPH3 prod) | see the last commit on the branch (this handoff) |
| Backend `League_Combat_Simulator` | `.worktrees/dcgi1-backend` | `dcgi1/tournament-context` | `05247b73` (PPH3 prod) | `d66fe096` |

Pre-rebase heads are kept as `dcgi1/tournament-surface-pre-rebase` (`9a00cfaa`)
and `dcgi1/tournament-context-pre-rebase` (`769976c5`).

**Frontend commits on 424d392a**
- `5730014a` page + hub entry
- `7aac9dce` layout fixes
- `7fc0519f` screenshots
- `c8dccc84` hub pill (new)
- this handoff

**Backend commits on 05247b73**
- `979dd86e` policy
- `ec457f0c` context + route
- `b44edbac` league media
- `2c6798e2` real event mark (new)
- `d66fe096` CRLF fix (new)

**Rebases:** both clean, with no conflicts.
- Backend: the old base `1ade573e` and `05247b73` have identical trees, so the replay was a no-op.
- Frontend: the three DCGI commits replayed onto 424d392a (MG + final PPH3) without conflicts.

**Origin has moved since the brief.** JP3–JP5 integration merges landed: `origin/main` is now `18fc90a9` and `origin/master` is now `49b8b434`. `git merge-tree` shows both DCGI branches merge onto those tips without conflicts. Certification was run on the bases named above, not on those tips.

## What changed versus the original DCGI1

1. **Hub entry: a band became a header pill** (`TournamentSpotlight.tsx`, `ProPlayHub.tsx`).
   - The full-width band above the Match Center (+54–66 px) is gone.
   - DCGI is now a compact gold pill inside PPH3's existing header row, beside search and "Player statistics". No new region was added.
   - **Content:**
     - event mark (canonical media) and "DCGI" at every width;
     - phase and dates from `xl` ("KNOW THE FIELD · 3–17 OCT 2026");
     - next match only at `2xl`. The UP NEXT rail already lists DCGI fixtures.
   - **Accessible name:** "Demacia Cup Global Invitational 2026: <phase>".
   - **Absent state:** nothing is drawn while loading, on an error, or on an older backend (404).
   - **Two small header adjustments keep PPH3's row count at every width:**
     - search `min-width` is 11rem below `xl` (was 18rem; still 18rem from `xl`);
     - phone header `gap-x` is 16 px below `sm` (was 20 px).
   - These are the only PPH3 lines touched.
2. **Real event mark ingested** (backend `2c6798e2`).
   - **Source:** upstream `getLeagues.image` for `demacia_cup`. It is actually a **1000×1000 PNG** (32,518 B). The old handoff's "94×81" was the filename, not the image.
   - **Stored verbatim:** `content_sha256 == source_sha256 == 5ca76017…`. A production ingest therefore writes the identical file name and bytes, which avoids the Pillow re-encode trap in the media handoff.
   - **Path:** `assets/esports/leagues/demacia-cup-a6034e3f/league_logo-5ca7601772a4.png`, committed.
   - **Pages never load the upstream URL.** It is kept only as provenance in the row.
3. **CRLF fix:** `test_graph1_broad_pro_policy.py` is CRLF on master. The original policy commit had re-encoded it to LF, which made an 874-line diff. It is now the real 2-line change.
4. **New hub tests:**
   - the entry sits inside `<header>`, with nothing between the header and the Match Center;
   - an older backend without the route draws no entry.
5. **Removed** the obsolete `docs/dcgi1/hub-spotlight-{1440,390}.jpg`, which showed the retired band.

Everything else is the original DCGI1, unchanged; see Architecture below.

## Architecture (final)

### Data contracts (unchanged and verified)

- **Identities:** league slug `demacia_cup` (id `117126995932274206`); tournament `demacia_cup_2026` (`117133773242499009`); context id `dcgi-2026`.
- **Competition policy:** `DEMACIA_CUP_GLOBAL_INVITATIONAL_LEAGUE` ("Demacia Cup Global Invitational", the Leaguepedia League name) joins `SEASON_GATED_LEAGUES` with the 2026 threshold. `POLICY_VERSION = pro_default_v3`. There is no substring rule, and player scopes stay excluded, as they are for Demacia Cup.
- **Registry:** `pro_authority/tournament_context.py`. It is editorial only:
  - identity, stages and venues;
  - the **upstream code → canonical `team_key` map** (never name guessing; an unknown code raises `unmapped_team_code`);
  - the **event lineups, stored separately from the roster tables**. All 12 teams and 60 players are canonical. Examples: GAM Kiaya/Tiphat/Gloryy/Artemis/Taki; RED zynts/Aegis/Fuuu/Morttheus/Manel; JDG's event lineup differs from its registered roster;
  - the Worlds relation: dates and the region-level fact only, **no Worlds team field**.
- **State:** `live_esports/tournament_state.py`, pure, from the **official schedule** only.
  - Swiss records count completed Swiss matches only.
  - `knockout_teams` are only teams upstream wrote into knockout matches.
  - No Swiss round labels, seeds, eliminations, tiebreaks or future opponents are derived. TBD slots stay TBD.
- **Route:** `GET /api/live-esports/tournament/{context_id}` (`tournament_context_v1`). It is public and read-only, with a 120 s per-league cache and a 15-minute stale fallback. `/api/live-esports/upcoming` is **not** duplicated or changed.

### Response shape

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
             swiss_records[{code, team_key, wins, losses, played}],
             knockout_teams[], counts, warnings[] } }
```

### Event media

- `ENTITY_LEAGUE` is keyed by the upstream slug and verified against LIVE1 `live_leagues`. Media type is `league_logo`.
- `/api/pro-play/media/resolve?league=` and `/media/league/{slug}` serve it. Team/player-only requests behave as before.
- `ensure_schema()` widens the pre-DCGI1 `CHECK` constraints with an in-place rebuild that keeps rows and ids and is idempotent. `migrate_add_esports_media_assets.py` reports it and applies it with `--apply`.
- Frontend `EventMark` resolves the slug through `ProPlayMediaProvider`. Without art it falls back to the gold monogram.

### Frontend

- **Page:** `/lol/pro-play/tournament/:contextId` (`ProPlayTournament.tsx`). Section order by phase:
  - pre-event: next → field → Worlds → schedule;
  - knockout: bracket first.
- **Helpers:** `tournamentApi.ts` and `tournamentView.ts`.
- **Media:** `mediaApi.ts` handles `league` and chunks requests at 40.
- **Links:**
  - team and player rows → canonical profiles;
  - stored match → hub `?game=`;
  - named upcoming match → hub `?next=<match_id>`;
  - TBD → no link.

## Files changed (vs the certified bases)

**Frontend, 24 files** (`git diff --stat 424d392a`):
- **New:**
  - `src/pages/pro-play/ProPlayTournament.tsx` and its `.test.tsx`
  - `src/lib/pro-play/tournamentApi.ts`
  - `src/lib/pro-play/tournamentView.ts` and its `.test.ts`
  - `src/lib/pro-play/mediaApi.leagues.test.ts`
  - `src/lib/pro-play/__fixtures__/tournamentDcgiPreEvent.json`
  - `src/components/pro-play/hub/TournamentSpotlight.tsx`
  - 7 screenshots in `docs/dcgi1/`
  - `DCGI1_HANDOFF.md`
- **Modified:**
  - `src/pages/ProPlayHub.tsx` and its `.test.tsx`
  - `src/lib/pro-play/mediaApi.ts`
  - `src/lib/pro-play/routes.ts`
  - `src/components/pro-play/media/EventMark.tsx`
  - `src/components/pro-play/media/ProPlayMediaProvider.tsx`
  - `src/App.tsx`
  - `src/lib/route-prefetch.ts`

**Backend, 16 files, +2551/−33** (`git diff --stat 05247b73`):
- **New:**
  - `pro_authority/tournament_context.py`
  - `live_esports/tournament_state.py`
  - `live_esports/fixtures/getSchedule_demacia_cup_2026-10-01.json`
  - `scripts/ingest_league_media.py`
  - `test_tournament_context.py`
  - `test_pro_play_media_league.py`
  - the league mark PNG
- **Modified:**
  - `pro_authority/competition_policy.py`
  - `pro_authority/media.py`
  - `pro_authority/media_ingest.py`
  - `routes/live_esports.py`
  - `routes/pro_play_media.py`
  - `migrate_add_esports_media_assets.py`
  - `test_pro_authority_competition_policy.py`
  - `test_graph1_broad_pro_policy.py` (2 lines)
  - `test_pro_play_media.py` (1 line)

**Not touched:** LIVE1 poller/ingestion, `/upcoming`, Matchup Explorer, roster tables, `worlds_focus.py`, other game modes, baseline failures.

## Test results

### Backend

**Full neighbouring set** (52 files):
- tournament context;
- media plus league media;
- competition policy and every `competition_policy` consumer: Graph1 scope/broad policy, comparison, bounded scopes, item backfill, specimens, team remediation;
- every `test_live_esports*` suite, including `/upcoming`.

**Result: 1646 passed, 8 failed, 92 skipped.**
- **5 are an environment artifact, not code:** the run itself left a **0-byte `lol_calc.db`** in the worktree root at 18:36. This is the documented gotcha. The later `test_pro_play_question_context::test_named_champions_resolve_in_the_shipped_asset_manifest[*]` cases then hit "no such table". After deleting it, that file plus the DCGI, policy and `/upcoming` suites gave **340 passed, 5 skipped**.
- **3 are baseline:**
  - `test_graph1_canonical_team_champions::test_the_teams_endpoint_answers_and_leaks_no_sentinel`
  - `test_graph1_scope::test_the_scope_values_endpoint_answers`
  - `test_live_esports_production::test_archive_dir_unwritable_fails_cleanly`

  All three fail identically on a clean `05247b73` worktree (3 failed / 311 passed for those four files).

**After the CRLF fix:** policy + Graph1 broad policy gave 152 passed, 17 skipped.

### Frontend

**Set:** Pro Play pages/libs/components (DCGI page, view helpers, media), the Pro Play hub, live-esports and esports/live (PPH3 Match Center/live), route prefetch, the Mogzy Guide (`mogzy-guide`, `mogzy-dock`), `LolHub`, the Quiz guide/hub, the Leaguecraft guide and the Pro Play graphs.

**Result: 1365 passed, 6 failed (39 files).** All 6 fail identically on a clean 424d392a worktree:
- the 5 `ArchivePage` filter/pagination timeouts;
- `Quiz.hub.test` "keeps exactly one h1".

**After adding the 2 hub tests:** `ProPlayHub` + `ProPlayTournament` gave **63/63**.

**Checks:**
- `tsc -p tsconfig.app.json`: the same 6 errors as base (diffed), none in touched files.
- ESLint on touched files: 0 errors (4 pre-existing fast-refresh warnings).
- `npm run build`: green, prerender verify OK. The build's `public/sitemap.xml` rewrite was reverted.

## Visual verification

**Method:** the in-app browser against a local verification proxy (scratch only, not committed).
- **Served locally from the backend worktree:**
  - `/tournament/*` and `/upcoming`, reading **live upstream** `getSchedule`;
  - league entries of `/media/resolve`, from a scratch app DB holding only the locally ingested mark;
  - `/assets` files present in the worktree.
- **Forwarded to production (read-only GETs):** everything else, including team/player media.
- **Comparison:** a clean 424d392a worktree ran beside it on the same proxy, so base and DCGI used identical data.

### Hub geometry

DCGI vs base, real data, same selected game (CBLOL LOS–EST G3):

| Viewport | Header (DCGI = base) | Match grid top → bottom | Document height | Δ vs base |
|---|---|---|---|---|
| 1440×900 | 1 row, 57 px | 129 → 903 | 3242 | **0** |
| 1280×800 | 1 row, 57 px | 129 → 903 | 3242 | 0 |
| 1024×768 | 1 row, 57 px | 129 | 3652 | 0 |
| 834×1112 | 1 row, 57 px | 129 | 4153 | 0 |
| 768×1024 | 1 row, 57 px | 129 | 4173 | 0 |
| 390×844 | 2 rows (search below), 113 px | 177 | 4880 | 0 |
| 360×780 | 2 rows, 113 px | 177 | 4986 | 0 |

- **1440 pill:** 346 px wide at x 849–1195, inside the header row. Search is 490 px (was 576).
- **Desktop footprint:** the board's bottom (903 here, 892–896 in production with another game) depends on the selected game, and it is identical with and without DCGI.
- **Phones:** the pill sits on row 1 beside "Academy · Pro Play" (390: x 268; 360: x 244). It needs ≥ 345 px of content, so a 320 px phone would wrap it to its own row.
- **Before the gap/min-width tweaks**, 834, 768 and 360 each wrapped the header (+46–52 px). Those were measured and fixed.

### PPH3 behaviour (unchanged)

- COMPLETED board.
- UP NEXT jump pill: scrolls the rail to the group (scrollLeft 396, label visible).
- Selecting an UPCOMING chip writes `?next=` and shows identity and countdown with no scoreboard.
- Phone team names wrap ("Estral / Esports"), with no overflow.
- The DCGI fixtures RED–NAVI and LGD–FLY appear in UP NEXT.

### DCGI page, real pre-event data

**At 1440, 834, 390 and 360:**
- no horizontal overflow, 0 broken images, no error state;
- the event mark is `art` (`/assets/esports/leagues/…/league_logo-5ca7601772a4.png`, natural 1000 px);
- 12 field teams, 12 team links and 60 player links;
- 6 Round-1 `?next=` match links.

**Following links:**
- `Team WE` → `/lol/pro-play/team/Team%20WE`, renders;
- `Kiaya` → `/lol/pro-play/player/Kiaya`, renders;
- RED–NAVI → hub `?next=117133805552196841` shows "RED vs NAVI · DCGI · Swiss · Bo1" with the real mark in the event band.

### Synthetic state (layout only, invented results)

- **Fixture:** a copy of the real schedule with 20 completed Swiss matches, 2 completed QFs, 1 live QF and the rest upcoming (`make_ko_fixture.py`, `ko_page.json`).
- **Page:**
  - sections run bracket → next → records → schedule → field → Worlds;
  - records come only from completed matches, with KO tags only for teams written into knockout matches;
  - no "eliminated" label anywhere.
- **Widths:** clean at 1440 and 360.
- **Hub at 1440:** the pill reads "KNOCKOUT STAGE · 3–17 OCT 2026" (354 px), still one header row with the grid at 129.

The existing `synthetic-*` screenshots are the earlier pass's and still match. No new screenshots were committed; the geometry above is from measured DOM boxes.

## Production: media migration and ingest

Run on the production backend container, **after** the backend deploy.

1. Snapshot `/data/lol_calc.db` (`sqlite3 … ".backup"`, then `quick_check`).
2. `python migrate_add_esports_media_assets.py --db /data/lol_calc.db`
   - This is a dry run. It must report "would rebuild … to admit entity_type 'league' (N rows kept)".
   - Then rerun with `--apply`. Rerunning prints "nothing to do".
3. `python scripts/ingest_league_media.py demacia_cup --db /data/lol_calc.db`, as a dry run. Confirm:
   - `asset_location == assets/esports/leagues/demacia-cup-a6034e3f/league_logo-5ca7601772a4.png`;
   - `content_sha256 == source_sha256 == 5ca7601772a48e94b30a65001183e37c184ee89265e6d6682b51aecb26774a7f`.

   If upstream changed the image, the hash differs. Stop: the committed file would not match.
4. Rerun with `--apply`. This registers one `league` row; reruns return the same `media_id`. It needs `demacia_cup` in production LIVE1 `live_leagues`. The poller syncs daily; check with `SELECT * FROM live_leagues WHERE slug='demacia_cup'`.
5. **Verify:**
   - `GET /api/pro-play/media/resolve?league=demacia_cup` → `state: "art"`;
   - `GET /assets/esports/leagues/demacia-cup-a6034e3f/league_logo-5ca7601772a4.png` → 200;
   - `GET /api/live-esports/tournament/dcgi-2026` → 200, phase `pre_event`, 12 participants.

**Locally exercised exactly this way:**
- A scratch app DB with the pre-DCGI1 schema plus one existing team row was migrated: the row and id were kept, `integrity_check` returned ok, and the rerun was a no-op.
- The ingest dry run, apply and rerun returned the same `media_id`.
- The resolver returned `art`.

## Deployment order

1. **Owner approval**, then integrate both branches onto the current tips (`origin/master` 49b8b434, `origin/main` 18fc90a9; both merge without conflicts) and rerun the DCGI, policy and hub suites.
2. **Backend** → `master` → Railway deploy: policy v3, tournament route, league media, committed mark.
3. **Production migration, then ingest** (above), and verify.
4. **Frontend** → `main` → Lovable publish.
5. **Observational check on 2026-10-03 Round 1** (08:00–13:00 UTC): LIVE state on a DCGI match, records still empty until a Swiss match completes, hub pill phase.

An older backend is safe for the frontend: a 404 hides the pill, and the page says it could not be loaded. Deploy the backend first anyway.

## Rollback

- **Frontend:** revert the DCGI commits (or just `c8dccc84` + `5730014a`'s hub lines to drop the entry). Nothing else depends on them.
- **Backend:** revert the branch. The widened media table is a superset of the old one; old code reads team/player rows unchanged. A rollback does not need to re-narrow it.
- **The mark:** `UPDATE esports_media_assets SET status='retired' WHERE entity_type='league' AND entity_key='demacia_cup'`, or delete that one row. The page falls back to the monogram.
- **Policy:** reverting to `pro_default_v2` stops admitting DCGI games into default content. Rows imported meanwhile stay, under the v3 provenance.

## Remaining blockers

- **None technical.** Production deploy, migration and ingest are awaiting owner approval.
- Certification ran on the briefed bases. The newer origin tips merge without conflicts but were not re-tested; see step 1.
- **Worlds 2026 field:** still no verified source, so the relation block keeps dates and the region-level fact only.

## Exact next task

**DCGI1-DEPLOY.** With owner approval:
1. Merge `dcgi1/tournament-context` onto current `origin/master` and `dcgi1/tournament-surface` onto current `origin/main`.
2. Rerun the DCGI, policy and hub suites.
3. Deploy the backend, snapshot, migrate, ingest and verify (above).
4. Publish the frontend.
5. Observe Round 1 on 2026-10-03.
