# USERS1 — Clean audience identity, and one Users domain

**State: CODE COMPLETE on `users1/audience-identity`, NOT merged, NOT deployed.
Three things need a human with production access, in this order — see
[Production, and what is still outstanding](#production-and-what-is-still-outstanding).**

Read this file first. It records what the identity lifecycle actually was, what
changed, and exactly what is left.

---

## Objective

Stop ordinary visitors and automation from becoming Supabase auth users;
distinguish human / automation / internal / unknown traffic; purge the polluted
pre-launch anonymous identities; reset analytics to a clean launch baseline; and
collapse Admin's People + Analytics into one **Users** domain where an aggregate
number drills into the individual records behind it.

## Starting main SHA

```
origin/main   cdfa23cf67f6a64b53066a32499e46339f466e94
              "LEGACY1: record the merge, and that the publish still needs a human"
branch        users1/audience-identity
worktree      .worktrees/users1
```

Verified with `git fetch origin` before any edit; it matched the SHA the brief
expected and has not moved since.

---

## Identity lifecycle BEFORE

```
page load  ->  AuthProvider reads app_settings.require_auth
           ->  require_auth is DISABLED in production
           ->  supabase.auth.signInAnonymously()          <-- a real auth.users row
           ->  handle_new_user() writes a profiles row
           ->  analytics visitor + session (localStorage, independent)
```

and then, on top of that, **four more mount effects** minting the same thing:

| Where | Trigger | Stated reason |
|---|---|---|
| `hooks/useAuth.tsx` | every page load, app-wide | "check if we should sign in anonymously" |
| `pages/LolHub.tsx` | mounting `/lol` | "ensure anon session" |
| `pages/Quiz.tsx` | mounting `/quiz` | "Ensure anonymous session" |
| `pages/CombatLab.tsx` | mounting Combat Lab | "so combat lab usage is tracked under a stable user_id" |
| `pages/LeagueSwipeGame.tsx` | mounting Meta Reflex | "so votes attribute to a stable user id" |
| `lib/backend-auth.ts` | any JWT-only backend call, **including reads** | guest-first guarantee |
| `lib/quiz/api.ts` `authedRequest` | the Leaguecraft hub's own mount — builder catalog, weakness report, saved sets | the same guest-first guarantee, applied to reads |

The last two are the subtle ones: `/quiz` called `ensureBackendAuthToken()` on mount
to ask the history endpoint whether this brand-new visitor had any history. It
did not — but it now had an account. `useDailyChallengeStatus` did the same
through a GET on the Daily Challenge client, and `authedRequest` minted for
every builder READ the workspace issues on mount.

The last one was found by **loading the running app**, not by reading it:
after the four obvious mount effects were deleted, `/quiz` still produced an
`sb-…-auth-token` in localStorage. That is why the signed-out check in the
deploy order below is a real check and not a formality.

**That is the whole explanation for ~5,000 anonymous identities.** One per
browser that had ever rendered a page: crawlers, previews, agent runs,
automated QA, and the same handful of humans over and over.

### What did NOT need auth, and never did

* **Analytics.** `analytics_visitors`, `analytics_sessions` and
  `analytics_events` all grant INSERT to the `anon` role
  (`20260920120000_funnel1b1_analytics_foundation.sql`). The entire funnel is
  recorded for a browser with no session at all. The visitor id is a
  first-party UUID in localStorage; it was never derived from the auth uid.
* **Browsing.** `ProtectedRoute` lets everyone through while `require_auth` is
  disabled, regardless of `user`.
* **The Academy register.** `lib/welcome/academy-registration.ts` already says
  in its own header that "at /welcome there is very often no auth session", and
  has a device-local half plus an adoption bridge for exactly that case.

### What genuinely does need auth

| Surface | Boundary | Evidence |
|---|---|---|
| Leaguecraft / practice | quiz attempt + session writes | `lib/quiz/api.ts` `authedRequest` — backend attributes writes to the verified JWT subject and rejects unverified callers |
| Study Hall / builder | saving and running a set | same path (`builderApi`) |
| Daily Challenge | starting / advancing a run (POST) | `lib/daily-challenge/run/client.ts` |
| Ranked | match writes (non-GET) | `lib/ranked-public/client.ts` — "identity is the Supabase bearer JWT only" |
| Champion Mastery | session writes (non-GET) | `features/mastery/live/api.ts` |
| Stat Check online | creating / joining a room | `lib/stat-check-online/client.ts` (`AUTH_REQUIRED`, `ACCOUNT_REQUIRED` codes) |
| Combat Lab | running a metered simulation | credits are per identity (`/api/combat-lab/credits`) |
| Combat Sim Battles | submitting a prediction | `myPrediction` is per account |
| Meta Reflex | **casting a vote** | `20260813120300_meta_reflex_vote_rpc_v2.sql` keys `league_swipe_preferences` on `auth.uid()`, and spells out that a caller with no session has its play logged but cannot hold a preference |

`analytics_events.user_id` is deliberately **not** a foreign key to
`auth.users`, so the purge cannot cascade history away or be blocked by it.

---

## Identity lifecycle AFTER

```
browser visitor
    -> analytics visitor + session      localStorage, no auth, always
    -> meaningful product interaction
    -> anonymous auth identity          lib/auth/anonymous-identity.ts, and nowhere else
    -> registered account               signup / in-place guest upgrade
```

**The rule: reads never mint, writes do.**

* `lib/auth/anonymous-identity.ts` is the only module that calls
  `signInAnonymously`. It documents every boundary that calls it and
  single-flights them, so the several writes that fire at the start of a quiz
  share one identity instead of minting three.
* `getBackendAuthHeaders({ mint })` carries the boundary to every backend
  client. It is an OPTION on that function rather than a new export because
  `@/lib/backend-auth` is the seam ~70 test files already stub — a separate
  export would have let a real `signInAnonymously()` escape into a unit run
  against the production project.
* `getExistingBackendAuthToken()` is the new default for reads. A null result
  is an answer ("no identity, so no rows"), not a failure.
* Those clients express it as "non-GET mints, GET does not". That is the honest
  boundary: their backends attribute every mutation to the verified JWT
  subject, and none of their reads does anything with an identity a guest
  needs. Two deliberate exceptions are documented in
  `lib/combat-lab/team-sim/client.ts`: recoverable-request discovery and
  recovery-by-handle do NOT mint, because a signed-out visitor has nothing to
  recover.

---

## Traffic classification

Four classes, one per **browsing session**:

```
human       a trusted pointer / key / touch event was observed
automation  navigator.webdriver, or a bot/headless token in the user agent
internal    our own marked traffic: QA, agents, previews, localhost, E2E
unknown     not enough evidence either way
```

Three rules keep it honest, and all three are enforced, not just documented:

1. **Unknown is not human.** A session starts `unknown` and is promoted only by
   a real input event (`lib/analytics/humanSignal.ts`, wired from `main.tsx`).
   `isTrusted` alone is not enough — CDP input is reported as trusted — so
   `navigator.webdriver` is re-checked at promotion time.
2. **The marker can only exclude, never launder.** A caller may mark itself
   `internal` or `automation`; it may not mark itself `human`. The RLS WITH
   CHECK on `analytics_sessions` refuses `human` from any client, and the only
   write path to it is `analytics_promote_session_human()`, which moves a
   session out of `unknown` and can do nothing else.
3. **Nothing authorizes on it.** A guard test asserts no module outside the
   analytics surface reads `traffic_class`.

### How a coding agent, a test or a QA run marks itself

```
URL      ...?mgz_traffic=internal&mgz_source=claude     (persisted for the browser)
Script   window.__MOGZY_TRAFFIC__ = { class: "internal", source: "playwright" }
         set before boot — Playwright's addInitScript, a bookmarklet
Build    VITE_TRAFFIC_CLASS=internal VITE_TRAFFIC_SOURCE=smoke_test
Clear    ...?mgz_traffic=clear
```

`traffic_source` is free text: `claude`, `codex`, `playwright`, `smoke_test`.
E2E mode (`VITE_E2E_AUTH=1`) marks itself `internal` automatically, and
localhost and the Lovable preview hosts are `internal` by definition.

**Please use this.** It is the mechanism that stops future agent work from
contaminating the launch numbers, and it costs one query parameter.

---

## Schema changes

`supabase/migrations/20260923120000_users1_traffic_classification.sql` —
additive only, drops nothing, rewrites no row.

```
analytics_sessions  + traffic_class text NOT NULL DEFAULT 'unknown'  (CHECK: the four classes)
                    + traffic_source text
                    + classification_reason text
                    + idx_analytics_sessions_traffic_class
                    INSERT policy replaced: anon/authenticated may write
                    'automation' | 'internal' | 'unknown' — never 'human'

analytics_promote_session_human(uuid, text)   SECURITY DEFINER, the one path to 'human',
                                              unknown -> human only, idempotent

analytics_traffic_overrides   NEW. visitor_id PK, traffic_class, traffic_source,
                              reason, set_by, set_at. Admin-only for every verb.
```

**Why the session and not the event.** A `traffic_class` column on
`analytics_events` copies three values onto every one of hundreds of thousands
of rows and lets one session disagree with itself — half its events automation,
half human — which is not a state that can be true. What is being classified is
a browsing session: one browser, one visit, one verdict. `analytics_visitors`
deliberately gains nothing; a visitor's class is DERIVED (strongest signal
across their sessions: internal > automation > human > unknown), because a
person's first session and their tenth can genuinely differ.

