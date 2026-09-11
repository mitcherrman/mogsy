# Matchup Explorer — workstream handoff

Read this first if you are picking up the Pro Play / Matchup Explorer
workstream. It supersedes nothing: `PRO_PLAY_FRONTEND_INTEGRATION_HANDOFF.md`
still describes how the Explorer first reached `main`, and this describes what
the Explorer has become since.

## Objective

Build the Matchup Explorer up in layers, each one a real question a reader has
while looking at the layer above it, and never let a layer answer a question it
cannot actually evidence.

* **Step 1** — one unified five-lane board. `T1 vs Gen.G · 2026`.
* **Step 2** — click a champion beneath a player: a scouting dossier for that
  player on that champion, with a **team** opponent axis.
* **Step 3** — establish the opposing player and champion: the **exact**
  same-game record, other real professional examples of the same champion
  matchup, and clickable side journeys into each of them.
* **Step 3.1** — the board's team pool stops being the Worlds focus set, so a
  side journey lands wherever the corpus can honestly build a board.
* **Step 4** — a specific historical **meeting** becomes a first-class state,
  reachable from the broad team matchup and from exact-matchup evidence.
* **Step 5** — one **game** inside that meeting, and the ten-player box score
  that is the reason to open it. The first payload in this workstream that
  carries a combat statistic. *(this document)*

## Important decisions

**The three routes are three SHAPES, not three subsets of one shape.**
`/explore` is lane-shaped and returns two sides; `/team` takes none of its six
lane parameters and returns five lanes; `/player-champion` returns one
player-and-champion with a team opponent axis; `/exact` returns two named
players on two named champions joined on the game. Folding any pair together
leaves parameters that must be absent in one mode and a return type that is a
union of unrelated shapes. The vocabulary, focus set and notes are still served
**once**, from `/contract`.

**`/exact` is the only payload in this authority with `head_to_head: true`.**
It earns it by joining on the game. The board and the dossier still assert
`false`, and the drawer renders the two as two sections from two payloads
precisely so neither can be read as the other.

**Exact means the same game.** Six conditions, all required: the subject player
has a row in the game, that row carries the subject champion, the opposing
player has a row in the same game, that row carries the opposing champion, the
two rows' `team_key` differ, and the game is admitted by the competition filter
and falls inside the scope. Nothing qualifies through roster membership, a
declared starter, team membership, or the two champions appearing in separate
games.

**One pass, two answers.** Every ordered pair of opposing rows carrying the two
champions is built once — the complete population of professional games in
which the champions met. The exact record is that population filtered to the
two named players; the alternates are the same population grouped by its other
pairings. An example therefore cannot be fabricated and cannot disagree with
the record beside it.

**Champion-first, and that is measured.** The exact record alone is cheaper off
the player index, but the examples need the whole champion-versus-champion
population regardless, and reading the player axis too would be a second source
of truth for one fact. 0.9–1.3 s cold on the heaviest pairs of the real
1.07M-row corpus.

**The study lives in the URL.** Step 2 held the open dossier in React state,
which was enough while a click was the only way in. A side journey establishes
a different board *plus* four selection keys in one navigation. Four optional
query keys on the board's existing selection was the smallest coherent
extension; a second navigation mechanism beside the query string the board
already reads would have been two sources of truth.

**The board fetch is decoupled from the study**, or every tile click would
refetch five lanes to redraw nothing.

**The team pool is not the Worlds focus set, and that is the fix.** Step 3
served a real KT Rolster example as evidence with no destination, because the
board only accepted the sixteen orgs on Mogzy's Worlds watchlist. Those are
two different questions that had one answer: `worlds_focus` is an editorial
choice about what Mogzy points a camera at, and the board's limit is "can a
five-lane board be built for this org honestly". Widening the *watchlist* to
make a link work would have been a claim about Worlds made for a routing
reason. `pro_authority.explorer_teams` answers the second question, the focus
set is a strict subset of it, and `worlds_focus` is untouched.

**A pooled team is admitted on measurement, not on taste.** The focus set is
in the pool by construction — it is the owner's own entry set, and four of its
teams would fail the policy today (BLG, Dplus Kia and Cloud9 each have a lane
with no canonical player rows at all; CTBC Flying Oyster has 8 admitted 2026
games). Every *other* team must meet `ADMISSION_POLICY` against the real
corpus. `measure_admission` re-runs the identical policy, and two real-corpus
tests fail if the shipped registry drifts in either direction — a team that
qualifies and is not shipped is a bug, not a judgement call.

**`side.focus` is now nullable, and `side.explorer` is not.** A team pooled on
data alone is on no watchlist, so it carries no focus entry. Null is the
honest answer to "is Mogzy watching this org for Worlds"; a synthesized status
would have put a Worlds-shaped word on twenty-two orgs nobody claimed anything
about.

## Relevant files

### Backend — `/Users/macmoney/League_Combat_Simulator` (`master`, Railway)

| File | Role |
|---|---|
| `pro_authority/exact_matchup.py` | Step 3 authority. The one pass, the exact filter, the alternates and their ranking. |
| `pro_authority/player_dossier.py` | Step 2 authority. Team opponent axis, ban pressure. Untouched by Step 3. |
| `pro_authority/comparison.py` | `GameIndex`, `admits_game`, `CURATED`, `CONTRACT_VERSION`. Both of the above read it. |
| `pro_authority/comparison_scope.py` | The four product scopes and the participation vocabulary. |
| `pro_authority/matchup.py` | The board, `/contract`, and `_require_explorer_team` — the pool gate. |
| `pro_authority/explorer_teams.py` | **Step 3.1.** The navigable team pool, the admission policy, the measurement. |
| `pro_authority/worlds_focus.py` | The Worlds editorial watchlist. Unchanged, and no longer the board's gate. |
| `scripts/audit_explorer_team_pool.py` | Re-runs the policy over the corpus and prints the diff a human ships. |
| `test_pro_authority_explorer_teams.py` | 34 tests, 6 against the real corpus. |
| `routes/pro_play_matchup.py` | All four routes. Admin-gated on the router. |
| `test_pro_authority_exact_matchup.py` | 42 tests. |

### Frontend — `/Users/macmoney/mogsy` (`main`, Lovable)

| File | Role |
|---|---|
| `src/components/pro-play/dossier/MatchupStudy.tsx` | Step 3. Chooser, exact record, zero states, alternates. |
| `src/components/pro-play/dossier/PlayerChampionDrawer.tsx` | Step 2 drawer; hosts the study in all three of its states. |
| `src/lib/pro-play/matchupApi.ts` | Types, `fetchExactMatchup`, and the study's URL round trip. |
| `src/pages/pro-play/ProPlayMatchupTeam.tsx` | The board. Derives the study's selection from the payload. |
| `src/pages/pro-play/ProPlayMatchup.tsx` | Page shell; owns the URL and the request key. |
| `src/index.css` | `.dossier-study__*`, after the `.dossier-drawer__*` block. |
| `src/pages/pro-play/ProPlayMatchupTeam.test.tsx` | 128 board/dossier/study tests. |

## API contract — `GET /api/pro-play/matchup/exact`

Admin-gated (router-level), read-only.

**Query:** `subject_player`, `subject_champion`, `opposing_player`,
`opposing_champion` (all required); `scope` (default `current_2026`),
`league_filter`, `board_team` (repeatable), `examples` (1–24, default 6),
`meetings` (1–40, default 8).

**Errors:** 400 unknown scope · 404 a champion with no canonical player rows
· 200 with an honest zero for a player who never played (a player is not the
entity here, so an unplayed player is a question with an answer).

**Response:** `head_to_head: true` · `scope` · `subject` / `opposing`
(`participation`, `games_in_scope`, `champion_games_in_scope`,
`teams_in_qualifying_games`) · `exact` (`record`, `meetings`,
`meetings_total`, `result_sequence`, `most_recent`) ·
`champion_matchup_games_in_scope` · `other_pro_examples[]` ·
`unavailable_metrics` · `definitions`.

Each example carries `relation`, `subject`, `opposing`, `record`,
`most_recent` and `navigation` (`team_a`, `team_b`, `scope_id`, `lane`, the
four selection keys, `explorer_navigable`, `teams_outside_focus_set`).

### The ranking rule

Four tiers, then three counted tie-breaks:

1. `same_subject_player` — the same subject player, a different opponent
2. `same_opposing_player` — the same opposing player, a different subject
3. `involves_a_board_team` — neither, but a team from the board on screen
4. `other_professional_example`

then **games descending**, **most recent meeting descending**, then the subject
and opposing player keys ascending. The keys are unique per pair, so the order
is total and two calls can never disagree. Every term is a counted thing: there
is no "best", "signature" or "elite" anywhere, and a test scans for them.

`board_team` affects tier 3 and nothing else — never which games qualify.

## Side-journey design

The board's selection gained an optional `study`:

```
focus_player  focus_champion  vs_player  vs_champion
```

`teamSelectionToParams` / `teamSelectionFromParams` round-trip it;
`boardRequestSelection` strips it before `/team`. Clicking an example calls
`sideJourneySelection(current, navigation)` — one `onChange`, one history
entry, Back returns.

The board resolves `focus_player` against its own payload rather than trusting
the URL: a link naming somebody this board does not show opens **no drawer**,
instead of a drawer wearing another player's lane and team.

Clearing rules live with every other selection rule: a team or scope change
drops the study; a side **swap** keeps it.

## Current state / completed work

**Step 3 is live.** Backend `27eb1b32` is on `master` and deployed — Railway
answers `/api/pro-play/matchup/exact` with a 403 (gated) rather than a 404.
Frontend `6052389a` is on `main` **and published**: the deployed
`ProPlayMatchup` chunk on mogzy.lol contains `explorer_navigable`,
`teams_outside_focus_set` and Other Pro Examples. Verified 2026-09-08 by
fetching the bundle, not by assuming a push is a publish.

**Step 3.1 (the team pool) is committed and not yet pushed.**

| | Backend | Frontend |
|---|---|---|
| Branch | `proplay/explorer-team-pool` | `proplay/explorer-team-pool-fe` |
| Worktree | `/Users/macmoney/lcs-wt-proplay-step3` | `/Users/macmoney/mogsy-wt-proplay-step3` |
| Base | `origin/master` `7e546192` | `origin/main` `304f3d49` |

