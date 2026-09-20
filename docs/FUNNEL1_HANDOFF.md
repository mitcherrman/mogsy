# FUNNEL1 — Analytics & Funnel Reality Audit (Phase 1A)

**State: FUNNEL1B2 CLOSED and live. FUNNEL1B3 + B3.1 IMPLEMENTED, AWAITING
SECRET CONFIG AND DEPLOY.**

The web funnel is in production and proven end to end (§19). The gameplay half
— authoritative milestones emitted from Railway through a transactional outbox
— is built and tested on branch `funnel1b3-gameplay-analytics` @ `f43dcd7d`.

**B3.1 corrected its delivery seam** (§21): Railway no longer needs a
service-role key, which Lovable Cloud does not expose anyway. It posts to a
dedicated `railway-analytics-ingest` edge function holding one narrow secret,
and the privileged credential never leaves Lovable Cloud.

**Not deployed.** It needs `RAILWAY_ANALYTICS_INGEST_SECRET` created and set in
both Lovable Cloud and Railway, the function deployed, and the branch merged —
none of which this environment can do (§21.8–21.9). Until then Railway records
every milestone durably and delivers nothing, which is the safe direction.
**§20 is the design; §21 is the current state; FUNNEL1C is scoped in §20.13.**

The schema is live in `kewgjwrzpzpeltwidvuc`, all eight certification items are
closed from both the anon client path and privileged access, and the store was
cleaned transactionally back to **zero rows** — a certified, empty baseline
before the first real visitor (**§15.8**).

The Lovable production ref is **`main`** (§16.4, from direct evidence), and the
live bundle at `mogzy.lol` is `index-BgKO9opI.js` — it contains
`analytics_events` and no longer contains `funnel_events`. A real visit through
Landing → Hub → Leaguecraft on the deployed site produced exactly three
canonical rows sharing one visitor and one session, with first-touch and
session-touch attribution intact, and the privileged read-back confirmed every
field (§18.7).

Seventeen real analytics events now exist in production, all from genuine
visitors, all under the corrected contract. No test rows remain.

**Read §19 for closure and the B3 handoff.**

Production baseline: **2026-09-20**. The schema was certified empty at
11:27:52Z and the instrumented frontend shipped the same day, so real funnel
data begins there and everything before it is permanently zero (§5) — there is
nothing to backfill and nothing to exclude.

Sections 1–13 are the FUNNEL1A audit, retained unedited: they are the evidence
the design rests on, and rewriting them to match the outcome would destroy the
record of what was actually found. §14 is the B1 contract and schema, §15 the
B2 instrumentation and database certification, §16–§18 the integration,
publish and the one semantics fix — **§19 is closure.**
Where a phase departed from a proposal in §9, it says so and says why.

**SHA note:** every commit hash in §14 and §15 predates the B2.5 rebase and no
longer resolves. The mapping is in §16.1; contents are unchanged.

FUNNEL1A itself implemented, migrated, renamed and refactored nothing; that
document and the audit behind it were its only deliverables.

Audited against `origin/main` (`84de68ef`, frontend `mitcherrman/mogsy`),
`origin/master` (`8227e4a3`, backend `mitcherrman/League_Combat_Simulator`),
and the live Supabase project `kewgjwrzpzpeltwidvuc` on 2026-09-20.

---

## 1. Objective

Establish, from evidence rather than plan documents, exactly:

what we measure → where it is emitted → where it is stored → what identity and
attribution exist → whether it is trustworthy → what should survive into the
canonical FUNNEL1 architecture.

Then freeze one analytics contract before any implementation, so Mogzy does not
acquire a second analytics system beside the one it already has.

---

## 2. Ownership boundaries (confirmed, unchanged by this audit)

| Domain | Owner | Status |
|---|---|---|
| Acquisition, navigation, intent, session telemetry | Frontend (`mogsy`) | FUNNEL1 owns |
| Frontend / auth / site analytics store | Supabase `kewgjwrzpzpeltwidvuc` | FUNNEL1 owns |
| Quiz session start/complete truth | Railway `quiz_sessions` | FUNNEL1 **consumes**, never redesigns |
| Ranked match truth | Railway `ranked_matches` / `ranked_participants` / `ranked_results` | FUNNEL1 **consumes** |
| Champion Mastery truth | Railway `mastery_sessions` | FUNNEL1 **consumes** |
| Daily Score Attack truth | Railway `dsa_runs` | FUNNEL1 **consumes** |
| Meta Reflex truth | Supabase `league_swipe_*` | FUNNEL1 **consumes** |
| Verification feature itself | Future VERIFY workstream | FUNNEL1 only prepares the analytics contract |
| Admin information architecture | ADM registry workstream | FUNNEL1 adds one destination, redesigns nothing |

---

## 3. Important decisions taken in this phase

1. **`origin/main` is authoritative, not the local clone.** The local working
   copy of `mogsy` is **11 ahead / 43 behind** `origin/main` with uncommitted
   changes. Every finding below was read from `origin/main` via `git show`.
2. **`funnel_events` is dead in production.** Proven, not inferred (§5). All
   frontend funnel telemetry is currently a silent no-op.
3. **Repair, do not rebuild.** The emitter (`trackFunnelEvent`) is a sound
   fire-and-forget shape with a correct silent-fail contract. FUNNEL1 should
   apply the missing table and extend the row, not introduce a second system.
4. **Gameplay completion is backend truth.** Client `quiz_completed` /
   `dsa_run_completed` events are intent signals only; `quiz_sessions`,
   `ranked_results`, `dsa_runs` and `mastery_sessions` are the counted truth.
5. **Return usage is derived, never clicked.** No `returned` event. Derive from
   session records and `profiles.last_seen_at`.

---

## 4. Relevant files and tables

### Frontend — emitters
- `src/lib/funnel-analytics.ts` — the only event emitter; 44 event names; writes `public.funnel_events`
- `src/lib/ads/analytics.ts` — ad lifecycle, rides `trackFunnelEvent` (therefore also dead)
- `src/lib/ad-analytics.ts` — **legacy, separate**, writes `public.ad_events` (alive)
- `src/pages/LolHub.tsx:550,668` — `lol_landing_viewed`, `lol_start_quiz_clicked`
- `src/pages/Quiz.tsx:820,880,951,1028,1030,1088,1530` — practice quiz + DSA CTA
- `src/pages/Auth.tsx:80,272` — `auth_signup_viewed_from_quiz`, `auth_signup_completed_from_quiz`
- `src/components/quiz/QuizSignUpGate.tsx:21,94,105` — gate shown / clicked / dismissed
- `src/components/hud/GlobalHud.tsx:211`, `src/components/hud/MogzyIdentityMenu.tsx:1027` — HUD signup CTAs
- `src/pages/dev/daily-score-attack/DailyScoreAttackPage.tsx:94` — DSA event bridge
- `src/components/quiz/builder/*`, `src/components/quiz/trends/*` — Premium product telemetry (PT1.7/PT1.8)

### Frontend — silent surfaces (zero telemetry)
- `src/pages/dev/mogzy-entry-v2/MogzyEntryV2.tsx` — **the real landing** (`/` under `LEAGUE_ONLY_MODE`)
- `src/components/quiz/LeaguecraftHub.tsx` — no canonical open event
- `src/pages/quiz-ranked/QuizRankedMatch.tsx`, `useRankedMatch.ts` — none
- `src/pages/LeagueSwipeGame.tsx` (Meta Reflex), `src/pages/quiz-mastery/*` (Champion Mastery) — none

### Supabase (live, project `kewgjwrzpzpeltwidvuc`)
- `funnel_events` — **DOES NOT EXIST** (migration present in source only)
- `ad_events` — exists, legacy Swipe-era ad ledger
- `image_clicks`, `daily_global_sessions`, `matches`, `leagues`, `global_elo_snapshots` — Arena / Match & Rank era
- `profiles` — identity; **includes one row per anonymous session**
- `user_identity_links`, `identity_link_attempts`, `identity_link_pending` — VERIFY1 infrastructure (Discord / Riot)
- `league_swipe_*` — Meta Reflex truth
- `supabase/migrations/20260710130000_funnel_events.sql` — the unapplied migration

### Railway (SQLite, `/data`)
- `quiz_sessions` (+ `quiz_attempts`) — Practice Quiz truth; `routes/quiz.py:892,922`
- `ranked_matches`, `ranked_participants`, `ranked_rounds`, `ranked_results`, `ranked_queue_entries`, `ranked_ratings`
- `mastery_sessions`, `mastery_session_answers`
- `dsa_challenges`, `dsa_runs`, `dsa_run_answers`

### Admin
- `src/lib/admin/admin-registry.ts` — **the authoritative registry** (2158 lines, self-describing, route-tested)
- `src/lib/admin/admin-directory.ts` — legacy, still imported, renders only at `/admin/legacy-directory`
- `src/components/admin/AdminStats.tsx` — Arena-era counters
- `src/lib/admin-data-sources.ts` — 34 graphs behind `/admin/data`
- `src/pages/admin/AdminDemoAnalytics.tsx` — **not acquisition analytics**

---

## 5. The `funnel_events` discrepancy — resolved

**Verdict: the migration was committed to source on 2026-07-10 and never
applied to the production Supabase project. `public.funnel_events` does not
exist. Every `trackFunnelEvent(...)` call in production fails silently and
writes nothing. There is, and has never been, any funnel data.**

Three independent lines of evidence:

1. **Live PostgREST probe** (read-only `GET ?limit=1`, anon key, no mutation):
   ```
   funnel_events   HTTP 404  PGRST205 "Could not find the table
                             'public.funnel_events' in the schema cache"
                             hint: "Perhaps you meant the table 'public.ad_events'"
   ad_events       HTTP 200  []          ← exists, RLS-filtered
   image_clicks    HTTP 200  []          ← exists
   profiles        HTTP 401  42501       ← exists, RLS denied
   ```
2. **Generated Supabase types** (`src/integrations/supabase/types.ts`,
   regenerated 2026-09-14 — *two months after* the migration) contain 74 public
   tables. `funnel_events` is not among them.
3. **The emitter itself documents the symptom**: `funnel-analytics.ts` casts
   `supabase as any` with the comment *"Table is newer than the generated
   Supabase types… `ad_events` no longer needs this — `funnel_events` still
   does."* The cast is not a type-generation lag; it is the code routing around
   a table that was never created.

The frontend **is** connected to the inspected project: `.env`
`VITE_SUPABASE_PROJECT_ID` = `kewgjwrzpzpeltwidvuc` = `supabase/config.toml`
`project_id`. The discrepancy is not a wrong-project artefact.

Secondary finding: `supabase/migrations/20260710120000_broadcast_live_state.sql`
and `20260710120000_league_swipe.sql` **share a timestamp**, and the funnel
migration sits immediately after them. Whatever push applied that batch is the
place to look for why one file was skipped.

---

## 6. Audit matrix

Identity columns available *today* on each record. `anon` = durable anonymous
visitor id; `user` = account id; `session` = web session id; `attrib` =
source/UTM.

| Concept | Current event / table | Emitter / source | Datastore | Anon id | User id | Session id | Attribution | Authoritative? | Classification | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|
| Landing (`/`) | — | `MogzyEntryV2.tsx` emits nothing | — | ✗ | ✗ | ✗ | ✗ | — | `MISSING` | Add `landing_viewed`; it is the top of the funnel and is invisible |
| Hub entered (`/lol`) | `lol_landing_viewed` | `LolHub.tsx:550` | `funnel_events` (absent) | ✗ | partial | ✗ | ✗ | No | `MISNAMED_LEGACY` | Rename to `hub_entered`; `/lol` has been the Hub, not the landing, since the root entrance shipped |
| Leaguecraft opened | `lol_start_quiz_clicked` | `LolHub.tsx:668` | `funnel_events` (absent) | ✗ | partial | ✗ | ✗ | No | `MISNAMED_LEGACY` | CTA-click proxy only; add a real `leaguecraft_opened` on `LeaguecraftHub` mount and keep the CTA as an intent event |
| Practice Quiz started | `quiz_guest_started` | `Quiz.tsx:820,880` | `funnel_events` (absent) | ✗ | partial | ✗ | ✗ | No | `USEFUL_LEGACY` | Keep as intent; count from backend |
| Practice Quiz started (truth) | `quiz_sessions` row | `POST /api/quiz/sessions` (`routes/quiz.py:892`) | Railway | ✗ | ✓ (JWT subject) | ✓ (`session_id`) | ✗ | **Yes** | `AUTHORITATIVE_BACKEND` | Canonical. Carries `is_guest_at_time`, `started_at`, `mode` |
| Practice Quiz completed | `quiz_completed` / `quiz_results_viewed` | `Quiz.tsx:1028,1030` | `funnel_events` (absent) | ✗ | partial | ✗ | ✗ | No | `DUPLICATE` | Two events for one moment; neither counted |
| Practice Quiz completed (truth) | `quiz_sessions.completed_at` | `POST /api/quiz/sessions/{id}/complete` | Railway | ✗ | ✓ | ✓ | ✗ | **Yes** | `AUTHORITATIVE_BACKEND` | Canonical; backend computes duration |
| Ranked opened | — | none | — | ✗ | ✗ | ✗ | ✗ | — | `MISSING` | Add `ranked_opened` on `/quiz/ranked` |
| Ranked match started | `ranked_matches` / `ranked_participants` | backend matchmaking | Railway | ✗ | ✓ | ✓ (`match_id`) | ✗ | **Yes** | `AUTHORITATIVE_BACKEND` | Canonical. `ranked_queue_entries` is ephemeral (unique live row per user) — not a durable "queued" record |
| Ranked match completed | `ranked_matches.status='complete'`, `ranked_results` | backend | Railway | ✗ | ✓ | ✓ | ✗ | **Yes** | `AUTHORITATIVE_BACKEND` | Canonical, with `completion_reason` |
| Signup viewed | `auth_signup_viewed_from_quiz` | `Auth.tsx:80` | `funnel_events` (absent) | ✗ | ✗ | ✗ | ✗ | No | `MISNAMED_LEGACY` | Quiz-scoped name on a global route; generalise to `signup_viewed` + `entry_surface` |
| Signup completed | `auth_signup_completed_from_quiz` | `Auth.tsx:272` | `funnel_events` (absent) | ✗ | ✓ | ✗ | ✗ | No | `MISNAMED_LEGACY` | Same; also only fires on the email path — OAuth signup is untracked |
| Signup completed (truth) | `profiles` row with `is_anonymous=false` | `handle_new_user` trigger | Supabase | ✗ | ✓ | ✗ | ✗ | **Yes** | `AUTHORITATIVE_BACKEND` | Canonical, **but see §8 — the anon-row bias** |
| Signup gate | `quiz_signup_gate_shown` / `_clicked` / `quiz_guest_continue_clicked` | `QuizSignUpGate.tsx:21,94,105` | `funnel_events` (absent) | ✗ | partial | ✗ | ✗ | No | `USEFUL_LEGACY` | Good shape; keep, retarget to the new store |
| HUD signup CTA | `hud_signup_chip_clicked` / `_menu_clicked` | `GlobalHud.tsx:211`, `MogzyIdentityMenu.tsx:1027` | `funnel_events` (absent) | ✗ | partial | ✗ | ✗ | No | `USEFUL_LEGACY` | Keep |
| Verification (email) | `auth.users.email_confirmed_at` | Supabase Auth | Supabase | ✗ | ✓ | ✗ | ✗ | **Yes** | `AUTHORITATIVE_BACKEND` | Truth exists; no funnel event |
| Verification (Discord / Riot) | `user_identity_links.verified_at` | `identity_link_redeem` RPC | Supabase | ✗ | ✓ | ✗ | ✗ | **Yes** | `AUTHORITATIVE_BACKEND` | Completion truth per provider |
| Verification started / failed | `identity_link_attempts`, `identity_link_pending` | ceremony tables | Supabase | ✗ | ✓ | ✓ (ticket) | ✗ | Partly | `USEFUL_LEGACY` | **Single-use and purged on expiry** — cannot serve as a durable started/failed record. Needs its own events |
| Returning usage | `profiles.last_seen_at` | profile update | Supabase | ✗ | ✓ | ✗ | ✗ | Partly | `USEFUL_LEGACY` | Last value only — supports "active in 24h/7d", cannot support D1/D7 cohorts or repeat-session counts |
| Sessions (web) | — | none | — | ✗ | ✗ | ✗ | ✗ | — | `MISSING` | No web session concept exists anywhere |
| `daily_global_sessions` | table | legacy ELO RPCs | Supabase | ✗ | ✓ (`profile_id`) | ✗ | ✗ | For its own purpose | `MISNAMED_LEGACY` | **Not web sessions.** A per-day play-limit ledger, unique on `(profile_id, league_id, session_date)`, for the retired global-ELO league product. Do not use |
| Referrer / source | — | none | — | ✗ | ✗ | ✗ | ✗ | — | `MISSING` | `document.referrer` is read nowhere in `src/` |
| UTM source/medium/campaign/content/term | — | none | — | ✗ | ✗ | ✗ | ✗ | — | `MISSING` | Zero occurrences of `utm_*` in the entire frontend and Supabase tree |
| Meta Reflex (`/league-swipe`) | `league_swipe_results`, `league_swipe_games` | `record_league_swipe_result` RPC | Supabase | ✗ | ✓ | ✓ (game) | ✗ | **Yes** | `AUTHORITATIVE_BACKEND` | Play truth exists; **no open/start funnel event** |
| Champion Mastery (`/quiz/mastery`) | `mastery_sessions` | backend | Railway | ✗ | ✓ (`owner_id`) | ✓ | ✗ | **Yes** | `AUTHORITATIVE_BACKEND` | Play truth exists; no funnel event; route is `ProtectedRoute` so guests never appear |
| Daily Score Attack | `dsa_*` events (12 names) | `DailyScoreAttackPage.tsx:94` | `funnel_events` (absent) | ✗ | partial | ✗ | ✗ | No | `USEFUL_LEGACY` | Best-shaped event family in the codebase; retarget it |
| Daily Score Attack (truth) | `dsa_runs` | backend | Railway | ✗ | ✓ | ✓ (`run_id`) | ✗ | **Yes** | `AUTHORITATIVE_BACKEND` | Canonical; has `user_is_anonymous`, `official`, `status` |
| Ads (new) | `ad_slot_*`, `house_ad_clicked` | `src/lib/ads/analytics.ts:32` | `funnel_events` (absent) | ✗ | partial | ✗ | ✗ | No | `DUPLICATE` | Second ad analytics path, currently dead |
| Ads (legacy) | `ad_events` | `src/lib/ad-analytics.ts:14` | Supabase | ✗ | ✓ (`profile_id`) | ✗ | ✗ | Yes, for ads | `USEFUL_LEGACY` | The live one. Two ad systems exist; reconcile |
| `image_clicks` | table | `SwipePreset.tsx:612` | Supabase | ✗ | ✓ | ✗ | ✗ | For its own purpose | `USEFUL_LEGACY` | Arena preset-image clicks. Not funnel. Do not surface in FUNNEL1 |
| Practice Builder / Trends | 14 `practice_builder_*` / `trends_*` | PT1.7 / PT1.8 components | `funnel_events` (absent) | ✗ | ✓ | ✗ | ✗ | No | `USEFUL_LEGACY` | Premium product telemetry, not acquisition. Keep out of the FUNNEL1 macro set |

---

## 7. Admin audit

