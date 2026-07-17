// ---------------------------------------------------------------------------
// /dev/ranked-tutorial — isolated Ranked TUTORIAL prototype (Phase E2.3).
//
// A deterministic, scripted Training Match that teaches Ranked mechanics.
// Fully local: no auth, no API calls, no ads, no persistence, no production
// Ranked state. Intentionally not linked from any navigation or the sitemap.
// ---------------------------------------------------------------------------

import { useEffect, useReducer, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { initialTutorialState, tutorialReducer, visibleState } from "./tutorialMachine";
import { InstructionPanel } from "./components/InstructionPanel";
import { TutorialProgress } from "./components/TutorialProgress";
import { TrainingMatchShell } from "./components/TrainingMatchShell";
import { AnswerRoundPanel } from "./components/AnswerRoundPanel";
import { AbilityPanel } from "./components/AbilityPanel";
import { LevelTwoChoicePanel } from "./components/LevelTwoChoicePanel";
import { MatchOverPanel } from "./components/MatchOverPanel";

export default function RankedTutorialPage() {
  const [state, dispatch] = useReducer(tutorialReducer, undefined, initialTutorialState);
  const view = visibleState(state);
  const instructionRef = useRef<HTMLDivElement>(null);

  // Reducer-driven countdown: the interval only emits TICK events; all
  // timer semantics (pressure cut, warning, floor) live in the machine.
  const timerRunning = view.timer.running;
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  // Move focus to the instruction area after each major step transition so
  // keyboard and screen-reader users land on the new explanation.
  const stepId = state.stepId;
  useEffect(() => {
    instructionRef.current?.focus();
  }, [stepId]);

  const roundInteractive =
    stepId === "answer_selection" ||
    stepId === "both_correct_demo" ||
    stepId === "failure_demo" ||
    stepId === "starter_ability_intro" ||
    stepId === "ability_resolution" ||
    stepId === "level_three_unlock" ||
    stepId === "victory_round";

  // From the Fortify lesson onward, the dedicated AbilityPanel owns arming.
  const abilityPanelActive =
    stepId === "starter_ability_intro" ||
    stepId === "ability_resolution" ||
    stepId === "level_two_choice" ||
    stepId === "level_three_unlock" ||
    stepId === "victory_round" ||
    stepId === "match_over";

  const armedChargesBefore =
    view.round?.playerAbilityId != null
      ? view.charges[view.round.playerAbilityId] ?? null
      : null;

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

      {/* Dynamic announcements (lock, reveal, damage, XP, level, timer
          warnings). Separate from the per-step instruction live region. */}
      <div aria-live="polite" className="sr-only" data-testid="event-live">
        {view.lastAnnouncement}
      </div>

      <TrainingMatchShell
        player={view.player}
        opponent={view.opponent}
        timerMode={view.timerMode}
        timer={view.timer}
      >
        <div ref={instructionRef} tabIndex={-1} className="outline-none space-y-4">
          <InstructionPanel
            step={view.step}
            onBegin={() => dispatch({ type: "BEGIN_TRAINING" })}
            onContinue={() => dispatch({ type: "CONTINUE" })}
            continueDisabled={
              (stepId === "both_correct_demo" || stepId === "failure_demo") &&
              view.round?.phase !== "revealed" &&
              view.round?.phase !== "locked"
            }
          />
          {stepId === "failure_demo" && view.round?.phase !== "revealed" && (
            <Button
              variant="secondary"
              onClick={() => dispatch({ type: "SIMULATE_TIMEOUT" })}
              data-testid="simulate-timeout"
            >
              Demonstrate timeout
            </Button>
          )}
          {stepId === "level_two_choice" && (
            <LevelTwoChoicePanel
              pendingId={view.pendingLevelTwoChoiceId}
              chosenId={view.chosenLevelTwoAbilityId}
              dispatch={dispatch}
            />
          )}
          {stepId === "match_over" ? (
            <MatchOverPanel
              player={view.player}
              opponent={view.opponent}
              charges={view.charges}
              unlockedIds={view.unlockedAbilityIds}
            />
          ) : (
            view.round &&
            stepId !== "level_two_choice" && (
              <AnswerRoundPanel
                round={view.round}
                interactive={roundInteractive}
                dispatch={dispatch}
                hideAbilitySelector={abilityPanelActive}
                chargesBeforeResolution={armedChargesBefore}
              />
            )
          )}
          {abilityPanelActive && stepId !== "match_over" && (
            <AbilityPanel
              charges={view.charges}
              unlockedIds={view.unlockedAbilityIds}
              chosenLevelTwoAbilityId={view.chosenLevelTwoAbilityId}
              playerLevel={view.player.level}
              round={view.round}
              interactive={roundInteractive}
              dispatch={dispatch}
            />
          )}
        </div>
      </TrainingMatchShell>

      <p className="text-[11px] text-muted-foreground">
        Development prototype. Nothing in this tutorial is saved and nothing
        affects Ranked rating, history, or progression. Training damage
        numbers are demonstrations, not Ranked balance.
      </p>
    </main>
  );
}
