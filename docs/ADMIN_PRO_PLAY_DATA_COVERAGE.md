# Admin · Pro Play Data Coverage

## Objective

Give the owner one internal page that answers "how complete is Mogzy's
historical pro-play authority, and why is the rest missing?" without reading
`OE_STATS_HANDOFF.md` (backend repo) or opening SQL.

Operational tooling, not a stats experience. It is deliberately styled in the
existing Mogzy admin language — no dossier, no hub, no marketing KPI wall.

## Route

`/admin/pro-play-coverage` — inside the `AdminShell` layout route, wrapped in
`AdminRoute roles={["master_admin"]}`, exactly as `/admin/users` and
`/admin/demo-analytics` are. No public route, no sitemap entry, `noindex`.

Navigation is registry-driven: the page appears under **Game Data › Pro Data**
via its `ADMIN_TOOLS` entry (`id: "pro-data-coverage"`), and therefore also in
All Tools and search. No bespoke nav was added.

## Files changed

| File | Change |
| --- | --- |
| `src/lib/admin/proCoverageApi.ts` | **new** — read-only client, types, formatters |
| `src/pages/admin/AdminProCoverage.tsx` | **new** — the page |
| `src/pages/admin/AdminProCoverage.test.tsx` | **new** — rendering / failure suite |
| `src/pages/admin/AdminProCoverage.route.test.tsx` | **new** — gate + exposure suite |
| `src/App.tsx` | lazy import + one route inside the admin shell |
| `src/lib/admin/admin-registry.ts` | one `ADMIN_TOOLS` entry |

Nothing else was touched. No backend change was needed.

## Backend endpoints consumed

```
GET /api/admin/pro-coverage/summary
GET /api/admin/pro-coverage/by-league?limit=500
```

Both already existed behind `require_admin`. Credentials come from the shared
`buildAdminHeaders()` in `lib/admin-auth/adminCredentials`, so this uses the
same authorization path as `adminOpsApi` and every other admin client. The
page performs no writes and the endpoints have none.

`/buckets` and `/by-year` are not called: `/summary` already carries both.

## Key semantics

**The 60-row trap.** `/summary` caps `by_league` at 60 rows *sorted by missing
count* — a worst-offenders list, not the league universe. Rendering it as the
league table would hide every fully-covered league. The page therefore reads
`/by-league?limit=500` and uses `summary.by_league` for nothing. A test pins
this: the fixture's fully-covered league exists only in the by-league answer.

**Two sources, one authority.** Leaguepedia is canonical for historical game
and result identity; Oracle's Elixir is statistical enrichment layered on top
and never overwrites a canonical result. The ~147 games where the two disagree
on a winner are a *diagnostic*, so they render as one line of text under the
totals, not as a warning banner.

**Named denominators.** The same numerator over the source, canonical and
OE-eligible corpora gives three different coverage figures, so both
`pct_of_canonical` and `pct_of_oe_eligible` are shown, each labelled with its
denominator. Nothing is presented as an unqualified "coverage %".

**Honest empties.** A year with no OE-eligible games shows `—`, not `0.00%`.
A `503` from the backend (promotion pipeline has not run on that deployment)
is reported as "no promoted pro-play corpus yet" rather than as zeros that
read like data loss.

**Partial failure.** The two reads are settled independently, so a failed
league read still leaves the totals on screen, and vice versa.

## Page content

* **Totals** — canonical / enriched / missing games, coverage of canonical and
  of OE-eligible, OE-eligible games, player and team stat rows, source games,
  upstream OE games. Compact metric tiles.
* **Why games are missing** — the mutually exclusive canonical buckets with
  their server labels and bucket ids, plus upstream OE games by attribution
  outcome (`reason` / `oe_games` / `attributed`).
* **By year** — canonical, OE eligible, matched, missing, coverage.
* **By league** — the same columns plus league group, from the full endpoint,
  with a client-side name/group filter over the already-fetched rows (no
  refetch) and a 40-row "Show more".
* **Largest missing contributors** — league × year × reason.

No K/D/A coverage or earliest/latest enriched date is shown: the current
contract does not return either, and inventing a field was not an option.

## Filters

One: a text filter over the fetched league rows. Year and league are the
groupings the backend supports cleanly; no server-side filter parameters are
sent beyond `limit`, and no large result set is downloaded to fake filtering.

## Tests

