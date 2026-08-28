/**
 * Atomic recall reveal screen (Phase 4C1).
 *
 * The one-champion / non-combat sibling of `player/MasteryRevealView`. Reuses
 * the same correctness/answer/explanation reveal pattern verbatim: correctness
 * comes ONLY from `reveal.authoritativeCorrectness` — never computed here.
 * There is no before/after champion state panel and no transition panel for
 * this interaction kind (no combat state exists to show).
 */
import { useEffect, useRef } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MasteryPlayerQuestion } from "../contracts/playerQuestion";
import type { MasteryPlayerReveal } from "../contracts/playerReveal";
import type { PlayerAnswer } from "../player/useMasteryFixtureSession";
import { formatNumber } from "../player/playerFormat";

function formatAnswer(value: PlayerAnswer | string | number | boolean): string {
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function AtomicRecallRevealView({
  question,
  reveal,
  submittedAnswer,
  isFinal,
  onNext,
}: {
  question: MasteryPlayerQuestion;
  reveal: MasteryPlayerReveal;
  submittedAnswer: PlayerAnswer | null;
  isFinal: boolean;
  onNext: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [reveal.sequenceIndex]);

  const correct = reveal.authoritativeCorrectness;
  const playerAnswer = submittedAnswer ?? reveal.playerAnswer;
  const unit = question.inputConstraints?.unit ?? null;

  return (
    <section aria-label="Result" className="space-y-4" data-testid="mastery-atomic-recall-reveal">
      <h2
        ref={headingRef}
        tabIndex={-1}
        data-testid="mastery-reveal-heading"
        className="text-base font-semibold outline-none"
      >
        Result
      </h2>

      <div
        role="status"
        aria-live="polite"
        data-testid="mastery-correctness"
        data-correct={correct ? "true" : "false"}
        className={`flex items-center gap-2 rounded-lg border p-3 ${
          correct
            ? "border-emerald-600/30 bg-emerald-500/10"
            : "border-destructive/30 bg-destructive/10"
        }`}
      >
        {correct ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
        ) : (
          <XCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
        )}
        <span className="font-semibold">{correct ? "Correct" : "Incorrect"}</span>
      </div>

      <dl className="space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="font-medium">Your answer:</dt>
          <dd className="tabular-nums">
            {formatAnswer(playerAnswer)}
            {unit ? ` ${unit}` : ""}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Correct answer:</dt>
          <dd data-testid="mastery-correct-answer" className="tabular-nums">
            {/* Backend-formatted at the precision it grades at, same as the
                legacy reveal — never re-rounded locally. */}
            {reveal.correctAnswerDisplay ?? formatAnswer(reveal.correctAnswer)}
            {unit ? ` ${unit}` : ""}
          </dd>
        </div>
      </dl>

      <p data-testid="mastery-explanation" className="text-sm">
        {reveal.explanation}
      </p>

      <Button onClick={onNext} data-testid="mastery-next-button" className="w-full sm:w-auto">
        {isFinal ? "View results" : "Next question"}
      </Button>
    </section>
  );
}