`origin/master` moved twice during the task (champdata pass 19, then the
Oracle's Elixir statistics commit). Re-fetch before every push — this repo's
`master` moves often and auto-deploys.

## Tests

**Step 3.1 backend — 34 new (6 real-corpus), Pro Play regression 1410 passed,
1 skipped, 0 failed** after rebasing onto `7e546192`. The real-corpus tests are
the load-bearing ones: every data-admitted team still meets the policy, no
team meets it without being shipped, Anyone's Legend is excluded on measured
lane coverage rather than on taste, and a newly supported team's board names a
starter only where the roster authority already named one.

**Step 3.1 frontend — 128 board/study tests (was 103), 337 Pro Play tests, all
passing.** Full suite 53 failures, identical to the documented `origin/main`
baseline, none in pro-play. Typecheck 11 errors, none in pro-play. Build green.

**Step 3 backend — 42, all passing.** The hand-built fixture writes every *near miss*
as a real row and gives each its own test: the right players on the wrong
champion, the right champions in two different games, a benched roster member,
two team-mates, an out-of-scope meeting. Four real-corpus tests cross-check a
known Doran/Kiin meeting against an independent SQL walk, re-verify every
returned example through the exact filter, and prove the alternates sum with
the exact record to the whole population. Eight over-the-wire tests pin the
parameter names and error codes.

**Frontend — 336 Pro Play tests, 23 new.** Full-suite failure set **identical**
to `origin/main` (53 = 53, none in pro-play — compare SETS, never totals).
Typecheck identical (19 = 19). Build green.

Two Step 2 assertions were **inverted, not deleted**: the study slot is no
longer empty, and the team selection now round-trips a study.

## Known limits / real edge cases

* **The team POOL bounds side journeys, not the examples.** The board accepts
  38 teams; the examples come from the whole corpus, so some will always land
  outside. Those are served with `explorer_navigable: false` and rendered as
  evidence rather than hidden — hiding them would quietly redefine "other
  professional examples" as "other pooled examples". The pool is now a data
  question rather than a Worlds one, which is what closed the KT case; it will
  never close every case, and should not.
* **The Explorer still shows no combat statistics — but the corpus now has
  them.** `unavailable_metrics` in `/exact` and the dossier says the authority
  carries no K/D/A. As of master `7e546192` that sentence is **out of date about
  the corpus and still true about this feature**: Oracle's Elixir statistics
  landed in `pro_canonical_player_game_stats` / `pro_canonical_team_game_stats`
  while this task was in flight, and nothing in the Explorer reads them yet.
  See *Series and game drilldown* below. Do not soften the wording until a
  payload actually carries a number.
* **The chooser is bounded by the board's pool fetch.** Pools are fetched for
  the top candidates per lane (`notes.pool_bound`); a candidate with
  `pool_omitted` offers no champions in the study, and the section says so.
* **Teams shown for an example come from its most recent meeting.** A pair who
  met across a transfer shows the newest pairing, which is the one a reader is
  placing. The record still counts every qualifying game.
* **A mirror matchup yields both directions**, which is correct and tested.

## Supported-team policy (Step 3.1)

`pro_authority/explorer_teams.py` is the one place that answers **"can the
board be pointed at this org"**. It has two halves and they are different
kinds of statement:

| Source | Who decides | Held to the policy? |
|---|---|---|
| `worlds_focus_set` | the owner, editorially | **no** |
| `data_admitted` | the corpus | **yes** |

The focus half is *derived* from `worlds_focus.focus_teams()` on every call,
not copied, so adding a team to the watchlist adds it to the pool with no
second edit. The data half is the shipped `ADDITIONAL_TEAMS` registry.

**`ADMISSION_POLICY`** — every clause is measured, and every one is a floor on
*evidence*, never on importance:

* scope `current_2026`, league filter `MAJOR_PRO` — the same scope and the
  same competition universe the board itself reads, so "enough data to build
  the board" is measured over the games the board will build from;
* **≥ 30** admitted games — roughly a full competitive split; below it a
  "current roster" is a handful of games and the lane leaders are noise;
* **all five lanes** covered by at least one demonstrated player — the board
  is a five-lane board, and there is no reason to newly admit a team with a
  structurally missing lane when thirty-odd teams do not have the problem;
* a live registry row — present, not disbanded, not renamed. A renamed page is
  a lineage question the Explorer does not answer, and pointing the board at
  the old page would silently scout the wrong org.

### Newly supported teams — 22, measured 2026-09-08

| Group | Teams |
|---|---|
| LCK | BNK FEARX, Kiwoom DRX, DN SOOPers, Nongshim RedForce, **KT Rolster**, HANJIN BRION |
| LPL | JD Gaming, Weibo Gaming, Ninjas in Pyjamas.CN, LGD Gaming, EDward Gaming, ThunderTalk Gaming, LNG Esports, Oh My God |
| LEC | Natus Vincere, Fnatic, Shifters, Team Heretics, SK Gaming |
| LCS | FlyQuest, Sentinels, Disguised |

Pool: **38** (16 focus + 22 admitted). The corpus holds 72 teams with at least
one admitted 2026 game and 34 that meet the policy — all 34 are shipped.

### Why not every historical team

Because "selectable" is a promise the board has to keep. A team in the pool
gets five lane rows, a demonstrated roster, a champion pool and a set of side
journeys pointed at it. The corpus cannot keep that promise for most orgs, and
the failures are not marginal:

* **Anyone's Legend** — 86 admitted 2026 games, more than most of the pool,
  and **three** canonical lanes. Two rows of the board would be permanently
  uncovered.
* **GIANTX** — 58 games, four lanes.
* Below the 30-game floor the tail is long and thin: 38 of the 72 active teams,
  most of them with single-digit game counts in the scope.

Those teams lose nothing. Search and the profiles are global; Step 3 still
returns them as real evidence with `explorer_navigable: false` and names the
reason. Admission decides one thing only — whether the board opens.

### How `explorer_navigable` is decided now

`exact_matchup._navigation` asks `explorer_teams.is_explorer_team()` of both
teams on the example's most recent meeting, and reports the ones that fail in
`teams_outside_explorer_pool`. It used to ask `worlds_focus.get_focus_team()`.
That single substitution is the whole behavioural change; the ranking, the
example population and the exact filter are untouched.

`teams_outside_focus_set` is still served as a **dated, deletable mirror** of
the same list. The frontend published to mogzy.lol on 2026-09-08 calls `.join`
on it while merely *rendering* a non-navigable example, Railway auto-deploys
`master`, and Lovable publishes on the owner's click — so dropping the name in
the same release that renames it would throw in the live client during that
window. Delete the field and its test once the new frontend is published.
**Done in Step 8** — the published chunk was fetched and does not contain the
old name.

### The one deploy-ordering hazard

The published frontend reads `header.focus.owner_label` unconditionally. With
the new backend a pooled team returns `focus: null`, so that read would throw.
It is **not** reachable from the published selector (which still renders
`focus_set.teams`), but it **is** reachable by clicking a newly navigable
example — e.g. one on KT Rolster. The Explorer is admin-gated, so the exposed
population is the owner. Publish the frontend at the same time as the backend
push and the window does not exist.

## Series and game drilldown — audit (2026-09-09)

Nothing below is implemented. This is what the corpus can actually support,
measured, so the next slice is a build rather than a discovery.

### What landed, and where it is

Oracle's Elixir statistics reached `master` as `7e546192` **during this task**
— see `OE_STATS_HANDOFF.md` for the pipeline. Two additive 1:1 fact tables
beside the canonical layer, never columns on it:

| Table | Rows | Key |
|---|---|---|
| `pro_canonical_player_game_stats` | 859,391 | `(canonical_game_id, player_lp_page)` |
| `pro_canonical_team_game_stats` | 182,108 | `(canonical_game_id, team_key)` |

`pro_authority/oe_stats_reader.py` is the read surface — aggregates, per-game
lists, team totals, `series_games()`, `series_score()`. **It has no HTTP
consumer.** Nothing in `routes/` imports it. A series/game UI needs a route
before it needs a component.

**Deployment**: the code is on `master`; whether Railway's database has been
promoted is a separate question from whether the code shipped, and promotion
is a `scripts/promote_oe_stats.py` run against the production DB. Verify with
`--status` before believing any number reaches production.

### Series identity — solid, and it is Leaguepedia's

`pro_canonical_games.match_id`, present on **113,815 of 113,815** games, with
`game_number` on all of them. OE publishes no series identifier at all, so
nothing was invented. Measured properties that matter to the UI:

* **67,659 distinct series**, and **no match_id spans more than two teams** —
  so a series *is* a team meeting, and Entry Path 1 is a `GROUP BY match_id`
  rather than a clustering problem.
* **39,902 of 67,659 (59%) contain exactly one game.** Bo1 leagues are the
  majority of the corpus. A series layer that always renders "1–0" would be
  inventing a series around a single game; a one-game meeting must render as
  a game.
* `match_id` is human-readable and already carries the context a header needs:
  `LCK/2026 Season/Rounds 1-2_Week 7_7`.

Live proof — T1 vs Gen.G since 2025 is **12 meetings**, every one with a
score, an event, a date, a patch and a game count, and **40 of 40** of their
games carry OE stats:

```
2026-06-14  5g  T1 3–2  LCK 2026 Road to MSI
2026-05-16  3g  T1 2–1  LCK 2026 Rounds 1-2
2026-04-08  2g  T1 0–2  LCK 2026 Rounds 1-2
2025-10-18  1g  T1 0–1  Worlds 2025 Main Event
2025-09-21  5g  T1 2–3  LCK 2025 Season Playoffs
…
```

`series_score()` counts `blue_win IS NULL` as `undecided` rather than
assigning it, which is the posture the rest of the authority uses.

### Game identity — solid

`canonical_game_id`, with `game_number`, `game_date`, `patch` (Leaguepedia's
scheme) and `oe_patch` (OE's — `26.09` and `16.09` are the same patch),
`league_name`, `tournament_name`, `blue_team_key` / `red_team_key`,
`blue_win`, and `game_length_seconds` on **100%** of stat rows.

### Trustworthy per-game facts

Verified end-to-end on one real game (Gen.G vs T1, 2026-05-16, game 3):

* **Per player** — K/D/A, total CS, minion/monster kills, total and earned
  gold, damage to champions and to towers, vision score, wards placed/killed,
  control wards, and gold/xp/cs/kills/deaths/assists at 10/15/20/25 *plus the
  direct lane opponent's value at each*. Side and role travel with them.
* **Per team** — kills, deaths, dragons, elemental drakes and their types,
  barons, heralds, void grubs, elders, towers, inhibitors, first blood /
  tower / dragon / baron / mid tower, total and earned gold, vision, damage.
* **Picks and bans** — `pro_canonical_picks_bans`, five picks and five bans
  per side, with `team_key` and `side`.

The strongest evidence the join is right is upstream: `SUM(player kills)`
equals the team row's `team_kills` on **138,380 of 138,380** team-games, and
those numbers come from different source rows joined through Mogzy's own
identity.

### Missing or unsafe — do not render these

1. **Draft ORDER does not exist.** `sequence = -1` on **all 2,235,030**
   pick/ban rows. Bans are an unordered set of five per side. A UI that lays
   them out as a draft sequence would be inventing the order, and OE's own
   `firstPick` was deliberately not promoted for exactly this reason.
2. **`turret_plates` is not safe to print.** Max is 25 per team by
   construction (5 outer turrets × 5 plates); the column's maximum is **45**
   and **6,302 of 80,708** rows exceed 25. Something about it does not mean
   what its name implies. Leave it out until someone reconciles it.
3. **Coverage is 80%, not 100%** — 91,054 of 113,815 games. Pre-2014 gets
   nothing (OE's first year), and the gap is concentrated in regional second
   divisions. A game with no stat row must say so; a zero would be a lie.
4. **Damage taken and mitigated exist only as per-minute rates.** No raw
   totals upstream.
5. **`monsterkillsownjungle` / `...enemyjungle` collapse after 2021** (55%).
6. **100 games where OE and Leaguepedia disagree on the winner.** Both are
   stored, nothing is reconciled, and no code assumes either. A game view must
   read the canonical `blue_win` and not OE's, or the series score and the
   game card will disagree with each other.
7. **Lane-opponent identity is Leaguepedia's, not OE's.** OE gives the
   opponent's *values* (`opp_gold_at15`), never their name.
8. **Empty slices render as "Perfect".** `kda_ratio` returns `None` for
   `deaths == 0`, and a matchup that never happened sums to 0/0/0. Every
   caller must check `games > 0` first.

### Recommended state model

**No fourth mode.** `mode=team` and `mode=lane` stay the only two. A series and
a game are *narrowings of the evidence already on screen*, not a new place to
be, and the product hierarchy the owner described — team → lane → player ×
champion → exact matchup → series → game — is a drilldown, not a filter stack.

The selection gains two optional keys beside the four the study already
carries, and they behave exactly like `study` does:

```
team_a  team_b  scope  lane   (the board)
focus_player  focus_champion  vs_player  vs_champion   (the study)
series   game                                          (the evidence)
```

* `series` is a `match_id`; `game` is a `game_number` within it, never a bare
  `canonical_game_id` — a number is legible in a URL and the pair is unique.
* `game` without `series` is meaningless and must be dropped, the same way
  `boardRequestSelection` already strips `study` before `/team`.
* A team or scope change drops both. A side swap keeps them. Same rules,
  same place — `teamSelectionToParams` / `teamSelectionFromParams`.
* The board fetch stays decoupled: `/team` never sees `series` or `game`.

That is the whole URL/state answer. Pretty URLs remain a rename, not a
redesign — the state is fully addressable either way.

**Series state — what belongs where**

| Layer | Carries |
|---|---|
| Meetings list (on the board) | date · score · event. Three fields, one line each, newest first, bounded to ~8 with a count. |
| Series summary | event, tournament, date, patch, the two teams, score, game count, and the players actually used — substitutions are a real fact and the roster authority already reports them |
| Per-game row | game number, side, duration, result, the ten champions, and one economy figure |
| Expanded game | the full per-player table and the team objective row |

Do **not** put per-player KDA in the meetings list. It is the compact answer to
"when did these two teams play", and a reader who wants numbers clicks.

**Game state** — the deepest evidence layer, and the terminal one: exact
rosters used, picks, bans (as an unordered set, see above), side, K/D/A, CS,
gold, damage, vision, the team objective row, duration, result, patch, date
and event. Derived figures only where the raw components are stored and the
denominator is real: CS/min, gold/min, damage share, gold@15 differential.
No rating, no grade, no prediction.

### Entry points

1. **From the team board.** A compact *Historical meetings* section — the
   `GROUP BY match_id` above. Clicking one sets `series` and narrows the same
   Explorer. A one-game meeting sets `series` and `game` together, because
   there is no series to show.
2. **From the exact matchup.** `/exact` already returns `exact.meetings` and
   `exact.most_recent`; each needs `match_id` and `game_number` added to it —
   which is a column already on `pro_canonical_games` and a change to the
   projection, not to the query. `1 game · 1–0` then becomes clickable, and
   the reader moves aggregate → evidence → source game.

Other Pro Examples can reach the same place later through the same two keys.

### The smallest next slice

**`GET /api/pro-play/matchup/series` plus a meetings section on the board.**

* Backend: one route over `oe_stats_reader.series_games` / `series_score`,
  plus a `team_meetings(conn, team_a, team_b, scope)` function that is the
  `GROUP BY match_id` measured above. It writes no statistic — same posture as
  every other module in this workstream.
* Backend, same slice: add `match_id` and `game_number` to the meeting rows
  `/exact` already returns. Two columns on a table it already joins.
* Frontend: the meetings list on the board, and the exact record's meeting
  line made clickable. Both set `series` (and `game` for a Bo1).

That is one route, one projection change and one section, and it makes both
entry paths real before any per-game table exists. The series summary, the
per-game rows and the expanded game detail are the slice *after* it, and they
should not start until a `series` selection is something the URL can hold.

Explicitly **not** in it: a Gol.gg-style standalone match page, Comparison Lab,
custom cohorts, prediction, any new ingestion, any new statistics authority,
and pretty URLs.

---

# Step 4 — the historical meeting

Implemented. A specific historical meeting is now a state inside Matchup
Explorer, reachable from two places, and it did not become a match-history
application to get there.

## Terminology — MEETING, and why it is not "series"

A **meeting** is one `pro_canonical_games.match_id` — Leaguepedia's series
identity, present on **113,815 of 113,815** canonical games. The product word
is *meeting* because **39,902 of 67,659 (59%)** of those match_ids carry
exactly ONE game: Bo1 leagues are the majority of the corpus, and a layer that
called every match_id a series would be inventing a best-of around a single
game.

So the payload reports a measured `kind`:

| `kind` | when | what the UI is allowed to say |
|---|---|---|
| `single_game` | `game_count == 1` | "Single game". `1–0` is printed as the factual result it is. **Never** "Series". |
| `series` | `game_count > 1` | "Series · N games" |

`match_id` / `game_number` remain the internal vocabulary, and the route is
called `/series` because that is the parameter's own name — the *payload* is
where the care lives, not the URL.

## Endpoint contract — `GET /api/pro-play/matchup/series`

Admin-gated (router-level), read-only. **A fifth sibling**, on the same shape
argument that split the other four: it takes one identifier and returns a
meeting with a list of games, sharing no parameter with `/team` except the
scope and nothing at all with `/exact`.

**Query:** `match_id` (required) · `scope` (default `current_2026`) ·
`league_filter`.

**Errors:** 404 unknown `match_id` · 400 unknown scope · **422** a `match_id`
whose games do not describe two teams playing each other. The 422 is measured
to be unreachable today and is raised rather than resolved: picking two of
three teams and drawing a meeting around them would be the failure.

**Response:** `match_id` · `kind` · `game_count` · `teams[]`
(`team_key`, `display_name`, `explorer_navigable`) · `league_slug` /
`league_name` / `tournament_id` / `tournament_name` · `started_at` · `patch`
/ `patches` · `score_line[]` · `undecided` · `winner_team_key` · `scope_id` ·
`in_scope` · `games[]` · `unavailable_metrics`.

Each game carries `canonical_game_id`, `game_number`, `game_date`, `patch`,
`blue_team_key` / `red_team_key`, `winner_team_key`, `decided`,
`duration_seconds` and `participants[]` (`team_key`, `role`, `side`,
`player_lp_page`, `champion_key`, `win`).

**The board also gained the list.** `/team` now returns `meetings`,
`meetings_total`, `meetings_limit` and `notes.meetings` — served on the board
rather than from a sibling route because the board has already named the only
three things the question takes (two teams and a scope), and a second request
could return an answer that disagrees with the lanes above it. Measured at
23 ms for the team-pair scan against the real corpus, over indexes that
already ship.

**`/exact` gained two columns.** Every meeting row and `most_recent` now carry
`match_id` and `game_number`. Both were already on the fact the one pass holds,
so this is a projection change and not a second read.

## Game ordering rule

**`game_number`, and nothing else.** Measured over the whole corpus:
`game_number` is non-null on **113,815 of 113,815** games and
`(match_id, game_number)` has **zero** duplicates, so the order is total.

It is never inferred from the draft — `sequence` is `-1` on all 2,235,030
pick/ban rows — and never from the date alone, because a best-of is played in
one sitting and several games really do share a timestamp. **The client sorts
again** rather than trusting the array: a fixture that hands the games back out
of order is in the frontend suite, and it caught exactly that bug during this
task.

## Score derivation rule

Counted from the games' own recorded winners, reading the **canonical**
`blue_win` and never Oracle's Elixir's — the two disagree on 100 games, both
are stored, and a meeting whose header disagreed with its own game rows would
be worse than either.

* `blue_win IS NULL` is counted in `undecided` and assigned to **neither**
  team — the fail-closed posture `series_score` and `derive_blue_win` use.
* `winner_team_key` is named **only when `lead > undecided`**. 1–0 with one
  game unresolved is a 1–0 with a game missing; naming a winner there would be
  inventing that game's result. A draw names none.
* `score_line` is an **ordered** pair, winner first, so a client renders
  `T1 2–1 Gen.G` without deciding anything itself.

## Single-game handling

`kind: "single_game"`, `1–0` as the factual result, and `single_game_number`
set on the listing row so the meeting is entered with its one game already
named — there is no series above it to choose from. The frontend has a test
whose only job is that a Bo1 row's text never matches `/series/i`.

## Meeting state / query design

Two more optional keys on the board's existing selection, on exactly the terms
`study` already established. **No fourth mode, and no visible tab.**

```
team_a  team_b  scope  lane                                   (the board)
focus_player  focus_champion  vs_player  vs_champion          (the study)
meeting  game                                                 (the evidence)
```

* `meeting` is a `match_id`; `game` is a `game_number` within it, never a bare
  `canonical_game_id` — a number is legible in a URL and the pair is unique.
* **`game` without `meeting` is dropped**: a game number identifies nothing
  without the meeting it numbers.
* `boardRequestSelection` strips both before `/team`, so opening a meeting
  never refetches five lanes.
* Additive: every URL shared before Step 4 parses unchanged.

`game_number` is carried but not yet *rendered* as a per-game state — that is
Step 5, and the key exists now so Step 5 is a render and not a state change.

## Clearing rules

| change | `study` | `meeting` | why |
|---|---|---|---|
| team A or B | cleared | **cleared** | a meeting is a meeting BETWEEN TWO TEAMS |
| scope | cleared | **cleared** | the list is rebuilt from the new scope |
| study subject | cleared | **cleared** | evidence for one exact matchup is not evidence for another |
| study opponent | kept | **cleared** | same |
| closing the study | cleared | **cleared** | a meeting shell with no question above it is a match page |
| side journey | replaced | **cleared** | a new board *and* a new study |
| **side swap** | kept | **kept** | reading the board the other way round does not change who played |

They live in `matchupApi` beside every other selection rule, so a stale meeting
is impossible rather than cleaned up afterwards. Seven tests hold the table,
plus one that clears a meeting in the **rendered** board rather than only in
the selection object.

## Entry point 1 — Recent Meetings on the board

A compact section under the five lanes: score, event, date, patch, and the
`kind`. Bounded to 8 with `N of M` when there are more. It is a dossier line,
not a match history page — no filters, no per-player numbers. Clicking a row
sets `meeting` (and `game` for a Bo1).

## Entry point 2 — exact matchup → source meeting

The exact record's own meeting rows are now clickable, **deduped by
`match_id`**: two games of one best-of are one meeting to open, and listing it
twice would read as the pair having met twice. The study stays open behind the
shell — the reader arrived through that question, and closing it would lose
their place.

`aggregate claim → source meeting → the games` is the move, and a backend test
walks it end to end: every `match_id` the record hands out resolves to a
meeting that really carries the game it counted.

## Scope and meeting are not two equal filters

The scope **searches**; the meeting is **chosen by name**.

* `team_meetings` honours the scope — it is the same universe the five lanes
  above it were built from.
* `meeting()` is identified by `match_id` and returns **all** of its games
  whatever scope is selected. Dropping games from a meeting because of a scope
  would print a score that was never played.
* `in_scope` **reports**. The shell says "Within 2026" or "Outside the selected
  scope (2026)" — which is also the whole cross-scope deep-link rule, defined
  now and needing no machinery: a meeting outside the current scope opens, and
  says so.

## Real examples verified against the corpus (2026-09-09)

* **T1 vs Gen.G, `recent_2025_2026` — 12 meetings**, every score matching the
  independent SQL walk in the audit above.
* **Bo3** `LCK/2026 Season/Rounds 1-2_Week 7_7` — T1 2–1 Gen.G, three games on
  26.09, ten participants each, durations 1634 / 3018 / **null** (game 3 has no
  OE row, and prints "Duration not recorded").
* **Bo1** `2025 Season World Championship/Main Event_Round 3_4` — Gen.G 1–0 T1,
  `kind: single_game`, and `in_scope: false` under `current_2026`.
* **Substitution** `LCP/2026 Season/Split 2 Playoffs_Round 3_2` — GAM Esports
  used **six** players across five games (Gloryy → Aress from game 3), and the
  sixth appears only in the games he played. Read off the games' own rows, never
  off a roster.
* **2015** `Champions/2015 Season/Spring Season_Week 1_1` — the far end of the
  supported range, three games, two teams, a winner, durations present.
* **The Step 3 source meeting** — `Doran (Choi Hyeon-joon)` Jayce vs `Kiin`
  K'Sante is 2 games, 2–0, and its most recent is game 3 of the Bo3 above.

## What Step 4 deliberately does not show

Named in `unavailable_metrics`, in the server's words, rather than left
missing: **draft order** (`sequence` is -1 on all 2,235,030 rows — bans are an
unordered set and no shape here may imply a sequence), **bans** (deferred
rather than laid out as a draft phase), and **per-player combat statistics**
(they are in the corpus and nothing in the Explorer reads them yet).

Also absent by design and held by tests: per-player K/D/A, damage, CS, vision
and gold tables, objective timelines, graphs, `turret_plates` (max 45 against a
structural ceiling of 25), prediction, win probability and inferred strategy.

## Deploy state — Step 4 (2026-09-09)

| | SHA | Where |
|---|---|---|
| Backend | `c827b52f` on `master` | **Deployed.** Railway answers `/api/pro-play/matchup/series` with **403** (gated) while an unregistered sibling under the same prefix answers **404** — which is the discriminator, and the same proof Step 3 used. |
| Frontend | `6582aa69` on `main` | **Pushed, NOT published.** |

**The published `mogzy.lol` bundle is still Step 3.1.** `ProPlayMatchup-yMee_71D.js`
contains `explorer_navigable` and `teams_outside_explorer_pool` and contains
**none** of `Recent Meetings`, `dossier-meeting-shell`, `meeting-row`,
`single_game` or `Duration not recorded`. Lovable publishes on the owner's
click; a push is not a publish, and this was checked by fetching the bundle
rather than assumed.

**There is no deploy-ordering hazard this time.** Everything Step 4 added to
`/team` is additive — `meetings`, `meetings_total`, `meetings_limit` and one
new key inside `notes` — and the published client reads named note keys rather
than enumerating them, so it ignores all four. The live site is simply Step 3.1
until the owner presses Publish. (Contrast Step 3.1, where `focus: null` on a
pooled team was a real crash window.)

**Still open from Step 3.1:** delete the `teams_outside_focus_set` mirror once
a frontend carrying `teams_outside_explorer_pool` is *published*. That
condition is still not met. *(It was met on 2026-09-08, and **Step 8 deleted
the mirror**.)*

## Files — Step 4

### Backend

| File | Role |
|---|---|
| `pro_authority/meetings.py` | **New.** `team_meetings`, `meeting`, the score and winner rules, `MeetingNotFound` / `MalformedMeeting`. |
| `pro_authority/comparison.py` | `GameFact` gained `match_id` / `game_number` (defaulted, so positional construction still works). |
| `pro_authority/exact_matchup.py` | The meeting-row projection gained the two columns. |
| `pro_authority/matchup.py` | `/team` serves the meetings section and `notes.meetings`. |
| `routes/pro_play_matchup.py` | `GET /series`. |
| `test_pro_authority_meetings.py` | **New.** 64 tests, 11 against the real corpus. |

### Frontend

| File | Role |
|---|---|
| `src/components/pro-play/dossier/MeetingDrilldown.tsx` | **New.** `RecentMeetings` and `MeetingShell`. |
| `src/lib/pro-play/matchupApi.ts` | Meeting types, `meeting` selection key, `fetchMeeting`, the clearing rules. |
| `src/pages/pro-play/ProPlayMatchupTeam.tsx` | Renders both, and owns both entry points. |
| `src/components/pro-play/dossier/MatchupStudy.tsx` | `SourceMeetings` under the exact record. |
| `src/components/pro-play/dossier/PlayerChampionDrawer.tsx` | Passes `onOpenMeeting` through. |
| `src/index.css` | `.dossier-meeting*`, `.dossier-study__source*`, after the study block. |

# Step 2 enrichment — Oracle's Elixir statistics in the dossier

**Shipped 2026-09-09.** An enrichment pass on Step 2 only. The drawer was not
redesigned, no route was added, and Steps 3–5 were not touched.

## Objective

Put four real historical statistics into the existing player x champion
dossier, from the Oracle's Elixir enrichment layer promoted by
`pro_authority/oe_stats.py` (see `OE_STATS_HANDOFF.md`).

Added: **KDA, CS/min, gold/min, damage-to-champions/min.** Deliberately NOT
added: vision, damage share, gold share, early-game deltas, objectives, wards,
healing, or any other OE field. Those belong to a later analytics surface; the
drawer has to stay fast to scan.

## Stat authority

| | |
|---|---|
| Game identity, player identity, team identity, result | **Leaguepedia** — unchanged |
| K/D/A, CS, gold, damage, game length | **Oracle's Elixir** |

OE never contributes a game, a player, a team or a winner to this dossier. It
decorates games the canonical layer already owns. `overall.wins`,
`overall.win_rate` and `recent_form` are Leaguepedia's and were not touched.

**The premise that changed.** `pro_authority/player_dossier.py` used to state
in its docstring that the corpus carried no kills, deaths or assists anywhere,
and carried an `unavailable_metrics` entry saying so. That was TRUE of the
corpus as it then was. The OE promotion (875,430 player-game stat rows) made it
false, so the declaration is gone rather than left standing as a stale apology
beside the figure it denies. `unavailable_metrics` is now `[]` and the key is
retained so the NEXT unservable metric can be declared there.

**Two static guards were checked and deliberately NOT weakened.**
`test_pro_authority_player_champion.py` and
`..._player_champion_comparison.py` fail the build if the words "kda", "kills",
"deaths" or "assists" appear in the Player x Champion *derived-authority*
slice (`canonical_player_games`, `player_champion_scope`, `schema`, `reader`,
`rebuild`, `manifest`, `player_champion_question_family`). Those modules were
not modified. `player_dossier` is not in either guard's module list, which is
why this pass is legal without touching them — the rejection was of KDA in the
precomputed scope-stats bank, not of KDA in a query-time read.

## Exact formulas

All four are **weighted aggregates derived from raw totals**, never averages of
per-game rates. Every one is proved by a test that also asserts it differs from
the naive average, so a regression to averaging fails loudly.

```
KDA      = (SUM(kills) + SUM(assists)) / SUM(deaths)
           SUM(deaths) == 0 and games > 0  ->  null, rendered "Perfect"
           games == 0                      ->  null, rendered "—"

CS/min   = SUM(total_cs)            / (SUM(game_length_seconds) / 60)
Gold/min = SUM(total_gold)          / (SUM(game_length_seconds) / 60)
Dmg/min  = SUM(damage_to_champions) / (SUM(game_length_seconds) / 60)
```

**Each rate's denominator is its own.** A row is summed into a family only when
BOTH that family's numerator column and `game_length_seconds > 0` are present.
A row missing `total_gold` (868 of 875,430 in the real corpus) must not lend
its minutes to gold/min — that would silently deflate the figure. The per-family
`games` count in the payload IS that denominator.

`game_length_seconds > 0` rather than merely NOT NULL: a zero duration is a
broken row, not a very short game, and would raise rather than render.

**Why weighted and not averaged.** Doran's Jayce, 2026, real corpus: the
weighted CS/min is **9.111**, the average of the 13 per-game rates is **9.177**.
The difference is a 22-minute stomp and a 45-minute grind being given equal
say. OE's own published `cspm`/`dpm` columns are per-game rates and were
deliberately not promoted for exactly this reason — the raw totals were stored
instead so the aggregate could be derived correctly here.

## Coverage semantics

OE reaches ~80% of the canonical corpus and publishes nothing before 2014, so
partial coverage is the NORMAL state of a long career, not an edge case.

Every stat scope carries:

```
statistics.<scope>.coverage = {
  total_games,          # canonical games in the slice — equals overall.games
  stat_games,           # those carrying an OE row
  missing_stat_games,   # the difference
}
```

and every figure additionally carries its own `games`, because a row can be
enriched and still be missing one column.

`statistics` is a **sibling of `ban_pressure`, not a widening of `overall`**.
`overall` is the canonical record and each of its numbers covers all of its
games; these cover only the enriched ones. Folding them into one object would
put two denominators under one heading, which is the exact confusion the
coverage block exists to prevent. A static test
(`test_no_combat_figure_appears_outside_the_statistics_block`) enforces the
separation.

**Null is never zero.** A slice with no enriched games returns `null` for every
figure and the drawer renders `—`. Zero would read as a player who dealt no
damage.

## Endpoint contract addition

`GET /api/pro-play/matchup/player-champion` — same route, same parameters, same
scope/league_filter/opponent semantics, same 400/404 behaviour, same admin gate.
One key added:

```jsonc
"statistics": {          // null when participation is did_not_participate
  "overall": {
    "coverage":       { "total_games": 13, "stat_games": 11, "missing_stat_games": 2 },
    "kda":            { "kills": 58, "deaths": 34, "assists": 80,
                        "ratio": 4.0588, "perfect": false, "games": 13 },
    "cs_per_min":     { "value": 9.111, "games": 13 },
    "gold_per_min":   { "value": 454.5, "games": 13 },
    "damage_per_min": { "value": 840.8, "games": 13 }
  },
  "versus_opponent": { /* same shape; null when no opponent was supplied */ }
}
```

`definitions` gains `statistics` and `statistics_coverage`.
`unavailable_metrics` is now `[]`.

## Real query proofs (2026-09-09, full corpus)

Each cross-checked against the underlying OE fact rows with independent SQL,
not against an endpoint snapshot.

| Case | Result |
|---|---|
| **Doran · Jayce · 2026** (large sample) | 13/13 covered. K/D/A 58/34/80 → KDA **4.059**. 24,602s = 410.0 min. CS/min **9.111**, gold/min **454.5**, dmg/min **840.8**. Raw-row recomputation matched all four exactly. |
| **Doran · Jayce · 2026 vs Gen.G** (opponent slice) | 2/2 covered. K/D/A 6/10/14 → KDA **2.00**, CS/min 8.36, gold/min 400.0, dmg/min 667.9. |
| **Faker · Azir · all_time** (partial coverage) | **195 of 197** covered, 2 missing. KDA 4.036 over (657/419/1034). Every figure computed over 195. |
| **Tomem · K'Sante · all_time** (zero stat coverage) | 27 canonical games, **0** enriched. All four figures `null`. The record still reads 27 games. |
| **Doran · Teemo · 2026** (zero games) | `participated`, `overall.games == 0`, coverage 0/0/0, all figures `null`, `perfect: false`. |

Corpus-wide field coverage over the 875,430 enriched rows: kills/deaths/assists
**875,430 (100%)**, `total_cs` 875,420, `total_gold` 874,562,
`damage_to_champions` 874,559, `game_length_seconds` 875,430. So the four
families almost always share a denominator — which is why the UI prints ONE
coverage note — but not always, which is why the API keeps them separate.

## Performance

Measured warm, in-process, over the real 5.6 GB corpus.

| Case | Dossier total | of which statistics |
|---|---:|---:|
| Faker · Azir · all_time (197 games) | 56.4 ms | **0.72 ms (1%)** |
| Doran · Jayce · 2026 vs Gen.G | 4.1 ms | 0.05 ms (1%) |
| Doran · Aurora · 2026 (3 games) | 3.7 ms | 0.02 ms (1%) |
| Doran · Teemo · 2026 (0 games) | 3.7 ms | 0.00 ms (0%) |

One extra indexed query per stat scope (two per request), chunked at 400 ids
against SQLite's 999-parameter limit. **No caching was built** — profiling says
none is warranted, and building it would have been speculative.

## Frontend presentation

Four rows appended to the comparison table the drawer already had — not a
second panel, not stat cards. The reader's question is unchanged, so the answer
arrives in the table that already answers it. One hairline rule opens the
statistics group so the different denominator is visible without being
explained.

Precision is chosen per metric rather than applied uniformly: KDA 2 decimals
(the convention every League reader knows), CS/min 1, gold/min and damage/min 0
— those are read as magnitudes and a decimal on 454.5 is noise. The raw
`K / D / A over N games` sits in the KDA cell's `title`.

## Partial-coverage UX

One shared note under the table, in the drawer's quietest voice:

> Statistics available for 2 of 3 games.

- Complete coverage prints **nothing** — a note on every dossier stops being read.
- Zero coverage prints "Detailed statistics are not available for these games."
- When families disagree, the range is named (`1–2 of 3 games`) and each row's
  own `title` carries its exact count.
- The opponent column has its own coverage; both are named only when they differ.
- **No engineering explanation reaches the scout.** A test asserts the note
  never contains "oracle", "elixir", "leaguepedia", "corpus", "enrich",
  "pipeline", "database", "backend" or "API".

## Files changed

Backend (`League_Combat_Simulator`):

| File | Change |
|---|---|
| `pro_authority/oe_stats_reader.py` | **+** `player_stat_totals_for_games`, `derive_rate`, `RATE_FAMILIES`. Aggregates over an explicit game set, because product scopes are a season/league/tournament membership test that no WHERE clause over the fact tables can reproduce. |
| `pro_authority/player_dossier.py` | **+** `_statistics`, the `statistics` payload key, two definitions. Premise docstring rewritten; `UNAVAILABLE_METRICS` emptied. |
| `routes/pro_play_matchup.py` | Docstring only — no signature, parameter or gate change. |
| `test_pro_authority_oe_stats.py` | **+8** reader tests |
| `test_pro_authority_player_dossier.py` | **+18** tests; 2 obsolete premise tests rewritten |

Frontend (`mogsy`):

| File | Change |
|---|---|
| `src/lib/pro-play/matchupApi.ts` | **+** `DossierStatistics`, `DossierKda`, `DossierRate`, `DossierStatCoverage`; `statistics` on `PlayerChampionDossier` |
| `src/components/pro-play/dossier/PlayerChampionDrawer.tsx` | **+** `kdaText`, `kdaDetail`, `rateText`, `coverageNote`; four table rows + the note |
| `src/index.css` | **+** `.dossier-drawer__rowgroup` hairline (7 lines) |
| `src/pages/pro-play/ProPlayMatchupTeam.test.tsx` | **+11** tests; fixture gains `statistics`, 1 obsolete test replaced |

## Tests

- Backend `test_pro_authority_player_dossier.py`: **64 passed** (was 46)
- Backend `test_pro_authority_oe_stats.py`: **57 passed**, 1 skipped
- Backend full `test_pro_*.py`: **1,534 passed**, 1 skipped
- Frontend `ProPlayMatchupTeam.test.tsx`: **173 passed** (was 162)
- Frontend all Pro Play: **383 passed** / 7 files
- `tsc --noEmit`: 11 errors, **identical to the clean-`main` baseline**, none in
  files touched here (verified by stashing)
- `vite build`: clean

## Deploy state — Step 2 enrichment (2026-09-09)

| | |
|---|---|
| Backend commit | `e76dd3c7` on `master`, pushed |
| Railway | deployment `5027bcab` for `e76dd3c7` — **SUCCESS** |
| Frontend commit | `ec24c192` on `main`, pushed |
| Lovable | **published** — the live `ProPlayMatchup-D8MKCyWN.js` chunk on `mogzy.lol` contains `row-csmin`, `Gold/min`, `Dmg/min`, `dossier-drawer-coverage` and `Perfect` |

**Production endpoint verified** (`Faker · Azir · all_time · vs Gen.G`):
`statistics` present, `unavailable_metrics: []`, coverage **198 of 200**,
K/D/A 664/430/1045 → KDA 3.974, CS/min 9.234, gold/min 426.6, dmg/min 652.8,
opponent slice 21/21. `Doran · Jayce · 2026` returns 13/13 and KDA 4.0588 —
identical to the local raw-row cross-check. `Doran · Teemo · 2026` returns
0 games and `null` everywhere.

**Rendered production page NOT verified by this pass.** `/lol/pro-play/matchup`
is admin-gated and requires the owner's Mogsy account sign-in; the session is
the owner's to provide. Everything the page depends on IS verified: the
production backend serves the contract, and the published bundle contains the
rendering code.

**Verified instead against the real 5.6 GB corpus, locally, in a browser**
(local FastAPI + vite, throwaway admin key, never the production secret):

- `Doran · Jayce · 2026 · vs Gen.G` — rows read
  `KDA 4.06 / 2.00`, `CS/min 9.1 / 8.4`, `Gold/min 455 / 400`,
  `Dmg/min 841 / 668`; KDA cell `title` = `58 / 34 / 80 over 13 games`;
  **no** coverage note (13 of 13).
- `Faker · Azir · all_time · vs Gen.G` — note reads
  **"Statistics available for 195 of 197 games."** while `Games` still reads
  197. `title` = `657 / 419 / 1034 over 195 games`.
- `Faker · Orianna · all_time` — 93 of 93, no note; KDA 5.62 confirmed against
  the raw rows as (329 + 655) / 175.
- **375 x 812 (mobile)**: `document.scrollWidth == clientWidth` (no page-level
  horizontal overflow), table 347px inside a 375px sheet, **no** row label
  wraps, **no** cell clipped.
- 1280px desktop: no page overflow; drawer height essentially unchanged.
- Rapid re-selection (Azir → Orianna, 60ms apart) painted Orianna's figures
  under Orianna's heading — no stale response.
- No console error from the dossier; the only errors on the local page are a
  401 on `/api/stat-check/invites` (no Supabase session in that harness) and a
  400 on `/api/pro-play/media/resolve`, both pre-existing and unrelated.

## Remaining gaps — Step 2 enrichment

1. **The rendered production page** still wants an owner-session pass, per above.
2. **Field-level coverage is exposed but never yet observed to differ in the
   product.** 868 rows corpus-wide lack `total_gold`; the `1–2 of 3 games`
   range wording is covered by tests but has not been seen on a real slice.
3. **No per-role or per-patch normalisation.** A support's CS/min and a mid's
   sit in the same column with no context beyond the lane the drawer opened
   from. That is a comparison feature, not a correctness gap.
4. **`versus_opponent` samples are small by nature** — 2 games is common. The
   drawer prints the count beside the figure and does nothing further; a
   minimum-sample gate was not added because the reader can see the denominator.
5. **OE publishes nothing before 2014**, so pre-2014 canonical games can never
   receive these statistics. Not fixable from this side.

## Next recommended slice — Step 5

**The game state, and the per-player table that is the reason to open one.**
The state key (`game`) already exists and already round-trips, so this is a
render rather than a state change:

1. Clicking a game row sets `game`; the shell expands that one game.
2. `GET /api/pro-play/matchup/game?match_id=…&game_number=…`, over
   `oe_stats_reader` — per-player K/D/A, CS, gold, damage, vision, and the team
   objective row. All raw components, never a baked ratio.
3. **A game with no stat row must say so.** Coverage is 91,054 of 113,815 (80%),
   concentrated away from pre-2014 and regional second divisions; a zero would
   be a lie.
4. Read the **canonical** `blue_win`, never OE's — they disagree on 100 games.
5. `kda_ratio` returns `None` for `deaths == 0` ("Perfect"), and every caller
   must check `games > 0` first: an empty slice sums to 0/0/0 and renders as
   Perfect otherwise.
6. Still no draft order, and still no `turret_plates`.

Bans could be added to the meeting shell in the same slice — as an unordered
set of five per side, labelled as one.

---

# Step 5 — the specific game

Implemented. A reader can drill from a historical meeting into one exact game
and read the real 10-player box score plus the core team objectives, without
leaving the Explorer and without a single invented number.

## Endpoint contract — `GET /api/pro-play/matchup/game`

Admin-gated (router-level), read-only. **A sixth sibling**, on the same shape
argument that split the other five: it takes a game's identity and returns a
box score. It shares the scope with `/series` and nothing else, and no other
route in this prefix carries a per-player statistic.

**Query:** `match_id` (required) · `game_number` (required, ≥ 1) ·
`scope` (default `current_2026`) · `league_filter`.

**Errors:** 400 unknown scope · 404 unknown `(match_id, game_number)` — which
covers an unknown meeting AND a game number that meeting does not have,
because the pair is one identity · 422 a missing or non-positive parameter.

**Response:** `canonical_game_id` · `match_id` · `game_number` ·
`meeting` (`kind`, `game_count`, `game_numbers`) · `league_slug` /
`league_name` / `tournament_id` / `tournament_name` · `game_date` · `patch` ·
`blue_team` / `red_team` (team ref + `side`) · `winner_team_key` · `decided` ·
`duration_seconds` · `scope_id` · `in_scope` · `stats_available` ·
`stat_player_rows` · `team_stats_available` · `stats_note` · `players[]` ·
`teams[]` · `bans[]` · `bans_note` · `diagnostics` · `unavailable_metrics`.

## Canonical game identity — the PAIR, not the opaque key

`match_id` + `game_number`, and that is a deliberate choice over
`canonical_game_id`:

* it is **total** — `game_number` is non-null on 113,815 of 113,815 canonical
  games and `(match_id, game_number)` has **zero** duplicates corpus-wide, and
  a real-corpus test re-measures both;
* it is **the state the Explorer's URL already holds**. Step 4 added `meeting`
  and `game` and only rendered the first, so Step 5 is a render and a fetch
  rather than a state change;
* it makes **"does this game belong to this meeting" true by construction**.
  There is no second containment check that could disagree with the lookup,
  and a hand-edited URL naming a real meeting and a game it does not have gets
  a 404 rather than some other meeting's game.

`canonical_game_id` is **returned**, so a caller that wants the opaque key has
it without ever having to build one.

## Player stat authority

`pro_canonical_player_game_stats`, read through the same tables
`pro_authority/oe_stats_reader.py` exposes. **No second statistics authority
was created**, and nothing here averages, rates, grades or predicts.

**Participants are driven by `pro_canonical_player_games`** — the game's own
rows — and the statistics are LEFT-joined onto them. So a substitute appears
in the game he played, a rostered player who did not play appears nowhere, and
nothing consults a roster, a declared starter or team membership.

**Explicit columns, never `SELECT s.*`.** The two tables share `champion_key`,
`side` and `player_lp_page`; a star join would make which one wins depend on
cursor column order, which is the silent authority swap this module exists to
prevent. Leaguepedia's `role` is served, and OE's `oe_position` is served
**beside** it rather than substituted for it, so a disagreement stays visible.

## Team objective authority

`pro_canonical_team_game_stats`, read from the team table and **never summed
from the player rows** — team objectives are not a player statistic. The
upstream check that the join is right runs the other way: `SUM(player kills)`
equals the team row's `team_kills`, and a real-corpus test re-asserts it on a
live T1 vs Gen.G game.

Served: kills, deaths, towers, inhibitors, dragons, elemental drakes, elders,
heralds, void grubs, barons, atakhans, gold (total / earned / spent), damage
to champions, CS, vision, wards, control wards, plus the `firsts` booleans.

## Winner authority — unchanged from Step 4

**The canonical `blue_win`, always**, even though the statistics are Oracle's
Elixir's. A game card that took its result from OE would disagree with the
meeting header above it, which counts canonical winners. Where OE's own row
contradicts Leaguepedia's, `diagnostics.oe_winner_disagrees_with_canonical`
reports it — **an operator flag, not a sentence for a reader**, who did not
ask about Mogzy's ingestion. A frontend test asserts the words "disagree",
"Oracle" and "canonical" never reach the screen.

## Missing-stat semantics — unavailable is not zero, and the SHAPE says so

OE statistics reach **92,714 of 113,815** canonical games (~81%, re-measured
2026-09-09). A game outside that returns:

* `stats_available: false`, `stat_player_rows: 0`, `teams: []`;
* `players[]` **still complete** — ten rows, their champions, their canonical
  win — with `stats: null` on every one;
* `stats_note`, the server's own sentence, which the client prints verbatim.

A zeroed box score would be indistinguishable from a real one, so none is
produced. Inside an enriched row a **NULL column stays null** (a 2016 game has
no vision score; a 22-minute game has no `gold_at25`), which is a different
statement again. A zero anywhere in this payload is therefore always measured.

## KDA formatting rule

**Mogzy already had a convention and it was not invented here.**
`oe_stats_reader.KDA_ZERO_DEATH_CONVENTION` — `(kills + assists) / deaths`,
and `None` for `deaths == 0`, rendered "Perfect". Substituting `deaths = 1`
reports a WORSE number than the player earned; printing infinity is not a
number. `/game` calls that same function.

**The empty-slice trap is closed by shape, not by a caller remembering.**
`oe_stats_reader` warns that a matchup that never happened sums to 0/0/0 and
lands on the same `None`, so every caller must check `games > 0` first. Here
`kda_ratio` only ever exists **inside** a non-null `stats` object, and a game
with no statistics has no stats object at all — so an unread game cannot be
expressed as a perfect one. Three tests hold it: a deathless 2/0/9, a genuine
0/0/0, and a statless game whose K/D/A cell contains no digit at all.

K/D/A is always printed directly (`2 / 0 / 9`); the ratio is a secondary line.

## Desktop and mobile design

The dossier renders **inside the selected meeting-game plate**, so the meeting
header and the sibling games never leave the screen. Selecting is a toggle —
clicking the open game closes it and leaves the meeting open.

* **Header** — `T1 vs Gen.G`, then event · game · patch · duration · date, and
  the canonical result in gold.
* **Two box scores**, side by side above 900px and stacked below it: crest,
  team, side, Victory/Defeat, then Player · Champion · K/D/A · CS · Gold ·
  Damage · Vision, with portraits and champion icons.
* **Objective sheet** — a parchment plate, capped at 26rem, three columns. A
  metric that is null on **both** teams is dropped rather than printed as a
  row of dashes.
* **Bans** — an unordered set of icons per side, with the server's sentence.
* **375px** — the table stops being a table: `thead` leaves view and each cell
  prints its own column name from `data-label`, so the seven facts read down
  the page. Measured: `scrollWidth === innerWidth`, no horizontal overflow.

### Two visual defects found and fixed on the way

1. **All of Step 4's CSS had been trapped inside an unclosed
   `@media (max-width: 640px)`** and had therefore **never applied on a
   desktop viewport** — the meeting shell rendered unstyled above 640px in
   everything shipped so far. The media query is now closed and the Step 4
   block sits at top level.
2. That exposed **two-ink mistakes** the media query had been hiding. This
   dossier has a dark folio and light parchment plates: `--dsr-ink` is for the
   plates, the folio's own pale ink for anything on the dark page. The meeting
   head is folio; the meeting-game rows are parchment (and so is the game
   dossier inside them). Both are now stated rather than inherited.

`compactGold` re-states LIVE1's `kgold` convention (`63.2k`) rather than
importing it: `src/pages/esports/live` is another workstream's page module,
and Pro Play depending on its display choices would make one team's restyle
the other's bug. `gameDuration` (`50:18`) is the Explorer's own, from Step 4.

## Game state / query behaviour

**No new state key, and no fourth mode.** `game` is `game_number` **inside**
the existing `MeetingSelection`:

```
team_a  team_b  scope  lane                                   (the board)
focus_player  focus_champion  vs_player  vs_champion          (the study)
meeting  game                                                 (the evidence)
```

`withMeetingGame(selection, n)` sets it, and **returns the selection unchanged
when there is no meeting** — a game number is a position inside a meeting and
means nothing without one.

## Clearing rules

Because `game` lives inside `meeting`, **every Step 4 rule covers it for
free** and no path can strand a game without a meeting:

| change | `meeting` | `game` |
|---|---|---|
| team A or B | cleared | cleared with it |
| scope | cleared | cleared with it |
| study subject or opponent | cleared | cleared with it |
| closing the study | cleared | cleared with it |
| side journey | cleared | cleared with it |
| **side swap** | **kept** | **kept** |
| a different meeting | replaced | reset (to `single_game_number`, or null) |
| a different game | **kept** | changed |

Nine frontend tests hold the table, plus one that proves `game=2` with no
`meeting` is dropped by `meetingFromParams`.

## Scope semantics

Unchanged and deliberate: the scope **searches**, the meeting and the game are
**chosen by name**. `/game` returns the game whatever scope is selected and
`in_scope` **reports** — a 2025 game opens under a 2026 scope and says so. A
real-corpus test opens the Worlds 2025 Gen.G–T1 game under `current_2026`.

## Real corpus examples verified (2026-09-09)

* **T1 vs Gen.G Bo3** `LCK/2026 Season/Rounds 1-2_Week 7_7` game 2 — ten
  enriched rows, Peyz 15/5/5, and player kills summing to `team_kills` on both
  sides (22 and 26). Note game 3 **now has statistics**: the corpus was
  enriched further after Step 4 was written, which is why Step 4's "duration
  not recorded" example no longer reproduces there.
* **A real single-game meeting** — `2025 Season World Championship/Main
  Event_Round 3_4`, `kind: single_game`, `in_scope: false` under 2026.
* **A real game with no statistics** — found by query in the ~19%; identity
  and champions intact, `stats: null` throughout.
* **A real deathless player** — Gumayusi 6/0/5, Worlds 2024 Semifinals game 1.
* **A real substitution** — `LCP/2026 Season/Split 2 Playoffs_Round 3_2`; the
  sixth player appears only in the games he played.
* **A 2015 game** — the far end of the range still resolves as an identity.
* **A real canonical/OE winner disagreement** — canonical wins, flag set. The
  query that finds one must key on **`team_key`, not OE's own `side` column**:
  the two do not always agree, and matching a fact row to a canonical side by
  its side label is exactly the silent swap this layer refuses to make.

## Fields intentionally deferred

* **Lane checkpoints** are served (`stats.checkpoints.at10/15/20/25`, with the
  lane opponent's value at each and a `reached` flag) and **rendered nowhere**.
  They are a real early-game analysis surface and Step 5 is not one; serving
  them now means the later layer needs no new read.
* **Bans are shown; draft ORDER is not, and cannot be.** `sequence` is `-1` on
  all 2,235,030 rows. The set is sorted **alphabetically on purpose** — row
  order would offer an arbitrary sequence that looks like a draft.
* **`turret_plates` is never projected.** Structural ceiling 25 per team,
  observed maximum 45. Two tests assert the string appears exactly once in the
  payload: inside the sentence explaining its absence.
* **Damage taken / mitigated** exist upstream only as per-minute rates.
* **Item builds** — the historical corpus has none.
* No graphs, no gold-over-time, no objective timeline, no lane deltas, no
  rating, no prediction.

## Tests — Step 5

**Backend — 56 new, 10 against the real corpus, all passing.**
`test_pro_authority_game_detail.py`. The fixture writes every ambiguous case
as a real row and gives each its own test: a deathless player and a genuine
0/0/0 **in the same game**, a game with no statistics at all, a NULL field on
an otherwise-enriched row, a game where OE's winner contradicts Leaguepedia's,
a substitution across a meeting, a Bo1, and a 2025 meeting outside the scope.

Pro Play backend regression: **176 passed** across the five
`test_pro_authority_*` suites. Wider sweep (`-k "pro_play or pro_authority or
matchup or oe_stats"`): **1790 passed, 2 failed, 1 error** — an **identical
failure set** to clean `origin/master` measured in a throwaway worktree
(`test_mastery_g4_timeline.py` ×2, `test_con1_pro_specimens.py` collection
error from a corpus/schema skew). Compare failure SETS, never totals.

**Frontend — 65 new (193 in the board suite, was 128), 403 Pro Play tests,
all passing.** Full suite **53 failures across 13 files, none in pro-play** —
the documented `origin/main` baseline. Typecheck **11 errors, none in
pro-play** — also the baseline. Build green.

## Deploy state — Step 5 (2026-09-09)

| | SHA | Where |
|---|---|---|
| Backend | see below | `master`, Railway auto-deploys |
| Frontend | see below | `main`, Lovable publishes on the owner's click |

**There is no deploy-ordering hazard.** `/game` is a **new route**: nothing
existing changed shape, no field was renamed or removed, and the published
client never calls it. The backend can go first, last, or alone. The one
frontend change to an existing payload's handling is that `MeetingShell` now
requires an `onSelectGame` prop — internal to the bundle, invisible over the
wire.

### Live state, checked 2026-09-09 by fetching, not assumed

* **Railway has `/series` and NOT `/game`.** `/api/pro-play/matchup/series`
  answers **403** (registered, admin-gated) while `/game` and an invented
  sibling under the same prefix both answer **404** — the same discriminator
  Steps 3 and 4 used.
* **Step 4's frontend IS now published.** `mogzy.lol`'s current chunk
  `ProPlayMatchup-Ca9MF8Kg.js` contains `Recent Meetings`,
  `dossier-meeting-shell`, `single_game`, `Duration not recorded` **and**
  `teams_outside_explorer_pool`. Step 4's own note above ("Pushed, NOT
  published") was true when it was written earlier the same day and is now
  superseded.
* Step 5 is not live: the same chunk contains none of `game-dossier`,
  `stats_available` or `Perfect`.

**Now unblocked from Step 3.1:** the condition for deleting the
`teams_outside_focus_set` mirror — "a frontend carrying
`teams_outside_explorer_pool` is *published*" — is **met**. That deletion is a
separate, safe commit whenever someone wants it. **Step 8 made it.**

**One thing the published bundle carries is the CSS defect.** The live Step 4
meeting shell has no desktop styling at all, because its whole CSS block was
inside an unclosed `@media (max-width: 640px)`. Step 5 fixes it, so publishing
Step 5's frontend also repairs Step 4's desktop appearance.

## Files — Step 5

### Backend

| File | Role |
|---|---|
| `pro_authority/game_detail.py` | **New.** The game payload, the participant read, the team rows, the bans, the missing-stat semantics, the diagnostic. |
| `routes/pro_play_matchup.py` | `GET /game`. |
| `test_pro_authority_game_detail.py` | **New.** 56 tests, 10 against the real corpus. |

### Frontend

| File | Role |
|---|---|
| `src/components/pro-play/dossier/GameDetail.tsx` | **New.** `GameDossier`, the box score, the objective sheet, the bans, `compactGold` / `kdaLine` / `kdaRatioLabel`. |
| `src/components/pro-play/dossier/MeetingDrilldown.tsx` | The game row became a toggle button and hosts the dossier; `MeetingShell` gained `onSelectGame`. |
| `src/lib/pro-play/matchupApi.ts` | Game types, `withMeetingGame`, `fetchGameDetail`. |
| `src/pages/pro-play/ProPlayMatchupTeam.tsx` | Wires `onSelectGame`. |
| `src/index.css` | `.dossier-game*`; **and the unclosed `@media` that had been swallowing the whole Step 4 block**. |
| `src/pages/pro-play/ProPlayMatchupTeam.test.tsx` | 193 tests (was 128). |

---

# Step 6 — the 15-minute lane checkpoint

Implemented. Inside a specific Game, every player row now says whether that
player was ahead or behind **the opponent he actually faced** in gold and CS
at 15 minutes — and the Game dossier did not become an analytics dashboard to
do it.

## What @15 answers that the box score does not

The box score answers *what did the player finish with*. The checkpoint
answers *how was the lane going at 15 minutes*, which for scouting is the more
useful of the two and is not recoverable from any end-of-game total.

**15 minutes only.** 10/20/25 are served raw by `/game` and still rendered
nowhere. Three more marks is a progression, which is a different surface and
a different question.

## The lane opponent — the one semantic that mattered

**The opponent is Oracle's Elixir's own pairing, re-derived so it can be
named, and then verified against OE's own numbers.**

OE publishes the lane opponent's **value** at each mark (`opp_gold_at15`) and
**never their identity**. The identity is Leaguepedia's, on the participant
rows. So the rule is:

1. take the opposing-side row in **this same game** carrying the same
   `oe_position`;
2. accept it **only if** its own `gold_at15` equals the `opp_gold_at15`
   already recorded against the subject (and likewise for CS);
3. if no row satisfies that, or more than one does, the state is
   `opponent_unresolved` and **no differential is published**.

Measured over 15,000 real pairs, step 1 and step 2 agree **15,000 times**.

**It is NOT paired on Leaguepedia's `role`, and that is not a style choice.**
The two authorities disagree on **1,290 rows** in the corpus. A live example
is in the tests: `Hitpoint Masters/2025 Season/Summer Split_Week 2_8` game 3,
where Leaguepedia labels **Ace** a *Support* and he played Smolder with 121
CS@15, while **Jellou** is labelled *Bot* and played Rell with 15. OE's
positions match what the two actually did. Pairing on the label would have
published Ace's lane against the other team's **support**.

**Nothing consults a roster, a declared starter, a depth chart, the five-lane
board, a player profile or a champion's usual role.** Both halves of every
figure are rows in the one game.

## The differential — one subtraction, so the two halves cannot disagree

```
gold_diff_15 = subject.gold_at15 - subject.opp_gold_at15
cs_diff_15   = subject.cs_at15   - subject.opp_cs_at15
```

Computed **from the subject's own row only**. The opposing player's row is the
exact inverse **by construction**, not by a second subtraction that could
drift: OE's pairing is a perfect matching, measured as
`SUM(gold_at15 - opp_gold_at15) == 0` on **50,187 of 50,187** fully enriched
games. A real-corpus test re-measures it.

## Four states, and none of them is zero

| status | when | what is rendered |
|---|---|---|
| `available` | both values present and the opponent verified | `@15 +899 gold · +26 CS` |
| `not_reached` | the game's duration is **< 900 s** | nothing per row; **one** sentence above the box scores |
| `unavailable` | the mark is absent on a game that *was* played past it, or the player has no OE row at all | `@15 —` |
| `opponent_unresolved` | the opponent's value is real and cannot be attributed to a participant | `@15 —` |

`gold_diff` and `cs_diff` are non-null **only** under `available`, so a client
cannot render a gap as a level lane. **A `0` in this payload is always a
measured tie.**

The two absences are genuinely different and the corpus proves it: every
player row in a sub-900 s game has a NULL `gold_at15` (so the NULL is a fact
about the *game*), while **~4% of rows in recent years** are NULL on a game
played well past 15 minutes (a gap in the *record*). Reporting both as one
would tell a reader a 30-minute game ended early.

`opponent_unresolved` fires on **~4%** of checkpoint rows and is stable across
years (6.4% in 2016 and 2020, 3.6–4.2% since 2023). Its cause is a game whose
canonical layer is missing the opposing participant — e.g.
`TransIP Road Of Legends/2025 Season/Spring Split_Week 2_4` game 3, where
Myth Esports' bot laner has no row at all and DDan's recorded opponent value
therefore belongs to nobody nameable.

## Support carries gold and not CS — measured, not assumed

The owner asked for evidence rather than a guess. Measured over 20,000 rows
per position, 2025+:

| position | median CS@15 | median \|CS diff\| | p90 \|CS diff\| | median \|gold diff\| |
|---|---|---|---|---|
| top | 129 | 13 | 33 | 578 |
| jng | 109 | 11 | 28 | 506 |
| mid | 140 | 11 | 27 | 534 |
| bot | 135 | 12 | 30 | 617 |
| **sup** | **21** | **5** | **11** | **280** |

A support's creep score is **six times smaller** than every other position's
and is a byproduct of which waves the bot laner left rather than a record of
the lane. **Gold @15 is published for every position; CS @15 is not published
for the support position.** The suppression keys on `oe_position == "sup"` —
the *same* authority that produced the pairing — and never on Leaguepedia's
`role`, which is exactly the field the corpus shows can be wrong.

The absence is named in `unavailable_metrics` as `cs_diff_15_support`, in the
server's own words, and the dossier already prints those sentences.

Gold @15 is meaningful for a support and is published: it carries kill and
assist participation, which is what a support's early game actually is.

## Backend — a projection addition, no new endpoint

`/game` already read every column this needs. **No new route, no new query,
no second statistics authority, no new ingestion.** Each player row gains one
`lane_checkpoint` object.

**Derived on the server rather than in the client**, which is a change of
posture from Step 5's "the presentation is the caller's" — deliberately. The
subtraction is arithmetic, but *who the opponent is* and *whether four
absences are the same thing* are authority questions. Two clients answering
them separately would be two answers.

`stats.checkpoints` at 10/15/20/25 is **untouched** and still served raw.

## Frontend placement

**Inside the identity cell of the existing box-score row**, as a third line
under the player's name and role:

```
Doran (Choi Hyeon-joon)
TOP
@15  +899 gold · +26 CS
```

* **No new columns.** Seven is already the most this table carries at 375px,
  and two more would have forced either a horizontal scrollbar or a rebuild
  of the mobile treatment. A test asserts each row still has exactly seven
  cells and that the figure is a child of the `th` the name occupies — the
  structural property the 375px layout rests on.
* **No new page, tab, panel, chart or checkpoint table.**
* **Desktop and mobile are the same composition**, because the cell it lives
  in is the one that already stacked name over role on both. Step 5's
  `data-label` mobile treatment is unchanged and applies to `td` only, so the
  line inside the `th` gains no phantom column heading.
* **Literal labels.** `@15`, `gold`, `CS`. No lane score, advantage, lead
  rating, lane power or dominance — a test scans the rendered dossier for all
  five words.
* **Signs.** `+899`, `-223`, and `0` — **never `+0`**. A sign is a claim about
  direction and a tie has no direction.
* The `title` names the actual opposing participant the figure came from.

## Real corpus examples verified (2026-09-09)

Every case the task asked for was located **by query** and then read through
the real endpoint:

* **Top / mid / bot / support in one game** — `LCK/2026 Season/Rounds 1-2_Week
  7_7` game 2. Kiin **+394 g / +13 CS** over Doran; Ruler −1145/−12 to Peyz;
  Keria +125 gold and no CS. All five lanes invert exactly.
* **A true zero** — `TransIP Road Of Legends/2025 Season/Spring Split_Week
  2_4` game 3: Polychiki and Baul both **3375 gold**, `0` both ways, in the
  same payload as an unresolved lane.
* **A substantial differential both ways** — `Hitpoint Winter/2025 Season/Main
  Event_Quarterfinals_4` game 2: BlackSwan **+3542 g / +48 CS**, KNEZA −3542.
* **A game that never reached 15** — `LCL/2019 Season/Spring Season_Week 3_7`
  game 1, 784 s. Enriched, decided, and `not_reached` on all ten.
* **A full-length game missing the mark** — `LSPL/2016 Season/Spring
  Season_Week 1_1` game 1, 2635 s, seven enriched rows, all `unavailable`.
* **An unusual participant situation** — the Ace/Jellou role swap above.
* **A game with no statistics at all** — `Demacia Cup 2023_Semifinals_1`.

## Tests

**Backend — 31 new (12 real-corpus). `test_pro_authority_game_detail.py`:
87 passed** (was 56). The fixture writes each state as a real game: a fully
resolved one, a 760 s one, one whose 15-minute columns are simply absent, one
whose opposing laner has no row, one whose opposing row *contradicts* the
recorded value, and one where the role labels are swapped against OE's
positions.

Pro Play backend regression: **1076 passed, 1 skipped, 0 failed** across every
`test_pro_authority_*` suite.

**Frontend — 15 new. Board suite 218 passed** (was 193); **428 Pro Play tests,
all passing.** Full suite **58 failed / 10,231 passed across 14 files** — and
the **identical set of 14 files and 58 tests fails on clean `origin/main`**,
re-measured in a throwaway worktree during this task. Compare failure SETS,
never totals. Typecheck **13 errors, none in pro-play**. Build green.

## Deferred, and deliberately

* **@10, @20, @25** — served raw, rendered nowhere. A progression is a
  different surface.
* **XP differential** — stored, not rendered.
* Any checkpoint graph, gold-over-time curve, lane dominance score, derived
  rating, prediction or win probability.
* **@15 aggregates anywhere else** — not on the player × champion dossier, the
  exact matchup, the Meeting list or the five-lane board. Whether the metric
  is useful enough to aggregate is a question this first version exists to
  answer.

## Deploy state — Step 6

| | SHA | Where |
|---|---|---|
| Backend | `3a1ff48b` | **pushed to `master`**, Railway auto-deploys |
| Frontend | `25267474` | **pushed to `main`**, NOT published |

**No deploy-ordering hazard, in either direction.** The backend change is
**purely additive** — one new object on an existing player row; no field
renamed, removed or reshaped. The published frontend never reads it, and the
new frontend degrades to rendering nothing if it ever meets an old backend
(`laneCheckpointLine` returns `null` for an absent object). Either side can
ship first.

### Live state, checked 2026-09-09 by fetching, not assumed

* **`/game` answers 403 on production** (`web-production-83e53.up.railway.app`)
  while an invented sibling under the same prefix answers 404 — the route is
  registered and admin-gated. That proves **Step 5's route** is live; it does
  **not** prove Step 6's field is, because the field lives inside an
  admin-gated payload and this session held no admin key. **Step 6's backend
  is pushed and Railway auto-deploys `master`; nobody has read the deployed
  payload.** Do not claim otherwise until someone with a key does.
  There is no deployed-SHA endpoint on this service — `/api/version` returns a
  static string (`hp-source-fix-local-001`) and is not evidence of anything.
* **Step 5's frontend IS now published**, which supersedes Step 5's own note.
  `mogzy.lol`'s current chunk `ProPlayMatchup-DCFQHxZ0.js` contains
  `game-dossier`, `stats_available` and `Recent Meetings`.
* **Step 6's frontend is NOT published.** The same chunk contains none of
  `lane_checkpoint`, `not_reached` or `opponent_unresolved`. Publishing is the
  owner's click in Lovable; a push is not a publish.

## Files — Step 6

### Backend

| File | Role |
|---|---|
| `pro_authority/game_detail.py` | `_lane_checkpoints`, `_lane_state`, the four statuses, the support rule, the constants. |
| `test_pro_authority_game_detail.py` | 31 new tests, 12 against the real corpus. |

### Frontend

| File | Role |
|---|---|
| `src/components/pro-play/dossier/GameDetail.tsx` | `signedNumber`, `laneCheckpointLine`, `LaneCheckpoint`, and the one game-level sentence. |
| `src/lib/pro-play/matchupApi.ts` | `GameLaneCheckpoint`, `GameLaneOpponent`, `GameLaneStatus`. |
| `src/index.css` | `.dossier-game-player__lane*`. |
| `src/pages/pro-play/ProPlayMatchupTeam.test.tsx` | 218 tests (was 193). |

## Next recommended slice

**Decide whether @15 earns an aggregate, using this version.** The honest next
question is not "add @10 and @20" — it is whether a reader who now sees the
figure on a game wants it on the *exact matchup* (this player, this champion,
against this opponent: median gold@15 across their meetings). That is one
aggregate over a population `/exact` already builds, and it is worth building
only if the per-game figure proves useful. `games > 0` and the four absence
states must survive the aggregation: a median over three games, two of which
never reached 15, is not a median over three games.

Do **not** add @10/@20/@25 first. More marks is more of the same claim; an
aggregate is a new one.

## Next task

1. ~~**Decide whether @15 earns an aggregate.**~~ **Answered by Step 7** (see
   below): it does, and the aggregate shipped. The next Matchup Explorer
   candidates are in Step 7's own "Next recommended slice".
2. ~~**Delete the `teams_outside_focus_set` mirror**~~ **Done in Step 8.** Once the frontend carrying
   `teams_outside_explorer_pool` is published.
3. **Re-run `scripts/audit_explorer_team_pool.py` each season.** The registry
   is a cache of a measurement; the real-corpus tests will fail if it drifts,
   and the script prints the edit.
4. **The pretty-URL architecture**
   (`/matchup/t1-vs-geng/top/doran-olaf-vs-kiin-ksante`). Still a rename.

Explicitly **out of scope** for this workstream and still is: Comparison Lab,
custom opponent cohorts, Champion Archives actions, Combat Lab / Quiz deep
links, monetization or access changes, prediction models, and anything in
Ranked / RR1 / LIVE1 infrastructure.

---

# Step 7 — what the exact sample typically looked like

Implemented. The exact player-and-champion study now answers the question a
scout asks of a win-loss record — *and what did those games look like* — with
three figures over the **same games** and no others.

```
Olaf vs K'Sante · Doran (Choi Hyeon-joon) vs Kiin
2 games · 2–0 · 100.0%
                     Exact sample
                     KDA 4.25   GOLD @15 +217 median   CS @15 +2.5 median
```

Step 6's own "next recommended slice" asked whether @15 earns an aggregate.
It does, and the answer that made it worth building is the coverage machinery
below rather than the medians themselves.

## The sample is the EXACT sample, and it is never widened for a figure

Every number is measured over the canonical games the Step 3 filter already
admitted — the subject player on the subject champion, the opposing player on
the opposing champion, opposing sides, one game, in scope. The game ids come
from that filter rather than from a second query, so no figure can cover a
game the record above does not count, and none can miss one.

Three tempting substitutes are all refused, and each has a test with a
deliberately enormous scoreline written into the near-miss row so a widened
sample shows up in the *figure* and not only in a count:

* the subject champion against the opposing **team** (that is Step 2);
* the two players regardless of champion;
* the champion matchup played by **other people** (that is Other Pro Examples).

## The lane opponent must be the player on screen — measured, not assumed

Step 6's resolver names whoever the subject **actually faced**. In an exact
matchup that is usually the opposing player. **Not always**, and this is the
semantic that shaped the slice:

| champion matchup | same lane | cross lane |
|---|---:|---:|
| Olaf vs K'Sante | 167 | **21** |
| Azir vs Orianna | 1,139 | 8 |

Olaf is played in two positions, so genuinely cross-lane exact pairs exist.
A `+286 gold` printed under the heading *Doran vs Kiin* whose second half came
from Oner would be a **false sentence**, so a game whose resolved lane opponent
is somebody else contributes to **no** checkpoint figure and is counted in its
own bucket, `lane_opponent_is_another_player`.

Verified live: **Delight's Rakan into Gumayusi's Aphelios is six real games and
ZERO checkpoint games** — a support and a bot laner who met six times and never
once in lane. Its KDA still covers all six, because a KDA never needed a lane
opponent.

## One resolver, two callers

`game_detail._lane_checkpoints` was split into
**`game_detail.resolve_lane_checkpoints(rows, duration_seconds)`** over a flat
row shape (`LANE_ROW_FIELDS`) plus a thin `/game` adapter. `exact_statistics`
adapts its own batched read onto the same function.

This is the load-bearing structural choice: **an aggregate cannot be built on a
different opponent rule from the per-game figure it aggregates.** A test scans
`exact_statistics` for the shapes of a reimplementation (`oe_position ==`,
`opp_gold_at15 -`, `by_position`) and fails if any appears. The refactor is
behaviour-neutral — Step 5 and 6's 87 tests pass unchanged.

## The three figures

### KDA — raw totals, never the mean of ratios

```
(SUM(kills) + SUM(assists)) / SUM(deaths)
```

Mogzy's existing zero-death convention (`oe_stats_reader.KDA_ZERO_DEATH_
CONVENTION`): `None` for `deaths == 0`, rendered **Perfect**. Substituting
`deaths = 1` reports a worse number than was earned; printing infinity is not a
number.

**The empty sample never reaches it.** 0/0/0 summed over nothing lands on the
same branch as a genuinely deathless game, so `games == 0` returns
`perfect: false` with **null** components — a zero would read as a player who
took no fights.

Proved on the real corpus: Broxah's Gragas into Jankos's Sejuani is
**4.364** by totals and **4.875** as the mean of the six per-game ratios. The
test asserts the *difference*, so a regression to averaging fails loudly rather
than drifting inside a tolerance.

### Gold @15 and CS @15 — the MEDIAN

```
median(per-game gold_at15 - opp_gold_at15, over available games)
```

**Median and not mean, and the reason is the sample size.** Exact samples are
routinely two or three games; one 4,000-gold stomp moves a mean past anything a
reader could act on, while the median answers "what did the lane usually look
like". On the same real six-game sample: median **-300**, mean **-386**.

### The median rule, defined once

`exact_statistics.median` — sorted; the middle value for an odd count, the
**arithmetic mean of the two middle values** for an even one. `None` over an
empty list, never `0`.

```
[100, 200, 300] -> 200      [100, 200] -> 150
[-50, 100] -> 25            [0] -> 0            [] -> None
```

**Nothing is rounded in the backend.** An even sample really does land on `.5`
and the payload carries it — a live example is Doran/Kiin's `+2.5` CS and
Broxah/Jankos's `8.5`. The client keeps one decimal only when there is one to
keep, because `+286.0` would imply a precision the sample does not have.

## Subject-perspective sign

`gold_diff = subject.gold_at15 - subject.opp_gold_at15`, computed from the
subject's own row only. The opposing player's row is the exact inverse **by
construction** (OE's pairing is a perfect matching), so reversing the study
inverts the sign for free rather than through a second subtraction that could
drift.

Verified in the live UI: `Doran Jayce vs Kiin K'Sante` reads
`+217 median` / `+2.5 median`; the reversed study reads `-217` / `-2.5` and
`KDA 2.00` — Kiin's own.

**The sign is never taken from blue/red side or from team ordering**, and a
test writes the same side on every fixture row so a side-derived sign would be
constant and fail.

## Coverage is per figure

An exact sample of three games can carry KDA on three and a checkpoint on two.
Printing "3 games" over both would be wrong about one.

```jsonc
"coverage": {
  "exact_games": 6,          // the record's own count
  "stat_games": 6,
  "missing_stat_games": 0,
  "at15_games": {            // sums to exact_games BY CONSTRUCTION
    "available": 3,
    "unavailable": 3
  }
}
```

`at15_games` is a census in **Step 6's own vocabulary** — `available`,
`not_reached`, `unavailable`, `opponent_unresolved` — plus this slice's own
`lane_opponent_is_another_player`. Four genuinely different absences, **none of
which is a zero**. A missing game never contributes `0` to a median, so a `0`
in this payload is always a measured tie.

Real example: Bin's Gnar into Breathe's Renekton — **6 exact games, KDA on 6,
15-minute figures on 3.**

## Support carries gold and not CS

The rule and its sentence are **Step 6's, quoted rather than restated** so the
two layers cannot drift into two reasons. It keys on the recorded
`oe_position` — the same authority the pairing rests on — and **never** on
Leaguepedia's `role`, which the corpus shows is wrong on 1,290 rows, nor on the
champion's usual lane, nor on the board row the drawer was opened from.

* Both support → **gold shown, CS omitted**, `supported: false` with the
  server's reason, and `cs_diff_15_support` declared in `unavailable_metrics`.
  Verified live: `Keria Alistar vs Duro Poppy` renders `KDA 1.89` and
  `GOLD @15 -148 median` with **no CS row at all**.
* A player recorded in **two** positions keeps only his farming games in the CS
  figure — the resolver already drops the support ones one by one, so `games`
  counts what it should.
* **Position unresolved** (no stat row, so no recorded position) → `supported:
  false` with its own reason. Nothing is guessed.
* **Empty sample** → says nothing at all. "These two never met" is already the
  answer above, and repeating it as a sentence about creep score would be a
  worse-worded second copy.

`unavailable_metrics` is **conditional**, unlike `/game`'s. A box score always
has a support row in it; this route names two players, and a sentence about
support creep score on a top-lane study is noise a reader has to discard.

## The retired `average_kda` declaration

`exact_matchup.UNAVAILABLE_METRICS` used to declare average KDA unservable.
That was **true of the corpus as it then was**; the Oracle's Elixir promotion
made it false, so it is **gone rather than softened** — the same move the Step 2
enrichment made in `player_dossier`. The tuple is kept, empty, so the next
unservable metric is declared there rather than left missing.

Its static guard was **inverted, not deleted**. It now holds the property that
actually mattered — `exact_matchup` is the exact-sample authority and computes
no statistic of its own; it delegates to `exact_statistics`, which is why there
is exactly one place a figure over this sample is derived.

## Frontend placement

**Inside the existing record band**, between the orientation sentence and
Source Meetings. No new drawer, tab, table, chart or stat-card grid.

Reading order, held as a **DOM-order test** rather than as a font size — the
part a restyle could not silently break:

1. who · 2. which champions · 3. sample size · 4. the record ·
5. **the figures** · 6. Source Meetings · 7. Other Pro Examples

A wrapping flex row of label-and-value pairs opened by one hairline rule — the
same device the dossier's statistics group uses, so the different denominator
is *visible* without a sentence explaining it. Values sit one notch above the
hint text they follow and a notch below the matchup identity above them.

* **A figure with no games behind it is left OUT, not dashed.** Three em dashes
  under a two-game record read as a broken panel; the coverage note carries the
  fact instead.
* **`0` is printed `0`, never `+0`.** A sign is a claim about direction and a
  tie has no direction. Same rule as the game dossier's per-row figure,
  restated rather than imported — that module is Step 5's box score and this is
  a different surface, so restyling one must not silently change the other.
* **"median" is on the figure**, not in a legend: a middle value must not be
  read as a total or an average.
* **Nothing renders when the exact sample is empty.** The zero state above is
  already the whole answer.

### Coverage UX

One note, in the drawer's quietest voice, and **silent when every figure covers
every game** — a note printed on every study stops being read.

> 15-minute figures based on 3 of 6 games.

A test asserts it never contains *oracle*, *elixir*, *leaguepedia*, *corpus*,
*enrich*, *pipeline*, *database*, *backend* or *api*. Another scans the whole
rendered study for *dominance*, *lane score*, *advantage rating*, *grade*,
*prediction*, *win probability* and *lane power*.

## Contract addition — `GET /api/pro-play/matchup/exact`

Same route, parameters, gate and error codes. One key added, one declaration
retired.

```jsonc
"statistics": {                    // a SIBLING of `exact`, never inside it
  "coverage": {
    "exact_games": 6, "stat_games": 6, "missing_stat_games": 0,
    "at15_games": { "available": 3, "unavailable": 3 }
  },
  "kda": { "kills": 18, "deaths": 6, "assists": 19,
           "ratio": 6.1667, "perfect": false, "games": 6 },
  "gold_diff_at15": { "median": 222, "games": 3 },
  "cs_diff_at15":   { "median": -10, "games": 3,
                      "supported": true, "unsupported_reason": null },
  "subject_positions": ["top"],
  "definitions": { … }
}
```

A **top-level sibling** of `exact`, not a key inside it: `exact.record` covers
every exact game, these cover fewer, and the 15-minute figures fewer again.
Nesting them would put three denominators under one heading.

`definitions` gains `exact_sample_statistics`, `kda_aggregate`, `median_at15`,
`at15_orientation` and `at15_opponent`. `unavailable_metrics` is now `[]` on a
farming matchup.

## Performance

Measured warm against the real 5.6 GB corpus. One batched read of the exact
games' participant rows, one for their durations, and `oe_stats_reader`'s own
chunked KDA read — never one query per game.

| Case | Request | of which statistics |
|---|---:|---:|
| zero exact games | 1090 ms | **0.01 ms (0.0%)** |
| one exact game | 647 ms | 0.38 ms (0.1%) |
| six-game sample | 786 ms | **1.73 ms (0.2%)** |
| six-game support | 1274 ms | 0.93 ms (0.1%) |
| six-game partial | 875 ms | 0.60 ms (0.1%) |

The request is dominated by Step 3's pre-existing champion-index pass. **No
caching was built** — profiling says none is warranted, and building it would
have been speculative.

## Real corpus examples verified (2026-09-09)

Every one located by query, then read through the real endpoint and, for the
first five, **rendered in a browser** against the full corpus (local FastAPI +
vite, throwaway admin key, never the production secret).

| Case | Result |
|---|---|
| **Doran Jayce vs Kiin K'Sante**, `recent_2025_2026` | 2 games 2–0. KDA 4.25, gold **+217**, CS **+2.5** — an even sample keeping its half. No coverage note. |
| **Reversed** (Kiin vs Doran) | 2 games 0–2. KDA 2.00, gold **-217**, CS **-2.5**. |
| **Keria Alistar vs Duro Poppy** (support) | 2 games. KDA 1.89, gold **-148**, **no CS row rendered at all.** |
| **Bin Gnar vs Breathe Renekton** (partial) | 6 games 5–1. KDA 6.17 over 6, gold +222 and CS -10 over **3**. Note: *15-minute figures based on 3 of 6 games.* |
| **Doran Teemo vs Kiin K'Sante** (zero) | Zero state renders; **no statistics block, no dashes.** |
| **Broxah Gragas vs Jankos Sejuani**, `all_time` | 6 games 4–2. K/D/A 7/11/41 → 4.364 (mean of ratios 4.875). Gold median **-300** (mean -386), CS **8.5**. Every figure matched an independent SQL walk of the same rows exactly. |
| **Delight Rakan vs Gumayusi Aphelios** | 6 exact games, **0** checkpoint games, all `lane_opponent_is_another_player`. KDA covers all 6. |
| **Faker Azir vs Broxah Gragas** | 0 exact games; full shape of nulls, `perfect: false`. |

**375 x 812**: `scrollWidth === clientWidth` (no page-level horizontal
overflow), the strip 324px inside a 375px sheet, all three pairs on one line.
1280px desktop: hierarchy intact, drawer height essentially unchanged. The only
console errors on the local page are the pre-existing 401 on
`/api/stat-check/invites` (no Supabase session in that harness) and a 400 on
`/api/pro-play/media/resolve` — both unrelated and both present before this
slice.

## Tests

**Backend — 49 new (13 real-corpus), `test_pro_authority_exact_statistics.py`.**
The fixture writes each near miss and each absence as a real row with its own
test: the right players on the wrong champion, two team-mates, a different
opposing player, a game with no stat row, a game whose mark is simply absent, a
760-second game, an opponent with no row of his own, a cross-lane pair, a
support matchup, a player recorded in two positions, and a role label that
contradicts the recorded position.

Pro Play backend regression: **397 passed, 1 skipped, 0 failed** across the
seven `test_pro_authority_*` suites, re-run after rebasing onto the moved
`master`.

**Frontend — 16 new. Board suite 234 passed** (was 218); **444 Pro Play tests
across 7 files, all passing.** Typecheck (`tsconfig.app.json`) **13 errors,
none in pro-play** — the documented baseline. Build green.

One Step 3 fixture assertion was **inverted, not deleted**: the payload's
`unavailable_metrics` no longer carries `average_kda`.

## Deferred, and deliberately

Everything Step 6 deferred stays deferred: **@10 / @20 / @25**, XP
differential, any curve, timeline, lane-dominance score, rating, prediction or
win probability. Also **not** added here: damage/min, CS/min, gold/min or
vision over the exact sample; a per-game statistics table; series aggregates;
and the same aggregates on the Meeting list or the five-lane board.

## Deploy state — Step 7 (2026-09-09)

| | SHA | Where |
|---|---|---|
| Backend | `db9245c9` | **pushed to `master`**, Railway auto-deploys |
| Frontend | `1aa346fd` | **pushed to `main`**, NOT published |

### Live state, checked 2026-09-09 by fetching, not assumed

* **`/exact` answers 403 on production** while an invented sibling under the
  same prefix answers 404 — the usual discriminator. **This proves nothing new
  about Step 7.** `/exact` has been a registered route since Step 3; Step 7
  added a FIELD INSIDE its admin-gated payload, and this session held no
  production admin key. The backend is pushed and Railway auto-deploys
  `master`; **nobody has read the deployed payload.** Do not claim otherwise
  until someone with a key does. There is still no deployed-SHA endpoint on
  this service — `/api/version` returns a static string and is evidence of
  nothing.
* **Step 6's frontend IS now published**, which supersedes Step 6's own note.
  `mogzy.lol`'s current chunk `ProPlayMatchup-DNVkzkZs.js` contains
  `lane_checkpoint`, `not_reached`, `game-dossier` and `Recent Meetings`.
* **Step 7's frontend is NOT published.** The same chunk contains **none** of
  `study-sample-stats`, `Exact sample`, `gold_diff_at15`, `cs_diff_at15` or
  `study-sample-coverage`. Publishing is the owner's click in Lovable; a push
  is not a publish.

**No deploy-ordering hazard, in either direction.** The backend change is
purely additive over the wire — one new key on an existing payload — and the
published client reads named keys rather than enumerating them, so it ignores
it. The new frontend degrades to rendering nothing against an old backend
(`ExactSampleStats` returns `null` for an absent `statistics`). The one
*removal* is the `average_kda` entry from `unavailable_metrics`; the published
client renders that array by mapping over whatever is in it, so an empty array
renders nothing rather than throwing. Either side can ship first.

## Next recommended slice

**Not more marks, and not more metrics.** The honest next question is whether
the *board* should carry any of this — the five-lane board still shows only
records, and a reader who now sees a lane state on one exact study will ask it
of the ten tiles above. That is a much bigger claim (a lane row is a player
across many opponents, not one exact pairing) and it needs its own sample rule
before it needs a component.

Two smaller candidates, either of which is a clean single slice:

1. ~~**The `teams_outside_focus_set` mirror deletion.**~~ **Done in Step 8.**
2. **Open a checkpoint figure into the game that produced it.** The Source
   Meetings beneath these figures already carry `match_id` and `game_number`,
   and Step 6 renders the per-game figure inside the game dossier. Making
   `+217 median` reachable down to the two games it is the middle of would
   close aggregate → evidence → source game for a *statistic*, which is the
   move this workstream makes everywhere else.


# Step 8 — an aggregate statistic, opened into the games that produced it

Implemented. Step 7's own "next recommended slice" #2, built as written, plus
Step 3.1's leftover mirror deletion (#1), which the evidence below finally
proves safe.

```
Olaf vs K'Sante · Doran (Choi Hyeon-joon) vs Kiin
2 games · 2–0 · 100.0%
                     Exact sample
                     KDA 4.25 ▾   GOLD @15 +217 median ▾   CS @15 +2.5 median ▾

                     Gold @15 · 2 games contributed
                     T1 vs Gen.G   2026-05-16 · Game 3          -476
                     T1 vs Gen.G   2025-07-25 · Game 2          +910
```

`median(-476, +910) = +217`, and each row opens the game it names.

## What this closes

Every other layer of the Explorer could already be opened into the thing
beneath it. The **statistics** were the one exception: `+217 median` named no
game, so it was the only claim on screen a reader had to take on trust. The
chain is now unbroken end to end —

> board → dossier → exact study → **figure → contributing games** → meeting →
> game → box score and the per-game @15 that produced the figure

— and the last two links agree by construction, because the per-game value in
the evidence row and the one Step 6 renders inside the game dossier come from
**the same resolver call**. Verified live: clicking `-476` opened Game 3 of
`LCK/2026 Season/Rounds 1-2_Week 7_7`, whose box score reads
`Doran (Choi Hyeon-joon) TOP @15 -476 gold · -18 CS` and `4 / 4 / 14`. Those
are exactly the three values the study served for that game.

## The backend owns contribution, and that is the whole design

The evidence list is emitted **by the pass that computes the figure, from the
same rows, at the same moment**. It is not reconstructed anywhere.

The alternative — a client intersecting `exact.meetings` with a coverage count
— was rejected outright, and not on taste: a game is in the exact record and
out of the 15-minute figure for **four genuinely different reasons**
(`not_reached`, `unavailable`, `opponent_unresolved`,
`lane_opponent_is_another_player`), the last of which is *measured on the
corpus per game*. A frontend could not derive it, and a frontend that guessed
would re-widen in the one place a reader goes to check.

Concretely, in `exact_statistics._checkpoint_sample`, every `continue` in the
loop is a game that does not contribute — and it leaves no evidence row behind
**because the append is inside the loop, after the guards**, not because a
second filter agrees with the first.

For KDA the same principle put the rule one level down:
**`oe_stats_reader.player_kda_rows_for_games`** reads the per-game rows with
the *identical* guard the totals use (`kills`, `deaths` and `assists` all
non-NULL — a row missing one is already skipped by `SUM`). So
`len(evidence) == totals["kda_games"]` is guaranteed by both coming from one
module, and a test asserts it directly.

## Contract addition — `GET /api/pro-play/matchup/exact`

Same route, parameters, gate and error codes. One key added to each of the
three figures; **one field removed** (below).

```jsonc
"statistics": {
  "kda": { "kills": 11, "deaths": 8, "assists": 23, "ratio": 4.25,
           "perfect": false, "games": 2,
           "evidence": [
             { "canonical_game_id": "355f42ec…", "match_id": "LCK/2026 Season/Rounds 1-2_Week 7_7",
               "game_number": 3, "game_date": "2026-05-16 10:10:00",
               "subject_team_key": "T1", "opposing_team_key": "Gen.G",
               "league_slug": "LoL Champions Korea", "tournament_id": "LCK 2026 Rounds 1-2",
               "result": "W", "win": true,
               "subject_kills": 4, "subject_deaths": 4, "subject_assists": 14,
               "ratio": 4.5, "perfect": false }, … ] },
  "gold_diff_at15": { "median": 217.0, "games": 2,
                      "evidence": [ { …the same identity…, "value": -476 }, … ] },
  "cs_diff_at15":   { "median": 2.5, "games": 2, "supported": true,
                      "unsupported_reason": null,
                      "evidence": [ { …, "value": -18 }, … ] }
}
```

**An evidence row is an `ExactMeeting` plus its value.** The identity half is
`exact_statistics.EVIDENCE_IDENTITY_FIELDS` — the exact projection
`exact._meetings[]` already uses — because the evidence behind a statistic and
the source meeting beneath it are the **same game**. A separate shape would
have been a second description of one thing, and would have needed its own
navigation. A test pins the row's key set in both directions, so neither a
missing field nor a smuggled box score passes.

**Not a second box score.** `/game` owns the full game payload. Duplicating it
here would put two answers about one game in one response and multiply the
size of a study for a list nobody has clicked.

**`meeting_limit` caps what the record DISPLAYS, never what a figure is
measured over — and now never what it can evidence.** `exact_matchup` passes
`_meeting_rows(exact, len(exact))`, the whole sample. A test with
`meeting_limit=2` over five games asserts two meetings and five evidence rows.

**Payload size is bounded by the exact sample itself**, which is 2–6 games in
every real case measured. No cap was added; a cap would mean a figure whose
evidence does not add up.

## Per-metric contribution rules

| Figure | A game is listed iff |
|---|---|
| **KDA** | it is an exact game **and** the subject has a stat row carrying all three of kills/deaths/assists. The row shows the recorded `subject_kills / subject_deaths / subject_assists`, plus that game's own `ratio` and `perfect`. |
| **Gold @15** | Step 6's resolver returned `available` for the subject **and** the lane opponent it resolved is the opposing player in the heading. |
| **CS @15** | the Gold rule, **and** the game's CS difference was not suppressed, **and** the matchup publishes CS at all (`supported`). |

Everything the aggregate excluded, the list excludes, for the same reason and
in the same pass: a missing checkpoint, a game that never reached 15:00, an
unresolvable opponent, a cross-lane pair, a game with no stat row, and every
near miss the exact filter already refused. **A support matchup serves an
empty `cs_diff_at15.evidence`** — there is no CS figure, so there is nothing
to evidence.

**The per-game KDA ratio is a convenience on the row, never a term in the
figure.** The aggregate is `(ΣK + ΣA) / ΣD` and stays so. A test computes the
mean of the evidence ratios and asserts the aggregate **differs** from it, so
a regression to averaging fails loudly rather than looking plausible.

## Evidence ordering — stated once, and it is not a new rule

**Newest first, tie-broken on the canonical game id** — i.e. exactly
`exact_matchup._newest_first`, the total order the Source Meetings list under
these figures already renders in. The evidence rows arrive in that order
because `exact_statistics` **preserves the caller's order** rather than
sorting again, so the two lists can never disagree about which game is first.
The corpus really does carry several games on one timestamp (a best-of is
played in one sitting), which is why the tie-break exists at all.

**Deliberately NOT ordered by magnitude.** This is the evidence behind a
claim, not a ranking of it, and a list that put the biggest lead first would
read as one. A fixture writes the largest value into the *middle* game and
asserts the order stays chronological.

## Coverage consistency

`len(figure["evidence"]) == figure["games"]` for all three figures, always —
they are one pass's two outputs. A test asserts it per figure on a
deliberately mixed five-game sample (KDA on 4, checkpoints on 3), and again on
the real corpus.

The panel says `2 games contributed` when the figure covers the whole record
and `1 of 3 exact games contributed` when it does not. **The games that did
not contribute are not listed**, and the panel does not explain why — the
reason is a fact about a specific game and already lives at game level, where
it can be read against the game itself.

## Frontend — one inline disclosure, inside the strip that already exists

No modal, no tabs, no drawer, no second panel. The figure itself becomes the
control: it gains a caret and a hover underline and **nothing else**, because
a statistic that suddenly looked like a button would compete with the matchup
identity the whole strip is styled not to dominate.

* **One metric open at a time.** Opening one closes the others; clicking the
  open one closes it. Three lists inside a drawer that already scrolls would
  push Source Meetings and Other Pro Examples off the bottom.
* **Local state, deliberately not in the URL.** The URL carries what a link
  must re-establish — the board, the scope, the four study keys, and (since
  Step 4) the meeting and game. Which disclosure a reader last poked is not
  part of the study, only of this glance at it. Adding it would have made two
  links to the same study unequal.
* **A figure with no contributing games gets NO affordance.** Not a control
  that opens an empty panel; the figure prints as plain text. Same rule the
  strip already follows for a figure with no games at all — that one is left
  out rather than dashed.
* **Support: no CS row, therefore no CS control.** Step 7's omission is
  preserved exactly; nothing was added to explain the absence.
* **Empty exact sample: nothing renders at all.** Step 3's zero state is
  already the whole answer.
* **No tutorial about medians.** The label still says `median` on the figure,
  and the list makes the contributing values visible, which is a better
  explanation than a paragraph.

Reading order (still held as a DOM-order test): who · which champions · sample
size · the record · the figures · **the open evidence** · Source Meetings ·
Other Pro Examples.

### Evidence rows vs Source Meetings — a real difference, and it is tested

Source Meetings **dedupe by `match_id`**: two games of one best-of are one
meeting to open, and listing it twice would read as the pair having met twice.
Evidence rows are **per game**, because a game is what contributed a value.
The Doran/Kiin study renders **one** source meeting and **two** evidence rows,
and a test asserts both counts in the same assertion so the distinction cannot
be flattened by accident.

### Navigation — the existing one, unchanged

An evidence row calls the same `onOpenMeeting({ match_id, game_number })` a
source meeting calls. One history entry; the URL gains `meeting=…&game=3`;
Back returns to the study with the drawer still open. **No new route, no
second mechanism.** A row whose `match_id` is null is still listed (it is
still the evidence) but is rendered as a span rather than dressed as a link
that would go nowhere.

Verified live in the browser: click → `?…&meeting=LCK/2026 Season/Rounds
1-2_Week 7_7&game=3` → the Step 5 game dossier for **Game 3** → `history.back()`
→ study restored, meeting shell gone, evidence panel still open.

### Mobile

375 × 812, real corpus, evidence open: `scrollWidth === clientWidth` (**no
page-level horizontal overflow**), rows **323.6px inside a 375px sheet**,
`overflow-x: visible` on every row — no horizontal table, no tiny stat
columns, no nested scroller. The rows wrap: teams first, then date and game
number, with the value taking the tail where there is room and joining the
flow where there is not. 1280 × 900: rows are 500px and a single line, and the
drawer's height is unchanged.

*(The Browser pane was hidden during measurement, so the Radix sheet's entry
transform never ran and the drawer sits at `left: 375`. Widths and
`scrollWidth` are unaffected and were read directly; the screenshot was taken
with the transform cleared by hand.)*

## The `teams_outside_focus_set` mirror — DELETED

Step 3.1 left it as a **dated, deletable mirror** of
`teams_outside_explorer_pool`, kept for one reason only: the frontend
published on 2026-09-08 called `.join` on the old name while merely
*rendering* a non-navigable example, and Railway deploys `master` before the
owner presses Publish in Lovable.

**That window is measured shut.** The chunk served from mogzy.lol on
2026-09-09, `ProPlayMatchup-CuSBrXtS.js`, was fetched and grepped:

| name | occurrences in the live chunk |
|---|---:|
| `teams_outside_explorer_pool` | **1** |
| `teams_outside_focus_set` | **0** |

So the field is gone from `exact_matchup._navigation`, and its test is
**inverted rather than deleted** — `"teams_outside_focus_set" not in nav` —
because a field that quietly comes back is a regression that should have a
name. No other reference existed in either repo.

**That same fetch supersedes Step 7's own deploy note:** the live chunk also
contains `Exact sample`, `study-sample-stats`, `gold_diff_at15`,
`cs_diff_at15` and `study-sample-coverage`. **Step 7's frontend IS published.**
Its note, written earlier the same day, said it was not.

## Performance

The slice adds **one** indexed read — the per-game K/D/A rows — and one
projection. Measured warm against the real 5.6 GB corpus:

| | |
|---|---:|
| `player_kda_rows_for_games`, 6 ids | **0.014 ms** |
| whole `exact_statistics` block, 6-game sample | 0.27–0.34 ms |
| the `/exact` request it sits inside | 0.6–1.3 s |

The request is still dominated by Step 3's champion-index pass, exactly as
Step 7 measured. No caching was built, for the same reason as before.

## Real corpus examples verified (2026-09-09)

Read through the real endpoint (local FastAPI + vite against the full corpus,
throwaway admin key, never the production secret) and, for the first two,
**rendered and clicked in a browser**.

| Case | Result |
|---|---|
| **Doran Jayce vs Kiin K'Sante**, `recent_2025_2026` | KDA `4.25` opens to `4 / 4 / 14` and `7 / 4 / 9` (sums 11/8/23 ✓). Gold `+217 median` opens to `-476` and `+910` (median ✓). CS `+2.5 median` opens to `-18` and `+23` ✓. Two evidence rows, **one** source meeting. |
| **…clicked through** | `-476` → meeting `LCK/2026 Season/Rounds 1-2_Week 7_7`, **Game 3**, box score reads `Doran TOP @15 -476 gold · -18 CS`, `4 / 4 / 14`. Back returns. |
| **Keria Alistar vs Duro Poppy** (support) | `KDA 1.89 ▾` and `GOLD @15 -148 median ▾`. **No CS row and no CS control.** Gold opens to `-140` and `-156` (median ✓). |
| **Broxah Gragas vs Jankos Sejuani**, `all_time` | 6 games; evidence 6/6/6; the gold rows sorted equal an independent SQL walk exactly, and sum to the aggregate's own K/D/A. |
| **Bin Gnar vs Breathe Renekton** (partial) | KDA evidence 6 rows, checkpoint evidence **3** — and the checkpoint set is a strict subset of the KDA set. |
| **Delight Rakan vs Gumayusi Aphelios** (cross-lane) | 6 exact games. Checkpoint evidence **empty on both figures**; KDA evidence 6. |
| **Faker Azir vs Broxah Gragas** (zero) | Every evidence list empty; no affordance renders. |

## Tests

**Backend — 34 new (9 real-corpus)**, all in
`test_pro_authority_exact_statistics.py`, plus one inverted in
`test_pro_authority_explorer_teams.py`. Suite: **83 passed**.

The load-bearing ones are the exclusions — each absence the aggregate honours
is written as a real row and asserted absent from the list: the missing mark,
the 760-second game, the opponent with no row, the cross-lane pair, the game
with no stat row, and the three near misses (each carrying a `99/0/99` line
and a 19,000-gold lead, so a widened sample is as loud in the *list* as in the
figure). Then: `len(evidence) == games` per figure; the order is chronological
and not by magnitude; the tie-break is the canonical game id; the row's key
set is pinned both ways; the aggregate differs from the mean of its own rows;
`meeting_limit` does not cap it; and `len(kda rows) == totals["kda_games"]`
straight out of `oe_stats_reader`.

Two fixture changes were needed and are themselves the point: `_game` now
writes `match_id`/`game_number` instead of NULL (a fixture that left them null
would let a payload serving null identity pass), and `_pair` can place two
games in one meeting.

Pro Play backend regression: **1611 passed, 1 skipped, 0 failed** across
`test_pro_authority_*` and `test_pro_play*`, with the real corpus attached.
*(Without the corpus, 9 route tests fail on `unable to open database file` —
that is the harness, not the code. Symlink `lol_calc.db` into the worktree;
the routes open it `mode=ro`.)*

**Frontend — 18 new.** Board suite **252 passed** (was 234); **462 Pro Play
tests across 7 files, all passing.** Typecheck (`tsconfig.app.json`) **13
errors, none in pro-play** — identical to Step 7's documented baseline. Build
green.

The default `exactStatistics()` fixture now carries evidence whose rows really
do produce the figures above them (5+3 / 1+3 / 4+5 → 8/4/9 → 4.25; the gold
rows median to 286; the CS rows to 7), so every existing Step 7 assertion is
re-checked against a consistent payload rather than an invented one.

One test covers the **deploy window explicitly**: against a payload with no
`evidence` key at all, the figures still render and no affordance appears.

## Deferred, and deliberately

Everything Steps 6 and 7 deferred stays deferred. Also **not** added here: any
new statistic; a per-game statistics table; sorting or filtering the evidence;
the omission reason inside the panel; evidence on the dossier's own figures or
on the board; and evidence for `other_pro_examples` (those are records, not
measured figures).

## Deploy state — Step 8 (2026-09-09)

| | SHA | Where |
|---|---|---|
| Backend | `1a8b75e4` | **pushed to `master`**, Railway auto-deploys |
| Frontend | `0da421de` | **pushed to `main`**, NOT published |

`master` moved **twice** while this task was in flight (maa1 objective media,
then a knowledge-admin fix). It was re-fetched and rebased before each push
attempt, and the first push was rejected non-fast-forward — re-fetch before
every push in this repo.

### Live state, checked 2026-09-09 by fetching, not assumed

* **`/exact` answers 403 on production** while an invented sibling under the
  same prefix answers 404 — the usual discriminator, stable across three
  probes. As in Step 7, **this proves nothing new about Step 8**: the route
  has existed since Step 3, and Step 8 added fields INSIDE its admin-gated
  payload. This session held no production admin key, so **nobody has read
  the deployed payload**. Railway auto-deploys `master`; there is still no
  deployed-SHA endpoint on this service (`/api/version` returns a static
  string and is evidence of nothing).
* **Step 8's frontend is NOT published.** The chunk currently served from
  mogzy.lol, `ProPlayMatchup-CW9HOnso.js`, contains **none** of
  `study-evidence`, `study-sample-toggle`, `evidencegroup`, `subject_kills`
  or `contributed`. Publishing is the owner's click in Lovable; a push is not
  a publish.
* **What IS live:** the same chunk contains `gold_diff_at15` — so **Step 7 is
  published** (its own note, written earlier the same day, said it was not)
  — and does **not** contain `teams_outside_focus_set`, which is the
  measurement that made this slice's deletion safe.

**No deploy-ordering hazard in either direction, and this was checked rather
than assumed.**

* Backend → old frontend: the three `evidence` keys are **additive** on an
  existing payload, and the published client reads named keys. It ignores
  them.
* New frontend → old backend: `evidence` is typed **optional** and read as
  `?? []`, which renders the figures with no affordance. There is a test.
* The one **removal**, `teams_outside_focus_set`, is safe because the
  published chunk does not contain the name — fetched and grepped above.

## Files — Step 8

### Backend — `/Users/macmoney/League_Combat_Simulator`

| File | Change |
|---|---|
| `pro_authority/exact_statistics.py` | `EVIDENCE_IDENTITY_FIELDS`, `_identity`, `_evidence`; the checkpoint loop collects evidence beside each value; `canonical_game_ids` → `exact_games` (meeting rows, newest first); `exact_sample_evidence` definition. |
| `pro_authority/oe_stats_reader.py` | `player_kda_rows_for_games` — the per-game rows behind the totals, same guard. |
| `pro_authority/exact_matchup.py` | passes the whole exact sample as meeting rows; **deletes** `teams_outside_focus_set`. |
| `test_pro_authority_exact_statistics.py` | 34 new tests; fixture writes source-meeting identity. |
| `test_pro_authority_explorer_teams.py` | the mirror test, inverted. |

### Frontend — `/Users/macmoney/mogsy`

| File | Change |
|---|---|
| `src/lib/pro-play/matchupApi.ts` | `ExactKdaEvidence`, `ExactAt15Evidence`, optional `evidence` on all three figures. |
| `src/components/pro-play/dossier/MatchupStudy.tsx` | `EvidenceRow`, `evidenceCountText`; `ExactSampleStats` gains the disclosure and `onOpenMeeting`. |
| `src/index.css` | `.dossier-study__samplevalue--open`, `__samplecaret`, `__evidencegroup`, `__evidence*`. |
| `src/pages/pro-play/ProPlayMatchupTeam.test.tsx` | `exactEvidenceGame`; evidence in the default fixture; 18 new tests. |

## Next recommended slice

Step 7's #1 is now done and its #2 is this. The honest remaining question is
still **the one Step 7 named and did not answer**: whether the five-lane board
should carry any lane state at all. A reader who can now open `+217 median`
down to two real games will ask the same of the ten tiles above — and a lane
row is *one player across many opponents*, not one exact pairing, so it needs
its own sample rule before it needs a component. That is the next real slice,
and it is a bigger claim than anything Steps 6–8 made.

Two smaller candidates, if a single clean slice is wanted first:

1. **The omission reason, at the point of omission.** The coverage note says
   `15-minute figures based on 3 of 6 games` and the evidence lists the 3. The
   remaining 3 have four different reasons and the payload already counts them
   by name in `coverage.at15_games`. Naming them *without* turning the panel
   into an explanation is the design problem, and it is a real one.
2. **Evidence on the dossier's own statistics** (Step 2's KDA / CS-min /
   gold-min / damage-min). Same move, a much larger sample — 30-odd games
   rather than 2 — so it needs a display bound and a "show all", which is why
   it was not folded in here.

# Step 9 — the meeting's lineups

Implemented. A historical Meeting now says **who actually played it, what each
of them picked game by game, and where the participants changed** — before the
reader chooses which game to open.

```
SERIES · 3 GAMES
SK Telecom T1 2–1 NaJin e-mFire    Champions 2015 Spring · Jan 7, 2015 · Patch 4.21

PLAYERS USED · PICKS BY GAME
  SK Telecom T1   6 players used
    TOP        MaRin      G1 Dr Mundo · G2 Maokai · G3 Maokai      Maokai ×2
    JUNGLE     Bengi      G1 Lee Sin · G2 Lee Sin · G3 Lee Sin     Lee Sin ×3
    MID        Faker      G1 Xerath · G3 LeBlanc
    2 players  Easyhoon   G2 Xerath
    …
  NaJin e-mFire
    JUNGLE     Watch      G1 Jarvan IV · G2 Jarvan IV · G3 Kha'Zix  Jarvan IV ×2
    …
    Player records are incomplete for Game 1, Game 2, Game 3.
```

## What it closes

Step 8 made every *number* openable. The **Meeting** was the layer that stayed
structural: teams, event, score, durations and a list of games. It answered
*when* and *what the result was*, and nothing about *who*. A reader arriving
from an aggregate claim had to open games one at a time to find out whether
the same five players even played them.

## The actual-participant rule

**Every name comes from `pro_canonical_player_games` rows belonging to the
games this `match_id` contains.** The same rows the game list beneath it
renders and the same rows `/game`'s box score is driven by — it is a
**projection of `games`**, computed in the same call, so the lineup and the
game list can never name different players.

Nothing consults a roster, a declared starter, a depth chart, a player profile
or the five-lane board above. Those answer *who is on this team*; this answers
*who took the field*, and in a Bo5 with a substitution they are two different
lists. A player who appears in one game appears in one game.

`meetings.py` still writes no statistic: nothing here is averaged, totalled,
ranked or rated.

## Position authority — Leaguepedia's `role`, and NOT Step 6's `oe_position`

This is the one decision worth being explicit about, because Step 6 chose the
other field for a good reason and the reason does not transfer.

| | `role` (Leaguepedia) | `oe_position` (Oracle's Elixir) |
|---|---:|---:|
| coverage of canonical participant rows | **1,075,502 / 1,075,502** | 875,430 (81.4%) |
| distinct values | exactly 5 | exactly 5 |
| disagreements, where both exist | — | **1,290 rows** |

**Step 6 pairs; Step 9 does not.** Step 6 resolves a player's *lane opponent*
and must use `oe_position`, because those 1,290 rows are real games where the
labelled support played the carry and pairing on the label hands a player the
wrong opponent. This projection pairs nothing at all. It needs **one position
for every participant**, and `oe_position` is simply absent for every game
outside OE's coverage — nearly a fifth of the corpus, and disproportionately
the older meetings the Explorer supports.

**A fallback from one to the other was rejected**, not deferred: a mixed
authority could file the same player under two different positions in two
games of one meeting and manufacture a lineup change that never happened.
`role` is total and single-sourced, so the position column is one authority
end to end. A real-corpus test re-measures both columns, so the choice fails
loudly if the coverage ever inverts.

## Champion sequence semantics

* `games[]` is ordered by **`game_number`**, never alphabetically and never by
  frequency. `G1 Olaf · G2 K'Sante · G3 Olaf` is a story about adaptation; the
  set `{Olaf, K'Sante}` is not.
* **A repeat is preserved as two entries**, because going *back* to a champion
  is the fact.
* **Only games the player has a row in are listed.** A substitute in games 3–5
  carries three entries, not five with two blanks.
* The champion on the participant row **is** the pick. No second champion
  normalization layer was added; `champion_key` is the same field Step 4's
  per-game list and Step 5's box score already render.
* **The game number labels the GAME, never a draft position.** `sequence` is
  `-1` on all 2,235,030 pick/ban rows, so `G1` is deliberately not `1.`, and
  a frontend test fails on the words *first pick*, *counterpick*, *blind*,
  *draft*, *rotation*, *ban phase* and *priority* appearing in the section.

## Substitution representation — two players, and no word about why

A position occupied by two players across the meeting renders **both**, each
with the games he actually played. The position is marked `2 players`, the
team is marked `6 players used`, and `positions_changed` names it in the
payload.

**No `starter` field exists**, and usage count orders nothing: players are
sorted by **earliest appearance**, tie-broken on identity. Ordering by "played
most" would be starter semantics the corpus does not record. A frontend test
asserts the section contains none of *substitution*, *benched*, *starter*,
*starting*, *dropped*, *replaced*, *rested* or *tactical*. This task knows
that participation changed; it does not know why.

**Two players at one position always means different games**, and that is
measured rather than assumed: all 48 team-games in the corpus carrying two
rows for one role belong to the seven `blue_team_key = red_team_key`
match_ids, which `meeting()` has always refused as `MalformedMeeting`. Inside
any meeting a reader can actually open, the number is **0**. A real-corpus
test holds it.

**One player can hold two positions**, and does: SAKEN played *three* across
`Coupe de France 2022_Round 2_3`. He is listed under each, with the games he
played there. Filing him once would mean choosing which of them to print.

## Contract addition — `GET /api/pro-play/matchup/series`

**No new endpoint.** The meeting a reader already opened is where "who played"
belongs, and a sibling request could return an answer that disagrees with the
game list beside it. `team_meetings` — the board's compact eight-row section —
gained **nothing**: it is a dossier line, not a lineup.

Two keys added to the meeting payload, both additive:

```jsonc
"position_order": ["Top", "Jungle", "Mid", "Bot", "Support"],
"lineups": [
  { "team_key": "GAM Esports", "display_name": "GAM Esports",
    "players_used": 6,
    "positions_changed": ["Mid"],
    "positions": [
      { "position": "Mid",
        "players": [
          { "player_lp_page": "Gloryy",
            "games": [ {"game_number": 1, "champion_key": "Ryze"},
                       {"game_number": 2, "champion_key": "Orianna"} ],
            "repeat_picks": [] },
          { "player_lp_page": "Aress",
            "games": [ {"game_number": 3, "champion_key": "Ahri"}, … ],
            "repeat_picks": [] } ] } ],
    "game_coverage": [ {"game_number": 1, "participant_count": 5, "complete": true}, … ] } ]
```

* **Teams are in the meeting's own `teams` order** (the server's), and the
  client re-lays them in **`score_line` order** — the order the reader has just
  read in the header, so the lineups are not a second, silently different one.
* **Positions follow standard League order** — Top, Jungle, Mid, Bot, Support.
  Anything the corpus ever grows sorts after them alphabetically rather than
  being dropped or coerced into one of the five.
* **A player entry carries exactly three keys.** A test pins the set, so a
  smuggled statistic or a `starter` flag fails.
* **No Game payload is duplicated.** `/game` owns the box score; this carries
  a player, a position, a game number and a champion.

### `repeat_picks` — the frequency summary, and why it is this small

Emitted **only for champions taken more than once**, ordered by count then
name, with **no percentage**. `Olaf ×2` beside a three-game sequence is worth
saying; `Olaf ×1` beside a sequence that already shows it once is clutter, and
a percentage over three games would dress three data points as a pick rate.
A one-game meeting therefore has an empty `repeat_picks` on every player, and
the UI renders nothing.

**The sequence is primary and the frequency is secondary**, which is why the
frequency is a trailing annotation on the same line and never a table.

### Missing data

* **`champion_key` is `null` when the row does not record one** — never
  filled from a neighbouring game, and **the game stays in the sequence**,
  because dropping it would shorten a real one. The client prints
  *Champion not recorded*. This is a **shape** guarantee: `champion_key` is
  `NOT NULL` in the schema and non-empty on all 1,075,502 real rows, and a
  real-corpus test asserts that so the honest branch is covered by a fixture
  rather than by the corpus staying clean.
* **A team-game short of five player rows is reported, never repaired.**
  46,396 of 113,815 canonical games carry fewer than ten rows. `game_coverage`
  carries the count per game and the client says *Player records are
  incomplete for Game 1, Game 2, Game 3.* — a product sentence, not a row
  count, and no name is filled in from anywhere. NaJin e-mFire's 2015 rows
  carry four players in every game, so their lineup shows four and has **no
  Top row at all**.
* **A meeting whose games carry no player rows renders nothing** — not an
  empty scaffold and not a fabricated five.

## Single-game meetings

The heading is **`Lineups`**, not `Players used · picks by game`. **No game
numbers** (`G1` in front of the only pick is noise), **no `×1` frequency**, no
`N players used` marker, and no series language anywhere. It is simply the ten
players who played, one champion each. A frontend test asserts the absence of
`G1`, of any `lineup-repeats` node and of `/series/i`.

## The ban summary — deliberately NOT in this slice

Meeting-level bans were offered as optional and are **omitted**. Two reasons,
and the first is the real one:

1. **A count is the only honest ban fact available, and a count reads as
   priority.** `sequence` is `-1` on every pick/ban row, so there is no order,
   no phase and no target. `Champion A ×2` under a lineup would be read as
   *they prioritised banning A*, which is precisely the claim the data cannot
   support. The existing `unavailable_metrics` sentence — bans are "an
   unordered set of five per side" — already says the honest thing, and the
   game dossier renders them per game where they can be read against the game.
2. **Density.** The Bo5 lineup is already ten to twelve rows a team. Ten more
   ban chips would push the game list — the destination this section exists to
   make attractive — further down the sheet.

Step 4's `unavailable_metrics` entry for `bans` is unchanged and still
rendered at the foot of the shell.

## Result context — untouched

Score semantics, `undecided`, `winner_team_key`, `kind`, `single_game_number`,
duration, event/date/patch, `in_scope`, game ordering and the click into a
Game dossier are all exactly as Step 4 and Step 5 left them. Four backend
tests and three frontend tests exist only to hold that: every Step 4 key is
still served, the game list is still `game_number`-ordered, the listing row
shape gained nothing, and a Game still opens to its box score from inside the
enriched shell.

## Frontend placement and design

Reading order inside the shell, held as a DOM-order test:

> meeting identity → **result / event / date / patch / scope** → **lineups** →
> per-game list → the Game dossier

The lineups sit **above** the game list and replace none of it: each game row
keeps its result, duration and its own champion icons, and keeps being the way
into the box score. The point is to make a reader *want* to open a game, not
to save them from it.

**Visual language.** One parchment plate per team on the same material as the
game rows beneath it, so the section reads as part of the meeting rather than
a panel bolted on. The position is a fixed 3.6rem small-caps column in soft
ink — the index a reader scans down — and the player name is the emphasis. A
champion chip is a 1.05rem square icon plus the champion's name; icons alone
would have made a Bo5 row a wall of art with no way to tell Maokai from
Maokai, and names alone would have lost the scanning speed the rest of the
dossier has.

**Mobile (375 × 812, real corpus, Bo5 with a substitution).** The position
label moves **above** the players at ≤480px — keeping it as a column costs the
sequence ~2.5rem, which is the difference between two chips a line and one.
Measured: `document.scrollWidth === clientWidth` (**no page-level horizontal
overflow**), the section is **343px inside a 375px sheet**, and **zero**
position rows overflow their own box. No horizontal table, no nested scroller,
and the Game rows below stay full-width and tappable.

**Interaction: none added.** Champion names and player names are not links —
there is no safe destination for "this player in this meeting" that the
Explorer already serves, and a dead link would be worse than plain text. No
hover-only information, so nothing is invisible on a phone.

## Real corpus examples verified (2026-09-09)

Read through the real endpoint and **rendered in a browser** (local FastAPI on
the full 5.6 GB corpus + vite, throwaway admin key, never the production
secret).

| Case | What it proved |
|---|---|
| **Bo3** `LCK/2026 Season/Rounds 1-2_Week 7_7` (T1 2–1 Gen.G) | Ten players, five a side, three picks each, no repeats, no changes. Doran `Yorick · Ornn · Jayce`. |
| **Bo1** `2025 Season World Championship/Main Event_Round 3_4` | Heading `LINEUPS`, no `G` numbers, no frequency, no series word. |
| **Bo5 + substitution** `LCP/2026 Season/Split 2 Playoffs_Round 3_2` | GAM Esports `6 players used`, Mid `2 players`: **Gloryy G1–2, Aress G3–5**. Deep Cross Gaming five players, five picks each. |
| **Every position changed** `Coupe de France 2022_Round 2_3` | Karmine Corp used six players across **all five** positions, and **SAKEN appears under Mid, Bot AND Support**. Rendered without a special case. |
| **Repeated picks** the same meeting | Nafkelah `Ziggs · Cassiopeia · Ahri · Ahri · Ahri` → `Ahri ×3`; White `Trundle ×2`; Obstinatus `Nautilus ×2`. |
| **Older historical** `Champions/2015 Season/Spring Season_Week 1_1` | **Faker G1/G3, Easyhoon G2** at Mid — a real 2015 rotation; Bengi `Lee Sin ×3`. |
| **Incomplete participants** the same meeting | NaJin e-mFire has **four** rows in every game: four players shown, **no Top row**, and *"Player records are incomplete for Game 1, Game 2, Game 3."* Nothing backfilled. |
| **Modern 2026** the Bo3 and the Bo5 above | Both current-season. |
| **Unusual role record** `Upsurge Premier League/2020 Season/Fall Playoffs_Lower Round 2_2` | The 48 duplicate-role team-games all sit in the 7 `Maryville University vs Maryville University`-style match_ids, which `meeting()` **already refuses** as malformed. Unreachable through this layer. |
| **No player rows at all** | Renders nothing, in a test — the corpus's `meeting` shape allows it. |

## Performance

**No new query and no new endpoint.** The projection runs over rows
`meeting()` had already read.

| | |
|---|---:|
| `_lineups`, 1-game meeting | **0.020 ms** |
| `_lineups`, 3-game meeting | **0.032 ms** |
| `_lineups`, 5-game meeting | **0.048 ms** |
| whole `meeting()` warm, 1/3/5 games | 0.54 / 0.67 / 0.76 ms |

(The first `meeting()` of a process is ~0.9 s, unchanged: it builds
`comparison.game_index`.)

## Tests

**Backend — 45 new (10 real-corpus)** in `test_pro_authority_meetings.py`:
**109 passed** (was 64). Pro Play backend regression with the real corpus
attached: **1656 passed, 1 skipped, 0 failed** (Step 8's baseline was 1611).

Two fixture meetings were added rather than existing ones changed, so no Step
4 or 5 assertion moved: `ENRICHED`, a Bo3 carrying a repeated pick, a
substitution, a team-game short one player and a participant whose champion is
not recorded; and `MULTIROLE`, one player at two positions.

The load-bearing ones: the lineup and the game list name the *same* players;
a rostered non-participant is absent; positions are in role order; the
champion sequence follows `game_number`; a repeat survives; a repeat of one is
not summarised; a null champion is neither invented nor counted nor dropped;
two players at one position are earliest-appearance first; no key on a player
entry is a starter or a statistic; `game_coverage` reports the short game and
nothing backfills it; the one-game meeting is bare; the output is
deterministic; and every Step 4 key is still served in place.

**Frontend — 20 new.** `ProPlayMatchupTeam.test.tsx` **272 passed** (was 252);
**482 Pro Play tests across 7 files, all passing** (was 462). Typecheck
(`tsconfig.app.json`) **13 errors, none in pro-play** — identical to the
Step 7/8 baseline. Build green.

One test covers the **deploy window explicitly**: against a meeting payload
with no `lineups` key at all, the shell renders the meeting it always did and
no section appears.

## Deferred, and deliberately

Everything Steps 4–8 deferred stays deferred. Also **not** added here: the
meeting-level ban summary (above); any aggregate player performance — KDA
leader, kills/damage/CS/gold/vision leaders, @15 or XP aggregates, MVP,
ratings, lane dominance, charts, radars, win probability; per-game statistics
in the lineup; sorting or filtering it; side (blue/red) in the lineup row; and
any link out of a champion or player name.

## Deploy state — Step 9 (2026-09-09)

| | SHA | Where |
|---|---|---|
| Backend | `a407a091` | **pushed to `master`**, Railway auto-deploys |
| Frontend | `3c8fd969` | **pushed to `main`**, NOT published |

### Live state, checked 2026-09-09 by fetching, not assumed

* **`/series` answers 403 on production** while an invented sibling under the
  same prefix answers 404 — the workstream's usual discriminator, stable
  across three probes. As in Steps 7 and 8 **this proves nothing new about
  Step 9**: the route has existed since Step 4 and Step 9 added fields INSIDE
  its admin-gated payload. This session held no production admin key, so
  **nobody has read the deployed payload**. Railway auto-deploys `master`;
  there is still no deployed-SHA endpoint on this service.
* **Step 9's frontend is NOT published.** The chunk currently served from
  mogzy.lol, `ProPlayMatchup-BF4KfkED.js`, contains **none** of
  `meeting-lineups`, `lineup-position`, `lineup-pick`, `positions_changed`,
  `repeat_picks`, `Champion not recorded` or `PICKS BY GAME`. Publishing is
  the owner's click in Lovable; a push is not a publish.
* **What IS live, and it moved:** that same chunk contains `study-evidence`
  and `gold_diff_at15`, so **Step 8 is now published** — its own note, written
  earlier the same day, said it was not. `teams_outside_focus_set` is still
  absent, so Step 8's deletion remains safe.

**No deploy-ordering hazard in either direction.**

* Backend → old frontend: `lineups` and `position_order` are **additive** keys
  on an existing payload, and the published client reads named keys. It
  ignores them.
* New frontend → old backend: `lineups` is typed **optional** and the section
  returns `null` when it is absent. There is a test.
* Nothing was removed from any payload.

## Files — Step 9

### Backend — `/Users/macmoney/League_Combat_Simulator`

| File | Change |
|---|---|
| `pro_authority/meetings.py` | `POSITION_ORDER`, `TEAM_SIZE`, `_position_rank`, `_repeat_picks`, `_lineups`; `meeting()` serves `lineups` and `position_order`. |
| `test_pro_authority_meetings.py` | Two fixture meetings; 45 new tests, 10 against the real corpus. |

### Frontend — `/Users/macmoney/mogsy`

| File | Change |
|---|---|
| `src/lib/pro-play/matchupApi.ts` | `MeetingLineupPlayer` / `MeetingLineupPosition` / `MeetingLineupTeam`; optional `lineups` and `position_order` on `MeetingPayload`. |
| `src/components/pro-play/dossier/MeetingDrilldown.tsx` | `MeetingLineups`, `LineupPosition`, `ChampionSequence`, `positionLabel`; rendered between the meeting head and the game list. |
| `src/index.css` | `.dossier-lineups*` and `.dossier-lineup*`, plus the ≤480px stack. |
| `src/pages/pro-play/ProPlayMatchupTeam.test.tsx` | Lineup fixtures, a swappable `seriesPayloads`, 20 new tests. |

## Remaining Meeting gaps

1. **The ban summary, if it can be made honest.** Not a count. The one shape
   that might work is *which champions neither side ever let through* — a set,
   not a ranking — and it still needs a reason a reader benefits from it here
   rather than in the game.
2. **Side (blue/red) per game.** It is on the participant row and it is real,
   but attaching it to a lineup entry implies a side-based read of the picks
   that this slice does not support.
3. **The meeting as a destination from the board's own lanes.** Step 8's
   `Next recommended slice` still stands and is bigger than any of these.

# Step 10 — Mogzy-native actions

Implemented. From an exact matchup study, the reader can now continue into
**Combat Lab** with both champions, or into the **Archives** with either one —
without losing the champions they were investigating.

```
MATCHUP STUDY
Ornn vs Ambessa · Doran vs Bin

1–1  ·  2 games  ·  W L
KDA 4.25   Gold @15 +286 median   CS @15 +7 median
Games in which this player, on this champion, faced that player on that champion.

Open in Combat Lab   Study Ornn Mechanics   Study Ambessa Mechanics
                                            ↑ a quiet row of text links

OTHER PRO EXAMPLES
…
```

## What it closes

Steps 1–9 built a complete chain of **evidence**: a board, a dossier, an exact
matchup, its scouting figures, the games behind them, the meeting, the game and
its 15-minute lane state. Every link in that chain answers a question about the
record, and the chain terminates. A reader who has just read *"Doran's Olaf,
against Kiin's K'Sante"* has one obvious next question the Explorer cannot
answer — **and what actually happens when those two champions fight** — and
Mogzy already owns the surfaces that answer it. Nothing connected them.

## The audit — all four destinations, before any of them was wired

The task was explicitly two-phase, and the audit is the part worth keeping:
two of the four destinations were rejected on evidence, not on effort.

| Destination | Route | Champion context today | Player / team | Deep link survives refresh | Backend needed | Gated | Small safe extension? | **Ship** |
|---|---|---|---|---|---|---|---|---|
| **Combat Lab** | `/combat-lab` | **none** — selection is localStorage-only | no | n/a (no URL state at all) | **no** | no (see below) | **yes** — two read-only query params | **YES** |
| **Archives** | `/lol/docs/champions/:slug` | **one, complete** — path param | no | yes | **no** | no | none needed | **YES** |
| **Quiz** | `/quiz` | **none** | no | n/a | would be needed | tutorial gate | **no** | **NO** |
| **Pro Play graphs** | `/lol/pro-play/graphs` | **one** — `?focus=champion&e=<slug>` | player focus exists separately | yes | no | no | none needed | **NO** (deferred) |

### Combat Lab — audited, then extended

* **Route** `/combat-lab`; `/combat-lab/diagnostics` is a sibling, not a mode.
* **Champion state is two separate localStorage records** and nothing else:
  the attacker is `config.champion` in `combat-lab:last-config`, the defender
  is `targetSetup.targetChampionName` in `combat-lab:target-setup`. They live
  in **two different components** — the page owns the attacker, the sandbox
  owns the defender — which is why the link is applied in two places over one
  parsed value.
* **There was no URL contract of any kind.** A link could name the page and not
  the matchup. This is the one destination that needed an extension, and it is
  the one destination that can hold a *matchup* rather than a champion.
* **A matchup mode already exists** — `targetMode: "target_champion"` — so
  nothing was designed; the link selects a mode the product already had.
* **Champion vocabulary is `/api/meta/champions`**, which is `SELECT name FROM
  champions` verbatim — the same 173-row table the Archives resolve against.
* **Not gated.** The 1v1 sandbox is open to everyone (the page signs in
  anonymously); daily credits meter *running a simulation*, and Premium gates
  **Team Sim (up to 5v5)**, which this link does not touch. Arriving,
  selecting two champions and reading their stats needs no entitlement, so no
  Premium marker is shown and no gate was altered.
* **The sandbox is the default tab** and its tab strip is hidden, so a linked
  defender lands where the reader is looking.

### Archives — audited, wired as-is

* `/lol/docs/champions/:slug` renders the full champion document: base stats
  and growth, a level projection, every ability with its formulas, and the
  verification state. It is **not** a landing page, and `/lol/docs` root was
  never a candidate.
* The backend's `_resolve_champion` is already **slug-based and
  punctuation-tolerant** (`routes/docs.py`), matching the frontend's
  `championSlug`. `ksante` was loaded live and returned K'Sante's real page.
* No query state, nothing to add, nothing to gate. **Zero lines of Archives
  code were changed.**

### Quiz — deferred, and it is a real gap, not an oversight

`/quiz` accepts **no champion, matchup, family or category parameter**. Its
only query params are `role_return` and `play_return` — both navigation
bookkeeping. Practice subjects are chosen *in the page* from the category rail,
and the categories are subject families ("Champion Basics", "Cooldowns"), not
champions. There is no "questions about Olaf" pool to address and no
matchup-shaped question family.

Shipping `Quiz This Matchup` would therefore have meant either dropping the
champions at the door — the exact failure this step exists to avoid — or
building a question-context architecture, which the task placed out of scope.
**Deferred.** It becomes possible the day the quiz runtime accepts a champion
filter, and not before.

### Pro Play graphs — deferred deliberately, though it would have worked

This is the one that was rejected on **product** grounds rather than technical
ones, so the reasoning is recorded rather than summarized.

* It **would** work. `/lol/pro-play/graphs` is fully URL-driven
  (`?focus=champion&e=<slug>`), champion entity ids are the **same slug** this
  step already computes, and the entity index carries **172 champions — every
  champion key in the pro corpus**. `champion-players:ksante` was built locally
  and returned a real dataset. It is not gated.
* It was still not shipped, for three reasons:
  1. **It is a lateral move, not a continuation.** The reader is already inside
     Pro Play. "Open in Combat Lab" crosses into a different Mogzy capability;
     this stays in the same one.
  2. **The question it answers is one the Explorer answers better.** The
     champion focus graphs *which players play this champion over time* — and
     the reader is two clicks from a dossier that answers that about the exact
     players they care about.
  3. **It is single-champion.** It would drop half of the matchup, which is
     precisely the context this step exists to preserve.
* A **cold champion dataset took 4.2 s to build** locally, and the route can
  answer `503 BuildCapacityError` under load. That is acceptable for a page a
  reader chose; it is a poor first impression for an action offered mid-read.

**This is the strongest deferred candidate and the recommended next slice** —
but it should arrive as a *matchup-shaped* graph, not as a link that keeps one
champion.

## The Combat Lab deep link — the one contract added

```
/combat-lab?attacker=<champion-slug>&defender=<champion-slug>
```

`src/lib/combat-lab/matchup-link.ts` owns it end to end: build, parse, resolve.

**It says which champions, and nothing else.** Level, items, runes, ability
ranks, the sequence, the crit mode, the target profile and every dummy figure
are left exactly as the reader last left them. A test reads all of them back
after applying a link and asserts each is still its default.

**It also switches the target mode**, and that is the one non-obvious part.
The stock target is `target_dummy`, in which `targetChampionName` is simply
never read — writing a defender without switching would store a selection the
simulator never uses and paint a portrait of a champion it is not fighting.
Setting a defender champion **is** asking for `target_champion`; nothing else
about the target changes.

**Applied once per requested champion**, keyed on the resolved name. A reader
who changes champions by hand afterwards is not overridden by a re-render.

**The URL is the state, so a refresh is the same screen.** Verified in a real
browser: reload at `?attacker=olaf&defender=ksante` and both records still say
Olaf and K'Sante. The consequence — worth stating rather than discovering — is
that a reader who edits the champions *and then refreshes* gets the linked pair
back, because the address bar is what a shared link means.

**Totally fail-safe.** Every malformed, unknown, over-long or absent value
resolves to "no champion requested" and the current selection is untouched.
There is no error state to land in. `<script>`, `../../etc/passwd`,
`olaf%2Cksante`, `-olaf`, `olaf--sol`, a 41-character slug and a raw
`K'Sante` are each pinned by a test; casing and stray whitespace are **not**
rejected, because neither is identity.

## Champion identity — the slug, and the reason it matters

The Explorer speaks Leaguepedia's `champion_key`. Combat Lab and the Archives
both key off the `champions` table. **They are not the same strings**, and a
naive comparison drops a champion:

| | Explorer (`champion_key`) | `champions` table | slug |
|---|---|---|---|
| | `Dr. Mundo` | `Dr Mundo` | **`dr-mundo`** |

`championSlug` (`src/lib/league-docs/api.ts`) — the mapper the League Docs
pages and the backend's own `champion_slug` already share — is the single
join. **No new mapper was written**, and no string matching was added.

The mapping was **measured, not assumed**, against the real corpus:

* **172 distinct `champion_key` values** in `pro_canonical_player_games`.
* **172 of 172 resolve** into the 173-champion table by slug. Unmapped: **0**.
* **Slug collisions across all 173 champions: 0.**
* Graph1's champion entity index uses the **same 172 slugs**, so the deferred
  fourth destination needs no new identity work whenever it is picked up.
* Both stores use the short spellings — `Nunu`, `Renata`, `Wukong` (never
  `MonkeyKing`). Verified by query, not by memory.

`Dr. Mundo → dr-mundo → "Dr Mundo"` was then driven end to end in a real
browser, which is the case a unit test alone would not have proved.

## Where the actions are, and what they look like

**One placement, and only one.** Inside the exact matchup study, after the
record, the sample figures and the served definition, and **before** "other pro
examples". The reader finishes the matchup they asked about before anything
offers to take them elsewhere, and the wider exploration stays after the
narrower continuation. A test asserts both orderings from the DOM.

**Nothing was added to the board, the dossier, the Meeting or the Game.** The
exact study is where both champions are known *and* the reader has expressed a
specific matchup intent. The player × champion dossier was considered for a
single-champion `Study Ornn` and rejected for this slice: the dossier's
question is "this player on this champion against these teams", and a champion
mechanics link there answers a question nobody asked at that depth.

**It is a row of text links, not a button bar.** One wrapping flex row,
0.66 rem, the dossier's own antique gold, an underline, no fill, no radius, no
shadow, no icon and no colour the drawer does not already use. Lighter than the
players' names, which the section's own contract requires. A test asserts the
row contains **zero `<button>` elements** and that every link carries the
action class.

**Only supported destinations render.** There are no disabled buttons, no
"coming soon" and no fourth greyed-out action. A test walks every `<a>` in the
row and fails if its href is anything but `/combat-lab` or
`/lol/docs/champions/`, and separately fails on the words *quiz*, *graph* and
*coming soon*.

**Labels name the champion.** `Open in Combat Lab`, `Study Ornn Mechanics`,
`Study Ambessa Mechanics`. Never *Learn more*, *Explore* or *Analyze*.

**A mirror matchup renders one mechanics action, not two identical links** —
and still offers Combat Lab with both sides, because a mirror is a real
matchup.

**They render on the zero state too.** "Compare these two champions
mechanically" is the same question whether the players met four times or never,
and it is arguably the *more* useful offer when the pro record is empty.

## The seam this row is careful not to blur

Historical Pro Play evidence and mechanical simulation are **two authorities**,
and the link is written so it cannot be read as one determining the other.

* The Combat Lab URL carries **exactly two keys**, `attacker` and `defender`.
  A test enumerates them and separately asserts the href contains none of
  `Doran`, `Bin`, `T1` or `Bilibili`.
* **No build, item, rune, level, patch or date crosses.** No pro build is
  imported, no level is inferred from a source game, and the historical game's
  item state is never used.
* **No player-specific simulation is implied.** The action means *compare these
  champions*; it does not mean *recreate this game*. A test fails on
  *recreate*, *replay*, *rebuild*, *their build*, *this game*, *predict* and
  *simulate the* appearing in the row.

Recreating a historical game state remains a **separate future feature**, and a
much larger one.

## Navigation, history and mobile

* **React Router `<Link>`, same tab.** No `target="_blank"`, matching every
  other navigation in the Explorer.
* **Back returns to the whole study.** Verified live: `/lol/pro-play/matchup
  ?mode=team&team_a=T1&team_b=Gen.G&focus_player=Doran&focus_champion=Olaf
  &vs_player=Kiin&vs_champion=K%27Sante` → Combat Lab → Back → **byte-identical
  URL, study restored**. This works because Step 3 already put the open study
  in the address bar; Step 10 added no history handling of its own.
* **375 px.** Measured in a real browser with the roster's longest label
  (`Study Aurelion Sol Mechanics`): the row wraps to **2 lines, 46 px tall, no
  label truncated, no horizontal page overflow**. Half a champion's name is not
  a destination, so the row wraps rather than scrolls or ellipsizes.

## Analytics — deliberately none

`trackFunnelEvent` exists and is the house helper, but **no Pro Play surface
has ever emitted an event** — not the board, the dossier, the exact study, the
evidence drilldown, the Meeting or the Game. Instrumenting only these two
actions would produce a dataset that reads as "the Explorer's only navigation"
and would break this surface's own consistency for one row of links. Whether
Pro Play should be instrumented at all is a product-wide decision, not a
side effect of adding an action. **No analytics system was introduced.**

## Backend

**None. Zero backend files changed.** Step 10 is entirely frontend routing and
context. Both live destinations already served everything they needed.

## Real flows validated (2026-09-10)

Driven in a real browser against the dev server (production backend):

1. **`?attacker=olaf&defender=ksante`** — Attacker **Olaf**, Defender
   **K'Sante**, header reads `Olaf vs K'Sante`, defender mode **Champion
   Defender**, both at level 18.
2. **Refresh** — both records re-read from the URL, unchanged; every default
   still default.
3. **Punctuation, both sides** — `?attacker=dr-mundo&defender=chogath` resolved
   to **`Dr Mundo`** and **`Cho'Gath`**. This is the cross-authority spelling
   case, live.
4. **`?attacker=kaisa`** alone — attacker **`Kai'Sa`**, target left on the
   dummy. One champion is still a destination.
5. **Malformed** — `?attacker=%3Cscript%3E&defender=olaf%2Cksante` left the
   champion empty and the target on the dummy. Page rendered normally.
6. **Archives** — `/lol/docs/champions/ksante` returned K'Sante's real
   document (stats, growth, abilities), not a landing page.
7. **Back** — the full Doran · Olaf vs Kiin · K'Sante round trip above.
8. **375 px** — measured, above.

**Not driven live: the action row inside a real study.** The Explorer's
`/matchup/*` routes are admin-gated (`403`, confirmed by fetching), this
session held no production admin key, and the Explorer's backend routes are not
on the backend branch this session was on. The row is covered by 20 jsdom tests
against the real component and the real payload shape, and the two destinations
it points at were both opened for real. Nobody has seen the row rendered
against live data — do not claim otherwise until someone with a key has.

## Tests

**Frontend — 42 new, no backend tests (no backend change).**

| File | Tests |
|---|---|
| `src/lib/combat-lab/matchup-link.test.ts` | **12 new.** Slug normalization for every awkward roster name, the both-spellings `Dr. Mundo` / `Dr Mundo` bridge, "only these two keys", round trip, 10 malformed inputs, manifest resolution, unknown/absent. |
| `src/pages/CombatLab.deeplink.test.tsx` | **10 new.** Both champions selected, target mode switched, **every other default asserted untouched**, punctuation both sides, the cross-authority name, refresh, and four fail-safe cases. |
| `src/pages/pro-play/ProPlayMatchupTeam.test.tsx` | **20 new** (261 → **281 passed**). Both champions in the Combat Lab href, champion-named Archives labels, punctuation, mirror matchup, the zero state, nothing before both champions are known, **no quiz/graph/disabled action**, **no recreate-the-game claim and no player/team leak**, and the DOM ordering of the row. |

**Suites re-run, all green:**

* Board suite **281 passed** (was 261).
* All Pro Play + Combat Lab + League Docs + Graph1 page suites: **31 files,
  1082 passed, 0 failed**.
* All seven Combat Lab suites together: **74 passed** — the six pre-existing
  ones unchanged.
* Typecheck: **no error in any file this step touched.** The repo's 13
  pre-existing errors are unchanged.
* Build: green.

### A trap worth recording

**jsdom in this repo exposes a `localStorage` object with no methods on it.**
Every `setItem` in Combat Lab hits its own try/catch and is silently dropped,
so a test that asserts persisted state passes *vacuously*. `CombatLab.deeplink.test.tsx`
installs a real in-memory `localStorage` in `beforeEach` for exactly this
reason. Any future test that reads a `combat-lab:*` record must do the same, or
it is testing nothing.

## Deploy state — Step 10 (reconciled 2026-09-10)

| | SHA | Where |
|---|---|---|
| Backend | `fe4070cc` | **unchanged by Step 10**; Steps 7-9 contracts already on `master` |
| Frontend | `2b256ac9` | **merged to `main`**, pushed. **NOT published** — Lovable Publish is the owner's click |

### The branch chain is closed

An earlier revision of this section said Steps 7, 8 and 9 were an unmerged
branch chain that Step 10 extended. **That is no longer true and must not be
repeated.** Measured by `git` ancestry rather than by report:

| Step | Feature | Commit(s) | On `main`? |
|---|---|---|---|
| 7 | Exact aggregate scouting stats | `1aa346fd` + `0c01b97a` (docs) | **yes** |
| 8 | Aggregate → source evidence | `0da421de` + `8d91e971` (docs) | **yes** |
| 9 | Meeting enrichment | `3c8fd969` + `dca12696` (docs) | **yes** |
| 10 | Mogzy-native actions | `2b256ac9` | **yes**, this pass |

Step 10's parent **was** `origin/main` exactly — `git log origin/main..
proplay/step10-native-actions` listed one commit and the reverse listed none —
so the integration was a **fast-forward with no conflicts and no rebase**.
The only non-Pro-Play commits that landed on `main` inside the Step 7-10 window
(`f448f6eb`, `6ce0a89b` Premium; `dc767e21` patch-reports) touch a **disjoint
file set**, so there was no concurrent Combat Lab, `MatchupStudy.tsx`,
`matchupApi.ts` or `index.css` work to preserve against.

`src/index.css` was audited after integration rather than assumed: braces
balance to depth 0 over all 12,570 lines, and Step 10's `.dossier-study__action*`
rules sit at **nesting depth 0 with an empty media stack** — they are not
trapped inside a mobile block, which is the historical failure this file has
had before.

### What is live, checked by fetching the bundle rather than assuming

Production `mogzy.lol` entry chunk `index-B2MUQ3uS.js` →
`ProPlayMatchup-BVhOD63g.js`. Compared marker-for-marker against this branch's
own build (`ProPlayMatchup-C0NbiXbG.js`):

| Marker | Step | local build | production |
|---|---|---|---|
| `gold_diff_at15` | 7 | present | **present** |
| `Lineups` | 9 | present | **present** |
| `Open in Combat Lab` | 10 | present | **absent** |
| `dossier-study__action` | 10 | present | **absent** |
| `combat-lab` | 10 | present | **absent** |

**Steps 6-9 are live. Step 10 is pushed and NOT live.** A push is not a
publish: the owner must press **Publish in Lovable**. Do not claim Step 10 is
in production until those three markers appear in the deployed chunk.

**No deploy-ordering hazard, in any direction.** There is no backend change,
and `/combat-lab` ignores query parameters it does not read — the currently
published Combat Lab would simply open on the reader's last selection if it
ever met a Step 10 link. Nothing was removed from any payload or any route.

### Backend contracts spot-checked, backend untouched

Verified present on `origin/master` `fe4070cc` and **not modified by this
pass**: `pro_authority/exact_statistics.py` serves Step 7's `kda`,
`gold_diff_at15`, `cs_diff_at15` with `coverage.at15_games` and
`subject_positions`, and Step 8's per-metric `evidence` arrays (including the
empty-list-not-absent-key shape when `supported` is false);
`pro_authority/meetings.py` serves Step 9's `_lineups` with `positions_changed`
and the incomplete-participant count; `pro_authority/game_detail.py` still
serves Step 5/6 Game detail and `lane_checkpoint`.

## Files — Step 10

### Backend

None.

### Frontend — `/Users/macmoney/mogsy`

| File | Change |
|---|---|
| `src/lib/combat-lab/matchup-link.ts` | **New.** `buildCombatLabMatchupUrl`, `parseCombatLabMatchup`, `resolveCombatLabChampion`, `COMBAT_LAB_PARAM`. |
| `src/lib/combat-lab/matchup-link.test.ts` | **New.** 12 tests. |
| `src/pages/CombatLab.tsx` | `useSearchParams`; `linkedMatchup` / `linkedAttacker` / `linkedDefender`; the attacker effect in the page, the defender effect in the sandbox; one new `SandboxProps` field. |
| `src/pages/CombatLab.deeplink.test.tsx` | **New.** 10 tests. |
| `src/components/pro-play/dossier/MatchupStudy.tsx` | `StudyActions`, rendered between the definition and "other pro examples". |
| `src/index.css` | `.dossier-study__actions`, `.dossier-study__action`. |
| `src/pages/pro-play/ProPlayMatchupTeam.test.tsx` | 20 new tests. |

## Deliberately not done

* Any **fourth action**, disabled placeholder or "coming soon".
* **Actions on the board, the dossier, the Meeting or the Game.**
* **Importing pro builds, runes, items or levels** into Combat Lab.
* **Historical game reconstruction** in the simulator.
* Any **new question generation, graph or analytics system**.
* Any **subscription, entitlement or gating change**.
* Any **Ranked, Daily, RR1 or LIVE1** wiring.
* Any **pretty-URL** work.

## Next recommended slice

**A matchup-shaped Pro Play graph, and only then the action that opens it.**
The graphs page is the strongest deferred destination and needs no identity
work — the slugs already line up — but linking it today would hand it one
champion and drop the other. The slice worth doing is the one that makes
`focus=champion` accept a *pair*, or that gives the champion-vs-champion
matchup its own family. Then `Explore Pro Data` is a continuation rather than a
lateral step, and it ships in an afternoon.

Do **not** ship a single-champion graph link first. It is the cheap version of
this step's exact mistake.

## Next task

1. **The matchup-shaped graph**, above.
2. **A champion filter in the quiz runtime**, which is the single thing
   standing between the Explorer and `Quiz This Matchup`. Small, and it belongs
   to the quiz workstream, not this one.
3. Everything still open from Step 9: the ban summary if it can be made honest,
   per-game side, and the meeting as a destination from the board's own lanes.
4. **The pretty-URL architecture.** Still a rename.
5. **Press Publish in Lovable.** Steps 7-10 are all merged into `main` and
   pushed; Steps 6-9 are live and **Step 10 is not**. This is the only
   remaining deployment action for the whole 7-10 range, and it is the owner's
   click — nothing in this repository can perform it.

## Integration pass — Steps 7-10 reconciled into `main` (2026-09-10)

A dedicated pass audited whether the Steps 7-10 work was actually represented
on the canonical deploy branch, because the Step 10 report described an
unmerged four-step branch chain. **It was not a chain by the time it was
checked.** Steps 7, 8 and 9 had already been merged; only Step 10 was outside
`main`, one commit ahead of it with zero divergence.

* **Method: fast-forward.** No rebase, no cherry-pick, no manual
  reconciliation — none was warranted. `2b256ac9`'s parent *was* `origin/main`.
* **Conflicts: none.** Not in `index.css`, not in `CombatLab.tsx`, not
  anywhere. The overlap analysis the pass was told to perform found that every
  commit touching `MatchupStudy.tsx`, `MeetingDrilldown.tsx`, `matchupApi.ts`,
  `ProPlayMatchupTeam.test.tsx` or `index.css` since the Step 7 branch point
  **was itself one of Steps 7-9**.
* **Behavioural decisions: none were needed.** No Step 7-10 semantics were
  altered, simplified or renegotiated by this pass. No product behaviour was
  added.
* **Backend: untouched**, contracts spot-checked and present (above).
* **Tests.** Steps 7-10 targeted: `ProPlayMatchupTeam.test.tsx` +
  `matchup-link.test.ts` + `CombatLab.deeplink.test.tsx` = **303 passed**.
  Every Combat Lab, Pro Play, League Docs and combat-lab lib suite: **48 files,
  1221 passed, 0 failed**. Full suite, run **serially**: **58 failed / 10,369
  passed / 7 skipped** — the *same 58 failures* as the documented clean-`main`
  baseline, none of them in pro-play, combat-lab or lol-docs. Compare failure
  SETS, never totals. Typecheck: 13 errors, all pre-existing, none in a Step 10
  or pro-play file. Build green.
* **Browser validation, on the integrated branch.** The Matchup Explorer is
  admin-gated and this pass held no admin key, so Steps 7-9's *rendering* rests
  on their suites and on the live bundle markers above. Step 10's genuinely new
  and **ungated** surfaces were driven directly:
  `?attacker=ksante&defender=dr-mundo` selected **K'Sante** and **Dr Mundo** —
  which is the cross-authority join proved end to end, since the Explorer
  spells it `Dr. Mundo` and Combat Lab's table spells it `Dr Mundo` — switched
  the defender to Champion Defender, and left level 18, `None` items and the
  5/5/5/3 ability ranks exactly as they were. A refresh landed on the same two
  champions. `?attacker=<script>&defender=notachampion12345` produced **no
  error and no change**: the previous selection stood. Both Archives routes
  resolved (`/lol/docs/champions/ksante`, `/lol/docs/champions/dr-mundo`). At
  **375px**, the longest name in the game plus a punctuated one
  (`aurelion-sol` / `ksante`) both applied with **no horizontal overflow**.
* **Branch cleanup.** The integration branch was `proplay/steps7-10-integration`
  in worktree `/Users/macmoney/mogsy-wt-s710-int`. The per-step branches
  (`proplay/exact-aggregate-fe`, `proplay/exact-evidence-fe`,
  `proplay/meeting-enrichment-fe`, `proplay/step10-native-actions`) are now
  fully contained in `main` and are safe to delete.

**A trap this pass hit, worth recording.** The local `main` in
`/Users/macmoney/mogsy` was **diverged** — three unpushed Ranked bot commits
(`af1bde59`, `ffad79f7`, `e12f5900`) on a base nine commits behind
`origin/main` — and its working tree held a *different* session's uncommitted
Pro Stats Explorer work. Reading the handoff from that checkout showed the
document ending at **Step 6** and would have "confirmed" the unmerged-chain
story. **Read `origin/main`, never the shared working tree**, when
establishing branch reality.

---

# Step 11 — champion-pair Pro Play data

Implemented. `Explore Pro Data` now joins the Step 10 action row, and it opens
a real champion-versus-champion professional sample with **both** champions
preserved.

```
MATCHUP STUDY
Ornn vs Ambessa · Doran vs Bin
…
Open in Combat Lab   Study Ornn Mechanics   Study Ambessa Mechanics   Explore Pro Data
                                                                     ↑ new
                                    ↓

OLAF VS K'SANTE                                     /lol/pro-play/graphs
All Pro Play                                        ?focus=matchup&a=olaf&b=ksante

[ Champion: Olaf ] [ Opponent: K'Sante ] [ Swap ]
[ All Pro Play | Major Pro ]  [ League ▾ ]  ▸ More filters

GAMES          OLAF RECORD      OLAF WIN RATE
62             38–24            61.3%
both champions,                 against K'Sante
opposing teams
────────────────────────────────────────────────
Professional games in which Olaf and K'Sante appeared on opposing teams.
This is the broader professional sample — not a specific pair of players.
```

## What Step 10 deferred, and why the deferral was right

Step 10's audit rejected the Pro Play graphs on **product** grounds: the
surface took one champion (`?focus=champion&e=<slug>`), so a link from an
exact matchup would have dropped half of it. Step 11 does not reverse that
judgement — it removes the reason for it. The surface now takes a pair.

## The pair sample — one definition, four conditions, all required

A professional game is in the sample when:

1. a canonical player row in that game carries champion **A**, and
2. a canonical player row in the **same** game carries champion **B**, and
3. those two rows' `team_key` **differ**, and
4. the game is admitted by the competition policy and falls inside the scope.

Nothing qualifies through both champions appearing anywhere in a draft, one
picked and one banned, the same team, the same meeting in different games, a
shared player pool, or an inferred lane assignment. **A ban can never
qualify**, because a banned champion has no player row at all.

Measured on the real corpus: Olaf and K'Sante have **260** raw opposing rows
and **62** games after the professional policy — the other 198 are academy,
challenger and amateur competitions the policy already excludes everywhere
else in GRAPH1. The refusal is reported, never silent
(`coverage.excludedGameCount`, plus a warning naming `pro_broad_v2`).

## Orientation — the sample is unordered, the answer is not

`Olaf vs K'Sante` and `K'Sante vs Olaf` read the **identical** set of games.
`pairId` is the two champion keys sorted and is the sample's identity; the
subject is what reverses.

* `record`, `subjectPositions` and `subjectSides` are always the **subject's**.
* Swapping inverts wins and losses **exactly**. That is a guarantee, not a
  coincidence: `win` is complementary across opposing rows, and a real-corpus
  test asserts zero games where both sides are marked won.
* Alphabetical order decides the **cache key** and nothing a reader sees. The
  two orientations are two cache entries, deliberately — sharing one would
  print K'Sante's win rate under Olaf's name.

Verified live: Olaf `38–24 · 61.3%`, swapped K'Sante `24–38 · 38.7%`, 62 games
both ways.

## Route / query contract

```
/lol/pro-play/graphs?focus=matchup&a=<subject-slug>&b=<opponent-slug>
  [&major=1&league=…&tournament=…&region=…&patch=…&from=…&to=…]
```

`focus=` remains the one parameter that says what kind of graph this is, and
`a`/`b` are visibly two entities. **`e=` was deliberately not overloaded** —
it means one entity everywhere else on the page, and a second meaning for it
would make a hand-edited URL ambiguous.

| Case | Behaviour |
|---|---|
| Direct load / refresh | The URL is the state. Same screen. |
| Back | Returns to the previous orientation (a swap **pushes**). |
| Scope change | **Replaces**, so Back does not walk every filter nudge. |
| One champion missing | "Pick two champions above." **No request is made.** |
| Same champion both sides | "A champion cannot be its own opponent." No request. |
| Malformed slug | Treated as missing. Total parsing — never an error page. |
| Punctuation-heavy | `ksante`, `dr-mundo`, `chogath`, `kaisa`, `leblanc`, `aurelion-sol`, `belveth` all resolve. |
| Casing / stray whitespace | Folded. Neither is identity — the same rule Step 10 applied. |

`focus=player|team|champion` is untouched. `parseSelection` never sees
`focus=matchup`, so **no existing single-champion deep link moves**.

## Champion identity — no new mapper, and it was measured

The frontend action uses `championSlug` — the same mapper Step 10 used. The
backend resolves that slug through `EntityIndex.champion()`, whose `.name` is
`champions.name`, and uses it **verbatim** as the SQL predicate against
`pro_canonical_player_games.champion_key`.

That is only safe because the two stores agree, so it was measured rather than
assumed: **172 distinct `champion_key` values, 0 of them absent from the
`champions` table.** A real-corpus test pins it. Note the spelling that
differs elsewhere in the product does **not** differ here — the canonical pro
facts carry `Dr Mundo`, not `Dr. Mundo`.

## Scope — the same predicate, not a second time model

Pair mode reuses `Graph1Scope` unchanged: the same parameters, the same
canonical values from `/api/graph1/scope-values`, the same
`competition_policy` split between SQL and Python. "Olaf vs K'Sante at Worlds
2025" is narrowed by exactly the rule that narrows a race, and `Graph1Scope`
still has no field that can express `apply_policy=False`.

## The graph-family audit — what survives a pair filter

The first principle was *do not add a second entity and leave every chart
semantically unchanged*. Each existing family was judged on its denominator:

| Family | In pair mode? | Why |
|---|---|---|
| `player-champions:<lp_page>` | **no** | The focus is a player. A champion pair is not a filter on it; it is a different question. |
| `team-champions:<team_key>` | **no** | Same — the focus is an org. |
| `champion-players:<slug>` (race) | **deferred** | Semantically valid ("players who played Olaf into K'Sante") but a 62-event race is a race with nothing to watch. Not wrong, just not worth animating yet. |
| `champion-teams:<slug>` (picks) | **deferred** | Same reasoning. |
| `champion-teams:<slug>:bans` | **INVALID — hidden** | A banned champion was never played, so it can never be in a game opposite another champion. The pair sample is empty by construction and any ban rate over it is nonsense. |
| Ratio board `share` | **INVALID — hidden** | The denominator is "games in this scope". Under a pair filter that becomes "games in which the pair met", so "champion share" would silently measure something else under the same word. |
| Ratio board `win_rate` | **replaced** | The subject-oriented record IS the pair's win rate, computed over the pair sample and labelled with the subject's name. |

**No chart was preserved because it exists.** The four families are untouched
and the pair surface is a summary, which is the shape the useful first answers
actually have.

## Why a sibling endpoint and not a family key

Every GRAPH1 family is `<family>:<one entity>` and produces a ranked race or
ranked board over time. A pair is two entities, and encoding it into that key
space would have collided with the `champion-teams:<slug>:bans` mode token,
which is parsed off the **last** separator. It is a small sibling read over the
same canonical tables, the same scope object and the same policy — one truth,
one filter contract, a different shape.

```
GET /api/graph1/champion-matchup?a=<slug>&b=<slug>[&scope…]
```

| Status | Meaning |
|---|---|
| 200 | The sample, including `games: 0`. **Zero is an answer, not an error.** |
| 400 | A champion against itself, or a malformed scope. |
| 404 | A slug that is no champion in professional play. |
| 422 | `a` or `b` absent. The frontend never emits this. |
| 503 | Build capacity / data unavailable, with `Retry-After`. |

Payload: `pairId`, `subject`, `opponent`, `scope`, `games`, `record`,
`byYear`, `subjectPositions`, `opponentPositions`, `subjectSides`,
`firstGame`, `latestGame`, `coverage`. ETag + `Cache-Control: max-age=300` +
304, exactly like a dataset.

## What shipped, and what did not

**Shipped:** games; subject record and win rate; games-by-year with subject
wins; subject and opponent position splits; subject side split; first and
latest game.

**By year, not by patch** — and that is the one data decision worth keeping.
`pro_canonical_games.patch` is nullable by design (real games carry no
recorded patch), so a patch series would silently drop games the headline
count includes. `game_date` is `NOT NULL`.

**Position splits are context, not a lane claim.** Olaf appearing in the
Jungle in six of these 62 games says where he was played. It does **not** say
he laned against K'Sante — the Explorer owns that semantic and measures it
(Step 6). The note is on screen, not in this file only.

**Not shipped, deliberately:** player filters, KDA, damage/min, @15
aggregates, items, runes, draft order, bans, prediction, matchup-strength
scores, counterpick labels, Comparison Lab.

**No player identity is in the payload at all**, and a test asserts it —
mixing the two would let the broader sample be read as a player's record.

## Zero, and what it must never do

A pair with no professional meetings renders *"No professional games found for
this champion matchup in the selected scope."* It does **not** fall back to
one champion's data and does **not** widen the scope to find something to
show. Either would answer a question the reader did not ask, under the heading
of the one they did. A test asserts no dataset request is made in that state.

Missing enrichment cannot erase a game either: the canonical participation and
the canonical winner are the whole basis of this surface, and no figure here
depends on Oracle's Elixir.

## Performance — and the one-character fix that mattered

The obvious self-join is **135 seconds** on the production corpus. SQLite
drives both sides off `idx_pro_canonical_player_games_champion` and
nested-loops every subject row against every opponent row. Suppressing the
index on the opponent term (`AND +o.champion_key = ?`) forces that side onto
the `(canonical_game_id, player_lp_page)` primary key, so each subject row
probes ~10 rows of its own game.

Measured through the HTTP route, entity index warm:

| Pair | Games | Cold |
|---|---|---|
| Bel'Veth vs Naafiri (zero) | 0 | 0.31 s |
| Dr Mundo vs Cho'Gath | 40 | 0.64 s |
| Olaf vs K'Sante | 62 | 0.35–1.1 s |
| LeBlanc vs Aurelion Sol | 6 | 1.27 s |
| **Thresh vs Nautilus (heaviest sampled)** | **718** | **2.02 s** |
| any pair, warm | — | ~1 ms |

Payload ~2 KB, against 520 KB–2.25 MB for a race. Pair filtering is therefore
**cheaper** than the 4.2 s single-champion cold build Step 10 measured, which
is what makes this defensible as an action offered mid-read. No new cache was
introduced: it reuses the existing `BoundedPayloadCache` and `SingleFlight`,
in its own key namespace, carrying the policy version like a dataset key does.

## The action

One text link appended to the Step 10 row, in the same class, same voice:

```
Open in Combat Lab   Study Ornn Mechanics   Study Ambessa Mechanics   Explore Pro Data
```

* **The champions are the only thing that crosses.** A test asserts the href's
  parameter set is exactly `{focus, a, b}` and that no player, team or org
  string appears in it.
* **Subject first**, because the study is written from the subject's side and
  the destination reports the subject's record.
* **A mirror matchup renders no Pro Data link** — a champion is not its own
  opponent, and offering a link whose only outcome is a refusal is worse than
  no link.
* **Quiz is still absent**, for the reason Step 10 gave: `/quiz` accepts no
  champion at all. Step 10's guard test was rewritten rather than deleted, so
  it now pins *three* allowed destinations and still forbids a quiz action.

No CSS was added. The row was already `flex-wrap: wrap`; measured at 375px
with the longest pair of names in the roster (K'Sante / Aurelion Sol), the
four links wrap to two rows, 46 px total, **zero horizontal overflow**.

## Mobile

Verified in a real browser at 375×812: `document.scrollWidth === 375`, no
element's right edge past the viewport. The two champion pickers stack (they
are side by side only from `sm`), Swap is full width beneath them, the scope
controls are unchanged, and the three headline figures wrap to two rows.

## Files — Step 11

### Backend (`master`)

| File | Role |
|---|---|
| `graph1/champion_matchup.py` | **New.** The pair sample: definition, the `+` join, orientation, the summary. |
| `routes/graph1.py` | `GET /api/graph1/champion-matchup`, placed above `datasets/{key}` so the literal path is never shadowed. |
| `test_graph1_champion_matchup.py` | **New.** 31 tests, 7 against the real corpus. |

### Frontend (`main`)

| File | Role |
|---|---|
| `src/graph1/championMatchup.ts` | **New.** Types, total URL parsing, the href, the swap. |
| `src/graph1/useGraph1ChampionMatchup.ts` | **New.** The query hook. |
| `src/components/graph1/ChampionMatchupPanel.tsx` | **New.** The drawn sample and the zero state. |
| `src/pages/lol/ProPlayGraphs.tsx` | Split into `BuilderGraphs` and `ChampionMatchupGraphs`; the mode switch sits above every hook. |
| `src/components/pro-play/dossier/MatchupStudy.tsx` | The `Explore Pro Data` action. |
| `src/graph1/championMatchup.test.ts` | **New.** 15 tests. |
| `src/pages/lol/ProPlayGraphsMatchup.test.tsx` | **New.** 14 tests. |
| `src/pages/pro-play/ProPlayMatchupTeam.test.tsx` | Step 10's "no pro-graph action" guard rewritten; 2 Step 11 tests added. |

## Tests

* Backend `test_graph1_champion_matchup.py` — **31 passed**. Population
  (same game, opposing teams, same-team excluded, different games of one
  meeting excluded), orientation (subject record, exact inversion, order-free
  `pairId`), refusals, scope narrowing, flex-role retention, determinism, the
  read boundary, and no player identity in the payload. Seven run against the
  production corpus.
* Backend regression `test_graph1_*.py` — **677 passed, 0 failed**.
* Frontend `src/graph1` + `src/components/graph1` + both graph pages +
  the Combat Lab link — **410 passed, 28 files**.
* Frontend `ProPlayMatchupTeam.test.tsx` — **283 passed** (Steps 1–11).

Independent cross-check: the pair counts were recomputed with a structurally
different query (per-champion game sets, intersected, then filtered) and agree
exactly — Olaf/K'Sante 62 games 38 wins, Thresh/Nautilus 718/392,
Dr Mundo/Cho'Gath 40/23.

**Pre-existing and unrelated:** four real-corpus tests in
`test_pro_authority_explorer_teams.py` fail on `master` — the shipped team
registry has drifted against the corpus, which is exactly what those tests
exist to catch. `scripts/audit_explorer_team_pool.py` prints the edit. Step 11
touches nothing in `pro_authority`.

## Real corpus examples verified

| Pair | Scope | Games | Subject record |
|---|---|---|---|
| Olaf vs K'Sante | all pro | 62 | 38–24 · 61.3% |
| K'Sante vs Olaf | all pro | 62 | 24–38 · 38.7% |
| Olaf vs K'Sante | major pro | 33 | 23–10 · 69.7% |
| Olaf vs K'Sante | from 2026-01-01 | 6 | 4–2 · 66.7% |
| Thresh vs Nautilus | all pro | 718 | 392–326 · 54.6% |
| Dr Mundo vs Cho'Gath | all pro | 40 | 23–17 · 57.5% |
| LeBlanc vs Aurelion Sol | all pro | 6 | 3–3 · 50.0% |
| Nidalee vs Elise | to 2014-12-31 | 14 | 5–9 · 35.7% |
| Bel'Veth vs Naafiri | all pro | 0 | zero state |
| Naafiri vs Nunu | all pro | 0 | one raw meeting, outside the policy — excluded and reported |
| Ryze vs Azir | Worlds 2025 Main Event | 0 | zero state, scope respected |
| Olaf vs Olaf | — | — | 400, refused |

## Next recommended slice

**Decide whether the pair sample earns a race.** `champion-players` filtered to
a pair is semantically valid and was deferred only because 62 events is a thin
race. The honest question is whether a reader who now sees "Olaf 38–24 against
K'Sante" wants *which players* produced it — which is a ranked board over the
pair sample, not an animation. Build it only if the summary proves useful, and
keep the denominator labelled with the pair, never with "all games".

Do **not** add KDA, gold@15 or item builds to this surface first. They are
statistics about games; the pair population is a claim about which games, and
the claim is the thing worth proving before decorating it.

## Deploy state — Step 11 (2026-09-10)

| Half | SHA | State |
|---|---|---|
| Backend `master` | `ad0716a3` | **LIVE on Railway.** Verified by calling it, not assumed. |
| Frontend `main` | `a9aeb5ef` | Pushed. **NOT published** — pair mode is not live on mogzy.lol. |

Backend went first because the contract is purely additive; the frontend is
useless without it and harmless before it.

### Live backend, checked by fetching

```
GET /api/graph1/champion-matchup?a=olaf&b=ksante   200  67 games  Olaf 41–26  61.2%
GET /api/graph1/champion-matchup?a=ksante&b=olaf   200  67 games  K'Sante 26–41  38.8%
GET .../?a=thresh&b=nautilus                       200  744 games Thresh 406–338 54.6%
GET .../?a=dr-mundo&b=chogath                      200  46 games  Dr Mundo 27–19 58.7%
GET .../?a=belveth&b=naafiri                       200  0 games   zero state
GET .../?a=olaf&b=olaf                             400  refused
GET .../?a=olaf&b=nope                             404  unknown champion
```

Production latency 0.18–1.30 s.

**Production counts are HIGHER than the local-snapshot figures elsewhere in
this document, and that is corpus freshness, not a semantic difference.** The
local `lol_calc.db` is a stale partial snapshot: policy-filtered Olaf is 2,835
games locally against 3,074 in production, Thresh 5,610 against 6,623,
K'Sante 3,820 against 4,035 — a uniform shortfall across unrelated champions.
The *ratios* agree to a tenth of a percent (61.3% local vs 61.2% live;
Thresh/Nautilus 54.6% in both), and reversal is exact in production
(41–26 ↔ 26–41 over the same 67 games). **Always re-measure a headline figure
against production before quoting it.**

### Frontend, checked by fetching the live bundle

`ProPlayMatchup-BfkDrv2O.js` contains `Open in Combat Lab` (Step 10) and **no**
`Explore Pro Data`; `ProPlayGraphs-BxfLD3E-.js` contains no `focus=matchup`.
mogzy.lol publishes through Lovable (Share → Publish) and **a git push does not
trigger it**. Until the owner publishes:

* the `Explore Pro Data` action does not appear in the exact matchup study, and
* `/lol/pro-play/graphs?focus=matchup&a=…&b=…` renders the ordinary builder.

Neither is a failure state — the backend is ready and nothing regressed.

---

# Step 12 — contextual Quiz

`Doran · Olaf vs Kiin · K'Sante` continues into a Leaguecraft study about
**Olaf and K'Sante**. The action is `Quiz This Matchup`, and it exists only
because the destination genuinely uses both champions.

## What the audit found, and why it decided the architecture

Step 10 left Quiz out and said why: `/quiz` had no champion context, so the
link would have dropped the matchup on the way. Step 12 began by measuring
whether that was still true.

**The stored bank has one family that depends on two champions**, and it
cannot serve an arbitrary pair. `ability_cooldown_compare` holds **110 live
rows**, and its generator
(`quiz/generate_ability_cooldown_family._generate_comparisons`) pairs
champions by **alphabetical adjacency** — `zip(ults, ults[1:])`. The stored
pairs are therefore Aatrox–Ahri, Ahri–Akali, … : 110 of the 14,878 possible
pairs, and essentially never the pair a reader actually opened. Measured:

| pair | stored true-pair rows |
|---|---|
| Olaf vs K'Sante | **0** |
| Ahri vs Syndra | **0** |
| Jinx vs Caitlyn | **0** |
| Dr. Mundo vs Cho'Gath | **0** |
| Kai'Sa vs LeBlanc | **0** |
| Aurelion Sol vs Zeri | **0** |
| Gnar vs Jayce | **0** |
| Yone vs Sylas | **0** |
| Bel'Veth vs Rell | **0** |
| Aatrox vs Ahri | 1 *(alphabetically adjacent)* |

**A filter over the stored bank therefore cannot produce a matchup session.**
It can only produce two champions' questions side by side. That is the honest
fallback, not the product.

**The DATA for a real comparison exists for every champion.** The same
`champion_abilities` rows and the same `classify_cooldown` gate the stored
family already trusts cover the whole roster. So Step 12 **composes** the
comparison for the requested pair at request time from that authority, rather
than hoping someone pre-generated it — which is the pattern this codebase
already uses for Pro Play (`pro_authority.on_demand` +
`pro_play.quiz_session`): no bank, generate on demand, freeze on serve, grade
against the frozen instance.

**Mastery was inspected and is not the vehicle.** Its certified chains cover a
handful of champions (Ahri, Syndra, Lux, Jarvan, Olaf, Maokai); it cannot
compose an Olaf-versus-K'Sante comparison and was not bent into trying.

## The tiers

* **Tier A — true pair.** The question cannot be answered without knowing
  something about both champions. Composed.
* **Tier B — paired study.** Stored questions about champion A or champion B,
  one at a time, restricted to families where the champion is the question's
  **subject**.
* **Tier C — generic.** Not reachable. Every served question names A, B or
  both, and the session reports which tier it reached so the page can say so.

## Measured inventory, per pair

`TierA` is composed and deduplicated; `A-side`/`B-side` are stored subject
questions; `served` is the session length; `pairSrv` is how many of the served
questions were true-pair.

| pair | TierA | A-side | B-side | served | pairSrv | tier |
|---|---|---|---|---|---|---|
| Olaf vs K'Sante | 10 | 18 | 18 | 8 | 5 | pair_comparison |
| Ahri vs Syndra | 10 | 14 | 12 | 8 | 5 | pair_comparison |
| Jinx vs Caitlyn | 8 | 17 | 13 | 8 | 4 | pair_comparison |
| Aatrox vs Ahri | 16 | 27 | 14 | 8 | 8 | pair_comparison |
| Yone vs Sylas | 8 | 13 | 15 | 8 | 4 | pair_comparison |
| Dr. Mundo vs Cho'Gath | 14 | 14 | 19 | 8 | 7 | pair_comparison |
| Kai'Sa vs LeBlanc | 12 | 21 | 18 | 8 | 6 | pair_comparison |
| Aurelion Sol vs Zeri | 8 | 11 | 18 | 8 | 4 | pair_comparison |
| Bel'Veth vs Rell | 8 | 13 | 18 | 8 | 4 | pair_comparison |
| **Gnar vs Jayce** | **0** | 7 | 2 | **6** | 0 | **paired_study** |

Over 200 random roster pairs: **median session 8, minimum 8, none short**.
Gnar vs Jayce is the real sparse case — Gnar's transform kit passes no
comparison gate and Jayce has two stored subject questions — and it is
labelled **Two-Champion Study**, not a matchup.

## The route contract

`/quiz/matchup?a=<slug>&b=<slug>` — **two slugs and nothing else.**

No player, no team, no `match_id`, no game, no patch, no record. A parameter
the destination ignored would be a claim the session does not honour, and a
test asserts the query carries exactly `a` and `b`.

* Direct URL, refresh and a copied link all work: the pair is read from the
  URL on every mount.
* Back leaves the study cleanly and returns to the Explorer.
* The **session id is deliberately not in the URL** — a session is transient
  server state, and a shared link that resumed a stranger's half-finished
  session would be worse than one that starts fresh. Back to the same pair
  therefore starts a new session, by design.
* Malformed, missing, unknown and mirror pairs each fail with their own
  message and never fall back to a generic quiz.
* Existing `/quiz`, `/quiz/daily`, `/quiz/ranked`, `/quiz/daily-challenge`
  URLs are untouched.

## Identity is the slug, and there is still only one mapper

`championSlug` on the way out, `services.champion_docs` on the way in — the
mapper the Archives, Combat Lab, League Docs and the Explorer's own action row
already share. K'Sante, Dr. Mundo, Cho'Gath, Kai'Sa, LeBlanc and Aurelion Sol
all round-trip, each with a test.

**The three-way spelling difference is the trap this slice nearly fell into.**
`champions.name` says `Dr Mundo`; both the live bank and `champion_abilities`
say `Dr. Mundo` (likewise `Nunu & Willump` and `Renata Glasc`). Resolving to
the canonical spelling yields a session with **zero questions and no error** —
the quietest possible failure. The provider resolves through
`related_table_names` / `canonical_table_name`, and two tests exist purely to
keep it that way.

## Selection semantics

* Eligibility is read from **structured metadata**, never from rendered
  question text. `champion_name` for most families, `champion` for
  `combat_cooldown`.
* Tier B draws from an **allow-list** of five subject families:
  `ability_cooldown_rank`, `ability_cooldown_flat`, `combat_cooldown`,
  `champion_resource`, `champion_attack_type`.
* Beside it sits an explicit **deny-list** of champion-as-ANSWER families —
  `ability_recognition`, `which_champion_is_melee`, `which_champion_is_ranged`,
  `champion_highest_base_stat`. "Which champion is melee?" answers itself
  inside a session the player has been told is about two champions. The
  deny-list is written out rather than left implicit so a new
  champion-as-answer family cannot leak in by inheriting the allow-list.
* The **practice family gate and `is_active`** predicate are imported from
  `quiz.mode_gate`, not restated, so a family retired for Practice is retired
  here the same day.

## Duplicate-family prevention

Two rules, both measured against the owner directive on duplicate
computations:

1. **One question per (slot, rank) pair**, and rank 1 and max rank are the
   only ranks considered. Olaf Q is 9 s at every rank and K'Sante Q is 3.5 s
   at every rank: that is **one** question, not five.
   **The two shapes exhaust independently, and production taught this module
   that.** "Which comes back up first" asks for a WINNER; "what is the
   difference" asks for a GAP. Olaf W against K'Sante W is 16-vs-14 at rank 1
   and 12-vs-10 at rank 5 — two different stored value pairs, the same winner
   AND the same 2 s gap, so rank 5 asks nothing. Kai'Sa W against LeBlanc W
   keeps the winner and changes the gap, so rank 5 may still ask the gap and
   must not ask the winner again. The first deployed build signed a rank by
   its stored value PAIR, saw two different pairs, and a live session asked
   the same difference twice. Fixed in `6324c95d`.
2. **"Which is shorter" and "by how much" share a subject key.** They are two
   shapes over one fact, and the second gives the first away — a player told
   the gap between Olaf R and K'Sante R is 20 s has been told which is longer.
   A session serves one of them per (slot, rank) and takes the other rank
   instead.

Stored Tier B dedupes on `(family, champion, slot)`, so a session never asks
two ranks of the same ability.

## Fallback hierarchy and the sparse rule

True pair → paired study, alternating A/B. **There is no third step.** Nothing
outside the two champions is ever drawn, which is why Tier C is unreachable
rather than merely unlikely.

* Target session: **8** questions (`SESSION_TARGET`).
* Below **4** (`SESSION_MINIMUM`) the pool reports `below_minimum` so a caller
  can say so; a pool of zero raises `MATCHUP_NO_QUESTIONS` rather than opening
  an empty study.
* A sparse pair gets a **shorter session**, never a padded one.
* Balance is round-robin with a randomised start. It is not 50/50 when the
  inventory makes that impossible — Gnar vs Jayce runs 4/2 because Jayce has
  only two eligible questions — but one side cannot take a session over
  purely for having a larger bank.

## Two guards on comparison quality

* `MIN_COMPARE_RATIO` (imported from the stored family) drops a comparison
  that is a coin flip dressed as knowledge.
* `MAX_COMPARE_MULTIPLE = 10` drops one where the larger value is more than
  ten times the smaller. Bel'Veth R stores `1 / 1 / 1`; "is Bel'Veth R (1 s)
  or Rell R (120 s) shorter" is a champion-data defect wearing a question's
  clothes. The underlying row is not this module's to fix — the comparison
  simply declines it.

## Gate and entitlement behaviour — measured, not assumed

* `/quiz/matchup` is wrapped in `RequireRankedTutorial`, **exactly like its
  `/quiz` siblings**. A contextual study is ordinary free practice and
  inherits the policy rather than stepping around it. Nothing about the gate
  was changed.
* **A guest is never gated.** `evaluateRankedTutorial` returns
  `required: false` without a user, so the deep link works for a signed-out
  visitor — verified in a browser.
* **KNOWN GAP, deliberately not fixed.** A signed-in account with no
  `ranked_tutorial_completed_at`, while the admin setting
  `tutorial_completion_required_for_new_users` is on, is redirected by
  `<Navigate replace>` — which **drops the query string, and with it the
  pair**. There is no route-return infrastructure on that guard today, and
  adding one would change tutorial semantics for Ranked and Daily as well.
  That is out of this workstream's scope. The fix, when someone owns it, is a
  return parameter on the guard, not a second gate here.
* **Monetization is untouched.** The session is free, open to guests, reads no
  entitlement and writes none. No Premium-gated family is in the allow-list.

## Attempts, XP and history — stated plainly

A matchup study **does not record `quiz_attempts`, XP, streak or category
progress.** Half its questions have no `quiz_questions.id` to attribute an
attempt to, and giving a composed question a row would reintroduce exactly the
materialization the on-demand architecture removed. This is the same position
Pro Play Quiz already holds. It is a real product gap, not an oversight — see
"Next recommended slice".

## Files — Step 12

### Backend

| File | Role |
|---|---|
| `quiz/matchup/__init__.py` | The tier vocabulary and why a provider, not a filter. |
| `quiz/matchup/provider.py` | Pair resolution, composition, the stored allow/deny lists, the pool and its balance. |
| `quiz/matchup/session.py` | Freeze-on-serve, one grading rule, the TTL'd store. |
| `routes/quiz_matchup.py` | Three endpoints under `/api/quiz/matchup/`. |
| `api_server.py` | One `include_router`. |
| `test_quiz_matchup.py` | 42 tests against the real bank. |

### Frontend

| File | Role |
|---|---|
| `src/lib/quiz/matchupApi.ts` | The client, the typed error codes, `matchupStudyHref`. |
| `src/pages/quiz-matchup/QuizMatchupPage.tsx` | The study. Reuses `QuizAnswerOptions` / `QuizAnswerFeedback`. |
| `src/pages/quiz-matchup/QuizMatchupPage.test.tsx` | 15 tests. |
| `src/App.tsx` | One gated route. |
| `src/components/pro-play/dossier/MatchupStudy.tsx` | `Quiz This Matchup` in the action row. |
| `src/pages/pro-play/ProPlayMatchupTeam.test.tsx` | 3 new tests; the Step 10/11 "no quiz here" test updated with its reason. |

## Presentation

The contextual layer is **one line**: the two champion icons, `Olaf vs
K'Sante`, and a `Matchup Study` / `Two-Champion Study` badge. Everything below
it is the production quiz — the same answer grid, the same locked selection,
the same correct/incorrect reveal. There is no bespoke dashboard, because a
different content source should still produce an excellent NORMAL question.

The tier badge is not decoration: it prints what the **server actually did**,
so a session that could only draw one champion at a time can never be
described as a matchup.

Champion icons are resolved **server-side** by
`quiz.asset_metadata.resolve_champion_dir_by_name` and sent as paths, never
assembled from a display name by the client — macOS hides a case-wrong asset
directory that 404s on Linux, and two of the three alias spellings match no
directory at all.

## Tests and results

**Backend — 42 new, all passing** (`test_quiz_matchup.py`). Adjacent quiz
suites green: 165 passed across `test_quiz_matchup`, `test_dc1_phase8_promotion`,
`test_dc1_policy_reconciliation`, `test_pro_play_quiz`. Ranked/Daily isolation
measured as a failure SET: **20 failed / 207 passed, byte-identical to clean
`origin/master`** across the ranked, daily and quiz-integration suites.

**Frontend — 18 new.** Board suite **286 passed** (was 283). Full suite
**16 files / 71 tests failed, 10,484 passed** — and the **failure set is
byte-identical to clean `744102b8`**, re-measured in this worktree by
stashing. Compare failure SETS, never totals. Typecheck: **14 errors, none in
Step 12 files**. Build green.

## Real flows tested

Against a local backend on the real 1.07M-row corpus and the live bank:

* **Olaf vs K'Sante** played to completion, **every delivered question read
  and checked**: five true-pair comparisons, then Olaf / K'Sante / Olaf. The
  reveal is the production reveal, and the facts are right (Olaf W 16 s,
  K'Sante W 14 s at rank 1).
* **Gnar vs Jayce** (sparse) — 6 questions, correctly labelled
  `TWO-CHAMPION STUDY`, no unrelated question.
* Ahri vs Syndra, Dr. Mundo vs Cho'Gath, Kai'Sa vs LeBlanc, Aurelion Sol vs
  Zeri, Ornn vs Ambessa — all open a real pair session.
* Direct URL, refresh, Back, mirror pair, unknown champion, missing opponent.
* **Mobile 375 px**: no horizontal overflow (`scrollWidth === clientWidth`),
  header wraps, options full width.

**NOT tested end-to-end in a browser: the click itself.** The Matchup Explorer
is admin-gated and this session held no admin credentials, so the
Explorer → Quiz click could not be driven live. The action row's rendering,
its href, its exact query keys and its mirror refusal are covered by the board
suite, and the destination that href points at was opened and played in a real
browser. Somebody with a key should click it once.

## Performance

Session start: **0.118–0.124 s** for every pair measured, cold. The pair
filter is a single gated scan of the ability rows plus one indexed bank read;
no pathological scan, and no cache was added because none was needed.

## A defect this audit surfaced and did NOT fix

The live `champion_resource` family contradicts `champion_metadata.resource_type`
for **23 of 172 champions** — Gnar is answered "Mana" (authority: Rage), Shen
"Mana" (Energy), Renekton / Tryndamere / Shyvana / Rek'Sai "Mana" (Fury). The
generator appears to key off `champion_stats.mp` instead of the resource
authority. **This is already live in ordinary Practice today**; Step 12 only
makes it visible in one more place. It belongs to the CHAMPDATA correction
lane, which has an established blast-radius procedure for frozen copies, and
was left alone rather than half-fixed here.

## Deploy state — Step 12

| | SHA | Where |
|---|---|---|
| Backend | `7a0bf439` + `6324c95d` | **pushed to `master`**, Railway auto-deployed, **verified live by real requests** |
| Frontend | `b29ebaa7` | rebased onto `3c087a0d`, **pushed to `main`**, **NOT published** |

**How the deployed backend was verified, since this service has no
deployed-SHA endpoint.** `/api/version` returns a static string and proves
nothing. Two independent checks instead:

1. `railway ssh` into the running container and read the source —
   `quiz/matchup/provider.py` contains `may_ask_winner`, which exists only in
   `6324c95d`. `6324c95d` is an ancestor of `origin/master`.
2. A behavioural marker that separates the two builds. Dr. Mundo W against
   Cho'Gath W repeats BOTH its winner and its 6-second gap across ranks 1 and
   5, so the pre-fix build offered a rank-5 W comparison and the fixed build
   must not. Over six production sessions: **rank 5 absent, every time.** And
   across sixteen sessions over four pairs, **no session asked the same
   (shape, ability, answer) twice.**

**A caution for whoever verifies this next.** The first probe written for
this reported the duplicate as still present, and it was wrong: it matched on
shape and ability and ignored the ANSWER, so it flagged Dr. Mundo E at rank 1
(gap 1 s) beside rank 5 (gap 2 s) — two different facts the fix deliberately
keeps. A duplicate here means the same ANSWER twice, not the same ability
twice.

### Verified in production, by playing it — not by a route probe

`POST /api/quiz/matchup/sessions` on `web-production-83e53.up.railway.app`
answered 200 in **0.34–0.40 s** and three sessions were played to completion:

* **Olaf vs K'Sante** — 8 questions, 5 true-pair naming both champions, then
  K'Sante / Olaf / K'Sante. No repeat.
* **Gnar vs Jayce** — 6 questions, `paired_study`, nothing outside the pair.
* **Dr. Mundo vs Cho'Gath** — 8 questions, the alias spelling resolved, 7
  true-pair.

`MATCHUP_SAME_CHAMPION`, `MATCHUP_UNKNOWN_CHAMPION` and
`MATCHUP_INCOMPLETE_PAIR` each returned their own status and code.
`/api/quiz/sets`, `/api/quiz/questions?category=` and `/api/quiz/taxonomy`
all still answer 200 — Practice, Ranked and Daily are untouched.

**The first production play-through is what found the duplicate-shape
defect.** A route probe would have reported success. Play the questions.

**DEPLOY ORDER IS NOT OPTIONAL HERE, unlike Step 6.** The frontend route calls
an endpoint that does not exist yet. `POST /api/quiz/matchup/sessions` must be
live on Railway **before** the frontend is published, or `Quiz This Matchup`
leads to "Matchup study is unavailable right now." The backend change is
purely additive — one new router, one new package, no existing route, table or
payload touched — so it is safe to ship first and safe to sit alone.

**The frontend is pushed to `main` and NOT PUBLISHED.** Publishing is the
owner's click in Lovable; a push is not a publish. Until that click,
`Quiz This Matchup` does not appear on `mogzy.lol` — the backend it needs is
already live, so the click is the only remaining step and there is no
ordering hazard left in either direction.

## Next recommended slice

**Decide whether a contextual study should count.** The honest next question
is not "more question families" — it is whether finishing an Olaf vs K'Sante
study should move the player's XP, streak and category mastery the way ten
Practice questions do. Today it does not, and cannot, because half its
questions have no row to attribute an attempt to. Answering that means
deciding whether `quiz_attempts` can accept a question identified by a frozen
instance rather than a `quiz_questions.id` — a question Pro Play Quiz has open
too, and one worth answering once for both rather than twice.

Do **not** add more Tier A families first. One more comparison shape is more
of the same claim; making the session count is a new one.
