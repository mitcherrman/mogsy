/**
 * Dev-only read-only comparison Mastery prototype (Phase 4C2).
 *
 * Proves the interaction dispatcher end to end for the two-champion
 * comparative interaction: `state = null`, `matchupIdentity = null`, prompt
 * rendered from `comparisonSemantics`, answer submitted and graded through
 * the SAME fixture-session flow the legacy and atomic-recall prototypes use
 * (`useMasteryFixtureSessionFrom`). No client-side grading; correctness is
 * taken verbatim from the reveal, same discipline as the other two paths.
 * Demonstrates a decisive ability comparison, a decisive champion-stat
 * comparison, and a true tie.
 *
 * Not routed publicly and not linked from navigation — see
 * `pages/dev/mastery/ComparisonPrototypePage.tsx`, gated behind
 * `ProtectedRoute` like every other `/dev/mastery/*` route.
 */
import { useEffect, useMemo } from "react";
import { comparisonQuestionEnvelopes, comparisonRevealEnvelopes } from "./comparisonFixtures";
import { MasteryQuestionDispatch, MasteryRevealDispatch } from "./registry";
import { useMasteryFixtureSessionFrom } from "../player/useMasteryFixtureSession";
import { MasteryCompletion } from "../player/MasteryCompletion";

export function ComparisonPrototype() {
  const questionEnvelopes = useMemo(() => comparisonQuestionEnvelopes(), []);
  const revealEnvelopes = useMemo(() => comparisonRevealEnvelopes(), []);
  const session = useMasteryFixtureSessionFrom(questionEnvelopes, revealEnvelopes);
  const { phase, start } = session;

  // Same dev seam as the atomic-recall prototype: skip the two-champion
  // "combat" intro screen (written for the legacy matchup framing) and start
  // the flow immediately on mount.
  useEffect(() => {
    if (phase === "intro") start();
  }, [phase, start]);

  return (
    <div data-testid="mastery-comparison-prototype" className="mx-auto w-full max-w-2xl space-y-4 p-4">
      {(phase === "question" || phase === "submitting") && session.question && (
        <MasteryQuestionDispatch
          key={session.index}
          question={session.question}
          total={session.totalSteps}
          submitting={phase === "submitting"}
          onSubmit={session.submit}
        />
      )}

      {(phase === "reveal" || phase === "advancing") && session.question && session.reveal && (
        <MasteryRevealDispatch
          key={`reveal-${session.index}`}
          question={session.question}
          reveal={session.reveal}
          submittedAnswer={session.submittedAnswer}
          isFinal={session.index + 1 >= session.totalSteps}
          onNext={session.next}
        />
      )}

      {phase === "completed" && (
        <MasteryCompletion
          results={session.results}
          finalState={session.finalState}
          onRestart={session.restart}
        />
      )}
    </div>
  );
}
