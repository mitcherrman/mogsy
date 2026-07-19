import { Button } from "@/components/ui/button";
import { TutorialStepDefinition } from "../types";

/**
 * Compact coach panel: current step copy plus the primary forward control.
 * The announcement text is mirrored into an aria-live region so screen-reader
 * users hear each step change without a focus jump.
 */
export function InstructionPanel({
  step,
  onContinue,
  continueDisabled = false,
}: {
  step: TutorialStepDefinition;
  onContinue: () => void;
  /** Blocks advancement until the step's required action is done. */
  continueDisabled?: boolean;
}) {
  const showContinue = step.permittedEvents.includes("CONTINUE");
  // The locked step's forward control is an explicit, player-paced reveal.
  const continueLabel = step.id === "answer_locked" ? "Reveal answers" : "Continue";
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
      {showContinue && (
        <Button onClick={onContinue} disabled={continueDisabled} data-testid="continue-step">
          {continueLabel}
        </Button>
      )}
    </section>
  );
}
