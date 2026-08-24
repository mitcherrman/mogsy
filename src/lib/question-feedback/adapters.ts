/**
 * RG3 — the four adapters into `ResolvedFeedback`.
 *
 * Each one is a pure translation of ONE backend payload. They exist so that the
 * disclosure rule is stated once per surface, next to the payload that carries
 * it, instead of being re-derived inside a component that also has layout to
 * worry about.
 *
 * Every adapter ends by passing its result through `sealed`, which strips
 * answer-bearing fields from anything whose disclosure is not open. That is
 * belt and braces — none of them populates those fields early — and it is the
 * reason a future adapter written in a hurry is a bug rather than a leak.
 */
import type { SettledCardReveal } from "@/lib/ranked-public/contracts";
import type {
  QuestionView,
  ResolvedCombatantView,
  ResolvedRoundView,
} from "@/lib/ranked-core/viewTypes";
import { conciseEvidence, optionalExplanationText } from "./evidence";
import type { FrozenExplanation } from "./evidence";
import {
  NO_FEEDBACK,
  sealed,
  type FeedbackVerdict,
  type ResolvedFeedback,
} from "./model";

/** The settlement's outcome vocabulary, in this model's words. */
function verdictOf(outcome: ResolvedCombatantView["outcome"]): FeedbackVerdict {
  return outcome === "timed_out" ? "timeout" : outcome;
}

// ─────────────────────────────────────────── Ranked, a normal quiz round

/**
 * A settled Ranked round, from the viewer's side.
 *
 * Ranked has no retry: a round settles once, for both players, and the
 * disclosure opens with it. So `resolved`, `disclosureAllowed` and "the score
 * is locked" are the same fact here, and the interesting states — the ones the
 * Daily has — simply do not arise.
 *
 * `correctOptionIndex` is null on a segment round and on any index that does
 * not address the frozen option list (the settlement adapter validates it
 * against the projection's own option count). A null there means the tablets
 * stay unresolved, which is what a client with nothing authoritative to say
 * should do.
 */
export function feedbackFromRankedRound({
  settlement,
  viewer,
  question,
  selectedOptionId,
  explanation,
}: {
  settlement: ResolvedRoundView | null;
  viewer: ResolvedCombatantView | null;
  question: QuestionView | null;
  selectedOptionId: string | null;
  /**
   * Override for the round's frozen review material. Omit it: the settlement
   * already carries `questionExplanation`, and reading it from there is what
   * makes the evidence and the correct option come from ONE payload rather
   * than from two arguments a caller could pair up wrongly.
   */
  explanation?: FrozenExplanation | null;
}): ResolvedFeedback {
  if (!settlement || !viewer) return NO_FEEDBACK;
  const material = explanation ?? (settlement.questionExplanation as
    FrozenExplanation | null);
  const correct =
    settlement.correctOptionIndex === null
      ? null
      : (question?.options.find((o) => o.index === settlement.correctOptionIndex)
          ?.id ?? null);
  return sealed({
    ...NO_FEEDBACK,
    verdict: verdictOf(viewer.outcome),
    resolved: true,
    disclosureAllowed: true,
    retryAvailable: false,
    scoreLocked: true,
    selectedOptionId,
    correctOptionId: correct,
    eliminatedOptionIds: [],
    evidence: conciseEvidence(material),
    explanationOptional: optionalExplanationText(material),
  });
}

// ─────────────────────────────────────── Meta Reflex, one settled card

/**
 * One Meta Reflex card the viewer has FINISHED, in Ranked or the Daily.
 *
 * A reflex card is terminal after a single tap or a single expiry — there is no
 * second attempt to protect — so a settled card is a disclosed card, and the
 * two products differ only in which payload delivers it. Ranked ships it on the
 * live segment state (`own_card_reveals`); the Daily ships it on the resolved
 * card (`reveal`). Both are adapted here so the two can never word a comparison
 * differently.
 *
 * The option ids are the card's own POSITIONAL tokens (`c2:left`), which is
 * what the player answered with. Nothing is matched by entity name.
 */
export function feedbackFromMetaReflexCard(
  reveal: SettledCardReveal | null | undefined,
): ResolvedFeedback {
  if (!reveal) return NO_FEEDBACK;
  const verdict: FeedbackVerdict | null =
    reveal.outcome === "correct"
      ? "correct"
      : reveal.outcome === "incorrect"
        ? "incorrect"
        : reveal.outcome === "timeout"
          ? "timeout"
          // "unanswered": settled with neither an attempt nor an expiry. There
          // is nothing to judge, so no verdict is shown — inventing one would
          // be the surface making a ruling the server declined to make.
          : null;
  const winner =
    reveal.correctCardId === null
      ? null
      : reveal.correctCardId.endsWith(":left")
        ? ("left" as const)
        : ("right" as const);
  return sealed({
    ...NO_FEEDBACK,
    verdict,
    resolved: true,
    disclosureAllowed: true,
    retryAvailable: false,
    scoreLocked: true,
    selectedOptionId: reveal.selectedCardId,
    correctOptionId: reveal.correctCardId,
    eliminatedOptionIds: [],
    evidence: {
      kind: "comparison",
      left: { label: reveal.left.label, valueDisplay: reveal.left.valueDisplay },
      right: { label: reveal.right.label, valueDisplay: reveal.right.valueDisplay },
      winner,
    },
    explanationOptional: null,
  });
}

