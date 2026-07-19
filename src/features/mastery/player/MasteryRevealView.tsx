/**
 * Reveal screen (G5.2B). Renders backend-authoritative reveal evidence as
 * pass-through. Correctness comes ONLY from `authoritativeCorrectness` — never
 * computed here — and is communicated with an icon AND text (not colour alone).
 * Calculation expressions are displayed verbatim and never evaluated. Focus moves
 * to the result heading on mount (i.e. after submit).
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

function formatAnswer(value: PlayerAnswer | string | number | boolean, question: MasteryPlayerQuestion): string {
  if (typeof value === "boolean") {
    if (question.answerType === "boolean" && question.answerOptions.length === 2) {
      return value ? question.answerOptions[1] : question.answerOptions[0];
    }
    return value ? "Yes" : "No";
  }
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
        className="flex items-center gap-2"
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

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Calculation
        </h3>
        <ol className="space-y-1" data-testid="mastery-calc-steps">
          {reveal.calculationSteps.map((s) => (
            <li key={s.order} className="text-xs">
              <span className="text-muted-foreground">{s.description}: </span>
              <code className="break-all">{s.expression}</code>
              <span className="tabular-nums font-medium"> = {s.result}</span>
            </li>
          ))}
        </ol>
      </div>

      <Separator />

      <div className="grid gap-3 sm:grid-cols-2">
        <MasteryStatePanel state={reveal.beforeState} heading="Before" />
        <MasteryStatePanel state={reveal.afterState} heading="After" />
      </div>

      {reveal.appliedTransition && (
        <MasteryTransitionPanel
          transition={reveal.appliedTransition}
          beforeSnapshotId={reveal.beforeState.snapshotId}
          afterSnapshotId={reveal.afterState.snapshotId}
          heading="Applied transition"
        />
      )}
      {reveal.proposedTransition && (
        <MasteryTransitionPanel transition={reveal.proposedTransition} heading="Proposed transition" />
      )}

      <Collapsible>
        <CollapsibleTrigger
          data-testid="mastery-provenance-trigger"
          className="text-[11px] text-muted-foreground underline underline-offset-2"
        >
          Provenance &amp; technical details
        </CollapsibleTrigger>
        <CollapsibleContent>
          <dl className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
            <div className="flex gap-1">
              <dt className="shrink-0 font-medium">Source:</dt>
              <dd>{reveal.sourceSummary.label} ({reveal.sourceSummary.sourceCount})</dd>
            </div>
            <div className="flex gap-1">
              <dt className="shrink-0 font-medium">Artifact:</dt>
              <dd className="truncate" title={reveal.artifactDigest}>{reveal.artifactDigest}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="shrink-0 font-medium">Before snapshot:</dt>
              <dd className="truncate" title={reveal.beforeState.snapshotId}>{reveal.beforeState.snapshotId}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="shrink-0 font-medium">After snapshot:</dt>
              <dd className="truncate" title={reveal.afterState.snapshotId}>{reveal.afterState.snapshotId}</dd>
            </div>
          </dl>
        </CollapsibleContent>
      </Collapsible>

      <Button onClick={onNext} data-testid="mastery-next-button">
        {isFinal ? "See summary" : "Next question"}
      </Button>
    </section>
  );
}
