# ADMIN CONVERSION & DROP-OFF V2 — CV1 audit handoff (2026-10-24)

Scope: audit only. No tracking, UI, migration or production change was made, and no production query was run.
Base: `origin/main` @ `a0f426d4` (contains Retention V2 merge `2f92f81b`, PR #149).
Worktree: `mogzy-wt/admin-conversion-v2`, branch `admin-conversion-v2/cv1-audit` (local, unpushed).
Daily History and Retention V2 code was read, not modified.

**No conversion rate in this document is a measured production number.** The only
production figures used are the owner's (167 `signup_completed` account ids, 0
`verification_completed` / `email_confirmed` rows). §8 lists read-only queries that turn
each remaining unknown into a fact.

---

## 0. Executive summary

1. **There is no sequential funnel today.** `computeFunnel` (`src/lib/admin/analytics/metrics.ts:561`)
   counts each step as an independent distinct-visitor set over the range, on purpose:
   direct links to `/quiz` skip Landing and Hub. The UI says so.
   - It cannot answer "of the browsers that did X, how many later did Y".
   - `computeAccounts` cannot either. Its one cross-step number, `viewToComplete`
     (`metrics.ts:791`), intersects visitors but ignores order: a completion before the
     view still counts.
2. **There are two identity spaces and one weak bridge between them.**
   - Acquisition and Daily entry are keyed by `visitor_id`, a localStorage UUID (one
     browser, not one person).
   - Signup, play and repeat engagement are keyed by `user_id`, the Supabase uid.
   - Since USERS1, a page load creates no auth identity (`useAuth.tsx:140`). An anonymous
     uid is minted only at the first write (`lib/auth/anonymous-identity.ts`).
   - The only legitimate bridges:
     - a web row carrying both ids;
     - the server-written `analytics_visitor_user_links`, which covers registered users
       only.
   - The `signup_completed` row itself carries both ids, so every account's signup
     browser is known. There is no bridge across devices.
3. **`signup_completed` is browser-reported and has two producers**
   (`src/lib/analytics/signup.ts`):
   - **Guest upgrade** (`observeAuthIdentity`, L110): fires when the same uid stops
     being anonymous.
   - **Direct signup** (`reportDirectSignupCompleted`, called at `Auth.tsx:310`): fires
     when `signUp()` returns without error.
   - Dedupe is localStorage only. The database never dedupes web rows.
   - It means "auth accepted the signup or upgrade", not "email confirmed".
4. **Email confirmation is not a measurable milestone in production today, and the zero
   is expected.**
   - `docs/AUTH2_AUDIT.md` probe E records Confirm email **OFF** (auto-confirm ON): a
     signed-out `signUp()` returns a session.
   - Probe B records the same for upgrades: a guest upgrade sets `email_confirmed_at`
     immediately.
   - So `auth.users.email_confirmed_at` is set at signup, and it carries no information
     beyond `signup_completed`.
   - No code emits `verification_*`: `VERIFICATION_EMITTERS_LIVE = false` (`metrics.ts:91`),
     and the helpers in `track.ts:331-354` have no callers. No `email_confirmed` event
     exists in the contract.
   - The repo cannot prove the dashboard setting today; `config.toml` has no `[auth]`
     section. Query Q4 in §8 settles it.
5. **The Daily Challenge parent run lives on Railway, not Supabase.** Supabase has:
   - the browser click `daily_challenge_entry_clicked`;
   - Railway's per-stage child rows, `ranked_started` / `ranked_completed` with
     `metadata.host = daily_challenge`, `parent_activity_id`, and
     `parent_stage_index` / `parent_stage_kind`;
   - `daily_incomplete`, entity `daily_run`.

   "Daily main completed" can be approximated from the Standard-stage child completing.
   "Daily run completed" cannot be observed in Supabase at all. The only source is the
   per-user, owner-only Daily History API.
6. **Two loader defects affect every Admin analytics number, Retention V2 included**
   (§7.1). Both are shared-contract defects:
   - Offset paging is ordered only by the non-unique `received_at`, so it can skip or
     duplicate rows on ties.
   - On truncation the loader keeps the **oldest** 50k rows and drops the newest. This
     also applies to the all-time visitors and sessions reads.

**Recommended direction (§9):**
- **CV2:** pure, tested ordered **browser funnel** and **account funnel** projections over
  the existing dataset, with no new tracking, plus the paging tiebreak fix.
- **CV3:** a PII-free, owner-gated account registry read, to reconcile
  `signup_completed` coverage against auth truth. Email confirmation is shown as "not
  applicable: auto-confirm" instead of being built.
- **CV4:** one Admin panel reusing `AdminPanel` / `Table` / `DrillValue` / `formatRate` /
  `Unavailable`.

---

## 1. Existing capability vs missing capability

