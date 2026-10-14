# Public Knowledge Stats V1 — Product spec

Date: 2026-10-13

## Product promise

`/lol/stats` is a public, read-only view of how Mogzy players collectively
perform on safely attributable League knowledge. It shows answer volume before
accuracy, keeps uncertainty visible, and never implies that partial historical
coverage is complete.

## Information architecture

The page is deliberately one destination:

1. Hero: plain-language purpose, total human answer count, history start, and
   visible methodology link/summary.
2. URL-backed mode rail: All, Practice, Time Trial, Daily, Role Challenge,
   Ranked, and Journeys. Empty or unavailable modes remain visible.
3. Overview: answers, accuracy, safely attributed answer coverage, and
   recorded timeouts.
4. Mode ledger: answer/accuracy/timeout status for every mode, including honest
   unavailable states.
5. Entity explorer: text search plus champion/item/rune/spell filters. Rows are
   ordered by answer count from the API, not by the highest small-sample rate.
6. Methodology and coverage: minimum sample, bot exclusion, timeout treatment,
   unattributed history, and unavailable sources.

Champion and item rows link to their existing Mogzy archive destinations.
Rune and summoner-spell rows remain non-links until an owned destination
exists.

## Statistical presentation

- Accuracy is descriptive for every non-empty entity row.
- `rank_eligible` is the only permission to rank; V1 requires 20 answers.
- Confidence labels are API-owned: insufficient, emerging, established,
  strong.
- Answer coverage is `attributed_answers / answers`, not entity-attributions
  divided by answers; comparison questions can produce multiple entity rows.
- Timeouts are recorded events displayed separately, never incorrect answers.
- Unsupported or missing frozen identity stays unattributed.

## States and accessibility

- Loading uses stable skeleton blocks rather than synthetic statistics.
- API failure gives a clear retry action and never substitutes sample data.
- An empty mode explains that no durable eligible answers exist yet.
- An empty entity filter explains that no safely attributed rows match.
- Controls are native buttons/inputs with labels, visible selected state, and
  keyboard focus inherited from the shared application styles.
- The entity table collapses to a compact two-column card layout below the
  small breakpoint; no horizontal table scroll is required.

## API dependency

The page consumes `GET /api/public/knowledge-stats/v1` with an optional exact
`mode` query. React Query caches each schema-version/mode tuple for five
minutes and retries once. `VITE_COMBAT_API_URL` remains the single API-origin
authority used by other Combat Lab features.

## Release sequence

1. Backend review and merge.
2. Backend staging deploy; validate schema version, each mode filter, exact
   entity coverage, latency, and public CORS behavior.
3. Desktop and mobile browser smoke check against that staging API.
4. Frontend review and merge.
5. Frontend deploy, then verify the route directly and via normal navigation.

No navigation promotion is included in this candidate. Add the hub/sidebar
entry only after the live API check, using the owning navigation surface.

## Rollback

Remove the `/lol/stats` route, prefetch entry, page, client, and tests. No user
or production data changes are involved.
