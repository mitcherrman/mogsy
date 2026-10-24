# ADMIN RETENTION V2 — handoff

| | |
|---|---|
| Worktree | `C:\Users\mlmit\OneDrive\Desktop\mogzy-wt\admin-retention-v2` |
| Branch | `admin-retention-v2/cohorts` (local, unpushed) |
| Base | `origin/main` @ `e6b91095` (2026-10-23) |
| Status | **Pass 1 — implemented and locally verified. Awaiting owner review. Not merged, not pushed, not published.** |

Nothing is merged, pushed, published or applied. No migration, SQL view, RLS or edge-function change.

---

## 1. What exists today (verified on e6b91095)

### 1.1 Data sources

| Table | Grain | Read by Admin? | Notes |
|---|---|---|---|
| `analytics_visitors` | one row per browser id (localStorage UUID) | yes, all-time | `first_seen_at` + first touch (referrer/UTM). |
| `analytics_sessions` | one row per browser session (30-min inactivity, `SESSION_INACTIVITY_MS`) | yes, all-time | `traffic_class` per session (USERS1); `active_ms`, `last_active_at`, end reason (USERS2.3B). |
| `analytics_events` | one row per event, `source_system` web / railway / supabase | yes, **only `received_at >= range.start`** | carries `visitor_id`, `session_id`, `user_id`, `is_guest`. Railway rows are gameplay authority. |
| `analytics_visitor_user_links` | (visitor, user) observed pairs, written by `auth.uid()` only, non-anonymous users only | **not read by metrics** (only `AdminUsers.tsx` record view) | the only server-attested browser↔account link. |
| `analytics_traffic_overrides` | operator class per visitor | yes | applied before metrics. |

Loader: `src/lib/admin/analytics/loadAnalytics.ts` — client-side aggregation, `ROW_CAP = 50_000` per table, reports `truncated` instead of sampling. RLS: SELECT on all analytics tables = `admin` / `master_admin` only.

`is_guest` semantics (`track.ts:197`): `true` when there is **no** Supabase user *or* an anonymous one; `false` only for a non-anonymous user. So `is_guest = true` alone does not mean "guest account"; a guest *account* is `user_id != null AND is_guest = true`.

### 1.2 Metric inventory

| Capability | Exists? | Where | Definition / caveat |
|---|---|---|---|
| **D0 / same-day repeat** | **No** | — | Nothing measures a 2nd session within the first day. `repeatSessions` / `returningVisitors` are "non-first session in range", not anchored to first-seen. |
| **D1** | Yes, browser only | `metrics.ts:838 computeRetention` | Cohort = visitors first seen in range. Eligible once `first_seen + 48h <= now`; retained if a **session starts** in `[+24h, +48h)`. Rolling per visitor, UTC-independent. Too-recent counted separately, never as churn. |
| **D7** | Yes, browser only | same | Eligible once `first_seen + 8d <= now`; retained if a session starts in `[+7d, +8d)`. **On the default 7-day range D7 is structurally always "Insufficient history"** — every cohort member is < 7 d old. Only 30d / All can ever show D7. |
| **Weekly retention (W1…Wn)** | **No** | — | No week-bucketed cohorts, no cohort table/curve. |
| **Cohort breakdown (per day/week of first seen)** | **No** | — | D1/D7 are one pooled number for the whole range. |
| **After-Daily return** | Yes, browser, human-only | `afterDaily.ts` (Overview) | Different definition: anchor = last Daily stage activity; return = a session on a **later UTC day**; eligible if ≥ 1 full day of follow-up **inside the 7-day range**. Not comparable with D1. |
| **Returning visitors / repeat sessions** | Yes | `computeOverviewPopulations` | Activity counts, not retention. "A new visitor who comes back inside the range is both new and returning." |
| **Guest browsers vs signed-in** | Partial | `computeOverview` (`signedInUsers`, `guestSessions`), `computeAccounts` (`guestUsers`, `registeredUsers`), Overview journey segments | Counts only. No retention split by account state. Overview journey segments use *latest* profile status, not status at cohort entry. |
| **Authenticated account retention** | **No** | — | Every retention number is keyed by `visitor_id`. An account using 2 devices counts as 2 browsers; a shared browser with 2 accounts counts as 1. |
| **Eligibility windows** | Yes for D1/D7 | `RetentionRate.eligible / tooRecent` | Correct and conservative. AfterDaily uses a different rule (range-bounded). |
| **Traffic filtering** | Yes | `traffic.ts filterDatasetByTraffic` | Dataset transform applied once; default `human + unknown`. Users page honours the URL `?traffic=` filter; Overview hard-codes `human_unknown` and then journeys keep only human-signal browsers for AfterDaily. |
| **Small-sample honesty** | Yes | `MIN_RATE_SAMPLE = 20`, `formatRate` | `< 20` shows `k / n`, never %. |
| **Source attribution** | Yes | `computeSources` | First touch per new visitor (immutable `analytics_visitors` row, fallback first session); session touch per session. **Not joined to retention** (no "D1 by source"). |
| **Gameplay authority** | Yes | `AUTHORITATIVE_*`, `isServerRound` | Only Railway rows count as starts/completions. No retention metric uses gameplay as the return signal yet. |
| **Charts** | **None in Admin analytics** | — | All Admin analytics is tiles + tables. No recharts in `src/components/admin`. `useReducedMotionPreference` exists (`src/hooks`). |
| **Tests** | Yes | `metrics.test.ts` (D1/D7 block L234+), `afterDaily.test.ts`, `audience.test.ts`, `visitorJourney.test.ts`, Overview component tests | |

