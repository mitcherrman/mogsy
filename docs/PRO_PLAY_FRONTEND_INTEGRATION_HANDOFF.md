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


---

## Step 1 of the unified Matchup Explorer (2026-09-09)

**Base:** `origin/main` `3042d6b8`. Frontend only. Finishes the compact board's
interaction shell so Step 2 can add the player × champion dossier cleanly.

**No mode question.** The `Five-lane board / Lane explorer` tablist is gone, and
so is the duplicate `Lane explorer` button in the board controls. The Explorer
opens straight into the board — `modeFromParams` already treated `team` as the
default. **The lane explorer is preserved, not deleted:** `mode=lane` still
resolves, `LaneExplorer` is unchanged, every lane plate's `Open lane dossier`
still routes into it with the lane carried, the `← Five-lane board` return path
still works, and a pasted lane URL still works. Two pre-existing tests
(`still renders a Phase 1 lane link in lane mode`, `offers a route back to the
board from a lane view`) pass untouched and prove it.

**Compact by default, expandable in place.** Collapsed cards show a fixed cap
(`BOARD_PRIMARY_MAX = 12`) and the grid carries `min-height: 8.25rem` — two
rows — so six demonstrated picks and twenty-four occupy the same box and the two
halves of a lane stay level. Measured: all five plates 554px, every collapsed
grid 142px, at 1440px and at 390px. The action names the **whole pool**
(`Show all 24`), never the preview count; `Show fewer` restores it exactly
(142 → 215 → 142px). No action at all when the pool already fits.

**Notation.** Tiles read `12/13` over `92.3%` — wins/games, then rate. `g` read
as gold on a League page, and wins-over-games says in the same width what
games-plus-rate needed two numbers to say.

**Per-card context.** Each player card carries its own crest, team key and the
live scope tag (`[T1] T1 · 2026`), from the existing media provider, so a lane
card is readable on its own. It follows the scope rail.

