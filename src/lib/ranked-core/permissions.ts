// ---------------------------------------------------------------------------
// UI-flow permission helpers. These encode ONLY the interaction sequence of
// the canonical submission flow (select → review → confirm → locked); they
// never decide game legality (charges, unlocks, deadlines) — controllers
// combine backend state into the flags they pass in.
// ---------------------------------------------------------------------------

import {
  InteractionPermissions,
  NO_INTERACTIONS,
  SubmissionPhase,
} from "./viewTypes";

/**
 * Baseline permissions for the viewer's own submission phase. `inputOpen`
 * reflects externally supplied state (round active, window open, not
 * submitted) — this helper only sequences the phases.
 */
export function permissionsForSubmissionPhase(
  phase: SubmissionPhase,
  inputOpen: boolean,
): InteractionPermissions {
  if (!inputOpen) return NO_INTERACTIONS;
  switch (phase) {
    case "selecting":
      return {
        canSelectAnswer: true,
        canChangeAnswer: true,
        canSelectAbility: true,
        canReviewSubmission: true,
        canConfirmSubmission: false,
        canAdvance: false,
      };
    case "reviewing":
      return {
        canSelectAnswer: false,
        canChangeAnswer: true,
        canSelectAbility: false,
        canReviewSubmission: false,
        canConfirmSubmission: true,
        canAdvance: false,
      };
    case "locked":
      return NO_INTERACTIONS;
  }
}

/** Merge a restriction on top of base permissions (logical AND per flag). */
export function restrictPermissions(
  base: InteractionPermissions,
  restriction: Partial<InteractionPermissions>,
): InteractionPermissions {
  return {
    canSelectAnswer: base.canSelectAnswer && (restriction.canSelectAnswer ?? true),
    canChangeAnswer: base.canChangeAnswer && (restriction.canChangeAnswer ?? true),
    canSelectAbility: base.canSelectAbility && (restriction.canSelectAbility ?? true),
    canReviewSubmission:
      base.canReviewSubmission && (restriction.canReviewSubmission ?? true),
    canConfirmSubmission:
      base.canConfirmSubmission && (restriction.canConfirmSubmission ?? true),
    canAdvance: base.canAdvance && (restriction.canAdvance ?? true),
    disabledReasons: {
      ...base.disabledReasons,
      ...restriction.disabledReasons,
    },
  };
}
