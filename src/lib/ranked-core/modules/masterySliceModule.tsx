// ---------------------------------------------------------------------------
// `mastery_slice.v1` renderer — Phase 4F Ranked-Mastery-Module proof of
// concept.
//
// DELIBERATELY UTILITARIAN, same posture as `itemCostDuelModule.tsx`: this is
// the owner playtest surface for a test-only, rating-ineligible format. It
// must be correct and refresh-safe; production presentation is a later phase.
//
// Authority: this component computes NOTHING. The current challenge, its
// prompt/answer shape, and whether the opponent has finished all come from the
// authoritative `segmentState` on every poll — exactly the `item_cost_duel`
// discipline. There is no local index increment; a refresh lands on whatever
// challenge the server says is next.
//
// Rendering reuse: each challenge is adapted into a `MasteryPlayerQuestion`
// and handed to the EXISTING Mastery interaction dispatcher
// (`features/mastery/interactions/registry.tsx::MasteryQuestionDispatch`),
// which in turn renders through the EXISTING `AtomicRecallQuestionView` /
// `ComparisonQuestionView`. No question UI, comparison UI, or numeric input is
// duplicated here — this file is an ADAPTER, not a renderer.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { MasteryQuestionDispatch } from "@/features/mastery/interactions/registry";
import type { MasteryPlayerQuestion } from "@/features/mastery/contracts/playerQuestion";
import { readComparisonSemantics } from "@/features/mastery/contracts/comparisonSemantics";
import { readPromptSemantics } from "@/features/mastery/contracts/promptSemantics";
import type { PlayerAnswer } from "@/features/mastery/player/useMasteryFixtureSession";
import type { QuestionView } from "@/lib/ranked-core/viewTypes";
import type {
  MasterySliceChallengeView,
  PublicRoundView,
  SegmentStateView,
} from "@/lib/ranked-public/contracts";
import type { ModuleRenderer, ModuleViewportProps } from "./types";

export const MASTERY_SLICE_MODULE_ID = "mastery_slice";
export const MASTERY_SLICE_MODULE_VERSION = 1;

/**
 * Adapt one wire challenge into the `MasteryPlayerQuestion` shape the
 * EXISTING Mastery interaction dispatcher expects.
 *
 * The identity fields (`sessionId` / `artifactDigest` / `displayRevision`)
 * are not meaningful in a Ranked segment — there is no standalone Mastery
 * session here — and are synthesized as opaque placeholders satisfying only
 * the branded-type prefix invariants. None of the interaction renderers this
 * module delegates to (`AtomicRecallQuestionView`, `ComparisonQuestionView`)
 * read these fields, so a placeholder cannot affect grading, correctness, or
 * display — the real `mastery_set_id` is still carried on the wire block for
 * traceability (`publicRound`'s raw payload / server logs), just not threaded
 * through this display-only adapter.
 */
function toPlayerQuestion(
  challenge: MasterySliceChallengeView, totalSteps: number,
): MasteryPlayerQuestion {
  const base = {
    sessionId: "ranked-mastery-slice" as MasteryPlayerQuestion["sessionId"],
    masterySetId: "mset_ranked-mastery-slice" as MasteryPlayerQuestion["masterySetId"],
    artifactDigest: "martifact_ranked-mastery-slice" as MasteryPlayerQuestion["artifactDigest"],
    displayRevision: "disprev_ranked-mastery-slice" as MasteryPlayerQuestion["displayRevision"],
    sequenceIndex: challenge.challengeIndex,
    totalSteps,
    questionFamily: challenge.questionFamily,
    prompt: challenge.prompt,
    state: null,
    patchDisplay: "",
    matchupIdentity: null,
    isReadOnly: true,
    hintAvailable: false,
    interactionKind: challenge.interactionKind === "comparison_left_right"
      ? "comparison_left_right" as const
      : "atomic_recall" as const,
    promptSemantics: challenge.promptSemantics
      ? readPromptSemantics(challenge.promptSemantics)
      : null,
    comparisonSemantics: challenge.comparisonSemantics
      ? readComparisonSemantics(challenge.comparisonSemantics)
      : null,
  };
  if (challenge.answerType === "single_choice") {
    return { ...base, answerType: "single_choice", answerOptions: challenge.answerOptions,
             inputConstraints: null };
  }
  if (challenge.answerType === "boolean") {
    return { ...base, answerType: "boolean", answerOptions: challenge.answerOptions,
             inputConstraints: null };
  }
  // numeric — not produced by today's fixed slice source, but a Ranked
  // segment must still render one correctly rather than crash.
  return {
    ...base, answerType: "numeric", answerOptions: [],
    inputConstraints: {
      unit: "", min: 0, max: null, step: null, integerOnly: false,
      decimalPlaces: null, roundingMode: null, precisionInstruction: null,
      precisionContractVersion: null,
    },
  };
}

