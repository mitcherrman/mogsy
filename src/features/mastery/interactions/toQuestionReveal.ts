/**
 * Build a modern question's in-place reveal from the STANDALONE Mastery
 * session payload (`MasteryPlayerReveal`).
 *
 * The Ranked surface has its own adapter over `own_challenge_reveals`; both
 * produce the same `MasteryQuestionReveal`, which is what lets the two
 * renderers behave identically on either surface without either of them
 * learning a transport.
 *
 * Correctness is read from `authoritativeCorrectness` and nowhere else. Values
 * are the backend's own formatting, passed through: the precise canonical
 * value a rounded multiple-choice option stands for already arrives in
 * `explanation` under the existing Mastery numeric policy, so nothing here
 * re-rounds, re-derives or re-compares anything.
 */
import type { MasteryPlayerQuestion } from "../contracts/playerQuestion";
import type { MasteryPlayerReveal } from "../contracts/playerReveal";
import { COMPARISON_TIE_TOKEN } from "./ComparisonQuestionView";
import type { MasteryQuestionReveal } from "./revealState";

/**
 * The player-facing label for a wire answer value.
 *
 * A comparison's options are champion ids and the composer's tie token, which
 * are not what the player was offered — so they are mapped back through the
 * SAME positional lookup the question view used. Every other interaction's
 * option values are already their own labels.
 */
function labelFor(question: MasteryPlayerQuestion, raw: string): string {
  if (question.interactionKind !== "comparison_left_right") return raw;
  const cs = question.comparisonSemantics;
  if (!cs) return raw;
  const [a, b] = question.answerOptions;
  if (raw === COMPARISON_TIE_TOKEN) return "Tie / Same";
  if (raw === a) return cs.championADisplay;
  if (raw === b) return cs.championBDisplay;
  return raw;
}

function withUnit(question: MasteryPlayerQuestion, label: string): string {
  const unit = question.inputConstraints?.unit;
  return unit ? `${label} ${unit}` : label;
}

export function toQuestionReveal(
  question: MasteryPlayerQuestion,
  reveal: MasteryPlayerReveal,
  submittedAnswer: unknown,
): MasteryQuestionReveal {
  const correctValue = String(reveal.correctAnswer);
  const submitted = submittedAnswer ?? reveal.playerAnswer;
  const answerLabel = question.interactionKind === "comparison_left_right"
    ? labelFor(question, correctValue)
    // Backend-formatted at the precision it grades at, exactly as the previous
    // reveal screen showed it.
    : withUnit(question, reveal.correctAnswerDisplay ?? correctValue);
  return {
    correct: reveal.authoritativeCorrectness,
    correctValue,
    selectedValue: submitted === null || submitted === undefined
      ? null : String(submitted),
    answerLabel,
    explanation: reveal.explanation ?? null,
  };
}
