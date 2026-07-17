// ---------------------------------------------------------------------------
// /dev/ranked-tutorial — isolated Ranked TUTORIAL prototype (Phase E2.2).
//
// A deterministic, scripted Training Match that teaches Ranked mechanics.
// Fully local: no auth, no API calls, no ads, no persistence, no production
// Ranked state. Intentionally not linked from any navigation or the sitemap.
// ---------------------------------------------------------------------------

import { useReducer } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { initialTutorialState, tutorialReducer, visibleState } from "./tutorialMachine";
import { InstructionPanel } from "./components/InstructionPanel";
import { TutorialProgress } from "./components/TutorialProgress";
import { TrainingMatchShell } from "./components/TrainingMatchShell";

export default function RankedTutorialPage() {
  const [state, dispatch] = useReducer(tutorialReducer, undefined, initialTutorialState);
  const view = visibleState(state);

  return (
    <main className="container max-w-4xl mx-auto px-4 py-6 space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">Training Match</h1>
        <Badge variant="secondary">Ranked tutorial · scripted practice</Badge>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto gap-1"
          onClick={() => dispatch({ type: "RESTART" })}
          data-testid="restart-tutorial"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Restart
        </Button>
      </header>

      <TutorialProgress currentStepId={state.stepId} />

      <TrainingMatchShell
        player={view.player}
        opponent={view.opponent}
        timerMode={view.timerMode}
        timerSeconds={view.timerSeconds}
      >
        <InstructionPanel
          step={view.step}
          onBegin={() => dispatch({ type: "BEGIN_TRAINING" })}
          onContinue={() => dispatch({ type: "CONTINUE" })}
        />
      </TrainingMatchShell>

      <p className="text-[11px] text-muted-foreground">
        Development prototype. Nothing in this tutorial is saved and nothing
        affects Ranked rating, history, or progression.
      </p>
    </main>
  );
}
