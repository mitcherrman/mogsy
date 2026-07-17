import { Button } from "@/components/ui/button";
import { TutorialStepDefinition } from "../types";

/**
 * Compact coach panel: current step copy plus the primary forward control.
 * The announcement text is mirrored into an aria-live region so screen-reader
 * users hear each step change without a focus jump.
 */
export function InstructionPanel({
  step,
  onBegin,
  onContinue,
}: {
  step: TutorialStepDefinition;
  onBegin: () => void;
  onContinue: () => void;
}) {
  const showBegin = step.permittedEvents.includes("BEGIN_TRAINING");
  const showContinue = step.permittedEvents.includes("CONTINUE");
  return (
    <section
      aria-label="Tutorial instructions"
      className="rounded-xl border-2 border-primary/40 bg-card p-4 space-y-3"
      data-testid="instruction-panel"
    >
      <div aria-live="polite" data-testid="instruction-live">
        <h2 className="text-lg font-bold leading-tight">{step.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
        <span className="sr-only">{step.announcement}</span>
      </div>
      {showBegin && (
        <Button onClick={onBegin} data-testid="begin-training">
          Begin Training
        </Button>
      )}
      {showContinue && (
        <Button onClick={onContinue} data-testid="continue-step">
          Continue
        </Button>
      )}
    </section>
  );
}