function MasterySliceChallengePhase({ state, actions }: {
  state: SegmentStateView;
  actions: ModuleViewportProps["actions"];
}) {
  const index = state.ownNextChallengeIndex;
  const challenges: MasterySliceChallengeView[] =
    state.block?.contract === "mastery_slice" ? state.block.challenges : [];
  const current = challenges[index];
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => { setPending((p) => (p !== null && p !== index ? null : p)); }, [index]);

  if (state.ownFinished || !current) {
    return (
      <div className="space-y-2" data-testid="mastery-slice-waiting">
        <h4 className="font-semibold">Mastery Slice complete</h4>
        <p className="text-sm text-muted-foreground" role="status">
          {state.opponentFinished
            ? "Both players are done — scoring the segment…"
            : `Waiting for the opponent (${state.opponentChallengesCompleted} of ${state.challengeCount} done)…`}
        </p>
      </div>
    );
  }

  const question = toPlayerQuestion(current, state.challengeCount);
  const submitting = actions.busy || pending !== null;
  const onSubmit = (answer: PlayerAnswer) => {
    setPending(index);
    actions.submitChallenge(index, { selected: answer });
  };

  return (
    <div className="space-y-3" data-testid="mastery-slice-challenge-phase">
      <p className="text-xs text-muted-foreground" data-testid="mastery-slice-opponent-progress">
        Opponent: {state.opponentChallengesCompleted} of {state.challengeCount} done
        {state.opponentFinished ? " — finished" : ""}
      </p>
      <MasteryQuestionDispatch
        question={question}
        total={state.challengeCount}
        submitting={submitting}
        onSubmit={onSubmit}
      />
    </div>
  );
}

function MasterySliceViewport({ segmentState, actions }: ModuleViewportProps) {
  if (!segmentState) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="mastery-slice-loading">
        Loading the segment…
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <MasterySliceChallengePhase state={segmentState} actions={actions} />
      {actions.error && (
        <p role="alert" data-testid="mastery-slice-error" className="text-sm text-destructive">
          {actions.error}
        </p>
      )}
    </div>
  );
}

export const masterySliceModule: ModuleRenderer = {
  moduleId: MASTERY_SLICE_MODULE_ID,
  moduleVersion: MASTERY_SLICE_MODULE_VERSION,
  // The module runs its own multi-challenge submission flow through the
  // Mastery interaction dispatcher, so the shell must not also render the
  // quiz answer flow or ability tray alongside it — same contract as
  // `item_cost_duel`.
  ownsSubmission: true,
  Viewport: MasterySliceViewport,
  projectQuestion: (_pub: PublicRoundView): QuestionView | null => null,
  summaryLabel: (pub) => {
    const state = pub.segmentState;
    if (!state) return null;
    return `Mastery step ${Math.min(state.ownNextChallengeIndex + 1, state.challengeCount)} of ${state.challengeCount}`;
  },
};
