# GRES1 — Gameplay reliability and outage resilience

Status: **draft PRs open (FE mogsy#135, BE League_Combat_Simulator#101), awaiting owner review** (nothing deployed, merged or migrated). Next action: §12.

| | Frontend (`mitcherrman/mogsy`) | Backend (`mitcherrman/League_Combat_Simulator`) |
|---|---|---|
| Branch | `resilience/gres1-frontend` | `resilience/gres1-backend` |
| Base | `origin/main` `a5d97120` | `origin/master` `b8b629cf` |
| Worktree | `C:\Users\mlmit\mogzy-gr1-fe` | `C:\Users\mlmit\lcs-gr1-be` |

Evidence labels used throughout:

- **[code]**: read in the source at the cited line.
- **[test]**: reproduced by an automated test in this pass.
- **[prod]**: observed against production with a read-only request.
- **[hyp]**: a hypothesis that has not been verified.

---

## 1. Scope and non-negotiables

The goal is to keep every public gameplay mode responsive, recoverable and fair across backend latency, Railway redeploys, process restarts and temporary network loss. Daily Challenge and Stat Check come first.

Constraints held throughout:

- No client-authoritative grading, scores, rewards or trusted answer timestamps. The server clock is the only clock that grades.
- No faster reveals. Reveal holds, title beats and reading time are untouched. Only the network waiting in front of them changes.
- Existing progress and history are preserved. Every compensation is recorded in an audit row.
- No deploy, no production migration, no merge without owner approval.
- Per `AGENTS.md`, no local desktop-browser automation. Browser matrices belong in GitHub Actions. Local verification is unit, integration and fault-injection tests only.

## 2. How the modes are wired (verified)

**Daily Challenge**
- Parent: `useDailyRun` (`src/pages/quiz-daily-challenge/run/useDailyRun.ts`), talking to `/api/daily-run/*` (`src/lib/daily-challenge/run/client.ts`).
- Every graded answer is played inside a canonical Ranked child match: `DailyRunPage` → `QuizRankedMatch` → **`useRankedMatch`**, the same controller Ranked uses **[code]**.
- On the backend the child is `ranked.create_bot_match(host="daily_challenge")`, unrated (`creation_source="bot_playtest"`) **[code]** (`daily_challenge/wiring.py:841-853`).

**Stat Check**
- The player-facing name of the Meta Reflex segment module (`item_cost_duel` ≥ v4, `metaReflexModule.tsx`) **[code]**.
- It is played only inside Ranked-engine matches (Ranked, Daily v5, Journey, Role Challenge, bonus games, Arena) through `useRankedMatch.submitSegmentChallenge` → `POST /api/ranked/matches/{id}/segments/{s}/challenges/{i}`.
- `/quiz/stat-check/*` is the unrelated Champion Card Duel, which keeps the legacy wire name.

**Ordinary questions**
- MCQ rounds go through `useRankedMatch.answer` → `POST /api/ranked/matches/{id}/rounds/{n}/submission`.

**Other public modes**
- Practice: `/api/quiz/attempts`, already has `client_attempt_id`.
- Pro Play and Worlds quiz: idempotent per `question_id`, already retry 250/750 ms.
- More Challenges sessions: in-memory server sessions, lost on restart **[code]**.
- Role Challenge, Journey Library and bonus "ranked_match" games: the Ranked engine.
- Champion Card Duel online: its own poll loop.

**Server clocks**
- Backend `now` is `datetime.now(timezone.utc)` only. Bodies use `extra="forbid"` and carry no client time **[code]** (`routes/ranked_public.py:181`, `schemas/ranked_public_schemas.py:47-61`).
- Advancement is lazy: `_advance` runs inside participant requests (`ranked_public/service.py:1387-1411`).
- The background lifecycle worker is off unless `RANKED_LIFECYCLE_WORKER_ENABLED` is set. Whether production sets it is **not recorded in the repo** and was not read.

## 3. Verified defects

### Frontend

| ID | Defect | Evidence | Fixed by |
|---|---|---|---|
| F1 | No request timeout in any gameplay client. A hung GET stalls the single-flight poll forever and never sets `connectionInterrupted`, so the player sees a frozen card with no "reconnecting" state. A hung submit leaves "Submitting…" up indefinitely and, on segments, locks every later card. | [code] `ranked-public/client.ts:164-200`, `useRankedMatch.ts:737-740`, `:1267`; [test] GRES1 | GRES1-FE |
| F2 | An ambiguous submit failure (network error, timeout or 5xx, where the request may have landed) releases the answer grid, so the player can send a **different** answer. Neither round nor segment path reconciles. `ack.conflicting` is parsed but never read. | [code] `useRankedMatch.ts:1148-1160`, `:1275-1299`; `metaReflexModule.tsx:447-456` | GRES1-FE |
| F3 | Any HTTP 404 is fatal (`isFatal`). The Ranked match API never returns a coded 404 on match routes (a missing match is `403 RANKED_NOT_A_PARTICIPANT`), so a 404 there can only be route skew or an edge/proxy response. It stops the match permanently, and a Daily host is never told. | [code] `client.ts:135-138`, `routes/ranked_public.py:66-180`, `service.py:2616-2625` | GRES1-FE |
| F4 | A single failed `/rounds/{n}/resolved` read at a round boundary loses that round's reveal, transcript, reveal hold and ledger row for the mount. `activeRoundRef` advances anyway and the capture is never retried. | [code] `useRankedMatch.ts:604-613`, `:769-791` | GRES1-FE |
| F5 | `actionError` is sticky. A successful poll clears `connectionInterrupted` but not `actionError`, so a raw `request failed (502)` line stays over Stat Check until the next click. | [code] `useRankedMatch.ts:800-801` | GRES1-FE |
| F6 | Outage recovery is slow. Backoff grows to 8 s, so a ~10 s redeploy is noticed up to 8 s after the server is back. The `online` and visibility pokes do not fire for a server-side outage. | [code] `useRankedMatch.ts:46-47`, `:909-911` | GRES1-FE |
| F7 | The segment double-submit guard reads React state (`submitting`), not a ref. | [code] `useRankedMatch.ts:1267` | GRES1-FE |
| F8 | Daily parent: sync gives up after 6 × (request + 1 s), then strands the stage result behind a manual Retry. Launch gets one automatic attempt in practice, because the effect stops on `error`. | [code] `useDailyRun.ts:63-65`, `:401-425` | GRES1-FE |
| F9 | PR #119's activity lease calls `POST /api/daily-run/{id}/activity` every 30 s while a Daily page is open. **That route does not exist in production.** The 404 is swallowed. The lease has no in-flight guard, and an `incomplete` reply auto-POSTs `/today` from a timer. | [prod] live bundle `client-Dmf2Kq_A.js` contains `noteActivity:…/activity`; `GET https://web-production-83e53.up.railway.app/api/daily-run/probe-run/activity` → `404 {"detail":"Not Found"}` (a POST-only route would answer 405), while `/api/daily-run/probe-run` → `401 SESSION_REQUIRED` | GRES1-FE (stop after an uncoded 404); the real fix is backend PR #87 |
| F10 | `recover()` marks itself done before `/resume` succeeds, so a reload during an outage never retries recovery in that mount. | [code] `useRankedMatch.ts:931-981` | GRES1-FE |
| F11 | No gameplay timing instrumentation: no `performance.mark`, no latency fields, no request ids on answers. Frontend rendering, network, backend and intentional delays cannot be told apart. | [code] repo-wide grep | GRES1-FE + GRES1-BE (`Server-Timing`) |

### Backend

| ID | Defect | Evidence | Fixed by |
|---|---|---|---|
| B1 | No downtime compensation. Round, ability and card clocks run on wall-clock time from the persisted `started_at`, so a redeploy or restart during a question spends the player's time. A late answer is refused (`duel_round_engine.py:279`) or the round resolves as a timeout on the first request back. | [code] `service.py:1387-1572`, `segment_flow.py:1047-1105`; [test] GRES1 | GRES1-BE |
| B2 | After downtime, presence ages include the outage. The first lifecycle evaluation forfeits (one absent human) or no-contests (both) any match whose players have not re-polled yet. A returning player's own read touches only their own `last_seen`, then forfeits an opponent who is still reconnecting. | [code] `service.py:2952-2957`, `:3811-3860`; [test] GRES1 | GRES1-BE |
| B3 | `submit_challenge` checks idempotency **after** the active-segment gate. A retried card whose original answer resolved the block gets `409 RANKED_NO_ACTIVE_SEGMENT` / `WRONG_SEGMENT_PHASE` / `STALE_ROUND` instead of the idempotent ack. `submit` does it in the right order. | [code] `service.py:4900-4976` vs `:3477-3487` | GRES1-BE |
| B4 | No server timing is exposed. There is no request-duration middleware on master, and acks carry no processing time. | [code] | GRES1-BE (`Server-Timing`, exposed through CORS) |
| B5 | On master, Daily-hosted children are not exempt from disconnect forfeit: the human loses to the bot after 45 s of absence. This contradicts `find_active_match` and `docs/ranked-public-service.md:349`. | [code] `service.py:3825-3859` | **Backend PR #87** (open, unmerged) |
| B6 | A conflicting round re-submission returns `200 {"status":"accepted","conflicting":true}`. The stored answer wins, but the shape is easy to misread. | [code] `service.py:3477-3487` | Contract documented; GRES1-FE reads `conflicting` |
| B7 | More Challenges session games (Stat Drop, Rangefinder, Glyph Press, Perfect Timing, Combat Estimate) keep their state in process memory and lose it on every restart. | [code] `public_game_modes/sessions.py:87-88` | Not in GRES1 (needs persistent storage, an owner decision); §8 |

**Not defects, verified**

- Round submission is idempotent per `(match, round, user)`, even after resolution **[code]**.
- Pro Play and Mastery replay identical answers.
- Practice carries `client_attempt_id`.
- Answer timestamps are server-only everywhere in the Ranked engine.

## 4. Dependencies and PR states (2026-10-22)

| PR | State | Relevance |
|---|---|---|
| FE #28 | merged 2026-10-15 | Added `connectionInterrupted` on public-read failure. GRES1 extends it: timeouts, so hangs also surface; faster recovery; submit reconciliation. |
| FE #108 | draft, unmerged | Final Stat Check verdict line. **Superseded on main** by `3555fd96`, which holds the centre stamp on the final card. Remaining gap: a reload into the final wait shows no stamp. **Keep it open** until that reload edge case is verified or incorporated. GRES1 does not touch it. |
| FE #119 | merged 2026-10-22, **live** | Daily activity lease + rollover countdown. Its backend half (#87) is not deployed, see F9. |
| BE #87 | open, **conflicts with master** (`daily_challenge/run/service.py`, `daily_challenge/wiring.py`; master is 91 commits ahead) | Daily lenient resume: `/activity` lease, absence clock pause for the Daily host, Daily forfeit exemption, rollover closure, additive `daily_runs` columns. GRES1-BE composes with it (§5.4). |

## 5. Contracts

### 5.1 Answer submission: reconcile, never re-choose (frontend)

Outcomes of a submit:

| Outcome | What it means | Client behaviour |
|---|---|---|
| **accepted** | 2xx | Lock SFX, `poke()`. If `conflicting: true` (a different stored answer already won), the client keeps showing the in-flight selection only until the snapshot's server truth replaces it. |
| **refused** | 4xx with a backend `detail.code` | Today's behaviour: release the grid. Race codes stay silent. |
| **ambiguous** | Network error, client timeout, 5xx, 429, or a 4xx without a backend code | The request may have landed. The chosen option **stays selected and locked** (no other option can be sent). The client re-sends the **identical** submission (same round, same answer index, or same segment, card index and choice) with bounded backoff while the round is the active one. The server's idempotency makes a duplicate harmless. |

Ambiguous retries stop on any of:
- an accepted ack;
- a snapshot showing `hasSubmitted` for that round, or the round index moving on;
- a definitive refusal (e.g. `RANKED_STALE_ROUND` once the round resolved);
- unmount.

The status copy is honest: it says "Reconnecting — sending your answer…" and never claims the answer was saved.

### 5.2 Request timeouts (frontend)

- Every gameplay request carries a client timeout composed with the caller's signal: reads 8 s, writes 10 s.
- A timeout is its own error kind (`timeout`). It is transient, never fatal.
- The poll loop therefore always ends a hung request, sets `connectionInterrupted`, and retries.
- During an interruption, backoff is capped at 3 s instead of 8 s.

### 5.3 Outage windows and fair deadlines (backend)

**Liveness beacon**
- The web process touches a small beacon file next to the database (`<db dir>/.mogzy_web_alive`) every 2 s.
- On shutdown it writes its `stopped_at` before draining workers.
- No SQLite write per beat: no fsync, so no added contention with the gameplay write lock.

**Outage window**
- At boot, before any lifecycle worker starts, the new process reads the previous beacon.
- It records one row in the new additive table `service_outage_windows`:
  - `started_at` is the predecessor's `stopped_at`, or its last beat if it was killed;
  - `ended_at` is this process's ready instant;
  - `source` is `graceful` or `crash`.
- Windows shorter than 1 s are ignored. Windows longer than 15 min are recorded but not compensated (an operator event, not a blip).

**Clock compensation: pause semantics** (revised in `617c2ee2`)
- Inside `_advance`'s callers, before any resolution, an active round that was still live when an outage began is **paused** at that instant (`lost_from = max(outage start, round start)`) until `outage end + RECONNECT_ALLOWANCE` (3 s, the client's capped backoff), then runs on.
- It is applied as a monotone top-up. At each evaluation `now`, the round has been shifted by `min(cap, now − lost_from)` in total, where `cap = outage end − lost_from + allowance`.
- The columns moved are the same set BE #87 shifts: `started_at`, `active_deadline`, `ability_deadline`, `challenge_started_at`, and the round's own answer stamps.
- **Why not one shift of `cap`** (the first version, `d8d75092`): a single shift rewinds the clock 3 s *before* the outage began. A card or round that opened less than 3 s before it then reads "not open yet" to a player who comes straight back (reproduced: `RANKED_CARD_NOT_OPEN` on a per-card Stat Check block). A lifecycle sweep at boot would also spend the allowance before anyone reconnects.
- One row per (match, outage) in `ranked_outage_compensations (match_id, outage_id, round_number, lost_from, target_ms, shift_ms, reason, applied_at)`, with `CHECK shift_ms <= target_ms`. The primary key plus the cap make the total bounded and exactly-once; the row is the audit trail.
- Already-recorded answers keep their **relative** timing, so speed and order are preserved.
- No answer is revised. No resolved round is reopened.
- **Known display effect:** during the ≤3 s allowance after a return, the client's countdown can step *forward* on the next poll (the clock is frozen), because the projected deadline moves with each top-up.

