# DAILY-USER-HISTORY — handoff (2026-10-19)

Two PRs, backend first. Neither deployed. No production data written, no migration, no auth/MFA change.

| Repo | Branch | What |
|---|---|---|
| `League_Combat_Simulator` (Railway) | `analytics/daily-user-history` | read model `daily_challenge/run/history.py` + `GET /api/daily-run/admin/users/{user_id}/history` + `test_daily_user_history.py` (17 tests) + golden payload + workflow `daily-user-history` |
| `mogsy` (this repo) | `admin/daily-history-fe` | Admin user detail section "Daily Challenge history" + strict parser + display rules + 25 tests + workflow `Admin Daily History Acceptance` |

## Audit: what already existed (so nothing was duplicated)
Railway SQLite already records the Daily's whole lifecycle durably:
- `daily_runs`: one parent per (user, policy, day); `run_id` is a deterministic hash (`run_id_for`), so retries and races cannot mint a second id. `created_at`, `main_completed_at`, `main_score`, `completed_at`, `outcome` (`reviewed`/`perfect`), and the browser `visitor_id` / `analytics_session_id` frozen by the creating request only.
- `daily_run_stages`: ordered stages (`standard`, `time_trial`, `survival`, `weak_areas`, `review`), `launched_at`, `completed_at`, `child_match_id`, and the child reader's frozen `result_json` (score, correct, answered, misses, `timing.settled_active_answer_ms`, time bank, completion reason).
- `daily_run_events`: append-only `run_created`, `stage_launched`, `stage_completed`, `main_completed`, `run_completed`, `review_allocated`, `stage_skipped`, `launch_failed`.
Guests and registered players share one id space: a guest's in-place upgrade keeps the same user id, so its runs stay attached.

## Decision: no new lifecycle events
Run started, main (required) completed, optional stages completed and run completed are all already durable facts above, so adding Supabase/Railway events would duplicate them and risk drift. **Resume is not recorded** (`start_or_resume` is a read for an existing run). I did not add a write to that hot, concurrency-tuned path just for display; the history therefore cannot say when or how often a player came back, and says nothing about it. If you want it, add one `run_resumed` event deduplicated per (run, browser session) as a separate backend change.

## What the owner sees (per run, newest first, latest open)
Date; completed/unfinished; main score; optional stages done; started / finished; elapsed (wall clock, labelled as including time away); entry source; per stage: required/optional, state, score, correct/answered (%), summed answer time, elapsed. Run id, stage match ids, browser/session ids and recorded events are in a collapsed "Technical details".

## Rules that keep it honest (all tested)
- **Distinct activity:** its own section; copy states Daily stages run on the Ranked engine but are not Ranked, Role Challenge or More Challenges. Nothing here is counted into Ranked.
- **Durations** only when both endpoints are recorded and in order; otherwise "not recorded". Run elapsed only for completed runs. "Answer time" (summed) and "Elapsed" (clock) are never conflated. A dash is not zero.
- **No abandonment/completion guesses:** an unfinished run reads "unfinished" with its last recorded activity time. A stage is completed only if its row says so; an unknown stage state is rejected by the parser, not mapped.
- **Required vs optional** only for plan versions that pin Standard first (`has_main_daily`); older runs show neither.
- **Entry source** = the `daily_challenge_entry_clicked` event in the run's own recorded browser session, from 10 min before to 1 min after run creation; otherwise "not recorded" with the reason (no session, or no click; arrivals by link/refresh/bookmark and runs before the click event shipped have none). If the analytics lookup fails it says "lookup unavailable". No cross-browser or cross-device joining.
- **Retries/duplicates:** one run per day by construction; duplicate event rows show once; unknown event types are not forwarded; unknown result keys are not forwarded.
- **Privacy/auth:** route is `require_admin` (verified owner session, MFA and trusted device via Supabase), read-only (`PRAGMA query_only`), `Cache-Control: no-store`, UUID-validated path, limit ≤ 60, owner action logged. Creator-replay filming takes (`creator:*`) are excluded. No answers/question content is returned, only counts and scores.
- **Guests:** a note says the history is under that guest id; if the player later signed in to a *different* existing account, runs are not merged.

## Compatibility
`schema_version: 1`, additive-only. The backend test compares its payload to `daily_challenge/run/golden/user_history_v1.json`; the same bytes are `src/lib/admin/__fixtures__/daily-history-v1.json` here and the parser test reads it. Changing the payload breaks the backend test until the golden and this fixture are updated together. Unknown extra keys are ignored; a different `schema_version` is refused.

## Verified
- Backend, local: 17 new + 34 `test_dcmod_b_daily_run` pass. `test_dcmod_integration_daily.py` has 6 failures (`quiz_attempts` has no column `selected_answer`) that are **identical on untouched `origin/master`** in this environment.
- Frontend, local (LF checkout): 25 new tests pass; Admin suites 552 pass, 2 fail (`admin-registry.routes`, stale `master_admin` assertions since 8253bf88, pre-existing); TS baseline clean; new files lint clean (`AdminUsers.tsx` has the same 11 lint errors as `main`).
- CI: **not yet run** — see the PRs. Rendering of the new section in the signed-in `/admin` route needs the owner's MFA session and has not been done.

## Deploy / acceptance (owner)
1. Merge the **backend** PR and deploy Railway (not done). Until then the panel shows "The Daily history service answered 404" as an error, never as an empty history.
2. Merge the frontend PR, confirm the Lovable project shows the revision, publish.
3. Open a real account in Admin → Users and compare one run with the player's own Daily screen.

## Limits
Resume and abandonment are unknown by design; whole-run active time is not recorded (only summed answer time per stage); entry source exists only for runs created after the click event shipped; the Review stage is "skipped" for a perfect run, by the Daily's own rule.