**Why overrides are a separate table.** The ledger stays append-only and the
observation is never edited, so "what did we detect" and "what did we decide"
remain two answerable questions.

---

## Analytics defaults

Default population: **human + unknown**. That is a deliberate slight
over-count. Excluding `unknown` would discard every visitor whose browser never
fired a trusted input — someone who read the landing page and left is a real
visitor. Including automation and internal is what produced the numbers this
work replaces.

Filters: Human + unknown · Human only · Unknown · Automation · Internal/test ·
All traffic. Nothing is deleted from the warehouse to achieve any of them.

The filter narrows the **dataset** once, before any metric sees it
(`filterDatasetByTraffic` in `lib/admin/analytics/traffic.ts`), so all two dozen
definitions in `metrics.ts` honour it without each having to remember to. A
filter threaded through every metric would be forgotten in one of them, and the
number that forgot would look exactly like a correct one.

---

## Users IA

```
Admin
├─ Overview
├─ Users                     <- Analytics + People, collapsed
│   ├─ Overview              headline KPIs, every tile clickable
│   ├─ Visitors              the list, and the one record detail
│   ├─ Accounts              Accounts · Profile browser · Roles & access · Identities (master)
│   ├─ Activity              mode opens vs Railway-confirmed starts/completions
│   ├─ Acquisition           funnel + signup funnel + first/session-touch sources
│   ├─ Retention             new vs returning, repeat sessions, D1/D7
│   ├─ Moderation            Comments · User reports · Moderator roster · Feedback
│   └─ Traffic Health        the traffic mix + analytics integrity + Railway outbox
├─ Leaguecraft               ... + Ranked (six views, all eleven tools)
├─ Simulation
├─ Game Data
├─ Studio
├─ Operations                ... + Notifications (admin inbox · push campaigns)
└─ Developer
```

