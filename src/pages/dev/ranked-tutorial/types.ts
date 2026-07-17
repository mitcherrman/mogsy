// ---------------------------------------------------------------------------
// Ranked TUTORIAL prototype — type model.
//
// Tutorial-owned types for the /dev/ranked-tutorial training match. Nothing
// here is a production API schema, and nothing here mutates real Ranked
// state. The tutorial is a deterministic scripted lesson, not a live match.
// ---------------------------------------------------------------------------

import type { TutorialRoundId } from "./fixtures";

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
  | "match_over"
  | "queue_explanation"
  | "reconnect_explanation"
  | "ads_pro_explanation"
  | "complete";

/**
 * Timer presentation for a step. The tutorial never runs a real backend
 * deadline: "paused" freezes the shared timer during instruction, "running"
 * counts down via reducer TICKs while the player acts, and "simulated"
 * jumps deterministically (the timeout demo) so nobody waits out a real
 * countdown or fails for reading slowly.
 */
export type TutorialTimerMode = "paused" | "running" | "simulated";

/** Events the machine understands. */
export type TutorialEvent =
  | { type: "BEGIN_TRAINING" }
  | { type: "CONTINUE" }
  | { type: "RESTART" }
  | { type: "TICK" }
  | { type: "SELECT_ANSWER"; answerIndex: number }
  | { type: "SELECT_ABILITY"; abilityId: string | null }
  /** "Lock Answer & Ability" — moves the submission into review. */
  | { type: "LOCK_SUBMISSION" }
  /** Leave review and change the selection. */
  | { type: "EDIT_SUBMISSION" }
  /** Final explicit confirmation — the authoritative lock moment. */
  | { type: "CONFIRM_LOCK" }
  | { type: "SIMULATE_TIMEOUT" }
  /** Queue education: run the deterministic matchmaking simulation. */
  | { type: "SIMULATE_MATCHMAKING" }
  /** Recovery education: run the deterministic disconnect+restore simulation. */
  | { type: "SIMULATE_DISCONNECT" }
  /** Level 2: select one of the two options (changeable until confirmed). */
  | { type: "CHOOSE_LEVEL_TWO"; abilityId: string }
  /** Level 2: permanent confirmation. Duplicates are rejected. */
  | { type: "CONFIRM_LEVEL_TWO" };

export type TutorialEventType = TutorialEvent["type"];

/** HP/XP snapshot for one combatant, mirroring the Ranked panel shape. */
export interface TutorialCombatant {
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
}

/** In-round submission flow. "locked" is final — no changes, no resubmit. */
export type RoundPhase = "selecting" | "reviewing" | "locked" | "revealed";

/** Neutral opponent status — never the answer itself. */
export type OpponentStatus = "thinking" | "submitted" | "timed_out";

/**
 * What the reveal makes visible. Present ONLY once a round resolves —
 * before that, none of these values exist anywhere in machine state.
 */
export interface RevealedRoundResult {
  roundId: TutorialRoundId;
  playerAnswer: number | null;
  opponentAnswer: number | null;
  playerCorrect: boolean;
  opponentCorrect: boolean;
  playerTimedOut: boolean;
  opponentTimedOut: boolean;
  playerDamage: number;
  opponentDamage: number;
  playerHpBefore: number;
  playerHpAfter: number;
  opponentHpBefore: number;
  opponentHpAfter: number;
  playerXpAwarded: number;
  opponentXpAwarded: number;
  playerLeveledUpTo: number | null;
  /** Ability facts revealed with the answers (null id = no ability). */
  revealedAbilityId: string | null;
  chargeConsumed: boolean;
  chargesBefore: number | null;
  chargesAfter: number | null;
  effectTriggered: boolean;
  effectSummary: string | null;
  /** Ability the player's Level 3 threshold-crossing auto-unlocked, if any. */
  levelThreeAutoUnlockedAbilityId: string | null;
  resultCopy: string;
}

/** Live scratch state for the round currently being taught. */
export interface RoundState {
  roundId: TutorialRoundId;
  questionIndex: number;
  phase: RoundPhase;
  /** Player's pending picks. Frozen once phase reaches "locked". */
  playerAnswerIndex: number | null;
  playerAbilityId: string | null;
  /** Coaching flag: review found a non-authored answer or ability pick. */
  coachNudge: "answer" | "ability" | null;
  opponentStatus: OpponentStatus;
  /** Set in the same transition that flips phase to "revealed". */
  result: RevealedRoundResult | null;
}

/** Shared-timer scratch. Reducer-owned; the page only dispatches TICKs. */
export interface TimerState {
  remaining: number;
  /** This round's authored start duration (30, or 35 with Fortify's bonus). */
  duration: number;
  running: boolean;
  pressureCutApplied: boolean;
  warningAnnounced: boolean;
}

/**
 * The machine's full state. Scripted futures (answer keys, the Golem's
 * plan, resolved outcomes) live in fixtures and are folded in only when a
 * round resolves — serializing this state never leaks an answer key or an
 * unrevealed opponent choice.
 */
export interface TutorialState {
  stepId: TutorialStepId;
  player: TutorialCombatant;
  opponent: TutorialCombatant;
  round: RoundState | null;
  timer: TimerState;
  /** Remaining charges per ability id (player side; Golem never arms one). */
  charges: Record<string, number>;
  /** Pending Level 2 pick — changeable until CONFIRM_LEVEL_TWO. */
  pendingLevelTwoChoiceId: string | null;
  /** Confirmed, permanent Level 2 choice. */
  chosenLevelTwoAbilityId: string | null;
  /** True once the victory fixture has resolved the Golem to 0 HP. */
  matchOver: boolean;
  /** Educational simulations — purely visual, never networked. */
  queueSimulationDone: boolean;
  recoverySimulationDone: boolean;
  /**
   * Most recent dynamic announcement for the page's aria-live region
   * (lock, opponent submission, pressure cut, reveal, XP, level-up).
   * Step-entry announcements come from the step table instead.
   */
  lastAnnouncement: string | null;
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
