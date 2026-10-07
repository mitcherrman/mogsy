# USERS2 — Audience Intelligence

## Workstream status

### USERS2.1 — Audience IA consolidation — complete/on main

- Users navigation is consolidated into exactly Audience, Accounts and Moderation.
- Audience composes headline metrics, Visitors, Engagement / Activity, Acquisition, Retention and Traffic Health as one page with shared controls.
- Existing analytics calculations, canonical Accounts behavior and Moderation behavior were preserved.

### USERS2.2 — analytics capability audit — complete/on main

- Audited browser analytics, Supabase stores/functions, Railway gameplay delivery and records, and Admin calculations.
- Confirmed strong browser acquisition/session foundations and authoritative Railway start/completion events for selected gameplay, but incomplete lifecycle coverage, active-time/session state, release context, direct browser-to-Railway correlation and explicit terminal outcomes.
- The audit is recorded in `docs/USERS2_ANALYTICS_AUDIT.md`.

### USERS2.3A — lifecycle contract — complete/on main

- Main commit: `3eba8494e6cf96dcadbd57f44d8fcca5086eeffb`
- Defined the governed lifecycle vocabulary: `opened`, `started`, `completed`, `abandoned`, `expired`, `failed`, `cancelled`.
- Registered ten current bounded activities with explicit opened/start/terminal authority, entity grain/id, ownership, valid outcomes, current events and migration notes.
- The contract is documented in `docs/USERS2_ACTIVITY_LIFECYCLE.md` and represented by the descriptive, non-emitting registry in `src/lib/analytics/activityLifecycle.ts`.

Key lifecycle decisions:

- Opened is reach/intent, never a proxy for started. Started requires the meaningful participation boundary and an entity identity.
- One activity entity gets at most one winning terminal outcome. Missing completion is unknown, not abandonment; browser close/navigation can only support explicitly labelled inference.
- Railway remains authoritative for existing Practice, Ranked and Mastery starts/completions.
- `quiz_completed` is a browser diagnostic; Railway `practice_quiz_completed` is canonical Practice completion.
- Retired DSA/Time Trial names do not describe Daily Challenge and must not be revived.
- Meta Reflex is governed at dealt-round / `client_submission_id` grain; the current hub-level open event is insufficient.
- Daily Challenge is governed at parent `run_id`; child stages or Ranked matches do not complete the Daily activity independently.
- Live onboarding is Academy Welcome v1. The older profile onboarding flow is Admin-preview-only and its legacy flag is not lifecycle authority.

USERS2.3A changes no database schema, event emission, Admin calculation, Railway runtime, product state machine or deployment.

## Follow-up ownership

### USERS2.3B — browser/Supabase session intelligence — complete/on main; production migration applied

Owns active time, session state, release context, and the durable same-browser identity link. Its production Supabase migration has been applied (by the owner, outside these slices). Implementation details are recorded in `docs/USERS2_3B_SESSION_INTELLIGENCE.md`. It may consume the lifecycle registry but must not independently redefine activity ids, entity grains or lifecycle semantics.

### USERS2.3C — browser → Railway correlation — on main (frontend) / master (backend)

The browser now adds observability-only `visitor_id`, `session_id`, and
`interaction_id` correlation to the existing Practice, Ranked and Mastery
start requests. It reuses the canonical visitor/session identity and does not
duplicate USERS2.3B session machinery. The Railway ingest contract validates
the existing visitor/session fields before inserting authoritative events.
Correlation never authorizes or selects an account; authenticated `user_id`
remains derived from the verified JWT.

The backend implementation is on `master` (`acb2a946`). Railway sends
`visitor_id` / `session_id` top-level AND `visitor_id` / `session_id` /
`interaction_id` in metadata: the deployed Lovable-managed Edge ingest is older
and keeps metadata while dropping the new top-level fields. Persisted
correlation overwrites any conflicting metadata value. The bridge stays until
the upgraded ingest is deployed, history is backfilled and top-level
correlation is certified (`docs/USERS2_3C_CORRELATION.md`, backend).

- **Direct Practice correlation is production-certified** through that
  compatibility path.
- **Daily gap identified.** 3C missed the primary public play loop: Daily
  Challenge. Daily start/launch carried no correlation, and Daily-hosted Ranked
  children emitted no `ranked_*` event at all (deliberately suppressed).

This slice preserves the current authoritative start/completion event
names; terminal-event migration remains later work.

### USERS2.3C-Daily — correlation + provenance through Daily — branches pushed, not merged

Branches (both repos): `codex/users2-3c-daily-correlation`, from
`mogsy/main 4b3be0cb` and `League_Combat_Simulator/master acb2a946`.
Not merged, not deployed, no Supabase change.

Path: browser → Daily run → Daily stage → canonical Ranked child participant →
Railway outbox → Supabase metadata bridge.

- **Browser.** `startToday` and `launchStage` send the canonical
  `browserCorrelation()` (`src/lib/analytics/correlation.ts`, no second
  visitor/session implementation). GETs remain pure reads (no body, no auth
  minting, no correlation). The Daily controller mints ONE interaction id per
  stage launch and reuses it across its automatic retries and the player's
  Retry. `syncRun` carries none: it is auto-retried, creates nothing, and the
  run and stage it advances are already correlated.
