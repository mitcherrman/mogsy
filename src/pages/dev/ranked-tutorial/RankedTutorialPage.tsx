// ---------------------------------------------------------------------------
// THE RANKED TUTORIAL — the production Ranked arena, with a teacher in it.
//
// ARENA1 Step 4. The tutorial used to compose the arena itself: a shell of its
// own (`TrainingMatchShell`), its own round area stitching a question surface,
// an ability tray and a submission review together (`TutorialRoundArea`), and
// its own select → review → confirm answer flow, which production Ranked had
// already retired. All of that is gone. What renders now is `CanonicalArena` —
// the same component `QuizRankedMatch` renders — reading a view model this
// page's adapter projects out of `tutorialMachine`.
//
// WHAT THIS FILE STILL OWNS, AND ONLY THIS:
//   * the director — the machine, the step order, the countdown, focus
//     management, and which steps are interactive;
//   * the teaching CONTENT — the coach panel, the scripted simulation panels,
//     the completion panel, and the match-over summary;
//   * the tutorial's own chrome — the step progress bar and Restart.
//
// The arena receives that teaching content through ONE slot (`guidance`) and
// never learns what any of it is.
//
// Fully local: no auth, no API calls, no ads, no persistence.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import type { ArenaTerminalView } from "@/lib/ranked-core/arenaView";
import { initialTutorialState, tutorialReducer, visibleState } from "./tutorialMachine";
import type { TutorialTrack } from "./types";
import {
  combatantViewsFromTutorial, TUTORIAL_NAMES_BY_ID,
} from "./adapters";
import { currentSettlement, tutorialArenaView } from "./tutorialArenaView";
import { TANK_LEVEL_TWO_OPTIONS, TANK_STARTER } from "./fixtures";
import { InstructionPanel } from "./components/InstructionPanel";
import { RoundRevealCoach } from "./components/RoundRevealCoach";
import { TutorialProgress } from "./components/TutorialProgress";
import { QueueSimulationPanel } from "./components/QueueSimulationPanel";
import { RecoverySimulationPanel } from "./components/RecoverySimulationPanel";
import { AdsProEducationPanel } from "./components/AdsProEducationPanel";
import { TutorialCompletePanel } from "./components/TutorialCompletePanel";

export default function RankedTutorialPage({ track = "legacy" }: { track?: TutorialTrack } = {}) {
  // The track is fixed for the life of the run: `useReducer`'s initializer
  // runs once, and RESTART carries the track forward. Defaults to the
  // complete legacy tutorial, so the dev route and every existing caller are
  // unchanged.
  const [state, dispatch] = useReducer(
    tutorialReducer, track, initialTutorialState);
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

  // R1: a no-progression training match has no ability layer to show. The
  // ability STEPS are already absent from the R1 order; this covers the one
  // step that survives it (`victory_round`), so the tray never appears on a
  // track that never taught it. The legacy track is untouched.
  const abilityLayerTaught = state.track !== "r1";

  // From the Fortify lesson onward, the full ability tray is in play.
  const abilityTrayActive =
    abilityLayerTaught && (
      stepId === "starter_ability_intro" ||
      stepId === "ability_resolution" ||
      stepId === "level_three_unlock" ||
      stepId === "victory_round");

  const arena = useMemo(() => tutorialArenaView(state, {
    roundInteractive,
    abilityTrayActive,
    levelTwoChoiceOpen: stepId === "level_two_choice",
    levelTwoOptions: TANK_LEVEL_TWO_OPTIONS.map((a) => ({
      id: a.id, name: a.name, description: a.description,
    })),
  }, dispatch), [state, roundInteractive, abilityTrayActive, stepId]);

  /**
   * THE TERMINAL FRAME, at the one step that is about the match ending.
   *
   * The three education steps that follow (queue, recovery, ads) and the
   * completion panel are not about the result, so they return to the live
   * arena — the duelists, the ledgers and the finished timeline stay on screen
   * behind their lesson, which is the point of putting the tutorial in the
   * arena at all.
   */
  const terminal: ArenaTerminalView | null = stepId === "match_over" ? {
    result: "victory",
    player: combatantViewsFromTutorial(state).player,
    opponent: combatantViewsFromTutorial(state).opponent,
    heading: "Victory!",
    subheading: "Training match complete — the Golem is at 0 HP.",
    summary: (
      <div className="space-y-2" data-testid="match-over-summary-content">
        <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5">
          <li>Correct answers deal damage.</li>
          <li>Both players may deal damage in the same round.</li>
          {abilityLayerTaught ? (
            <>
              <li>XP unlocks abilities — HP decides the winner.</li>
              <li>Ability charges are limited; armed means committed.</li>
            </>
          ) : (
            <li>XP tracks the match — HP decides the winner.</li>
          )}
          <li>Zero HP ends the match.</li>
        </ul>
        <p className="text-sm font-medium" data-testid="no-mutation-note">
          This training match did not affect your rating, history, or
          permanent progression.
        </p>
      </div>
    ),
    progressionEnabled: abilityLayerTaught,
    primaryAction: { label: "Continue", onClick: () => dispatch({ type: "CONTINUE" }) },
    reveal: (() => {
      const settlement = currentSettlement(state);
      return settlement ? {
        settlement,
        viewerSlot: "p1" as const,
        namesByPlayerId: TUTORIAL_NAMES_BY_ID,
        showAbilities: abilityLayerTaught,
      } : null;
    })(),
  } : null;

  /**
   * THE TEACHING, in the arena's guidance slot.
   *
   * Everything below is tutorial-owned copy and tutorial-owned controls. None
   * of it renders a game surface: the question, the answers, the abilities,
   * the timer, the duelists, the reveal and the timeline are all the arena's,
   * and this only says what to do about them.
   */
  const guidance = (
    <div ref={instructionRef} tabIndex={-1}
      className="outline-none space-y-4" data-testid="tutorial-guidance">
      <InstructionPanel
        step={view.step}
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
      {/* The settled round, explained. Canonical reveal component, tutorial
          placement: the arena has already turned the tablets over and resolved
          both rails — this says which option each side picked and why the
          round went the way it did. */}
      {view.round && !terminal && (
        <RoundRevealCoach round={view.round} track={state.track} />
      )}
      {stepId === "failure_demo" && view.round?.phase !== "revealed" && (
        <Button
          variant="secondary"
          onClick={() => dispatch({ type: "SIMULATE_TIMEOUT" })}
          data-testid="simulate-timeout"
        >
          Demonstrate timeout
        </Button>
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
    </div>
  );

  /**
   * The tutorial's own chrome, in the shell's header slot.
   *
   * `arenaHeaderRowClass` is the SHELL's geometry for this row — it is what
   * clears the shell's fixed "League Hub" pill at each width, and Ranked's own
   * header row uses it for the same reason. The CONTENT below is the
   * tutorial's; the row's clearance is not the tutorial's to reinvent.
   */
  const chrome = (
    <div className="space-y-3">
      <header className={`${arenaHeaderRowClass("wide")} flex-wrap gap-2`}>
        <h1 className="ranked-title text-lg font-bold leading-tight">Training Match</h1>
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
    </div>
  );

  return (
    <CanonicalArena
      view={terminal ? null : arena}
      terminal={terminal}
      chrome={chrome}
      guidance={guidance}
    />
  );
}
