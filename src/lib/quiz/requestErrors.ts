/**
 * PM2 — WHETHER A FAILED QUIZ REQUEST CAN HAVE REACHED THE SERVER.
 *
 * A write that fails before `fetch` is called (no session could be made, the
 * auth headers could not be read, the browser is offline) was never sent, so
 * sending it again cannot record anything twice. A write that fails after —
 * the connection dropped, a 5xx, a proxy timeout — may or may not have been
 * recorded. Callers that offer a retry need to tell the two apart; these mark
 * the first kind on the error object itself (its message and class are
 * unchanged, so every existing `instanceof` and message check still holds) and
 * read an HTTP error's status, which `api.ts` attaches.
 *
 * Its own module so a test that mocks `@/lib/quiz/api` keeps these.
 */
const QUIZ_REQUEST_NOT_SENT = Symbol.for("mogzy.quiz.requestNotSent");

export function markQuizRequestNotSent(err: unknown): unknown {
  const target = err !== null && typeof err === "object" ? err : new Error(String(err));
  (target as Record<symbol, unknown>)[QUIZ_REQUEST_NOT_SENT] = true;
  return target;
}

/** True when the request failed before it was handed to `fetch`. */
export function quizRequestNotSent(err: unknown): boolean {
  return err !== null && typeof err === "object"
    && (err as Record<symbol, unknown>)[QUIZ_REQUEST_NOT_SENT] === true;
}

/** The HTTP status of a failed quiz request, or null when there was none. */
export function quizRequestStatus(err: unknown): number | null {
  const status = err !== null && typeof err === "object" ? (err as { status?: unknown }).status : undefined;
  return typeof status === "number" ? status : null;
}
