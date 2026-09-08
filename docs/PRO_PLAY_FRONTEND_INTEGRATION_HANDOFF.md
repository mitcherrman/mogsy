# Pro Play frontend integration — handoff

Read this first if you are picking up the Pro Play frontend workstream.

## Objective

Put the already-built Pro Play research frontend onto `main` so the owner can
review it against real data. The highest-value surface is the **Matchup
Explorer**; Search and the three profiles are the supporting layer. This was an
integration task, not a redesign: nothing about the product was reinvented.

## Frontend state

| | |
|---|---|
| Repo | `/Users/macmoney/mogsy` (Lovable deploys from `main`) |
| `main` before this work | `3d914096` (local, stale) / `a6605854` (`origin/main`, the real base) |
| Integration branch | `proplay/frontend-integration`, worktree `/Users/macmoney/mogsy-wt-matchup` |
| `main` after | `868209e0` |

The three historical commits named in the brief all still existed and were
cherry-picked **clean** onto `a6605854`:

* `0c6b0d4f` — global search + the three research profiles
* `98ce1e67` — Matchup Explorer Phase 1 (lane explorer)
* `32490a39` — Matchup Explorer Phase 2 (five-lane team board)

They were a linear chain (P2 stacked on P1 stacked on Search), all rooted at
the old `main`, and none of it had been merged. `con1` had moved `origin/main`
on in the meantime but touched only the admin block of `App.tsx`, so there was
no conflict.

Two commits were added on top:

* `bdb46308` — the admin-only entry point on Explore Pro Data
* `868209e0` — `useOptionalAdminAuth`, so that band cannot crash a page

## Routes integrated

| Route | Page | Access |
|---|---|---|
| `/lol/pro-play/matchup` | Matchup Explorer (both modes) | `AdminAuthGate` |
| `/lol/pro-play/search` | Pro Play Search | `AdminAuthGate` |
| `/lol/pro-play/player/:key` | Player profile | `AdminAuthGate` |
| `/lol/pro-play/team/:key` | Team profile | `AdminAuthGate` |
| `/lol/pro-play/champion/:key` | Champion profile | `AdminAuthGate` |

The Explorer's whole selection lives in the query string, so a configured
matchup is one shareable URL. `mode=team` is the five-lane board; the lane
explorer is the default.

## Backend contracts used

All on `origin/master` (`a8564e18`) and deployed — `routes/pro_play_search.py`
and `routes/pro_play_matchup.py`, both `Depends(require_admin)`.

* `GET /api/pro-play/research/contract | /search | /player/{key} | /team/{key} | /champion/{key}`
* `GET /api/pro-play/matchup/contract | /explore | /team`

`/contract` serves the vocabulary for BOTH Explorer modes; only the resolve
call differs. Contract version `pro_matchup_v1`, `head_to_head: false`,
`semantics: independent_side_by_side`. The four scopes are `current_2026`,
`worlds_2025`, `recent_2025_2026`, `all_time`.

Verified live: both `/contract` endpoints answer `403 Admin authorization
required` on production, i.e. deployed and gated. Payload verification was done
against a local server running that exact `origin/master` code over the real
4.7 GB corpus (`LOL_CALC_DB_PATH`), because production admin credentials were
not available to this session.

## Navigation

The public Pro Play hub still has exactly its three tiles (Live & Recent
Matches, Pro Play Quiz, Explore Pro Data) — untouched. Because the research
routes are admin-gated, a public tile would walk ordinary readers into a 403,
so the doorway is an **admin-only band on Explore Pro Data**
(`/lol/pro-play/graphs`) linking to the Explorer and to Search. It renders
nothing until admin authorization resolves.

## Tests

* Pro Play suites: 102/102 + 6/6 for the new band.
* Full frontend suite, run serially: **53 failed / 9724 passed**, against a
  baseline at `a6605854` of **53 failed / 9616 passed**. The failing file set
  is *identical* — compare sets, never totals. +108 net new passing tests.
* `tsc --noEmit -p tsconfig.app.json`: 11 errors on the branch, 11 on the
  baseline, **0** in any pro-play file.
* `npm run build`: green.

Two traps cost time and will cost it again:

* A local `.env.local` pointing `VITE_COMBAT_API_URL` at a dev backend is read
  by **vitest**, and made `questionMediaEntities.test.tsx` fail 7 tests with no
  code change. Remove it before judging a test run.
* `npm run build` regenerates `public/sitemap.xml` from a live API. A transient
  fetch failure empties the item URLs and the prerender verifier then fails the
  build. `git checkout -- public/sitemap.xml` and rebuild.

## Production verification

Everything below was exercised in a browser against the real corpus.

