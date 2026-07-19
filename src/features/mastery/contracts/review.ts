/**
 * Reviewer-only artifact + review-record contracts (G5.2A).
 *
 * The reviewer surface is admin-gated and legitimately receives the full
 * immutable artifact: answers, calculations, eligibility evidence, recomputation,
 * source records, the transition chain, suppression declarations, patch
 * descriptor, and validation context. Deeply nested evidence is preserved as
 * pass-through `Record<string, unknown>` — the frontend displays it (e.g. in a
 * JSON inspector) but never interprets it as authority. Only identity-bearing
 * fields are strictly validated (prefixes, required keys). This phase parses
 * fixtures only; the review record is read-only here (no mutations).
 */

import {
  MasteryQuestionFamily,
  ReviewerStatus,
  PublicationStatus,
  arr,
  bool,
  intIndex,
  nonEmptyStr,
  nstr,
  oneOf,
  rec,
  scalar,
  str,
  strList,
} from "./common";
import {
  MasteryArtifactDigest,
  MasterySetId,
  MasterySnapshotId,
  MasteryStepId,
  MasteryTransitionId,
  artifactDigest,
  masterySetId,
  snapshotId,
  stepId,
  transitionId,
} from "./ids";

export interface MasteryRankedCapsuleEligibilityView {
  readonly eligible: boolean;
  readonly reasonCode: string | null;
  readonly requiresRewording: boolean;
  readonly standaloneStateComplete: boolean;
}

export interface MasterySuppressionStateView {
  readonly suppressed: boolean;
  readonly reasonCode: string | null;
}

export interface MasteryReviewStep {
  readonly stepId: MasteryStepId;
  readonly sequenceIndex: number;
  readonly questionFamily: MasteryQuestionFamily;
  readonly answerType: string;
  readonly correctAnswer: string | number | boolean;
  readonly beforeSnapshotId: MasterySnapshotId;
  readonly afterSnapshotId: MasterySnapshotId;
  readonly transitionId: MasteryTransitionId | null;
  readonly adapterId: string;
  readonly operationType: string;
  readonly prompt: string;
  readonly explanation: string;
  readonly hint: string | null;
  readonly isReadOnly: boolean;
  readonly proposesDeferredTransition: boolean;
  readonly rankedCapsuleEligibility: MasteryRankedCapsuleEligibilityView;
  readonly suppressionState: MasterySuppressionStateView;
  /** Full calculation evidence, preserved verbatim for display/inspection. */
  readonly calculationResult: Readonly<Record<string, unknown>>;
  readonly eligibilityEvidence: Readonly<Record<string, unknown>>;
}

export interface MasteryBuildClassificationView {
  readonly classification: string;
  readonly confidence: string;
  readonly curationStatement: string;
  readonly isProvenMeta: boolean;
}

export interface MasteryReviewArtifact {
  readonly masterySetId: MasterySetId;
  readonly artifactDigest: MasteryArtifactDigest;
  readonly patchKeyDigest: string;
  readonly validationContextDigest: string;
  readonly initialSnapshotId: MasterySnapshotId;
  readonly matchupIdentity: Readonly<Record<string, unknown>>;
  readonly steps: readonly MasteryReviewStep[];
  readonly transitionChain: readonly Readonly<Record<string, unknown>>[];
  readonly authoredTransitionIds: readonly string[];
  readonly supportedMechanicDeclarations: readonly Readonly<Record<string, unknown>>[];
  readonly suppressedMechanicDeclarations: readonly Readonly<Record<string, unknown>>[];
  readonly buildClassification: MasteryBuildClassificationView;
  readonly patchDescriptor: Readonly<Record<string, unknown>>;
  readonly validationContext: Readonly<Record<string, unknown>>;
  readonly sourceRecords: readonly unknown[];
  readonly generatorId: string;
  readonly generationEngineVersion: string;
}

export interface MasteryReviewRecord {
  readonly artifactDigest: MasteryArtifactDigest;
  readonly reviewerStatus: ReviewerStatus;
  readonly publicationStatus: PublicationStatus;
  readonly reviewerNotes: string;
  readonly revisionHistory: readonly unknown[];
  readonly sourceHash: string;
}

function readCapsuleEligibility(value: unknown, label: string): MasteryRankedCapsuleEligibilityView {
  const c = rec(value, label);
  return {
    eligible: bool(c.eligible, `${label}.eligible`),
    reasonCode: nstr(c.reason_code, `${label}.reason_code`),
    requiresRewording: bool(c.requires_rewording, `${label}.requires_rewording`),
    standaloneStateComplete: bool(c.standalone_state_complete, `${label}.standalone_state_complete`),
  };
}

function readSuppression(value: unknown, label: string): MasterySuppressionStateView {
  const s = rec(value, label);
  return {
    suppressed: bool(s.suppressed, `${label}.suppressed`),
    reasonCode: nstr(s.reason_code, `${label}.reason_code`),
  };
}