- **Authoritative registry: `src/lib/admin/admin-registry.ts`.** It declares
  itself the single descriptive source of truth, enumerates ten areas, and is
  held to `App.tsx` by `admin-registry.routes.test.ts`. `admin-directory.ts`
  survives as data for `/admin/legacy-directory`; `/admin/directory` is a
  permanent `<Navigate>` alias to `/admin/all-tools`.
- **Quiz Review duplication is already solved structurally.**
  `/admin/quiz-content` (`AdminQuizWorkspace`) is the workspace;
  `/admin/quiz-review` and `/admin/quiz-builder` are `QuizContentRedirect`
  shims, and `/admin/workspace` is a `<Navigate>`. No FUNNEL1 work needed.
- **Compatibility redirects only:** `/admin/directory`, `/admin/quiz-review`,
  `/admin/quiz-builder`, `/admin/workspace`.
- **"Demo Analytics" (`/admin/demo-analytics`) is not acquisition analytics.**
  It is PT1.9: a `master_admin`-gated Free-vs-Premium **product-tier preview**
  that renders the real `PerformanceTrendsPane` against one synthetic demo
  account. It is irrelevant to FUNNEL1 and must not be mistaken for it.
- **`/admin/data`** (Operations › Data Operations) is 34 graphs in
  `admin-data-sources.ts`. Categories: Users (5), Matches (4), Elo & Rank (6),
  Items (4), Features (6), Comments (3), Ads (6). **Nothing about Leaguecraft,
  Practice Quiz, Ranked, Mastery or DSA. Nothing about acquisition.** It is
  Match & Rank / Arena-era plus legacy ads.
- **`AdminStats.tsx`** renders six counters: Users, Bots, Leagues, Matches,
  Preset Items, Image Clicks — entirely Arena-era.
- **Still-visible Arena metrics:** `AdminStats`, all `/admin/data` Matches /
  Elo & Rank / Items / Comments sources, `AdminPlayLeagueItems`, `AdminPlay`.
  These should be labelled as the archived Arena product, not promoted.

**Conclusion for later design:** there is currently **no** acquisition-analytics
destination in Admin. FUNNEL1 should add exactly one, under Overview, and leave
`/admin/data`, `AdminStats` and Demo Analytics where they are.

---

## 8. Data-quality and statistical assessment

| Metric | Supportable today? | Why |
|---|---|---|
| Unique visitors | **No** | No `visitor_id`. Anonymous Supabase uids are per-browser-storage and minted only once a user reaches the Hub/Quiz/Swipe — never on the landing page |
| Sessions | **No** | No web-session concept exists. `daily_global_sessions` is a play-limit ledger, not a session |
| Guest → signup stitching | **Partially, and better than expected** | `Auth.tsx:431` upgrades the guest identity **in place**, so the Supabase uid survives signup. Backend `quiz_sessions.user_id` and `dsa_runs.user_id` therefore stitch across the boundary for free. This is the single strongest asset in the current model |
| First-touch acquisition | **No** | Nothing captures referrer or UTM, ever |
| Current/session-touch acquisition | **No** | Same |
| Funnel conversion rates | **No** | The top three steps (landing, hub, Leaguecraft open) are missing, misnamed, or written to a table that does not exist |
| Mode engagement | **Yes, from backend only** | `quiz_sessions`, `ranked_matches`, `mastery_sessions`, `dsa_runs`, `league_swipe_results` are all sound. They are split across two databases and one is SQLite on Railway |
| Account creation | **Biased — actively wrong today** | `handle_new_user` inserts a `profiles` row for **every anonymous session** (`20260222072457`). `admin-data-sources.ts:48` `user_signups` counts `profiles.created_at` filtered only by `is_bot=false`, **not** `is_anonymous=false`. Reported signups are inflated by every guest who ever loaded the Hub. This is a live, visible defect |
| Verification conversion by type | **Completion only** | `user_identity_links.verified_at` + `auth.users.email_confirmed_at` give completions per provider. There is no started/failed record: `identity_link_attempts` and `identity_link_pending` are single-use and purged by `identity_link_purge_expired` |
| D1 / D7 return | **No** | `profiles.last_seen_at` is a single overwritten timestamp. It answers "active in the last N days"; it cannot reconstruct a cohort |
| Repeat sessions | **No** | No session records to repeat |
| Guest vs signed-in | **Yes, from backend** | `quiz_sessions.is_guest_at_time` and `dsa_runs.user_is_anonymous` snapshot guest-ness at the moment of play — exactly the right shape |
| Source / medium / campaign / content | **No** | No attribution data of any kind exists |

### Additional risks

- **Silent failure by design.** `trackFunnelEvent` swallows every error. The
  table has been missing for over two months with no signal. Whatever FUNNEL1B
  builds needs a way to notice this — a migration assertion, a smoke test, or
  an Admin freshness indicator.
- **Anonymous-user purging destroys history.** `purge-anonymous-users` deletes
  anon accounts. Any metric computed from `profiles` is non-reproducible across
  a purge, and backend rows keyed to a purged uid become orphans.
- **Two ad analytics systems.** `ad_events` (live) and `ad_slot_*` via
  `funnel_events` (dead). Reconcile before either is reported on.
- **Cross-database joins.** Funnel events would live in Supabase (Postgres);
  quiz/ranked/mastery/DSA truth lives in SQLite on Railway. There is no join
  path today. The contract must decide where the funnel is assembled.
- **`quiz_completed` and `quiz_results_viewed` fire from the same block** with
  the same payload. Counting both would double-count completion.
- **Champion Mastery is behind `ProtectedRoute`.** Guests cannot reach it, so
  it can never appear in a guest funnel. That is a product fact, not a gap.

---

## 9. Proposed frozen canonical contract (for approval — not implemented)

### 9.1 Macro events (frontend-emitted, intent and navigation only)

```
landing_viewed
hub_entered
leaguecraft_opened
mode_opened            { mode }     # practice | ranked | meta_reflex | mastery | dsa
signup_viewed          { entry_surface }
signup_completed       { method }   # email | oauth_discord | oauth_riot
verification_started   { verification_type }
verification_completed { verification_type }
verification_failed    { verification_type, reason }
```

`verification_type` ∈ `email | discord | riot_account | <future>` — an open
string, never an enum that a new method has to migrate.

Mode *start* and *complete* are **not** frontend events. They are read from the
authoritative stores. `mode_opened` is the only mode event the client owns.

Existing `quiz_*`, `dsa_*`, `practice_builder_*`, `trends_*` and `ad_slot_*`
events survive as **product telemetry**, retargeted to the repaired store but
excluded from the macro funnel.

### 9.2 Identity model

- `visitor_id` — UUID, first-party, `localStorage`, minted on **first paint of
  any page including `/`**. Survives signup. Never reset by auth changes.
- `user_id` — Supabase uid when a session exists. Because guest upgrade is
  in-place, this is already continuous across signup.
- `is_guest` — snapshot at emission, as today.
- Stitching key: `visitor_id`. `user_id` backfills the visitor's history.

### 9.3 Session model

- `session_id` — UUID in `sessionStorage`, 30-minute inactivity timeout,
  emitted on every event. This is what makes sessions, repeat sessions and
  D1/D7 possible; nothing today can substitute for it.
- Return usage is **derived** from distinct session days per `visitor_id` /
  `user_id`. No `returned` event.

### 9.4 Attribution model

Captured once per session on first event:

- **First touch** (written once per `visitor_id`, never overwritten):
  `first_referrer`, `first_utm_source/medium/campaign/content/term`,
  `first_landing_path`, `first_seen_at`
- **Current touch** (per session): `referrer`, `utm_source`, `utm_medium`,
  `utm_campaign`, `utm_content`, `utm_term`, `landing_path`

### 9.5 Authoritative gameplay rules

| Question | Answered by |
|---|---|
| Did a practice quiz start / complete? | `quiz_sessions.started_at` / `.completed_at` |
| Did a ranked match start / complete? | `ranked_participants.joined_at` / `ranked_matches.status='complete'` |
| Did a mastery session run? | `mastery_sessions` |
| Did a DSA run happen? | `dsa_runs.status` |
| Did a Meta Reflex game happen? | `league_swipe_results` |
| Was the player a guest at the time? | `is_guest_at_time` / `user_is_anonymous` |
| Is someone verified, and how? | `auth.users.email_confirmed_at`, `user_identity_links.provider` + `.verified_at` |

A client completion event is never counted as a completion.

### 9.6 Store shape

Repair `public.funnel_events` (apply the existing migration) and extend it with
`visitor_id`, `session_id`, `referrer`, the five `utm_*` columns, and the
`first_*` attribution set. One table, one emitter, no second system.

---

## 10. Overlap and conflict risks with other workstreams

| Workstream | Risk | Mitigation |
|---|---|---|
| VERIFY (Discord/Riot linking) | FUNNEL1 defines `verification_*` events before the feature ships | Contract only; VERIFY emits them when it builds. No schema claim on `user_identity_links` |
| ADM (Admin registry) | A new Analytics destination could re-fragment Admin nav | Register **one** destination under Overview via `admin-registry.ts`; touch nothing else |
| Ranked / Leaguecraft | Adding telemetry could be read as redesigning those systems | FUNNEL1 adds `ranked_opened` / `mode_opened` at the route boundary only; it reads `ranked_*` and never writes |
| PT1.x (Premium tiers) | `practice_builder_*` / `trends_*` share the emitter | Keep them on the emitter, keep them out of the macro funnel |
| Ads | Two systems, one dead | Decide `ad_events` vs `funnel_events` before reporting on either |
| Auth3 / account upgrade | A change to in-place guest upgrade would silently break stitching | Record the dependency; add a test that asserts uid continuity across signup |
| Arena / Match & Rank (archived) | Its metrics are the most visible ones in Admin and look like analytics | Label as archived; never promote into FUNNEL1 |

---

## 11. Work completed in this phase

- Located and verified both repositories against their remotes.
- Read `origin/main` (frontend) and `origin/master` (backend) directly rather
  than the divergent local worktrees.
- Enumerated all 44 frontend event names and all 34 `trackFunnelEvent` call
  sites.
- Confirmed zero telemetry on the landing page, Leaguecraft Hub, Ranked, Meta
  Reflex and Champion Mastery.
- Proved the `funnel_events` production discrepancy three ways.
- Enumerated the live Supabase public schema (74 tables, 2 views, 47 functions).
- Enumerated the authoritative Railway gameplay tables and their write paths.
- Audited the Admin registry, routes, redirects, `/admin/data`, `AdminStats`
  and Demo Analytics.
- Identified the `user_signups` anonymous-profile inflation defect.
- Produced the audit matrix and the proposed contract above.

## 12. Tests / checks performed

| Check | Method | Result |
|---|---|---|
| Table existence in production | Read-only PostgREST `GET ?limit=1`, anon key, 9 tables | `funnel_events` 404 PGRST205; `ad_events` / `image_clicks` 200; `profiles` / `user_roles` / `daily_global_sessions` 401 (exist, RLS) |
| Frontend ↔ Supabase project identity | `.env` vs `supabase/config.toml` | Both `kewgjwrzpzpeltwidvuc` — same project |
| Generated types vs migration | `types.ts` (2026-09-14) vs migration (2026-07-10) | `funnel_events` absent from types generated two months later |
| Attribution coverage | `git grep -iE "utm_source\|utm_medium\|utm_campaign\|document.referrer\|visitor_id"` over `src/` and `supabase/` | Two hits, neither analytics (`previewAuthStorage.ts`, `Feedback.tsx`) |
| Emitter coverage | `git grep -n "trackFunnelEvent("` on `origin/main` | 34 call sites, 0 in landing / Leaguecraft / Ranked / Meta Reflex / Mastery |
| Backend write paths | Read `routes/quiz.py`, `routes/ranked_public.py`, migration DDL | `quiz_sessions` written from verified JWT subject; ranked tables server-owned |
| Test coverage of analytics | `git ls-tree` for `funnel` | **No test file exists for `funnel-analytics.ts`** |

**No production mutation was performed. No secrets were printed or
transmitted.** The only network calls were read-only `GET`s with the
already-public `VITE_SUPABASE_PUBLISHABLE_KEY`.

---

## 13. Unresolved questions (need owner decisions)

1. **Why was the migration never applied?** Deploys appear to run through
   Lovable Publish rather than `supabase db push`. Is there a migration-apply
   step at all, and what else in the 2026-07-10 batch was skipped?
2. **Where is the funnel assembled?** Supabase holds events; Railway holds
   gameplay truth in SQLite. Options: (a) Railway pushes completion summaries
   to Supabase, (b) Admin joins client-side, (c) a scheduled reconciliation job.
   This is the largest architectural decision left.
3. **Retention / PII posture for `visitor_id`.** Is a durable first-party
   visitor cookie acceptable, and does it need a consent gate for EU traffic?
4. **Ads:** keep `ad_events`, migrate it into the funnel store, or run both?
5. **Backfill:** accept that pre-FUNNEL1 funnel history is permanently zero?
6. **`user_signups` defect:** fix now as a one-line correctness bug, or fold it
   into FUNNEL1B?
7. **Local `main` divergence:** the local `mogsy` clone is 11 ahead / 43 behind
   `origin/main` with uncommitted work in `CombatLab`, `ProPlay` and `index.css`.
   That needs reconciling before FUNNEL1B branches from it.

---

## 14. Next task — smallest safe FUNNEL1B

Ordered so each step is independently verifiable and reversible.

1. **Approve the §9 contract.** Nothing below starts until it is frozen.
2. **Apply the table.** Add a forward-only migration that creates
   `public.funnel_events` *if absent* **and** adds the contract columns
   (`visitor_id`, `session_id`, `referrer`, five `utm_*`, first-touch set).
   Keep the existing RLS shape: `anon`+`authenticated` insert, admin read.
   Include a `DO` block that fails the migration if the table is not reachable
   afterwards — the failure mode that hid this for two months must not recur.
3. **Add identity and attribution to the emitter.** One new module for
   `visitor_id` / `session_id` / UTM capture; `trackFunnelEvent` reads it. No
   call site changes. **Add the missing test file.**
4. **Add the four missing macro emissions**, and only these:
   `landing_viewed` (`MogzyEntryV2`), `leaguecraft_opened` (`LeaguecraftHub`),
   `ranked_opened` (`/quiz/ranked`), `mode_opened` (route boundary).
5. **Rename the two stale events** behind a compatibility alias:
   `lol_landing_viewed` → `hub_entered`, `auth_signup_*_from_quiz` →
   `signup_viewed` / `signup_completed` + `entry_surface`. Emit the new name;
   accept the old one for one release.
6. **Cover OAuth signup**, which `Auth.tsx:272` currently misses.
7. **Add one Admin destination** under Overview, registered through
   `admin-registry.ts`, reading only `funnel_events` plus the authoritative
   backend counts. Do not touch `/admin/data`, `AdminStats` or Demo Analytics.
8. **Verify end to end** in production: emit, read the row back, confirm
   identity and attribution columns are populated.

**Explicitly out of scope for FUNNEL1B:** implementing verification, changing
Ranked / Leaguecraft / quiz architecture, redesigning Admin, touching Arena
tables, and building cross-database joins (question 2 above must be answered
first).

---

# 14. FUNNEL1B1 — Analytics contract + schema foundation (IMPLEMENTED)

Branch `funnel1b1-analytics-foundation`, cut from `origin/main` `84de68ef` in a
clean isolated worktree. The divergent local `mogsy` checkout (CombatLab,
ProPlay, `index.css`) was not touched, reset, merged, rebased or stashed —
§13.7 remains open and is somebody else's reconciliation.

**Nothing is instrumented yet and no Admin UI exists.** B1 built the foundation
and stopped, per scope.

## 14.1 What was built

| # | Deliverable | Where |
|---|---|---|
| 1 | Canonical analytics schema | `supabase/migrations/20260920120000_funnel1b1_analytics_foundation.sql` |
| 2 | Canonical event contract | `src/lib/analytics/contract.ts` |
| 3 | Visitor / session identity | `src/lib/analytics/identity.ts` |
| 4 | Attribution | `src/lib/analytics/attribution.ts` |
| 5 | Verification-ready contract | `contract.ts` + `track.ts` |
| 6 | Server authority + idempotency | migration §2/§3, `buildServerEventRow` |
| 7 | RLS | migration RLS section |
| 8 | Typed frontend helper | `src/lib/analytics/*`, entry point `@/lib/analytics` |
| 9 | Tests | 80, all passing (§14.11) |
| 10 | This section | — |

## 14.2 Migration handling — the July file

`supabase/migrations/20260710130000_funnel_events.sql` is **neutralized to an
inert tombstone**: comments only, zero executable statements. It was not
deleted and its DDL was not kept.

Reasoning. Migrations in this project are applied **by hand through the Lovable
Cloud SQL Editor** — stated in `20260913120000_fb1_in_product_reporting.sql` —
so there is no `supabase_migrations.schema_migrations` ledger row to reconcile
and no checksum to invalidate; editing the file is safe in a way it would not
be under `supabase db push`. Deleting it would lose the record that the next
person needs in order not to rediscover the same 404. Keeping it as DDL would
let a folder replay create a dead `funnel_events` beside the live
`analytics_events`, which is the exact duplicate-table outcome B1 was required
to avoid. The tombstone keeps the ordering and the history and executes
nothing; a test runs it against the live schema and asserts no table appears.

**This answers §13.1 only for this file.** Whether anything *else* in the
2026-07-10 batch was skipped is still unverified.

## 14.3 Schema

Three tables, not one and not six.

| Table | Grain | Purpose |
|---|---|---|
| `analytics_events` | one row per event | the append-only ledger |
| `analytics_visitors` | one row per visitor | **first-touch** attribution |
| `analytics_sessions` | one row per session | **current-touch** attribution |

**Departure from §9.6**, which proposed repairing `funnel_events` and adding
columns to it. Two reasons. The name stopped describing the contents: the store
holds the funnel, non-funnel product telemetry (`practice_builder_*`,
`trends_*`, `ad_slot_*`) and, from B2, Railway gameplay milestones — calling
that "funnel" would repeat the precise defect the audit flagged in
`lol_landing_viewed`. And flattening attribution onto the event row would have
copied eleven text columns onto every row *and* reduced first-touch
immutability to a client-side promise. Splitting it makes immutability a
database fact (§14.6). There were zero rows and no read path, so nothing was
migrated — the schema was designed.

`analytics_events` columns: `id`, `event_name`, `event_version`, `occurred_at`
(emitter clock), `received_at` (DB clock — group by this one), `route`,
`visitor_id`, `session_id`, `user_id`, `is_guest`, `source_system`,
`source_entity_type`, `source_entity_id`, `verification_type`, `metadata`.

`user_id` is deliberately **not** an FK to `auth.users`: `purge-anonymous-users`
(§8) would otherwise either delete the history or block the purge.
`analytics_sessions.visitor_id` is likewise not an FK — the two rows are written
by independent fire-and-forget inserts, and an FK would let the first one's
failure cascade into losing the second.

Six indexes on events (time, name+time, visitor+time, user+time, session, and
the partial unique idempotency index), two on sessions, one on visitors. A test
asserts the exact index list, so adding one is a deliberate act.

## 14.4 Canonical event contract

**Macro funnel (24 names)** — `src/lib/analytics/contract.ts`:

```
landing_viewed  hub_entered  leaguecraft_opened

practice_quiz_opened  ranked_opened  meta_reflex_opened
mastery_opened        dsa_opened                          <- client-owned intent

practice_quiz_started / _completed    ranked_started / _completed
meta_reflex_started  / _completed     mastery_started / _completed
dsa_started          / _completed                         <- server-authoritative

signup_viewed  signup_started  signup_completed

verification_started  verification_completed  verification_failed
```

