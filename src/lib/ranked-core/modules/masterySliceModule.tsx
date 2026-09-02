// ---------------------------------------------------------------------------
// `mastery_slice.v1` renderer.
//
// Authority: this component computes NOTHING. The current challenge, its
// prompt/answer shape, and whether the opponent has finished all come from the
// authoritative `segmentState` on every poll — exactly the `item_cost_duel`
// discipline. There is no local index increment; a refresh lands on whatever
// challenge the server says is next, and correctness is decided only by the
// server.
//
// Two rendering paths, chosen by the CHALLENGE, never by the content
// ───────────────────────────────────────────────────────────────────
// A frozen `mastery_slice` challenge is one of two genuinely different things,
// and the wire says which:
//
//   * a STRUCTURAL challenge — `atomic_recall` / `comparison_left_right` —
//     whose `prompt` is a terse internal label ("Ahri Q — ability_cooldown")
//     and whose player-facing sentence is built by the existing Mastery
//     interaction renderers from `promptSemantics` / `comparisonSemantics`;
//   * a PROSE challenge, whose `prompt` is finished backend-authored text and
//     which carries no semantics at all.
//
// The first goes to the EXISTING Mastery interaction dispatcher, unchanged.
// The second goes to the arena's OWN `InteractiveScenarioSurface` — the same
// component a `quiz` round renders through — so a prose Mastery question looks
// like a Ranked question rather than an embedded Mastery study page.
//
// This is a dispatch on the generic challenge contract, not on content. There
// is no champion, item, ability, damage type or set id in this file, and a new
// runtime Mastery set renders here with no change to it.
//
// Why the choice is confirmed by the SEMANTICS and not by the kind alone: the
// structural renderers throw when the semantics they render from are absent,
// and a segment that crashes mid-match is strictly worse than one that shows
// the backend's own prompt text. So a challenge is only sent to a structural
// renderer when it actually carries what that renderer needs; everything else
// — including a kind this build has never heard of — renders as prose, which
// every challenge can always do because `prompt` and `answerOptions` are
// required fields of the contract.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { InteractiveScenarioSurface } from "@/components/question-surface/InteractiveScenarioSurface";
import { MasteryQuestionDispatch } from "@/features/mastery/interactions/registry";
import type { MasteryPlayerQuestion } from "@/features/mastery/contracts/playerQuestion";
import { readComparisonSemantics } from "@/features/mastery/contracts/comparisonSemantics";
import { readPromptSemantics } from "@/features/mastery/contracts/promptSemantics";
import type { PlayerAnswer } from "@/features/mastery/player/useMasteryFixtureSession";
import type { AnswerOptionView, QuestionView } from "@/lib/ranked-core/viewTypes";
import type {
  MasterySliceChallengeView,
  PublicRoundView,
  SegmentStateView,
} from "@/lib/ranked-public/contracts";
import { MASTERY_SLICE_MODULE_ID } from "@/lib/ranked-public/contracts";
import type { ModuleRenderer, ModuleViewportProps } from "./types";

export const MASTERY_SLICE_MODULE_VERSION = 1;
export { MASTERY_SLICE_MODULE_ID };

/** Which renderer a challenge can actually be served by. */
export type MasterySliceRenderPath = "atomic_recall" | "comparison" | "prose";

/**
 * The rendering path for one challenge, from the frozen contract alone.
 *
 * Exported because it is the whole dispatch rule, and a rule worth testing
 * directly rather than only through a mounted component.
 */
export function renderPathFor(
  challenge: MasterySliceChallengeView,
): MasterySliceRenderPath {
  if (challenge.interactionKind === "comparison_left_right"
      && challenge.comparisonSemantics) {
    return "comparison";
  }
  if (challenge.interactionKind === "atomic_recall" && challenge.promptSemantics) {
    return "atomic_recall";
  }
  return "prose";
}

/**
 * Adapt one wire challenge into the `MasteryPlayerQuestion` shape the EXISTING
 * Mastery interaction dispatcher expects. Only ever called for a STRUCTURAL
 * path, so the semantics it reads are known to be present.
 *
 * The identity fields (`sessionId` / `artifactDigest` / `displayRevision`) are
 * not meaningful in a Ranked segment — there is no standalone Mastery session
 * here — and are synthesized as opaque placeholders satisfying only the
 * branded-type prefix invariants. None of the interaction renderers this
 * module delegates to reads these fields, so a placeholder cannot affect
 * grading, correctness or display.
 */