`AdminProCoverage.test.tsx` (10) — loading state; top totals incl. the derived
missing count; year table incl. the `—` for a pre-OE year; **league table
built from `/by-league?limit=500`, asserted on the request URL and on a league
absent from the summary fixture**; missing-reason buckets with their real
labels; the disagreement note and its "Leaguepedia remains canonical" wording;
503 → error instead of zeros; partial failure; 403 → refusal with no stack
trace; filtering without refetch.

`AdminProCoverage.route.test.tsx` (7) — master_admin renders; plain admin
refused; signed-out refused; the App.tsx route line carries the master_admin
gate; the registry advertises it under Game Data › Pro Data; no public
navigation exposure.

## Status

**LIVE AND VERIFIED on mogzy.lol, 2026-09-09.**

Lovable published after the owner pressed Publish; the push alone did not
deploy (the bundle sat unchanged for 30+ minutes first).

**Bundle proof.** Production's entry chunk moved
`index-B9L9ushQ.js` → **`index-CLIsGg1K.js`** and now references the lazy
chunk **`AdminProCoverage-D4kXWY0B.js`** (200, 14,965 B). That chunk contains
`\`/api/admin/pro-coverage/by-league?limit=${w}\`` with `w=500`, the summary
path, the "Leaguepedia remains canonical" copy and the 503 wording.

**Route proof.** `/admin/pro-play-coverage` renders inside the admin shell for
the owner (master_admin), title `Mogzy Admin · Pro Play Data Coverage`, with
Game Data selected in the sidebar. The two backend reads answered **200**:
`/summary` and `/by-league?limit=500`. `/summary` is slow — roughly 25–35 s in
production — so the page sits on its loading state for a while; `/by-league`
returns in a couple of seconds. That is the reconciliation query's cost, not a
frontend defect.

**Production numbers rendered** (these have moved since the backend handoff
was written — treat that document's figures as of its own pass):

| | live |
| --- | --- |
| Canonical games | 118,429 |
| Enriched games | 94,301 |
| Missing games | 24,128 |
| Coverage of canonical | 79.63% |
| Coverage of OE-eligible | 80.96% |
| OE-eligible games | 116,480 (2014 onward) |
| Player stat rows | 896,344 |
| Team stat rows | 188,602 |
| Source games | 129,405 |
| OE upstream games | 99,842 |
| Source disagreements | **178 games / 314 of 188,602 rows** |

The handoff's 182,108 compared rows and 147 disagreeing games are stale; the
corpus grew. `unresolved_team` is **0** live, confirming the team-identity
recovery held.

**The 60-row trap, proved in production.** The league table reports
**"Showing 40 of 323 leagues"**. Summary would have shown 60. The full
universe is 323.

Year table: 16 rows, 2011–2026, with `—` for 2011–2013 (pre-OE) and real
percentages from 2014 (41.30%) to 2026 (90.46%). Buckets: 8 rows. Attribution
outcomes: 5 rows. Top missing contributors: 20 rows.

**Gating, live.** A session-less browser requesting
`https://mogzy.lol/admin/pro-play-coverage` is **redirected to `/`** with zero
coverage nodes in the DOM. Both backend endpoints answer **403** to an
unauthenticated request. Navigation is correct: Game Data › Pro Data lists the
tool with its `master_admin` badge, and All Tools includes it.

**Desktop.** 1920×872: no horizontal page scroll, tiles on a 4-column grid,
every table inside its own scroll frame.

**Narrow viewport.** Chrome would not honour a resize on the owner's window, so
this was measured with Playwright at a real **390×844** viewport against the
*same built bundle* served locally, with the session and the coverage payload
supplied by route interception (production-shaped fixture; the live desktop run
above is the real-data proof). Result: `documentElement.scrollWidth === 390`,
**no page-level horizontal scroll**; metric tiles fall back to 2 columns; all
six tables scroll inside their own frames and the league frame scrolls its full
308 px extent, so the right-hand columns are reachable; 16 year rows, 8 bucket
rows, 5 reason rows, 40 league rows all present. Screenshots confirm no
clipping.

**Console/runtime.** Zero console messages of any level across a full
production load, and zero `pageerror`/`console.error` in the Playwright run.

**Regressions.** None. `/admin`, `/admin/all-tools` and `/admin/game-data`
render normally.

**Fixes needed:** none. One inert cosmetic detail was measured and left alone:
the `-mx-1 px-1` scroll frame makes its wrapper report a 4 px overflow, which
never clips because the wrapper's overflow is visible and the page itself does
not scroll horizontally.

## Next task

Return to the Pro Play / Matchup Explorer workstream — **not** the public stats
table. Next is enriching the existing player × champion dossier with KDA and a
small selected set of the newly available historical OE stats.