Deviations from the brief's suggested list, with reasons:

- `practice_started`/`_completed` -> **`practice_quiz_started`/`_completed`**.
  "Practice" is ambiguous in this product — Practice Quiz, Practice Builder,
  DSA practice run, practice-the-missed loop, three of which already have
  events. Two extra words remove a permanent coin flip.
- **`signup_started` added alongside `signup_viewed`.** Seeing the screen and
  beginning to fill it are different denominators, and the gap between them is
  what distinguishes a bad form from a bad offer.
- **§9.1's `mode_opened { mode }` was not adopted.** Separate names let an
  event-name index answer "how many opened Ranked" with one range scan instead
  of a jsonb filter. The macro set is small enough that naming them is free.
- **No `returned` event**, per the brief. Return is derived from
  `analytics_sessions` grouped by `visitor_id` — correct retroactively,
  impossible to double-fire, and independent of the client's opinion.

**Product telemetry (41 names)** is carried over verbatim so the 34 existing
call sites keep working, and is explicitly excluded from the macro funnel.
`isMacroEvent()` is the boundary.

Two legacy names are **translated at the emitter**, not preserved:
`lol_landing_viewed` -> `hub_entered`, `lol_start_quiz_clicked` ->
`leaguecraft_opened`. `/lol` has been the Hub since the root entrance shipped;
the store now records what happened rather than what the call site still calls
it.

A DB CHECK pins names to `^[a-z][a-z0-9_]{2,63}$` — one shape, unbounded
growth. The same pattern is checked client-side, because a name the CHECK
rejects would otherwise be a 400 swallowed by the silent-fail contract.

## 14.5 Visitor and session

**Visitor.** First-party UUID (`crypto.randomUUID`, with a `getRandomValues`
fallback for non-secure contexts) in `localStorage` under
`mogzy.analytics.visitor.v1`. Minted on first paint of any page including `/`.
Survives navigation, tab close and browser restart. Never reset by an auth
change. **No fingerprinting** — nothing reads a canvas, font list, screen
metric or UA string. Clearing site data makes you a new visitor, by design.

Fallback: if `localStorage` throws (blocked site data, some private windows,
sandboxed iframe) the id lives in memory and the returned state carries
`ephemeral: true`, so an inflated unique-visitor count is detectable rather
than silently trusted.

**Session.** UUID under `mogzy.analytics.session.v1`, **30-minute inactivity**
window.

