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
| Backend | `PENDING` | `master`, Railway auto-deploys |
| Frontend | `PENDING` | `main`, Lovable publish is the owner's click |

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
