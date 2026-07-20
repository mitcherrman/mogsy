/**
 * Left-panel ordered question list (G5.2C). Keyboard-selectable; the selected
 * row is announced via aria-current.
 */
import { Badge } from "@/components/ui/badge";
import type { MasteryReviewStep } from "../contracts/review";
import { formatQuestionFamily } from "../formatQuestionFamily";

function transitionLabel(step: MasteryReviewStep): string {
  if (step.transitionId) return "transition-bound";
  if (step.proposesDeferredTransition) return "read-only · proposes";
  return "read-only";
}

export function MasteryQuestionList({
  steps,
  selectedIndex,
  onSelect,
}: {
  steps: readonly MasteryReviewStep[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav aria-label="Mastery questions" data-testid="reviewer-question-list">
      <ol className="space-y-1">
        {steps.map((step, i) => {
          const selected = i === selectedIndex;
          return (
            <li key={step.stepId}>
              <button
                type="button"
                aria-current={selected ? "true" : undefined}
                data-testid={`reviewer-question-item-${i}`}
                onClick={() => onSelect(i)}
                className={`w-full rounded-md border p-2 text-left text-xs transition-colors motion-reduce:transition-none ${
                  selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">Q{i + 1}</span>
                  <span className="flex gap-1">
                    <Badge variant="secondary" className="text-[9px]">{step.answerType}</Badge>
                    <Badge
                      variant={step.rankedCapsuleEligibility.eligible ? "default" : "outline"}
                      className="text-[9px]"
                      data-testid={`reviewer-capsule-badge-${i}`}
                    >
                      {step.rankedCapsuleEligibility.eligible ? "capsule" : "chain-only"}
                    </Badge>
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{formatQuestionFamily(step.questionFamily)}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px]">{step.prompt}</p>
                <span className="mt-0.5 inline-block text-[10px] text-muted-foreground">
                  {transitionLabel(step)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
