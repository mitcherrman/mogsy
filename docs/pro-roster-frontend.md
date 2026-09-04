# Pro Roster frontend (`/lol/docs/pro/*`)

Public, read-only roster wiki for League esports identity data: canonical
players, canonical teams, their aliases, and dated team memberships.

There was no prior `PRO_ROSTER_FRONTEND.md` in this repository — this file is
the first frontend documentation for the roster surface. Its sibling is
[`ranked-public-frontend.md`](./ranked-public-frontend.md).

---

## Routes

| Route | Page component | Purpose |
| --- | --- | --- |
| `/lol/docs/pro/rosters` | `ProRosterLanding` | Entry point: what roster data exists, coverage summary, search, links into both directories |
| `/lol/docs/pro/players` | `ProRosterPlayers` | Paginated player directory with server-side search |
| `/lol/docs/pro/players/:lpPage` | `ProRosterPlayerProfile` | One canonical player: identity, aliases, team memberships |
| `/lol/docs/pro/teams` | `ProRosterTeams` | Paginated team directory with server-side search |
| `/lol/docs/pro/teams/:lpPage` | `ProRosterTeamProfile` | One canonical team: identity, aliases, historical names, roster memberships |

Declared in [`src/App.tsx`](../src/App.tsx); lazily bound through
[`src/lib/route-prefetch.ts`](../src/lib/route-prefetch.ts), which also warms
neighbouring chunks on hover/idle.

### `/lol/pro` is a different thing and must stay that way

- **`/lol/premium`** — the **paid** Mogzy Premium subscription/product page
  (`LolPremium`). Renamed from `/lol/pro` on 2026-09-04; `/lol/pro` and `/pro`
  are redirects. See `docs/naming-premium-vs-pro-play.md`.
- **`/lol/docs/pro/**`** — **public** esports data and documentation.

`App.proRosterRoutes.test.ts` pins this: it asserts `/lol/pro` still renders
`LolPremium`, that no roster route lives under `/lol/premium`, and that no roster route
is wrapped in `ProtectedRoute`/`AdminRoute`.

---

## API contracts used

Base URL is the shared `VITE_COMBAT_API_URL` via
`COMBAT_API_BASE_URL` — the roster client adds **no** new environment variable
and **no** fallback URL of its own. Client:
[`src/lib/league-docs/roster-api.ts`](../src/lib/league-docs/roster-api.ts).

| Endpoint | Used by | Notes |
| --- | --- | --- |
| `GET /api/docs/pro/roster/coverage` | Landing | Totals + the backend's `disclosure` string, rendered verbatim |
| `GET /api/docs/pro/roster/search?q=` | Landing search, 404 suggestions | `q` is 1–80 chars; empty `q` is a 422. Caps at 20 results |
| `GET /api/docs/pro/roster/players` | Player directory | `page`, `page_size` (≤100), `query` |
| `GET /api/docs/pro/roster/players/{page}` | Player profile | `eligibility`, `include_warning`; embeds the full membership list |
| `GET /api/docs/pro/roster/teams` | Team directory | `page`, `page_size`, `query`, `region` |
| `GET /api/docs/pro/roster/teams/{page}` | Team profile | Same as players, plus `historical_names` |
| `GET /api/docs/pro/roster/players/{page}/memberships` | *(client only)* | Paginated variant — wrapped in the client, not used by a page (see Known limitations) |
| `GET /api/docs/pro/roster/teams/{page}/memberships` | *(client only)* | Same |

Note the parameter is `query` on the directory endpoints but `q` on
`/search`. There is **no** `limit` parameter — passing one is silently ignored;
the page size parameter is `page_size`.

### Response shapes worth knowing

- Directory rows: `{ page, display_name, country|region, primary_role?, membership_count }`.
- Membership rows: `{ membership_key, player_page, player_display_name,
  team_page, team_display_name, region, role, start_date, end_date,
  start_precision, end_precision, is_active, source_url, eligibility_level,
  warning_code, reason_codes }`.
- `role` uses semicolon notation for multi-role stints (`"Jungle;Mid"`).
- `end_precision: "open"` with `end_date: null` means *still ongoing* — rendered
  as `→ present`, never as a fabricated date.
- Detail endpoints return **all** memberships inline (no pagination) plus
  `eligibility_shown` and `hidden_count`.

---

## Level A / B / C behaviour

The backend is authoritative. **No eligibility logic is reimplemented here.**

| Level | Meaning | Frontend behaviour |
| --- | --- | --- |
| **A** | Public, quiz-safe | Requested by default (`eligibility=A`). Shown with no warning styling |
| **B** | Public only with warning context | Requested **only** after an explicit user opt-in (`eligibility=AB&include_warning=true`). Rendered amber, tagged `Level B`, and labelled with the backend's own `warning_code` |
| **C** | Internal / review only | **Never requested, never rendered, never in frontend state.** The API itself rejects it: `eligibility=C` → `422 "eligibility must be 'A' or 'AB'; Level C is not public"` |

`RosterEligibility` is typed `"A" | "AB"` — Level C is *unrepresentable* in the
client, so no caller can request it even by mistake.

