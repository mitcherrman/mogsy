/**
 * Ranked scenario adapter (F1 rich-metadata transport).
 *
 * Maps the transported, question-safe presentation metadata on a
 * `PublicQuestionSource` into a neutral `ScenarioSource` (a Quiz/Broadcast-shaped
 * `QuizQuestion`) that `InteractiveScenarioSurface` already consumes via
 * `selectScenario`. This is the SINGLE Ranked→surface visual adapter — no
 * BroadcastRenderer, no copied Broadcast logic, no backend fixture schema, and
 * no mode flags. Ranked Tutorial keeps using the same surface with no
 * `scenarioSource` (text-only), so it is unaffected.
 *
 * Hidden-information: the backend only ever transports question-safe metadata
 * (pre-reveal, no correct answer), and the contract reader drops anything
 * unsafe. Spoiler gating for any subject still happens inside the surface via
 * `selectScenario` (correctAnswer stays null until a backend-authoritative
 * reveal), so this adapter performs no correctness logic.
 */

import type { QuizQuestion } from "@/lib/quiz/api";
import type { PublicQuestionSource } from "./adaptToViews";

/**
 * Build a `ScenarioSource` from a public question, or `null` when the question
 * carries no rich metadata (the surface then renders its polished text fallback).
 * The transported `presentation` blob IS the Quiz-compatible `metadata` object,
 * so it maps straight through — no bespoke visual schema.
 */
export function scenarioSourceFromPublicQuestion(
  question: PublicQuestionSource,
): QuizQuestion | null {
  const metadata = question.presentation;
  if (!metadata || typeof metadata !== "object") return null;
  return {
    id: question.questionId,
    category: question.category ?? "",
    question_text: question.prompt,
    format: "multiple_choice",
    choices: question.options,
    metadata,
  };
}