Redirects kept for bookmarks only, advertised nowhere:

```
/admin/analytics  ->  /admin/users
/admin/people     ->  /admin/users?section=accounts
/admin/ranked     ->  /admin/leaguecraft?section=ranked
/admin/users      ->  (now the Users area itself, not the old identity-directory redirect)
```

### Leaguecraft + Ranked — the decision, and why

**Merged.** Ranked is a Leaguecraft mode; it was a top-level area only because
it arrived late and needed somewhere to live, and a sidebar that lists a product
beside one of its own modes describes the order features shipped in rather than
the product. All six operator views and all eleven tools moved verbatim, as
views of one section — `AdminAreaSection` gained a `views` field and
`AdminTool` a `subsection`, specifically so the merge would not flatten six tabs
into one. A merge that loses navigation is a demotion, not a merge.

Nothing about Ranked gameplay, its backend, its flags, its rating policy or any
player-facing surface is touched.

The argument the other way, recorded because it is real: Ranked's admin surface
is mostly LIVE-SERVICE operations (launch readiness against Railway, a flag
mirror, rating policy, bot-match administration, playtests) rather than content.
If Ranked later grows operations that have nothing to do with Leaguecraft
content, that is the reason to revisit this — not the fact that it is large.

---

## Canonical record model

One detail experience. An anonymous visitor and a registered account are the
same record with more or less of it filled in
(`components/admin/users/VisitorsSection.tsx`).