| Question | Exists today | Where | Missing |
|---|---|---|---|
| How many browsers reached each surface | Yes, as independent sets | `computeFunnel` → `AcquisitionSection` (`AudienceSections.tsx:303`) | Order; per-step denominators |
| Of browsers at step N, how many reached N+1 later | **No** | — | Ordered first-occurrence projection |
| Signup screen → submit → created | Partial: 3 independent visitor counts plus unordered `viewToComplete` | `computeAccounts` → `AccountsSection` (`AudienceSections.tsx:413`) | Ordering; guest-upgrade vs direct split per step; entry-surface split |
| "Accounts created" count | Yes, but it counts **events**, not distinct accounts | `computeAccounts.signupCompleted`, `computeOverview.signups` | Distinct `user_id` count |
| Email confirmed | Per account, for the owner only (`AdminUsers.tsx` via `admin-get-emails`) | Edge functions | Not meaningful while auto-confirm is on (§6) |
| Played before signing up (guest upgrades) | Visible in single-account journeys only | `account-journey.ts`, `visitorJourney.ts` | Aggregate share |
| Did a new account come back | Yes: account lens, any signed-in event | `cohorts.ts` (Retention V2) | A "played (server-confirmed)" variant |
| Where browsers drop off | **No** | — | Mutually exclusive "furthest step" buckets |
| Traffic hygiene | Yes: dataset transform, default human+unknown | `traffic.ts filterDatasetByTraffic` (applied in `AdminUsersPage.tsx` before every section) | QA accounts are recognisable only by email (server-side) |
| Single browser / account history | Yes | `visitorJourney.ts`, `AdminAccountJourney.tsx`, `AdminDailyHistory.tsx` | — |
| Daily runs across all accounts | **No** | Daily History is per user, `limit ≤ 60` | A bulk or aggregate Railway read |

---

## 2. Milestone-by-milestone evidence matrix

**Authority:**
- **S** = written by the server or database.
- **B** = reported by the browser. A B row can be lost (blocked or failed insert),
  duplicated (web rows have no database dedupe), or written by any client: RLS pins
  `source_system='web'` and `user_id ∈ {NULL, auth.uid()}`, nothing more.

| # | Milestone | Source | Emitter | Auth. | Key on row | Clock | Dedupe | Known gaps |
|---|---|---|---|---|---|---|---|---|
| M0 | Browser first seen | `analytics_visitors.first_seen_at`; `analytics_sessions.started_at` | `track.ts` recordFirstTouch / recordSession | B | visitor_id | DB `now()` | PK | Storage clear, private window or 2nd device = new browser |
| M1 | Landing viewed | `landing_viewed` | `MogzyEntryV2.tsx:170` (root `/` only) | B | visitor_id, session_id, user_id (often NULL) | `received_at` | none | Deep links skip it by design |
| M2 | Hub entered | `hub_entered` | `AcademyCorePage.tsx:215` | B | same | `received_at` | none | — |
| M3 | Leaguecraft opened | `leaguecraft_opened` | `Quiz.tsx:294` | B | same | `received_at` | none | — |
| M4 | Mode intent | `practice_quiz_opened`, `ranked_opened`, `mastery_opened`, `more_challenges_*` | surface hooks | B | same | `received_at` | none | Intent only, never a start |
| M5 | Daily entry clicked | `daily_challenge_entry_clicked` (`metadata.control`) | `dailyEntry.ts` call sites | B | same | `received_at` | none | Link, refresh and bookmark arrivals have none; runs before the click event shipped have none |
| M6 | Server-confirmed play | `ranked_started`, `practice_quiz_started`, … with `source_system='railway'` | `railway-analytics-ingest` (service role) | **S** | user_id (+ `metadata.visitor_id/session_id` when the launching request had them) | `received_at` = **delivery** time | unique `(source_system, event_name, source_entity_type, source_entity_id)` | Visitor correlation coverage unknown (Q5); a guest who never wrote anything has no uid |
| M6d | Daily stage started / completed | same rows with `host='daily_challenge'` and a `parent_activity_id` | Railway | **S** | user_id | `received_at` | as M6 | Rows before host provenance are `legacy_unknown`; **a child completing ≠ the Daily completing** |
| M6m | Daily main completed (approximation) | `ranked_completed`, host Daily, `parent_stage_kind='standard'` | Railway | **S** (child) | user_id | `received_at` | as M6 | True `main_completed_at` is Railway `daily_runs`; plan versions without Standard-first have no "main" |
| M6x | Daily run incomplete | `daily_incomplete` (entity `daily_run`) | Railway | **S** | user_id | `received_at` | as M6 | Meaning and trigger not verified in this repo; check the backend before use |
| M7 | Signup viewed | `signup_viewed` (`entry_surface`, `return_to`) | `Auth.tsx:100` (`/auth` in signup mode) | B | visitor_id, user_id (NULL or anon) | `received_at` | none | Upgrade panels mounted outside `/auth` (e.g. `OnboardingProfile.tsx:194`) don't emit it; contextual invitations emit `signup_offer_*` instead (not counted, by contract) |
| M8 | Signup submitted | `signup_started` (`from_guest`, `entry_surface`) | `Auth.tsx:274` (direct), `useAccountUpgrade.ts:166` (guest) | B | same | `received_at` | none | One row per submit; retries repeat |
| M9a | Account created: guest upgrade | `signup_completed`, `upgraded_from_guest=true`, `detected_by='auth_identity_transition'` | `signup.ts:110` via `useAuth.tsx:89` | B (observes an S fact) | user_id = the guest's uid; visitor_id of the browser that saw the transition | `received_at` | localStorage, last 10 uids per browser | With auto-confirm the transition happens in the same submit, so the clock ≈ registration time. A failed insert loses the account from all analytics cohorts |
| M9b | Account created: direct | `signup_completed`, `upgraded_from_guest=false`, `detected_by='signup_form'` | `Auth.tsx:310` | B | visitor_id; user_id from `getSession()` at emission (`track.ts:197`) | `received_at` | localStorage by uid | With auto-confirm a session exists, so user_id is set. **If Confirm email is ever turned on, user_id becomes NULL, is_guest true, the dedupe is skipped, and confirming later emits nothing** (`signup.ts:121, :147`); `cohorts.ts:160` would drop those rows |
| M10 | Email confirmed | none in analytics. `auth.users.email_confirmed_at` | Supabase Auth | **S** | user_id | `email_confirmed_at` | — | Equals signup time under auto-confirm; readable only through owner Edge functions (§6) |
| M10v | Discord / Riot verified | identity links `verified_at` (`admin_list_identity_links`) | identity-link | **S** | user_id | `verified_at` | — | Separate from email; no analytics events |
| M11 | Signed-in activity after signup | any row with that user_id and `is_guest=false` | all | B/S | user_id | `received_at` | — | A page view counts as activity |
| M12 | Server-confirmed play after signup | M6 rows with `is_guest=false` | Railway | **S** | user_id | `received_at` | unique | — |
| M13 | Browser returned | non-first `analytics_sessions` row | browser | B | visitor_id | `started_at` | PK | Undercounts returns (a cleared or new browser looks new) |

