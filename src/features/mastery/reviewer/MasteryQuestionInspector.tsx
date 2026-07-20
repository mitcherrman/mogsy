/**
 * Main-panel detail for the selected step (G5.2C). Read-only vs transition-bound
 * is made immediately visible. Focus moves to the heading when the selection
 * changes.
 */
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import type { MasteryReviewArtifact, MasteryReviewStep } from "../contracts/review";
import { formatQuestionFamily } from "../formatQuestionFamily";
import { IdValue, JsonDisclosure, KeyValueList, SectionHeading } from "./_shared";
import { MasterySnapshotComparison } from "./MasterySnapshotComparison";
import { MasteryCalculationInspector } from "./MasteryCalculationInspector";
import { MasteryEligibilityInspector } from "./MasteryEligibilityInspector";

export function MasteryQuestionInspector({
  step,
  artifact,
}: {
  step: MasteryReviewStep;
  artifact: MasteryReviewArtifact;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [step.stepId]);

  const cap = step.rankedCapsuleEligibility;

  return (
    <article aria-label={`Question ${step.sequenceIndex + 1} detail`} className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant={step.isReadOnly ? "secondary" : "default"}
            data-testid="detail-readonly-badge"
          >
            {step.isReadOnly ? "Read-only question" : "Transition-bound question"}
          </Badge>
          <Badge variant="outline" className="text-[10px]">{formatQuestionFamily(step.questionFamily)}</Badge>
          <Badge variant="outline" className="text-[10px]">{step.answerType}</Badge>
          {step.proposesDeferredTransition && (
            <Badge variant="outline" className="text-[10px]" data-testid="detail-proposes-badge">
              proposes deferred transition
            </Badge>
          )}
        </div>
        <h2
          ref={headingRef}
          tabIndex={-1}
          data-testid="reviewer-detail-heading"
          className="text-base font-semibold outline-none"
        >
          Q{step.sequenceIndex + 1}: {step.prompt}
        </h2>
      </div>

      <section aria-label="Answer" className="space-y-1">
        <SectionHeading>Answer</SectionHeading>
        <KeyValueList
          entries={[
            ["correct_answer", step.correctAnswer],
            ["answer_options", step.answerOptions.length ? step.answerOptions : "(none)"],
            ["hint", step.hint ?? "(none)"],
          ]}
        />
        <p className="text-xs" data-testid="detail-explanation">
          <span className="font-medium text-muted-foreground">explanation: </span>
          {step.explanation}
        </p>
      </section>

      <section aria-label="Canonical inputs" className="space-y-1" data-testid="detail-canonical-inputs">
        <SectionHeading>Canonical inputs</SectionHeading>
        <KeyValueList entries={Object.entries(step.canonicalInputs)} />
      </section>

      <MasterySnapshotComparison step={step} artifact={artifact} />

      <MasteryCalculationInspector calculationResult={step.calculationResult} />

      <MasteryEligibilityInspector step={step} />

      <section aria-label="Suppression state" className="space-y-1">
        <SectionHeading>Suppression state</SectionHeading>
        <KeyValueList
          entries={[
            ["suppressed", step.suppressionState.suppressed],
            ["reason_code", step.suppressionState.reasonCode ?? "(none)"],
          ]}
        />
      </section>

      <section aria-label="Ranked capsule eligibility" className="space-y-1">
        <SectionHeading>Ranked capsule eligibility</SectionHeading>
        <KeyValueList
          entries={[
            ["eligible", cap.eligible],
            ["requires_rewording", cap.requiresRewording],
            ["standalone_state_complete", cap.standaloneStateComplete],
            ["reason_code", cap.reasonCode ?? "(none)"],
          ]}
        />
      </section>

      <section aria-label="Identifiers" className="space-y-1">
        <SectionHeading>Identifiers</SectionHeading>
        <IdValue label="step ID" value={step.stepId} />
        <IdValue label="adapter ID" value={step.adapterId} />
        <IdValue label="operation type" value={step.operationType} />
        <IdValue label="transition ID" value={step.transitionId ?? "(none — read-only)"} />
      </section>

      <JsonDisclosure value={step} label="Raw step JSON" testId="detail-step-json-trigger" />
    </article>
  );
}
