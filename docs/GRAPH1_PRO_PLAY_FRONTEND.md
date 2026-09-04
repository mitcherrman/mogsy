# GRAPH1 Phase F — Explore Pro Data (frontend)

> **Status: merged, NOT published.** `f5c60be1` is on `origin/main`
> (fast-forward from `d96708ab`, 2026-09-03). The site is a separate step:
> mogzy.lol publishes through Lovable (Share → Publish) and **a git push does
> not trigger it**. Verified after the push — `/lol/pro-play/graphs` still
> renders the 404 page live, and no deployed bundle contains "Explore Pro
> Data". Everything below was verified locally against the LIVE production
> backend; none of it has been verified on the live site, because the live
> site does not have it yet.

The product surface for GRAPH1. Backend Phases 0–E shipped the four canonical
families, bans, server-side scopes and ratio boards; Phase F is the first phase
to touch `~/mogsy`, and it changed **discovery, selection, URL state and query
construction only**. The race engine, `raceIndex.ts`, the payload contract, the
Remotion composition and the goldens were not touched.

---

## Route

| Route | What it is |
|---|---|
| `/lol/pro-play/graphs` | **Explore Pro Data** — the product surface. |
| `/dev/graph1` | The operator route, unchanged. Fixed races, the stat families and the `?api=` backend override live here. |

`/lol/pro-play` gained a second module tile ("Explore Pro Data"); the quiz tile
and `/lol/pro-play/quiz` are untouched, as is `/lol/pro` (the subscription page).

The two surfaces coexist deliberately: the operator page exposes things a reader
has no use for (legacy fixed races, `champion-stat-growth`, an API override),
and the product page exposes nothing internal at all.

## The builder model

A reader picks a **focus**, a **counterpart** and a **metric**. Family ids never
reach the screen or the URL. `src/graph1/builder.ts` enumerates the four
combinations that exist, so the UI cannot compose a key the backend has no
family for:

| Focus | Compare | Family key |
|---|---|---|
| Player | Champions they play | `player-champions:<lp_page>` |
| Team | Champions they play | `team-champions:<team_key>` |
| Champion | Players who play it | `champion-players:<slug>` |
| Champion | Teams that play it | `champion-teams:<slug>[:bans]` |

`Player → Teams` and `Team → Players` are **not** offered: no such family exists.

**The bans key is parsed off the LAST separator**, matching the backend.
`parseFamilyDatasetKey` splits on the FIRST one, so a bans key arrives as
entity `"kaisa:bans"`; getting this wrong graphs `kaisa:bans` as a champion
slug and 404s.

## Metric controls

Enumerated per combination and mode. The frontend never decides a denominator —
this list exists so a reader is not handed a control whose only outcome is a
409.

| Combination | Race | Board (ratio) |
|---|---|---|
| Player → Champions | Games, Wins | Win rate, Champion share |
| Champion → Players | Games, Wins | Win rate, Share |
| Team → Champions | Picks, Wins | Win rate, Champion share |
| Champion → Teams (picks) | Picks, Wins | Win rate, Share |
| Champion → Teams (**bans**) | Bans | Ban rate |

A ban graph offers **no wins and no win rate**: a banned champion was never
played, so both are undefined and the backend 409s on them.

**Race vs board is decided by the metric.** A monotonic total goes to
`RacePlayer`; a ratio goes to `StatBoardExplorer` via `?metric=` and comes back
as a `ranked-snapshot`. A ratio is never animated — it falls as often as it
rises, so bars would shrink and rank order would churn mid-race.

### "Wins" is a client-side view, not a request

The backend declares BOTH count metrics on one race payload
(`controls.metrics`), because the wins race is fully determined by the games
race: every event carries `winsDelta`. `src/graph1/winsRace.ts` keeps the events
where it is 1 and relabels the metric **with the spec the backend declared**.
Filtering happens before indexing, so the engine, cadence, colors and Remotion
are untouched — and switching metric issues no request.

## Scope controls

`src/graph1/scope.ts`. Choosing a scope builds **backend query parameters**; it
is not a pass over a downloaded race. Measured against production:

| Graph | Payload |
|---|---|
| Faker, all pro | 520 KB |
| Faker, Worlds (league) | 64 KB |
| Faker, Worlds 2024 (tournament) | 2 KB |
| Azir, all pro | 2.25 MB |
| Azir, LCK | 378 KB |

Surface: **All Pro Play / Major Pro** and **League** are always visible; region,
tournament, patch and dates sit behind "More filters", which opens itself when
a shared link already uses one. Scopes compose (LCK + patch 16.15 + major).

Two rules the type system enforces:

