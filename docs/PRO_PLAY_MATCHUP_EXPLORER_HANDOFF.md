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
  matchup, and clickable side journeys into each of them. *(this document)*

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

**The focus-set limit is reported, not worked around.** See *Known limits*.

## Relevant files

### Backend — `/Users/macmoney/League_Combat_Simulator` (`master`, Railway)

| File | Role |
|---|---|
| `pro_authority/exact_matchup.py` | Step 3 authority. The one pass, the exact filter, the alternates and their ranking. |
| `pro_authority/player_dossier.py` | Step 2 authority. Team opponent axis, ban pressure. Untouched by Step 3. |
| `pro_authority/comparison.py` | `GameIndex`, `admits_game`, `CURATED`, `CONTRACT_VERSION`. Both of the above read it. |
| `pro_authority/comparison_scope.py` | The four product scopes and the participation vocabulary. |
| `pro_authority/matchup.py` | The board, `/contract`, and `worlds_focus` — the focus-set gate. |
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
| `src/pages/pro-play/ProPlayMatchupTeam.test.tsx` | 103 board/dossier/study tests. |

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

Step 3 is **complete and committed**, and covers everything the brief asked
for: exact same-game semantics, the always-present zero state, Other Pro
Examples at every sample size, and clickable side journeys.

| | Backend | Frontend |
|---|---|---|
| Branch | `proplay/step3-exact-matchup` | `proplay/step3-exact-matchup-fe` |
| Worktree | `/Users/macmoney/lcs-wt-proplay-step3` | `/Users/macmoney/mogsy-wt-proplay-step3` |
| Commit | `3dff01d5` | `58ca533a` |
| Base | `origin/master` `a972f129` | `origin/main` `38fd0b87` |

## Tests

**Backend — 42, all passing.** The hand-built fixture writes every *near miss*
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

* **The focus set bounds side journeys, not the examples.** The board accepts
  sixteen curated teams; the examples come from the whole corpus. Two of six in
  the live T1-vs-Gen.G case are outside it. They are served with
  `explorer_navigable: false` and rendered as evidence rather than hidden —
  hiding them would quietly redefine "other professional examples" as "other
  focus-set examples". Widening the board's team selector would close this.
* **No combat statistics.** The corpus has no kills, deaths, assists, CS, gold
  or damage, and they were ruled out by design. `unavailable_metrics` names the
  gap. The Oracle's Elixir enrichment workstream may make richer fields
  available later; this feature can consume them then, and must not mix
  partial LIVE1 stats with historical data to simulate completeness.
* **The chooser is bounded by the board's pool fetch.** Pools are fetched for
  the top candidates per lane (`notes.pool_bound`); a candidate with
  `pool_omitted` offers no champions in the study, and the section says so.
* **Teams shown for an example come from its most recent meeting.** A pair who
  met across a transfer shows the newest pairing, which is the one a reader is
  placing. The record still counts every qualifying game.
* **A mirror matchup yields both directions**, which is correct and tested.

## Next task

Nothing in Step 3 is outstanding. Natural next layers, in rough order:

1. **Widen or explain the board's team selector** so more side journeys land.
   This is the single biggest limit on the graph the examples imply.
2. **The pretty-URL architecture** (`/matchup/t1-vs-geng/top/doran-olaf-vs-kiin-ksante`).
   Deliberately deferred: the study now proves the state is fully addressable,
   so this is a rename rather than a redesign.
3. **Consume richer Oracle's Elixir fields** in the study once they are
   canonical — only historical ones, never mixed with LIVE1.

Explicitly **out of scope** for this workstream and still is: Comparison Lab,
custom opponent cohorts, Champion Archives actions, Combat Lab / Quiz deep
links, specific-game review UI, monetization or access changes, prediction
models, and anything in Ranked / RR1 / LIVE1 infrastructure.