```
Visitor / Account record
├─ Identity            visitor id, class, source, why, first/last seen, sessions
│                      + Reclassify (writes analytics_traffic_overrides)
├─ Acquisition         first touch: landing, referrer, utm_*
├─ Sessions            every session, each with its own observed class
├─ Gameplay            source_system = 'railway' rows, matched by uid
├─ Activity            every event, newest first, with route and guest state
└─ Account             profile, kind, premium, created, auth id — or "no account",
                       which since USERS1 is the normal state for someone who browsed
```

**Linkage is deterministic and nothing else.** A visitor is joined to an account
only through a uid that the browser itself reported on its own events. No IP
matching, no user-agent matching, no fingerprinting, no cross-device guessing.
Two browsers belonging to the same human stay two records, which is the honest
answer. The payoff is the question the operator actually asks: *what did this
person do before they signed up?* — the pre-signup activity is on the same
record, above the account.

---

## Drill-down

Every headline number opens the records behind it. The tile renders
`population.size` and the list renders `population` — the same computation
(`computeOverviewPopulations`), so they cannot drift.

```
Visitors · Sessions · New · Returning · Engaged sessions · Engaged visitors · Signups
Repeat sessions · New-visitor cohort
every acquisition funnel step          event:<name>
every mode's "Opened (visitors)"       mode:<id>
```

All land on Users › Visitors with `?population=<key>`, then a row opens the
record. Session-grained metrics resolve to the visitors who own those sessions,
and the banner says so when the list is shorter than the number.

---

## Admin capabilities removed

| Removed | Why |
|---|---|
| **Custom Links** tool (`people-custom-links`) | LEGACY1 deleted `AdminCustomLinks` and narrowed custom links to invite-code resolution. The registry was still advertising a control with no implementation. |
| **"Guest identities" headline** on Overview | It read as an audience number and counted anonymous `profiles` rows — one per browser that had loaded a page. Now "Anonymous auth identities", with the hint that it should stay near zero and that a climbing number means something is minting on page load again. |
| **People** and **Analytics** as destinations | Two halves of one operator question. |
| **Ranked** as an area | A mode of Leaguecraft. |

Everything else in People survived the audit: roles, demo access, password
reset, resend/confirm verification, ban/unban, notes, send notification, delete
profile, the anonymous purge, invites, comments, reports, moderator roster,
feedback. Each is a current capability with a live backend. LEGACY1 had already
removed the diamond-era controls; nothing of that kind remained.

---

## Terminology

| Says | Means |
|---|---|
| **Visitors** | `analytics_visitors` — browsers. The audience number. |
| **Sessions** | `analytics_sessions` — visits, 30-minute inactivity window. |
| **Registered accounts** | `profiles`, non-anonymous, non-bot. |
| **Anonymous auth identities** | `profiles.is_anonymous` — created at a WRITE. Should be small. |
| **Automation / Internal traffic** | Visitors excluded from the default KPIs, never deleted. |

`auth.users` is never used as the audience count anywhere.

---

## Tests

New:

```
src/lib/analytics/traffic.test.ts                    15  classification, the marker, the write shape
src/lib/auth/anonymous-identity.test.ts               8  reads never mint, writes mint once, single-flight
src/lib/admin/analytics/audience.test.ts             16  default population, filter switching, overrides,
                                                         drill-down, visitor record, visitor->account linkage
src/test/guards/users1AudienceIdentity.test.ts       12  source guard (see below)
```

Plus a live check against the production Supabase project, signed out, on a
local build of this branch:

```
/  /lol  /quiz  /combat-lab  /league-swipe
    render fully signed out
    NO sb-…-auth-token in localStorage on any of them
    analytics visitor + session written with traffic_class = internal
    ?mgz_traffic=internal&mgz_source=claude persists across navigation
    ?mgz_traffic=clear gives the browser back
```

