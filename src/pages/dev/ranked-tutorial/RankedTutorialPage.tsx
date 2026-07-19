// ---------------------------------------------------------------------------
// /dev/ranked-tutorial — Ranked TUTORIAL on the canonical Ranked arena.
//
// The tutorial director (tutorialMachine + tutorialSteps + fixtures) drives
// the SHARED arena components through neutral view contracts and
// InteractionPermissions — the same game board real Ranked uses, with
// tutorial-controlled permissions, scripted content, and instruction.
// Fully local: no auth, no API calls, no ads, no persistence.
// ---------------------------------------------------------------------------

import { useEffect, useReducer, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { LevelUpPanel } from "@/components/ranked-arena/LevelUpPanel";
import { MatchOverFrame } from "@/components/ranked-arena/MatchOverFrame";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import { initialTutorialState, tutorialReducer, visibleState } from "./tutorialMachine";
import {
  abilityViewsFromTutorial,
  combatantViewsFromTutorial,
  permissionsFromTutorial,
  timerViewFromTutorial,
} from "./adapters";
import { TANK_LEVEL_TWO_OPTIONS, TANK_STARTER } from "./fixtures";
import { InstructionPanel } from "./components/InstructionPanel";
import { TutorialProgress } from "./components/TutorialProgress";
import { TrainingMatchShell } from "./components/TrainingMatchShell";
import { TutorialRoundArea } from "./components/TutorialRoundArea";
import { QueueSimulationPanel } from "./components/QueueSimulationPanel";
import { RecoverySimulationPanel } from "./components/RecoverySimulationPanel";
import { AdsProEducationPanel } from "./components/AdsProEducationPanel";
import { TutorialCompletePanel } from "./components/TutorialCompletePanel";

const COACH_NOTES: Record<string, string> = {
  answer: "Training tip: that answer won't land this lesson — Edit and pick again.",
  ability: "Training tip: this lesson needs a different ability setup — Edit before locking.",
};

export default function RankedTutorialPage() {
  const [state, dispatch] = useReducer(tutorialReducer, undefined, initialTutorialState);
  const view = visibleState(state);
  const instructionRef = useRef<HTMLDivElement>(null);

  // Pause the countdown while the tab is hidden (Alt-Tab, minimize, tab switch)
  // so no tutorial time advances in the background. Losing focus never resets
  // state — only the ticking is suspended, and it resumes on return.
  const [documentHidden, setDocumentHidden] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );
  useEffect(() => {
    const onVisibilityChange = () => setDocumentHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // Reducer-driven countdown: the interval only emits TICK events; all
  // timer semantics (pressure cut, warning, floor) live in the machine. The
  // interval is torn down while hidden and re-created on return, so a
  // backgrounded tab never advances the timer.
  const timerRunning = view.timer.running;
  useEffect(() => {
    if (!timerRunning || documentHidden) return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [timerRunning, documentHidden]);

  // Move focus to the instruction area after each major step transition so
  // keyboard and screen-reader users land on the new explanation.
  const stepId = state.stepId;
  useEffect(() => {
    // The completion panel moves focus to its own heading instead.
    if (stepId === "complete") return;
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

  // From the Fortify lesson onward, the full ability tray is in play.
  const abilityTrayActive =
    stepId === "starter_ability_intro" ||
    stepId === "ability_resolution" ||
    stepId === "level_three_unlock" ||
    stepId === "victory_round";

  const combatants = combatantViewsFromTutorial(state);
  const timer = timerViewFromTutorial(state);
  const permissions = permissionsFromTutorial(state, roundInteractive);
  const coachNote = view.round?.coachNudge ? COACH_NOTES[view.round.coachNudge] : null;

  const showRoundArea =
    view.round !== null &&
    stepId !== "level_two_choice" &&
    stepId !== "match_over" &&
    stepId !== "queue_explanation" &&
    stepId !== "reconnect_explanation" &&
    stepId !== "ads_pro_explanation" &&
    stepId !== "complete";

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
        player={combatants.player}
        opponent={combatants.opponent}
        timer={timer}
      >
        <div ref={instructionRef} tabIndex={-1} className="outline-none space-y-4">
          <InstructionPanel
            step={view.step}
            onBegin={() => dispatch({ type: "BEGIN_TRAINING" })}
            onContinue={() => dispatch({ type: "CONTINUE" })}
            continueDisabled={
              (stepId === "both_correct_demo" ||
                stepId === "failure_demo" ||
                stepId === "starter_ability_intro" ||
                stepId === "ability_resolution" ||
                stepId === "level_three_unlock" ||
                stepId === "victory_round") &&
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
            <LevelUpPanel
              event={{
                kind: "level2-choice",
                options: TANK_LEVEL_TWO_OPTIONS.map((a) => ({
                  id: a.id,
                  name: a.name,
                  description: a.description,
                })),
                pendingOptionId: view.pendingLevelTwoChoiceId,
                confirmedOptionId: view.chosenLevelTwoAbilityId,
              }}
              permissions={
                view.chosenLevelTwoAbilityId
                  ? NO_INTERACTIONS
                  : {
                      ...NO_INTERACTIONS,
                      canSelectAbility: true,
                      canConfirmSubmission: view.pendingLevelTwoChoiceId !== null,
                    }
              }
              onSelectOption={(optionId) =>
                dispatch({ type: "CHOOSE_LEVEL_TWO", abilityId: optionId })
              }
              onConfirmOption={() => dispatch({ type: "CONFIRM_LEVEL_TWO" })}
            />
          )}

          {stepId === "queue_explanation" && (
            <QueueSimulationPanel done={view.queueSimulationDone} dispatch={dispatch} />
          )}
          {stepId === "reconnect_explanation" && (
            <RecoverySimulationPanel
              done={view.recoverySimulationDone}
              player={view.player}
              fortifyCharges={view.charges[TANK_STARTER.id] ?? 0}
              dispatch={dispatch}
            />
          )}
          {stepId === "ads_pro_explanation" && <AdsProEducationPanel />}
          {stepId === "complete" && <TutorialCompletePanel dispatch={dispatch} />}

          {stepId === "match_over" && (
            <MatchOverFrame
              result="victory"
              player={combatants.player}
              opponent={combatants.opponent}
              heading="Victory!"
              subheading="Training match complete — the Golem is at 0 HP."
              summary={
                <div className="space-y-2" data-testid="match-over-summary-content">
                  <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5">
                    <li>Correct answers deal damage.</li>
                    <li>Both players may deal damage in the same round.</li>
                    <li>XP unlocks abilities — HP decides the winner.</li>
                    <li>Ability charges are limited; armed means committed.</li>
                    <li>Zero HP ends the match.</li>
                  </ul>
                  <p className="text-sm font-medium" data-testid="no-mutation-note">
                    This training match did not affect your rating, history, or
                    permanent progression.
                  </p>
                </div>
              }
              primaryAction={{
                label: "Continue",
                onClick: () => dispatch({ type: "CONTINUE" }),
              }}
            />
          )}

          {showRoundArea && view.round && (
            <TutorialRoundArea
              round={view.round}
              abilities={abilityViewsFromTutorial(state)}
              showAbilityTray={abilityTrayActive}
              permissions={permissions}
              coachNote={coachNote}
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
