// ---------------------------------------------------------------------------
// Ranked TUTORIAL — pure state machine.
//
// Deterministic reducer over the authored step table. No I/O, no timers, no
// randomness, no persistence, no production Ranked state. Invalid or
// unpermitted events always return the state unchanged.
// ---------------------------------------------------------------------------

import {
  TutorialEvent,
  TutorialState,
  TutorialStepDefinition,
  TutorialStepId,
} from "./types";
import { STEPS, STEP_ORDER, nextStepId, stepIndex } from "./tutorialSteps";
import {
  LEVEL_THRESHOLDS,
  MAX_LEVEL,
  ROUND_SECONDS,
  TANK_STARTING_HP,
} from "./fixtures";

/** Fresh training-match state. Both combatants are full-HP Level 1 Tanks. */
export const initialTutorialState = (): TutorialState => ({
  stepId: "welcome",
  player: { hp: TANK_STARTING_HP, maxHp: TANK_STARTING_HP, xp: 0, level: 1 },
  opponent: { hp: TANK_STARTING_HP, maxHp: TANK_STARTING_HP, xp: 0, level: 1 },
  pendingAnswerIndex: null,
  pendingAbilityId: null,
  submissionLocked: false,
  chosenLevelTwoAbilityId: null,
});

const advance = (state: TutorialState): TutorialState => {
  const next = nextStepId(state.stepId);
  return next ? { ...state, stepId: next } : state;
};

/**
 * Tutorial reducer. Only navigation events are active in E2.2; combat and
 * ability events are declared in the step table but deliberately inert until
 * their rendered steps arrive (E2.3) — dispatching them today is a no-op.
 */
export const tutorialReducer = (
  state: TutorialState,
  event: TutorialEvent,
): TutorialState => {
  const step = STEPS[state.stepId];
  if (!step.permittedEvents.includes(event.type)) return state;

  switch (event.type) {
    case "RESTART":
      return initialTutorialState();
    case "BEGIN_TRAINING":
      // Only ever permitted on `welcome`; same forward motion as CONTINUE.
      return advance(state);
    case "CONTINUE":
      return advance(state);
    default:
      // Typed-but-not-yet-wired events (SELECT_ANSWER etc.). E2.3 will
      // replace this with real handling; until then they change nothing.
      return state;
  }
};

// --- Visible projection ------------------------------------------------------

/**
 * Everything the page needs to render, derived from state + step table.
 * Contains NO answer keys, NO opponent script, and NO future round results —
 * those live only in fixtures and are folded in at resolution time.
 */
export interface TutorialVisibleState {
  step: TutorialStepDefinition;
  stepNumber: number; // 1-based
  totalSteps: number;
  player: TutorialState["player"];
  opponent: TutorialState["opponent"];
  timerMode: TutorialStepDefinition["timerMode"];
  /** Seconds shown on the (paused or simulated) timer display. */
  timerSeconds: number;
  isComplete: boolean;
}

export const visibleState = (state: TutorialState): TutorialVisibleState => {
  const step = STEPS[state.stepId];
  return {
    step,
    stepNumber: stepIndex(state.stepId) + 1,
    totalSteps: STEP_ORDER.length,
    player: state.player,
    opponent: state.opponent,
    timerMode: step.timerMode,
    timerSeconds: ROUND_SECONDS,
    isComplete: state.stepId === "complete",
  };
};

/** XP progress toward the next level as 0–100 (mirrors the Ranked panel). */
export const xpProgressPct = (xp: number, level: number): number => {
  const cur = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const next = LEVEL_THRESHOLDS[level];
  if (next === undefined || level >= MAX_LEVEL) return 100;
  return Math.min(100, Math.round(((xp - cur) / (next - cur)) * 100));
};
