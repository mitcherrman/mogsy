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
  *(this document)*

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
condition is still not met.

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

## Next task

1. **Step 5 — the game state**, scoped in "Next recommended slice" above.
   Step 4 shipped the series slice this list used to name.
2. **Delete the `teams_outside_focus_set` mirror** once the frontend carrying
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
