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
- Backend, local: 17 new + 34 `test_dcmod_b_daily_run` pass. `test_dcmod_integration_daily.py` had 6 failures that are identical on untouched `origin/master`; root cause and fix are in the investigation below (fixed on the backend PR by `4456a8f6` + `085c9861`).
- Frontend, local (LF checkout): 25 new tests pass; Admin suites 552 pass, 2 fail (`admin-registry.routes`, stale `master_admin` assertions since 8253bf88, pre-existing); TS baseline clean; new files lint clean (`AdminUsers.tsx` has the same 11 lint errors as `main`).
- CI: frontend PR #107 passed all four workflows (Admin Daily History, Gameplay Analytics, Admin Account Journey, Launch Audience Pulse). Backend: see the investigation below. Rendering of the new section in the signed-in `/admin` route needs the owner's MFA session and has not been done.

## Backend PR #67 CI investigation (2026-10-20)

**What could and could not be read.** The backend repo is private: the Actions API returns 404 for runs 39406874013 / 39406873920 / 39406873939 / 39406873947, no token was available to the agent, and the built-in browser is not signed in. **No job logs or annotations were read**, so *which step* failed on GitHub (setup, checkout, install, tests) is **unknown** and is not claimed here.

**Reproduced locally instead** (same commands as each workflow, Python 3.14 on Windows, so CI on 3.12/Linux may differ):

| Workflow | Command source | On `4456a8f6` | On fix `085c9861` |
|---|---|---|---|
| Creator Replay (`creator-replay-ci`) | `test_dcmod_b_daily_run`, `test_dcmod_integration_daily`, `test_creator_journey_selection`, `test_daily_journey_cycle` | **6 failed**, 69 passed | **75 passed**, 2 skipped |
| Daily User History | `test_daily_user_history`, `test_dcmod_b_daily_run` | 51 passed | 51 passed |
| Storage Lifecycle Safety | 6 backup suites | 215 passed, 4 skipped (symlink/`/proc`, Linux-only) | unchanged (file not exercised) |
| Role Challenge Review | RC suites, queue controls, Reconstruct | not run | 293 + 10 + 40 passed |