// ───────────────────────────────────────────── Daily Challenge, a card

/**
 * The Daily card shape this adapter reads, named structurally rather than
 * imported: the Daily's own transport reader is not on this branch yet, and a
 * feedback model that only compiled once it landed would be the wrong
 * dependency direction. Every field below is one the DC1 Phase 3 response
 * models already publish (`schemas/daily_challenge_schemas.py`).
 */
export interface DailyCardFeedbackSource {
  resolved: boolean;
  score_locked: boolean;
  score_outcome: "correct" | "wrong_answer" | "timeout" | null;
  eliminated: number[];
  options: { index: number }[];
  /** Resolved cards only. */
  correct_index?: number;
  explanation?: string | null;
  attempts?: { selected_index: number; is_correct: boolean }[];
  reveal?: {
    left_label?: string | null;
    right_label?: string | null;
    left_value_display?: string | null;
    right_value_display?: string | null;
    correct_entity_id?: string | null;
    left_entity_id?: string | null;
    right_entity_id?: string | null;
  } | null;
}

const DAILY_VERDICT: Record<string, FeedbackVerdict> = {
  correct: "correct",
  wrong_answer: "incorrect",
  timeout: "timeout",
};

/**
 * One Daily card — and THE reason this model exists.
 *
 * The Daily is the only surface where "the player's scored attempt is over" and
 * "the player may be told the answer" come apart, and it is the case a
 * mode-shaped design gets wrong. A first miss produces:
 *
 *     verdict: "incorrect"      the player chose it; they know
 *     scoreLocked: true         say so, or the frozen score reads as a bug
 *     eliminatedOptionIds       strike out what they tried
 *     disclosureAllowed: false  and NOTHING else
 *     retryAvailable: true      the card is still theirs to solve
 *
 * `disclosureAllowed` follows `resolved` and never `score_locked`, which is the
 * same rule the backend's projection gate uses — so the client cannot decide to
 * disclose something the payload was careful not to send, and cannot withhold
 * something it did.
 *
 * `selectedOptionId` comes from the ATTEMPT TRAIL, which the backend publishes
 * only on a resolved card; before that the eliminated set is the only record of
 * what was tried, and it is already rendered as the strike-outs.
 */
export function feedbackFromDailyCard(
  card: DailyCardFeedbackSource | null | undefined,
): ResolvedFeedback {
  if (!card) return NO_FEEDBACK;
  const resolved = card.resolved === true;
  const eliminated = (card.eliminated ?? []).map(String);
  const firstAttempt = card.attempts?.[0] ?? null;
  const values = card.reveal ?? null;
  const hasComparison =
    resolved
    && values !== null
    && (values.left_value_display != null || values.right_value_display != null
        || values.left_label != null || values.right_label != null);

  return sealed({
    ...NO_FEEDBACK,
    verdict: card.score_outcome ? (DAILY_VERDICT[card.score_outcome] ?? null) : null,
    resolved,
    disclosureAllowed: resolved,
    // A resolved card is finished; an unresolved one is still playable even
    // once its score is spent — that IS the learning phase.
    retryAvailable: !resolved,
    scoreLocked: card.score_locked === true,
    selectedOptionId:
      resolved && firstAttempt ? String(firstAttempt.selected_index) : null,
    correctOptionId:
      resolved && typeof card.correct_index === "number"
        ? String(card.correct_index)
        : null,
    eliminatedOptionIds: eliminated,
    evidence: hasComparison
      ? {
          kind: "comparison",
          left: {
            label: values!.left_label ?? null,
            valueDisplay: values!.left_value_display ?? null,
          },
          right: {
            label: values!.right_label ?? null,
            valueDisplay: values!.right_value_display ?? null,
          },
          winner:
            values!.correct_entity_id == null
              ? null
              : values!.correct_entity_id === values!.left_entity_id
                ? "left"
                : values!.correct_entity_id === values!.right_entity_id
                  ? "right"
                  : null,
        }
      : null,
    // The Daily's explanation is already a single reviewed sentence rather
    // than a worked solution, so it needs no distilling — but it is still
    // SECONDARY: the beat renders the verdict and the answer, and a surface
    // with room may offer this.
    explanationOptional: resolved ? (card.explanation ?? null) : null,
  });
}
