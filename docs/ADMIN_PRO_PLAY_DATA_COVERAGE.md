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

**Merged to `main` (`55b31e2f`) — NOT LIVE.**

Pushed 2026-09-09. Production's main bundle
(`/assets/index-B9L9ushQ.js`) was polled every 30s for 30 minutes afterwards
and its hash never changed; it still contains no `pro-play-coverage`
reference. Lovable did not publish automatically. **The owner must press
Publish in Lovable** — the same trap this repo has hit before (Graph1 Phase F,
Pro Play Step 2, the hub Premium module).

`https://mogzy.lol/admin/pro-play-coverage` answers 200 today only because it
is a SPA index; the route does not exist in the deployed bundle.

Verified so far: 17 new tests green on the `origin/main` base, `vite build`
clean (`AdminProCoverage-*.js`, 14.94 kB), and the route/gate/registry
agreement suites green. Live desktop and narrow-viewport verification against
real production data is BLOCKED until the publish fires, and has not been
done.

## Next task

Return to the Pro Play / Matchup Explorer workstream — **not** the public stats
table. Next is enriching the existing player × champion dossier with KDA and a
small selected set of the newly available historical OE stats.
