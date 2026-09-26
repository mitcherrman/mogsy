# USERS2.3C — browser correlation (frontend)

Base: `origin/main` at `61673c53683f16fff859a42c15f83b9406411b92`.

The live browser start requests now carry three observability-only UUIDs:

- `visitor_id`: the existing browser-local analytics visitor;
- `session_id`: the existing 30-minute analytics session;
- `interaction_id`: a new UUID for this individual start request.

Changed entry points are `POST /api/quiz/sessions`, `POST /api/ranked/queue`,
and `POST /api/mastery/sessions`. No completion request needs to repeat the
context: Railway persists it on the authoritative entity created by the start.

The existing `railway-analytics-ingest` transport now validates optional
`visitor_id` and `session_id` as canonical UUIDs and writes them into the
existing analytics event columns. Missing values remain valid. Interaction ids
remain bounded Railway metadata rather than a new database column.

These fields do not authorize, select an account, or replace the bearer token.
The browser sends no service-role secret and sends no `user_id` on the new
Ranked or Mastery paths. Railway continues deriving authenticated identity from
the verified JWT subject.

This slice does not add DSA instrumentation, active-time tracking, or lifecycle
event names.
