/**
 * Pro Play quiz API client.
 *
 * Thin wrapper over the backend's `/api/pro-play/quiz/*` endpoints. Questions
 * are generated on demand from Pro Play Authority and frozen server-side, so
 * there is no question bank here and nothing to cache: the server owns the
 * session and hands back one question at a time.
 *
 * Errors arrive as `{ detail: { code, message } }`. The message is already
 * user-safe (the backend never returns raw exception text), so it is surfaced
 * as-is rather than re-worded here.
 */

const API_BASE_URL =
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) || "http://127.0.0.1:8000";

export type ProPlayQuestion = {
  index: number;
  number: number;
  total: number;
  /** Player-facing topic — "Champion" | "Player" | "Team". Never a family id. */
  topic: string;
  /** OPAQUE digest, not the stable question_key: that key is prefixed with the
   *  internal family id, so it never leaves the server. */
  question_id: string;
  question_text: string;
  choices: string[];
  presentation: Record<string, unknown>;
};

export type ProPlaySessionState = {
  session_id: string;
  total: number;
  answered: number;
  score: number;
  complete: boolean;
};

export type ProPlayAnswerResult = {
  is_correct: boolean;
  selected_answer: string;
  correct_answer: string;
  explanation: string;
  reveal: Record<string, unknown>;
};

export type ProPlayTurn = {
  session: ProPlaySessionState;
  question: ProPlayQuestion | null;
};

export type ProPlayAnswerTurn = ProPlayTurn & { result: ProPlayAnswerResult };

export class ProPlayApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ProPlayApiError";
  }
}

const GENERIC_ERROR = "Pro Play is unavailable right now. Please try again.";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    // Network-level failure: never surface the raw error.
    throw new ProPlayApiError("PP_NETWORK", GENERIC_ERROR);
  }
  if (!res.ok) {
    let code = "PP_ERROR";
    let message = GENERIC_ERROR;
    try {
      const body = await res.json();
      const detail = body?.detail;
      if (detail && typeof detail === "object") {
        code = String(detail.code ?? code);
        message = String(detail.message ?? message);
      }
    } catch {
      /* keep the generic message */
    }
    throw new ProPlayApiError(code, message);
  }
  return (await res.json()) as T;
}

export async function startProPlayQuiz(): Promise<ProPlayTurn> {
  return request<ProPlayTurn>("/api/pro-play/quiz/sessions", { method: "POST" });
}

export async function answerProPlayQuestion(
  sessionId: string,
  selectedAnswer: string,
): Promise<ProPlayAnswerTurn> {
  return request<ProPlayAnswerTurn>(
    `/api/pro-play/quiz/sessions/${encodeURIComponent(sessionId)}/answer`,
    { method: "POST", body: JSON.stringify({ selected_answer: selectedAnswer }) },
  );
}

export const proPlayApi = { startProPlayQuiz, answerProPlayQuestion, baseUrl: API_BASE_URL };
