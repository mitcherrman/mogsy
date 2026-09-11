/**
 * Contextual Matchup Study client (Step 12).
 *
 * The server owns the session: it resolves the champion pair, decides which
 * questions the pair can honestly be asked, freezes each one when it is
 * served and grades against that frozen copy. This module therefore holds no
 * question bank, no answer key and no scoring — the same division of labour
 * `@/lib/pro-play/api` already has with the Pro Play quiz.
 *
 * The route contract is TWO SLUGS AND NOTHING ELSE. No player, no team, no
 * match, no patch: the Explorer's action row carries the champions because
 * the champions are the only thing the quiz uses, and a parameter the
 * destination ignores would be a claim this session does not honour.
 */
const API_BASE_URL =
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) || "http://127.0.0.1:8000";

/** Which tier of relevance the session actually reached. */
export type MatchupTier = "pair_comparison" | "paired_study";

export type MatchupSessionState = {
  session_id: string;
  champion_a: string;
  champion_b: string;
  tier: MatchupTier;
  champion_a_icon: string | null;
  champion_b_icon: string | null;
  total: number;
  answered: number;
  score: number;
  complete: boolean;
};

export type MatchupQuestion = {
  index: number;
  number: number;
  total: number;
  question_id: string;
  question_text: string;
  choices: string[];
  tier: MatchupTier;
  /** The champions this question is about — one or two, never none. */
  champions: string[];
  image_path: string | null;
};

export type MatchupAnswerResult = {
  is_correct: boolean;
  selected_answer: string;
  correct_answer: string;
  explanation: string;
};

export type MatchupTurn = {
  session: MatchupSessionState;
  question: MatchupQuestion | null;
};

export type MatchupAnswerTurn = MatchupTurn & { result: MatchupAnswerResult };

/** The error codes this surface may show a reader, distinguished from each
 *  other because "that is not a champion" and "there is nothing to ask about
 *  these two yet" are different things to say. */
export type MatchupErrorCode =
  | "MATCHUP_INCOMPLETE_PAIR"
  | "MATCHUP_SAME_CHAMPION"
  | "MATCHUP_UNKNOWN_CHAMPION"
  | "MATCHUP_NO_QUESTIONS"
  | "MATCHUP_SESSION_NOT_FOUND"
  | "MATCHUP_NOTHING_TO_ANSWER"
  | "MATCHUP_UNAVAILABLE";

export class MatchupStudyError extends Error {
  code: MatchupErrorCode | "MATCHUP_UNAVAILABLE";

  constructor(code: string, message: string) {
    super(message);
    this.name = "MatchupStudyError";
    this.code = (code || "MATCHUP_UNAVAILABLE") as MatchupErrorCode;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    // The backend types every failure; a body that is not one of those is
    // still reported as a typed error rather than a raw status string.
    let code = "MATCHUP_UNAVAILABLE";
    let message = "Matchup study is unavailable right now.";
    try {
      const body = await res.json();
      const detail = body?.detail;
      if (detail && typeof detail === "object") {
        if (typeof detail.code === "string") code = detail.code;
        if (typeof detail.message === "string") message = detail.message;
      }
    } catch {
      /* a non-JSON error body is the generic case, already set */
    }
    throw new MatchupStudyError(code, message);
  }
  return (await res.json()) as T;
}

export function startMatchupStudy(a: string, b: string): Promise<MatchupTurn> {
  return request<MatchupTurn>("/api/quiz/matchup/sessions", {
    method: "POST",
    body: JSON.stringify({ a, b }),
  });
}

export function readMatchupStudy(sessionId: string): Promise<MatchupTurn> {
  return request<MatchupTurn>(
    `/api/quiz/matchup/sessions/${encodeURIComponent(sessionId)}`,
  );
}

export function answerMatchupQuestion(
  sessionId: string,
  selectedAnswer: string,
): Promise<MatchupAnswerTurn> {
  return request<MatchupAnswerTurn>(
    `/api/quiz/matchup/sessions/${encodeURIComponent(sessionId)}/answer`,
    { method: "POST", body: JSON.stringify({ selected_answer: selectedAnswer }) },
  );
}

/** The route a matchup study lives at. One place, so the Explorer's action
 *  and the page's own SEO path cannot drift apart. */
export const MATCHUP_STUDY_ROUTE = "/quiz/matchup";

export function matchupStudyHref(slugA: string, slugB: string): string {
  const params = new URLSearchParams({ a: slugA, b: slugB });
  return `${MATCHUP_STUDY_ROUTE}?${params.toString()}`;
}