### 1.3 Identity / attribution rules already in force (must be preserved)

- `AGENTS.md`: "Overview browser journeys use explicit visitor/session correlation only; account-only server events stay unattributed to avoid guessed cross-device joins."
- `visitorJourney.correlatedVisitor` refuses rows whose visitor/session ids disagree.
- **Inconsistency found:** `metrics.ts visitorsByUser` (used by `engagedVisitors` and the verification funnel step) and `population.ts buildVisitorRows` *do* fan a Railway row out to every visitor ever seen with that `user_id`. That is UID-based stitching inside the Users page. Out of scope to change here, but V2 must not copy it.
- `classByUser` only sees in-range web events, so a Railway row whose user had no in-range web event is classed `unknown` (kept by the default filter).

## 2. What is missing

1. **D0 same-day repeat** (second session within 24 h of first seen).
2. **Cohort-level view**: per cohort (UTC day or UTC week of first seen) — size, eligible, retained at D0 / D1 / D7 / W1…W4, too-recent.
3. **Weekly retention** (Wk N = any session in `[7N d, 7(N+1) d)` after first seen).
4. **Account retention**, kept separate from browser retention, keyed by `user_id`.
5. **Ranges that can actually show D7/weekly**: cohort window must be decoupled from the activity range (today D7 is impossible on the default 7d).
6. **Availability states** per cell: not yet observable (too recent) vs observed 0 vs insufficient sample vs data truncated.
7. **Visualization**: no chart anywhere in Admin analytics.

## 3. Proposed V2 (smallest correct extension) — needs owner OK

### 3.1 Two lenses, never summed, never joined

| | **Browser retention** | **Account retention** |
|---|---|---|
| Unit | `visitor_id` | `user_id` where `is_guest = false` (registered) |
| Cohort entry | first seen (existing `firstSeenByVisitor`) | `signup_completed` web event (deduped at emitter) — see D-2 |
| Return signal | a session **start** in the window (existing rule) | any analytics event with that `user_id` and `is_guest = false` in the window, web or Railway (server-confirmed rows count; no visitor join needed) |
| Traffic filter | existing dataset filter | same filtered dataset (`classifyEvent` via `byUser`) |
| Stitching | none | none — an account is never mapped to browsers; browser ids are never merged by account |

They answer different questions and are shown in separate panels with separate denominators. No "total" combines them.

Guest *accounts* (anonymous Supabase users) are deliberately **not** a third lens in V2: a guest upgrade keeps the same `user_id`, so the cohort would change identity mid-window. Browser retention already covers guests. Optional split: browser cohort rows by "signed in at any point in the D0 window" — only if the owner wants it (D-4).

### 3.2 Windows (rolling from each unit's own anchor, half-open)

| Column | Window after anchor | Eligible when |
|---|---|---|
| D0 repeat | a **second** session in `(anchor, +24h)` (browser only; for accounts: activity in a later session is not observable, so D0 is omitted for accounts) | `anchor + 24h <= now` |
| D1 | `[+24h, +48h)` — unchanged | `anchor + 48h <= now` |
| D7 | `[+7d, +8d)` — unchanged | `anchor + 8d <= now` |
| W1, W2, W3, W4 | `[+7N d, +7(N+1) d)` | `anchor + 7(N+1) d <= now` |

Existing D1/D7 numbers and `computeRetention` stay byte-for-byte identical; V2 is a new pure function (`cohorts.ts`) that reuses the same session index, plus tests asserting V2's pooled D1/D7 equal `computeRetention`'s.

### 3.3 Cohorts and range

- Cohort grain: **UTC week** (Mon) by default, UTC day toggle. Cohorts = those whose anchor is in the selected range.
- To make D7/W4 meaningful, the Retention panel adds a **cohort lookback** independent of the activity range (e.g. last 8 weeks). Browser cohorts already work (sessions are loaded all-time). Account cohorts need events from the lookback start, so the panel loads with its own range (`resolveRange("all")` or a new `"56d"` preset) via the existing `loadAnalytics` — no new table, no SQL view, no migration. `truncated` is surfaced per cell.

