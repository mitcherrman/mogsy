/**
 * PPQ2-INT — a deterministic, in-memory stand-in for the Pro Play quiz API.
 * DEV ONLY (the route that uses it is registered under `import.meta.env.DEV`).
 *
 * It replays REAL frozen payloads (`PRO_PLAY_SAMPLES`, captured from
 * production) as a 1..N session and plays the SERVER's part of the contract,
 * so the production controller runs against it unchanged:
 *
 *  - start → a session and question 1; getSession → the current question;
 *  - answer → graded HERE, standing in for the server: the frozen
 *    `result.correct_answer` is the server's key for that question. The
 *    client layers never see this comparison; they receive `is_correct` as
 *    they would from the network;
 *  - PPQ0A semantics: a repeat of an already-graded (question_id, answer)
 *    replays the recorded grade with `replayed: true`; a different
 *    question_id is a 409 `PP_QUESTION_MISMATCH`; an unknown session a 404.
 *
 * Faults are opt-in and labelled: `start` fails the first start with a 503;
 * `answer` fails the first question's first three answer attempts with a 503
 * (one call plus the controller's two automatic resends), so Try again shows.
 */
import { PRO_PLAY_SAMPLES, type ProPlaySample } from "@/lib/pro-play/__fixtures__/proPlaySamples";
import {
  ProPlayApiError,
  type ProPlayAnswerResult,
  type ProPlayAnswerTurn,
  type ProPlayQuestion,
  type ProPlayTurn,
} from "@/lib/pro-play/api";
import type { ProPlayArenaTransport } from "@/lib/pro-play/arena";

/** Ten distinct real questions, alternating two- and four-choice shapes. */
export const DEFAULT_FIXTURE_SET = [
  "champion_player", "team_champion", "player_champion", "patch", "champion_team",
  "flex", "recent", "pro_play", "nuguri_clear", "t1_lineage",
] as const;

export const FIXTURE_SETS: Record<string, readonly string[]> = {
  default: DEFAULT_FIXTURE_SET,
  two: ["champion_player", "player_champion", "champion_team", "recent", "nuguri_clear"],
  four: ["team_champion", "patch", "flex", "pro_play", "t1_lineage"],
};

export type FixtureFault = "none" | "start" | "answer";

export interface FixtureTransportOptions {
  keys?: readonly string[];
  latencyMs?: number;
  fault?: FixtureFault;
}

type Session = {
  id: string;
  questions: ProPlayQuestion[];
  samples: ProPlaySample[];
  answered: number;
  score: number;
  graded: Map<string, { selected: string; result: ProPlayAnswerResult }>;
};

/** Resolve a set name or a comma list of sample keys to known keys. */
export function resolveFixtureKeys(spec: string | null): string[] {
  if (!spec) return [...DEFAULT_FIXTURE_SET];
  const named = FIXTURE_SETS[spec];
  const keys = named ?? spec.split(",").map((k) => k.trim());
  const known = keys.filter((k) => k in PRO_PLAY_SAMPLES);
  return known.length ? known : [...DEFAULT_FIXTURE_SET];
}

export function createFixtureTransport(options: FixtureTransportOptions = {}): ProPlayArenaTransport {
  const keys = options.keys?.length ? options.keys : DEFAULT_FIXTURE_SET;
  const latency = Math.max(0, options.latencyMs ?? 350);
  let startFaults = options.fault === "start" ? 1 : 0;
  let answerFaults = options.fault === "answer" ? 3 : 0;
  let counter = 0;
  const sessions = new Map<string, Session>();

  const wait = () => new Promise<void>((r) => setTimeout(r, latency));
  const state = (s: Session) => ({
    session_id: s.id,
    total: s.questions.length,
    answered: s.answered,
    score: s.score,
    complete: s.answered >= s.questions.length,
  });
  const current = (s: Session) => s.questions[s.answered] ?? null;
  const unavailable = () =>
    new ProPlayApiError("PP_UNAVAILABLE", "Pro Play is unavailable right now. Please try again.", 503);

  return {
    async start(): Promise<ProPlayTurn> {
      await wait();
      if (startFaults > 0) {
        startFaults -= 1;
        throw unavailable();
      }
      counter += 1;
      const id = `fixture-${counter}`;
      const samples = keys.map((k) => PRO_PLAY_SAMPLES[k]);
      const total = samples.length;
      const questions = samples.map((sample, i) => ({
        ...sample.question,
        index: i,
        number: i + 1,
        total,
        // Unique per position: two samples may share a captured question.
        question_id: `fx${counter}-${i + 1}-${sample.question.question_id}`,
      }));
      const s: Session = { id, questions, samples, answered: 0, score: 0, graded: new Map() };
      sessions.set(id, s);
      return { session: state(s), question: current(s) };
    },

    async getSession(sessionId: string): Promise<ProPlayTurn> {
      await wait();
      const s = sessions.get(sessionId);
      if (!s) throw new ProPlayApiError("PP_SESSION_NOT_FOUND", "This quiz session has expired.", 404);
      return { session: state(s), question: current(s) };
    },

    async answer(sessionId: string, questionId: string, selectedAnswer: string): Promise<ProPlayAnswerTurn> {
      await wait();
      const s = sessions.get(sessionId);
      if (!s) throw new ProPlayApiError("PP_SESSION_NOT_FOUND", "This quiz session has expired.", 404);
      if (answerFaults > 0 && s.answered === 0) {
        answerFaults -= 1;
        throw unavailable();
      }
      const prior = s.graded.get(questionId);
      if (prior) {
        if (prior.selected !== selectedAnswer) {
          throw new ProPlayApiError("PP_ANSWER_CONFLICT", "That question was already answered.", 409);
        }
        return { session: state(s), question: current(s), result: prior.result, replayed: true };
      }
      const q = current(s);
      if (!q || q.question_id !== questionId) {
        throw new ProPlayApiError("PP_QUESTION_MISMATCH", "That is not the current question.", 409);
      }
      const sample = s.samples[s.answered];
      const isCorrect = selectedAnswer === sample.result.correct_answer;
      const result: ProPlayAnswerResult = {
        ...sample.result,
        is_correct: isCorrect,
        selected_answer: selectedAnswer,
      };
      s.graded.set(questionId, { selected: selectedAnswer, result });
      s.answered += 1;
      if (isCorrect) s.score += 1;
      return { session: state(s), question: current(s), result, replayed: false };
    },
  };
}
