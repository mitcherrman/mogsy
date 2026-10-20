/**
 * PM1 — a Practice run, projected into the canonical arena's view model.
 *
 * Practice has no match, opponent, clock, rating or settlement. It has a local
 * run (`Quiz.tsx`: questions, the index on stage, the player's choice and the
 * backend's grade for it), and this module turns exactly that into the pieces
 * `CanonicalArena` draws. It is pure: no fetch, no submission, no state.
 *
 * WHAT IT REUSES. The question member of the arena's surface union
 * (`ArenaQuestionSurface`, PPQ2-A) — the same member the Pro Play quiz uses,
 * built for "one server-graded question with no match around it". The stage,
 * the canonical answer grid, the reveal styling and the finite round strip are
 * all Ranked's own; nothing here draws.
 *
 * WHAT IT GUARANTEES.
 *  - Options are the served `choices`, in served order, keyed by index
 *    (`AnswerOptionView.id = String(index)`), exactly as Ranked keys options.
 *  - Nothing about correctness exists before the backend grades: `reveal`,
 *    `centralResult` and every outcome come only from `answerResult` /
 *    `sessionAnswers`, which are themselves the backend's responses.
 *  - A grade this client never received (a failed submit) is never shown as
 *    correct or incorrect: the stage reveals nothing and the run strip leaves
 *    that position unresolved.
 *  - Nothing names an opponent, a rating, a match or a Daily score.
 */
import type { QuizAnswerResult, QuizQuestion } from "@/lib/quiz/api";
import { projectRoundTimeline } from "@/lib/ranked-core/roundTimeline";
import {
  NO_INTERACTIONS,
  type AnswerOptionView,
  type InteractionPermissions,
  type QuestionView,
  type ResultKind,
  type RoundTimelineView,
} from "@/lib/ranked-core/viewTypes";
import type { ArenaHeaderView } from "@/lib/ranked-core/arenaView";
import type { SurfaceReveal } from "@/lib/question-surface/contract";

export const PRACTICE_ARENA_EYEBROW = "Leaguecraft Practice";

/**
 * The answer recorded when submission failed. `Quiz.tsx` lets the player
 * continue past a failed submit (it always has); this sentinel is what lets
 * the arena tell "the backend said wrong" from "the backend said nothing", so
 * the latter is never drawn as a verdict. Compared by identity.
 */
export const UNVERIFIED_ANSWER: QuizAnswerResult = Object.freeze({
  is_correct: false,
  correct_answer: "",
  explanation: "Could not verify answer. Please check your connection and try again.",
}) as QuizAnswerResult;

export function isUnverifiedAnswer(result: QuizAnswerResult | null): boolean {
  return result === UNVERIFIED_ANSWER;
}

type Choice = QuizQuestion["choices"][number];

function choiceLabel(choice: Choice): string {
  return typeof choice === "string" ? choice : choice.label;
}

function choiceImage(choice: Choice): string | null {
  if (typeof choice === "string") return null;
  const image = (choice as { image_path?: unknown }).image_path;
  return typeof image === "string" && image ? image : null;
}

/** Served choice order → neutral options. Labels and order are untouched. */
export function projectPracticeOptions(question: QuizQuestion): AnswerOptionView[] {
  return (question.choices ?? []).map((choice, index) => {
    const imagePath = choiceImage(choice);
    return {
      id: String(index),
      index,
      label: choiceLabel(choice),
      ...(imagePath ? { imagePath } : {}),
    };
  });
}

/** The neutral question view the canonical surface renders. Pre-answer only. */
export function projectPracticeQuestion(question: QuizQuestion): QuestionView {
  return {
    questionId: String(question.id),
    prompt: question.question_text ?? "",
    options: projectPracticeOptions(question),
    category: question.category || null,
  };
}

/**
 * A label the backend sent (the player's choice, or its `correct_answer`) →
 * the FIRST option carrying it, or null. Presentation lookup only.
 */
export function practiceOptionIdForLabel(
  question: QuizQuestion,
  label: string | null | undefined,
): string | null {
  if (!label) return null;
  const index = (question.choices ?? []).findIndex((c) => choiceLabel(c) === label);
  return index >= 0 ? String(index) : null;
}

const SELECTABLE: InteractionPermissions = Object.freeze({
  ...NO_INTERACTIONS,
  canSelectAnswer: true,
});

/** One received grade, at its position in the run (0-based). */
export interface PracticeOutcome {
  position: number;
  isCorrect: boolean;
}

export interface PracticeArenaInput {
  questions: readonly QuizQuestion[];
  /** The 0-based index of the question on stage. */
  currentIndex: number;
  /** The label the player chose for the question on stage, or null. */
  selectedAnswer: string | null;
  /** The backend's grade for the question on stage, or null. */
  answerResult: QuizAnswerResult | null;
  /** Every grade received this run, keyed by position. */
  outcomes: readonly PracticeOutcome[];
  /** The backend-confirmed correct count for this run. */
  score: number;
  /** The subject or set this run is drawn from ("Objectives", a set name). */
  subject: string | null;
}

