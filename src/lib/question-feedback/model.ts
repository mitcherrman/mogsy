/**
 * RG3 — THE resolved-answer feedback model.
 *
 * Four surfaces have to tell a player the same three things — what their answer
 * was worth, what the answer actually was, and why — and until now each of them
 * decided that on its own:
 *
 *   Ranked quiz round        the arena's top result beat + the answer tablets
 *   Ranked Meta Reflex card  nothing at all; the block's transcript, later
 *   Daily quiz card          a retry mechanic that must NOT disclose yet
 *   Daily Meta Reflex card   the card's own `reveal` block
 *
 * This module is the one shape all four adapt INTO. It is deliberately not a
 * renderer and not a transport: it is the vocabulary the renderers agree on, so
 * that "the answer is disclosed" means the same thing in the arena as it does
 * in the Daily, and so that adding a fifth surface adds an adapter rather than
 * a fifth opinion.
 *
 * THE STATE THAT MATTERS IS NOT THE MODE
 * ──────────────────────────────────────
 * The Daily's retry rule looks like a mode difference and is not. A first miss
 * on a Daily card is a card whose SCORE is settled and whose ANSWER is not, and
 * that is a state — `resolved: false, scoreLocked: true` — which any surface
 * could in principle produce. So nothing here branches on which product it came
 * from; the renderers key off `disclosureAllowed`, and the backend gate that
 * decides it (`resolved`, never `score_locked`) is the same one that decides
 * whether the payload carried an answer at all.
 *
 * NOTHING IS COMPUTED HERE
 * ────────────────────────
 * Every field is copied from a backend-authoritative payload. In particular the
 * verdict is the server's word, the correct option is the server's index, and
 * a comparison's two values are the strings the server formatted from the
 * numbers it actually compared. A frontend that re-derived any of them could
 * disagree with the score it is standing next to.
 */

/**
 * What happened to the player's scored attempt.
 *
 * Three cases, and `timeout` is genuinely its own: a player who ran out of
 * clock did not answer wrongly, and telling them they did is both false and
 * the kind of small lie a player notices. `unanswered` is the fourth state a
 * payload can describe — a card that is settled with no attempt and no expiry
 * — and it is deliberately NOT a verdict: there is nothing to judge, so it maps
 * to `null` and the surface shows no verdict line.
 */
export type FeedbackVerdict = "correct" | "incorrect" | "timeout";

/** One side of a two-way comparison, as the server described it. */
export interface ComparisonSide {
  /** The entity's display name. Null only where the payload had none. */
  label: string | null;
  /**
   * The compared value, ALREADY FORMATTED by the backend ("3,200 gold",
   * "66 AD", "Ranged"). Null means this card compared nothing — a recognition
   * card — and a renderer must reserve no room for it rather than print an
   * empty string, which would read as a missing value instead of no value.
   */
  valueDisplay: string | null;
}

/**
 * The evidence beside a verdict. Two shapes, because two shapes are what the
 * backends actually hold:
 *
 *  - `comparison` — a Meta Reflex card. Both operands, both values, and which
 *    side won. This IS the question, so it always renders.
 *  - `statement`  — a normal question. One short factual line distilled from
 *    the round's frozen review material. Optional by nature: most questions
 *    carry none, and inventing one would be authoring gameplay text.
 */
export type FeedbackEvidence =
  | {
      kind: "comparison";
      left: ComparisonSide;
      right: ComparisonSide;
      /** The side the server ruled correct; null if the payload did not say. */
      winner: "left" | "right" | null;
    }
  | { kind: "statement"; text: string };

/**
 * One resolved (or deliberately unresolved) answer, as any surface may draw it.
 */
export interface ResolvedFeedback {
  /**
   * The scored verdict, or null when there is nothing to judge yet.
   *
   * Present on an UNRESOLVED Daily card as well: a first miss is a settled
   * scored attempt, and the player is entitled to be told they missed. What
   * they are not told is what the answer was — which is `disclosureAllowed`,
   * a separate field on purpose.
   */
  verdict: FeedbackVerdict | null;
  /** Whether the card/round is finished. The backend's own `resolved`. */
  resolved: boolean;
  /**
   * MAY the answer be shown? The single condition every renderer reads.
   *
   * Never inferred from `verdict`: "you were wrong" and "here is the right one"
   * are different disclosures, and the Daily's retry mechanic exists precisely
   * in the gap between them.
   */
  disclosureAllowed: boolean;
  /** Whether the player may still attempt this card. */
  retryAvailable: boolean;
  /** Whether the scored attempt is spent, however it ended. */
  scoreLocked: boolean;
  /** The option the player chose, or null (no attempt / expired). */
  selectedOptionId: string | null;
  /** The right option — ONLY ever non-null when `disclosureAllowed`. */
  correctOptionId: string | null;
  /** Options struck out by earlier wrong attempts. Ordered, may be empty. */
  eliminatedOptionIds: string[];
  /** Concise factual evidence, or null when the payload holds none. */
  evidence: FeedbackEvidence | null;
  /**
   * Longer material the payload happened to carry, for a SECONDARY surface
   * (a post-match review, a study ledger). Never part of the answer beat: the
   * loop is meant to stay fast, and a paragraph in the middle of it is the
   * thing RG3 exists to not bring back.
   */
  explanationOptional: string | null;
}

/** Everything closed and nothing known — the safe default while loading. */
export const NO_FEEDBACK: ResolvedFeedback = Object.freeze({
  verdict: null,
  resolved: false,
  disclosureAllowed: false,
  retryAvailable: false,
  scoreLocked: false,
  selectedOptionId: null,
  correctOptionId: null,
  eliminatedOptionIds: Object.freeze([]) as unknown as string[],
  evidence: null,
  explanationOptional: null,
});

/** The verdict headline. One vocabulary, so no two surfaces word it apart. */
export const VERDICT_HEADLINE: Record<FeedbackVerdict, string> = {
  correct: "Correct!",
  incorrect: "Incorrect",
  timeout: "Time!",
};

/**
 * Fail closed: strip anything answer-bearing from a feedback object whose
 * disclosure is not open.
 *
 * Defence in depth, and cheap. The adapters below already refuse to populate
 * these fields before disclosure, and this is what makes a future adapter that
 * forgets a harmless bug rather than a leak. It is applied at the END of every
 * adapter rather than trusted to be unnecessary.
 */
export function sealed(feedback: ResolvedFeedback): ResolvedFeedback {
  if (feedback.disclosureAllowed) return feedback;
  return {
    ...feedback,
    correctOptionId: null,
    evidence: null,
    explanationOptional: null,
  };
}
