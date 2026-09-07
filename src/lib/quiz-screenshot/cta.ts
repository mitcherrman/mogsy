/**
 * CON1 Step 4 — the engagement prompt printed on a QUESTION card, and the
 * brand copy printed around every card.
 *
 * Pure module: no DOM, no fetch. The render harness reads it, the CTA test
 * reads it, and the capture gate reads the same constants it exports — so
 * "the card asks for something the question cannot answer" is a unit test
 * rather than a thing someone notices in a published PNG.
 *
 * ### Why this exists at all
 *
 * The prompt used to be one hardcoded string, `Comment A, B, C, or D`, printed
 * on every question regardless of how many options it had. A two-option Pro
 * Play question shipped asking readers to comment C or D. The letters are
 * derived from the option count now, and past the point where reciting letters
 * helps a reader they are dropped for a plain ask.
 *
 * ### Why the letters are kept at all
 *
 * They are not decoration: the answer tablets are lettered A/B/C/D, so a
 * comment thread of single letters is legible without quoting the question.
 * That only holds while a reader can hold the list in their head, which is why
 * the enumerated form stops at four.
 */

/** The greatest option count for which the prompt still recites the letters. */
export const MAX_ENUMERATED_OPTIONS = 4;

/** The ask used when the letters are not worth reciting. */
export const GENERIC_ANSWER_PROMPT = "Comment your answer";

/**
 * The engagement prompt for a question with `optionCount` options.
 *
 * 2 → "Comment A or B"; 3 → "Comment A, B, or C"; 4 → "Comment A, B, C, or D";
 * anything else → the generic ask. A count below 2 is not a question the
 * factory can render at all (`adaptScreenshotQuestion` refuses it upstream),
 * and is handled here rather than trusted, because a prompt is not the place
 * to discover a malformed row.
 */
export function answerPromptCopy(optionCount: number): string {
  if (
    !Number.isInteger(optionCount) ||
    optionCount < 2 ||
    optionCount > MAX_ENUMERATED_OPTIONS
  ) {
    return GENERIC_ANSWER_PROMPT;
  }
  const letters = Array.from({ length: optionCount }, (_, i) =>
    String.fromCharCode(65 + i),
  );
  const last = letters.pop()!;
  // Two options take no comma: "A or B", not "A, or B".
  const head = letters.join(", ");
  return optionCount === 2 ? `Comment ${head} or ${last}` : `Comment ${head}, or ${last}`;
}

/**
 * The line printed under a REVEAL card. A reveal has already answered the
 * question, so asking for a comment there is asking for nothing; it invites
 * the next one instead.
 */
export const REVEAL_PROMPT = "More like this at";

/** The line printed under a QUESTION card, above the domain. */
export const QUESTION_PROMPT = "Play more LoL quizzes at";
