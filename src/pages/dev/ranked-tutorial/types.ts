// ---------------------------------------------------------------------------
// Ranked TUTORIAL prototype — type model.
//
// Tutorial-owned types for the /dev/ranked-tutorial training match. Nothing
// here is a production API schema, and nothing here mutates real Ranked
// state. The tutorial is a deterministic scripted lesson, not a live match.
// ---------------------------------------------------------------------------

import type { TutorialRoundId } from "./fixtures";

/** Every step of the tutorial, in teaching order (see STEP_ORDER). */
/**
 * Which lesson this training match teaches (R1).
 *
 *  - `legacy` — the complete authored tutorial, including the ability layer,
 *    Level 2 choice and Level 3 unlock. Unchanged, and still correct for any
 *    match that has progression.
 *  - `r1` — the same tutorial with the ability lessons SKIPPED (never
 *    deleted) and the XP/victory copy corrected, for the no-progression
 *    Ranked match a new player will actually get.
 *
 * Both tracks are always present in the build, so the switch is one value.
 */
export type TutorialTrack = "legacy" | "r1";

export type TutorialStepId =
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
  | { type: "CONTINUE" }
  | { type: "RESTART" }
  | { type: "TICK" }
  /**
   * ONE CLICK ON AN ANSWER TABLET IS THE SUBMISSION — the same interaction
   * production Ranked ships (ARENA1 Step 4 §7).
   *
   * The tutorial used to teach select → review → confirm, a flow Ranked
   * retired. Teaching a sequence the real game does not have is worse than
   * teaching nothing, so the tutorial answers the way Ranked answers.
   *
   * The COACHING the review step used to carry did not go with it: a click
   * that does not match the lesson's authored answer (or is made without the
   * ability the lesson needs armed) sets `coachNudge` and locks NOTHING. The
   * grid stays open, the status line says why, and the player picks again —
   * which is exactly the non-failable guarantee the confirm gate provided,
   * expressed in the one-click vocabulary.
   */
  | { type: "SUBMIT_ANSWER"; answerIndex: number }
  | { type: "SELECT_ABILITY"; abilityId: string | null }
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

/**
 * In-round submission flow. "locked" is final — no changes, no resubmit.
 *
 * There is no "reviewing" phase any more: one click on an answer either locks
 * the round or is refused with a coaching nudge (see SUBMIT_ANSWER). Ranked
 * has no review step, so neither does the tutorial that teaches Ranked.
 */
export type RoundPhase = "selecting" | "locked" | "revealed";

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
  /**
   * Coaching flag: the last submission attempt named a non-authored answer, or
   * was made without the ability this lesson needs armed. Set by a REFUSED
   * SUBMIT_ANSWER, cleared by arming an ability or by a submission that lands.
   */
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
  /** Which lesson this run teaches. Frozen at construction; a RESTART keeps
   * it, so the track can never change mid-tutorial. */
  track: TutorialTrack;
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
  /**
   * Every round that has RESOLVED so far, oldest first.
   *
   * A live Ranked match has one of these (the controller's damage log) and the
   * arena reads it for both duelist ledgers and the round timeline. The
   * tutorial had no equivalent because nothing it rendered needed one; on the
   * canonical arena it does, and the honest source is the reveals the machine
   * has already produced — never a re-derivation from the step order.
   */
  settled: RevealedRoundResult[];
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