function toPlayerQuestion(
  challenge: MasterySliceChallengeView, totalSteps: number,
  path: MasterySliceRenderPath,
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
    interactionKind: path === "comparison"
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
  return {
    ...base, answerType: "numeric", answerOptions: [],
    inputConstraints: {
      unit: "", min: 0, max: null, step: null, integerOnly: false,
      decimalPlaces: null, roundingMode: null, precisionInstruction: null,
      precisionContractVersion: null,
    },
  };
}

/**
 * A prose challenge as the arena's own `QuestionView`.
 *
 * Option ids are stringified INDEXES, which is what `AnswerOptionView.id`
 * already means everywhere else — so the answer actually submitted is looked
 * back up from `answerOptions` rather than taken from a label that a renderer
 * could have trimmed or decorated.
 */
export function questionViewForChallenge(
  challenge: MasterySliceChallengeView,
): QuestionView {
  const options: AnswerOptionView[] = challenge.answerOptions.map((label, index) => ({
    id: String(index),
    index,
    label,
  }));
  return {
    questionId: `mastery-slice-${challenge.challengeIndex}`,
    prompt: challenge.prompt,
    options,
    category: challenge.questionFamily,
  };
}

function ProseChallenge({ challenge, submitting, onSubmit }: {
  challenge: MasterySliceChallengeView;
  submitting: boolean;
  onSubmit: (answer: PlayerAnswer) => void;
}) {
  const question = useMemo(() => questionViewForChallenge(challenge), [challenge]);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  // A new challenge clears the pending selection. Keyed on the authoritative
  // index, so a poll that re-renders the same challenge does not wipe a pick
  // the player has already made.
  useEffect(() => { setSelectedOptionId(null); }, [challenge.challengeIndex]);

  const selectedLabel = selectedOptionId === null
    ? null
    : challenge.answerOptions[Number(selectedOptionId)] ?? null;

  return (
    <div className="space-y-3" data-testid="mastery-slice-prose-challenge">
      <InteractiveScenarioSurface
        question={question}
        selectedOptionId={selectedOptionId}
        permissions={{
          canSelectAnswer: !submitting,
          canChangeAnswer: !submitting,
          canSelectAbility: false,
          canReviewSubmission: false,
          canConfirmSubmission: !submitting && selectedOptionId !== null,
          canAdvance: false,
        }}
        onSelectOption={(option) => setSelectedOptionId(option.id)}
        variant="competitive"
        // No question-safe rich-visual source exists for a generated Mastery
        // question, so the surface renders its polished text treatment. It is
        // never fabricated here: inventing art would be inventing content.
        scenarioSource={null}
        // Pre-reveal, always. A slice's answers arrive only with the segment
        // settlement, which the arena beat renders — never this viewport.
        reveal={null}
      />
      <Button
        type="button"
        className="w-full"
        data-testid="mastery-slice-submit"
        disabled={submitting || selectedLabel === null}
        onClick={() => { if (selectedLabel !== null) onSubmit(selectedLabel); }}
      >
        {submitting ? "Locking in…" : "Lock in answer"}
      </Button>
    </div>
  );
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

  const submitting = actions.busy || pending !== null;
  const onSubmit = (answer: PlayerAnswer) => {
    setPending(index);
    actions.submitChallenge(index, { selected: answer });
  };
  const path = renderPathFor(current);

  return (
    <div className="space-y-3" data-testid="mastery-slice-challenge-phase"
         data-render-path={path}>
      <p className="text-xs text-muted-foreground" data-testid="mastery-slice-opponent-progress">
        Opponent: {state.opponentChallengesCompleted} of {state.challengeCount} done
        {state.opponentFinished ? " — finished" : ""}
      </p>
      {path === "prose" ? (
        <ProseChallenge
          challenge={current}
          submitting={submitting}
          onSubmit={onSubmit}
        />
      ) : (
        <MasteryQuestionDispatch
          question={toPlayerQuestion(current, state.challengeCount, path)}
          total={state.challengeCount}
          submitting={submitting}
          onSubmit={onSubmit}
        />
      )}
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
  // The module runs its own multi-challenge submission flow, so the shell must
  // not also render the quiz answer flow or ability tray alongside it — same
  // contract as `item_cost_duel`.
  ownsSubmission: true,
  Viewport: MasterySliceViewport,
  projectQuestion: (_pub: PublicRoundView): QuestionView | null => null,
  summaryLabel: (pub) => {
    const state = pub.segmentState;
    if (!state) return null;
    return `Mastery step ${Math.min(state.ownNextChallengeIndex + 1, state.challengeCount)} of ${state.challengeCount}`;
  },
};