export interface PracticeArenaSurfaceData {
  question: QuestionView;
  selectedOptionId: string | null;
  permissions: InteractionPermissions;
  reveal: SurfaceReveal | null;
  inputOpen: boolean;
}

export interface PracticeArenaProjection {
  header: ArenaHeaderView;
  surface: PracticeArenaSurfaceData | null;
  timeline: RoundTimelineView | null;
  /** Received verdicts keyed by 1-based question number. */
  outcomesByNumber: ReadonlyMap<number, "correct" | "incorrect">;
  /** Number of grades received. */
  answered: number;
  /** True once the backend has graded the question on stage. */
  graded: boolean;
  /** True when the submit for the question on stage failed. */
  unverified: boolean;
  /** True when the question on stage is the run's last. */
  isLast: boolean;
}

/** `+12 XP`, or null when the backend published no award. */
export function practiceXpLabel(result: QuizAnswerResult | null): string | null {
  if (!result || isUnverifiedAnswer(result)) return null;
  return typeof result.xp_earned === "number" ? `+${result.xp_earned} XP` : null;
}

function projectSurface(input: PracticeArenaInput): PracticeArenaSurfaceData | null {
  const question = input.questions[input.currentIndex];
  if (!question) return null;
  const result = input.answerResult;
  const graded = result !== null && !isUnverifiedAnswer(result);
  // Selecting IS answering: the window closes the moment a choice is made and
  // never reopens for this question, whatever the backend answers.
  const open = input.selectedAnswer === null && result === null;
  const reveal: SurfaceReveal | null = graded
    ? {
      revealed: true,
      isCorrect: result.is_correct,
      correctOptionId: practiceOptionIdForLabel(question, result.correct_answer),
      // Practice's explanation is drawn by its own reveal footer, beside Next,
      // with the pro-data source link — see `PracticeRevealFooter`.
      explanation: null,
    }
    : null;
  return {
    question: projectPracticeQuestion(question),
    selectedOptionId: practiceOptionIdForLabel(question, input.selectedAnswer),
    permissions: open ? SELECTABLE : NO_INTERACTIONS,
    reveal,
    inputOpen: open,
  };
}

function projectHeader(input: PracticeArenaInput, answered: number): ArenaHeaderView {
  const total = input.questions.length;
  const question = input.questions[input.currentIndex];
  const result = input.answerResult;
  const graded = result !== null && !isUnverifiedAnswer(result);
  const xp = practiceXpLabel(result);
  return {
    eyebrow: input.subject ? `Practice · ${input.subject}` : PRACTICE_ARENA_EYEBROW,
    title: question ? `Question ${input.currentIndex + 1} / ${total}` : "Preparing questions…",
    // Below `lg` the run panel is hidden; the header carries the score there.
    titleDetail: answered > 0 ? `${input.score} correct` : null,
    transitionNote: null,
    playtestNote: null,
    presenceNote: null,
    timer: null,
    timerLabel: "",
    // The header's focal display shows the viewer's graded result — the same
    // face Ranked uses — and nothing before the backend has graded.
    centralResult: graded
      ? { verdict: result.is_correct ? "CORRECT" : "INCORRECT", points: xp ?? "PRACTICE" }
      : null,
  };
}

function projectTimeline(
  input: PracticeArenaInput,
  outcomes: ReadonlyMap<number, ResultKind>,
): RoundTimelineView | null {
  const total = input.questions.length;
  if (total <= 0) return null;
  const roundNumber = input.currentIndex + 1;
  return projectRoundTimeline({
    roundNumber,
    // The question on stage stays the current node until Next mounts the next
    // one, revealed or not (PPQ2-E's rule for the same strip).
    completedRounds: input.currentIndex,
    segmentRoundNumber: roundNumber,
    settlements: [],
    viewerSlot: "p1",
    totalRounds: total,
    outcomes,
  });
}

export function projectPracticeArena(input: PracticeArenaInput): PracticeArenaProjection {
  const byNumber = new Map<number, "correct" | "incorrect">();
  for (const o of input.outcomes) {
    byNumber.set(o.position + 1, o.isCorrect ? "correct" : "incorrect");
  }
  const result = input.answerResult;
  return {
    header: projectHeader(input, byNumber.size),
    surface: projectSurface(input),
    timeline: projectTimeline(input, byNumber),
    outcomesByNumber: byNumber,
    answered: byNumber.size,
    graded: result !== null && !isUnverifiedAnswer(result),
    unverified: isUnverifiedAnswer(result),
    isLast: input.currentIndex + 1 >= input.questions.length,
  };
}
