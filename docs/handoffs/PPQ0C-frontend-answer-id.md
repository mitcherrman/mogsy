# PPQ0C — Pro Play question-bound answers (frontend)

| | |
|---|---|
| Repo | `mitcherrman/mogsy` |
| Base | origin/main `c08882f6982c6eca80431e00051f3af466397f12` |
| Branch | `ppq0c/frontend-answer-id` (worktree `C:\Users\mlmit\mogzy-wt\ppq0c-frontend`), **unpushed** |
| Backend contract | `mitcherrman/League_Combat_Simulator` `ppq0a/quiz-correctness` @ `07cde8f7` (PPQ0A, unpushed, not deployed) |
| Production | None touched. No merge, no deploy. |

This is the "PPQ2-B frontend change" that the PPQ0A handoff (§P2) asks for. It is limited to the Pro Play quiz page. It does not touch CanonicalArena, does not change the UI and does not include any PPQ2 visuals.

## What changed

- `src/lib/pro-play/api.ts`
  - `answerProPlayQuestion(sessionId, questionId, selectedAnswer)` POSTs `{ question_id, selected_answer }`.
  - `ProPlayAnswerTurn.replayed?: boolean` is optional because a pre-PPQ0A backend omits it.
  - New `getProPlaySession(id)` wraps `GET /quiz/sessions/{id}`.
  - `ProPlayApiError.status` is the HTTP status, or 0 when the request got no response.
- `src/lib/pro-play/answerFlow.ts` (new): the decision table.
  - Transport error or 5xx: resend the **identical** request up to 2 times (waits of 250 ms, then 750 ms), then return a failure the user can retry.
  - 409 `PP_QUESTION_MISMATCH`, `PP_ANSWER_CONFLICT`, `PP_SESSION_COMPLETE` or `PP_NOTHING_TO_ANSWER`: resync with `GET`. The request is never resent.
  - 404 `PP_SESSION_NOT_FOUND`: expired; only a restart helps.
  - Any other 4xx: stop.
- `src/pages/ProPlayQuiz.tsx`
  - Each answer names `question.question_id`.
  - The selection stays locked through resends.
  - "Try again" on a retryable answer failure resends the same request instead of restarting the session. On expiry it restarts, as before.
  - A conflict adopts the server's GET view: its current question or the final summary, with no local reveal.
  - A synchronous `inFlight` ref stops duplicate submits. An `epoch` ref drops responses for an abandoned session.
  - On Next, if an answered non-final turn carries no next question, the page GETs the current question.
- Grading, score and the reveal still come only from the server. The pre-answer render path is unchanged.

## Tests

- `answerFlow.test.ts` (13 tests): the decision table and the exact wire body.
- `ProPlayQuiz.test.tsx`: 10 new page tests against a stateful fake of the PPQ0A state machine. Faults are injected *after* the server grades, which is a real lost response. Covered:
  - success;
  - lost-response retry: Q2 is never graded;
  - resends exhausted, then "Try again" replays;
  - conflict, then GET resync;
  - expiry, then restart;
  - a 503 on the next draw, recovered;
  - a missing next question, recovered by GET;
  - a lost final answer;
  - duplicate clicks: one POST, one grade;
  - no reveal or evidence while the answer is in flight.
- Regression: 17 Pro Play files, 461 / 461 tests (baseline was 16 files, 438 / 438). The 6 other files that reference the page or its routes: 81 / 81. ESLint is clean.
- `tsc` shows 2 errors, both pre-existing in untouched files (`OnboardingProfile.tsx`, `identity/connections.ts`).
- Mutants:
  - Killed: no `question_id`, no auto-resend, no resync, "Try again" restarts.
  - Equivalent: clearing the selection on a retryable failure. The resend re-locks it.

## Compatibility findings

1. **Deploy order is load-bearing.**
   - On the legacy backend, which ignores `question_id`, an automatic resend after a lost response grades the *next* question with the stale choice. That is the defect PPQ0A fixes, and this client now triggers it automatically.
   - **PPQ0A must be live in production before this ships.** The PPQ0A plan already deploys the backend first with `REQUIRE_QUESTION_ID = False`.
   - The legacy backend accepts the extra field and grades as before, so nothing else breaks.
2. Flip `REQUIRE_QUESTION_ID = True` (`routes/pro_play.py:34`) only after this frontend is live everywhere.
3. A GET resync returns the current question, not the reveal for the conflicting question. After a conflict the player moves on without that question's reveal. This is by contract.
4. Sessions are process-local. On a multi-worker deploy a retry routed to another worker returns `PP_SESSION_NOT_FOUND`, so the player gets a restart. This is unchanged from before.

## Unresolved

- Whether to show a "reconnecting" hint during automatic resends (up to about 1 s). It was left out to keep the presentation unchanged.
- The matchup quiz has the same retry defect (PPQ0A §P5.5). It is out of scope here.
