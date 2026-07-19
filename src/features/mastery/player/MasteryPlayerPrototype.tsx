/**
 * Read-only Mastery player prototype (G5.2B).
 *
 * Self-contained: driven entirely by parsed fixture envelopes via
 * `useMasteryFixtureSession`. No live backend, no routing, no persistence. The
 * reveal is only ever passed to the reveal render path (the session gates it to
 * the `reveal`/`advancing` phases), so a pre-submission render cannot access
 * answer evidence.
 */
import { parseMasteryPlayerQuestion } from "../contracts/parsers";
import { playerQuestionEnvelopes } from "../fixtures";
import { useMasteryFixtureSession } from "./useMasteryFixtureSession";
import { MasteryIntro } from "./MasteryIntro";
import { MasteryQuestionView } from "./MasteryQuestionView";
import { MasteryRevealView } from "./MasteryRevealView";
import { MasteryCompletion } from "./MasteryCompletion";

// The intro shows the first question's SAFE framing (matchup + patch) before the
// flow starts, when `session.question` is intentionally null. Parse the step-0
// QUESTION envelope only — never a reveal or the reviewer artifact.
const introQuestion = parseMasteryPlayerQuestion(playerQuestionEnvelopes()[0]);

export function MasteryPlayerPrototype() {
  const session = useMasteryFixtureSession();
  const { phase } = session;

  return (
    <div data-testid="mastery-player-prototype" className="mx-auto w-full max-w-2xl space-y-4 p-4">
      {phase === "intro" && (
        <MasteryIntro
          firstQuestion={introQuestion}
          totalSteps={session.totalSteps}
          onStart={session.start}
        />
      )}

      {(phase === "question" || phase === "submitting") && session.question && (
        <MasteryQuestionView
          key={session.index}
          question={session.question}
          total={session.totalSteps}
          submitting={phase === "submitting"}
          onSubmit={session.submit}
        />
      )}

      {(phase === "reveal" || phase === "advancing") && session.question && session.reveal && (
        <MasteryRevealView
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
