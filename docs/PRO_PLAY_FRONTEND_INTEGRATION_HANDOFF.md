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

## Phase 3 — Premier Matchup Overview (SHIPPED)

**Objective.** Turn the Explorer from a form-first internal tool into Mogzy's
scouting dossier: the five-lane team board is the flagship, the lane explorer
is the drill-down.

**Visual direction.** A dark-academy scouting folio. Dark leather cover
(`--dsr-folio`), parchment inserts reusing the existing
`/assets/ranked/ranked-vellum-texture.png`, antique gold for hierarchy, cyan
for anything technical (figures, findings, lane-state chips), archival tabs as
section headings, a ghost seal watermark, and "Mogzy's Notes" as the margin
hand. All of it is namespaced under `.proplay-dossier` in `src/index.css` — it
cannot leak, and it replaces nothing outside the Explorer.

**New files** (`src/components/pro-play/dossier/`)

| File | What it is |
|---|---|
| `DossierMedia.tsx` | `TeamCrest`, `PlayerPortrait`, `ChampionIcon` + `monogram()` |
| `DossierChrome.tsx` | `Dossier`, `DossierSection`, `Parchment`, `GoldRule`, `MogzyNote`, `FinePrint`, `Disclosure`, `Figure` |
| `ChampionPool.tsx` | `poolCategories()` + `ChampionPoolSummary` |
| `MatchDossier.tsx` | `MatchHeader`, `ScopeRail`, `LanePlate`, `TeamSummaryPlate`, `ArchiveWarnings` |
| `Dossier.test.tsx` | 17 tests: media fallbacks, pool category rules, disclosure |

**Changed**: `ProPlayMatchupTeam.tsx` (board recomposed), `ProPlayMatchup.tsx`
(comparison plate, champion-vs module, dossier framing), `matchupApi.ts`
(default mode), `src/index.css` (the dossier stylesheet), both existing test
files.

**Structure now**: VS header → scope rail → *Lane Study* (5 parchment plates,
each with both sides, figures, pool summary, "Open lane dossier") → *Team
Record* → *Global Bans* → *Archive Evidence*. Lane mode is a chapter:
configuration, *Independent performance comparison*, Champion A **vs**
Champion B, *Mechanics Analysis*, demonstrated picks, roster context.

**Default mode flipped, no link broken.** `modeFromParams` returns `team`
unless the URL carries a lane-only key (`lane`, `player_a/b`, `champion_a/b`)
or an explicit `mode`. Every Phase 1 drilldown names a lane, so all of them
still open in lane mode. `selectionToParams` now emits `mode=lane` explicitly —
without it the "Lane explorer" tab was unreachable, because a fresh lane
selection carries no lane-only key.

**Champion pool categories are sorts, not judgements.** "Most played" (games),
"Most recent" (`last_played_at`), "Best record (5+ games)" — the threshold is
printed on screen. There is deliberately no signature/comfort/pocket pick:
none has a defined rule, and inventing one in a component would put an unbacked
claim on the page. Full table stays behind *View full champion pool*, unfiltered.

**Media placeholders.** No `<img>` is ever rendered without a source, so a
broken-image glyph is impossible. Team and player slots show a deterministic
monogram in a designed frame; champion icons resolve from the Combat API asset
store (`getChampionSquareIconUrl`) and fall back the same way. Frame geometry
is identical with and without art, so dropping real media in later changes the
picture and nothing else.

**Semantics preserved.** `clear_starter` / `timeshare` / `uncovered` all render
distinctly; a timeshare is styled as a cyan *finding*, not a warning, and its
other candidates are expanded by default (collapsing half a shared lane would
BE the forced starter). `head_to_head === false` still gates every record. The
server's team-mode note, pool notes, focus caveat and side-by-side sentence all
still print, unedited — moved to margin notes and "What this means", never
reworded or dropped. "Demonstrated picks" survived the visual pass as the
semantic label, with "Champion Arsenal" as ornament above it.

