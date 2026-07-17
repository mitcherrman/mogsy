// ---------------------------------------------------------------------------
// Ranked TUTORIAL prototype — type model.
//
// Tutorial-owned types for the /dev/ranked-tutorial training match. Nothing
// here is a production API schema, and nothing here mutates real Ranked
// state. The tutorial is a deterministic scripted lesson, not a live match.
// ---------------------------------------------------------------------------

/** Every step of the tutorial, in teaching order (see STEP_ORDER). */
export type TutorialStepId =
  | "welcome"
  | "timer_intro"
  | "answer_selection"
  | "answer_locked"
  | "simultaneous_reveal"
  | "damage_intro"
  | "both_correct_demo"
  | "failure_demo"
  | "xp_intro"
  | "starter_ability_intro"
  | "ability_resolution"
  | "level_two_choice"
  | "level_three_unlock"
  | "victory_round"
  | "queue_explanation"
  | "reconnect_explanation"
  | "ads_pro_explanation"
  | "complete";

/**
 * Timer presentation for a step. The tutorial never runs a real backend
 * deadline: "paused" shows the frozen shared timer during instruction,
 * "running" counts down under player control, and "simulated" jumps the
 * display deterministically (e.g. the timeout demonstration) so nobody has
 * to sit through a real countdown or fail for reading slowly.
 */
export type TutorialTimerMode = "paused" | "running" | "simulated";

/**
 * Events the machine understands. Only the navigation events are wired in
 * this phase (E2.2); combat/ability events are typed now so the transition
 * table is complete, and their handling arrives with the rendered combat
 * steps in E2.3.
 */
export type TutorialEvent =
  | { type: "BEGIN_TRAINING" }
  | { type: "CONTINUE" }
  | { type: "RESTART" }
  // --- E2.3+ (typed, permitted per-step, not yet handled) ---
  | { type: "SELECT_ANSWER"; answerIndex: number }
  | { type: "SELECT_ABILITY"; abilityId: string | null }
  | { type: "LOCK_SUBMISSION" }
  | { type: "SIMULATE_TIMEOUT" }
  | { type: "CHOOSE_LEVEL_TWO"; abilityId: string }
  | { type: "CONFIRM_LEVEL_TWO" };

export type TutorialEventType = TutorialEvent["type"];

/** HP/XP snapshot for one combatant, mirroring the Ranked panel shape. */
export interface TutorialCombatant {
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
}

/**
 * The machine's full state. Deliberately small: everything scripted (future
 * answers, the opponent's plan, round outcomes) stays in the step fixtures
 * and is only folded in when a step resolves — so serializing this state
 * never leaks an answer key or an unrevealed opponent choice.
 */
export interface TutorialState {
  stepId: TutorialStepId;
  player: TutorialCombatant;
  opponent: TutorialCombatant;
  /** In-round scratch (player's pending pick before lock). E2.3 territory. */
  pendingAnswerIndex: number | null;
  pendingAbilityId: string | null;
  submissionLocked: boolean;
  chosenLevelTwoAbilityId: string | null;
}

/** Static definition of one tutorial step (authored, never user-visible raw). */
export interface TutorialStepDefinition {
  id: TutorialStepId;
  /** Short label for the progress indicator. */
  label: string;
  /** Instructional copy shown in the coach panel. */
  title: string;
  body: string;
  /** Text pushed to the aria-live region when the step becomes active. */
  announcement: string;
  timerMode: TutorialTimerMode;
  /** Events the reducer will accept while this step is active. */
  permittedEvents: readonly TutorialEventType[];
  /** Whether Back navigation may return here from the following step. */
  allowBack: boolean;
}
