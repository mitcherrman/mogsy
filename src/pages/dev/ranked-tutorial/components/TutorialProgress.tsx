import { STEP_ORDER, STEPS } from "../tutorialSteps";
import { TutorialStepId } from "../types";

/** Step x/y progress indicator with an accessible progressbar semantic. */
export function TutorialProgress({ currentStepId }: { currentStepId: TutorialStepId }) {
  const index = STEP_ORDER.indexOf(currentStepId);
  const pct = Math.round(((index + 1) / STEP_ORDER.length) * 100);
  return (
    <div className="space-y-1" data-testid="tutorial-progress">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          Step {index + 1} of {STEP_ORDER.length}
        </span>
        <span className="font-medium">{STEPS[currentStepId].label}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Tutorial progress"
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={STEP_ORDER.length}
        aria-valuetext={`Step ${index + 1} of ${STEP_ORDER.length}: ${STEPS[currentStepId].label}`}
        className="h-1.5 rounded-full bg-muted overflow-hidden"
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
