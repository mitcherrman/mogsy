/**
 * Display-safe transition view (G5.2A).
 *
 * A transition view renders a backend-authoritative state change between two
 * snapshots. It is a discriminated union over `classification`:
 *   - `authored_effect`  — an authored scenario effect (e.g. +20 ability haste).
 *   - `health_change`    — an applied/proposed health delta (before → after).
 *   - `state_unchanged`  — a read-only step; state did not advance.
 *
 * The DTO carries backend-provided before/after/delta values. The contract layer
 * NEVER computes a delta from game formulas. (A UI layer may subtract two
 * backend-supplied numbers purely for a label, but that is outside this package
 * and is never treated as canonical — see stateView notes.)
 */

import { MasteryContractParseError, bool, nnum, nstr, oneOf, rec, str } from "./common";
import { MasteryTransitionId, transitionId } from "./ids";

export const TRANSITION_CLASSIFICATIONS = [
  "authored_effect",
  "health_change",
  "state_unchanged",
] as const;
export type TransitionClassification = (typeof TRANSITION_CLASSIFICATIONS)[number];

/**
 * Provenance of an applied/proposed transition — a G5-owned display discriminant
 * (NOT a backend contract field). It records how the transition entered the
 * chain so a reveal never implies the source question proposed it:
 *   - `authored_inter_step`  — an authored scenario transition applied BETWEEN
 *     questions (e.g. the +20 ability-haste effect T1); the question did not
 *     calculate or propose it.
 *   - `question_proposed`    — the exact transition the source question's
 *     calculation proposed (e.g. T2, bound to Q5).
 */
export const TRANSITION_ORIGINS = ["authored_inter_step", "question_proposed"] as const;
export type TransitionOrigin = (typeof TRANSITION_ORIGINS)[number];

export interface AuthoredEffectTransitionView {
  readonly classification: "authored_effect";
  readonly origin: TransitionOrigin;
  readonly transitionId: MasteryTransitionId;
  readonly target: string;
  readonly label: string;
  readonly effect: string;
  readonly magnitude: number | null;
  readonly unit: string | null;
  readonly applied: boolean;
}

export interface HealthChangeTransitionView {
  readonly classification: "health_change";
  readonly origin: TransitionOrigin;
  readonly transitionId: MasteryTransitionId;
  readonly target: string;
  readonly label: string;
  readonly beforeValue: number | null;
  readonly afterValue: number | null;
  readonly delta: number | null;
  readonly unit: string | null;
  readonly applied: boolean;
}

export interface StateUnchangedTransitionView {
  readonly classification: "state_unchanged";
  readonly label: string;
}

export type MasteryTransitionView =
  | AuthoredEffectTransitionView
  | HealthChangeTransitionView
  | StateUnchangedTransitionView;

export function readTransitionView(value: unknown, label = "transition"): MasteryTransitionView {
  const t = rec(value, label);
  const classification = oneOf(t.classification, TRANSITION_CLASSIFICATIONS, `${label}.classification`);

  switch (classification) {
    case "authored_effect":
      return {
        classification,
        origin: oneOf(t.origin, TRANSITION_ORIGINS, `${label}.origin`),
        transitionId: transitionId(t.transition_id, `${label}.transition_id`),
        target: str(t.target, `${label}.target`),
        label: str(t.label, `${label}.label`),
        effect: str(t.effect, `${label}.effect`),
        magnitude: nnum(t.magnitude, `${label}.magnitude`),
        unit: nstr(t.unit, `${label}.unit`),
        applied: bool(t.applied, `${label}.applied`),
      };
    case "health_change":
      return {
        classification,
        origin: oneOf(t.origin, TRANSITION_ORIGINS, `${label}.origin`),
        transitionId: transitionId(t.transition_id, `${label}.transition_id`),
        target: str(t.target, `${label}.target`),
        label: str(t.label, `${label}.label`),
        beforeValue: nnum(t.before_value, `${label}.before_value`),
        afterValue: nnum(t.after_value, `${label}.after_value`),
        delta: nnum(t.delta, `${label}.delta`),
        unit: nstr(t.unit, `${label}.unit`),
        applied: bool(t.applied, `${label}.applied`),
      };
    case "state_unchanged":
      return { classification, label: str(t.label, `${label}.label`) };
    default: {
      // Exhaustiveness guard — unreachable given oneOf above.
      throw new MasteryContractParseError(`unknown transition classification`, `${label}.classification`);
    }
  }
}

export function readOptionalTransitionView(
  value: unknown,
  label: string,
): MasteryTransitionView | null {
  if (value === null || value === undefined) return null;
  return readTransitionView(value, label);
}