### 3.4 UI (Users › Retention, replaces nothing)

- Keep the existing "Return behaviour" tiles.
- Add **Cohort retention** panel: lens switch (Browser / Account), grain switch (Week / Day).
  - **Cohort heatmap table** (rows = cohort, cols = D0 D1 D7 W1–W4): cell shows `%` (n ≥ 20) or `k / n`, tone scaled by rate; hatched "not yet observable" cells; each row states cohort size; header states denominator rule.
  - **Retention curve** (pooled, eligible-weighted) as an inline SVG line with points labelled `k / n`; no new chart dependency.
  - Plain-language definitions, "browser ≠ person" and "account ≠ browser" notes.
  - Animation: fade/grow-in only, disabled under `prefers-reduced-motion` (`useReducedMotionPreference`); table is the accessible source of truth (`<table>` with `scope`, `aria-describedby` definitions; the SVG is `aria-hidden` with a caption).
- Overview: one compact "Retention at a glance" card (browser D1 + W1 of the latest fully-eligible cohort, with denominators) linking to Users › Retention. Optional (D-5).

### 3.5 Tests

- L1: `cohorts.test.ts` — windows, eligibility, too-recent vs 0, D0 second-session rule, account lens ignores visitor ids, no UID→visitor fan-out, traffic filter honoured, pooled D1/D7 parity with `computeRetention`, small-sample formatting.
- L2: component test (jsdom) for the panel: lens switch, empty / truncated / too-recent states, reduced-motion path, table semantics. Browser checks only via the Browser pane or CI per `AGENTS.md` (no local Edge/Chrome automation).
- L3: not planned (no backend, no migration, no auth change).

## 4. Owner decisions needed

| # | Decision | Recommendation |
|---|---|---|
| D-1 | Browser and account retention shown as two separate lenses, never combined | Yes |
| D-2 | Account cohort anchor: `signup_completed` web event (exists only since FUNNEL1B1; pre-instrumentation accounts are excluded) vs `profiles.created_at` via `admin_list_profiles` (crosses the metrics.ts "no profiles" boundary) | `signup_completed`, with an "accounts created before instrumentation are not in a cohort" note |
| D-3 | Account return signal: any `is_guest=false` event (web or Railway) vs Railway gameplay only | Any event; add "played (server-confirmed)" as a later toggle |
| D-4 | Add D0 same-day repeat + W1–W4 alongside unchanged D1/D7 | Yes |
| D-5 | Compact Overview card in addition to the Users › Retention panel | Yes, small |
| D-6 | Cohort lookback loads all events (client-side, `ROW_CAP` 50k) rather than adding a SQL view | Yes for now; truncated state shown; SQL view is the next step if truncation appears |

## 5. Risks

- Client-side aggregation ceiling (50k rows/table). An "all" load for account cohorts may truncate; the UI must say so per cell.
- Browser identity floor: cleared storage / new device = new visitor; browser retention is a lower bound.
- `signup_completed` is browser-reported; a missed emit drops an account from its cohort (never mis-assigns it).
- Pre-existing UID fan-out in `engagedVisitors` / `buildVisitorRows` (noted, not changed).

## 6. Decisions (owner, 2026-10-23)

D-1 … D-6 approved as recommended: two separate lenses; account anchor = `signup_completed`; account return = any `is_guest = false` event (web or Railway); D0 + W1–W4 added beside unchanged D1/D7; Overview glance card; client-side read with truncation states (no SQL view yet).

Implementation choices made inside those decisions:

- Cohort lookback = **8 UTC weeks** (Monday start), read with its own `loadAnalytics({ start })` so D7 and the W-columns are observable regardless of the page's range preset. Day grain shows the latest **28 UTC days** of the same read.
- Mounted in Users › Audience directly after Audience Pulse (visible, not inside "Advanced analytics"), instead of inside `RetentionSection` as planned in §3.4; the existing Return-behaviour tiles are untouched.
- D0 (browser) = at least **two** session starts in `[first_seen, +24h)`. If the first session's row never landed, a real repeat can be missed (undercount, never overcount).
- Truncation is per lens: browser lens unavailable if `analytics_sessions` or `analytics_visitors` truncated; account lens if `analytics_events` truncated (ascending reads lose the newest rows, i.e. the returns).
- Shading only when eligible ≥ `MIN_RATE_SAMPLE` (20); smaller cells show `k / n` unshaded; unelapsed cells read "pending"; partially elapsed cells show `+n` pending.
- Curve = W0 (100 %) → W1…W4 pooled, each point labelled with its own rate; hollow when n < 20. Inline SVG, no chart dependency, `aria-hidden` with a text caption; the table (with caption, `scope`, screen-reader cell sentences) is the accessible source. Draw-in transition disabled under OS or in-app reduced motion (`useReducedMotionPreference`).
- The panel honours the Users page `?traffic=` filter; the Overview card uses the default `human + unknown`.

