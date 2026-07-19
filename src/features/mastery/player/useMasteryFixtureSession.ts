/**
 * Fixture-driven, NON-AUTHORITATIVE session hook for the read-only Mastery
 * player prototype (G5.2B).
 *
 * It parses the six audited player-question and reveal envelopes through the
 * approved G5.2A contracts and drives the local UI flow
 * (intro → question → submitting → reveal → advancing → completed).
 *
 * Authority discipline:
 *   - It NEVER imports the reviewer artifact.
 *   - The paired reveal for a step is exposed to rendering ONLY once the phase
 *     reaches `reveal` (after the local submit). In `question`/`submitting` the
 *     exposed `reveal` is always null, so pre-submission render paths structurally
 *     cannot read answer evidence.
 *   - Correctness is taken verbatim from the reveal's `authoritativeCorrectness`.
 *     Answers are never compared locally.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { parseMasteryPlayerQuestion } from "../contracts/parsers";
import { parseMasteryPlayerReveal } from "../contracts/parsers";
import type { MasteryPlayerQuestion } from "../contracts/playerQuestion";
import type { MasteryPlayerReveal } from "../contracts/playerReveal";
import type { MasteryStateView } from "../contracts/stateView";
import { playerQuestionEnvelopes, playerRevealEnvelopes } from "../fixtures";

export type PlayerFlowPhase =
  | "intro"
  | "question"
  | "submitting"
  | "reveal"
  | "advancing"
  | "completed";

export type PlayerAnswer = string | number | boolean;

export interface MasteryResultRow {
  readonly sequenceIndex: number;
  readonly questionFamily: string;
  readonly prompt: string;
  readonly playerAnswer: PlayerAnswer;
  readonly correct: boolean;
  readonly correctAnswer: string | number | boolean;
}

export interface MasteryFixtureSession {
  readonly phase: PlayerFlowPhase;
  readonly index: number;
  readonly totalSteps: number;
  /** Current parsed question; null only during `intro` / `completed`. */
  readonly question: MasteryPlayerQuestion | null;
  /** Paired reveal; null except during `reveal` / `advancing`. */
  readonly reveal: MasteryPlayerReveal | null;
  readonly submittedAnswer: PlayerAnswer | null;
  readonly results: readonly MasteryResultRow[];
  /** After-state of the final answered step (S2 for the audited set); else null. */
  readonly finalState: MasteryStateView | null;
  readonly start: () => void;
  readonly submit: (answer: PlayerAnswer) => void;
  readonly next: () => void;
  readonly restart: () => void;
}

function toResult(reveal: MasteryPlayerReveal, playerAnswer: PlayerAnswer): MasteryResultRow {
  return {
    sequenceIndex: reveal.sequenceIndex,
    questionFamily: reveal.questionFamily,
    prompt: "",
    playerAnswer,
    correct: reveal.authoritativeCorrectness,
    correctAnswer: reveal.correctAnswer,
  };
}

export function useMasteryFixtureSession(): MasteryFixtureSession {
  // Parse once. If a fixture ever violates a contract this throws at mount —
  // exactly the fail-closed behaviour we want.
  const questions = useMemo(() => playerQuestionEnvelopes().map(parseMasteryPlayerQuestion), []);
  const reveals = useMemo(() => playerRevealEnvelopes().map(parseMasteryPlayerReveal), []);
  const totalSteps = questions.length;

  const [phase, setPhase] = useState<PlayerFlowPhase>("intro");
  const [index, setIndex] = useState(0);
  const [submittedAnswer, setSubmittedAnswer] = useState<PlayerAnswer | null>(null);
  const [results, setResults] = useState<MasteryResultRow[]>([]);

  // submitting → reveal (deterministic microtask; records authoritative result).
  useEffect(() => {
    if (phase !== "submitting") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const rv = reveals[index];
      const answer = submittedAnswer ?? rv.correctAnswer;
      setResults((prev) =>
        prev.some((r) => r.sequenceIndex === rv.sequenceIndex)
          ? prev
          : [...prev, { ...toResult(rv, answer), prompt: questions[index].prompt }],
      );
      setPhase("reveal");
    });
    return () => {
      cancelled = true;
    };
  }, [phase, index, reveals, questions, submittedAnswer]);

  // advancing → question | completed (deterministic microtask).
  useEffect(() => {
    if (phase !== "advancing") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (index + 1 >= totalSteps) {
        setPhase("completed");
      } else {
        setIndex(index + 1);
        setSubmittedAnswer(null);
        setPhase("question");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [phase, index, totalSteps]);

  const start = useCallback(() => {
    setResults([]);
    setSubmittedAnswer(null);
    setIndex(0);
    setPhase("question");
  }, []);

  const submit = useCallback(
    (answer: PlayerAnswer) => {
      setPhase((p) => {
        if (p !== "question") return p;
        setSubmittedAnswer(answer);
        return "submitting";
      });
    },
    [],
  );

  const next = useCallback(() => {
    setPhase((p) => (p === "reveal" ? "advancing" : p));
  }, []);

  const restart = useCallback(() => {
    setResults([]);
    setSubmittedAnswer(null);
    setIndex(0);
    setPhase("intro");
  }, []);

  const showQuestion = phase === "question" || phase === "submitting" || phase === "reveal" || phase === "advancing";
  const showReveal = phase === "reveal" || phase === "advancing";
  const finalState =
    phase === "completed" && reveals.length > 0 ? reveals[reveals.length - 1].afterState : null;

  return {
    phase,
    index,
    totalSteps,
    question: showQuestion ? questions[index] : null,
    reveal: showReveal ? reveals[index] : null,
    submittedAnswer,
    results,
    finalState,
    start,
    submit,
    next,
    restart,
  };
}
