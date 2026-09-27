# USERS2.3C — browser correlation (frontend)

Original implementation base: `origin/main` at
`61673c53683f16fff859a42c15f83b9406411b92`.

Integrated onto `origin/main` at
`c67d8f835cb8068baa8b4f0b7255504193249962` on
`codex/users2-3c-main-integration` by cherry-picking only the original frontend
3C commit `92f820abda670a0af413803dbd410a19d92db08f` before this handoff update.

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

## USERS2.3C-Daily

Branch `codex/users2-3c-daily-correlation` from `main` `4b3be0cb`.

- `src/lib/daily-challenge/run/client.ts`: `startToday` and `launchStage` send
  `withBrowserCorrelation({})` as the JSON body. `readToday` / `readRun` are
  unchanged pure GETs: no body, no `ensureBackendAuthToken`, no correlation or
  session touch. `syncRun` sends no body.
- `src/lib/analytics/correlation.ts`: `browserCorrelation(interactionId?)` and
  `withBrowserCorrelation(body, interactionId?)` accept a caller-owned
  interaction id; `newInteractionId()` mints one. Visitor and session still come
  from the one canonical identity module.
- `src/pages/quiz-daily-challenge/run/useDailyRun.ts`: one interaction id per
  stage id, minted at the first launch attempt and reused by the bounded
  automatic retries and the player's Retry. Each Start press is its own
  interaction. The server freezes the first value either way.

Railway freezes these on the Daily run and stage and propagates the stage's
values to the canonical Ranked child. See the backend
`docs/USERS2_3C_CORRELATION.md`.