## 7. Files

| File | Change |
|---|---|
| `src/lib/admin/analytics/cohorts.ts` | new — pure cohort engine (lenses, windows, UTC buckets, lookback) |
| `src/lib/admin/analytics/cohorts.test.ts` | new — 14 L1 tests incl. D1/D7 parity with `computeRetention` on 7d / 30d / all |
| `src/lib/admin/analytics/useCohortAnalytics.ts` | new — shared query, per-lens availability, report builder |
| `src/components/admin/users/CohortRetention.tsx` | new — `CohortRetentionPanel` (Users) + `RetentionGlance` (Overview) |
| `src/components/admin/users/CohortRetention.test.tsx` | new — 9 L2 component tests |
| `src/lib/admin/analytics/metrics.ts` | `indexSessions`, `firstSeenByVisitor`, `sessionsByVisitor`, `SessionInfo` exported (no logic change) |
| `src/lib/admin/analytics/loadAnalytics.ts` | parameter widened to `Pick<AnalyticsRange, "start">` (the only field it read) |
| `src/pages/admin/areas/AdminUsersPage.tsx` | panel mounted in Audience after Audience Pulse |
| `src/pages/admin/areas/AdminOverviewPage.tsx` | glance card after Audience journeys |
| `docs/handoffs/admin-retention-v2/*.jpg` | preview screenshots (browser weekly dark/light, account daily, 375 px, truncated) |

## 8. Test results

| Level | Scope | Result |
|---|---|---|
| L1 | `src/lib/admin/analytics` | all pass (cohorts 14, metrics 53, audience 16, visitorJourney 22, afterDaily 6) |
| L2 | `src/components/admin/users` + `src/lib/admin/analytics` + `src/pages/admin/areas` | **13 files, 209/209 pass** |
| L2 | `src/pages/admin` (wider) | 1 failure, pre-existing and unrelated: `AdminPlatformPolicies.test.tsx` boundary scan expects `/` paths, gets `\` on Windows |
| Types | `tsc -p tsconfig.app.json --noEmit` | 2 errors, both pre-existing in untouched files (`OnboardingProfile.tsx:180`, `identity/connections.ts:263`); none in changed files |
| Lint | `eslint` on all changed files | clean |
| Browser | built-in Browser pane; worktree Vite dev server; git-excluded harness `retention-preview.html/.tsx` that seeds the real components with a synthetic 8-week dataset via the React Query cache (no auth, no Supabase) | browser + account lenses, week + day grain, dark + light, 375 px (no page h-scroll; table scrolls in its own box), truncated and empty states, curve draw-in completes; 0 console errors. No local Edge/Chrome automation (AGENTS.md). Server stopped afterwards. |

All test runs were single, sequential, short (≤ 2 s test time each). The global `mogzy-guard` vitest hook appeared only after these runs; later runs must go through `mogzy-guard.cmd run --class vitest`.

Not verified: the real `/admin/users` and `/admin` routes against production data (needs an admin sign-in, which the agent does not do). Owner should open both on a preview build.

Test note: `beforeEach(load.mockReset())` plus a rejecting mock made vitest report the rejection as a failure after the test body passed; the suite sets each mock per test instead.

## 9. Commits (branch `admin-retention-v2/cohorts`, unpushed)

- `7a359ac0` pass 0 audit handoff
- `dd82a2bf` implementation (cohorts engine, panel, Overview card, tests)
- docs/polish commit: tile-vs-panel note wording, screenshots, this handoff

## 10. Risks

- Client-side ceiling: the 8-week read is a second analytics load on Users/Overview (cache shared between them). At 50k rows/table the affected lens goes unavailable — the signal to move cohorts into SQL.
- Browser retention is a floor (cleared storage, devices, private windows).
- Account cohorts depend on the browser-reported `signup_completed`; a missed emit drops an account (never misassigns it). Pre-instrumentation accounts are in no cohort.
- Account "return" includes any signed-in event, so a page view counts; a "played (server-confirmed)" variant is a later toggle.
- Pre-existing UID fan-out in `engagedVisitors` / `buildVisitorRows` remains (out of scope, flagged in §1.3).
- The panel's D1/D7 can legitimately differ from the existing tiles (different cohort window); the panel says so.

## 11. Next steps

1. Owner reviews diff + screenshots, then opens `/admin` and `/admin/users` on a preview build.
2. If accepted: push branch, open PR (Actions billing-blocked; local evidence above).
3. Follow-ups (not started): "played" account-return toggle; D1/W1 by first-touch source; SQL view for cohorts once volume nears the cap; resolve the UID fan-out in `metrics.ts` / `population.ts`.
