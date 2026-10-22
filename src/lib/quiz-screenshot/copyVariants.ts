/**
 * Copy variants currently wired into the slide components, recorded in every
 * run manifest for reproducibility — changing slide copy should bump these.
 *
 * Pure module so the Playwright generator (`scripts/quiz-screenshots/generate.ts`,
 * which re-exports it) and the browser export (`./browserRun.ts`) record the
 * SAME table rather than two copies that can drift.
 */
export const COPY_VARIANTS: Record<string, string> = {
  // CON1 Step 4: the question prompt is derived from the option count
  // (src/lib/quiz-screenshot/cta.ts) rather than the constant "Comment A, B,
  // C, or D" the previous id named.
  question_cta: "comment-by-option-count-v1",
  app_cta: "prove-it-v2",
  community: "stack-up-v2",
  challenge_opening: "test-your-knowledge-v1",
  challenge_ending: "how-did-you-do-v1",
  /** CON1 Step 4: the academy shell + type-set Mogzy wordmark. */
  shell: "mogzy-academy-v1",
};