Not instrumented; these stay "unavailable" and are never shown as zero:
`verification_*`; Daily parent run started/completed in Supabase; onboarding lifecycle;
Daily resume (Daily History handoff: "Resume is not recorded").

---

## 3. Sources, keys and access (schema / RLS)

From `supabase/migrations/20260920120000_funnel1b1_analytics_foundation.sql` (FUNNEL1B1),
`20260923120000_users1_traffic_classification.sql` (USERS1) and
`20260926120000_users2_3b_session_intelligence.sql` (USERS2.3B; its header says "not
applied here", but `USERS2_HANDOFF.md` and the generated types say it is in production).

**`analytics_visitors`**
- Grain: one row per browser.
- Key / important columns: `visitor_id` PK, `first_seen_at`, first touch (referrer, UTM). No user_id, no traffic flag.
- Write path: anon/auth INSERT `WITH CHECK (true)`.
- Admin read: SELECT `has_role(admin) OR is_master_admin`, which after OWN1 means the MFA'd owner only.

**`analytics_sessions`**
- Grain: one row per browser session (30 min inactivity).
- Key / important columns: `session_id` PK, `visitor_id` (no FK), `started_at`, `traffic_class` (human / automation / internal / unknown), `active_ms`, `session_end_reason`.
- Write path: INSERT only with class ≠ human; promotion to human goes through the `analytics_promote_session_human` RPC.
- Admin read: same as above.

**`analytics_events`**
- Grain: one row per event.
- Key / important columns: `id` PK, `received_at` (DB clock, the trusted one), `occurred_at` (emitter clock, untrusted, not loaded), `visitor_id`, `session_id`, `user_id` (no FK, so it survives the anonymous purge), `is_guest`, `source_system`, `source_entity_*`, `metadata` (≤ 8 KiB).
- Write path:
  - Web: `source_system='web'`, `user_id ∈ {NULL, auth.uid()}`, entity columns NULL.
  - Server: the `railway-analytics-ingest` Edge function (service role; a 23505 conflict counts as success).
- Admin read: same as above.

**`analytics_visitor_user_links`**
- Grain: one row per (browser, registered account) pair seen together.
- Key / important columns: PK `(visitor_id, user_id)`, `first_observed_at`, `last_observed_at`, `observation_count`.
- Write path: only `analytics_link_visitor_user()` (uses auth.uid(); skips anonymous users), called from `sessionIntelligence.ts`.
- Admin read: same as above. Not read by `loadAnalytics`.

**`analytics_traffic_overrides`**
- Grain: one row per browser, holding an operator's correction.
- Key / important columns: `visitor_id` PK.
- Write path: admin read/write.
- Admin read: read by the loader.

**`profiles`**
- Grain: one row per auth user, **anonymous included** (`handle_new_user`).
- Key / important columns: `user_id`, `is_anonymous`, `created_at` (= auth creation, which is the guest's creation for an upgrade), `last_seen_at` (client heartbeat, latest only).
- Write path: trigger.
- Admin read: SELECT is public; the admin RPC is `admin_list_profiles`. `metrics.ts` deliberately never reads profiles.

**`auth.users`**
- Grain: one row per auth identity.
- Key / important columns: `id`, `is_anonymous`, `email_confirmed_at`, `created_at`, `last_sign_in_at`.
- Write path: Supabase Auth.
- Admin read:
  - **No SQL view or RPC.**
  - Owner Edge functions only: `admin-user-actions get_auth_info` (1 user per call) and `admin-get-emails` (≤ 50 ids per call, 10 calls/min, **returns email addresses**).

**Railway `daily_runs` / `daily_run_stages` / `daily_run_events`**
- Grain: Daily truth.
- Key / important columns: `run_id`, `main_completed_at`, `completed_at`, frozen `visitor_id` / `analytics_session_id`.
- Write path: Railway.
- Admin read: `GET /api/daily-run/admin/users/{user_id}/history`, per user, owner, limit ≤ 60.

Other facts:
- **Indexes:** `(received_at DESC)`, `(event_name, received_at DESC)`, `(visitor_id, received_at DESC)`, `(user_id, received_at DESC)`, `(session_id, received_at)`.
- **Retention:** no TTL or cleanup job exists. The migration says "a service_role job" but none is scheduled, and `purge-anonymous-users` deletes no analytics rows. History is therefore complete from each event's ship date.
- **Admin identity:** OWN1 reduced `has_role(admin)` / `is_master_admin` to the single owner with aal2 or a trusted device (`docs/OWN1_OWNER_CONTROL_PLANE.md`; documented as applied, not re-verified here).

---

## 4. Which transitions are genuinely observable

- **O**: ordered and observable on one key.
- **C**: observable only through explicit correlation (§5.2).
- **X**: not observable.

| Transition | Status | Why |
|---|---|---|
| Landing → Hub → Leaguecraft | **O** (visitor_id) | Same-browser rows. Skips are real (deep links) and are reported, never forced |
| Leaguecraft → mode intent / Daily click | **O** (visitor_id) | Browser rows |
| Intent → server-confirmed play | **C** | Start rows are keyed by user_id. A browser gets one only when the row's `visitor_id`/`session_id` (column or metadata) matches it, as in `visitorJourney.correlatedVisitor`. UID fan-out is forbidden (AGENTS.md). Coverage: Q5 |
| Daily stage 1 → Standard done | **O** (user_id) | Child rows share `parent_activity_id` |
| Daily run completed | **X** in Supabase | Railway only, per user |
| Signup viewed → submitted → created | **O** (visitor_id), within one browser | All three are web rows from the same browser. Guest-upgrade panels outside `/auth` have no "viewed" row |
| Created → email confirmed | **X**, and not meaningful while auto-confirm is on | §6 |
| Guest play → signup (upgrades) | **O** (user_id) | Same uid before and after. `is_guest=true` rows before the anchor are that guest's |
| Direct signup → earlier anonymous browsing | **C** via the signup row's `visitor_id` | Earlier rows from that browser carry the same visitor_id |
| Created → plays / returns | **O** (user_id) | The Retention V2 account lens; anchor = first `signup_completed` `received_at` |
| Acquisition source → account | **C** | First touch is per visitor_id; the signup row names the browser |
| Browser or account → person | **X** | Never claimed |

---

## 5. Identity and time-ordering rules (to be enforced in CV2 code and tests)

### 5.1 Units
- **Browser funnel:** the unit is `visitor_id`. Never merge browsers and never collapse them by user_id. Copy says "browsers", never "people" or "users".
- **Account funnel:** the unit is a registered `user_id`. Anchor = the first `signup_completed` web row carrying that user_id: exactly the anchor in `cohorts.ts` `accountUnits` (L157), so membership is identical to Retention V2. Copy says "accounts".
- The two funnels are **never summed and never drawn as one chain.** The one crossing, "browsers that created an account", is the browser funnel's last step. It is counted on the signup row's own `visitor_id`.

### 5.2 Allowed correlation (the only joins)
1. A row whose `visitor_id`, or `session_id` → owner session, names the browser. This includes `metadata.visitor_id` / `metadata.session_id` on Railway rows, with the conflict rules of `correlatedVisitor`, which CV2 should **reuse, not copy**.
2. A web row carrying both `visitor_id` and `user_id`.
3. `analytics_visitor_user_links`. This one is server-attested, but it is not loaded today and is not needed for CV2.

Nothing else counts as a join: no IP, timing or device, and no Railway `user_id` fanned out to "every browser that ever had this uid". The existing `visitorsByUser` fan-out (`metrics.ts:394`, used by `engagedVisitors` and the verification step) is that forbidden join. CV2 must not reuse it. Whether to fix the existing tiles is a separate decision (D-7).

### 5.3 Clock
- Order by `received_at`. `occurred_at` is untrusted and not loaded.
- Step N+1 is "after" step N when `t(N+1) >= t(N)`. Equality counts: one browser tick can write `signup_started` and `signup_completed` together.
- Railway `received_at` is outbox delivery time, so it lags the play. A play received **before** the signup anchor certainly happened before it. One received after may not have. Label: "after signup (by delivery time)".

### 5.4 First occurrence, no back-fill
- Each step uses the unit's **first** occurrence inside its window.
- A unit that reaches N+1 without N is reported in an **"entered at a later step"** count. It is not dropped and not back-filled into N.

### 5.5 Windows and eligibility
- Every rate states its window from the unit's own anchor.
- A unit whose window has not fully elapsed by `now` is **too recent** and is left out of that rate's denominator. It is never counted as dropped. This is the same rule as Retention V2's `tooRecent`.

### 5.6 Population
- `filterDatasetByTraffic` first, unchanged (default human + unknown).
- An account-only row is classed by `classByUser`, which sees in-range web events only. A Railway-only account is therefore `unknown` and stays in the default population; this is documented, not changed.
- QA accounts (`mogzy-launch-qa-*@mogzy.lol`) can be recognised only by email, so the analytics store can't exclude them. CV3's server read can return an `is_known_qa` boolean without the email.

### 5.7 Repetition
- Repeated sessions, retries and duplicate rows never multiply a unit.
- Event counts, if shown, are a separate column labelled "events".

---

## 6. Email confirmation: can it be measured without exposing private data?

**Measurable, yes.** The authoritative field is `auth.users.email_confirmed_at`. A
SECURITY DEFINER RPC gated on `is_owner()` could return
`user_id, is_anonymous, email_confirmed_at` (or just aggregates) with no email. The
existing `admin-get-emails` path is unsuitable for a funnel: it returns addresses,
50 ids per call, 10 calls per minute.

**Meaningful today, no.** AUTH2 probes E and B recorded auto-confirm:
- direct signups get a session immediately;
- guest upgrades get `email_confirmed_at` set in the same request.

So "confirmed" is the same event as "created". A confirmation step would be a second copy
of the signup step, presented as a different milestone. The 0 `verification_completed`
rows are the correct reading of an uninstrumented contract; nothing was lost.

**What would make it meaningful:** turning Confirm email ON. That is a product and auth
decision, not an analytics one, and it would break two analytics paths first (M9b in §2):
- direct-signup rows would lose their `user_id`;
- the later confirmation would emit nothing.

Before such a switch, signup recording would need to move server-side (Option C, §9.5).

**Recommendation:**
- Do not build a confirmation step in CV2–CV4.
- Show it as "Not applicable — email confirmation is off (accounts are confirmed at
  signup)", gated on Q4's result.
- Use CV3's PII-free read only to reconcile account coverage.

---

## 7. Data availability, caps and sampling limitations

### 7.1 Loader defects (shared with Retention V2)
1. **Non-deterministic paging.** `readAllPages` (`loadAnalytics.ts:61`) pages with
   `.range()` over `.order("received_at")` (events), `.order("started_at")` (sessions) and
   `.order("first_seen_at")` (visitors).
   - None of these is unique.
   - Postgres gives no stable order among ties, so rows that tie across a 1,000-row page
     boundary can be read twice or not at all.
   - Distinct-unit sets are mostly immune. **Event counts are not**, and neither are
     `signupCompleted` and `signups`, which count events.
   - Fix: add a unique tiebreaker, `.order("id")` / `.order("session_id")` /
     `.order("visitor_id")`. Scale of the problem: Q6.
2. **Truncation keeps the oldest rows.**
   - Events: ascending from `range.start` up to 50,000 rows, so the most recent rows are
     dropped.
   - Sessions and visitors: read **all-time** under the same cap. The visitors table grows
     with every crawler browser, so it will hit 50k before the 7-day event read does. New
     browsers are then missing, `firstSeen` falls back to sessions (also capped), and
     "new browser" cohorts lose their newest members.
   - Each section already shows `truncated`, and Retention V2 marks a lens unavailable.
     The conversion funnel must do the same.
   - Long-term fix: SQL-side rollups, per the existing handoffs.

### 7.2 History gaps (each step's earliest trustworthy date = its emitter's ship date)
- `signup_completed` via the current producers: FUNNEL1B2. Accounts created earlier are in no cohort (Retention V2 rule).
- `traffic_class`: USERS1. Earlier sessions read `unknown` and sit in the default population.
- Daily `host` provenance on ranked rows: Daily children before it are `legacy_unknown`.
- `daily_challenge_entry_clicked`: Daily entry control only after it shipped.
- `landing_viewed` on `/`: only since MogzyEntryV2 root.
- `analytics_visitor_user_links`: USERS2.3B.

CV2 must take a per-step "available since" date, and must never report a rate whose window
starts before both of its steps' ship dates. The dates come from git history of the
emitters, or from `min(received_at)` per event (Q1).

### 7.3 Delivery loss
- Every B row is fire-and-forget. A failed insert writes only a local diagnostics entry
  (`recordFailure`).
- A lost `signup_completed` removes the account from both account funnels and Retention
  cohorts. It is never misassigned, only dropped.
- Q3 measures that loss against `auth.users`.

### 7.4 Small samples
`MIN_RATE_SAMPLE = 20`: below that, show `k / n`, never a percentage. Keep it.

---

## 8. Read-only verification queries (owner, Supabase SQL editor; nothing writes)

None of these were run in CV1. They return counts only and select no email.

```sql
-- Q1 volume vs the 50k cap, and first-seen date per milestone
select 'events_7d' k, count(*) from analytics_events where received_at >= now() - interval '7 days'
union all select 'events_30d', count(*) from analytics_events where received_at >= now() - interval '30 days'
union all select 'sessions_all', count(*) from analytics_sessions
union all select 'visitors_all', count(*) from analytics_visitors;
select event_name, source_system, min(received_at), count(*) from analytics_events
where event_name in ('landing_viewed','hub_entered','leaguecraft_opened','daily_challenge_entry_clicked',
  'signup_viewed','signup_started','signup_completed','ranked_started','ranked_completed','daily_incomplete')
group by 1,2 order by 1,2;

-- Q2 what signup_completed rows actually carry
select metadata->>'detected_by' detected_by, metadata->>'upgraded_from_guest' from_guest,
  count(*) rows_, count(user_id) with_uid, count(distinct user_id) accounts, count(distinct visitor_id) browsers,
  count(*) filter (where is_guest) is_guest_true
from analytics_events where event_name = 'signup_completed' group by 1,2;

-- Q3 coverage: registered auth accounts with / without a signup_completed row
select count(*) registered,
  count(*) filter (where exists (select 1 from analytics_events e
    where e.event_name = 'signup_completed' and e.user_id = u.id)) with_signup_event
from auth.users u where not u.is_anonymous;

-- Q4 is confirmation effectively automatic? (pending should be ~0 under auto-confirm)
select count(*) filter (where email_confirmed_at is null) pending,
  count(*) filter (where email_confirmed_at is not null) confirmed
from auth.users where not is_anonymous;

-- Q5 can server plays be tied to a browser explicitly?
select event_name, count(*),
  count(*) filter (where visitor_id is not null or metadata ? 'visitor_id') with_visitor,
  count(*) filter (where session_id is not null or metadata ? 'session_id') with_session
from analytics_events where source_system = 'railway' and received_at >= now() - interval '30 days'
group by 1;

-- Q6 how common are received_at ties (paging risk)?
select count(*) tie_groups, coalesce(sum(n),0) rows_in_ties from (
  select received_at, count(*) n from analytics_events group by 1 having count(*) > 1) t;
```

---

## 9. Definitions and the smallest safe CV2–CV4 plan

### 9.1 Browser conversion funnel (CV2, pure function)
- **Cohort:** browsers whose first seen (`firstSeenByVisitor`) falls in the cohort window,
  after the traffic filter. Returning browsers are excluded, so an old browser's past
  isn't read as a new arrival.
- **Window:** W = 7 days from first seen. Eligible only once `first_seen + W ≤ now`.
- **Steps**, each the first occurrence at or after the previous step's time (§5.3–5.4):
  1. **Entered**: every cohort browser (100%).
  2. **Reached Leaguecraft**: `leaguecraft_opened`. Hub and Landing are shown as entry
     context ("arrived via"), not as gating steps.
  3. **Showed play intent**: any mode-open event or `daily_challenge_entry_clicked`.
  4. **Server-confirmed play**: a Railway start correlated under §5.2. If Q5 coverage is
     below an owner-set threshold, this step is **Unavailable**, with the coverage figure,
     rather than a low number.
  5. **Viewed signup**: `signup_viewed`.
  6. **Created an account**: `signup_completed` with this `visitor_id`.
- **Rates:**
  - step conversion = reached(N+1 after N) / reached(N), eligible units only;
  - cumulative = reached(N) / Entered.
- **Drop-off at N** = reached N and did not reach N+1 within W (eligible units only).
  Every eligible browser falls into exactly one "furthest step" bucket, so the buckets sum
  to Entered.
- **Side counts** (not rates): "entered at a later step" per step; too recent; truncated.

### 9.2 Signup form funnel (CV2)
- **Unit:** visitor_id. **Anchor:** first `signup_viewed`. **Window:** 24 h.
- **Steps:** viewed → submitted (`signup_started`) → created (`signup_completed`), ordered.
- **Split:** by `entry_surface` and by `from_guest` / `upgraded_from_guest`.
- **Side count:** completions with no prior view in that browser, e.g. upgrade panels
  outside `/auth`.
- This replaces nothing. The existing unordered `viewToComplete` stays, labelled as it is,
  until the owner decides otherwise (D-7).

### 9.3 Account activation funnel (CV2)
- **Unit:** registered user_id. **Anchor:** first `signup_completed` (same as Retention V2).
- **Rates**, each with a too-recent rule:
  - **Played before signup** (guest upgrades only): an `is_guest=true` Railway start
    received before the anchor, over guest-upgrade accounts. Direct signups are shown as
    "n/a: no guest history".
  - **Activated:** a Railway start with `is_guest=false` in `[anchor, anchor + 7 d)`, over
    accounts at least 7 days old.
  - **Played again:** a Railway start with `is_guest=false` in `[anchor + 24 h, anchor + 8 d)`,
    over accounts at least 8 days old. This is the "played" variant the Retention V2
    handoff listed as a follow-up. The "any signed-in event" return stays in Retention.
  - **Email confirmed:** "Not applicable while confirmation is off" (§6).

### 9.4 Daily inside the funnels
- **Daily started:** a correlated Railway `ranked_started` with host Daily and a parent id.
- **Daily main completed:** the same with `ranked_completed` and `parent_stage_kind='standard'`,
  labelled "(Standard stage)".
- **Whole-run completion:** Unavailable, with reason. It is never approximated from
  children (`UNINSTRUMENTED_ACTIVITIES` already says this).

### 9.5 Plan

**CV2: projections plus the paging fix. Frontend only, no tracking, no migration.**

Files:
- New: `src/lib/admin/analytics/conversion.ts` (`computeBrowserConversion`,
  `computeSignupForm`, `computeAccountActivation`). Each returns sets as well as counts, so
  drill-downs reuse the population pattern.
- New: `src/lib/admin/analytics/conversion.test.ts`.
- Changed: `loadAnalytics.ts`, a tiebreak `.order(...)` only (D-4).
- Imports only, no edits: `cohorts.ts` (reuse the `accountUnits` anchor, exported if needed) and
  `visitorJourney.ts` (reuse `correlatedVisitor`).

Tests:
- out-of-order steps;
- skipped steps feeding "entered later";
- equal timestamps;
- too-recent exclusion;
- duplicate rows;
- shared browser with two accounts;
- one account on two browsers (counted once per lens);
- a Railway row with a conflicting visitor/session;
- a NULL-uid signup row;
- truncation giving unavailable;
- traffic-filter parity;
- account anchors equal to Retention V2's (parity test).

**CV3: PII-free account registry (migration; owner applies). Optional; gate D-5.**
- New migration `admin_account_registry()`: SECURITY DEFINER, `is_owner()` gate, returns
  `user_id, is_anonymous, email_confirmed_at, created_at, is_known_qa` for non-anonymous
  users, with no email.
- A PGlite security test in the style of `src/test/security/funnel1b1AnalyticsSchema.test.ts`:
  anon and authenticated are refused, the owner gets no email column.
- Used for two things:
  1. coverage, "registered accounts without a signup event" (Q3 live);
  2. QA exclusion.
- **Option C** (later, larger, cross-repo): record signups server-side, through a Supabase
  auth hook or the `profiles.is_anonymous` flip, with an idempotent uid key. Needed before
  Confirm email can ever be enabled.

**CV4: UI. Reuse what exists; no new visual system, no chart required.**
- `AudienceSections.tsx`:
  - a new "Conversion (ordered)" panel in the Acquisition section, beside the existing
    table;
  - rename the existing table "Reach by surface (independent)";
  - in Accounts, add a "Signup form (ordered)" table and an "Account activation" grid.
- Components: `AdminPanel`, `Table`, `MetricGrid`/`Metric`, `DrillValue`, `Unavailable`,
  `formatRate`. Definitions are written beside the numbers, as METRIC_DEFINITIONS does now.
- `population.ts`: drill keys `conv:<step>` and `conv-drop:<step>`, resolving to the sets
  from CV2.
- Possibly `metrics.ts`: verification-row copy for auto-confirm (D-1).
- Component tests, and browser checks in CI only (AGENTS.md: no local browsers without
  explicit approval). The owner checks the real `/admin/users` page.

### 9.6 Owner decisions (CV2 starts after D-1 to D-4)

| # | Decision | Recommendation |
|---|---|---|
| D-1 | Email confirmation step | Not applicable while auto-confirm is on. Confirm with Q4. Update the verification copy |
| D-2 | Two funnels (browser, account), never chained; only §5.2 joins | Yes |
| D-3 | Browser cohort = new browsers; W = 7 d; signup form W = 24 h; activation 7 d / played again 24 h–8 d | Yes (values adjustable) |
| D-4 | Fix paging tiebreak in the shared loader (affects Retention V2 numbers slightly) | Yes. It is a correctness fix; Retention tests must stay green |
| D-5 | CV3 registry RPC (migration) | Yes, after CV2 ships; owner applies |
| D-6 | Threshold below which "server-confirmed play" is Unavailable for browsers | Decide after Q5 |
| D-7 | Fix the existing `visitorsByUser` fan-out and event-count "Accounts created" tiles | Separate small PR after CV4; changes existing numbers |

### 9.7 Risks
- Rates will look lower than the current independent table, because ordering and windows
  remove units. The panel must say why.
- Cohorts of new browsers are dominated by single-page crawlers that the traffic class
  misses. They sit in `unknown`, which is in the default population. Show the Human-only
  filter result beside it.
- The 50k cap: a 30-day or all-time read will likely truncate. The funnel then goes
  unavailable rather than computing on part of the data.
- Delivery lag on Railway rows near `now` makes recent cohorts look worse; the too-recent
  rule covers most of it.

### 9.8 Verification gates
- **CV2 (L1/L2):**
  - the targeted vitest files (conversion, metrics, cohorts, visitorJourney, audience), run
    through `mogzy-guard`;
  - `tsc` with no new diagnostics against the main baseline;
  - no full suite.
- **CV3 (L2, L3 since it touches the auth boundary):**
  - PGlite security test;
  - owner review of the SQL;
  - the owner applies it. Never applied by an agent.
- **CV4 (L2):** component tests, CI browser job, then the owner's real `/admin` check.
- Always: no push, merge or deploy without owner instruction.

---

## 10. CV2 status (2026-10-24): owner approved D-1 to D-4

**Built** (frontend only; no tracking, no migration, no UI yet):
- `src/lib/admin/analytics/conversion.ts`: three pure projections, each returning the unit sets behind every number so CV4 drill-downs can reuse them.
  - `computeBrowserConversion`:
    - new browsers, 7-day window, ordered steps Entered → Leaguecraft → Chose a game → Server-confirmed play → Viewed signup → Created an account;
    - per step: `reached`, `enteredLater`, `dropped`, `stepRate`, `cumulativeRate`;
    - `furthest` buckets (they sum to eligible);
    - `serverPlayCoverage` (input for D-6);
    - Daily stage-start / Standard-completion rates.
  - `computeSignupForm`:
    - first `signup_viewed`, 24 h window, viewed → submitted → created in order;
    - split by entry surface and by origin;
    - `completedWithoutView` as a side set.
  - `computeAccountActivation`:
    - the Retention V2 account anchor (`accountSignupAnchors`, parity-tested against `computeCohortRetention`);
    - played before signup (guest upgrades only, a floor);
    - activated within 7 days;
    - played again from 24 h to 8 days;
    - email confirmation marked not applicable (D-1).
  - Every projection returns `unavailableReason` when any capped read was truncated.
- `src/lib/admin/analytics/conversion.test.ts`: 22 cases covering:
  - order and equal-timestamp rules;
  - entered-later;
  - too-recent;
  - per-unit window;
  - returning browsers excluded;
  - duplicates and repeat sessions;
  - no UID fan-out;
  - session correlation and conflicting ids;
  - browser-authored gameplay ignored;
  - furthest buckets;
  - Daily attribution;
  - truncation;
  - signup-form ordering and windows;
  - anchor parity;
  - shared browser;
  - email confirmation not applicable.
- `src/lib/admin/analytics/loadAnalytics.ts` (D-4): each paged read now ends its order with the primary key (`id`, `session_id`, `visitor_id`), so offset pages are stable on timestamp ties. Which rows a capped read keeps (the oldest 50k) is unchanged.

**Not changed:**
- `metrics.ts`, `cohorts.ts`, `visitorJourney.ts`, Daily History: imported only.
- The existing tiles (D-7).

**Next:** CV4 UI (§9.5) after the owner sets D-6 (server-play coverage threshold), using Q5. CV3 is optional (D-5).