The tracked tree stayed clean after the runs (the workflows' `git status` gates).

**Root cause of the Creator Replay failure (confirmed).** It had two layers:
1. The test's `quiz_attempts` fixture lacked columns the recorder schema has (`selected_answer`, ...). Fixed by `4456a8f6`. Checked mechanically against `migrate_quiz_attempts_v2.migrate()`: the fixture's column set is now identical to production's 18 columns. Two constraint differences remain and do not affect these tests: production `source TEXT NOT NULL DEFAULT 'practice'`, `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`; the fixture has neither.
2. **Hidden behind it:** `play_stage()` shrinks Survival/Time Trial with a wrapper `small(cur, seed, size_of=None)`. Since `a8b928f3` production calls `compose_survival(..., rotation_date=...)`, the wrapper raised `TypeError`, `launch_stage` mapped it to `DAILY_RUN_CHILD_UNAVAILABLE` (503), and every test that launched Survival failed. Fixed in `085c9861` by letting the wrapper accept and forward `**extra`. Test-only; no production or schema change.
Both layers are on untouched `origin/master`: the same 6 tests failed there locally, and by source inspection `master` has the stale stub (`test_dcmod_integration_daily.py:538`) and the `rotation_date` caller (`daily_challenge/wiring.py:689`; `a8b928f3` is an ancestor). I captured the underlying traceback on the PR branch, not on `master`. So this is a **pre-existing test-harness defect**, not a regression from the Daily history work. (Creator Replay only runs on PRs touching those paths, which is why `master` never surfaced it.)

**The other three workflows.** `4456a8f6` changed only `test_dcmod_integration_daily.py`. Storage Safety, Role Challenge Review and Daily User History do not execute that file, passed on the previous commit per the report, and pass locally on this code. All four runs were created in one batch (consecutive run ids). That pattern points away from this diff, toward something shared at run level (runner start / quota / billing); earlier backend PRs in this project were noted as blocked by Actions billing. **This is an inference, not a verified cause** — it needs the run page or annotations.

**Status:** superseded by the release-gate section below.

## Release gate without GitHub Actions (2026-10-20)

**GitHub CI did not run.** The owner reports that GitHub Actions for this account is blocked *before job execution* by billing (jobs never start, so no step — checkout, install or tests — ever ran), and that billing will not be changed. The owner holds the screenshots; **they were not supplied to the agent and were not seen by it**, so this statement is the owner's report, not something the agent verified. Actions must not be re-run. The earlier "failed" results on `4456a8f6` (runs 39406874013 / 39406873920 / 39406873939 / 39406873947) are therefore not test evidence either way; the Creator Replay defect found above is real and was reproduced and fixed locally, independent of CI.

**Validated commit:** backend `579248eee88562dbdca6a5d6c86cfba6669b6943` on `analytics/daily-user-history`. Code is identical to the previously reported head `0e5faac6ac0b6dc9c58168ac28e2a965372f3d32` plus one new test file and its workflow entry. `git diff 085c9861..0e5faac6` is `DAILY_USER_HISTORY_HANDOFF.md` only (commits `77790ac1`, `0e5faac6`): no effect on tests, endpoint, security or contract, so the `085c9861` results carried over; everything was nevertheless re-run on the exact heads below. Any commit after `579248ee` is documentation only.

**Local results** (the exact commands from the four workflows; Python 3.14 / Windows, CI would use 3.12 / Linux):

| Workflow command | `0e5faac6` | `579248ee` (final) | merge of `0e5faac6` into current `master` `0f28fc9e` |
|---|---|---|---|
| Daily User History | 51 passed | **62 passed** (51 + 11 gate tests) | 51 passed |
| Creator Replay (4 files) | 75 passed, 2 skipped | **75 passed, 2 skipped** | 75 passed, 2 skipped |
| Storage Lifecycle Safety (6 suites) | 215 passed, 4 skipped | **215 passed, 4 skipped** | 215 passed, 4 skipped |
| Role Challenge Review: RC1–RC5 / queue controls / Reconstruct | 293 passed, 45 skipped / 10 / 40 | **293, 45 skipped / 10 / 40**; `py_compile` ok | 293, 45 skipped / 10 / 40 |
| Tracked tree after the runs | clean | clean | n/a (merge staged) |

The 4 + 45 skips are the suites' own (Linux `/proc`, symlinks, data-file-dependent); they are not new.

**`master` drift.** `master` is `0f28fc9e`, 49 commits ahead of the PR base `84567e11`, with **no file overlap** with this PR; the merge is automatic and conflict-free (checked with `git merge-tree` and a real `--no-commit` merge in a scratch worktree, since removed). The suites above were run on that merge result with the PR at `0e5faac6`. The final head `579248ee` only adds `test_daily_user_history_gate.py` and one workflow line, touching no existing file, so the merge result was not re-built for it; its 11 tests also passed on the merged tree earlier.

**What the PR changes in production code:** `routes/daily_run.py` (+31 lines: one GET route and imports) and the new `daily_challenge/run/history.py`. No schema, migration, event, write path, auth or gameplay change.

**Owner-only authorization and cross-user isolation (`test_daily_user_history_gate.py`, 11 tests).** The REAL `require_admin` is in front of the route; only JWT decoding and Supabase `owner_auth_state` are stubbed.
- Refused with 403: no credentials; legacy `X-Admin-Key` only; undecodable bearer; anonymous session; signed-in non-owner (including a player reading their **own** history); owner whose state is not `authorized` (no MFA / untrusted device); owner state empty.
- Refused with 503 and no data: owner state unreadable (fails closed).
- The authorized owner gets exactly the user named in the path: two users with different runs return disjoint run ids and never contain each other's id; `?user_id=` / `?uid=` cannot redirect the read; an unknown user gets an empty list, not someone else's.
- Malformed ids (non-UUID, SQL-style text, path traversal, uppercase, no dashes, trailing characters) get 400/404 and `daily_runs` is intact afterwards.
- POST/PUT/PATCH/DELETE are rejected (404/405). `Cache-Control: no-store` on 200.
Not covered by an automated test: the real Supabase `owner_auth_state` RPC (network); that is production behaviour shared with every other `require_admin` route and is unchanged here.

**Frontend/backend golden contract.** Backend payload == `daily_challenge/run/golden/user_history_v1.json` (enforced by `test_payload_matches_the_golden_the_frontend_parses`). That file is byte-identical to the frontend fixture `src/lib/admin/__fixtures__/daily-history-v1.json` at frontend PR #107 head `f5b2328c` (SHA-256 of both, CRLF-normalised: `48dd2ae7a6f4976f…`), and the frontend parser tests (25) pass on that head.

**Remaining risks (none is a known defect):**
1. No GitHub-side confirmation exists; the evidence is local (Windows, Python 3.14). A Linux/3.12-only difference is possible but nothing in the changed code is platform-specific (`PRAGMA query_only` reads, plain `sqlite3`).
2. Path-id check uses `re.match`, so `<uuid>\n` is accepted; it is parametrised SQL and owner-only, returns an empty list, and could be tightened to `fullmatch` later.
3. Read load: up to 60 runs × 2 queries per request on the live SQLite file (`busy_timeout` 5 s, read-only pragma), owner-only and bounded.
4. Resume and abandonment remain unrecorded by design; entry source exists only for runs created after the click event shipped.
5. Frontend panel was never rendered in the signed-in `/admin` route (needs the owner's MFA session).

**Verdict:** backend PR #67 is **ready for the backend-first merge**, on the local evidence above, with the caveat that GitHub CI never executed. Not merged, not deployed. Order: merge #67 → deploy Railway → smoke `GET /api/daily-run/admin/users/<uuid>/history` as the owner (expect 200 with `schema_version: 1`; 403 unauthenticated) → merge frontend PR #107 → publish in Lovable → compare one real account's run with the player's own Daily screen.

## Deploy / acceptance (owner)
1. Merge the **backend** PR and deploy Railway (not done). Until then the panel shows "The Daily history service answered 404" as an error, never as an empty history.
2. Merge the frontend PR, confirm the Lovable project shows the revision, publish.
3. Open a real account in Admin → Users and compare one run with the player's own Daily screen.

## Limits
Resume and abandonment are unknown by design; whole-run active time is not recorded (only summed answer time per stage); entry source exists only for runs created after the click event shipped; the Review stage is "skipped" for a perfect run, by the Daily's own rule.