**Two labels removed** by owner decision: `Champion Arsenal · Demonstrated picks`
(and its `24 in 2026` counter) and the `demonstrated starter` badge. Verified
zero occurrences of either inside the lane board. **The guarantees did not go
with them:** the server's pool sentence (`Demonstrated picks: champions this
player actually played…`) is still printed verbatim in the board's fine print,
lane state still distinguishes clear-starter / timeshare / uncovered, and a test
asserts no starter language (`will start`, `expected to start`, `predicted`,
`confirmed starter`) appears anywhere.

**Champion click hook — the deliverable.** `dossier/BoardSelection.tsx` is a
small context (`scopeLabel`, `scopeId`, `opponentOf`, `selected`, `onSelect`),
defaulting to a no-op so every isolated render and the lane explorer keep
working without a provider. A tile click settles
`{player_lp_page, display_name, team_key, opponent_team_key, lane, champion,
scope_id, scope_label}`. `ProPlayTooltip` gained an optional `onClick`/`pressed`
so the tile stays ONE button — tooltip, keyboard focus and action on the same
element. Clicking the selected tile clears it; a scope or team change drops the
selection rather than re-pointing it at different numbers. A sticky
`ChampionSelectionShell` states the selection and says plainly that the detail
is the next step — **no statistics, no invented API**.

`View full champion pool (N)` was renamed `View record table`: two controls both
claiming "24" while doing different things.

**Untouched:** URL/query state, all four scopes, swap sides, the lane dossier
drill-down, ordering strips, portraits, hero selector.

**Tests** 292 pass (12 new; 9 rewritten around what replaced the removed
labels). Typecheck failure set identical to `origin/main` (11 = 11). Build
clean. Verified T1 vs Gen.G and Gen.G vs HLE at 1440 / 390px: no horizontal
overflow, no broken media, no runtime errors.

### Next task

**Build the player × champion dossier drawer** using the selected
`player + champion + opponent team + scope` state that `BoardSelection` now
holds, replacing `ChampionSelectionShell`. That step owns the contextual H2H /
backend aggregation; Step 1 deliberately made no request and assumed no
endpoint.


---

## Step 2 — the player × champion dossier drawer (2026-09-08)

**Base:** frontend `origin/main` `9aa7017b`; backend `origin/master` `66fbb1de`.
Both repos changed. This is the step where a champion tile stopped being a
selection and became a question with an answer.

Clicking Doran's Olaf on **T1 vs Gen.G · 2026** now opens a scouting drawer
that answers the two things a reader wants immediately — how much of Doran's
2026 Olaf actually is and how it has gone, and how that looks specifically
against the team on the other side of the board. Step 1's sticky
`ChampionSelectionShell` and its CSS are **deleted**, not hidden.

### Backend — one new aggregate, no new authority

`pro_authority/player_dossier.py` + `GET /api/pro-play/matchup/player-champion`
(a third sibling on the existing admin-gated router).

It is ~180 lines because it reuses everything: the same
`pro_canonical_player_games` rows, the same in-memory `comparison.GameIndex`,
the same `admits_game` competition filter and the same `comparison_scope`
product vocabulary as the board it opens from — so the drawer cannot disagree
with the board about what "2026" means. **No new table, no ingest, no
precomputed bank, no schema change.**

The one thing `comparison` could not express is the opponent axis:
`compare_player_champion` buckets by team-played-**for**, and this needs
team-played-**against**, which is a property of the game rather than of the
player row. The opponent is therefore derived per game from the canonical
sides — a mid-scope transfer works with no special case, and nothing keys off
blue/red or the board's A/B.

**Performance.** The obvious shape reads every ban row for the champion; that
index is `(champion_key, event_type)` and carries neither the game id nor the
team, so each row costs a probe — **1,525 ms** measured for one all-time
dossier. Reading the drafts of the player's own games instead is served by
`idx_pro_canonical_picks_bans_game`: **44 ms** for identical figures.

### Exact definitions of everything displayed

| Shown | Definition |
| --- | --- |
| `X / Y total games` | X = the player's games on that champion in the scope. Y = the player's **own** total games in the scope (not the team's — a game they sat out is not in their total). Curated competition filter, same as the board. |
| Record | wins–losses over X. |
| Win rate | wins / X, or **`—`** over zero games. Never `0.0%`. |
| Most recent | `last_played_at` of the champion games, date only. |
| Recent form | The player's last ≤5 games **on that champion** in the scope, **newest first**, sorted by (date, canonical game id) so equal timestamps in a best-of are stable. Never padded: three games render three glyphs and the label says `3 games`; a capped strip says `last 5 of 13`. Date and opponent are in each glyph's `title`/`aria-label`. |
| vs `<team>` | Every metric above, restricted to the player's games against the board's other team. |
| Ban pressure | See below. |

**Average KDA is NOT shown, and the drawer says so on screen.** The corpus
carries no kills, deaths or assists — not in `pro_canonical_player_games`, not
in the `esports_champion_games` rows it is built from, not in that table's
`raw_json` (the Leaguepedia Cargo query pulled
Champion/Name/Role/Side/Team/PlayerWin and nothing else), and **not in any of
the other 187 tables** of the application database. It is also **rejected by
design**: the Player × Champion design audit ruled combat statistics out of
this slice and two pre-existing static guard tests fail the build if the word
appears in it. So the payload carries an explicit `unavailable_metrics` entry
naming the metric and the reason, and the drawer prints it — a named absence
reads as an honest limit; a missing row reads as an oversight.

### Ban pressure — the definition, verbatim

> How often the opposing team banned this champion in games involving this
> player, out of the games whose opposing-side ban record exists. It is
> contextual draft behaviour, not a claim about why.

Rendered as **numerator / denominator · rate** (`3 / 8 · 37.5%`), never a bare
percentage — the ratio is what makes a small sample readable.

* **Numerator**: drafts in which the **opposing team** cast a ban on this
  champion. Bans the player's own team cast are not ban pressure and are not
  counted.
* **Denominator**: the player's own in-scope games (overall), or their games
  against that team (opponent column), **restricted to games whose opposing
  side has a ban record at all**. Fail-closed: "we hold no draft record" and
  "they chose not to ban" are different facts, and folding the first into the
  second would deflate every rate. `games_without_ban_record` is reported so a
  genuine 0/8 is distinguishable from an 0/8 that is really 0/2.
* **Coverage is real**: 113,397 of 113,815 canonical games (**99.6%**) carry
  ban rows; 100% of Doran's 2026 games do, at exactly 5 opponent bans each.
* **No motive is implied** anywhere — not in the label, the served definition,
  or the UI. A test asserts the page never says "banned because", "to deny",
  "targeted" or "respect ban".

### Frontend

New `src/components/pro-play/dossier/PlayerChampionDrawer.tsx`; changed
`matchupApi.ts` (types + `fetchPlayerChampionDossier`),
`ProPlayMatchupTeam.tsx` (shell → drawer), `src/index.css` (drawer stylesheet,
champsel CSS removed).

Built on the repo's existing Radix `@/components/ui/sheet` — focus trap,
Escape, overlay dismissal and the close button all come with it. Right-side on
desktop with the board still visible behind; **full width on a phone**. The
`proplay-dossier` class travels on the sheet's own content element because a
Radix sheet renders in a **portal at the document root**, outside the
Explorer's subtree — without it none of the `--dsr-*` folio tokens would apply.

One request per (player, champion, opponent, scope); a superseded response
never paints. A tile is still one button (tooltip + `aria-pressed` + action),
clicking the selected tile clears it, and a scope or team change drops the
selection rather than re-pointing it at different numbers.

**Zero-sample behaviour is three distinct states**, never flattened: *did not
participate* (no aggregates at all, `overall` is `null`); *participated, never
on this champion* (a sentence naming the real total, no table, no percentages);
and *met this opponent zero times* (a real `0` games with win rate `—`).

**Deliberately absent**: no champion-v-champion record, no "vs Kiin", no
opposing-player anything. The opponent axis is a **team**. An empty
`dossier-drawer-study-slot` marks where the later Matchup Study lands — a slot,
not a disabled button.

### Tests

* Backend: **46 new** in `test_pro_authority_player_dossier.py` — a hand-built
  fixture proving the opponent axis, the ban denominator and the three
  participation states arithmetically, 7 relationship tests against the real
  corpus, and 6 over the wire. Neighbouring Pro Play suites: 298 pass.
* Frontend: **313 pass** across Pro Play (24 new, 3 Step-1 tests rewritten
  against the real drawer).
* `tsc --noEmit -p tsconfig.app.json`: **11 errors = the `origin/main`
  baseline**, 0 in any pro-play file. `npm run build`: green, sitemap clean.

### Verified against the real corpus

Local backend on this branch over the 5.0 GB DB, browser at 1280px and 375px.
Every pro-play request 200, no horizontal overflow at either width, no
pro-play console errors.

| Case | Result |
| --- | --- |
| Doran · Jayce, T1 vs Gen.G, 2026 | `13 / 101 total games` 12.9%, 12–1, 92.3%; vs Gen.G 2 games 1–1 50.0%; ban pressure `18 / 101 · 17.8%` overall, `0 / 10 · 0.0%` vs Gen.G; form `W W W W W`, last 5 of 13 |
| Kiin · Sion, Gen.G vs HLE, 2026 | 11/80, 10–1, 90.9%; **vs HLE 0 games → win rate `—`, not 0.0%**, while ban pressure vs HLE is a real `1 / 8 · 12.5%` — proving the two denominators are independent |
| Zeus · Gnar, T1 vs Gen.G, All Time | 80/692, 55–25, 68.8%; vs Gen.G 12 games 7–5 58.3%; ban pressure `69 / 692 · 10.0%` and `1 / 100 · 1.0%` |
| Side switch | Clicking Gen.G's tile flips the header to `Kiin · Sion … vs T1` and the column to `VS T1` |
| Escape / close | Both close and clear the selection |

Every figure above was cross-checked against an independent SQL walk of the
same rows before the module existed.

**Two environment notes for the next author.** `Doran (Choi Hyeon-joon)`
renders with its qualifier because **two real players share the handle
"Doran"** (the other is Eduardo Henrique) — that is the display policy working,
not a defect; `Kiin` and `Zeus` render bare. And the tracked `.env` points at
production Railway, so local backend verification needs a `.env.local` — which
**vitest also reads**, so delete it before judging a test run.

### Deployment

* Backend `47c4c905` pushed to `master`; Railway deployed. Verified on
  production: `/api/pro-play/matchup/player-champion` answers **403** (present,
  admin-gated) where a bogus sibling route answers **404**.
* Frontend on `main`; **Lovable publication must be confirmed separately — a
  push is not a deploy.**

### Next task

**Add exact champion-v-champion contextual study and always-available
alternate pro examples / side journeys.** It lands in the drawer's study slot,
below the Overall-vs-opponent table. It must not become a fabricated
head-to-head: joining two independent sides is exactly the reading the whole
contract has been built to refuse, so any such section has to restrict to games
the two champions were actually on opposite sides of, and say so.