The opt-in lives in the URL as `?warnings=1` so an opted-in view is shareable,
and is surfaced as a single labelled switch
([`EligibilityControl`](../src/components/lol-docs/roster/EligibilityControl.tsx))
that states what it turns on *before* it is used. There is no control that
could request Level C.

`hidden_count` is a **count**, not data. At Level A it covers both the B rows
and the review-held rows; at Level AB it covers the review-held rows only. The
UI phrases each case accordingly and never implies the withheld rows are
viewable.

Warning codes seen in production: `academy_main_overlap`,
`event_roster_overlap`, `sister_team_overlap`, `same_day_transition`. Unknown
codes render **verbatim** rather than being hidden or guessed at.

---

## `lpPage` routing rules

`:lpPage` is the **exact Leaguepedia page identifier**, not a slug.

1. React Router hands the param back already percent-decoded.
2. It is passed straight to the API client, which re-encodes with
   `encodeURIComponent` (`encodeLpPage`).
3. Nothing lowercases, trims, slugifies, or fuzzy-matches it — ever.

This matters because real page ids contain spaces, parentheses, slashes and
non-ASCII:

| Page id | URL |
| --- | --- |
| `100 Thieves` | `/lol/docs/pro/teams/100%20Thieves` |
| `300 (North American Team)` | `/lol/docs/pro/teams/300%20(North%20American%20Team)` |
| `24/7 Tower Dive` | `/lol/docs/pro/teams/24%2F7%20Tower%20Dive` |
| `0ri (Adam Matěj)` | `/lol/docs/pro/players/0ri%20(Adam%20Mat%C4%9Bj)` |

A page id that does not exist returns 404 from the backend and renders the
not-found state. That is the **correct** answer, not a bug: there is no
fallback to a case-folded or similarly spelled page.

---

## The M1nG / M1ng invariant

Two distinct records that must never converge:

| Identifier | What it is |
| --- | --- |
| `M1nG` | An **alias** of the canonical Thai player **`Flure`**. Not a page of its own |
| `M1ng` | A **separate canonical player** from **Taiwan**, with his own page |

Verified against production:

```
GET /api/docs/pro/roster/players/M1nG  → 404 {"detail":"Player not found."}
GET /api/docs/pro/roster/players/M1ng  → 200 {"page":"M1ng","country":"Taiwan",...}
GET /api/docs/pro/roster/players/Flure → 200 {"country":"Thailand","aliases":["M1nG", ...]}
GET /api/docs/pro/roster/search?q=M1nG → [{"type":"player","page":"Flure","matched_alias":"M1nG"}]
```

Frontend guarantees:

- `/lol/docs/pro/players/M1ng` requests `…/players/M1ng` exactly and renders
  the Taiwanese player, with no Flure aliases and no Thai memberships.
- `/lol/docs/pro/players/M1nG` requests `…/players/M1nG` exactly, gets its 404,
  and renders the not-found state. **No redirect** to `Flure` or to `M1ng`.
- On that 404 the search index is consulted and `Flure` is offered as an
  explicitly labelled *suggestion* ("matched via alias M1nG") — a link the
  reader chooses, never an automatic resolution.
- Search for `M1nG` (or `m1ng` — the backend matches aliases
  case-insensitively) links to `/lol/docs/pro/players/Flure` and **never** to
  `/lol/docs/pro/players/M1ng`.
- Flure's alias list contains `M1nG` and never `M1ng`.

Pinned by
[`RosterIdentityInvariant.test.tsx`](../src/pages/lol-docs/pro-roster/RosterIdentityInvariant.test.tsx)
across all three surfaces (request layer, routing, rendering) plus the encoding
tests in `roster-api.test.ts`.

---

## Loading / error behaviour

| State | Presentation |
| --- | --- |
| Loading | Skeleton blocks with `aria-busy` and a named `aria-label` |
| Empty | Dashed card; names the search term when one is active |
| 404 | Dedicated not-found panel explaining exact-identifier matching, plus alias suggestions and directory links. Sets `noindex` |
| 422 / 500 / other | `role="alert"` panel, "Couldn't load …", the HTTP status, and a Retry button |
| 502 / 503 / 504 | Distinct "Roster data is temporarily unavailable" panel — an outage, not a bad link |

