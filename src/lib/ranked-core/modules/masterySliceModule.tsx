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

import { useEffect, useState } from "react";
import {
  MasterySliceChallengeSurface,
  ProseChallenge,
  questionViewForChallenge,
  renderPathFor,
  toPlayerQuestion,
  type MasterySliceRenderPath,
} from "./MasterySliceChallengeSurface";
import {
  revealDurationMs,
  useRevealAutoAdvance,
  type MasteryQuestionReveal,
} from "@/features/mastery/interactions/revealState";
import type { PlayerAnswer } from "@/features/mastery/player/useMasteryFixtureSession";
import type { QuestionView } from "@/lib/ranked-core/viewTypes";
import type {
  MasteryChallengeReveal,
  MasterySliceChallengeView,
  PublicRoundView,
  SegmentStateView,
} from "@/lib/ranked-public/contracts";
import { MASTERY_SLICE_MODULE_ID } from "@/lib/ranked-public/contracts";
import type { ModuleRenderer, ModuleViewportProps } from "./types";

export const MASTERY_SLICE_MODULE_VERSION = 1;
export { MASTERY_SLICE_MODULE_ID };

// The dispatch rule, the two challenge adapters and the prose renderer moved
// to `MasterySliceChallengeSurface` so the Admin Generator Lab draws a
// challenge through the SAME component this module does rather than through a
// lookalike. Re-exported here because they were this module's public surface
// and several suites and callers import them from it; the definitions are
// there, and there is still exactly one of each.
export {
  renderPathFor, questionViewForChallenge, ProseChallenge,
  MasterySliceChallengeSurface, toPlayerQuestion,
};
export type { MasterySliceRenderPath };

/**
 * The server's per-challenge reveal, in the shape the shared Mastery renderers
 * take. A straight field mapping: correctness, the winning/correct value and
 * the explanation are all stated by the backend and passed through unchanged.
 *
 * A comparison's correct value is a champion id, and the delegated renderers
 * already map an option value back to the label the player was offered — so
 * `answerLabel` is left null for a comparison and the tinted green option
 * carries the answer, rather than this file learning a champion lookup.
 */
function toQuestionReveal(
  reveal: MasteryChallengeReveal,
  challenge: MasterySliceChallengeView,
): MasteryQuestionReveal {
  const isComparison = challenge.interactionKind === "comparison_left_right";
  return {
    correct: reveal.isCorrect,
    correctValue: reveal.correctAnswer,
    selectedValue: reveal.playerAnswer,
    answerLabel: isComparison ? null : reveal.correctAnswer,
    explanation: reveal.explanation,
  };
}

function MasterySliceChallengePhase({ state, actions }: {
  state: SegmentStateView;
  actions: ModuleViewportProps["actions"];
}) {
  const challenges: MasterySliceChallengeView[] =
    state.block?.contract === "mastery_slice" ? state.block.challenges : [];
  const serverIndex = state.ownNextChallengeIndex;

  // ---- the reveal hold -----------------------------------------------------
  //
  // The server has ALREADY moved this viewer to the next challenge the instant
  // their answer was accepted — that is what stops their competitive clock. The
  // reveal is therefore a purely local hold in front of a position the server
  // has already decided, which is why it can never desynchronise anything: no
  // index is incremented here, no answer is resubmitted, and letting the hold
  // lapse simply renders what the server was already saying.
  //
  // `dismissed` is the highest challenge index whose reveal has been shown to
  // completion. It only ever moves forward, so a poll that re-delivers the same
  // state cannot re-open a reveal the player has already watched.
  const [dismissed, setDismissed] = useState(-1);
  // THE COMPETITIVE-SAFETY GATE. A hold is only ever entered when the server
  // states a reveal window for THIS segment, because that window is also what
  // bought the player the time to sit through it — the backend extends the
  // block deadline and stops the response clock by exactly that number. So a
  // segment that budgeted nothing is never paused for, even if reveals somehow
  // arrived beside it. The backend couples the two at the source; this refuses
  // to pause on the strength of reveals alone rather than trusting that.
  const windowMs = state.revealWindowMs;
  const settled = windowMs && windowMs > 0 ? state.ownChallengeReveals : [];
  const latest: MasteryChallengeReveal | null =
    settled.length > 0 ? settled[settled.length - 1] : null;
  const holding = latest !== null && latest.challengeIndex > dismissed
    ? latest : null;

  // ONE timer, keyed on the held challenge's own index — so a duplicate poll,
  // a re-render, or a second state update cannot stack a second advance, and a
  // timer armed for an earlier challenge can never dismiss a later reveal.
  //
  // RELOAD/RESUME: the reveal is re-derived from persisted rows on every poll,
  // so a reload mid-reveal simply finds the same `holding` and arms the timer
  // fresh on mount. The remaining milliseconds are deliberately NOT
  // reconstructed: there is no persisted reveal-start to reconstruct them from,
  // and showing the full window again is the simplest behaviour that cannot
  // affect scoring — the server subtracts exactly one window from the next
  // challenge's response time regardless of how long the client actually
  // paused, and no answer or advance is re-submitted.
  useRevealAutoAdvance(
    holding ? holding.challengeIndex : null,
    () => setDismissed(holding ? holding.challengeIndex : -1),
    revealDurationMs(windowMs),
  );

  const revealed = holding ? challenges[holding.challengeIndex] ?? null : null;
  const current = revealed ?? challenges[serverIndex];

  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => {
    setPending((p) => (p !== null && p !== serverIndex ? null : p));
  }, [serverIndex]);

  if ((state.ownFinished && !revealed) || !current) {
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
    setPending(serverIndex);
    actions.submitChallenge(serverIndex, { selected: answer });
  };
  const path = renderPathFor(current);
  const reveal = holding && revealed ? toQuestionReveal(holding, revealed) : null;

  return (
    // `data-challenge-index` names which challenge is actually on screen — the
    // answered one during its reveal hold, the server's next one otherwise.
    <div className="space-y-3" data-testid="mastery-slice-challenge-phase"
         data-render-path={path}
         data-challenge-index={current.challengeIndex}
         data-revealing={reveal ? "true" : undefined}>
      <p className="text-xs text-muted-foreground" data-testid="mastery-slice-opponent-progress">
        Opponent: {state.opponentChallengesCompleted} of {state.challengeCount} done
        {state.opponentFinished ? " — finished" : ""}
      </p>
      {/* THE SHARED SURFACE. The same component the Admin Generator Lab
          draws a challenge with, so "is this what a player would see?" is
          answered by identity rather than by resemblance. Keyed on the
          challenge index so a new challenge mounts fresh rather than
          inheriting the previous one's local selection state. */}
      <MasterySliceChallengeSurface
        key={current.challengeIndex}
        challenge={current}
        total={state.challengeCount}
        submitting={submitting}
        onSubmit={onSubmit}
        reveal={reveal}
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
