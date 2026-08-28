/**
 * Safe pre-submission player-question contract (G5.2A).
 *
 * `MasteryPlayerQuestion` is the ONLY Mastery payload a public player client
 * receives before answering. It is an allowlist projection: the reader copies a
 * fixed set of safe fields and nothing else, so no calculation, answer, or
 * post-transition state can ride along even if the backend sent extra keys. It is
 * a discriminated union over `answer_type`.
 */

import {
  AnswerType,
  MASTERY_INTERACTION_KINDS,
  MasteryContractParseError,
  MasteryInteractionKind,
  MasteryQuestionFamily,
  bool,
  intIndex,
  nnum,
  nonEmptyStr,
  nstr,
  oneOf,
  rec,
  str,
  strList,
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
import { MasteryComparisonSemantics, readComparisonSemantics } from "./comparisonSemantics";
import { MasteryPromptSemantics, readPromptSemantics } from "./promptSemantics";
import { MasteryStateView, readOptionalStateView } from "./stateView";

export interface MasteryMatchupIdentity {
  readonly championA: string;
  readonly championB: string;
  readonly focus: string;
  /** Player-facing friendly names (backend `champion_display_names` contract).
   *  Null for older projections; callers fall back to a formatted id. */
  readonly championADisplay: string | null;
  readonly championBDisplay: string | null;
}

export interface NumericInputConstraints {
  readonly unit: string;
  readonly min: number | null;
  readonly max: number | null;
  readonly step: number | null;
  readonly integerOnly: boolean;
  /**
   * Decimal places the backend grades at. The UI uses this only to shape and
   * describe the input — correctness is still decided solely on the backend.
   * Optional so a response predating the precision contract still parses.
   */
  readonly decimalPlaces: number | null;
  readonly roundingMode: string | null;
  /** Player-facing rounding hint, or null when the question needs none. */
  readonly precisionInstruction: string | null;
  readonly precisionContractVersion: string | null;
}

interface MasteryPlayerQuestionBase {
  readonly sessionId: MasterySessionId;
  readonly masterySetId: MasterySetId;
  readonly artifactDigest: MasteryArtifactDigest;
  readonly displayRevision: MasteryDisplayRevision;
  readonly sequenceIndex: number;
  readonly totalSteps: number;
  readonly questionFamily: MasteryQuestionFamily;
  readonly prompt: string;
  /**
   * Null for a stateless step (Phase 4C1 nullable-contract widening — backend
   * `playerQuestion.state` is `None` when the step models no combat state).
   * Every payload served today still populates it.
   */
  readonly state: MasteryStateView | null;
  readonly patchDisplay: string;
  /**
   * Null when the set has no two-champion matchup identity (Phase 4C1
   * nullable-contract widening). Every payload served today still populates it.
   */
  readonly matchupIdentity: MasteryMatchupIdentity | null;
  readonly isReadOnly: boolean;
  readonly hintAvailable: boolean;
  /**
   * How this question should be rendered (Phase 4C1). Defaults to
   * `legacy_combat` when absent from the wire, so every existing served
   * payload parses unchanged. The interaction dispatcher
   * (`features/mastery/interactions/registry.tsx`) fails explicitly on a kind
   * it does not recognise.
   */
  readonly interactionKind: MasteryInteractionKind;
  /**
   * Structured recall semantics for an `atomic_recall` question — required
   * exactly when `interactionKind === "atomic_recall"`, and forbidden
   * otherwise. Null for every `legacy_combat` question served today.
   */
  readonly promptSemantics: MasteryPromptSemantics | null;
  /**
   * Structured comparison semantics for a `comparison_left_right` question
   * (Phase 4C2) — required exactly when
   * `interactionKind === "comparison_left_right"`, and forbidden otherwise.
   * Null for every other question served today.
   */
  readonly comparisonSemantics: MasteryComparisonSemantics | null;
}

export interface SingleChoicePlayerQuestion extends MasteryPlayerQuestionBase {
  readonly answerType: "single_choice";
  readonly answerOptions: readonly string[];
  readonly inputConstraints: null;
}

export interface NumericPlayerQuestion extends MasteryPlayerQuestionBase {
  readonly answerType: "numeric";
  readonly answerOptions: readonly [];
  readonly inputConstraints: NumericInputConstraints;
}

export interface BooleanPlayerQuestion extends MasteryPlayerQuestionBase {
  readonly answerType: "boolean";
  /** Either empty, or exactly the backend-provided [false-label, true-label] pair. */
  readonly answerOptions: readonly string[];
  readonly inputConstraints: null;
}

export type MasteryPlayerQuestion =
  | SingleChoicePlayerQuestion
  | NumericPlayerQuestion
  | BooleanPlayerQuestion;

/**
 * The narrowed view every `legacy_combat` renderer (`features/mastery/player/*`)
 * is written against: `state` and `matchupIdentity` are guaranteed present, as
 * they always are for every question served today. The interaction dispatcher
 * narrows to this type only after confirming `interactionKind === "legacy_combat"`
 * and that both fields are non-null (fail-closed otherwise) — this type alias
 * lets the legacy renderer components keep their pre-4C1 bodies unchanged.
 */
export type LegacyMasteryPlayerQuestion = Omit<MasteryPlayerQuestion, "state" | "matchupIdentity"> & {
  readonly state: MasteryStateView;
  readonly matchupIdentity: MasteryMatchupIdentity;
};

function readMatchup(value: unknown, label: string): MasteryMatchupIdentity {
  const m = rec(value, label);
  return {
    championA: nonEmptyStr(m.champion_a, `${label}.champion_a`),
    championB: nonEmptyStr(m.champion_b, `${label}.champion_b`),
    focus: str(m.focus, `${label}.focus`),
    championADisplay: nstr(m.champion_a_display, `${label}.champion_a_display`),
    championBDisplay: nstr(m.champion_b_display, `${label}.champion_b_display`),
  };
}

/** Null when the field is absent or explicitly null (Phase 4C1). */
function readOptionalMatchup(value: unknown, label: string): MasteryMatchupIdentity | null {
  if (value === null || value === undefined) return null;
  return readMatchup(value, label);
}

function readInteractionKind(value: unknown, label: string): MasteryInteractionKind {
  if (value === undefined || value === null) return "legacy_combat";
  return oneOf(value, MASTERY_INTERACTION_KINDS, label);
}

function readNumericConstraints(value: unknown, label: string): NumericInputConstraints {
  const c = rec(value, label);
  return {
    unit: nonEmptyStr(c.unit, `${label}.unit`),
    min: nnum(c.min, `${label}.min`),
    max: nnum(c.max, `${label}.max`),
    step: nnum(c.step, `${label}.step`),
    integerOnly: bool(c.integer_only, `${label}.integer_only`),
    decimalPlaces: nnum(c.decimal_places, `${label}.decimal_places`),
    roundingMode: nstr(c.rounding_mode, `${label}.rounding_mode`),
    precisionInstruction: nstr(c.precision_instruction, `${label}.precision_instruction`),
    precisionContractVersion: nstr(
      c.precision_contract_version, `${label}.precision_contract_version`),
  };
}

function readBase(d: Record<string, unknown>, label: string): MasteryPlayerQuestionBase {
  const interactionKind = readInteractionKind(d.interaction_kind, `${label}.interaction_kind`);
  const hasPromptSemantics =
    "prompt_semantics" in d && d.prompt_semantics !== null && d.prompt_semantics !== undefined;
  const hasComparisonSemantics =
    "comparison_semantics" in d && d.comparison_semantics !== null && d.comparison_semantics !== undefined;
  if (interactionKind === "atomic_recall" && !hasPromptSemantics) {
    throw new MasteryContractParseError(
      `atomic_recall requires prompt_semantics`,
      `${label}.prompt_semantics`,
    );
  }
  if (interactionKind !== "atomic_recall" && hasPromptSemantics) {
    throw new MasteryContractParseError(
      `${interactionKind} must not carry prompt_semantics`,
      `${label}.prompt_semantics`,
    );
  }
  if (interactionKind === "comparison_left_right" && !hasComparisonSemantics) {
    throw new MasteryContractParseError(
      `comparison_left_right requires comparison_semantics`,
      `${label}.comparison_semantics`,
    );
  }
  if (interactionKind !== "comparison_left_right" && hasComparisonSemantics) {
    throw new MasteryContractParseError(
      `${interactionKind} must not carry comparison_semantics`,
      `${label}.comparison_semantics`,
    );
  }
  return {
    sessionId: sessionId(d.session_id, `${label}.session_id`),
    masterySetId: masterySetId(d.mastery_set_id, `${label}.mastery_set_id`),
    artifactDigest: artifactDigest(d.artifact_digest, `${label}.artifact_digest`),
    displayRevision: displayRevision(d.display_revision, `${label}.display_revision`),
    sequenceIndex: intIndex(d.sequence_index, `${label}.sequence_index`),
    totalSteps: intIndex(d.total_steps, `${label}.total_steps`),
    questionFamily: nonEmptyStr(d.question_family, `${label}.question_family`),
    prompt: nonEmptyStr(d.prompt, `${label}.prompt`),
    state: readOptionalStateView(d.state, `${label}.state`),
    patchDisplay: str(d.patch_display, `${label}.patch_display`),
    matchupIdentity: readOptionalMatchup(d.matchup_identity, `${label}.matchup_identity`),
    isReadOnly: bool(d.is_read_only, `${label}.is_read_only`),
    hintAvailable: bool(d.hint_available, `${label}.hint_available`),
    interactionKind,
    promptSemantics: hasPromptSemantics
      ? readPromptSemantics(d.prompt_semantics, `${label}.prompt_semantics`)
      : null,
    comparisonSemantics: hasComparisonSemantics
      ? readComparisonSemantics(d.comparison_semantics, `${label}.comparison_semantics`)
      : null,
  };
}

/**
 * Allowlist projection of a player-question `data` object. Assumes the recursive
 * {@link assertNoAnswerKey} guard has already run on the enclosing body (the
 * top-level parser enforces this); this reader additionally copies only safe
 * fields, so nothing outside the allowlist can survive.
 */
export function readPlayerQuestion(value: unknown, label = "data"): MasteryPlayerQuestion {
  const d = rec(value, label);
  const answerType: AnswerType = oneOf(d.answer_type, ["single_choice", "numeric", "boolean"], `${label}.answer_type`);
  const base = readBase(d, label);

  switch (answerType) {
    case "single_choice": {
      const options = strList(d.answer_options, `${label}.answer_options`);
      if (options.length === 0) {
        throw new MasteryContractParseError(`single_choice requires non-empty answer_options`, `${label}.answer_options`);
      }
      if ("input_constraints" in d && d.input_constraints !== null && d.input_constraints !== undefined) {
        throw new MasteryContractParseError(`single_choice must not carry numeric input_constraints`, `${label}.input_constraints`);
      }
      return { ...base, answerType, answerOptions: options, inputConstraints: null };
    }
    case "numeric": {
      const options = "answer_options" in d ? strList(d.answer_options, `${label}.answer_options`) : [];
      if (options.length !== 0) {
        throw new MasteryContractParseError(`numeric must not carry answer_options`, `${label}.answer_options`);
      }
      const constraints = readNumericConstraints(d.input_constraints, `${label}.input_constraints`);
      return { ...base, answerType, answerOptions: [], inputConstraints: constraints };
    }
    case "boolean": {
      const options = "answer_options" in d && d.answer_options != null
        ? strList(d.answer_options, `${label}.answer_options`)
        : [];
      if (options.length !== 0 && options.length !== 2) {
        throw new MasteryContractParseError(
          `boolean answer_options must be empty or exactly [false_label, true_label]`,
          `${label}.answer_options`,
        );
      }
      if ("input_constraints" in d && d.input_constraints !== null && d.input_constraints !== undefined) {
        throw new MasteryContractParseError(`boolean must not carry numeric input_constraints`, `${label}.input_constraints`);
      }
      return { ...base, answerType, answerOptions: options, inputConstraints: null };
    }
    default: {
      throw new MasteryContractParseError(`unknown answer_type`, `${label}.answer_type`);
    }
  }
}