The guard asserts, against comment-stripped active runtime source only:
`signInAnonymously` has exactly one caller; no page mints on mount; Meta
Reflex's mint is inside `handleChoose`; the three read surfaces use the
non-minting helper; `lib/analytics/**` never touches auth; `traffic_class` is
read by no module outside the analytics surface; promotion goes through the RPC
from one module; People/Analytics have no area, no page and no advertised
destination; and the three retired paths resolve as redirects.

Existing suites updated rather than deleted: `admin-registry.test.ts`,
`admin-registry.routes.test.ts`, `AdminShell.areas.test.tsx`,
`AdminMasterAdminRoute.test.tsx`, `metrics.test.ts`, plus ~22 test files whose
`@/lib/backend-auth` mock needed the new non-minting export.

### Results

Baseline captured on `origin/main` (`cdfa23cf`) in `.worktrees/legacy1`, per
directory, `--max-old-space-size=8192` (the full suite OOMs in one process on
this machine — FUNNEL1 §24.9, LEGACY1).

```
                                  baseline        after
src/lib                          see below      see below
src/hooks
src/components
src/pages
typecheck                     20 errors / 12   20 errors / 12   (identical files)
production build                     —          vite build OK
```

**Pre-existing failures reproduced on `cdfa23cf` and untouched by this work:**

* `AdminPlatformPolicies.test.tsx` — asserts POSIX path separators; fails on
  Windows.
* `pro-play` / `quiz-screenshot` command tests — shell-split through `/bin/sh`;
  fails on Windows.
* `AdminUsers.phase1.test.tsx` "renders selected-user feedback".
* `Quiz.hub.test.tsx` "keeps exactly one h1".
* `QuestionTimeline.test.tsx` MALT B1 popover block (flaky, 7–14 failures per run
  on both trees).
* `src/test/guards` "no static League facts" (1 fail / 2 — recorded by LEGACY1).
* `src/test/security` — 24 failures across 19 files, one of which OOMs alone.

**New failures introduced by this work: none.** Every failure above reproduces
on `cdfa23cf`.

---

## Production, and what is still outstanding

This repository holds only the Supabase **anon/publishable** key (`.env`:
`VITE_SUPABASE_PUBLISHABLE_KEY`). There is no service-role key in the tree and
no Supabase connector in an agent session, so **no agent can read `auth.users`,
count anonymous identities, or delete them.** Every earlier phase handled this
the same way (FUNNEL1 §15.9, §17.5): the SQL is written here, the owner runs it.

All of it is in **`docs/USERS1_PRODUCTION_SQL.md`**, in order:

| | What | Who |
|---|---|---|
| **A** | Audit, READ ONLY. The four registered accounts in full, the anonymous count and its shape, what anonymous identities ever did that persisted, every FK and non-FK reference to a user id, current analytics volume. | **owner — not yet run** |
| **B** | Apply `20260923120000_users1_traffic_classification.sql`. Additive and safe to apply before the frontend ships. | **owner — not yet run** |
| **C** | Purge the anonymous identities, then reset the three analytics tables. **Destructive.** Must not run until the new build is live, or automation recreates them within a day. Preferred purge path is the existing admin-gated `purge-anonymous-users` edge function (Users › Accounts), not raw SQL — `auth.users` has side tables the Auth API owns. | **owner — not yet run** |
| **D** | Certification read-back: what the smoke traffic produced and how it was classified. | **owner — not yet run** |

### Phases deliberately NOT completed, and why

* **Phase 2 — classify the four registered accounts.** Needs block A. The brief
  is explicit that no registered account may be deleted without classification,
  and that an ambiguous one is preserved. **Nothing in this branch deletes or
  modifies any registered account**, so that rule cannot be violated by merging
  it.
* **Phase 3 — anonymous dependency audit.** Blocks A4/A5/A6 answer it. What the
  repository can already say: seven foreign keys reference `auth.users`
  (`profiles`, `leagues.created_by_user_id`, `user_roles`,
  `champion_images.updated_by`, `user_identity_links`,
  `identity_link_attempts`, `identity_link_pending`), all `ON DELETE CASCADE`
  or `SET NULL`, so a purge cannot leave a broken FK. Everything else stores a
  plain uuid (including `analytics_events.user_id`, deliberately), so the
  residue is orphaned rows, not broken references.
