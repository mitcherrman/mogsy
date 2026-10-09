/**
 * Pro Play answer submission with lost-response recovery (PPQ0C).
 *
 * The backend's answer route is idempotent per question (PPQ0A): a request
 * names the question it answers with the opaque `question_id` it was served
 * with, the server grades that question ONCE, and an identical repeat replays
 * the recorded result (`replayed: true`) without grading, scoring or drawing
 * again. That is what makes it safe to resend after a response is lost.
 *
 * This module only decides WHAT to do with each failure; it never grades,
 * never scores and never reads an answer key. Correctness, score and the
 * reveal all come from the server's response.
 *
 *  - Transport error or 5xx: resend the IDENTICAL request (same question_id,
 *    same selected_answer), a bounded number of times. A 503 after grading
 *    (the next draw failed) is recovered the same way: the repeat replays the
 *    grade and retries the draw.
 *  - 409 typed conflict: the server's session is not where this page thinks it
 *    is, so resynchronize from `GET /quiz/sessions/{id}`. Never resend.
 *  - 404 PP_SESSION_NOT_FOUND: the session expired; only a restart helps.
 *  - Anything else (e.g. 422): a plain failure.
 */
import {
  answerProPlayQuestion,
  getProPlaySession,
  ProPlayApiError,
  type ProPlayAnswerTurn,
  type ProPlayTurn,
} from "./api";

/** 409 codes after which the client's view of the session is stale. */
export const PRO_PLAY_RESYNC_CODES: ReadonlySet<string> = new Set([
  "PP_QUESTION_MISMATCH",
  "PP_ANSWER_CONFLICT",
  "PP_SESSION_COMPLETE",
  "PP_NOTHING_TO_ANSWER",
]);

export const PRO_PLAY_SESSION_EXPIRED = "PP_SESSION_NOT_FOUND";

/** Waits before each automatic resend. Two resends, three attempts in all. */
export const PRO_PLAY_ANSWER_RETRY_DELAYS_MS: readonly number[] = [250, 750];

export type ProPlayAnswerRequest = {
  sessionId: string;
  questionId: string;
  selectedAnswer: string;
};

export type ProPlayAnswerOutcome =
  | { kind: "answered"; turn: ProPlayAnswerTurn }
  | { kind: "resynced"; turn: ProPlayTurn; code: string }
  | { kind: "expired"; error: ProPlayApiError }
  /** `retryable`: resending the SAME request is safe and may succeed. */
  | { kind: "failed"; error: ProPlayApiError; retryable: boolean };

type Deps = {
  answer?: typeof answerProPlayQuestion;
  getSession?: typeof getProPlaySession;
  retryDelaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function asApiError(err: unknown): ProPlayApiError {
  return err instanceof ProPlayApiError
    ? err
    : new ProPlayApiError("PP_ERROR", "Pro Play is unavailable right now. Please try again.");
}

/** A transport failure or a server-side failure: the identical request may
 *  succeed if sent again, and the server makes sending it again safe. */
export function isRetryableAnswerError(err: ProPlayApiError): boolean {
  return err.code === "PP_NETWORK" || err.status === 0 || err.status >= 500;
}

/** Read the server's current state of the session. */
export async function resyncProPlaySession(
  sessionId: string,
  getSession: typeof getProPlaySession = getProPlaySession,
): Promise<{ kind: "resynced"; turn: ProPlayTurn } | { kind: "expired"; error: ProPlayApiError } | { kind: "failed"; error: ProPlayApiError }> {
  try {
    return { kind: "resynced", turn: await getSession(sessionId) };
  } catch (err) {
    const error = asApiError(err);
    return error.code === PRO_PLAY_SESSION_EXPIRED
      ? { kind: "expired", error }
      : { kind: "failed", error };
  }
}

export async function submitProPlayAnswer(
  req: ProPlayAnswerRequest,
  deps: Deps = {},
): Promise<ProPlayAnswerOutcome> {
  const answer = deps.answer ?? answerProPlayQuestion;
  const getSession = deps.getSession ?? getProPlaySession;
  const delays = deps.retryDelaysMs ?? PRO_PLAY_ANSWER_RETRY_DELAYS_MS;
  const sleep = deps.sleep ?? defaultSleep;

  for (let attempt = 0; ; attempt += 1) {
    try {
      // The SAME three values on every attempt: that is the whole contract.
      const turn = await answer(req.sessionId, req.questionId, req.selectedAnswer);
      return { kind: "answered", turn };
    } catch (err) {
      const error = asApiError(err);
      if (error.code === PRO_PLAY_SESSION_EXPIRED) return { kind: "expired", error };
      if (error.status === 409 && PRO_PLAY_RESYNC_CODES.has(error.code)) {
        const synced = await resyncProPlaySession(req.sessionId, getSession);
        if (synced.kind === "resynced") {
          return { kind: "resynced", turn: synced.turn, code: error.code };
        }
        // The resync itself failed; a later resend is still answered safely
        // (it replays, conflicts again, or is refused), so keep it retryable.
        return synced.kind === "expired"
          ? synced
          : { kind: "failed", error: synced.error, retryable: true };
      }
      if (!isRetryableAnswerError(error)) return { kind: "failed", error, retryable: false };
      if (attempt >= delays.length) return { kind: "failed", error, retryable: true };
      await sleep(delays[attempt]);
    }
  }
}