**Presence**
- Absence that overlaps an outage is not absence.
- The presence baseline is `max(last_seen, outage.ended_at)` for the most recent window. Every human gets the full reconnect window measured from the moment the service came back.
- Applied to **all** matches, rated Ranked included. It is symmetric and no player can trigger it.

**Rated Ranked**
- Clock compensation is symmetric for both players, but the owner decides whether it is applied to rated matches.
- `RANKED_OUTAGE_CLOCK_COMPENSATION=unrated` is the default: Daily, bonus, Role Challenge, Journey, Arena and other bot or unrated matches.
- `all` includes rated matches. `off` disables compensation.
- Never applied to rated Ranked: absence-based pausing (BE #87's mechanism). A player can manufacture an absence, but not a server outage.

### 5.4 Composition with BE #87

Audited with a **local trial integration**, never pushed: worktree `C:\Users\mlmit\lcs-gres1-trial`, branch `gres1/trial-87-integration`.

| Commit | What |
|---|---|
| `9a39d26c` | `master` `890534c5` + BE #87 (`8aae436d`) |
| `54854319` | + GRES1-BE (`617c2ee2`), composed |

**#87's conflicts with current `master`** (three files) were resolved keeping both sides; `master`'s newer behaviour is preserved:

| File | Kept from `master` | Kept from #87 |
|---|---|---|
| `daily_challenge/run/service.py` | the three-act Standard-recipe guard; `_freeze_run_format` | rollover closure; the `last_activity_at` insert value |
| `daily_challenge/wiring.py` | the renamed `_stage_contexts` | `next_daily_at` |
| `migrate_add_daily_runs.py` | Daily format tables | incomplete columns; outbox init |

Daily suites on the trial vs clean `master` (`test_dcmod_b_daily_run`, `test_dcmod_integration_daily`, `test_journey3_daily`, `test_users2_3c_daily_correlation`): **identical failure sets.** The 27 `test_users2_3c_daily_correlation` failures also fail on clean `master`. The trial adds #87's 5 passing tests.

**Interactions found, and the composition rules the trial implements and tests** (`test_gres1_x_87_composition.py`, 6/6):

1. **Double compensation (real).** #87's `_resume_daily_clock` pauses `gap since last_seen − 10 s`, and that gap *includes* an outage. Uncomposed, a Daily player present across a 30 s outage got **59 s** back (GRES1's 33 s plus #87's 25 s), reproduced by a negative check.
   - *Rule:* `_compensate_outages` runs **before** `_resume_daily_clock` at every site, `heartbeat` included (where GRES1 alone does not need it).
   - *Rule:* #87's gap subtracts the outage shift GRES1 already applied to the active round (`_outage_shift_since`).
   - *Result:* the outage is credited once (33 s), and absence that is *not* the outage is still paused by #87.
2. **Startup ordering (safe).** #87 adds `close_rollover_incomplete_runs` to the worker pass and to `GET`/`POST /today`. GRES1's `take_over` runs before the worker starts, so the outage cache is populated before any sweep.
3. **Rollover vs outage (real).** #87 treats a prior-day run as abandoned once its lease is 120 s stale. No page can renew during an outage, so an outage of more than about 90 s across 00:00 UTC would close live runs as incomplete at boot.
   - *Rule:* lease *freshness* is measured from the later of last activity and the service's return (`_lease_baseline`); the recorded metrics keep the raw value.
   - *Test:* a 4 min outage across midnight does not close the run; the control without the outage does.
4. **Daily disconnects (no conflict).** #87 exempts Daily from forfeit entirely, so GRES1's outage-aware presence only matters for the other hosts (bonus games, Role Challenge, Journey, Arena, Ranked). `find_active_match` keeps #87's `reconnect_deadline: null` for Daily and uses the outage-aware baseline for the rest.

On the trial, GRES1 (28) + #87 (5) + composition (6) = **39 passed**.

### 5.5 Timing instrumentation

**Frontend**
- `src/lib/gameplay-timing/` keeps a bounded in-memory ring of gameplay timing records, and also emits `performance.measure` entries (visible in the DevTools Performance panel).
- Per request it records:
  - `network_ms`: fetch start to headers;
  - `server_ms`: from the `Server-Timing: app;dur=` response header;
  - `transport_ms` = `network_ms − server_ms`;
  - `kind`, `status`, `outcome`.
- Per answer it records:
  - `input_to_send_ms`: click to request dispatch, i.e. frontend handling;
  - `send_to_ack_ms`;
  - `ack_to_locked_ms`: polling latency until the snapshot confirms;
  - `poll_wait_ms`;
  - `reveal_hold_ms`, labelled **intentional presentation**;
  - `commit_to_paint_ms`: rendering, measured with a double rAF.
- Read it with `window.__mogzyGameplayTiming?.summary()`. Nothing is sent off-device in GRES1. Sampled export to analytics is a follow-up gate.

**Backend**
- `Server-Timing: app;dur=<ms>` on every response, plus `Access-Control-Expose-Headers: Server-Timing`.

## 6. Risks

- **Clock shifting edits live rows.** It is limited to the active round of an active match, exactly-once per outage window, audited, and covered by tests on quiz rounds, ability windows, per-card Stat Check blocks and Time Trial banks.
- **Beacon on the volume.** The write is about 100 bytes every 2 s without fsync. A missing or unreadable beacon is first boot or unknown: no window is recorded and no compensation is applied. That is the safe default.
- **Clock skew between containers.** Both read the same host-provided UTC. Overlap is clamped to [0, 15 min].
- **Planned Patch Ops maintenance (503 barrier).** Not a process outage, so it is not covered by the beacon. Follow-up: record the barrier's own open and close.
- **Frontend retry storms.** Retries are bounded with backoff and capped at 3 s during an interruption, about 1 request per 3 s per open tab.

## 7. Tests (see §10 for results)

Fault-injection scenarios, each run separately for ordinary MCQ rounds and for Stat Check (Meta Reflex segment):

- 502 on poll;
- 502 on submit;
- timeout (hung fetch) on poll and on submit;
- delayed response;
- ambiguous success (the server stores the answer, the response is lost);
- double click;
- restart / reconnection (`online`);
- mid-question deployment: a 502 burst followed by recovery while the deadline would have passed.

## 8. Zero-downtime investigation

§11 has the results.

## 9. Progress log

- 2026-10-22: audit complete; branches created; handoff v1.
- 2026-10-23: **renamed GR1 → GRES1** ("GR1" already names another initiative in both repos, e.g. "GR1 Phase 2"). Branches renamed `resilience/gres1-frontend` / `resilience/gres1-backend`.
  - FE: `useRankedMatch.resilience.test.tsx` 18/18 (ordinary + Stat Check), `useDailyRun.resilience.test.tsx` 8/8, client + recorder tests pass; ranked/daily/ranked-core suites vs baseline `a5d97120`: only intended diffs (two updated tests). Full-suite chunked compare (src/pages, src/lib, src/components, rest) vs baseline: **no test fails on the branch that passes on baseline** (branch 180 failing tests, baseline 182 — the two extra baseline failures are LobbyPreviewPage perf/isolation tests; all others are the same pre-existing failures).
  - BE `d8d75092`: `test_gres1_outage_resilience.py` 20/20. B3 reproduced on master (`RANKED_NO_ACTIVE_SEGMENT`) and fixed.
  - Boot timing (local, canonical DB copy): imports 4.1–4.6 s + lifespan 2.6–2.8 s (largest: `get_published_registry` ~1 s, `fix_cooldown_distractors` ~0.5 s, `run_question_imports` ~0.3 s). Production measured 6 s lifespan; Railway docs: volume-backed services cannot do zero-downtime deploys or replicas.
  - FE rename committed `d03836b4`; §10–§12 written.
- 2026-10-23 (resume pass):
  - BE `617c2ee2`: per-card Stat Check tests exposed the **rewind bug** in single-shift compensation → pause semantics (§5.3). Per-card fixture workaround (§10). 28/28.
  - BE #87 × GRES1 audited by a local trial integration (§5.4): double compensation and rollover-lease interactions found, composed, tested (6/6; 39/39 on the trial). Not pushed.
  - Deploy safety verified (§10.2). Broad backend regression compare: §10.1.

## 10. Test evidence

No local browser was launched, per `AGENTS.md`. Everything below is Vitest (jsdom) or pytest. Browser acceptance belongs to the PRs' GitHub Actions runs.

### Frontend (`resilience/gres1-frontend`, base `a5d97120`)

**`src/pages/quiz-ranked/useRankedMatch.resilience.test.tsx`: 18/18.** It runs against a stateful fake of the backend submission contract, with faults injected per endpoint.

Ordinary questions:
- Ambiguous success (stored, then response lost): the pick is kept, the same answer re-sent, the grid never released, and a second click is ignored.
- 502 on submit: the answer is delivered once.
- Hung submit: ends at the 10 s deadline and is reconciled.
- Hung submit where the snapshot already shows the answer: released at once.
- Definitive refusal: the grid is released, as before.
- The round closes while the outcome is unknown: the local pick is dropped and no error is invented.
- Double click with a slow first request: one request.

Polling:
- A hung read ends at 8 s and shows "reconnecting".
- Outage backoff is ≤ 3 s.
- An uncoded 404 is transient, not "Match ended".
- A failed `/resolved` read is retried, so the reveal is restored.
- Mid-question deployment (502 on every route, answer sent during it, impatient click on another option): delivered once, locked, no different answer.
- Reload during an outage: the failed `/resume` is retried.

Stat Check (Meta Reflex cards), as its own suite:
- Ambiguous success on a card: the same card is re-sent and confirmed by the server's index.
- 502 on a card is reconciled and never shown as "request failed (502)".
- A hung card no longer locks the next card.
- A double activation in one batch sends one card.
- A race refusal is released silently.

**`src/pages/quiz-daily-challenge/run/useDailyRun.resilience.test.tsx`: 8/8.**
- Scoring sync rides through a 12 s 502 window.
- An outage longer than the 60 s budget ends in the honest error.
- A server that keeps answering "in progress" keeps the old 6-try bound.
- The entry read rides out a reload during a redeploy, without POSTing `/today`.
- Launch is retried in place with one interaction id.
- A launch refusal still surfaces at once.
- The lease stops after an uncoded 404.
- The lease keeps one renewal in flight through transient failures.

**Client and recorder:**
- `src/lib/ranked-public/client.test.ts` 29/29: read deadline becomes `timeout`, caller abort stays `aborted`, ambiguity classification, `Server-Timing` split.
- `src/lib/gameplay-timing/recorder.test.ts` 4/4.

**Regression against a detached baseline worktree at `a5d97120`:**
- Ranked, Daily, ranked-core and daily-v2 suites: 2,788 tests. The only differences are the two tests deliberately updated:
  - `dailyV2P2A1.launchRace`: a lost launch response is now re-sent in place.
  - `client.test` `isFatal`: a bare 404 is no longer fatal.
- Full suite in 4 chunks (the whole suite OOMs in one process on this machine): **no test fails on the branch that passes on baseline**. Branch 180 failures, baseline 182, all pre-existing (CRLF stylesheet tests, the LobbyPreview perf tests, etc.).
- `tsc -p tsconfig.app.json`: only the two errors that already exist on `main` (`OnboardingProfile.tsx`, `identity/connections.ts`).

### Backend (`resilience/gres1-backend`, base `b8b629cf`)

**`test_gres1_outage_resilience.py`: 28/28** at `617c2ee2`.

Liveness beacon:
- Graceful, crash, none, sub-second and operator-length gaps are told apart.
- Recorded once.
- A draining process never clobbers its successor.
- `SERVICE_OUTAGE_LEDGER=0` disables it.
- An unmigrated DB behaves exactly as before.

Ordinary questions:
- Control: the round times out without an outage.
- Outage mid-question: the clock is paused at the interruption, the answer stays open, the earlier answer keeps its relative time, one audit row.
- Bounded once: 8 rounds of reads, heartbeats and sweeps top up to exactly the cap and no further.
- A prompt return never finds the round "not open yet" (the rewind bug).
- A boot-time sweep does not spend the players' reconnect allowance, and does not time the round out.
- An outage after the deadline gives nothing back.
- Rated Ranked: untouched by default, shifted with `all`, not with `off`.
- Unrated sources (`bot_playtest`, `admin_test`, `arena`) are compensated.
- An operator-length outage never moves a clock.

Presence:
- Control: without an outage, both absent players become no-contest.
- No forfeit for an absence the outage caused, and the normal forfeit still applies once the post-outage grace runs out.
- `find_active_match` measures the reconnect window from the service's return.

Stat Check, block clock (Meta Reflex v4, 25 s block, the `ranked_item_cost_duel_test` format):
- Control: the block closes without an outage.
- The block survives an outage mid-block, and card 0 keeps its relative time.
- A retry after the block resolved is an idempotent ack.
- A different choice is flagged `conflicting` and never stored.
- A card that was never stored is still refused.

Stat Check, **per-card clocks** (5 × 6 s cards, 1.5 s reveal between cards: the production shape):
- **Fixture workaround.** The production-shaped fixture, the playtest spine in `test_quiz1_per_card_timers.py`, does not run on `master`. It imports a removed `SCORING_ADDITIVE`, and the spine's `medium_ability_costs` shared-bank pool is empty in a fixture DB; this is pre-existing.
  - `gres1_fixture_support.per_card()` swaps only the test format's Stat Check segment for the spine's exact Meta Reflex spec (v4, 5 cards, `card_timer_seconds=6`, no block timer, no pressure).
  - The format is frozen onto the match, so every later read runs the real `segment_flow.card_schedules`.
  - The fixture is checked to really be per-card (6 s card windows).
- Control: without an outage, the card in flight expires and the index moves on.
- Outage 2 s into card 1, lasting 20 s (longer than the card and every later card's chained window): card 1 is still current, with exactly the 4 s it had left, frozen through the allowance. It is accepted, and card 2 then opens with a full 6 s.
- Outage across the whole 30 s block, starting 1 s into card 0: card 0 still has its 5 s, and every card is then playable in order.
- The opponent finished all 5 cards before the outage: their recorded times keep their exact offsets from the block start, and the player's current card and time-left are unchanged across the outage.
- A stored card retried after its window passed is an idempotent ack.

Not covered by an automated test: a per-card **Journey** block with pooled active time (`active_time_seconds`). It uses the same chained-schedule code and columns; the gap is noted for follow-up.

`Server-Timing`:
- The header is present and exposed through CORS.

**B3 reproduced on clean master** (detached worktree at `b8b629cf`): retrying the final stored card after the block resolved returns `RankedServiceError RANKED_NO_ACTIVE_SEGMENT`. The branch returns the idempotent ack.

**Regression compare, branch vs baseline:** see §10.1.

### 10.1 Backend regression comparison (branch vs clean `master` `b8b629cf`)

**No regression.**

**Scope.** Branch `617c2ee2` vs a detached clean checkout at its base, `b8b629cf`. 177 gameplay test files (`test_*ranked*`, `*daily*`, `dcmod*`, `journey*`, `quiz1*`, `order_forge*`, `match_grid*`, `assembly*`, `rc3*`/`rc5*`, `*stat_check*`, `live1_deployment*`, `funnel1b3*`, `jlong1*`, `jp5*`, `pq1*`, `dcsurv*`, `users2_3c*`) plus `public_game_modes/tests` and `arena/tests`. Both sides ran with `--continue-on-collection-errors -rfE --tb=line`.

| | Branch `617c2ee2` | Clean `b8b629cf` |
|---|---|---|
| Failed | 495 | 495 |
| Passed | 4,251 | 4,251 |
| Skipped | 705 | 705 |
| Errors | 16 | 16 |
| Collection errors (both sides) | 4 | 4 |

The 4 collection errors are the same files on both sides: `test_quiz1_meta_reflex_additive.py`, `test_quiz1_per_card_timers.py`, `test_ranked_builder_catalog.py` and `test_ranked_format_config.py`.

**By test identity:** 505 failing or erroring test IDs on each side, in 59 files.
- Failing only on the branch: **0**.
- Failing only on base: **0**.

**By traceback:** for all 505 shared failures, the normalised error line (paths, hex ids and timings masked) is **identical** on both sides.

All of these failures are pre-existing on `master` and none is attributed to GRES1. GRES1's own suite, `test_gres1_outage_resilience.py` (28/28), is not in this list and was run separately.

**Not checkable in CI:** GitHub Actions did not start any backend job. Every check annotation reads "The job was not started because recent account payments have failed or your spending limit needs to be increased". That is a billing block, not a test result.

### 10.2 Pushing these branches cannot deploy (verified 2026-10-23)

- **GitHub Actions** (`scratchpad/wf_scan.py`): none of the 37 frontend or 17 backend workflows triggers on a push to `resilience/gres1-frontend` or `resilience/gres1-backend`. Push triggers are branch-filtered to other names. No workflow contains a deploy step (Railway, Supabase deploy, Lovable, Vercel, Netlify, gh-pages, `db push`, or deploy tokens). PR workflows run browser and unit checks only.
- **Railway (backend):** `GET /repos/mitcherrman/League_Combat_Simulator/deployments` returns 100 records, all `railway-app[bot]`, all environment `sweet-analysis / production`, and **all 100 commit SHAs are ancestors of `origin/master`**. No PR or branch environment has ever deployed, although many feature branches and PRs (#87, #94, …) were pushed. `docs/LIVE1_DEPLOYMENT_DECOUPLING.md` also records that all services deploy from `master`. I could not read the Railway project settings: the CLI is not logged in, and I did not log it in.
- **Lovable (frontend):** no GitHub deployment records. Publishing is a manual owner action (memory: Lovable⇄GitHub diagnosis). A pushed branch reaches Lovable only if the editor is switched to it.

## 11. Zero-downtime deployment findings

No database migration was made, and no Railway setting was read or changed.

### 11.1 What the platform allows (Railway docs, read 2026-10-22)

The [Volumes page](https://docs.railway.com/reference/volumes) says:
- "To prevent data corruption, we prevent multiple deployments from being active and mounted to the same service."
- "…a small amount of downtime when re-deploying a service that has a volume attached", which applies "even if there is a healthcheck endpoint configured".
- "Replicas cannot be used with volumes."

The [Deployments page](https://docs.railway.com/reference/deployments) gives the default `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` as 0 before SIGKILL.

**Consequence:** while `web` owns `web-volume` (`/data`, which holds the 6+ GB `lol_calc.db`), every deploy, crash restart and offline volume resize is a real outage. No healthcheck or replica setting can change that.

### 11.2 How long the outage is (measured)

Production timeline, deploy `d189924d → e48a2d94` on 2026-09-07 (`docs/LIVE1_OPERATIONS.md` in the backend repo):

| Event | Time (UTC) |
|---|---|
| Old container SIGTERM | 21:41:56.42 |
| Old process "Waiting for application shutdown" (no new connections accepted) | 21:41:56.85 |
| New container volume mounted | 21:41:57.55 |
| New process "Started server process" (≈2.4 s of imports) | 21:41:59.91 |
| New process "Application startup complete" (≈6.0 s of lifespan) | 21:42:05.90 |

**About 9.5 s with no process accepting requests**, before edge routing. FE PR #28's evidence also recorded 15 s CORS dial timeouts during one deploy.

Local boot profile, on a copy of the canonical DB, two runs (`scratchpad/boot_timing.py`):

| Phase | Time |
|---|---|
| Imports | 4.1–4.6 s |
| Lifespan | 2.6–2.8 s |

The largest lifespan steps:

| Step | Time |
|---|---|
| `get_published_registry` | ≈1.0 s |
| `fix_cooldown_distractors(apply=True)` | ≈0.5 s |
| `run_question_imports` | ≈0.3 s |
| `migrate_ranked_public` | 0.06–0.19 s |
| `migrate_daily_runs` | 0.05–0.12 s |
| The other ~35 migrations together | < 0.4 s |

Production's lifespan (6 s) is slower than local, likely because of a cold page cache on the volume **[hyp]**.

Not verified: whether production sets `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`. The old container drained for 6.8 s, not the documented 0 s default. Reading it is an owner action.

### 11.3 Options, in increasing cost

| | Option | Outage the player sees | Data or infra change | Status |
|---|---|---|---|---|
| A | **Ride through, fairly.** Client deadlines, reconciliation and a 3 s backoff ceiling (GRES1-FE). Outage windows and clock/presence compensation (GRES1-BE). | ~10 s of "Reconnecting…". No lost time, answer or forfeit in unrated modes; rated Ranked by owner flag. | Two additive tables | **Built in GRES1** |
| B | **Shorten the boot.** Move non-gameplay boot work (`fix_cooldown_distractors(apply=True)`, question/vision imports, ability-component backfill) to an operator step or after `yield`. Cache `get_published_registry`. Defer non-gameplay router imports. | Perhaps −2 to −4 s of ~9.5 s **[hyp; measure per step in prod]** | None. Some of these steps *write* data at boot, so moving them is a correctness review, not a refactor. | Proposal |
| C | **A volume-less front door.** A small always-on proxy service (private network) that holds or retries requests for ≤15 s while `web` swaps. Connection-refused is safe to retry for every request. A timeout after send is safe only for the idempotent writes this pass verified (round answer, segment card, Daily start/launch/sync). | ≈0 visible downtime. Requests are slower during the swap. | One more Railway service, one more hop. No data move. | Proposal, owner decision |
| D | **Gameplay state off the volume.** Mutable gameplay tables (`ranked_*`, `daily_*`, attempts, outbox) go to a managed database. The mostly static content corpus becomes a read-only image or a separate store. `web` then has no volume and can overlap deployments and run replicas. | True zero downtime | A large migration: SQLite-specific SQL (`BEGIN IMMEDIATE`, `rowid`, `PRAGMA`), a cut-over plan, backups | Owner decision. **Not started; no migration made.** |

**Recommendation:**
- Ship A now.
- Profile B in production as a read-only measurement: the boot log already prints per-step lines.
- Take C to the owner as the cheapest step to true uptime.
- Treat D as its own project, sized against the LIVE1 Option A/B analysis in `docs/LIVE1_DEPLOYMENT_DECOUPLING.md`, which hit the same single-volume constraint.

### 11.4 Risks noticed (not changed)

- **Possible two-writer window [hyp].** During a swap the new container mounted `/data` while the old one was still draining (≈6 s, §11.2), so two processes may hold the SQLite file. Correctness relies on `BEGIN IMMEDIATE`, status-guarded updates and primary keys (`test_ranked_public_crossprocess.py`), because the per-match locks are process-local. GRES1's compensation is guarded by a primary key, so it stays exactly-once across processes.
- **Planned Patch Ops maintenance (the 503 barrier) is not yet recorded as an outage window.** Its own open and close instants should be recorded: follow-up.
- **More Challenges session games keep in-memory sessions** (`public_game_modes/sessions.py:87-88`), so every deploy loses them. Fixing that needs persistent session storage (B7, owner decision).

## 12. Exact next integration action

PRs: frontend https://github.com/mitcherrman/mogsy/pull/135 (head: this branch), backend https://github.com/mitcherrman/League_Combat_Simulator/pull/101 (head `617c2ee2`). Both are drafts and neither is merged.

**Release dependencies:**
- **GRES1-FE** is independently releasable against today's production backend.
  - Without `Server-Timing`, the backend share is recorded as "unknown", never guessed.
  - The lease stops after the first uncoded 404, so it is safe whether or not BE #87 ships.
- **GRES1-BE** changes no contract the current frontend reads. It adds one response header, one idempotent-ack path that was a 409 before, and two additive tables.
  - It can ship before #87.
  - It **must not merge after #87 without the composition in §5.4**. Merged blindly in that order, Daily players who are present across an outage are compensated twice.
- **BE #87** conflicts with current `master` in 3 files. The trial resolution in §5.4 keeps both sides and passes the Daily suites with the same failure set as `master`.

**The precise next step:** the owner reviews and merges **GRES1-FE**, the client-only half with no data. Then:

1. **Owner decision on BE #87.** Frontend #119 is live and POSTs `/activity` to a backend that 404s it. Choose one:
   - **(a)** Update #87's branch with the trial's conflict resolution (`gres1/trial-87-integration` @ `9a39d26c`, local worktree `C:\Users\mlmit\lcs-gres1-trial`), re-run its tests, and merge #87 first. Then rebase GRES1-BE onto it with the composition commit (`54854319`: compensation ahead of `_resume_daily_clock` at every site including `heartbeat`, `_outage_shift_since`, `_lease_baseline`, `test_gres1_x_87_composition.py`).
   - **(b)** Merge GRES1-BE first. #87, when later resolved against `master`, must take the same composition. `54854319` is the reference implementation.

   The trial branch is local only and was not pushed. Pushing it, or rewriting #87's branch, is the owner's call.
2. **GRES1-BE owner gates before merge:**
   - Two additive tables created at boot.
   - The liveness beacon `/data/.mogzy_web_alive`, rewritten every 2 s without fsync.
   - Outage-aware presence applies to **rated Ranked too** (symmetric, not player-controllable).
   - `RANKED_OUTAGE_CLOCK_COMPENSATION` defaults to `unrated`; `all` brings rated Ranked in.
   - Kill switches: `SERVICE_OUTAGE_LEDGER=0`, `SERVER_TIMING=0`.
3. **After deploy**, verify with read-only checks:
   - **First deploy:** the outgoing process predates the beacon, so no window is recorded. Expect a beacon file and `Server-Timing` on `/api/health`.
   - **Second deploy:** the boot log shows `service outage recorded: … (graceful)`; `service_outage_windows` has one ~10 s row; any match active across it has a `ranked_outage_compensations` row with `shift_ms ≤ target_ms`.
4. **Follow-ups** (each its own task):
   - Record Patch Ops maintenance windows as outages.
   - Measure boot steps in production (§11.3 B).
   - Proxy front door proposal (§11.3 C).
   - Persistent More Challenges sessions (B7).
   - Per-card Journey (pooled active time) outage test.
   - Repair `test_quiz1_per_card_timers.py` on `master` (pre-existing break).
   - FE #108 **stays open** until its reload edge case (reload into the final Stat Check wait shows no stamp) is verified or incorporated.