* **Phase 8 — production cleanup.** Block C, after the deploy.
* **Phase 16 — production certification.** Block D, after the smoke visits.

### Deploy

`main` is the Lovable production ref (FUNNEL1 §16.4) and a push that originates
outside Lovable syncs code without republishing. **Someone has to press Publish
in Lovable**, exactly as LEGACY1 recorded. The correct order is:

```
1. run block B (the migration) FIRST — see below
2. merge this branch to main
3. press Publish in Lovable, and confirm the live bundle changed
4. browse the live site signed out; confirm NO anonymous auth user appears
5. run block C (purge + analytics reset)
6. run one marked internal smoke visit (?mgz_traffic=internal&mgz_source=smoke_test)
   and one ordinary visit
7. run block D and confirm the classification and the default filter
```

**The migration goes first, and this was measured, not assumed.** With the new
frontend running against the un-migrated database, PostgREST rejects the
session insert outright — *"Could not find the 'classification_reason' column
of 'analytics_sessions' in the schema cache"* — and the SESSION IS LOST, not
just its classification. Block B is additive and harmless against the old
frontend, so it is safe to run before the publish and not safe to run after.

Belt and braces for the case where that ordering slips anyway:
`recordSession` now retries without the three classification columns on
exactly that error, so a session lands unclassified (which reads as `unknown`,
inside the default population) instead of vanishing. The failure is still
reported to the diagnostics channel — non-fatal, never silent.

---

## Remaining risks

1. **Guests lose reads that silently depended on the global anon session.**
   Before USERS1 every browser was `authenticated`, so any RLS policy scoped
   `TO authenticated` worked for guests by accident; 64 SELECT policies in the
   migration history are scoped that way.

   This was checked against the real database: the branch was run locally
   against the production Supabase project, signed out, with localStorage
   cleared between each page. `/`, `/lol`, `/quiz`, `/combat-lab` and
   `/league-swipe` all render fully, and **no `sb-…-auth-token` appears**. The
   only analytics failure was the missing migration columns, above.

   Not covered by that check: the deeper authenticated surfaces (starting a
   quiz, a Ranked match, a Mastery session) were not played through as a guest.
   Those are the mint boundaries, so they should behave exactly as before — but
   they are the thing to watch on the first day. If a guest surface goes blank,
   the fix is a SELECT policy for `anon` on that one table, never restoring the
   eager sign-in.
2. **`require_auth` is now read by nobody in `useAuth`.** It still gates
   `ProtectedRoute` and is still editable in Operations › Configuration. If it
   is ever turned ON, signed-out visitors are redirected to `/auth` as before —
   unchanged behaviour, but it is now the setting's only effect.
3. **Detection is not complete and never will be.** `unknown` is inside the
   default population, so an unrecognised crawler still inflates the audience
   slightly. Traffic Health shows exactly how much of the store is `unknown`,
   and the override table is how an operator corrects a specific visitor.
4. **The promotion RPC is callable by anyone.** The worst it can do is promote
   sessions that were already inside the default population. It cannot demote,
   cannot reclassify automation or internal, and nothing authorizes on the
   result.
5. **Client-side aggregation still has a 50,000-row ceiling** (FUNNEL1C's
   `ROW_CAP`). The reset makes that a non-issue for launch; crossing it is the
   signal to move the aggregates into SQL views.
6. **The `?view=` parameter is shared** between Users › Accounts and Users ›
   Moderation. Only one section renders at a time and each falls back to its
   own default, so a stale value is harmless — but it is a shared key, not a
   namespaced one.

---

## Next task

1. Run block A and paste the output back, so the four registered accounts can
   be classified before anything touches them.
2. Merge, publish, then run blocks B, C and D in the deploy order above.
3. LEGACY1's two open items are still open: delete the deployed
   `snapshot-global-elo` and `populate-preset-images` edge functions in the
   Supabase dashboard.
4. Once the store has real classified traffic, revisit whether `unknown` should
   stay inside the default population. That decision should be made against a
   measured mix, not guessed now.