- **Railway.** Strict optional bodies (422 on malformed UUID or any extra field,
  e.g. `user_id`); missing correlation stays valid; `user_id` is only the
  verified bearer. `daily_runs` freezes the creating request's correlation
  (resume never rewrites); `daily_run_stages` freezes the first launch
  request's (retries never rewrite). The child's human participant inherits the
  stage's frozen values; the bot gets none.
- **Ranked child is measured.** Daily children now emit `ranked_started` /
  `ranked_completed` at the unchanged `ranked_participant = match_id:user_id`
  grain with durable wrapper provenance frozen on `ranked_matches`: `host`
  (`direct` | `daily_challenge` | `study_hall` | `playtest`), `session_preset`,
  `parent_activity_type/id`, `parent_stage_index/kind`, plus `opponent_type`,
  `is_bot_match`, `creation_source`, `format_id/version`, identical on start and
  completion. Daily children stay unrated. A guest's Daily child is reported
  `is_guest=true` (frozen `ranked_participants.is_guest_at_start`).

Standing rules this slice established:

- **Public availability ≠ analytics coverage.** A dormant or gated path keeps
  its instrumentation.
- **Canonical Ranked is measured across wrappers**: live human-v-human, direct
  bot, Playtest presets, Study Hall, Daily children, future wrappers.
- **Daily parent and Ranked child are separate grains.** A child completing
  never completes the Daily. Admin › Audience › Engagement shows canonical
  Ranked as a total plus disjoint host buckets classified from the same rows
  (Direct PvP, Direct Bot, Playtest, Study Hall, Daily children, Legacy /
  unknown host for rows without `metadata.host`). Retired DSA is no longer
  presented as gameplay, standalone mastery is labelled "Legacy Champion
  Mastery", and the Daily parent and Mastery Journey lifecycles are shown as
  not instrumented (never zero).
- **Mastery Journey is the current Mastery concept** (a segment inside Daily
  Standard/Survival Ranked formats). It has no durable instance id yet, so no
  `mastery_journey` activity is registered; the identity gap is documented in
  `docs/USERS2_ACTIVITY_LIFECYCLE.md`.
- **Legacy standalone Mastery instrumentation is preserved for
  compatibility** (`/api/mastery/sessions`, `mastery_*`), relabelled legacy in
  the 3A registry.

USERS2.3D (Daily lifecycle events) is NOT implemented; this slice is its
correlation/provenance foundation.

### USERS2.3D — Daily lifecycle — implementation branch, not merged

Branches (both repos): `users2/3d-daily-lifecycle`, based on current
`mogsy/main 849e6198` and `League_Combat_Simulator/master 31546a4a`.
Neither shared branch has moved from that base during this slice. Nothing is
merged or deployed.

Implemented:
- Railway emits `daily_challenge_started` exactly when the parent `daily_run`
  is first inserted, and `daily_challenge_completed` only when the guarded
  `active -> completed` transition wins. Both use entity
  `daily_run/<run_id>`; a resume/retry cannot create another lifecycle row.
- Start/completion reuse the run's frozen creation
  `visitor_id/session_id/interaction_id`. The start route passes the already
  verified Supabase identity's anonymous bit for correct guest attribution;
  authorization and Daily product behavior are unchanged.
- Completion metadata preserves the authoritative current outcome
  (`reviewed` or `perfect`) plus frozen plan/policy context. No abandonment,
  expiry, failure or cancellation is inferred.
- Frontend canonical vocabulary and the descriptive 3A lifecycle registry now
  include the two Daily parent events.
- The closed Railway Edge ingest contract now admits exactly those two new
  names and the new `daily_run` entity type, with a contract test proving the
  parent grain.

Important defect found during 3D review:
- `analytics.outbox.ensure_schema()` used Python sqlite3 `executescript()`
  inside the caller's gameplay transaction. `executescript()` commits a
  pending transaction before running, contradicting the outbox's atomicity
  guarantee for ALL existing authoritative emitters.
- The 3D backend branch replaces that with individual idempotent
  `CREATE TABLE` / `CREATE INDEX` executions, which remain inside the
  caller's transaction, and adds a rollback regression test proving gameplay
  truth and the outbox row cannot be split by schema ensure.

Tests added/extended:
- Daily start: authoritative grain, correlation, account/guest attribution,
  resume idempotency.
- Daily completion: correlation, reviewed/perfect outcome, replay idempotency.
- Edge ingest: closed ten-event/five-entity vocabulary and `daily_run` grain.
- Shared outbox: schema ensure preserves the caller transaction and rollback.

Still required before integration:
1. Run the focused backend and frontend test suites on the branch; this mobile
   connector can edit/inspect GitHub but does not execute repository tests.
2. Reconcile any test failures without changing Daily gameplay semantics.
3. Deploy the updated `railway-analytics-ingest` Edge Function BEFORE (or
   atomically with) Railway 3D, otherwise new Daily rows receive permanent 422
   and dead-letter.
4. Merge/deploy backend and frontend only after those gates, then production
   spot-check one Daily start and one completion in `analytics_events`.


### Later integration phase

Owns terminal-outcome instrumentation and Admin lifecycle calculations/reporting. Admin must not count mode-open events as starts, browser diagnostics as authoritative completions, or missing terminals as abandonment.