1. **There is no raw/unfiltered scope.** The empty scope means the backend's
   broad professional universe — itself a filtered universe. `Graph1Scope` has
   no field that can express `apply_policy=False`, and a test asserts the exact
   field set. "All Pro Play" is the widest thing a user can ask for.
2. **Values are exact canonical identities.** `league=LCK` matches nothing;
   `league=LoL Champions Korea` matches. Only the *label* is friendly.

Options come from `GET /api/graph1/scope-values` — 37 leagues, 820 tournaments,
19 regions, 233 patches, never a hardcoded list, and only values with
qualifying data. Patches are returned chronologically (by the backend's numeric
`patch_sort`, so 16.9 precedes 16.10) and rendered newest-first.

Internal names (`MAJOR_PRO`, `PRO_TEAM`, `pro_broad_v2`) appear nowhere. The
public spelling of the highlight is `major=1`.

**The client-side filter panel is hidden here** (`RacePlayer showFilters=false`,
default `true` for the operator page). Since scope is a server-side predicate, a
second set of filters could only narrow what was already downloaded, duplicating
backend eligibility logic and quietly disagreeing with it.

## URL contract

```
/lol/pro-play/graphs
  ?focus=player|team|champion
  &vs=champions|players|teams
  &e=<canonical entity id>
  &mode=bans                       (champion→teams only)
  &metric=games|wins|bans|winrate|share|banrate
  &major=1
  &league=…&tournament=…&region=…&patch=…      (exact canonical values)
  &from=YYYY-MM-DD&to=YYYY-MM-DD
  &top=…&off=…                     (race controls)
  &order=…&rows=…&find=…           (board controls)
```

Defaults are omitted, so a shared link carries only what the sharer changed.
Parsing is **total**: a hand-edited URL degrades to a valid graph, never an
error page. `?d=<dataset key>` is accepted as an alias, so a pre-Phase-F
operator-page link still opens a graph here.

Changing *what* is graphed **pushes**; nudging a control **replaces** — so Back
walks the graphs a reader looked at, not every slider tweak.

## Featured content

`src/graph1/featured.ts` — 12 cards, every one verified against production.
Major-pro leads; **GAM Esports and Anubis Gaming are deliberate**, because
Mogzy's corpus is not four regions and a featured surface showing only majors
would say otherwise.

Cards are **questions, never conclusions** — a title asserting "Faker dominates
X" would go stale silently the next time the data moved. A test enforces this.

`defaultCardFor()` supplies the per-focus default, replacing the old hardcoded
`FAMILY_DEFAULT_FOCUS` map: it is default *configuration* derived from the
verified card list, not a product limitation.

## Team identity

`SK Telecom T1` and `T1` remain **two separate options** with zero games in
common. Lineage is not merged and `renamed_to` is never followed. Team media is
the backend's own `short` code through the existing `initials` ladder — no
external logo fetching, no logo asset project. The short code is **display
only**: `TSM` and `Team Same Mordeczki` share one, so it is never a key.

## States

| State | Behaviour |
|---|---|
| Loading | Per-surface. A failing scope list never blocks the graph. |
| Zero results | "No qualifying pro games for this combination." plus a "Show all pro play" action. **Not an error** — Kai'Sa at a given MSI may legitimately have zero picks. |
| 400 | "That combination is not something we can graph." |
| 404 | "We could not find that player, team or champion in professional play." |
| **409** | "This rate is unavailable for this scope: the underlying ban coverage is incomplete, so the number would be misleading." **Never softened into a plausible-looking number** — the point of the refusal is that no trustworthy figure exists. |
| 5xx | Ordinary retry copy. |

4xx responses are not retried: they are the backend's final answer.

## Board wording (a fix, not a feature)

`StatBoardExplorer` and `statBoardTitle` hardcoded "champion". A Phase-E ratio
board reuses that contract to rank **teams and players**, so the board said
"12 champions ranked" over a list of teams. Both now read
`definition.rankedEntityType`, defaulting to the champion wording so no stat
board moves.

`Graph1MetricId` also never learned Phase D's `cumulative_bans` or Phase E's
ratio ids; the union was widened to match the payloads the backend already
ships. No payload contract changed.

## Remaining Graph1 product work

- **A wins-ranked race is derived client-side.** Honest and exact, but it means
  the wins race is bounded by whatever the games payload contains. A backend
  race `metric=` parameter would let a scoped wins race be fetched directly.
- **Concepts §14 #8, #14–16, #18, #21–25** (most-banned champions overall,
  opponents faced, distinct-champion counts, role filters, per-patch presence)
  still have no family. Each needs backend work; none is blocked by the
  frontend.
- **Champion → Patches presence** (§14 #11), the canonical esports chart, needs
  a family whose ranked entity is a patch.
- The featured list is a static module. If it grows past ~12 cards it wants a
  backend-served catalog rather than more entries here.
