/**
 * Reveal screen (G5.2B; J1 player-safe redesign).
 *
 * Renders backend-authoritative reveal evidence as pass-through. Correctness comes
 * ONLY from `authoritativeCorrectness` — never computed here — and is communicated
 * with an icon AND text (not colour alone). Player hierarchy: result → answers →
 * one-line explanation → state update → concise calculation (progressive
 * disclosure) → next. No raw engine expressions, snapshot/artifact digests, or
 * internal slugs are shown to players (those live on the admin reviewer route).
 */
import { useEffect, useRef } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import type { MasteryPlayerQuestion } from "../contracts/playerQuestion";
import type { MasteryPlayerReveal } from "../contracts/playerReveal";
import type { PlayerAnswer } from "./useMasteryFixtureSession";
import { MasteryStatePanel } from "./MasteryStatePanel";
import { MasteryTransitionPanel } from "./MasteryTransitionPanel";
import { formatNumber } from "./playerFormat";

function formatAnswer(value: PlayerAnswer | string | number | boolean, question: MasteryPlayerQuestion): string {
  if (typeof value === "boolean") {
    if (question.answerType === "boolean" && question.answerOptions.length === 2) {
      return value ? question.answerOptions[1] : question.answerOptions[0];
    }
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") return formatNumber(value);
  return String(value);
}

export function MasteryRevealView({
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
  const transition = reveal.appliedTransition ?? reveal.proposedTransition;
  const champA = reveal.afterState.championA.displayName ?? reveal.afterState.championA.championId;
  const champB = reveal.afterState.championB.displayName ?? reveal.afterState.championB.championId;

  return (
    <section aria-label="Result" className="space-y-4">
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
          <dd className="tabular-nums">{formatAnswer(playerAnswer, question)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Correct answer:</dt>
          <dd data-testid="mastery-correct-answer" className="tabular-nums">
            {formatAnswer(reveal.correctAnswer, question)}
          </dd>
        </div>
      </dl>

      <p data-testid="mastery-explanation" className="text-sm">{reveal.explanation}</p>

      {transition && (
        <MasteryTransitionPanel transition={transition} championA={champA} championB={champB} />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <MasteryStatePanel state={reveal.beforeState} heading="Before" />
        <MasteryStatePanel state={reveal.afterState} heading="After" />
      </div>

      {reveal.calculationSteps.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger
            data-testid="mastery-calc-trigger"
            className="text-xs font-medium text-primary underline underline-offset-2"
          >
            Show calculation
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ol className="mt-2 space-y-1" data-testid="mastery-calc-steps">
              {reveal.calculationSteps.map((s) => (
                <li key={s.order} className="flex justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">{s.description}</span>
                  <span className="shrink-0 tabular-nums font-medium">{formatNumber(s.result)}</span>
                </li>
              ))}
            </ol>
          </CollapsibleContent>
        </Collapsible>
      )}

      <Separator />

      <Button onClick={onNext} data-testid="mastery-next-button" className="w-full sm:w-auto">
        {isFinal ? "View results" : "Next question"}
      </Button>
    </section>
  );
}
