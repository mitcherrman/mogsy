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

### USERS2.3A — lifecycle contract — complete on this branch

- Base: `origin/main` at `61673c53683f16fff859a42c15f83b9406411b92`
- Branch: `codex/users2-3a-lifecycle`
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

### USERS2.3B — browser/Supabase session intelligence

Owns active time, session state, release context, and the durable same-browser identity link. It may consume the lifecycle registry but must not independently redefine activity ids, entity grains or lifecycle semantics.

### USERS2.3C — browser → Railway correlation

Owns propagation of `visitor_id`, `session_id`, and interaction/request correlation through authoritative gameplay entities and the outbox. It must not independently redefine lifecycle event semantics and must preserve the authoritative-vs-inferred abandonment distinction.

### Later integration phase

Owns terminal-outcome instrumentation and Admin lifecycle calculations/reporting. Admin must not count mode-open events as starts, browser diagnostics as authoritative completions, or missing terminals as abandonment.
