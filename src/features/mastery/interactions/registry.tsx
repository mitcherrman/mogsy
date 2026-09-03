/**
 * Mastery interaction dispatcher (Phase 4C1).
 *
 * Routes a parsed `MasteryPlayerQuestion` to its renderer by
 * `question.interactionKind`. This is the seam that lets Phase 4C2 add a
 * comparison renderer later without a new page or a new runtime — adding a
 * case here is additive, exactly like the backend `mastery.manifest`
 * candidate-source dispatch it mirrors.
 *
 * `legacy_combat` renders through the EXISTING two-champion combat-state
 * components unchanged (`features/mastery/player/MasteryQuestionView` /
 * `MasteryRevealView`); this module only narrows the type after checking
 * `state`/`matchupIdentity` are actually present (they always are for a
 * `legacy_combat` question — this is a defensive fail-closed check, not a
 * relaxation of the contract).
 *
 * `atomic_recall` renders through the new one-champion recall components.
 *
 * Any OTHER value — including a future kind this build does not know about
 * yet — throws `MasteryUnsupportedInteractionError` explicitly. It never
 * falls through to a default renderer, which is exactly what would let a
 * future interaction kind silently mis-render as the wrong UI.
 */
import type { MasteryInteractionKind } from "../contracts/common";
import type {
  LegacyMasteryPlayerQuestion,
  MasteryPlayerQuestion,
} from "../contracts/playerQuestion";
import type {
  LegacyMasteryPlayerReveal,
  MasteryPlayerReveal,
} from "../contracts/playerReveal";
import { MasteryQuestionView } from "../player/MasteryQuestionView";
import { MasteryRevealView } from "../player/MasteryRevealView";
import type { PlayerAnswer } from "../player/useMasteryFixtureSession";
import { AtomicRecallQuestionView } from "./AtomicRecallQuestionView";
import { AtomicRecallRevealView } from "./AtomicRecallRevealView";
import { ComparisonQuestionView } from "./ComparisonQuestionView";
import { ComparisonRevealView } from "./ComparisonRevealView";
import type { MasteryQuestionReveal } from "./revealState";

export class MasteryUnsupportedInteractionError extends Error {
  readonly interactionKind: string;
  constructor(interactionKind: string) {
    super(`Mastery interaction dispatch: unsupported interaction kind "${interactionKind}"`);
    this.name = "MasteryUnsupportedInteractionError";
    this.interactionKind = interactionKind;
  }
}

function asLegacyQuestion(question: MasteryPlayerQuestion): LegacyMasteryPlayerQuestion {
  if (!question.state || !question.matchupIdentity) {
    throw new MasteryUnsupportedInteractionError(
      `legacy_combat question ${question.sequenceIndex} is missing state or matchupIdentity`,
    );
  }
  return question as LegacyMasteryPlayerQuestion;
}

function asLegacyReveal(reveal: MasteryPlayerReveal): LegacyMasteryPlayerReveal {
  if (!reveal.beforeState || !reveal.afterState) {
    throw new MasteryUnsupportedInteractionError(
      `legacy_combat reveal ${reveal.sequenceIndex} is missing beforeState or afterState`,
    );
  }
  return reveal as LegacyMasteryPlayerReveal;
}

export interface MasteryQuestionDispatchProps {
  readonly question: MasteryPlayerQuestion;
  readonly total: number;
  readonly submitting: boolean;
  readonly onSubmit: (answer: PlayerAnswer) => void;
  /**
   * In-place reveal for a MODERN interaction (`atomic_recall` /
   * `comparison_left_right`): the question stays mounted and renders its own
   * graded state rather than being swapped for a separate reveal screen.
   *
   * `legacy_combat` ignores it entirely and keeps its existing two-screen
   * question -> `MasteryRevealView` flow, which this task deliberately does
   * not touch — that path has its own combat before/after state to show and is
   * scheduled for a separate audit.
   */
  readonly reveal?: MasteryQuestionReveal | null;
}

/** Dispatches the question screen by `question.interactionKind`. */
export function MasteryQuestionDispatch({
  question,
  total,
  submitting,
  onSubmit,
  reveal = null,
}: MasteryQuestionDispatchProps) {
  const kind: MasteryInteractionKind = question.interactionKind;
  switch (kind) {
    case "legacy_combat":
      return (
        <MasteryQuestionView
          question={asLegacyQuestion(question)}
          total={total}
          submitting={submitting}
          onSubmit={onSubmit}
        />
      );
    case "atomic_recall":
      return (
        <AtomicRecallQuestionView
          question={question}
          total={total}
          submitting={submitting}
          onSubmit={onSubmit}
          reveal={reveal}
        />
      );
    case "comparison_left_right":
      return (
        <ComparisonQuestionView
          question={question}
          total={total}
          submitting={submitting}
          onSubmit={onSubmit}
          reveal={reveal}
        />
      );
    default: {
      const exhaustive: never = kind;
      throw new MasteryUnsupportedInteractionError(exhaustive as unknown as string);
    }
  }
}

export interface MasteryRevealDispatchProps {
  readonly question: MasteryPlayerQuestion;
  readonly reveal: MasteryPlayerReveal;
  readonly submittedAnswer: PlayerAnswer | null;
  readonly isFinal: boolean;
  readonly onNext: () => void;
}

/** Dispatches the reveal screen by `question.interactionKind`. */
export function MasteryRevealDispatch({
  question,
  reveal,
  submittedAnswer,
  isFinal,
  onNext,
}: MasteryRevealDispatchProps) {
  const kind: MasteryInteractionKind = question.interactionKind;
  switch (kind) {
    case "legacy_combat":
      return (
        <MasteryRevealView
          question={asLegacyQuestion(question)}
          reveal={asLegacyReveal(reveal)}
          submittedAnswer={submittedAnswer}
          isFinal={isFinal}
          onNext={onNext}
        />
      );
    case "atomic_recall":
      return (
        <AtomicRecallRevealView
          question={question}
          reveal={reveal}
          submittedAnswer={submittedAnswer}
          isFinal={isFinal}
          onNext={onNext}
        />
      );
    case "comparison_left_right":
      return (
        <ComparisonRevealView
          question={question}
          reveal={reveal}
          submittedAnswer={submittedAnswer}
          isFinal={isFinal}
          onNext={onNext}
        />
      );
    default: {
      const exhaustive: never = kind;
      throw new MasteryUnsupportedInteractionError(exhaustive as unknown as string);
    }
  }
}