- *Start*: no live session for this visitor, or the previous one expired, or a
  **new acquisition** arrived (UTM params differing from the live session's).
- *Expiry*: `now - lastActivityAt >= 30min`, measured from last activity, not
  from session start.
- *Persistence*: `localStorage`, holding `{id, visitorId, startedAt,
  lastActivityAt, touch, recorded}`.
- *Renewal*: every event moves `lastActivityAt` **and nothing else**. A route
  transition therefore never starts a session — the failure mode the brief
  named. Twenty transitions in five minutes is one session, and there is a test
  that says so.

**Departure from §9.3**, which proposed `sessionStorage`. `sessionStorage` is
per-tab, so a second tab would become a second session and "sessions per
visitor" would count tabs; and it does not survive a tab discard or browser
restore, so a ten-second interruption would record two sessions. The inactivity
clock does the job `sessionStorage` was being asked to do, consistently across
tabs.

## 14.6 Attribution

**First touch** — `analytics_visitors`, written once per visitor:
`first_landing_path`, `first_referrer`, `first_utm_{source,medium,campaign,content,term}`,
`first_seen_at`.

Immutability is **enforced by the database, not by the frontend**: the table has
an INSERT policy and no UPDATE policy and no DELETE policy for any role below
`service_role`. A later visit cannot revise it, and neither can a bug or a
hostile caller. Tested by attempting the UPDATE as `anon` and watching Postgres
refuse.

**Current touch** — `analytics_sessions`, one row per session: `landing_path`,
`referrer`, `utm_*`. Changes freely on a later acquisition; that is its job.

Everything is stored **raw** — trimmed and length-capped, nothing else. No
channel classification, no host extraction, no TikTok/Shorts/direct bucketing.
Grouping is a reporting decision that will be revised, every version of it is
recoverable from raw text, and none of the raw text is recoverable from a
bucket. Admin can classify in a view later.

An empty `document.referrer` with no UTM is what "direct" means in this schema.
Same-origin referrers are stored as reported rather than filtered at write time,
for the same lossless-ledger reason.

## 14.7 Verification

Not implemented — B1 only makes the contract ready.

`verification_started` / `_completed` / `_failed`, each carrying a structured
`verification_type` **column** (not buried in metadata, so it is indexable and
groupable). Open `text`, **never a DB enum**: a new method must be one line in
`VERIFICATION_TYPES`, not a migration with a deploy-ordering problem. Seeded
with `email`, `discord`, `league_ign`; a test inserts `steam` and `phone` to
prove the schema does not care.

Verification is **not one global boolean**. A user may hold several
independently, and "verified" is always a question about a specific method —
`verification_completed` grouped by `verification_type` is the answer. There is
deliberately no aggregate flag anywhere in the contract.

## 14.8 Signup definition

`profiles` row creation is **not** signup — `handle_new_user` inserts one per
anonymous session, which is why the Admin counter is inflated today (§8, still
unfixed; see §14.12).

A signup is an auth identity becoming registered. `isRegisteredUser(user)` =
`user && !user.is_anonymous` is the predicate. `trackSignupCompleted()` takes
`upgradedFromGuest` as a **required** field, not an optional one — optional is
how it would come to be omitted at exactly the call sites that matter — so
guest→registered and registered-from-first-contact stay separable forever.

No auth refactor was performed. This is the contract B2 emits against.

## 14.9 Server authority, idempotency and RLS

**`source_system` is the authority boundary, not a label.** The RLS `WITH
CHECK` pins it to `'web'` for `anon` and `authenticated`. A browser **cannot**
write `source_system = 'railway'`, and cannot write `source_entity_type` /
`source_entity_id` at all. Server-authoritative rows arrive over `service_role`
(which bypasses RLS) and are the only rows permitted to claim a non-`web`
origin. The same clause pins `user_id` to `auth.uid()` or NULL.

`visitor_id` and `session_id` are deliberately **not** constrained — they are
client-minted and unforgeability is unavailable short of a server round trip
per event. They are self-reported throughout, and should be read that way.

**Idempotency** is a *partial* unique index:

```sql
UNIQUE (source_system, event_name, source_entity_type, source_entity_id)
  WHERE source_system <> 'web'
    AND source_entity_type IS NOT NULL
    AND source_entity_id IS NOT NULL
```

Partial so it never reaches web events: a visitor may open Leaguecraft nine
times, and a rule that made the ninth impossible would be data loss wearing a
correctness costume. A retried Railway `ranked_completed` for match 42 is
rejected; nine web `leaguecraft_opened` are not. Both are tested.

The emitter picks the granularity and **the granularity is the definition of
"the same event"**: `ranked_completed` keys on the match, `ranked_started` keys
on the *participant* — keying it on the match would silently drop four of five
players. `ServerEventIdentity` exists so B2 and the database share one
definition instead of two that drift.

**RLS posture**, identical on all three tables:

| | anon | authenticated | admin / master_admin | service_role |
|---|---|---|---|---|
| INSERT | yes (constrained) | yes (constrained) | yes | yes |
| SELECT | no | no | yes | yes |
| UPDATE | no | no | **no** | yes |
| DELETE | no | no | **no** | yes |

Append-only below `service_role`, including for admins. No user reads analytics
— not even their own rows; a "your own rows" SELECT policy would hand any
caller a way to probe whether a `visitor_id` exists. `anon` INSERT is required,
not a convenience: landing events fire before an anonymous Supabase session
exists, and that is the largest gap the audit found. `UPDATE`/`DELETE` are also
`REVOKE`d from `anon`/`authenticated` as defence in depth against a future
migration enabling a policy by accident.

**A trap worth knowing.** Granting no SELECT makes
`INSERT ... ON CONFLICT (col) DO NOTHING` fail: naming a conflict target makes
Postgres read the arbiter index, that read needs SELECT, and the rejection is
reported as *"new row violates row-level security policy"* — on rows that
conflict with nothing. A **targetless** `ON CONFLICT DO NOTHING` is unaffected.
This is why the frontend writes visitors and sessions with a plain `INSERT` and
treats SQLSTATE `23505` as success, rather than supabase-js
`.upsert({ onConflict })`, which renders the targeted form. Both behaviours are
pinned by tests. Anyone adding a SELECT policy should expect those tests to
change meaning, not merely to pass.

## 14.10 Frontend helper

`src/lib/funnel-analytics.ts` is now a **compatibility shim** delegating to the
new emitter — the 34 existing call sites start working again, against the new
store, with a visitor id, a session id and attribution they never had, without
one product surface being edited in a schema phase. New code imports `track`
from `@/lib/analytics`.

| File | Role |
|---|---|
| `src/lib/analytics/index.ts` | the only import surface |
| `contract.ts` | vocabulary, verification types, signup predicate |
| `identity.ts` | visitor + session |
| `attribution.ts` | UTM / referrer / first + current touch |
| `track.ts` | the emitter and typed conveniences |
| `schema.ts` | typed Supabase seam |
| `runtime.ts` | UUIDs, safe storage, diagnostics |

**No `as any`.** `schema.ts` declares the three tables' row shapes explicitly
and performs one structural cast *on the client*, so every `.insert()` above it
is checked against the real column set. The old `(supabase as any).from(...)`
removed types from the *call site*, which is how a column typo would compile,
ship, and fail silently forever. The file documents its own removal: apply the
migration, regenerate types, delete `AnalyticsDatabase`.

**Failure contract.** Non-blocking (`track()` returns `void` synchronously and
never awaits; no render path or click handler waits on the network).
Non-fatal (nothing thrown escapes). **Non-silent** — this is the correction to
the predecessor's bare `catch {}`, under which a missing table went unnoticed
for two months. Every failure lands in a diagnostics channel
(`getAnalyticsDiagnostics()` -> count, last 20 failures, events sent) and warns
to console in DEV. A smoke test or an Admin freshness indicator can read it
instead of rediscovering the outage.

Callers supply the event name and what only they know. Visitor, session, route,
guest state, auth uid, attribution bootstrapping and timestamps are all captured
by the emitter. **Nothing outside `src/lib/analytics/` should read a query
parameter, mint an id or touch `document.referrer` again** — the reason UTM
handling never got added is that there was nowhere for it to live.

## 14.11 Tests — 80 passing

```
src/lib/analytics/analytics.test.ts                    46 passed   (jsdom)
src/test/security/funnel1b1AnalyticsSchema.test.ts     34 passed   (node, PGlite)
                                                       ----------
                                                       80 passed
```

The schema suite does not grep the SQL — it **runs the migration verbatim on a
real Postgres** (PGlite) and then tries to break it as `anon`, as
`authenticated` and as the service role.

Covered: stable visitor id · storage-failure fallback · one session across 20
route transitions · boundary at 30min−1ms · new session at 30min · inactivity
measured from last activity · new session on campaign change · *no* new session
on internal navigation or same-campaign re-entry · UTM parsing (all five) ·
direct vs referrer · length capping · first-touch immutability (client-side
*and* enforced by Postgres refusing the UPDATE) · current touch changing while
first touch does not · session-row retry on failure and stop-on-`23505` · event
common fields · web rows never claiming server authority · verification type as
a column, including an unknown type · signup guest-upgrade flag · idempotency
(retried match rejected, per-participant rows permitted, web events
unconstrained) · RLS write/read/update/delete matrix for anon, user, admin,
master_admin · event-name, source-system and metadata-size CHECKs ·
`received_at` from the DB clock · the exact index list · the tombstone creating
nothing.

Also asserted end-to-end in SQL, against seeded data: unique visitors, unique
sessions, landing→hub conversion, new vs returning, D1 return, guest→registered
conversion, and a signup attributed to its **first** touch (TikTok) rather than
the session it happened in (YouTube).

Regression checks:

- `eslint` on all changed files — **clean**.
- `tsc --noEmit -p tsconfig.app.json` — 23 errors, **all pre-existing**, none in
  any file this phase touched.
- 17 existing suites that consume the emitter (HUD, Auth, LolHub, Quiz, DSA,
  ads, Practice Builder, Trends, Demo Analytics) — **372 passed, 1 failed**.
  The failure (`Quiz.hub.test.tsx` -> "keeps exactly one h1") was reproduced on
  a pristine `84de68ef` checkout and is **pre-existing and unrelated**.

## 14.12 Statistical sanity check

Possible once the migration is applied and B2 instruments the routes:

| Metric | Supportable after B1+B2 | From |
|---|---|---|
| Unique visitors | yes | `analytics_visitors` |
| Unique sessions | yes | `analytics_sessions` |
| Landing -> Hub conversion | yes | `landing_viewed` -> `hub_entered` per visitor |
| Leaguecraft engagement | yes | `leaguecraft_opened` |
| Mode starts / completions | yes | authoritative rows, once B2 emits from Railway |
| Guest -> registered conversion | yes | `is_guest` snapshot + `signup_completed.upgraded_from_guest` |
| Verification conversion by type | yes | `verification_*` grouped by `verification_type` |
| Source / medium / campaign / content | yes | first-touch and session-touch columns |
| New vs returning | yes | sessions per visitor |
| D1 / D7 return | yes | session dates vs `first_seen_at` |
| Repeat sessions | yes | `count(*) > 1` per visitor |

**Still impossible after B1, and why:**

1. **Every one of the above is zero until the migration is applied by hand.**
   The tables do not exist in `kewgjwrzpzpeltwidvuc` yet. This is the same
   failure mode as July and the single largest risk in the phase.
2. **Nothing is instrumented.** B1 wrote the foundation and stopped. Only the
   34 legacy call sites emit, so `landing_viewed`, `leaguecraft_opened`,
   `ranked_opened`, `meta_reflex_opened`, `mastery_opened` and the
   `verification_*` family produce no rows yet. `hub_entered` and
   `leaguecraft_opened` do fire, via the legacy aliases.
3. **No mode start/complete truth.** Railway emits nothing (out of scope). Mode
   completion counts remain Railway-side only, and the cross-database join
   question — **§13.2, still the largest architectural decision open** — is
   unanswered. B1 makes Supabase the correct destination; it does not build the
   pipe.
4. **No backfill.** Pre-B1 funnel history is permanently zero (§13.5). Cohorts
   start the day the migration is applied.
5. **Anonymous purging still destroys `user_id` linkage.** `visitor_id` now
   survives a purge, which is a real improvement, but rows whose `user_id`
   points at a purged anon account become orphans.
6. **The `user_signups` defect is not fixed.** `admin-data-sources.ts:48` still
   counts `profiles` without `is_anonymous = false`. Out of scope for a schema
   phase; it is a one-line correctness bug and should be fixed on its own.
7. **Visitor identity is self-reported.** Clearing site data, a second browser
   or a second device each produce a new visitor. Unique-visitor counts are
   upper bounds, as they are in every first-party analytics system.
8. **Two ad analytics systems remain** (§13.4). `ad_events` is live;
   `ad_slot_*` now routes to `analytics_events` instead of nowhere. Reconcile
   before reporting on either.

## 14.13 Unresolved risks

1. **Apply risk.** The migration is inert until pasted into the Lovable SQL
   Editor, and the emitter's failure contract is non-fatal by design, so
   skipping it again breaks nothing loudly. The diagnostics channel is the
   mitigation; a post-apply smoke check should be B2's first task.
2. **`analytics_visitors` is publicly insertable with no rate limit.** A
   hostile caller can mint rows. The metadata cap, the length CHECKs and the
   event-name CHECK bound the damage; volume is not bounded. Supabase-level
   rate limiting or a periodic sanity check is a future concern.
3. **PGlite is not Supabase.** Roles, `auth.uid()`, `has_role()` and
   `is_master_admin()` are fixtures, and `service_role` is modelled as the
   superuser session. The policy *logic* is proved; the live grant environment
   is not.
4. **`visitor_id` retention / PII posture is undecided** (§13.3). A durable
   first-party id in `localStorage` is used with no consent gate. Not a cookie
   and not a fingerprint, but EU traffic may still warrant a decision.
5. **Cross-database assembly is undesigned** (§13.2).
6. **Guest-upgrade-in-place is an unguarded dependency.** If Auth ever stops
   upgrading the identity in place, `user_id` stitching breaks silently.
   `visitor_id` now limits the blast radius; a test asserting uid continuity
   across signup is still owed.

## 14.14 Proposed scope for FUNNEL1B2

1. **Apply the migration**, regenerate `types.ts`, delete `AnalyticsDatabase`
   from `schema.ts`, and add a smoke check that reads the diagnostics channel
   so a missing table is loud.
2. **Instrument the macro funnel** — `landing_viewed` on `MogzyEntryV2`,
   `leaguecraft_opened` on `LeaguecraftHub` mount, `ranked_opened`,
   `meta_reflex_opened`, `mastery_opened`, `dsa_opened` at the route boundary;
   `signup_viewed` / `_started` / `_completed` on `Auth.tsx` **including the
   OAuth path**, which is untracked today.
3. **Retarget the legacy call sites** onto canonical names and retire the
   `funnel-analytics.ts` shim and the two aliases.
4. **Decide §13.2** — how Railway gameplay truth reaches Supabase — and
   implement the authoritative emitter against `buildServerEventRow`, keyed as
   §14.9 describes.
5. **Fix `user_signups`** (`is_anonymous = false`), separately and visibly.
6. **Add the uid-continuity-across-signup test** (§14.13.6).
7. Reconcile the two ad analytics systems.

Admin analytics UI stays out of B2 unless explicitly scoped; it needs data
first.

---

# 15. FUNNEL1B2 — Canonical web funnel + production certification (IMPLEMENTED, DEPLOYED)

Branch `funnel1b1-analytics-foundation`, continuing from B1. Same isolated
worktree; the divergent local `mogsy` checkout was not touched.

**The analytics schema is live in production.** §15.8 records the deployment
and the certification evidence.

## 15.1 Legacy emitter audit — the first task, and the reason for it

The rollout rule was that B1's schema must not ship before the legacy events
were classified, because the compatibility shim would have let 34 call sites
start writing the moment the tables existed — and several of those names are
actively misleading. With zero historical funnel data there is exactly one
chance at a clean statistical starting line.

All 34 `trackFunnelEvent(...)` sites were enumerated and classified. Six
retired, twenty-eight kept as diagnostics, one new diagnostic added.

| Legacy event | Emitter | What it actually meant | Action |
|---|---|---|---|
| `lol_landing_viewed` | `LolHub.tsx:550` | Hub entry, labelled as a landing | **RETIRE** → `hub_entered` |
| `lol_start_quiz_clicked` | `LolHub.tsx:668` | One CTA standing in for a page entry | **RETIRE** → `leaguecraft_opened` (surface) + `leaguecraft_cta_clicked` (new diagnostic) |
| `quiz_guest_started` ×2 | `Quiz.tsx:820,880` | Practice start — **only when anonymous** | **RETIRE** → `practice_quiz_opened`, unconditional |
| `auth_signup_viewed_from_quiz` | `Auth.tsx:80` | Signup screen, quiz arrivals only | **RETIRE** → `signup_viewed` + `entry_surface` |
| `auth_signup_completed_from_quiz` | `Auth.tsx:272` | Signup, quiz arrivals AND email path only | **RETIRE** → `signup_completed` (analytics/signup.ts) |
| `quiz_results_viewed` | `Quiz.tsx:1030` | Same block, same payload as `quiz_completed` | **RETIRE** — a duplicate of one moment |
| `quiz_completed`, `quiz_question_answered`, `practice_missed_started` | `Quiz.tsx` | Real product detail | KEEP_DIAGNOSTIC |
| `quiz_signup_gate_shown` / `_clicked` / `quiz_guest_continue_clicked` | `QuizSignUpGate.tsx` | Gate behaviour | KEEP_DIAGNOSTIC |
| `hud_signup_chip_clicked` / `_menu_clicked` | HUD | CTA placement | KEEP_DIAGNOSTIC |
| 11 × `practice_builder_*` | PT1.7 | Premium product telemetry | KEEP_DIAGNOSTIC |
| 3 × `trends_*` | PT1.8 | Premium product telemetry | KEEP_DIAGNOSTIC |
| 5 × `ad_slot_*` / `house_ad_clicked` | `lib/ads/analytics.ts` | Ad lifecycle | KEEP_DIAGNOSTIC |
| 12 × `dsa_*` | DSA bridge | Run detail, production-gated | KEEP_DIAGNOSTIC |

**B1's alias table is gone.** B1 translated `lol_*` at the emitter because the
call sites could not be touched in a schema phase. B2 removed the call sites,
so translation became a liability: it would let a reintroduced legacy call site
quietly rejoin canonical counts under a rewrite rule invisible at the call
site. A retired name is now **refused** with a `contract:retired_event`
diagnostic and no row. `RETIRED_EVENTS` in `contract.ts` is the record, and a
test scans all of `src/` to prove none of them is emitted anywhere.

## 15.2 Canonical events added

`landing_viewed` · `hub_entered` · `leaguecraft_opened` · `practice_quiz_opened`
· `ranked_opened` · `meta_reflex_opened` · `mastery_opened` · `dsa_opened` ·
`signup_viewed` · `signup_started` · `signup_completed`, plus the diagnostic
`leaguecraft_cta_clicked`.

No new vocabulary was invented — all eleven were frozen in B1 §14.4.

**No verification events were instrumented.** There is no verification UI in the
product yet, and the brief forbids placeholders. The schema and contract stay
ready; the VERIFY workstream emits them when it ships.

## 15.3 Surfaces instrumented

| Event | Surface | Boundary note |
|---|---|---|
| `landing_viewed` | `MogzyEntryV2` | Gated on `seo === "root"`, so the `/dev` preview mount of the same component is not a landing |
| `hub_entered` | `LolHub` | Replaces `lol_landing_viewed` in place. `markHubVisited()` is untouched — it is routing/onboarding state, not analytics |
| `leaguecraft_opened` | `Quiz` (the `/quiz` route) | **Route, not CTA.** Direct link, bookmark, internal navigation and the back button all count identically |
| `practice_quiz_opened` | `Quiz`, both start paths | `entry: "question_set"` / `"category_rail"` distinguishes them; not deduped, because three sets is three events |
| `ranked_opened` | `QuizRankedPage` | Emitted **above** the account gate, deliberately: a signed-out visitor being asked to sign in is the drop-off worth measuring |
| `meta_reflex_opened` | `LeagueSwipeHub` | Per-game opens stay out of the macro funnel; the slug is on the result rows |
| `mastery_opened` | `MasteryJourneysPage` | Behind `ProtectedRoute`, so this step is structurally empty for guests — a product fact |
| `dsa_opened` | `QuizDailyScoreAttack` | The production wrapper only, so the `/dev` prototype stays out, matching the existing `dsa_*` gating |
| `signup_viewed` | `Auth` | Unconditional for `mode=signup`; origin moves to `entry_surface` metadata |
| `signup_started` | `Auth` + `useAccountUpgrade` | After validation, as the request goes out |
| `signup_completed` | `analytics/signup.ts` only | §15.4 |

`LobbyPreviewPage` also mounts `LeaguecraftHub`, which is why the canonical
open is bound to the `/quiz` page rather than to that shared component — the
dev preview would otherwise have counted as a Leaguecraft open.

### Opened vs started

The distinction is kept only where the browser can truthfully know it.
`practice_quiz_opened` fires when a set actually begins — but it is named
`_opened`, not `_started`, because `practice_quiz_started` is reserved for
Railway's `quiz_sessions`, which is the counted truth. `ranked_opened` means
arrival at Ranked and nothing more. A test scans `src/` and asserts that no
source file emits any of the ten server-authoritative gameplay names.

## 15.4 Signup definition

**One canonical row per signup, produced by one module.** There are exactly two
ways to become registered, and they are detected differently on purpose:

1. **Guest upgrade** — `observeAuthIdentity`, called from `AuthProvider`,
   watches for the SAME account ceasing to be anonymous. Detected centrally
   rather than in a UI callback because the transition can complete long after
   every form has unmounted: a guest who takes the email-confirmation branch
   leaves in `verification_pending`, still anonymous, and becomes registered
   when they click the link days later.
2. **Brand-new registered account** — reported explicitly by `Auth.tsx` on
   `signUp()` success, because at the auth layer "a registered user appeared
   where there was none" is **indistinguishable from an ordinary sign-in on a
   new device**. Counting that transition would turn every returning user into
   a signup — a subtler version of the defect this replaces.

The two are mutually exclusive by construction (`Auth.tsx` returns the upgrade
panel early for anonymous users, so the `signUp()` branch cannot run for a
guest), and both dedupe on the uid in `localStorage`, so a reload, a second tab
or a token refresh cannot produce a second row.

A signup is therefore **never** a `profiles` row, an anonymous session, or a
Hub load. Guest→account identity continuity is preserved: the upgrade is in
place, so `user_id` is the same uid before and after, and `is_guest` flips from
true to false across the boundary on that one uid. Tested.

`entry_surface` (`ranked` / `leaguecraft` / `hub` / `guest_upgrade` / `direct`),
`return_to` and `from_guest` are metadata, not separate event names — the
`_from_quiz` suffix is exactly how the old vocabulary went wrong.

**No OAuth path exists in this codebase** (`signInWithOAuth` appears nowhere),
so the audit's "OAuth signup is untracked" finding is currently moot. Recorded
so it is not re-raised.

## 15.5 Dedupe strategy

`useSurfaceEvent` fires a surface event **once per `(session_id, event_name,
key)`**, held in a module-level Set that is never cleaned up — the cleanup
function deliberately does not remove the key, because StrictMode's
effect → cleanup → effect sequence would re-arm it and restore the double-fire.

- Not once per **mount**: mounts are a React fact, not a visitor fact.
- Not once per **process**: that is global suppression, which the brief rules
  out, and it would silence tomorrow's visit.

The session is the boundary because it is already the unit the funnel is
measured in, so "sessions that saw the landing page" is what the number means.
Survives StrictMode double-invoke, rerenders, state changes, auth hydration and
unexpected remounts; fires again after a 30-minute inactivity rollover or a new
campaign arrival.

**Stated consequence:** Hub → Leaguecraft → Hub inside one session records ONE
`hub_entered`. Repeat navigation within a visit is not a funnel step; where raw
open frequency matters, `leaguecraft_cta_clicked` carries it.

Action events (`practice_quiz_opened`, `signup_started`, every diagnostic) do
**not** use the hook — three practice sets must be three events.

## 15.6 Attribution validated through real navigation

All five required scenarios are tested against the emitter with a real session
store:

| # | Scenario | Result |
|---|---|---|
| 1 | Direct visit | No campaign, `first_landing_path` = `/`, referrer null |
| 2 | UTM visit | All five UTM fields on both the visitor row and the session row |
| 3 | Later return, no UTM | **First touch unchanged**; one visitor row total; second session is direct |
| 4 | Later return, different UTM | First touch still TikTok; session touch is YouTube; new session started |
| 5 | Guest → signup | One visitor, one session across `landing_viewed` → `hub_entered` → `signup_started` → `signup_completed`; `is_guest` flips true → false on one uid |

Session stability across SPA route transitions, expiry only after inactivity,
UTM parsing, referrer/direct behaviour and landing path are covered in B1's
suite and re-exercised here. No attribution logic exists outside
`src/lib/analytics/`.

## 15.7 Two real defects found by the new tests

1. **First-touch attribution had silently stopped being written.** B1 gated the
   visitor-row insert on `VisitorState.isNew`, a one-shot flag consumed by
   whichever caller reaches `getVisitor()` first. The moment `useSurfaceEvent`
   began resolving the session before emitting, `getSession()` consumed it, and
   by the time `track()` looked the visitor was no longer new — so
   `analytics_visitors` was never populated at all. Both attribution writes are
   now gated on a **persisted** flag (`isFirstTouchRecorded` /
   `isSessionRecorded`), which cannot be consumed by an extra read and which
   additionally makes both writes **retryable** — fixing a quieter B1 defect
   where a first-touch insert that failed offline was never retried.
2. **`trackSignupCompleted` was a second producer of `signup_completed`.** B1
   shipped it as a generic helper; once the event became a real metric, a
   freely-callable emitter was the most likely route to two canonical rows for
   one signup. Removed. A test asserts `analytics/signup.ts` is the only file
   in `src/` that emits the name.

## 15.8 Production deployment and certification — COMPLETE

| | |
|---|---|
| **Supabase project ref** | `kewgjwrzpzpeltwidvuc` |
| **Migration applied** | `supabase/migrations/20260920120000_funnel1b1_analytics_foundation.sql` |
| **Applied by** | Privileged Lovable database access, out of band |
| **Certification timestamp (UTC)** | **2026-09-20T11:27:52Z** (first smoke insert), run completed 11:28:07Z |
| **Certified at commit** | `f2c0da40` pre-rebase, now **`2e9dc927`** after the B2.5 rebase onto `origin/main` (§16). Same tree for every analytics file; the rebase changed no content, only parentage |
| **Baseline** | Funnel data begins at this timestamp. Everything before it is permanently zero — there is nothing to backfill (§5) |

Project identity was confirmed before anything was written: `.env`
`VITE_SUPABASE_PROJECT_ID`, `supabase/config.toml` `project_id` and the live
host all read `kewgjwrzpzpeltwidvuc`. No secret was printed.

`scripts/funnel/certify-analytics.ts` is the reusable evidence, and it runs with
the **publishable (anon) key only** — the same credential a browser holds — so
what it proves, it proves through the real client path.

```
FUNNEL1B2 — analytics production certification
  project ref : kewgjwrzpzpeltwidvuc
  host        : kewgjwrzpzpeltwidvuc.supabase.co
  credential  : publishable (anon) — no privileged key is used

PASS  0. project identity agrees between .env and supabase/config.toml
PASS  1. public.analytics_events exists in the live project
PASS  2. public.analytics_visitors exists in the live project
PASS  3. public.analytics_sessions exists in the live project
PASS  5. an anonymous browser can insert a web event through the client path
PASS  7. common fields are accepted as written
PASS  8. unauthorized reads are blocked — anon sees nothing, including its own rows
PASS  8b. a browser cannot write a server-authoritative row

8/8 automated checks passed.
```

Against the same script **before** the migration, for contrast: checks 1–3
returned `PGRST205 Could not find the table … in the schema cache` — the exact
signature `funnel_events` gave for two months (§5).

Item **8b** is not on the brief's list and is the one worth keeping: a browser
attempting `source_system = 'railway'` with a forged
`source_entity_type`/`source_entity_id` was **rejected in production** by RLS.
The authoritative/idempotent design in §14.9 now rests on a verified fact rather
than on the policy text.

Certification items and how each was established:

| # | Requirement | Status |
|---|---|---|
| 1 | `analytics_events` exists | ✅ anon PostgREST probe |
| 2 | `analytics_visitors` exists | ✅ anon PostgREST probe |
| 3 | `analytics_sessions` exists | ✅ anon PostgREST probe |
| 4 | Expected RLS policies present | ✅ **privileged verification**, direct Lovable database access. All six policies present, plus every expected index including `uq_analytics_events_authoritative_entity` |
| 5 | Real web event inserted via the client path | ✅ event + visitor + session all accepted |
| 6 | Readable through authorized access | ✅ **privileged read-back passed for both smoke rows** |
| 7 | Common fields populated correctly | ✅ verified server-side — field values correct, and the event → visitor → session join reproduced both first-touch and current-touch attribution |
| 8 | Unauthorized reads blocked | ✅ anon sees zero rows on all three tables, including rows it just wrote |
| 8b | Browser cannot forge server authority | ✅ rejected in production by RLS |

**All eight items are closed. Nothing in this certification is second-hand.**
Items 1, 2, 3, 5, 7, 8 and 8b were proved from the anon client path by
`scripts/funnel/certify-analytics.ts`; items 4, 6 and the server-side half of 7
were proved through direct privileged database access. The two halves were run
against the same project by different credentials, which is a stronger result
than either could give alone: the client path proves the policies *behave*
correctly against a real browser credential, and the privileged path proves the
policies and the stored values *are* what the migration intended.

### Smoke rows

`smoke_test_ping` was used rather than tagging a real funnel event. It is **not
in the contract and never will be**, so it cannot enter any funnel count by
accident and cannot be confused with product telemetry — whereas a tagged
`landing_viewed` would have put an exclusion clause on every future query.

The script was run twice after the migration (a third run, before it, wrote
nothing), so two smoke visitor/session/event sets existed. **Both have been
removed transactionally.** Post-cleanup counts, verified with privileged
access:

```
smoke_test_ping rows        0
certification sessions      0
certification visitors      0
total analytics_events      0
```

The store is therefore **certified and empty before the first real visitor** —
which is the clean statistical starting line the rollout rule was written to
protect. The first row written to `analytics_events` in production will be a
genuine one.

## 15.9 The privileged SQL — RUN, PASSED, CLEANED UP

Retained as the record of what was executed and as the re-certification recipe
for the next deploy. Nothing here is outstanding.

```sql
-- 6. authorized read-back + field validation
select id, event_name, event_version, visitor_id, session_id, user_id,
       is_guest, route, source_system, source_entity_type, source_entity_id,
       occurred_at, received_at, metadata
from public.analytics_events
where event_name = 'smoke_test_ping'
order by received_at desc;
-- expect per row: source_system='web', user_id null, is_guest true,
--                 route '/', entity columns null, received_at ≥ occurred_at.

-- 7. joined to its attribution — the point of the three-table model
select e.event_name, e.route, e.is_guest,
       v.first_utm_source, v.first_utm_medium, v.first_referrer, v.first_landing_path,
       s.utm_source, s.landing_path
from public.analytics_events e
join public.analytics_visitors v on v.visitor_id = e.visitor_id
join public.analytics_sessions s on s.session_id = e.session_id
where e.event_name = 'smoke_test_ping';
-- expect first_utm_source='certification', first_landing_path='/'.

-- CLEANUP — run all three, in this order.
delete from public.analytics_events   where event_name = 'smoke_test_ping';
delete from public.analytics_sessions where utm_source = 'certification';
delete from public.analytics_visitors where first_utm_source = 'certification';
```

All three cleanup statements ran transactionally and the table is empty
(§15.8). It stays empty until the instrumented frontend ships — see §15.15,
which is the reason it has not shipped yet.

## 15.10 Data-quality fix — the signup metric

`src/lib/admin-data-sources.ts` `user_signups` now filters
`is_anonymous = false` alongside `is_bot = false`. The correction was genuinely
isolated — one predicate on one query — so it was made rather than deferred,
and deliberately not bundled with any wider Arena/Admin cleanup.

This makes the legacy chart honest; it does **not** make it the source of
truth. The canonical signup metric is `analytics_events` where `event_name =
'signup_completed'`, which additionally separates a guest upgrade from a
brand-new account and survives the anonymous-profile purge.

## 15.11 Tests — 95 new, 536 passing, no regressions

```
src/lib/analytics/analytics.test.ts              48 passed  (B1 contract, updated for retirement)
src/lib/analytics/instrumentation.test.ts        24 passed  (dedupe + signup definition)
src/test/funnel/canonicalSurfaces.test.tsx       23 passed  (surface wiring)
src/test/security/funnel1b1AnalyticsSchema.test.ts  34 passed  (B1, PGlite)
                                                 ─────────
                    targeted regression sweep   536 passed / 4 failed
```

The landing page is **rendered under StrictMode**, because "exactly one event
per page entry" is a runtime property and the double-invoke is the exact
failure it must survive. The other surfaces are asserted statically, by reading
each source for an emission call: rendering Ranked, Meta Reflex, Mastery and
DSA would mean an auth provider, a query client and several network doubles per
page — a harness that would mostly be testing itself — and the dedupe they
inherit is already proved twice over. The static matcher requires an emitter
call, so the many deliberate prose mentions of retired names are not mistaken
for call sites.

Covered: one canonical event at root · Hub emits `hub_entered` and never
`landing_viewed` · direct `/quiz` emits `leaguecraft_opened` · the CTA path
does not double-count the open · `ranked_opened` including for signed-out
visitors · every mode mapping · each surface event emitted from exactly one
file · no browser emission of any server-authoritative name · signup start ·
completion only on a real upgrade · anonymous session creation is not a signup ·
plain sign-in is not a signup · no double-count across reload, second tab or
token refresh · every retired name refused and absent from `src/` · StrictMode
and remount dedupe · the five attribution scenarios.

**Regression verification.** The affected suites were run against a
`9bedaae4` (B1 head, now `4ad43b44`) baseline worktree and against B2: **identical sets of 4
pre-existing failures** (`Quiz.hub.test.tsx` h1, two `lobby-preview` import-
isolation scans, one `syntheticRankedHistory` scan), 441 → 536 passing. No
regressions. `tsc --noEmit` shows the same 23 pre-existing errors in the same 15
files, none touched by this phase. ESLint is clean on every file authored here;
the remaining errors in edited files are pre-existing `no-explicit-any` on
untouched lines.

One existing test was updated on purpose: `LolHub.test.tsx` asserted
`lol_landing_viewed`. It now asserts `hub_entered` and that neither
`landing_viewed` nor the retired name is emitted.

## 15.12 Files changed

```
src/lib/analytics/useSurfaceEvent.ts          NEW  dedupe boundary
src/lib/analytics/signup.ts                   NEW  signup definition + observer
src/lib/analytics/instrumentation.test.ts     NEW
src/test/funnel/canonicalSurfaces.test.tsx    NEW
scripts/funnel/certify-analytics.ts           NEW  production certification

src/lib/analytics/contract.ts                 RETIRED_EVENTS replaces the alias table
src/lib/analytics/track.ts                    refuses retired names; persisted attribution gating;
                                              trackSignupCompleted removed
src/lib/analytics/identity.ts                 isFirstTouchRecorded / markFirstTouchRecorded
src/lib/analytics/index.ts                    exports
src/lib/analytics/analytics.test.ts           retirement tests replace alias tests
src/lib/funnel-analytics.ts                   legacy names dropped from the shim's type

src/pages/dev/mogzy-entry-v2/MogzyEntryV2.tsx landing_viewed
src/pages/LolHub.tsx                          hub_entered; CTA → diagnostic
src/pages/Quiz.tsx                            leaguecraft_opened; practice_quiz_opened ×2;
                                              quiz_results_viewed removed
src/pages/quiz-ranked/QuizRankedPage.tsx      ranked_opened
src/pages/LeagueSwipeHub.tsx                  meta_reflex_opened
src/pages/quiz-mastery/MasteryJourneysPage.tsx mastery_opened
src/pages/QuizDailyScoreAttack.tsx            dsa_opened
src/pages/Auth.tsx                            signup_viewed / _started / _completed
src/lib/auth/useAccountUpgrade.ts             signup_started
src/hooks/useAuth.tsx                         observeAuthIdentity
src/lib/admin-data-sources.ts                 signup metric excludes anonymous profiles
src/pages/LolHub.test.tsx                     asserts hub_entered
```

## 15.13 Remaining data-quality risks

1. **The frontend is not deployed, and is not currently on a path that reaches
   production.** The schema is live and certified; the instrumented code is
   committed to an unpushed local branch. This is the one blocking risk and it
   has its own section — **§15.15**. The baseline in §15.8 dates the schema, not
   the first real visitor.
2. **Mode completion is still Railway-only.** Every `*_completed` in the
   contract is unwritten. §13.2 — how gameplay truth reaches Supabase — remains
   the largest open architectural decision.
3. **Guest→registered depends on in-place upgrade.** If Auth ever stops
   upgrading identities in place, `observeAuthIdentity` stops seeing the
   transition and signups silently undercount. `visitor_id` limits the blast
   radius; a test asserting uid continuity across signup is still owed.
4. **Repeat within-session navigation is not counted** by design (§15.5). Anyone
   reading "Leaguecraft opens" should read it as "sessions that opened
   Leaguecraft".
5. **Mastery is guest-invisible** by product design (`ProtectedRoute`).
6. **`visitor_id` is self-reported.** Cleared site data, a second browser or a
   second device each produce a new visitor; unique-visitor counts are upper
   bounds.
7. **Two ad analytics systems remain** (§13.4), now both alive: `ad_events` and
   `ad_slot_*` into `analytics_events`. Reconcile before reporting on either.
8. **`analytics_visitors` is publicly insertable with no rate limit.** Bounded
    in shape by the CHECK constraints, unbounded in volume.

## 15.14 Proposed scope for FUNNEL1B3

**B3 is blocked until §15.15's steps 1–5 are done.** The database side of B2 is
fully certified; the code side has not reached production, and Railway emission
built on an unproven web funnel would be the third repetition of the same
half-shipped mistake.

1. **Close out B2's tail** (§15.15): rebase, push, confirm the ref Lovable
   publishes from, merge, publish, then re-run `certify-analytics.ts` against
   the deployed site and confirm real `landing_viewed` rows are arriving. The
   store is certified empty, so the first row that appears is unambiguous
   evidence — the read-back and smoke-row cleanup are already done (§15.9).
2. **Regenerate `types.ts`** now that the tables exist, then delete
   `AnalyticsDatabase` from `src/lib/analytics/schema.ts` and point `analyticsDb`
   at `supabase` directly. The file documents its own removal.
3. **Railway → Supabase gameplay emission** — the actual B3 subject. Decide
   §13.2 (webhook on completion, scheduled reconciliation, or outbox), then emit
   `practice_quiz_*`, `ranked_*`, `mastery_*`, `dsa_*` over `service_role` using
   `buildServerEventRow`, keyed per §14.9 — **match** for completions,
   **participant** for per-player starts.
4. **Meta Reflex completion** is Supabase-side (`league_swipe_results`), so it
   can be emitted by trigger or RPC rather than over the Railway path.
5. **A freshness check**: assert in CI or in Admin that
   `max(received_at)` is recent, so the next silent outage is loud.
6. **The uid-continuity test** (§15.13.5).

Admin analytics UI stays out of B3 unless explicitly scoped — but after B3 the
data will finally exist to justify it.

## 15.15 Integration / deployment state — SUPERSEDED BY §16

Retained as the record of the gap and of how it was measured. Its central
claim — that the branch was unpushed and unreachable by any build — was
resolved in FUNNEL1B2.5; its SHAs are pre-rebase. **Read §16 for current state.**
Its final paragraph, about the deployed bundle still targeting `funnel_events`,
was an inference at the time and has since been **verified directly** (§16.4).

### (original, as written)

Asked before authorising B3, and the answer is the most important line in this
section, so it is first: **the schema half of FUNNEL1B2 is live in production;
the code half is not, and nothing will carry it there without a deliberate act.**

### What is true right now

| | |
|---|---|
| Branch | `funnel1b1-analytics-foundation` |
| HEAD | `9953af88` |
| Upstream | **none** — `fatal: no upstream configured for branch` |
| Remote branches containing HEAD | **none** |
| Position vs `origin/main` | **3 ahead, 5 behind** |
| CI / deploy config in repo | none (`.github/workflows` absent; no `vercel.json`, `netlify.toml`, `Dockerfile`) |

The three commits — `9bedaae4` (B1 schema + emitter), `f2c0da40` (B2
instrumentation), `9953af88` (certification record) — exist **only in the local
worktree**. They have never been pushed. Production deploys via Lovable
Publish, which builds from the GitHub repository, so code that is not on the
remote cannot be in a build, and no amount of further local work changes that.

This is the same failure shape FUNNEL1A found, with the halves swapped. In July
the code shipped and the migration did not, so the emitter wrote into nothing.
Today the migration has shipped and the code has not, so nothing writes into
the tables. Both are "one half of a two-part change reached production", and
both are silent: the tables are empty, and an empty analytics table looks
exactly like a product with no traffic.

### Divergence and merge risk — low, and measured

`origin/main` advanced five commits since this branch was cut at `84de68ef`:
`2f211a3b`, `7bc6581b`, `2b6d3e91`, `a6a41a52`, `0b86c7fa` — the MRLVL1 champion
level badge and GR1 reusable-state docs.

- **File overlap with this branch: zero.** Their work touches
  `ChampionLevelBadge`, `ranked-core`/`ranked-public`, `league-swipe/api.ts`,
  `LeagueSwipeGame.tsx` and docs. This branch touches the analytics library, the
  page surfaces, `useAuth`, `useAccountUpgrade`, `admin-data-sources` and
  `LolHub`/`Quiz`/`Auth`. The intersection is empty.
- **`git merge-tree --write-tree origin/main HEAD` is clean** — no conflicts.

Note the near-miss worth naming: they changed `LeagueSwipeGame.tsx`; this branch
instruments `LeagueSwipeHub.tsx`. Different files, same feature area. A later
B3 that instruments the game itself will not be so lucky, and should rebase
first.

### What must happen before B3, in order

1. **Rebase onto current `origin/main`** (clean, per the trial merge) and re-run
   the focused suites. This is cheap now and gets more expensive every day the
   branch sits.
2. **Push the branch and open a PR**, so the code is somewhere a build can see
   it. Until this step, every later step is blocked.
3. **Confirm which ref Lovable Publish actually builds from.** The repo carries
   no CI configuration, so this cannot be answered from source — it is a
   setting in the Lovable project, and it is the single fact this review cannot
   establish from here. If it publishes from `main`, the branch must be merged
   to `main`; if from a preview ref, that ref must be the one carrying these
   commits.
4. **Merge and publish.**
5. **Re-run `scripts/funnel/certify-analytics.ts`** against the deployed site,
   then confirm in the database that real `landing_viewed` rows are arriving
   from real visitors — not just that an insert is *possible*, which is all
   §15.8 proves. The store is empty and certified clean, so the first row to
   appear is a genuine one and is unambiguous evidence the loop is closed.
6. **Only then start B3.** Railway emission depends on the web funnel actually
   producing rows; building the server half against an unproven client half
   would repeat the same mistake a third time.

### The ordering risk this phase deliberately accepted

The rollout rule said schema and instrumentation should ship together, and they
have not. The consequence is bounded and was chosen knowingly: the schema
shipping alone writes no rows and breaks nothing, because the only code that
could write to it is the code that has not shipped. The reverse order — the one
July took — is the dangerous one.

What it does cost is the guarantee that nobody *else's* deploy reaches
production first. The legacy shim (`src/lib/funnel-analytics.ts`) routes 34
existing call sites into `analytics_events`, and those call sites are already
live on `origin/main`. **They are harmless only because the shim's new target
does not exist in the shipped bundle** — the deployed build still writes to
`funnel_events`, which still does not exist, and still fails silently. No
partial or stale deploy can contaminate the clean baseline. But the window
should be closed promptly rather than left open.

---

# 16. FUNNEL1B2.5 — Integration and production loop closure (COMPLETE)

Closing the gap §15.15 identified: the certified analytics code existed only on
an unpushed local branch. Phases 1–4 are complete and the code is now on the
production ref. **Phases 5–6 are blocked on a Lovable Publish action this
environment cannot perform** (§16.5).

## 16.1 Phase 1 — reconciliation

`origin/main` was re-fetched immediately before integration and had **not**
moved since the previous check.

| | |
|---|---|
| `origin/main` at start | `2f211a3bc00e9f8927da0dde6372540ff59e0dcd` |
| Branch HEAD before | `5eda4cf8` (4 ahead, 5 behind) |
| Changed-file overlap | **empty**, re-verified |
| `git merge-tree --write-tree` | **clean** |
| Method | **rebase** — lowest risk here, because the branch had never been pushed, so no shared history existed to rewrite |

Rebase succeeded with no conflicts. No unrelated work was absorbed; the local
divergent `mogsy` checkout was not touched.

| Commit | Before | After |
|---|---|---|
| B1 schema + emitter | `9bedaae4` | **`4ad43b44`** |
| B2 instrumentation | `f2c0da40` | **`2e9dc927`** |
| B2 certification record | `9953af88` | **`a7264386`** |
| B2 deploy-gap review | `5eda4cf8` | **`c67722ec`** |

Reconciled branch HEAD: **`c67722ec3aef2f900651d540b986903f1f18540f`**, 4 ahead
/ **0 behind** `origin/main`.

Every SHA quoted in §14 and §15 predates this rebase. Contents are identical —
the rebase changed parentage, not a single line — but the old hashes no longer
resolve, so §15.8 and §15.11 were corrected in place rather than left to
mislead.

## 16.2 Phase 2 — focused verification after reconciliation

```
src/lib/analytics/analytics.test.ts                 48 passed
src/lib/analytics/instrumentation.test.ts           24 passed
src/test/funnel/canonicalSurfaces.test.tsx          23 passed
src/test/security/funnel1b1AnalyticsSchema.test.ts  34 passed
                                                   ───────────
                                        analytics  129 passed / 0 failed

affected surface suites (LolHub ×2, Quiz.hub, Auth ×2, DSA,
components/auth, components/hud, onboarding-gate,
lobby-preview, LeagueSwipeGame)          391 passed / 4 failed
```

The 4 failures are the **same four pre-existing ones** measured against the
`9bedaae4` baseline in §15.11 (`Quiz.hub.test.tsx` h1, two `lobby-preview`
import-isolation scans, one `syntheticRankedHistory` scan). Rebasing onto five
new upstream commits changed nothing.

`tsc --noEmit`: **23 errors across the same 15 files** — identical to baseline,
none in any file this work touches. ESLint on every authored file: **clean**
(exit 0).

## 16.3 Phase 3 — remote integration

Branch pushed and upstream configured:

```
* [new branch]  funnel1b1-analytics-foundation -> funnel1b1-analytics-foundation
branch 'funnel1b1-analytics-foundation' set up to track 'origin/...'
```

`origin/funnel1b1-analytics-foundation` = `c67722ec`, verified to contain all
four commits and all fourteen analytics artefacts (eleven `src/lib/analytics/`
files, the two test suites, the certification script, the migration).

**Then integrated to `main`.** The conditions the brief set were met and
checked in order: the repo's established workflow integrates feature branches
into `main` (both merge commits and direct pushes appear in its history);
`origin/main` had not moved unexpectedly (still `2f211a3b` at the moment of the
push); and the branch was **0 behind**, so `origin/main` was a strict ancestor
and the push was a **fast-forward** — no history rewritten, nothing forced,
each of the four commits individually revertible.

```
To https://github.com/mitcherrman/mogsy.git
   2f211a3b..c67722ec  HEAD -> main
```

| | |
|---|---|
| `origin/main` before | `2f211a3b` |
| **`origin/main` after** | **`c67722ec3aef2f900651d540b986903f1f18540f`** |

Verified post-push: `origin/main` carries 11 files under `src/lib/analytics/`
and `supabase/migrations/20260920120000_funnel1b1_analytics_foundation.sql`.

## 16.4 Phase 4 — the Lovable deployment ref, from direct evidence

**`Lovable production publishes from main.`**

Established from evidence, not from the absence of CI files (the brief
explicitly ruled that out):

1. **Lovable's own GitHub bot writes to `main`.** `gpt-engineer-app[bot]` —
   the Lovable/GPT-Engineer integration account — has **3,265 commits on
   `origin/main`**, the most recent on 2026-09-17 ("Fixed stage sizing
   regression"). A two-way sync of that volume onto one branch is the
   integration itself, not a coincidence.
2. **`origin/HEAD -> origin/main`** — `main` is the repository default.
3. The repo has 40+ other remote branches and the bot has committed to none of
   them in this history.

### Current published SHA — and what could and could not be determined

The published **SHA** is not externally observable: Lovable embeds no build
identifier in the output, so reading it requires Lovable project metadata this
environment has no access to. **That number must come from the Lovable
project.**

What *is* externally observable is far more useful, and it was measured
directly against `https://mogzy.lol`:

| Marker in the live entry bundle `assets/index-C2juFm5U.js` | Occurrences |
|---|---|
| `funnel_events` | **1** |
| `analytics_events` | 0 |
| `analytics_visitors` | 0 |
| `mogzy.analytics.visitor` | 0 |
| `hub_entered` | 0 |

**The deployed site is still running the pre-B1 emitter, writing to
`funnel_events` — a table that does not exist.** §15.15's closing paragraph
predicted exactly this and called it an inference; it is now a measurement.
Two consequences worth stating plainly:

- B2 is definitively not deployed, whatever any dashboard says.
- The clean zero-row baseline **cannot** be contaminated by the currently
  deployed build, because that build targets a table Postgres does not have.
  The pre-launch baseline is safe for as long as this bundle is live.

## 16.5 Phase 5 — publish: BLOCKED, and it is the only thing blocking

`origin/main` now contains B2, which was the precondition. Publishing is a
Lovable action, and pushing to GitHub does **not** trigger it: the live bundle
hash was polled three times over ~40s after the push and stayed
`index-C2juFm5U.js`, with the pre-B1 contents above.

**This environment cannot perform the publish** — it holds no Lovable
credentials. The Lovable flow must be run by the owner or by the privileged
operator, against ref `main`, commit `c67722ec`.

### How to confirm the publish landed, without guessing

```bash
curl -s https://mogzy.lol/ | grep -oE 'src="/assets/index-[^"]+\.js"'
```

Two conditions, both required:

1. the hash is **no longer `index-C2juFm5U.js`**; and
2. the new bundle **contains `analytics_events` and `mogzy.analytics.visitor`,
   and no longer contains `funnel_events`**.

Condition 2 is the one that matters — a hash can change for unrelated reasons.

## 16.6 Phase 6 — production loop closure: NOT YET RUN

Cannot begin until §16.5 completes; running it against the current bundle would
only re-prove that the old emitter writes nothing.

The procedure, ready to execute:

1. Clean visit to `https://mogzy.lol/?utm_source=production_loop_test&utm_medium=funnel1b25&utm_campaign=loop_closure`
   from fresh browser storage, so the visit mints a new `visitor_id` and a new
   session with that acquisition.
2. Navigate **Landing → Hub (`/lol`) → Leaguecraft (`/quiz`)**. No gameplay.
3. Expect exactly three canonical rows — `landing_viewed`, `hub_entered`,
   `leaguecraft_opened` — sharing one `visitor_id` and one `session_id`, with
   `first_utm_source = 'production_loop_test'` on the visitor row and
   `utm_source = 'production_loop_test'` on the session row.
4. Expect **zero** rows for `lol_landing_viewed` or any other retired name.

The read-back needs privileged access. SQL:

```sql
-- the three canonical rows, in order, sharing one identity
select e.event_name, e.route, e.visitor_id, e.session_id,
       e.user_id, e.is_guest, e.source_system, e.occurred_at, e.received_at
from public.analytics_events e
join public.analytics_sessions s on s.session_id = e.session_id
where s.utm_source = 'production_loop_test'
order by e.received_at;
-- expect exactly: landing_viewed, hub_entered, leaguecraft_opened
--                 one distinct visitor_id, one distinct session_id
--                 source_system='web' on all three

-- first-touch and session attribution both carry the test campaign
select v.visitor_id, v.first_utm_source, v.first_utm_medium, v.first_utm_campaign,
       v.first_landing_path, v.first_referrer,
       s.session_id, s.utm_source, s.landing_path
from public.analytics_visitors v
join public.analytics_sessions s on s.visitor_id = v.visitor_id
where v.first_utm_source = 'production_loop_test';

-- NO retired or misnamed event became canonical data
select event_name, count(*)
from public.analytics_events
where event_name in ('lol_landing_viewed','lol_start_quiz_clicked',
                     'quiz_guest_started','auth_signup_viewed_from_quiz',
                     'auth_signup_completed_from_quiz','quiz_results_viewed')
group by event_name;
-- expect ZERO rows. The emitter refuses these names outright (§15.1), so any
-- row here means a build predating B2 is live, not that the contract failed.

-- whole-table sanity: nothing unexpected arrived alongside the test
select event_name, count(*) from public.analytics_events
group by event_name order by 2 desc;
```

### Cleanup — narrow predicates tied to the test campaign

Preferred over tagging, so the pre-launch baseline returns to a true zero.

```sql
delete from public.analytics_events
 where session_id in (select session_id from public.analytics_sessions
                      where utm_source = 'production_loop_test');
delete from public.analytics_sessions where utm_source = 'production_loop_test';
delete from public.analytics_visitors where first_utm_source = 'production_loop_test';
select count(*) as remaining from public.analytics_events;  -- expect 0
```

Every predicate keys on `production_loop_test`, which no real visitor can
produce, so none of these can reach a genuine row.

## 16.7 Completion state

| # | Requirement | Status |
|---|---|---|
| 1 | Schema is live | ✅ certified both sides (§15.8) |
| 2 | B2 code on the real production ref | ✅ `origin/main` = `c67722ec` |
| 3 | Lovable has published that commit | ❌ **blocked — no Lovable access here** (§16.5) |
| 4 | A real production visit emitted canonical analytics | ⛔ gated on 3 |
| 5 | Live DB read-back confirms identity + attribution | ⛔ gated on 4 |
| 6 | Retired/misnamed events did not pollute the dataset | ⛔ gated on 4 — though the deployed bundle currently cannot write at all (§16.4), so the dataset is intact by construction |
| 7 | Test rows cleaned up | ⛔ gated on 4 |

**FUNNEL1B2 is not yet closed.** Two of seven remain done; the other five are
one Lovable Publish away, and nothing else stands between them.

## 16.8 Remaining scope for FUNNEL1B3

Unchanged from §15.14, minus the items B2.5 completed. B3 still must not start
until §16.7 reads all ✅.

1. **Regenerate `src/integrations/supabase/types.ts`** now that the tables
   exist, then delete `AnalyticsDatabase` from `src/lib/analytics/schema.ts` and
   point `analyticsDb` at `supabase` directly. That file documents its own
   removal.
2. **Railway → Supabase gameplay emission** — the real B3 subject. Decide §13.2
   (webhook on completion, scheduled reconciliation, or an outbox table), then
   emit `practice_quiz_*`, `ranked_*`, `mastery_*`, `dsa_*` over `service_role`
   via `buildServerEventRow`, keyed per §14.9 — **match** for completions,
   **participant** for per-player starts, or the unique index silently drops
   four of five players.
3. **Meta Reflex completion** is Supabase-side (`league_swipe_results`), so it
   can be emitted by trigger or RPC without the Railway path.
4. **A freshness assertion** — CI or Admin check that `max(received_at)` is
   recent. The whole audit exists because a silent analytics outage ran for two
   months; the diagnostics channel makes it visible in DEV, and this would make
   it visible in production.
5. **The uid-continuity-across-signup test** (§15.13.3).

Admin analytics UI remains out of scope until the data exists to justify it.

---

# 17. FUNNEL1B2.5 — Publish and production loop (COMPLETE)

Continues §16, which ended blocked on a Lovable Publish. That has happened, and
the loop has been driven on the real deployed site. **What remains is the
privileged read-back and cleanup (§17.5).**

## 17.1 Publish verified — by measurement, not by report

Deployment `6e4c4a8c-1633-49bb-b36e-682261a89894`, returned `pending`, so the
deployed SHA was **not** assumed. The bundle was measured instead.

| | Before publish | After publish |
|---|---|---|
| Entry bundle | `assets/index-C2juFm5U.js` | **`assets/index-RqqHkANc.js`** |
| `funnel_events` | 1 | **0** |
| `analytics_events` | 0 | **1** |
| `analytics_visitors` | 0 | **1** |
| `analytics_sessions` | 0 | **1** |
| `mogzy.analytics.visitor` | 0 | **1** |
| `mogzy.analytics.session` | 0 | **1** |
| `landing_viewed` | 0 | **1** |
| `hub_entered` | 0 | **1** |

All four required conditions hold: new hash, `analytics_events` present,
`mogzy.analytics.visitor` present, `funnel_events` **absent**. The dead table
is gone from the shipped code for the first time since 2026-07-10.

`https://mogzy.lovable.app` 301s to `https://mogzy.lol`; they are one site and
`mogzy.lol` is canonical (`SITE_URL` in `site-config.ts`). All measurements are
against `mogzy.lol`.

### The SHA that moved, and why it is harmless

Lovable reported `1b4f60ea` immediately before publishing and
`be0dfad6dedd6ebb6aadb67c6a9ef01791f0efba` immediately after, which looks
alarming and is not. `be0dfad6` is a **docs-only commit by the repository
owner** on top of `1b4f60ea`:

```
be0dfad6  Mitchell Leung  2026-09-20 05:46:00 -0700
          docs(gr1): coherent window candidate composition -- the record
  docs/RANKED_MASTERY_SLICE_HANDOFF.md           |  94 ++-
  docs/gr1-reusable-state-window-composition.md  | 483 +++
  2 files changed, 576 insertions(+), 1 deletion(-)
```

Zero source files. Whichever of the two was built, the analytics code in the
bundle is identical — and the bundle scan above confirms it directly, which is
why measuring beats trusting a reported SHA.

`origin/main` is now `be0dfad6`, and it contains all of B1/B2.

## 17.2 The production loop — a real visit on the deployed site

Driven in a real browser against `https://mogzy.lol`, from empty storage, not a
dev server.

```
https://mogzy.lol/?utm_source=production_loop_test
                  &utm_medium=funnel1b25
                  &utm_campaign=loop_closure
   →  /lol   (Hub)
   →  /quiz  (Leaguecraft)
```

No gameplay was started.

**Identity minted on the landing page:**

| | |
|---|---|
| `visitor_id` | `dd6dcfbf-8ae7-4443-8c6f-489b7c2eb9b6` |
| `session_id` | `4674ae74-c1dc-447b-9f9c-3c795451ba1c` |
| session `startedAt` | 1789911301125 |
| session `lastActivityAt` after `/quiz` | 1789911330033 |

Observed client-side, on the live site:

- **First-touch was captured from the landing URL**, with the full campaign:
  `utm_source=production_loop_test`, `utm_medium=funnel1b25`,
  `utm_campaign=loop_closure`, `landing_path="/"`, `referrer=null`.
- **`mogzy.analytics.visitorFirstTouch.v1` = the visitor id.** That flag is
  written only after the `analytics_visitors` insert returns without error, so
  the visitor row was accepted by production.
- **`recorded: true` on the stored session.** Same contract — the
  `analytics_sessions` insert was accepted.
- **One session across all three routes.** The id never changed; only
  `lastActivityAt` advanced (+28.9s). The rule that a route transition must not
  start a session — the failure the brief named explicitly — holds in
  production, not just in jsdom.
- **`POST /rest/v1/analytics_events`** observed in the page's own resource
  timeline. The client is writing to the real table.

### Expected rows, stated before the read-back

Four events in this session, three canonical and one diagnostic:

| Route | Event | Kind |
|---|---|---|
| `/` | `landing_viewed` | canonical |
| `/lol` | `hub_entered` | canonical |
| `/quiz` | `leaguecraft_opened` | canonical |
| `/quiz` | `dsa_legacy_fallback` | diagnostic, pre-existing |

The fourth is not a surprise and is worth naming so the read-back is not
misread: `Quiz.tsx:508/511` fires `dsa_legacy_fallback` on mount when the Daily
Score Attack feature reports disabled or unavailable. It is a plain
`trackFunnelEvent` and is deliberately **not** deduped. Two
`analytics_events` POSTs were observed on the `/quiz` document, which is exactly
this plus `leaguecraft_opened`.

**A second `leaguecraft_opened` would be a dedupe failure.** There was none in
the network timeline, and the read-back should confirm it.

### Side effect worth recording

Visiting `/lol` triggers `supabase.auth.signInAnonymously()`, so this test
created one anonymous auth user (`b2c6d84e-…`) and its profile
(`5bc93da4-…`). That is what every real first-time visitor does, it is not
analytics data, and it does not touch the analytics tables. It is also no longer
counted as a signup — the §15.10 fix excludes anonymous profiles — and
`purge-anonymous-users` will reap it. Noted rather than cleaned, because
deleting auth rows is a heavier operation than this test justifies.

## 17.3 What is proven, and what is not

**Proven, by direct observation on the deployed public site:**
the published bundle contains the new analytics and not the dead table; a real
visit mints a visitor and a session; first touch captures the campaign; the
session survives SPA navigation across three routes; and the client POSTs to
`analytics_events` in production.

**Not yet proven** — and not claimable until the read-back returns: that the
rows *landed*, that the three canonical names are present exactly once each
with the right common fields, that the event → visitor → session join
reproduces the attribution, and that no retired name appears. The anon key
cannot read these tables by design (§14.9), so this genuinely requires
privileged access.

## 17.4 Legacy pollution — reasoning, pending confirmation

Two independent reasons to expect zero retired-name rows, both to be confirmed
by query rather than argument:

1. The emitter **refuses** all six retired names outright (§15.1), so even a
   reintroduced call site could not write one.
2. Until this publish, the deployed bundle targeted `funnel_events`, which does
   not exist — so no build before today could have written anything at all.

## 17.5 Remaining privileged SQL — read-back, then cleanup

Precise ids are known, so these are keyed to them as well as to the campaign.

```sql
-- A. the events of this visit, in order
select e.event_name, e.route, e.visitor_id, e.session_id, e.user_id,
       e.is_guest, e.source_system, e.event_version,
       e.occurred_at, e.received_at, e.metadata
from public.analytics_events e
where e.session_id = '4674ae74-c1dc-447b-9f9c-3c795451ba1c'
order by e.received_at;
-- EXPECT exactly four rows, in this order:
--   landing_viewed      route '/'
--   hub_entered         route '/lol'
--   leaguecraft_opened  route '/quiz'
--   dsa_legacy_fallback route '/quiz'   (diagnostic, see §17.2)
-- all with source_system='web', is_guest=true, event_version=1,
-- one distinct visitor_id, one distinct session_id.
-- A SECOND landing_viewed / hub_entered / leaguecraft_opened = dedupe failure.

-- B. attribution, first touch and session touch together
select v.visitor_id, v.first_seen_at,
       v.first_utm_source, v.first_utm_medium, v.first_utm_campaign,
       v.first_landing_path, v.first_referrer,
       s.session_id, s.started_at, s.utm_source, s.utm_medium, s.utm_campaign,
       s.landing_path, s.referrer
from public.analytics_visitors v
join public.analytics_sessions s on s.visitor_id = v.visitor_id
where v.visitor_id = 'dd6dcfbf-8ae7-4443-8c6f-489b7c2eb9b6';
-- EXPECT one row: first_utm_source='production_loop_test',
--   first_utm_medium='funnel1b25', first_utm_campaign='loop_closure',
--   first_landing_path='/', first_referrer null, and the session columns
--   carrying the same campaign.

-- C. no retired or misnamed event became canonical data
select event_name, count(*) from public.analytics_events
where event_name in ('lol_landing_viewed','lol_start_quiz_clicked',
                     'quiz_guest_started','auth_signup_viewed_from_quiz',
                     'auth_signup_completed_from_quiz','quiz_results_viewed')
group by event_name;
-- EXPECT zero rows.

-- D. whole-table sanity — nothing arrived that this test did not cause
select event_name, count(*) from public.analytics_events
group by event_name order by 2 desc;
-- EXPECT only the four names from A.
```

### Cleanup — narrow, campaign-keyed

```sql
delete from public.analytics_events
 where session_id = '4674ae74-c1dc-447b-9f9c-3c795451ba1c';
delete from public.analytics_sessions
 where session_id = '4674ae74-c1dc-447b-9f9c-3c795451ba1c'
    or utm_source = 'production_loop_test';
delete from public.analytics_visitors
 where visitor_id = 'dd6dcfbf-8ae7-4443-8c6f-489b7c2eb9b6'
    or first_utm_source = 'production_loop_test';

select count(*) as remaining_events from public.analytics_events;  -- expect 0
```

Every predicate names either this exact session/visitor or a `utm_source` no
real visitor can produce, so none can reach a genuine row. Deleting events
before sessions/visitors keeps the order sane even though no FKs exist to
enforce it (§14.3).

## 17.6 Completion state

| # | Requirement | Status |
|---|---|---|
| 1 | Schema is live | ✅ certified both sides (§15.8) |
| 2 | B2 code on the real production ref | ✅ `origin/main` = `be0dfad6` |
| 3 | Lovable has published that commit | ✅ verified by bundle measurement (§17.1) |
| 4 | A real production visit emitted canonical analytics | ✅ client side — visitor, session, first touch, and `POST /rest/v1/analytics_events` all observed live (§17.2) |
| 5 | Live DB read-back confirms identity + attribution | ⏳ **pending §17.5 A/B** |
| 6 | Retired/misnamed events did not pollute the dataset | ⏳ **pending §17.5 C/D** — expected clean for two independent reasons (§17.4) |
| 7 | Test rows cleaned up | ⏳ **pending §17.5 cleanup** |

**FUNNEL1B2 is not yet closed: 4 of 7.** The deployment loop itself is closed —
code ships, the bundle is correct, and a real visitor produces writes. What
remains is confirming on the server what was observed on the client, and
removing the test rows.

## 17.7 Remaining scope for FUNNEL1B3

Unchanged from §16.8. B3 still must not start until §17.6 reads all ✅.

1. Regenerate `src/integrations/supabase/types.ts`, then delete
   `AnalyticsDatabase` from `src/lib/analytics/schema.ts` and point
   `analyticsDb` at `supabase` directly.
2. **Railway → Supabase gameplay emission** — the real B3 subject. Decide §13.2,
   then emit `practice_quiz_*`, `ranked_*`, `mastery_*`, `dsa_*` over
   `service_role` via `buildServerEventRow`, keyed per §14.9 — **match** for
   completions, **participant** for per-player starts.
3. Meta Reflex completion is Supabase-side (`league_swipe_results`) and needs no
   Railway path.
4. A freshness assertion on `max(received_at)`.
5. The uid-continuity-across-signup test (§15.13.3).

One new candidate, from this loop: `dsa_legacy_fallback` fired on an ordinary
`/quiz` load, meaning Daily Score Attack is reporting **disabled or
unavailable** in production. That is a product-configuration question rather
than an analytics one, but the funnel found it, and it should be looked at
before DSA numbers are read.

---

# 18. FUNNEL1B2.6 — `practice_builder_opened` semantics fix

A small correction, found by exactly the thing that was supposed to find it:
the first privileged read-back of a real production visit (§17).

## 18.1 What the read-back actually showed

The three canonical rows passed as predicted — `landing_viewed /` →
`hub_entered /lol` → `leaguecraft_opened /quiz`, one visitor, one session,
first-touch and session-touch both carrying `production_loop_test` /
`funnel1b25` / `loop_closure`, landing path `/`, referrer NULL, and **no
retired event, including `lol_landing_viewed`**.

The fourth row was **not** what §17.2 predicted. I expected
`dsa_legacy_fallback`; production has **zero** of those. It was
**`practice_builder_opened`**, on `/quiz`, ~1ms after `leaguecraft_opened`.

My inference was wrong. There were two candidate emitters on `/quiz`, I
reasoned from the DSA fallback's plausibility, and I did not check the Builder —
which was the one that fires unconditionally. Writing the prediction down
beforehand is what made the mismatch visible rather than invisible, so the
method held even though the guess did not.

## 18.2 The bug

`src/components/quiz/builder/PracticeBuilderPanel.tsx` emitted on mount:

```ts
useEffect(() => { if (open) trackFunnelEvent("practice_builder_opened", {}); }, [open]);
```

`open` does not mean the user opened anything. At the call site
(`Quiz.tsx:1544`) it is **`open={phase === "sets"}`** — the Leaguecraft hub's
DEFAULT phase — and the panel is an always-visible section beneath the curated
packs (`LeaguecraftHub.tsx:741`), with no disclosure control of its own.

So it fired for **every `/quiz` visitor**, including:

- visitors who never scrolled to it (it sits below the fold on most viewports);
- **Free visitors, who cannot use it at all** and are shown only a paywall;
- and again on every return to the hub from a quiz, as `phase` flips back.

It claimed a user action and reported a render — precisely the defect the audit
found in `lol_landing_viewed`, one layer down. Left alone it would have made the
Builder's conversion rate look catastrophic for a purely clerical reason.

The author's intent is legible and was never in doubt:
`usePracticeBuilder.ts:59` reads *"a reader who never opens the Builder should
not spend a request on it."* The intent was "the user opened the Builder"; the
wiring made it "the hub rendered".

## 18.3 The fix — removed, not moved

There is no user action to move the emission to, because there is no open
action in this UI. `practice_builder_opened` is **retired**, with nothing
replacing it:

- an event that fires for every `/quiz` visitor is `leaguecraft_opened` with
  extra steps; and
- the Builder's funnel now runs `leaguecraft_opened` (denominator) →
  `practice_builder_pool_selected` / `_filters_changed` (first deliberate act)
  → `_build_attempted` → `_build_succeeded`, which is a real funnel.

A genuine "the Builder was SEEN" metric needs a real visibility signal, since
rendered ≠ seen here. That is a feature with its own design, not a rename of
this line, and it is explicitly out of scope.

Changed: the emission deleted (reasoning left in its place), the name removed
from `PRODUCT_EVENTS`, and added to `RETIRED_EVENTS` — so the emitter now
**refuses** it, and the existing all-of-`src/` scan fails if it ever returns.

## 18.4 Tests

Three added to the existing Builder harness, on top of the contract scans that
already existed:

- emits nothing merely for being rendered — **Premium** reader
- emits nothing merely for being rendered — **Free** reader (the population this
  distorted most)
- still reports a real interaction — `practice_builder_pool_selected` on the
  first deliberate act

The first two assert **no event at all on mount**, not merely "not that name".
No render of this panel is a user action worth a row, and anything that starts
firing here again should have to argue with this test.

```
src/components/quiz/builder/*              20 passed
src/lib/analytics/*, src/test/funnel/*     98 passed
                                          ───────────
                                          118 passed / 0 failed
```

`tsc --noEmit`: 23 errors, unchanged from baseline, none in a touched file.
ESLint on the touched directories: 0 errors. One pre-existing warning remains at
`usePracticeBuilder.ts:130` (an unused disable directive) — verified present
before this change, in a file this work does not touch.

## 18.5 Out of scope, but found and worth recording

The same wiring means `usePracticeBuilder`'s catalog fetch also runs for every
`/quiz` visitor, which is not what its own comment claims and costs an
account-bound request per hub load. That is a performance/cost question rather
than a telemetry one, and it is deliberately left alone here. It belongs with
the Builder's owner.

Separately, and correcting §17.7: production has **zero** `dsa_legacy_fallback`
rows, so the worry that Daily Score Attack was reporting unavailable in
production was unfounded. That was my misattribution, not a product signal.

## 18.6 Status

| # | Requirement | Status |
|---|---|---|
| 1 | Schema live | ✅ |
| 2 | Code on production ref | ✅ |
| 3 | Lovable published | ✅ for B2; **B2.6 build pending** |
| 4 | Real production visit emitted canonical analytics | ✅ |
| 5 | Read-back confirmed identity + attribution | ✅ §18.1 |
| 6 | No retired/misnamed event polluted the dataset | ⚠️ → ✅ once B2.6 ships. No *retired* name appeared, but `practice_builder_opened` was a live name with wrong semantics, which is the same harm under a different heading |
| 7 | Test rows cleaned up | ✅ controlled rows deleted; 8 unrelated real events untouched |

**B2 closes when the B2.6 build is published and one short production check
confirms `/quiz` emits `leaguecraft_opened` and no `practice_builder_opened`.**

## 18.7 B2.6 production verification

Deployment `4df591c1-51c2-4ca3-9cb5-3774960a271d` for `main` @ `0010a636`,
returned `pending`, so again verified by measurement rather than by report.

### The bundle changed

`index-RqqHkANc.js` → **`index-BgKO9opI.js`** (523,106 bytes), picked up on the
first poll.

### "Is `practice_builder_opened` absent?" is the wrong question

I proposed that check and it was mistaken. The string is **still in the
bundle** — exactly once — and that is correct: it is now a key of the shipped
`RETIRED_EVENTS` map, which is what makes the emitter refuse it at runtime. A
build where the string had vanished would mean the retirement record had been
dropped, not that the fix had landed.

The shipped map, read out of the live bundle:

```
lol_landing_viewed               -> hub_entered
lol_start_quiz_clicked           -> leaguecraft_opened + leaguecraft_cta_clicked
quiz_guest_started               -> practice_quiz_opened
auth_signup_viewed_from_quiz     -> signup_viewed
auth_signup_completed_from_quiz  -> signup_completed
quiz_results_viewed              -> quiz_completed
practice_builder_opened          -> nothing — use leaguecraft_opened …
```

All seven retirements are live. `funnel_events`: 0 occurrences.

The real test is behavioural: **how many event writes does `/quiz` make?**

### The clean visit

Storage was cleared first on `/robots.txt` — a same-origin path that emits
nothing — so the landing page was a genuine first visit rather than a
continuation. (That clear also removed B2.5's leftover visitor from the
browser profile; it had already been deleted from the database.)

```
https://mogzy.lol/?utm_source=production_loop_test_b26
                  &utm_medium=funnel1b26
                  &utm_campaign=builder_semantics
   →  /lol   →  /quiz
```

| Route | `POST /rest/v1/analytics_events` | Before B2.6 |
|---|---|---|
| `/` | **1** | 1 |
| `/lol` | **1** | 1 |
| `/quiz` | **1** | **2** |

`/quiz` now writes once. That is the fix, observed on the deployed public site.

| | |
|---|---|
| `visitor_id` | `443fdfaf-4c7a-48e1-bc46-bd5302b1be32` |
| `session_id` | `889faee4-144a-47a9-9ec7-04cb72a946cd` |
| first touch | `utm_source=production_loop_test_b26`, `utm_medium=funnel1b26`, `utm_campaign=builder_semantics`, `landing_path="/"`, `referrer=null` |
| session `recorded` | `true` at every step |

One visitor and one session across all three routes, unchanged — the session
policy holds again.

### Privileged read-back and cleanup

```sql
-- expect exactly three rows: landing_viewed '/', hub_entered '/lol',
-- leaguecraft_opened '/quiz'. NO practice_builder_opened.
select event_name, route, source_system, is_guest, received_at
from public.analytics_events
where session_id = '889faee4-144a-47a9-9ec7-04cb72a946cd'
order by received_at;

-- attribution
select first_utm_source, first_utm_medium, first_utm_campaign,
       first_landing_path, first_referrer
from public.analytics_visitors
where visitor_id = '443fdfaf-4c7a-48e1-bc46-bd5302b1be32';

-- the retired name must be absent everywhere, not just in this session
select count(*) from public.analytics_events
where event_name = 'practice_builder_opened';   -- expect 0 going forward

-- CLEANUP
delete from public.analytics_events
 where session_id = '889faee4-144a-47a9-9ec7-04cb72a946cd';
delete from public.analytics_sessions
 where session_id = '889faee4-144a-47a9-9ec7-04cb72a946cd'
    or utm_source = 'production_loop_test_b26';
delete from public.analytics_visitors
 where visitor_id = '443fdfaf-4c7a-48e1-bc46-bd5302b1be32'
    or first_utm_source = 'production_loop_test_b26';
```

**Correction.** I predicted here that some of the real rows already in the table
would be `practice_builder_opened`, written by the B2 build between publish and
this fix, and that Builder reporting would therefore need a permanent exclusion
rule for that name. The read-back found **zero** historical
`practice_builder_opened` rows. The only one ever written in production was my
own B2.5 test row, and it was deleted with that session.

So **no exclusion rule and no backfill are needed**, and the name carries no
history at all. The window between the B2 publish and this fix was short enough
that no real visitor reached `/quiz` inside it.

### Read-back result — passed

The test session contained **exactly three rows and nothing else**:
`landing_viewed /`, `hub_entered /lol`, `leaguecraft_opened /quiz`. No
`practice_builder_opened`. Attribution matched on every field —
`production_loop_test_b26` / `funnel1b26` / `builder_semantics`, landing path
`/`, referrer NULL.

Cleanup completed: test events 0, test sessions 0, test visitors 0. Seventeen
unrelated real analytics events remain, untouched.

---

# 19. FUNNEL1B2 — CLOSED

All seven completion criteria are met.

| # | Requirement | Evidence |
|---|---|---|
| 1 | Schema is live | §15.8 — certified from both the anon client path and privileged access |
| 2 | B2 code on the real production ref | §16.3 — `main`, fast-forwarded |
| 3 | Lovable published that commit | §18.7 — `index-BgKO9opI.js`, measured not reported |
| 4 | A real production visit emitted canonical analytics | §18.7 — `/` → `/lol` → `/quiz`, one write each |
| 5 | Live DB read-back confirmed identity + attribution | §18.7 — three rows, one visitor, one session, every UTM field matched |
| 6 | Retired/misnamed events did not pollute the dataset | §18.7 — no retired name ever appeared; the one misnamed live event was caught and retired with **zero** historical rows |
| 7 | Test rows cleaned up | §18.7 — events, sessions and visitors all back to zero |

**Production baseline: 2026-09-20.** Seventeen real analytics events exist, all
from genuine visitors, all under the corrected contract. `analytics_events` has
never held a row written under a misleading name.

## 19.1 What FUNNEL1 actually changed

The audit opened on a system where every funnel event had been a silent no-op
for two months, `/` emitted nothing, the Hub called itself the landing page,
Leaguecraft opens were inferred from one button, signups counted every guest,
and there was no visitor, session or attribution model of any kind.

What exists now: three certified tables with database-enforced first-touch
immutability and append-only history; one event vocabulary with one emitter;
visitor and session identity with a 30-minute inactivity policy that survives
SPA navigation; first-touch and session-touch attribution; a signup definition
that counts an auth transition rather than a profile row; server authority
pinned by RLS so a browser cannot forge a Railway event; and idempotency ready
for B3 to emit against.

## 19.2 The part worth keeping

Three defects were found by tests and verification rather than by review, and
each was invisible to the layer above it:

1. **A targeted `ON CONFLICT` fails under insert-only RLS** — found by running
   the migration on a real Postgres. It would have broken every attribution
   write in production while looking like a policy bug.
2. **`useSurfaceEvent` silently disabled first-touch attribution** — found by a
   behavioural test, caused by a one-shot flag being consumed by an extra read.
3. **`practice_builder_opened` reported a render, not an action** — found only
   by reading back a real production visit, which no test could have done.

The pattern is the one the original audit was about: each was a plausible-looking
line whose meaning had drifted from its name. The defence that worked was
writing the expected result down *before* looking — which is also how I caught
that my own prediction about the fourth event was wrong.

## 19.3 Scope for FUNNEL1B3 — unchanged, now unblocked

1. Regenerate `src/integrations/supabase/types.ts`, delete `AnalyticsDatabase`
   from `src/lib/analytics/schema.ts`, point `analyticsDb` at `supabase`.
2. **Railway → Supabase gameplay emission** — the subject of B3. Decide §13.2
   (webhook, scheduled reconciliation, or outbox), then emit `practice_quiz_*`,
   `ranked_*`, `mastery_*`, `dsa_*` over `service_role` via
   `buildServerEventRow`, keyed per §14.9 — **match** for completions,
   **participant** for per-player starts, or the unique index silently drops
   four of five players.
3. Meta Reflex completion is Supabase-side (`league_swipe_results`) and needs no
   Railway path.
4. A freshness assertion on `max(received_at)`. The whole audit exists because a
   silent outage ran for two months; DEV has the diagnostics channel, production
   has nothing.
5. The uid-continuity-across-signup test (§15.13.3).

Out of scope and owned elsewhere: the Builder's catalog fetch running for every
`/quiz` visitor (§18.5), the two ad analytics systems (§13.4), and the Admin
analytics UI — which now, finally, has data to justify it.

---

# 20. FUNNEL1B3 — Authoritative gameplay analytics (IMPLEMENTED, AWAITING DEPLOY)

The gameplay half of the funnel. Railway keeps owning gameplay truth; Supabase
receives a small analytics representation of transitions Railway has already
proven. No gameplay table moved, no browser became authoritative, and Admin
still never joins the two databases live.

**Backend repo:** `mitcherrman/League_Combat_Simulator`, branch
`funnel1b3-gameplay-analytics` @ **`98cd42da`**, cut from `origin/master`
`cffa85f0` in an isolated worktree. The owner's divergent local checkout
(`envvis1-batch1-scene-channel`, uncommitted) was not touched.

**Not deployed.** §20.10 is the blocker and it is short.

## 20.1 Authoritative transition map

Read from current code, not from old migrations.

| Milestone | Authoritative transition | Write path | Stable entity id | User id available |
|---|---|---|---|---|
| Practice start | `INSERT INTO quiz_sessions` | `routes/quiz.py` `start_quiz_session` | `quiz_sessions.id` (`lastrowid`) | ✅ `resolve_write_user_id` → verified Supabase `sub` |
| Practice completion | `UPDATE … SET completed_at … WHERE id=? AND user_id=? AND completed_at IS NULL`, **rowcount 1** | `routes/quiz.py` `complete_quiz_session` | same session id | ✅ |
| Ranked start | `INSERT INTO ranked_participants`, once per player | `ranked_public/service.py` `create_match_rows` | `<match_id>:<user_id>` | ✅ participant `user_id` |
| Ranked completion (played out) | `mark_match_complete` → `status='active'→'complete'`, **rowcount 1** | `service.py` `_commit_result` | `<match_id>:<user_id>` per participant | ✅ |
| Ranked completion (forfeit / no-contest) | same guard, second path | `service.py` `_terminate_disconnect` | same | ✅ |
| DSA start | `INSERT INTO dsa_runs` | `daily_score_attack/service.py` `start_official_run` / practice | `dsa_runs.run_id` | ✅ + `user_is_anonymous` |
| DSA completion | `update_run_from_state` guarded by `status='active'`, **rowcount 1**, AND `state.status is COMPLETED` | `service.py` `_finalize` | same run id | ✅ |
| Mastery start | `INSERT INTO mastery_sessions` | `mastery/publication/sessions.py` `create_session` | `mastery_sessions.session_id` | ✅ `owner_id` |
| Mastery completion | `UPDATE … phase='completed'` — **NOT status-guarded** (§20.6) | `sessions.py` `advance_session` | same session id | ✅ |

### Milestones deliberately NOT emitted

- **Meta Reflex.** Its truth (`league_swipe_results`) is already in Supabase, not
  Railway. Emitting it from here would route a Supabase fact through a second
  system for no gain; it belongs to a trigger or RPC on that side.
- **DSA expiry.** `RunStatus.EXPIRED` is terminal but it is an abandonment, not
  a completion. Counting it would inflate the one number `dsa_completed` exists
  to produce. It stays visible in `dsa_runs` for anyone who wants it.
- **Ranked "queued".** `ranked_queue_entries` is ephemeral (one live row per
  user, deleted on match), so there is no durable record to key an event on.

## 20.2 Event / entity idempotency map

The database rejects a duplicate of
`(source_system, event_name, source_entity_type, source_entity_id)` for any
non-`web` row. The entity therefore **is** the definition of "the same event",
and choosing it wrongly does not raise — it silently drops rows.

| Event | Entity type | Entity id | Rows per gameplay object |
|---|---|---|---|
| `practice_quiz_started` | `quiz_session` | `<session_id>` | 1 per session |
| `practice_quiz_completed` | `quiz_session` | `<session_id>` | 1 per session |
| `ranked_started` | `ranked_participant` | `<match_id>:<user_id>` | **1 per human player** (2 per duel) |
| `ranked_completed` | `ranked_participant` | `<match_id>:<user_id>` | **1 per human player** |
| `dsa_started` | `dsa_run` | `<run_id>` | 1 per run |
| `dsa_completed` | `dsa_run` | `<run_id>` | 1 per run |
| `mastery_started` | `mastery_session` | `<session_id>` | 1 per session |
| `mastery_completed` | `mastery_session` | `<session_id>` | 1 per session |

### Ranked completion is per participant — a deliberate departure

The brief suggested `ranked_match/<match_id>` for completion. It is keyed per
participant instead, for two reasons:

1. A match-level row can carry only one `user_id`, making it the only event in
   the warehouse not attributable to a person — and every funnel question Admin
   will ask is per-person.
2. Asymmetric granularity makes `started → completed` uncomputable per player.
   Keyed identically at both ends, "did this player finish the match they
   started" is one join on the entity id.

Match-level facts (winner, completion reason, outcome, `won`) ride in metadata
on each participant's row, so nothing is lost. A test keeps the
counter-example: with a match-level key, two players collapse to one row.

### Event names

The frozen contract's, not the brief's: **`practice_quiz_started` /
`practice_quiz_completed`**, not `practice_started` / `practice_completed`.
§14.4 renamed those deliberately — "practice" alone is ambiguous in this
product — and the frontend's `MACRO_EVENTS` already reserves the longer names
for exactly this emission. A second spelling would have been the drift FUNNEL1
exists to stop.

## 20.3 The Railway analytics client — a transactional outbox

`analytics/` — four modules, ~700 lines including the reasoning.

```
contract.py   event names, entity rules, AuthoritativeEvent, uid eligibility
outbox.py     the SQLite outbox: schema, enqueue, claim, mark, stats
client.py     config from env + one POST (transport only)
__init__.py   record() / drain_once() / start_drainer() / health()
```

**Why an outbox rather than a direct POST.** Every milestone is recognised
*inside* a transaction that can still roll back. Ranked is the clear case:
`_commit_result` marks the match complete and then applies rating, and an
exception there unwinds the completion. A POST fired at the guard would
describe a match that never finished — and because the analytics unique index
makes that row permanent, nothing could take it back.

Writing the event to SQLite **in the same transaction** makes the two facts
atomic: if the completion survives, so does its event; if it rolls back, so
does the event.

It also rules out a subtler bug. This app runs sync endpoints in a threadpool
while its middleware runs on the event loop, so a thread-local staging buffer
flushed by a request hook would have been **invisible** to that hook — silently
dropping every event and leaking them into whatever request reused the thread.
The outbox has no such coupling.

```
gameplay tx ──► analytics_outbox (SQLite, atomic with the gameplay write)
                      │
                drainer thread (15s) ──► Supabase analytics_events
                      │
                sent_at stamped; the unique index makes replay harmless
```

Against the brief's requirements:

| Requirement | How |
|---|---|
| Service-authorized | `SUPABASE_SERVICE_ROLE_KEY`; RLS pins anon/authenticated to `source_system='web'`, so this is the only credential that can write `'railway'` |
| `source_system='railway'` | Set in `contract.py`, not per call site |
| Typed payload | `AuthoritativeEvent` rejects a non-authoritative name and an absent entity at construction |
| Explicit entity type/id | Required; construction fails without them |
| Idempotent retry | At-least-once delivery, exactly-once storage: local `UNIQUE`, then Supabase's unique index, whose 409/23505 is treated as success |
| Non-blocking | Gameplay pays one local INSERT; no socket on a request thread |
| Observable failure | `last_error`, `attempts` per row, structured logs, `health()` |
| Bounded timeout | 5s per attempt |
| No secrets in source | Env only; never logged, never in a health response |

Rows are sent **one at a time**, not as one array POST: a batch containing one
bad row would be rejected whole, and one poisoned event must not block every
event behind it. Tested.

## 20.4 Identity — uid continuity verified, not assumed

`routes/supabase_auth.py` `Identity.user_id` is documented as the *verified
Supabase UUID*, and `resolve_write_user_id` returns the verified JWT subject in
preference to anything a client sends. So `quiz_sessions.user_id`,
`ranked_participants.user_id`, `dsa_runs.user_id` and
`mastery_sessions.owner_id` already **are** Supabase uids.

Continuity therefore holds end to end: anonymous Supabase uid → upgraded in
place at signup (the uid does not change) → the same uid on the Railway row →
the same uid on the analytics event. Acquisition and gameplay join on one
column. No auth change was needed and none was made.

Three identities are excluded from attribution, via one predicate
(`is_emittable_user_id`):

- **`"anonymous"`** — the literal `resolve_write_user_id` returns when no
  verified subject exists and the rollback switch is off. Writing it as a uid
  would invent an account.
- **`bot::…`** — ranked bots have no account and no funnel.
- **null/empty.**

Tested directly, including a real bot match producing exactly one start row.

## 20.5 Start vs complete — exact predicates

| Event | Predicate |
|---|---|
| `practice_quiz_started` | `INSERT INTO quiz_sessions` committed. Not a click — the browser's `practice_quiz_opened` is the intent event and is never counted as a start |
| `practice_quiz_completed` | the `completed_at IS NULL`-guarded UPDATE returned rowcount 1. A second call takes the rowcount-0 branch and never reaches the emit |
| `ranked_started` | `insert_participant` for a human, inside match creation |
| `ranked_completed` | `mark_match_complete` returned rowcount 1 (`status='active'` guard), on either terminal path |
| `dsa_started` | `insert_run` committed |
| `dsa_completed` | `update_run_from_state` returned rowcount 1 **and** `state.status is RunStatus.COMPLETED` |
| `mastery_started` | `INSERT INTO mastery_sessions` — `start_or_resume` returns an existing active session instead of calling it, so reaching it is a genuinely new journey |
| `mastery_completed` | the `phase='completed'` branch of `advance_session` (§20.6) |

No event fires on a result screen, a route change, or a response render.

## 20.6 The one transition that is not idempotent at source

**Mastery completion is not status-guarded.** `advance_session` has no
`WHERE phase != 'completed'`, and it deliberately parks the cursor at the final
index — so `current + 1 >= total_steps` stays true and a repeated advance
re-runs the completion branch.

Left alone: guarding it would change mastery's own semantics, which is out of
scope here. It is absorbed by the entity key instead — the outbox's
`UNIQUE (event_name, entity_type, entity_id)` refuses the second enqueue
locally, and Supabase's unique index refuses it again if one ever gets past.
A test drives three advances and asserts one row.

This is the clearest demonstration of why the entity key is mandatory rather
than advisory, and it is recorded here rather than quietly fixed.

## 20.7 Freshness / health

`GET /api/admin/analytics/health`, admin-gated (`routes/analytics_health.py`).

Reports configuration state, drainer liveness, counters, and the outbox's
`unsent` / `oldest_unsent_age_seconds` / `abandoned`. **The age is the whole
signal:** a few unsent rows seconds old is a drainer mid-pass; a backlog
minutes old while `total` climbs is the failure this exists to catch.

`ok: false` with a plain-language `problems` list when unconfigured, disabled,
drainer-dead, stale past 5 minutes, or holding retry-exhausted rows. Deliberately
minimal — a probe, not the Admin analytics UI, which is FUNNEL1C. No credential
appears in the response, and a test asserts that.

## 20.8 Tests — 39 new, all passing

`test_funnel1b3_gameplay_analytics.py`. The outbox runs against real SQLite;
Supabase runs through an injected transport, so retry and duplicate handling are
the real code paths with no network.

```
contract           5   non-authoritative name refused, entity required,
                       source_system pinned, uid eligibility, per-participant key
identity           3   uid reaches the row, sentinel never becomes a uid,
                       guestness snapshot
idempotency        4   same transition twice = 1 row, start/complete coexist,
                       409 treated as delivered
ranked granularity 4   2 players = 2 rows; match-key counter-example collapses
failure isolation  7   rollback takes the event, outage keeps it, retry does not
                       duplicate, poisoned row does not block others,
                       unconfigured keeps rather than drops
freshness          4   backlog visible and aging, cleared on delivery, no key leak
ranked integration 6   REAL service: 2 starts, bot excluded, 2 completions,
                       double-forfeit not double-counted, shared entity key
mastery integration 3  REAL advance_session: completion recorded, mid-journey
                       silent, triple advance = 1 row
                  ───
                   39 passed
```

Existing suites re-run against the change:

```
test_ranked_public_service.py                                 14 passed
test_daily_score_attack_lifecycle.py + ranked history/rating  97 passed
test_mastery_precision_e2e.py                    18 passed, 1 failed
```

The mastery failure (`test_public_catalog_still_ahri_v2_only`) was reproduced
on a clean stash of this branch — **pre-existing, not caused here**.

Frontend contract re-run (`mogsy`, 95 passed), including the scan asserting
**no browser source emits any server-authoritative gameplay name** — the
no-overlap guarantee, now load-bearing in both directions.

**Environment note:** `httpx>=0.27` is a declared dev dependency
(`requirements-dev.txt:15`) that was simply not installed locally, which was
blocking collection of every FastAPI TestClient suite. Installed. Several
unrelated suites still cannot collect because `lol_calc.db` is a 0-byte
placeholder in this checkout — pre-existing and unrelated.

## 20.9 Supabase types / the shim — NOT regenerated

The frontend's `AnalyticsDatabase` shim in `src/lib/analytics/schema.ts`
**stays**. Regeneration needs the Supabase CLI and a project access token;
neither exists in this environment (`supabase` is not installed,
`SUPABASE_ACCESS_TOKEN` is unset), and the brief is explicit that it must not
be faked. The three tables are confirmed present in production by B2's
certification, so regeneration is safe whenever someone has the credential —
`schema.ts` documents its own removal.

## 20.10 Deploy — BLOCKED, and it is two steps

Nothing is deployed. Two things are needed, **in this order**:

1. **Set `SUPABASE_SERVICE_ROLE_KEY` (and confirm `SUPABASE_URL`) in the
   Railway environment.** This must come first, and it is safe to do now:
   nothing reads it until the code ships. Without it the backend still runs
   normally and still records every event durably in the outbox — it just
   delivers nothing, and `/api/admin/analytics/health` says
   `configured: false`. A deploy that forgets it degrades to "analytics
   pending", never to "gameplay broken".
2. **Merge `funnel1b3-gameplay-analytics` into `master` and let Railway
   deploy.**

This environment holds no Railway credentials and cannot set an env var or
trigger a deploy, and the branch was deliberately **not** merged to `master`:
merging is what deploys a live game backend, and the ordering above is the
owner's call, not something to infer.

## 20.11 Production certification — NOT YET RUN

Ready to execute once §20.10 is done. Smallest safe cases:

**Practice (safest — one player, no matchmaking):** start a practice quiz on
the deployed site and finish it.

**Ranked (if practical):** one duel, played out or forfeited.

Then verify in Supabase:

```sql
select event_name, source_system, source_entity_type, source_entity_id,
       user_id, is_guest, occurred_at, received_at, metadata
from public.analytics_events
where source_system = 'railway'
order by received_at desc
limit 20;
-- expect: source_system='railway' on every row;
--         practice_quiz_started + practice_quiz_completed sharing one
--         quiz_session entity id;
--         ranked_started/ranked_completed as TWO rows each, entity ids
--         <match_id>:<user_id>, never one row per match;
--         user_id = the tester's Supabase uid — the same uid their
--         landing_viewed carried, which is the whole point.

-- duplicate protection, live
select source_entity_type, source_entity_id, event_name, count(*)
from public.analytics_events
where source_system = 'railway'
group by 1,2,3 having count(*) > 1;
-- expect ZERO rows.

-- the acquisition -> gameplay join this phase existed to make possible
select e.user_id, min(e.received_at) filter (where e.event_name='landing_viewed') as landed,
       min(e.received_at) filter (where e.event_name='practice_quiz_completed') as played
from public.analytics_events e
where e.user_id is not null
group by e.user_id;
```

Railway-side, after the test: `GET /api/admin/analytics/health` should report
`ok: true`, `unsent: 0`, and a recent `last_sent_at`.

**Retry proof, live:** re-POST the same completion (or restart the process with
a row already sent) and confirm the count does not change.

**Cleanup:** these are real gameplay rows from a real account. Per the brief,
clean only what is clearly test-specific; a practice quiz the owner played is
genuine history and deleting it would falsify the record. The recommendation is
to keep them and note the tester's uid.

## 20.12 Remaining risks

1. **Nothing is deployed** (§20.10). Every statement above about production is
   a prediction until then.
2. **The drainer runs per process.** Railway running multiple web processes
   means multiple drainers on one SQLite file. Safe — claims are oldest-first
   and delivery is idempotent, so the worst case is a duplicate POST that
   Supabase refuses — but it is untested at concurrency, and a single worker or
   a dedicated drainer process would be tidier.
3. **SQLite on Railway is ephemeral unless `/data` is mounted.** The outbox
   lives in the gameplay DB, so it inherits whatever durability that has. If
   the volume is lost, undelivered events are lost with it — the same exposure
   gameplay already carries.
4. **`retries exhausted` rows are kept, not alerted on.** `health()` counts
   them; nothing pages anyone.
5. **Clock skew.** `occurred_at` is Railway's clock; `received_at` is the
   database's. Group by `received_at`, as §14.3 says.
6. **Mastery completion remains non-idempotent at source** (§20.6). Protected,
   not fixed.
7. **Meta Reflex has no authoritative event** (§20.1), so mode coverage is
   four of five.
8. **The frontend shim is still in place** (§20.9).

## 20.13 Scope for FUNNEL1C — Admin analytics

Not started, and it should not start before §20.10–20.11 are green.

1. **One destination, under Overview**, registered through
   `src/lib/admin/admin-registry.ts` — one entry, nothing else moved (§10).
2. **The acquisition funnel**: unique visitors → sessions → `landing_viewed` →
   `hub_entered` → `leaguecraft_opened` → mode opens → `signup_completed`,
   sliced by first-touch source/medium/campaign.
3. **The gameplay funnel**, now that it exists: mode opened → started →
   completed, per mode, from `source_system='railway'` rows only.
4. **Guest → registered conversion** from the `is_guest` snapshot, and
   **new vs returning / D1 / D7** from `analytics_sessions` (§14.12).
5. **Read path.** Admin reads Supabase only — never a live join against
   Railway. That boundary is what B3 exists to have removed the need for.
6. **Surface the freshness signal** (§20.7) somewhere an operator sees it
   daily. A dashboard reading zero must be distinguishable from a product
   nobody used.
7. **Fix the remaining `/admin/data` Arena-era framing** or label it archived
   (§7) — out of scope for the charts themselves.

Explicitly still out of scope: verification features, Meta Reflex emission,
reconciling the two ad analytics systems (§13.4).

---

# 21. FUNNEL1B3.1 — Least-privilege ingest replaces service-role delivery

A correction to B3's delivery seam. Everything else in §20 stands.

## 21.1 What changed, exactly

| | B3 (wrong) | B3.1 |
|---|---|---|
| Railway holds | `SUPABASE_SERVICE_ROLE_KEY` | `RAILWAY_ANALYTICS_INGEST_SECRET` |
| That credential can | read and write **every table** in the database | append one authoritative gameplay row |
| Delivery target | `POST /rest/v1/analytics_events` (PostgREST) | `POST /functions/v1/railway-analytics-ingest` |
| Privileged key lives | in Railway's environment, on another platform | inside Lovable Cloud, injected by the edge runtime |
| Row construction | Railway sends the finished row | Railway sends facts; the function builds the row |

```
Railway gameplay tx ─► SQLite outbox ─► railway-analytics-ingest ─► analytics_events
```

The premise B3 was built on was simply false: Lovable Cloud exposes no
user-facing service-role credential. But the fix is not a workaround for a
missing key — it is the shape this should have had anyway. A database-wide
master credential, sitting in a second platform's environment, able to read
`profiles` and write `user_roles`, in exchange for appending to one table, is
an enormous grant for a small need. A leak of the new secret is a bounded
incident: rotate it, and the exposure was append-only rows in one table whose
`source_system` the caller never controlled.

**Nothing else moved.** The transactional outbox, the authoritative transition
map (§20.1), the entity/idempotency model (§20.2), per-participant ranked keys,
uid continuity, bot/`anonymous` exclusion and the non-blocking gameplay
semantics are unchanged — and their tests still pass unmodified, which is the
evidence that this was a delivery change and not a redesign.

## 21.2 Edge Function contract

`supabase/functions/railway-analytics-ingest/` — `index.ts` (transport) and
`contract.ts` (all the rules, pure TypeScript, unit tested).

**Request** — `POST`, `Authorization: Bearer <RAILWAY_ANALYTICS_INGEST_SECRET>`,
body `{"events": [...]}` (a bare array is also accepted), at most 50 per call.

Each event carries facts only:

```jsonc
{ "event_name": "...", "source_entity_type": "...", "source_entity_id": "...",
  "user_id": "uuid|null", "is_guest": true, "occurred_at": "ISO",
  "event_version": 1, "metadata": {} }
```

**The caller does not get to choose the row.** Set server-side, every time:

- `source_system` → **forced** to `railway`. A leaked secret still cannot forge
  a `web` row or invent a source system.
- `route` → always null. A backend event carrying one would be lying.
- `verification_type` → always null. Not Railway's to assert.

Validation, all rejections permanent: event name in the eight-name allowlist ·
entity type in the four Railway owns · entity id present, trimmed, ≤128 chars ·
`event_version` supported · `occurred_at` parseable · `metadata` ≤4 KiB
(deliberately under the column's own 8 KiB CHECK, so anything accepted here is
insertable) · `user_id` uuid-shaped when supplied.

Identity has one asymmetry worth stating: a **malformed** `user_id` is
*rejected*, because that is a caller bug and silently nulling it would hide it;
a **known non-person** (`anonymous`, `bot::…`) is accepted with `user_id` null,
because a signed-out DSA practice run is a real gameplay fact and losing the
event to protect one column would be the wrong trade.

**Status codes are a contract with the outbox** — the drainer decides
retry-vs-dead-letter from them alone:

| Status | Meaning | Outbox does |
|---|---|---|
| 200 | stored, or already present | mark delivered |
| 401 | bad/missing secret | **retry**, and shout: config failure |
| 405 | not POST | dead-letter |
| 422 | contract violation | **dead-letter**, never retry |
| 500 | function misconfigured / our bug | retry |
| 503 | insert failed (pooler, restart) | retry |

Rows are inserted one at a time, mirroring the drainer: a batch containing one
conflicting row would otherwise be rejected whole.

**Naming.** The allowlist is the FROZEN contract's names —
`practice_quiz_started` / `_completed`, not the `practice_started` / `_completed`
the B3.1 brief lists. §14.4 renamed those deliberately ("practice" is ambiguous
here: Practice Quiz, Practice Builder, DSA practice run) and the frontend's
`MACRO_EVENTS` already reserves the longer names for exactly this emission.
Accepting a second spelling would create two names for one fact. A test asserts
`practice_started` is rejected.

`verify_jwt = false` in `config.toml`, declared so a repo-driven deploy
reproduces it: the caller is a server with no Supabase session, and the
function authenticates itself before reading anything. It is **not** authorized
by the anon key — that key is public by construction, so using it here would
mean any browser could forge gameplay.

## 21.3 Secret model

One secret, `RAILWAY_ANALYTICS_INGEST_SECRET`, in exactly two places: the
Lovable Cloud function secret store, and Railway's `web` service.

Not committed, not in frontend code, not logged (a bad-secret rejection logs
that it happened and never what was supplied), and never in a health response —
`/api/admin/analytics/health` reports the *endpoint* and a
`secret_configured` boolean, and a test asserts the value cannot appear.
Comparison is length-checked and constant-time-ish, because `===` on a secret
leaks its prefix through timing.

`SUPABASE_SERVICE_ROLE_KEY` is no longer read by Railway, and a leftover one
does **not** re-enable delivery — tested, so an old env var cannot quietly
resurrect the removed path.

## 21.4 Railway client changes

`analytics/client.py` only. `resolve_config()` now returns the ingest endpoint
and secret; `requests_transport` POSTs `{"events": [...]}` with the bearer
header and maps the status table above onto `TransportResult`, which gained a
`permanent` flag.

**One new environment variable, not two.** The endpoint is derived from
`SUPABASE_URL` (already in Railway) as
`{SUPABASE_URL}/functions/v1/railway-analytics-ingest`, with
`ANALYTICS_INGEST_URL` as an override for a custom domain or a staging function.

`analytics/outbox.py` gained one column, `dead_letter`, via a tolerant `ALTER`
(SQLite has no `ADD COLUMN IF NOT EXISTS`). `mark_dead()` parks a row;
`claim_unsent` skips them; `stats()` counts them separately from a backlog.
Dead rows are **kept**, not deleted — a rejected event is evidence of a contract
bug, and deleting it would destroy the only record.

## 21.5 Failure classification

| Condition | Response | Behaviour | Visibility |
|---|---|---|---|
| Missing/bad secret | 401 | **retryable** — a secret set later must drain the backlog | `auth_failures` counter + a loud log naming the variable |
| Unknown event name | 422 | dead-letter | `dead_lettered`, log says "contract bug" |
| Malformed entity id / type | 422 | dead-letter | same |
| Invalid user id | 422 | dead-letter | same |
| Unsupported version / oversized metadata | 422 | dead-letter | same |
| Duplicate event | 200 | **success** — the row is present | `duplicates` counter |
| Function unavailable / cold start / network | 5xx or exception | retry, capped at `MAX_ATTEMPTS` | `abandoned` once capped |
| Database unavailable | 503 | retry | as above |
| Function deployed without its secret | 500 | retry | server-side error log |

The 401-is-retryable choice is deliberate and is the one that looks wrong at
first glance. It is a *configuration* failure, not a contract failure: the
payload is fine and will deliver the moment the secret matches. Dead-lettering
it would turn a five-minute config fix into permanent data loss.

## 21.6 Files changed

**Frontend / Lovable** (`mogsy`)

```
supabase/functions/railway-analytics-ingest/index.ts          NEW  transport
supabase/functions/railway-analytics-ingest/contract.ts       NEW  the rules
supabase/functions/railway-analytics-ingest/contract.test.ts  NEW  37 tests
supabase/config.toml                                          verify_jwt = false
vitest.config.ts                                              include the test
docs/FUNNEL1_HANDOFF.md                                       this section
```

**Backend** (`League_Combat_Simulator`, branch `funnel1b3-gameplay-analytics`)

```
analytics/client.py                        ingest endpoint + secret; status map;
                                           TransportResult.permanent
analytics/outbox.py                        dead_letter column, mark_dead,
                                           stats separation
analytics/__init__.py                      three-way classification, auth_failures
routes/analytics_health.py                 six distinguishable states
test_funnel1b3_gameplay_analytics.py       +12 tests
```

No gameplay file changed in B3.1 — the emit points from §20 are untouched.

## 21.7 Tests

```
supabase/functions/railway-analytics-ingest/contract.test.ts   37 passed
test_funnel1b3_gameplay_analytics.py                           51 passed
```

Edge contract (37): the eight-name allowlist and rejection of a browser event,
an unknown snake_case name and the brief's `practice_started` spelling ·
`source_system` forced even when the caller supplies `web` · `route` and
`verification_type` nulled · the caller's `id`/`received_at` discarded ·
`ranked_participant` accepted and `ranked_match` rejected · entity id required
and bounded · uuid validation, with malformed rejected and non-persons nulled ·
version, timestamp and metadata bounds · batch envelope, empty and oversized ·
secret match/mismatch/missing and bearer parsing.

Railway (51 = 39 from §20.8, unmodified, + 12 new): endpoint is the function
and not PostgREST · a leftover service-role key does not re-enable delivery ·
override wins · the secret travels in the header, never the URL · a 422 is
dead-lettered and **never picked up again** · dead rows are counted apart from a
backlog · a 401 stays retryable, is counted, and the backlog delivers once the
secret is fixed · retryable and permanent failures do not block each other · the
retry budget caps rather than looping · **gameplay succeeds with the ingest
unavailable, and with no secret configured at all**.

Affected backend suites re-run: **180 passed, 1 failed** — the mastery catalog
failure already reproduced on a clean stash of this branch (§20.8).

Frontend suites remain green (95), including the scan proving no browser source
emits a server-authoritative name.

## 21.8 Config steps still requiring deployment access

Nothing here can be done from this environment.

1. **Generate** a high-entropy `RAILWAY_ANALYTICS_INGEST_SECRET` (e.g. 32+
   random bytes, base64). Do not paste it into chat.
2. **Lovable Cloud** → function secrets → add it.
3. **Railway `web` service** → variables → add the same value. Confirm
   `SUPABASE_URL` is already present (it is, for auth).
4. **Deploy the edge function.**
5. **Smoke-test it server-to-server** before any Railway deploy:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  "$SUPABASE_URL/functions/v1/railway-analytics-ingest" \
  -H "Content-Type: application/json" -d '{"events":[]}'
# expect 401 — no secret

curl -sS -X POST "$SUPABASE_URL/functions/v1/railway-analytics-ingest" \
  -H "Authorization: Bearer $RAILWAY_ANALYTICS_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"events":[{"event_name":"landing_viewed","source_entity_type":"quiz_session","source_entity_id":"x"}]}'
# expect 422 unknown_event — the vocabulary is closed

curl -sS -X POST "$SUPABASE_URL/functions/v1/railway-analytics-ingest" \
  -H "Authorization: Bearer $RAILWAY_ANALYTICS_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"events":[{"event_name":"practice_quiz_started","source_entity_type":"quiz_session","source_entity_id":"smoke-b31","user_id":null}]}'
# expect {"ok":true,"stored":1,...}; repeat it — expect duplicates:1, stored:0
```

Then delete the smoke row:
`delete from public.analytics_events where source_entity_id = 'smoke-b31';`

## 21.9 Deployment order

1. ✅ Edge function + Railway client implemented and tested
2. ⏳ Generate `RAILWAY_ANALYTICS_INGEST_SECRET`
3. ⏳ Set it in Lovable Cloud
4. ⏳ Set the same value in Railway `web`
5. ⏳ Deploy the edge function
6. ⏳ Server-to-server smoke call (§21.8)
7. ⏳ Merge `funnel1b3-gameplay-analytics` → `master`
8. ⏳ Railway deploys
9. ⏳ Practice certification
10. ⏳ Ranked certification

Steps 2–5 are safe before any Railway deploy: until the backend ships, nothing
calls the function. Step 7 is deliberately **after** step 6 — the brief's
ordering, and the right one, because a merge that deploys a live game backend
should not be the thing that discovers the function is misconfigured.

## 21.10 Production certification

**Not yet run** — blocked on §21.9 steps 2–8.

Practice first (one player, no matchmaking): start and finish one quiz on the
deployed site, then

```sql
select event_name, source_system, source_entity_type, source_entity_id,
       user_id, is_guest, occurred_at, received_at
from public.analytics_events
where source_system = 'railway'
order by received_at desc limit 20;
-- expect exactly one practice_quiz_started and one practice_quiz_completed,
-- sharing one quiz_session entity id, carrying the tester's Supabase uid —
-- the same uid their landing_viewed carried.

select source_entity_type, source_entity_id, event_name, count(*)
from public.analytics_events where source_system = 'railway'
group by 1,2,3 having count(*) > 1;
-- expect ZERO rows.
```

Then Ranked: **two** participant-level starts and **two** completions for a
human-vs-human duel, entity ids `<match_id>:<user_id>`, a bot opponent
contributing none.

Replay proof: re-run the drain (or restart the process with a row already
sent) and confirm counts do not change — the `duplicates` counter should rise
while `analytics_events` does not.

Railway-side: `/api/admin/analytics/health` → `ok: true`, `unsent: 0`,
`dead_lettered: 0`, recent `last_sent_at`.

Cleanup: these are real gameplay rows from a real account. Remove only the
`smoke-b31` row from §21.8; a practice quiz the owner actually played is
genuine history and deleting it would falsify the record.

## 21.11 Remaining risks

1. **Nothing is deployed.** Every production claim above is a prediction.
2. **Two places must hold the same secret.** A mismatch is the most likely
   failure, which is why 401 is counted, named in the health output, and
   retryable rather than destructive.
3. **Edge function cold starts** add latency to a drain pass. Harmless — the
   drainer is off the gameplay path and retries — but it will show as
   occasional 5xx/timeouts early on.
4. **The drainer runs per process** (§20.12.2), unchanged by B3.1. Safe,
   because delivery is idempotent, but untested at concurrency.
5. **Dead-lettered rows need a human.** Counted and logged; nothing pages.
6. **No rate limiting on the ingest.** The secret is the only gate. Append-only
   with a forced `source_system` bounds the damage, and a rotation ends it.
7. §20.12's items 3, 5, 6, 7 and 8 are unchanged: SQLite durability on Railway,
   clock skew, mastery's unguarded transition, Meta Reflex having no
   authoritative event, and the frontend type shim.

## 21.12 FUNNEL1C scope

Unchanged from §20.13, and still not started.