**Verified against the real corpus** (local backend on `origin/master`, 4.7 GB DB):
T1 vs Gen.G, BLG vs T1, Gen.G vs HLE. BLG Mid renders `uncovered` in 2026 and
`timeshare` all-time — 14 candidates retained, zero starter badges, drilldown
prefills only `player_b=Faker`. Scope rail re-requests and repaints. Faker vs
Chovy on Azir/Ryze renders the champion-vs module with real icons and the
mechanics table. Every pro-play request and champion icon 200. Mobile 375px:
no page overflow, no unscrollable overflow, 5 lane plates stacked.

**Tests**: 114 pro-play + 17 dossier. Full suite 53 failed / 9779 passed against
a 53-failed baseline — identical failure set. `tsc` 11 = baseline, 0 in
pro-play. Build green.

**Still blocked on media sourcing**: team crests and player portraits. The
slots are built and tested; only the assets are missing.

**Backend data available but still unsurfaced**: `roster.declared_corroboration`,
`team_games_in_scope` on the header, `first_played_at` per champion,
`banned_from_pool` / `selectable` as an explicit count, and the focus set's
`pending_slots` (rendered in lane mode only).

## Next task

1. Owner reviews the routes above.
2. Decide on the canonical rebuild that closes Knight/Smash/Thanatos.
3. Pick the next expansion slice from the gap analysis.


---

## Matchup Explorer refinement pass (2026-09-08)

**Base:** `origin/main` `c9230ae1`. **Frontend only** — no backend, no API
semantics, no access rules touched.

**What changed, and why the diff is small.** Seven asked-for refinements, all
presentational, plus one deletion of dead code:

| # | Change |
| --- | --- |
| 1 | Player portraits — **already fully wired**; see the gap below |
| 2 | The VS banner IS the team selector (`TeamChooser` in `MatchDossier`) |
| 3 | The `Change teams` disclosure and `TeamSelect` deleted |
| 4 | `dossier-vs__status` and `FocusBadge` removed; focus payload untouched |
| 5 | Every `MogzyNote` gone from both boards |
| 6 | Lane board reaches **479px** from the top, down from **645px** |
| 7 | Title is exactly `League of Legends Esports Matchup Explorer` |

### The hero is the only selector

Each plate wraps a transparent native `<select>` stretched over it, so crest,
name and plate are one click target. Native on purpose: keyboard-navigable, a
real control for a screen reader, and the platform's own picker on a phone
rather than a bespoke popover. The plate carries a small `CHANGE` pill as the
affordance. `withTeamSide` is unchanged, so URL state, shareable links, swap and
scope all behave exactly as before — asserted.

The team-name link to the team profile was dropped from the banner: the plate is
now a control, and a link inside a control is a second target for one gesture.

### Watchlist and the notes box came out together

The status word ("watchlist") and the caveat paragraph explaining it was not a
qualification claim were a matched pair — with no status printed there is
nothing to correct, so both went. **`contract.notes.focus`, `focus_set` and
every team's `focus.status` / `asserts_qualification` are untouched in the
payload;** the UI simply does not render them, and the pending South America
slots still print the server's own "qualification unresolved" line.

`Mogzy's Notes` is gone from the team board, the lane explorer and the team
summary plate. Honesty moved from a paragraph to the places a reader actually
forms a belief: `demonstrated starter` badges, `Timeshare` / `Uncovered` lane
states, the scope label on each plate, `Each player's own record` as the Lane
Study eyebrow, and the server's own sentences still printed verbatim as fine
print. The tests were rewritten to assert the GUARANTEE rather than the
paragraph — the page now asserts it never says `will start`, `will win`,
`predicted`, `qualified for` or `series score` anywhere, which is stricter than
checking that a disclaimer exists.

### Portraits — wired, and blocked server-side

`matchupMediaKeys` already collects `player_lp_page` from every lane candidate,
the provider already requests them, and `PlayerPortrait` already takes
`entityKey`. **No frontend change was needed or made.** Nothing renders because
production holds **three** portrait rows, all `candidate`, **zero approved** —
verified against the live resolver, which answers `no_approved_media` for every
player including Faker, Chovy, Zeus, Kiin, Canyon and Ruler.

