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
  MasteryContractParseError,
  MasteryQuestionFamily,
  bool,
  intIndex,
  nnum,
  nonEmptyStr,
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
import { MasteryStateView, readStateView } from "./stateView";

export interface MasteryMatchupIdentity {
  readonly championA: string;
  readonly championB: string;
  readonly focus: string;
}

export interface NumericInputConstraints {
  readonly unit: string;
  readonly min: number | null;
  readonly max: number | null;
  readonly step: number | null;
  readonly integerOnly: boolean;
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
  readonly state: MasteryStateView;
  readonly patchDisplay: string;
  readonly matchupIdentity: MasteryMatchupIdentity;
  readonly isReadOnly: boolean;
  readonly hintAvailable: boolean;
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

function readMatchup(value: unknown, label: string): MasteryMatchupIdentity {
  const m = rec(value, label);
  return {
    championA: nonEmptyStr(m.champion_a, `${label}.champion_a`),
    championB: nonEmptyStr(m.champion_b, `${label}.champion_b`),
    focus: str(m.focus, `${label}.focus`),
  };
}

function readNumericConstraints(value: unknown, label: string): NumericInputConstraints {
  const c = rec(value, label);
  return {
    unit: nonEmptyStr(c.unit, `${label}.unit`),
    min: nnum(c.min, `${label}.min`),
    max: nnum(c.max, `${label}.max`),
    step: nnum(c.step, `${label}.step`),
    integerOnly: bool(c.integer_only, `${label}.integer_only`),
  };
}

function readBase(d: Record<string, unknown>, label: string): MasteryPlayerQuestionBase {
  return {
    sessionId: sessionId(d.session_id, `${label}.session_id`),
    masterySetId: masterySetId(d.mastery_set_id, `${label}.mastery_set_id`),
    artifactDigest: artifactDigest(d.artifact_digest, `${label}.artifact_digest`),
    displayRevision: displayRevision(d.display_revision, `${label}.display_revision`),
    sequenceIndex: intIndex(d.sequence_index, `${label}.sequence_index`),
    totalSteps: intIndex(d.total_steps, `${label}.total_steps`),
    questionFamily: nonEmptyStr(d.question_family, `${label}.question_family`),
    prompt: nonEmptyStr(d.prompt, `${label}.prompt`),
    state: readStateView(d.state, `${label}.state`),
    patchDisplay: str(d.patch_display, `${label}.patch_display`),
    matchupIdentity: readMatchup(d.matchup_identity, `${label}.matchup_identity`),
    isReadOnly: bool(d.is_read_only, `${label}.is_read_only`),
    hintAvailable: bool(d.hint_available, `${label}.hint_available`),
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
