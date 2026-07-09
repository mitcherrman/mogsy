/**
 * Input data shapes for the Remotion quiz-video pipeline.
 *
 * Kept deliberately close to the live QuizQuestion shape from
 * `src/lib/quiz/api.ts` so a playlist exported from the Broadcast Studio
 * (or straight from the backend) maps onto video input with minimal
 * massaging — but this module never imports browser-coupled code.
 */

export type QuizVideoChoice = string;

export type QuizVideoQuestion = {
  id: string | number;
  question: string;
  choices: QuizVideoChoice[];
  /** Index into `choices`. Preferred over correct_answer when both given. */
  correct_index?: number;
  /** Exact text of the correct choice (fallback when correct_index absent). */
  correct_answer?: string;
  explanation?: string;
  category?: string;
  difficulty?: number;
  champion_name?: string;
  item_name?: string;
  ability_name?: string;
  patch?: string;
  /** Optional per-question timing overrides, in seconds. */
  durations?: Partial<QuizSegmentSeconds>;
};

/** Per-question segment lengths, in seconds. */
export type QuizSegmentSeconds = {
  /** Question text alone on screen. */
  question: number;
  /** Choices visible + countdown running (thinking time). */
  countdown: number;
  /** Correct answer highlighted. */
  reveal: number;
  /** Explanation card (skipped automatically when no explanation text). */
  explanation: number;
  /** Slide-out / next-question gap. */
  transition: number;
};

export type QuizVideoData = {
  title: string;
  subtitle?: string;
  /** Shown in the footer, e.g. "mogsy.net/quiz". */
  website?: string;
  patch?: string;
  /** Intro title-card length in seconds. */
  intro_seconds?: number;
  /** Outro card length in seconds. */
  outro_seconds?: number;
  /** Default segment lengths; individual questions may override. */
  default_durations?: Partial<QuizSegmentSeconds>;
  questions: QuizVideoQuestion[];
};

export const DEFAULT_SEGMENTS: QuizSegmentSeconds = {
  question: 4,
  countdown: 8,
  reveal: 3,
  explanation: 5,
  transition: 1,
};

export const DEFAULT_INTRO_SECONDS = 4;
export const DEFAULT_OUTRO_SECONDS = 4;

/** Resolve the correct-choice index for a question (correct_index wins). */
export function resolveCorrectIndex(q: QuizVideoQuestion): number {
  if (
    typeof q.correct_index === "number" &&
    q.correct_index >= 0 &&
    q.correct_index < q.choices.length
  ) {
    return q.correct_index;
  }
  if (q.correct_answer) {
    const norm = (s: string) => s.trim().toLowerCase();
    const idx = q.choices.findIndex((c) => norm(c) === norm(q.correct_answer!));
    if (idx >= 0) return idx;
  }
  return -1; // unknown — scene renders reveal without a highlight
}