The blocker is one owner decision, not per-player sourcing: portraits are held
under `rights_basis = not_established`, and `media.approve` refuses any basis
outside `APPROVABLE_RIGHTS_BASES`. Approving photographs needs a basis someone
must name — `identification_trademark` is structurally refused for a portrait,
and neither `explicit_license` nor `owner_supplied` is currently true. Once a
basis exists and rows are approved, **every portrait appears with no frontend
work at all.** Roster coverage beyond the pilot three is a separate ingest.

### Verified

Gen.G vs Hanwha Life Esports and T1 vs Gen.G, at 1440 / 834 / 390px: title
correct, exactly two selectors and both inside the banner, no old picker, no
`Mogzy's Notes`, no `watchlist`, 4/4 crests resolved, 0/10 portraits (expected),
no horizontal overflow at any width, no console errors from this pass.
Selecting in the banner moved side B to Hanwha Life Esports and wrote the URL.

513 tests pass across Pro Play + LIVE. Typecheck failure set identical to
`origin/main` (11 = 11). Build clean.

### Published

Commit `02ceb592` on `main`; Lovable published ~5 minutes after the push. The
served bundle (`ProPlayMatchup-CIIwj_On.js`, `index-D4NQliTl.css`) was verified
to carry the evergreen title, the hero selector and its CSS, and to no longer
contain the old title, `Mogzy's Notes`, `Change teams` or `dossier-vs__status`.

**Next:** decide the portrait rights basis (owner), then ingest portraits for the
focus-team rosters. Everything else is cosmetic polish.


---

## Five-lane board density pass (2026-09-09)

**Base:** `origin/main` `7e06ae9f`. Frontend only.

The board was a verbose inventory: 48px portraits, name-bearing champion chips
whose widths were an accident of naming, and the same few champions rendered as
full tiles three times under three headings.

| | before | after |
| --- | --- | --- |
| lane portrait | 48px | **112px**, face-cropped |
| champion tile widths | 103 / 97 / 101px | **uniform 50px** |
| champions shown per player | 5 | **14** (whole pool when ≤14) |
| lane plate height | 610px | **550px** |

**Portrait.** New `xl` slot (`h-[4.5rem] md:h-28`). The crop is
`scale-[1.45] object-cover [object-position:center_24%]`: these are 3:2 event
photographs of a player at a desk, so a square cover alone landed on chest and
jersey. Nothing is cropped destructively — the stored file is the whole shot and
this is one slot's framing.

**Tiles.** Fixed 50px width, icon + games + win rate, **no champion name**. That
is what makes a wrapped row a grid. The name is not lost: each tile is a
`ProPlayTooltip` — a real `<button>` with `aria-label` and a native `title`, so
hover, keyboard and touch all reach it. The tooltip carries only what the tile
does not print (name, W–L, last played), so nothing is announced twice.

**Fuller, not just bigger.** The server's `pool_preview` became a FLOOR rather
than a cap; the board shows up to `BOARD_PRIMARY_MAX = 14`, which is what fills
whole rows at the widths a lane card gets. Most pools in the corpus are smaller
than that, so the common case now shows the whole pool, and when it does not the
label says `14 of 24`.

**Less repetition.** "Most recent" and "Best record" are *orderings*, not
separate arsenals, so they render as icon-only strips costing one line each
instead of a block of full tiles. The sort is still on screen and the tooltip
still carries the detail.

One shared-primitive fix: `ProPlayTooltip` no longer prefixes the label when the
tooltip already starts with it ("Jayce — Jayce · 13g …").

**Semantics untouched.** Category labels still name their own sort, the
`5+ games` threshold is still printed, banned champions stay visible and struck
through, `pool_omitted` / DNP / empty all keep their own sentences, and the full
table behind the disclosure is unchanged.

**Tests** 282 pass (10 new). Typecheck failure set identical to `origin/main`
(11 = 11). Build clean. Verified T1 vs Gen.G and Gen.G vs HLE at 1440 / 390px:
uniform tiles, no visible names, no horizontal overflow, no broken media. On
narrow screens the ordering strips stack their label rather than leaving a
gutter.
