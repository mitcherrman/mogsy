# USERS2.3B — Browser session intelligence

Date: 2026-09-26  
Base: `61673c53683f16fff859a42c15f83b9406411b92`  
Branch: `codex/users2-3b-session-intelligence`

## Scope and boundary

This slice adds browser/Supabase session intelligence only. It does not define
the 3A activity lifecycle registry, does not change Admin presentation, and
does not add Railway correlation owned by 3C. The migration is committed for
review and was not applied to production.

## Active-time algorithm

`installSessionIntelligence()` installs one application-wide clock. Time is
accumulated only while the document is visible, the window is focused, and the
clock has not been idle for 60 seconds. Hidden and blurred intervals contribute
zero. A trusted `pointerdown`, `keydown`, `touchstart`, wheel, or scroll signal
resumes an idle clock; wheel/scroll signals are throttled to once per second,
and visibility or focus alone does not resume activity. These signals affect
active-time only; USERS1 human traffic promotion remains limited to its existing
pointer/key/touch rules. The accumulator caps a delayed timer sample
at the idle boundary, so a throttled/background timer cannot turn wall time into
active time.

The browser stores the cumulative value locally per session and submits a
monotonic snapshot to Supabase. The database uses `greatest(existing, incoming)`
so retries and out-of-order writes are idempotent and cannot move a total
backwards. This is not first-event-to-last-event duration.

## Cadence and boundaries

- Idle threshold: 60 seconds.
- Supabase persistence threshold: 15 seconds of additional active time.
- Sampling/local checkpoint: 1 second.
- Forced best-effort flush: document hidden and `pagehide`.
- Session inactivity rollover: the existing 30-minute inactivity rule. The old
  session receives `inactivity_timeout` when a later trusted interaction makes
  that rollover observable.

Browser crashes, process termination, network loss, and some unloads cannot be
observed reliably. No exact `ended_at` is claimed. Observation timestamps are
database receipt times, not browser exit instants.

## Session-end and boundary semantics

- `session_end_reason` is nullable and accepts only `explicit_end` or
  `inactivity_timeout`. Explicit end is reserved for a product-owned action;
  inactivity timeout is derived when later trusted activity makes the existing
  30-minute rollover observable.
- `last_browser_boundary` separately records the most recent best-effort
  `page_hidden` or `pagehide` observation. It never claims the session ended
  and may naturally be followed by resumed activity.
- A crash, killed process, missed unload, or failed request leaves
  `session_end_reason` null. Unknown is represented by no claim, not a terminal
  label.

## Release context

Vite injects one canonical `FRONTEND_RELEASE` object. Commit selection is:
`VITE_FRONTEND_COMMIT`, `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA`, `COMMIT_SHA`,
then local `git rev-parse HEAD`, otherwise `unknown`. The canonical commit is
stored once on `analytics_sessions.frontend_release`; events join it through
their existing `session_id`. Individual event producers do not copy free-form
release metadata.

## Same-browser identity link

When `AuthProvider` observes a permanent authenticated Supabase user, the
browser submits only its durable first-party visitor UUID. The security-definer
RPC derives `user_id` from `auth.uid()` and refuses missing or anonymous Auth
identities. `(visitor_id, user_id)` is the primary key; repeat observations
update bounded first/last timestamps and a count. There is no fingerprinting,
IP collection, heuristic merge, or cross-device claim, and this code creates no
anonymous Supabase Auth user. If auth resolves before the first-touch row lands,
the first RPC returns false and remains queued; the analytics tick retries after
the canonical visitor insert is confirmed. A pair is marked linked for the page
only after the RPC returns exactly `true`.

`VITE_E2E_AUTH` is guarded at the session-intelligence boundary. In that mode
the tracker is not installed and neither session-activity nor identity-link RPC
is called, preserving the synthetic E2E identity's no-real-Supabase contract.

## Migration and security

`20260926120000_users2_3b_session_intelligence.sql`:

- adds `active_ms`, `last_active_at`, nullable derived/explicit session-end
  fields, separate best-effort browser-boundary fields, and `frontend_release`
  to `analytics_sessions`;
- retains revoked direct client `UPDATE` and exposes a narrow cumulative RPC;
- validates UUID pairing, bounded/non-negative duration, future timestamps,
  end/boundary vocabularies, and release length;
- adds `analytics_visitor_user_links` with RLS, no client table writes, and
  admin-only reads;
- derives link ownership from `auth.uid()` inside the RPC and grants link RPC
  execution only to `authenticated`.

Public session activity remains possible before authentication because top-of-
funnel visitors have no Auth session. Session and visitor ids are random UUIDs;
the RPC can update only an already-recorded matching pair and cannot read it.

## Verification

- Focused browser and PGlite migration suites cover visibility/focus/idle
  accounting, trusted scroll resume, monotonic and false-result retry behavior,
  E2E isolation, separate end/boundary semantics, deterministic authenticated
  linkage after delayed first-touch persistence, and existing analytics.
- Typecheck retains the two known base diagnostics in
  `OnboardingProfile.tsx:180` and `connections.ts:263`; this slice introduces no
  additional diagnostic.
- Production build result is recorded in the final task report.

## Expected integration overlap

3A may also touch the analytics public barrel or application bootstrap while
wiring its owned activity lifecycle registry; reconcile imports without moving
activity semantics into this slice. No semantic conflict with 3C is expected.
3C may eventually consume the visitor/session ids but owns Railway transport
and correlation.
