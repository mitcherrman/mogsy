/**
 * Post-submission player-reveal contract (G5.2A).
 *
 * A reveal is served only AFTER the backend records the player's submission or a
 * timeout. It legitimately carries the correct answer, explanation, calculation
 * steps, before/after state, and applied/proposed transitions — all as
 * backend-authoritative pass-through data. The frontend renders these values and
 * NEVER recomputes correctness or any calculation.
 */

import {
  MasteryQuestionFamily,
  arr,
  bool,
  intIndex,
  nonEmptyStr,
  num,
  oneOf,
  rec,
  scalar,
  str,
} from "./common";
import {
  MasteryArtifactDigest,
  MasteryDisplayRevision,
  MasterySessionId,
  MasterySetId,
  artifactDigest,
  displayRevision,
  masterySetId,
  sessionId,
} from "./ids";
import { MasteryStateView, readStateView } from "./stateView";
import { MasteryTransitionView, readOptionalTransitionView } from "./transitionView";

export interface MasteryCalculationStep {
  readonly order: number;
  readonly description: string;
  readonly expression: string;
  readonly result: number;
}

export interface MasterySourceSummary {
  readonly label: string;
  readonly sourceCount: number;
}

export interface MasteryRevealCompletionState {
  readonly isFinalStep: boolean;
  readonly setCompleted: boolean;
}

export interface MasteryPlayerReveal {
  readonly sessionId: MasterySessionId;
  readonly masterySetId: MasterySetId;
  readonly artifactDigest: MasteryArtifactDigest;
  readonly displayRevision: MasteryDisplayRevision;
  readonly sequenceIndex: number;
  readonly questionFamily: MasteryQuestionFamily;
  readonly playerAnswer: string | number | boolean;
  readonly authoritativeCorrectness: boolean;
  readonly correctAnswer: string | number | boolean;
  readonly explanation: string;
  readonly calculationSteps: readonly MasteryCalculationStep[];
  readonly beforeState: MasteryStateView;
  readonly afterState: MasteryStateView;
  readonly appliedTransition: MasteryTransitionView | null;
  readonly proposedTransition: MasteryTransitionView | null;
  readonly sourceSummary: MasterySourceSummary;
  readonly nextStepReady: boolean;
  readonly completionState: MasteryRevealCompletionState;
}

function readCalcStep(value: unknown, label: string): MasteryCalculationStep {
  const s = rec(value, label);
  return {
    order: intIndex(s.order, `${label}.order`),
    description: str(s.description, `${label}.description`),
    expression: str(s.expression, `${label}.expression`),
    result: num(s.result, `${label}.result`),
  };
}

function readSourceSummary(value: unknown, label: string): MasterySourceSummary {
  const s = rec(value, label);
  return {
    label: str(s.label, `${label}.label`),
    sourceCount: intIndex(s.source_count, `${label}.source_count`),
  };
}

function readCompletion(value: unknown, label: string): MasteryRevealCompletionState {
  const c = rec(value, label);
  return {
    isFinalStep: bool(c.is_final_step, `${label}.is_final_step`),
    setCompleted: bool(c.set_completed, `${label}.set_completed`),
  };
}

export function readPlayerReveal(value: unknown, label = "data"): MasteryPlayerReveal {
  const d = rec(value, label);
  const steps = arr(d.calculation_steps, `${label}.calculation_steps`);
  return {
    sessionId: sessionId(d.session_id, `${label}.session_id`),
    masterySetId: masterySetId(d.mastery_set_id, `${label}.mastery_set_id`),
    artifactDigest: artifactDigest(d.artifact_digest, `${label}.artifact_digest`),
    displayRevision: displayRevision(d.display_revision, `${label}.display_revision`),
    sequenceIndex: intIndex(d.sequence_index, `${label}.sequence_index`),
    questionFamily: nonEmptyStr(d.question_family, `${label}.question_family`),
    playerAnswer: scalar(d.player_answer, `${label}.player_answer`),
    authoritativeCorrectness: bool(d.authoritative_correctness, `${label}.authoritative_correctness`),
    correctAnswer: scalar(d.correct_answer, `${label}.correct_answer`),
    explanation: str(d.explanation, `${label}.explanation`),
    calculationSteps: steps.map((s, i) => readCalcStep(s, `${label}.calculation_steps[${i}]`)),
    beforeState: readStateView(d.before_state, `${label}.before_state`),
    afterState: readStateView(d.after_state, `${label}.after_state`),
    appliedTransition: readOptionalTransitionView(d.applied_transition, `${label}.applied_transition`),
    proposedTransition: readOptionalTransitionView(d.proposed_transition, `${label}.proposed_transition`),
    sourceSummary: readSourceSummary(d.source_summary, `${label}.source_summary`),
    nextStepReady: bool(d.next_step_ready, `${label}.next_step_ready`),
    completionState: readCompletion(d.completion_state, `${label}.completion_state`),
  };
}