* Five-lane board, BLG vs T1, all four scopes: renders, with real records,
  demonstrated pools, share-of-team-games and bounded pool detail
  (`picks loaded for 3 of 7` + "open the lane to see them in full").
* `clear_starter`, `timeshare` and `uncovered` all render distinctly.
  BLG Mid is `uncovered` in 2026/Worlds 2025/2025–2026 and `timeshare` all-time
  ("no clear starter: Yagao 160g vs FoFo 148g") — no starter is forced.
* Lane drill-down pre-fills only the unambiguous side: the timeshare Mid link
  carries `player_b=Faker` and **no** `player_a`.
* Lane explorer, Faker vs Chovy on Azir: four-scope side-by-side, plus the
  champion mechanics table (base stats, per-rank cooldowns/costs/ranges) from
  the League Docs authority. Chovy's Worlds 2025 shows `0` games and `—` win
  rate, never a fabricated 0%.
* Search, and all three profiles, load. Bare `Knight` / `Smash` / `Thanatos`
  each stay **ambiguous** across two-plus registry identities, as intended.
* No pro-play console or network errors; every pro-play request 200. Mobile
  375px: no horizontal overflow.

## THE ONE OPEN BLOCKER — the identity corrections have not been rebuilt

The brief asked to confirm BLG Mid → Knight (Zhuo Ding), DK Bot → Smash (Shin
Geum-jae) and C9 Top → Thanatos (Park Seung-gyu). **None of them resolve.** All
three lanes report `uncovered`.

This is a **data** state, not a frontend or backend code defect. The frontend
is rendering the corpus honestly. `pro_authority/player_identity_corrections.py`
is deployed on `master`, but its output is written at corpus-build time, and
the rebuild has not been run against this corpus: 567 `Knight`, 482 `Smash` and
272 `Thanatos` rows are still sitting in
`pro_canonical_player_games_quarantine`.

A read-only reproduction (nothing mutated) ran the deployed correction over the
real DB plus the roster identity DB at
`/Users/macmoney/mogsy_data/mogsy_esports_identity_full.db` (81,072 tenures
loaded) and reproduced the module docstring **exactly**:

* Knight, 567 rows → 480 Zhuo Ding, 69 Vũ Hồng Sơn, 13 Isaac Chico, 3 Lee Geon,
  2 Jose Caballero; 0 declined.
* Smash, 482 rows → 478 Shin Geum-jae, 4 declined for the documented reasons.
* Thanatos, 272 rows → 272 Park Seung-gyu, 0 declined.

Which would close the three gaps as: Knight (Zhuo Ding) / BLG / Mid **297
rows**; Smash (Shin Geum-jae) / Dplus Kia / Bot **114 rows**; Thanatos (Park
Seung-gyu) / Cloud9 / Top **153 rows**.

**Owner decision required:** running that canonical rebuild is a backend data
operation and was out of scope here. Until it runs, those three marquee lanes
look empty. Whether production's corpus has already had it applied could not be
checked from this session (no production admin credential).

## Gap analysis — current baseline → "ultimate premier matchup breakdown"

**Already in the backend, just not surfaced**
* Team-level champion preferences (`pro_team_champion_stats`) — the board shows
  players, not the team's own pick tendencies.
* Ban *consequences*: bans currently do a plain set difference. The data to say
  "this removes 38% of his demonstrated pool" is already present.
* Per-champion player history over time — the profile has it, the Explorer's
  champion cards do not link into it.

**Frontend-only expansion**
* Series/best-of framing above the team board (`Series → Teams → Lanes`); today
  the top of the drill-down is Teams.
* Comfort/pocket-pick highlighting — derivable from share + win rate already on
  screen.
* Side-by-side player cards inside a lane rather than stacked.
* Deep links from a champion cell into the champion profile.

**Backend composition needed (no new authority)**
* "What changes if X gets champion Y" — needs a compose endpoint over existing
  pool + mechanics data.
* Champion-v-champion pro context — both sides exist independently; nothing
  joins them, and joining them must not become a fake head-to-head.
* Runes/build context per pick.

**New data required**
* Item builds per pro game. The historical corpus has **zero** item data, so
  builds cannot be shown at all today.
* LIVE1 recent-match context inside the Explorer.
* Pro Play quiz/trivia facts surfaced as matchup colour.

**Polish**
* Denser desktop board, sticky scope selector, per-lane collapse.

Semantic boundaries that must survive every one of the above: no prediction, no
fabricated head-to-head, no forced starter, watchlist is never qualification,
and demonstrated evidence stays primary over the declared roster.

## Next task

1. Owner reviews the routes above.
2. Decide on the canonical rebuild that closes Knight/Smash/Thanatos.
3. Pick the next expansion slice from the gap analysis.
