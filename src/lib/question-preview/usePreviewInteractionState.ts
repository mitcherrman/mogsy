/**
 * Local preview interaction state (RA9).
 *
 * Drives the four states an operator inspects a question in — unselected,
 * selected, locked, reveal — using the PRODUCTION permission sequencing
 * (`permissionsForSubmissionPhase`) so a preview's enabled/disabled answers are
 * decided by the same rule a real round uses, not by a second set of flags.
 *
 * Everything here is LOCAL. Selecting an answer moves this hook's state and
 * nothing else: no submission, no scoring, no ELO, no persistence, no network
 * call of any kind. There is no timer, no reveal hold, and no autoplay — the
 * operator moves between states explicitly, because a preview is for looking at
 * a state, not for racing through one.
 *
 * The correct index arrives from the PROTECTED candidate-detail response, which
 * the admin page already holds. It is deliberately not on the public-view
 * payload, so the reveal treatment is assembled here — in admin-only code — and
 * the transport a player would receive stays answer-free.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { answerOptionId } from "@/lib/ranked-core/adapters/adaptToViews";
import { permissionsForSubmissionPhase } from "@/lib/ranked-core/permissions";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type {
  AnswerOptionView,
  InteractionPermissions,
  SurfaceReveal,
} from "@/lib/question-surface/contract";

export const PREVIEW_STATES = ["unselected", "selected", "locked", "reveal"] as const;
export type PreviewState = (typeof PREVIEW_STATES)[number];

export const PREVIEW_STATE_LABELS: Record<PreviewState, string> = {
  unselected: "Unselected",
  selected: "Selected",
  locked: "Locked",
  reveal: "Reveal",
};

export interface PreviewInteraction {
  state: PreviewState;
  setState: (next: PreviewState) => void;
  selectedOptionId: string | null;
  permissions: InteractionPermissions;
  reveal: SurfaceReveal | null;
  /** Answer click handler — updates LOCAL state only. */
  onSelectOption: (option: AnswerOptionView) => void;
}

export interface PreviewInteractionOptions {
  /**
   * Correct option index from the admin candidate detail, or null when the
   * candidate has no unambiguous correct option. Null disables Reveal rather
   * than guessing an answer.
   */
  correctAnswerIndex: number | null;
  /** Resets state when the previewed question changes. */
  resetKey?: string | null;
  /** Options currently rendered; bounds the default selection. */
  optionCount: number;
}

/** States that imply a chosen answer. Entering one with nothing chosen picks
 *  the first option, so the state the operator asked for is actually shown. */
const REQUIRES_SELECTION: ReadonlySet<PreviewState> = new Set<PreviewState>([
  "selected",
  "locked",
  "reveal",
]);

export function usePreviewInteractionState({
  correctAnswerIndex,
  resetKey = null,
  optionCount,
}: PreviewInteractionOptions): PreviewInteraction {
  const [state, setStateRaw] = useState<PreviewState>("unselected");
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);

  // A different candidate is a different question: start from a clean slate
  // rather than carrying a stale selection onto unrelated options.
  useEffect(() => {
    setStateRaw("unselected");
    setSelectedOptionId(null);
  }, [resetKey]);

  const setState = useCallback(
    (next: PreviewState) => {
      setStateRaw(next);
      if (next === "unselected") {
        setSelectedOptionId(null);
        return;
      }
      if (REQUIRES_SELECTION.has(next)) {
        setSelectedOptionId((current) =>
          current ?? (optionCount > 0 ? answerOptionId(0) : null),
        );
      }
    },
    [optionCount],
  );

  const onSelectOption = useCallback((option: AnswerOptionView) => {
    setSelectedOptionId(option.id);
    // Picking an answer IS the transition into the selected state, mirroring a
    // real round where a chosen answer is still changeable until it locks.
    setStateRaw((current) => (current === "unselected" ? "selected" : current));
  }, []);

  const permissions = useMemo<InteractionPermissions>(
    () =>
      state === "locked" || state === "reveal"
        ? NO_INTERACTIONS
        : permissionsForSubmissionPhase("selecting", true),
    [state],
  );

  const reveal = useMemo<SurfaceReveal | null>(() => {
    if (state !== "reveal" || correctAnswerIndex == null) return null;
    const correctOptionId = answerOptionId(correctAnswerIndex);
    return {
      revealed: true,
      correctOptionId,
      isCorrect: selectedOptionId === correctOptionId,
      explanation: null,
    };
  }, [state, correctAnswerIndex, selectedOptionId]);

  return { state, setState, selectedOptionId, permissions, reveal, onSelectOption };
}
