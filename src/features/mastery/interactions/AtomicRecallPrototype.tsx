/**
 * Dev-only read-only atomic-recall Mastery prototype (Phase 4C1).
 *
 * Proves the interaction dispatcher end to end for the new one-champion /
 * non-combat interaction: `state = null`, `matchupIdentity = null`,
 * `championB` absent, prompt rendered from `promptSemantics`, answer
 * submitted and graded through the SAME fixture-session flow the legacy
 * prototype uses (`useMasteryFixtureSessionFrom` — the generic core behind
 * `useMasteryFixtureSession`). No client-side grading; correctness is taken
 * verbatim from the reveal, same discipline as the legacy path.
 *
 * Not routed publicly and not linked from navigation — see
 * `pages/dev/mastery/AtomicRecallPrototypePage.tsx`, gated behind
 * `ProtectedRoute` like every other `/dev/mastery/*` route.
 */
import { useEffect, useMemo } from "react";
import { atomicRecallQuestionEnvelopes, atomicRecallRevealEnvelopes } from "./atomicRecallFixtures";
import { MasteryQuestionDispatch, MasteryRevealDispatch } from "./registry";
import { useMasteryFixtureSessionFrom } from "../player/useMasteryFixtureSession";
import { MasteryCompletion } from "../player/MasteryCompletion";

export function AtomicRecallPrototype() {
  const questionEnvelopes = useMemo(() => atomicRecallQuestionEnvelopes(), []);
  const revealEnvelopes = useMemo(() => atomicRecallRevealEnvelopes(), []);
  const session = useMasteryFixtureSessionFrom(questionEnvelopes, revealEnvelopes);
  const { phase, start } = session;

  // This dev seam skips the two-champion "{championA} E vs {championB} E"
  // intro screen (`player/MasteryIntro`) — it is written for the legacy
  // matchup framing and is a Phase 4C follow-up concern for atomic-recall
  // sets. Start the flow immediately on mount instead.
  useEffect(() => {
    if (phase === "intro") start();
  }, [phase, start]);

  return (
    <div data-testid="mastery-atomic-recall-prototype" className="mx-auto w-full max-w-2xl space-y-4 p-4">
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