function readReviewStep(value: unknown, label: string): MasteryReviewStep {
  const s = rec(value, label);
  const txn = s.transition_id;
  return {
    stepId: stepId(s.step_id, `${label}.step_id`),
    sequenceIndex: intIndex(s.sequence_index, `${label}.sequence_index`),
    questionFamily: nonEmptyStr(s.question_family, `${label}.question_family`),
    answerType: nonEmptyStr(s.answer_type, `${label}.answer_type`),
    correctAnswer: scalar(s.correct_answer, `${label}.correct_answer`),
    beforeSnapshotId: snapshotId(s.before_snapshot_id, `${label}.before_snapshot_id`),
    afterSnapshotId: snapshotId(s.after_snapshot_id, `${label}.after_snapshot_id`),
    transitionId: txn === null || txn === undefined ? null : transitionId(txn, `${label}.transition_id`),
    adapterId: nonEmptyStr(s.adapter_id, `${label}.adapter_id`),
    operationType: nonEmptyStr(s.operation_type, `${label}.operation_type`),
    prompt: str(s.prompt, `${label}.prompt`),
    explanation: str(s.explanation, `${label}.explanation`),
    hint: nstr(s.hint, `${label}.hint`),
    isReadOnly: bool(s.is_read_only, `${label}.is_read_only`),
    proposesDeferredTransition: bool(s.proposes_deferred_transition, `${label}.proposes_deferred_transition`),
    rankedCapsuleEligibility: readCapsuleEligibility(s.ranked_capsule_eligibility, `${label}.ranked_capsule_eligibility`),
    suppressionState: readSuppression(s.suppression_state, `${label}.suppression_state`),
    calculationResult: rec(s.calculation_result, `${label}.calculation_result`),
    eligibilityEvidence: rec(s.eligibility_evidence, `${label}.eligibility_evidence`),
  };
}

function readBuildClassification(value: unknown, label: string): MasteryBuildClassificationView {
  const b = rec(value, label);
  return {
    classification: str(b.classification, `${label}.classification`),
    confidence: str(b.confidence, `${label}.confidence`),
    curationStatement: str(b.curation_statement, `${label}.curation_statement`),
    isProvenMeta: bool(b.is_proven_meta, `${label}.is_proven_meta`),
  };
}

export function readReviewArtifact(value: unknown, label = "artifact"): MasteryReviewArtifact {
  const a = rec(value, label);
  const steps = arr(a.ordered_steps, `${label}.ordered_steps`);
  const chain = arr(a.transition_chain, `${label}.transition_chain`);
  const supported = arr(a.supported_mechanic_declarations, `${label}.supported_mechanic_declarations`);
  const suppressed = arr(a.suppressed_mechanic_declarations, `${label}.suppressed_mechanic_declarations`);
  return {
    masterySetId: masterySetId(a.mastery_set_id, `${label}.mastery_set_id`),
    artifactDigest: artifactDigest(a.artifact_digest, `${label}.artifact_digest`),
    patchKeyDigest: nonEmptyStr(a.patch_key_digest, `${label}.patch_key_digest`),
    validationContextDigest: nonEmptyStr(a.validation_context_digest, `${label}.validation_context_digest`),
    initialSnapshotId: snapshotId(a.initial_snapshot_id, `${label}.initial_snapshot_id`),
    matchupIdentity: rec(a.champion_matchup_identity, `${label}.champion_matchup_identity`),
    steps: steps.map((s, i) => readReviewStep(s, `${label}.ordered_steps[${i}]`)),
    transitionChain: chain.map((r, i) => rec(r, `${label}.transition_chain[${i}]`)),
    authoredTransitionIds: strList(a.authored_transition_ids, `${label}.authored_transition_ids`),
    supportedMechanicDeclarations: supported.map((s, i) => rec(s, `${label}.supported_mechanic_declarations[${i}]`)),
    suppressedMechanicDeclarations: suppressed.map((s, i) => rec(s, `${label}.suppressed_mechanic_declarations[${i}]`)),
    buildClassification: readBuildClassification(a.build_classification, `${label}.build_classification`),
    patchDescriptor: rec(a.patch_descriptor, `${label}.patch_descriptor`),
    validationContext: rec(a.validation_context, `${label}.validation_context`),
    sourceRecords: arr(a.source_records, `${label}.source_records`),
    generatorId: nonEmptyStr(a.generator_id, `${label}.generator_id`),
    generationEngineVersion: nonEmptyStr(a.generation_engine_version, `${label}.generation_engine_version`),
  };
}

export function readReviewRecord(value: unknown, label = "review_record"): MasteryReviewRecord {
  const r = rec(value, label);
  return {
    artifactDigest: artifactDigest(r.artifact_digest, `${label}.artifact_digest`),
    reviewerStatus: oneOf(
      r.reviewer_status,
      ["unreviewed", "in_review", "approved", "changes_requested", "rejected"],
      `${label}.reviewer_status`,
    ),
    publicationStatus: oneOf(
      r.publication_status,
      ["draft", "eligible_for_publication", "published", "withdrawn"],
      `${label}.publication_status`,
    ),
    reviewerNotes: str(r.reviewer_notes, `${label}.reviewer_notes`),
    revisionHistory: arr(r.revision_history, `${label}.revision_history`),
    sourceHash: nonEmptyStr(r.source_hash, `${label}.source_hash`),
  };
}