Retry policy (`rosterRetry`, applied via `rosterQueryOptions`): **4xx never
retries** (the backend's answer will not change); 5xx and network errors get
exactly one automatic retry before the error state appears.

> **Known gap — pre-existing and app-wide, not introduced by this work.**
> When a request fails at the *network layer* (backend unreachable, DNS gone,
> CORS-blocked) rather than returning a readable HTTP status, React Query in
> this app leaves the query `pending`: only one request is issued, no retry
> fires, and the page holds its skeleton instead of showing the
> service-unavailable panel. Verified by pointing `VITE_COMBAT_API_URL` at a
> dead host and at a local always-503 stub: the **untouched** `/lol/docs/pro`
> coverage page hangs on "Loading pro data coverage" in exactly the same way.
> Setting `networkMode: "always"` on the roster queries was tried and did not
> change it, so it is deliberately not carried. Failures that *do* return an
> HTTP status — 404, 422, 500, 503 from a reachable backend — render their
> states correctly, as covered by the tests and confirmed live for 404. Fixing
> the network-layer case belongs at the app's `QueryClient`, outside this
> feature's scope.

Search staleness is handled by React Query keyed on the debounced term (250 ms)
plus a per-request `AbortSignal`: a slower earlier response belongs to a
different query key and can never overwrite a newer term's results.

---

## SEO and indexing

- Every page sets title, description and a self-referencing canonical through
  the existing `SEOHead` helper.
- Sitemap: only the **three static directory routes** are added to
  `buildStaticEntries()` in [`src/lib/seo/sitemap.ts`](../src/lib/seo/sitemap.ts).
  Individual player/team URLs (~18k + ~3.5k) are **deliberately not
  enumerated** — this project has a single flat `public/sitemap.xml` with no
  sitemap-index or splitting support. They stay crawlable via the directories.
- The 404 state sets `noindex`.
- No JSON-LD is emitted: this section does not currently use structured data,
  and roster records are not a schema.org type this project already publishes
  safely.
- Level C never reaches any SEO output — it is never fetched in the first place.
- `public/llms.txt` lists the three static routes.

---

## Testing

```bash
npx vitest run src/pages/lol-docs/pro-roster src/lib/league-docs/roster-api.test.ts src/lib/league-docs/roster-display.test.ts src/App.proRosterRoutes.test.ts src/lib/seo/sitemap.test.ts
```

| File | Covers |
| --- | --- |
| `src/App.proRosterRoutes.test.ts` | Static route registration; `/lol/pro` separation |
| `src/lib/league-docs/roster-api.test.ts` | Encoding, case preservation, request params, never-C, 404/422/500/503 mapping |
| `src/lib/league-docs/roster-display.test.ts` | Date precision, multi-role split, warning labels, sorting, withheld messaging |
| `src/pages/lol-docs/pro-roster/RosterIdentityInvariant.test.tsx` | M1nG / Flure / M1ng across request, routing, rendering, search |
| `src/pages/lol-docs/pro-roster/ProRosterDirectories.test.tsx` | Directory rendering, pagination, search plumbing, responsive layouts, failure states |
| `src/pages/lol-docs/pro-roster/ProRosterProfiles.test.tsx` | Profile rendering, Level A default, Level B opt-in, Level C never requested/rendered, failure states |
| `src/pages/lol-docs/pro-roster/ProRosterLanding.test.tsx` | Coverage summary, SEO metadata, search separation, debounce, staleness, AbortSignal, keyboard access |
| `src/lib/seo/sitemap.test.ts` | Static roster entries present; dynamic pages absent |

Fixtures in
[`src/lib/league-docs/roster-fixtures.ts`](../src/lib/league-docs/roster-fixtures.ts)
are transcribed from live production responses.

Responsive note: jsdom applies no CSS, so both the desktop table
(`hidden md:block`) and the mobile card list (`md:hidden`) are in the tree. The
tests use that to assert the mobile layout genuinely exists rather than being
an empty stub; true viewport behaviour is only observable in a browser.

---

## Known limitations

- **The paginated `/memberships` endpoints are wrapped but unused by any page.**
  The detail endpoints already embed the complete membership list, so a profile
  is one request. The largest team observed returns 92 rows inline; if a page
  ever grows large enough to hurt, switching the profile to the paginated
  endpoint is a drop-in change.
- **No `year` / `role` / `active_on` filtering in the UI.** The membership
  endpoints accept these, but `year=2023` on a team whose membership spans
  2013–present returned no rows in production, so the filter semantics are not
  overlap-based in the way a UI filter would imply. Left out until the
  semantics are confirmed.
- **Search returns at most 20 results** and has no pagination — that is the
  backend's cap, surfaced as-is.
- **Player `region` is null in search results.** Players carry `country` on the
  directory/detail endpoints and `region` only on membership rows; nothing is
  synthesised to fill the gap.
- **The player directory lists fewer players than exist.** Coverage reports
  20,624 players but the directory totals 18,287 — the directory covers players
  with at least one public membership. A player with zero public memberships
  (e.g. `M1ng`) has a reachable profile but does not appear in the directory
  listing.
- **No avatars, flags, social links, careers, or aggregate stats.** The API does
  not return them and none are invented.

## What remains blocked by historical production promotion

Roster **identity** data is live in production: players, teams, aliases and
dated memberships, and everything in this document works against it today.

Full historical **year-by-year champion game data** (picks, bans, per-game
rows) is **not** yet fully promoted to Railway. That dataset backs
`/lol/docs/pro` and `/lol/docs/pro/years/:year`, not these roster pages. Until
it is promoted:

- Roster pages must not be read as evidence that every past season's match data
  is loaded — the landing page says so explicitly.
- Cross-linking a membership to that player's games in a given split is not
  possible yet, and is the natural next feature once the historical years land.
