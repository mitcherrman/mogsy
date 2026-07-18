// ---------------------------------------------------------------------------
// Neutral Ranked view contracts (F1 canonical arena, Phase A).
//
// These types are DISPLAY DATA ONLY. They carry values the backend (or a
// mode controller, e.g. the tutorial director) already resolved; nothing in
// this module computes damage, correctness, XP, levels, charges, or timer
// pressure. They deliberately contain no transport, tutorial, or staff-tool
// concepts, so live Ranked, the Ranked tutorial, and a future Daily Boss can
// all render through them.
//
// Hidden-information rule: pre-reveal types never carry opponent answer or
// ability CONTENT — only neutral status flags. Revealed facts exist solely on
// the resolved-round type (the existing AdaptedSettlement, re-exported below
// as ResolvedRoundView).
// ---------------------------------------------------------------------------

import type {
  AdaptedSettlement,
  AdaptedPlayerSettlement,
} from "./backend/adaptBackendSettlement";

/**
 * Frontend-stable settlement slot: p1 = the viewer/owner, p2 = the other
 * player. Slots are an explicit id mapping, never array position.
 */
export type PlayerSlot = "p1" | "p2";

/** Which side of the arena a combatant renders on. Never a mode flag. */
export type CombatantSide = "player" | "opponent";

/** Neutral, pre-reveal ability window status (mirrors the public projection). */
export type AbilityWindowStatus = "open" | "locked" | null;

export interface CombatantView {
  /** Stable backend player id — identity is NEVER array position. */
  playerId: string;
  /** Display name; controllers supply it (backend sends ids only). */
  name: string;
  /** Optional short descriptor line (class title, "Training Golem", …). */
  tag?: string;
  side: CombatantSide;
  classId: string;
  hp: number;
  /**
   * Max HP if the controller knows it (e.g. from the match-creation
   * starting_hp). null = unknown: the backend public projection does not
   * carry max HP, and the view layer must NOT invent one. Components render
   * an absolute HP number without a proportional meter in that case.
   */
  maxHp: number | null;
  xp: number;
  level: number;
  /**
   * XP needed for the next level, supplied by the controller from
   * backend-derived data; null = unknown or already at max level. The view
   * layer never owns threshold tables.
   */
  nextLevelThreshold: number | null;
  /** Previous level's threshold (progress-bar floor); null when unknown. */
  currentLevelThreshold: number | null;
  // --- neutral round status (safe pre-reveal; never content) ---
  hasSubmitted: boolean;
  abilityWindow: AbilityWindowStatus;
  /** Whether an ability is armed — never WHICH ability. Null = unknown. */
  hasAbilitySelected: boolean | null;
}

export interface AbilityView {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  /** Live charge count from the backend; null = not tracked / unknown. */
  remainingCharges: number | null;
  /** Currently armed in the viewer's own submission. */
  selected: boolean;
  /** The selection window is locked — no further arming possible. */
  locked: boolean;
  /** Unlocked but out of charges. */
  exhausted: boolean;
  /** Human-readable reason when the ability cannot currently be armed. */
  unavailableReason?: string;
}

export interface AnswerOptionView {
  /** Stable option id within the question (stringified backend index). */
  id: string;
  /** Backend submission index for this option. */
  index: number;
  label: string;
}

export interface QuestionView {
  questionId: string;
  prompt: string;
  options: AnswerOptionView[];
  category: string | null;
}

export type SubmissionPhase = "selecting" | "reviewing" | "locked";

/** The viewer's OWN in-progress submission (select → review → lock). */
export interface SubmissionView {
  selectedOptionId: string | null;
  /** null = deliberate no-ability submission (a valid choice). */
  selectedAbilityId: string | null;
  phase: SubmissionPhase;
}

export interface TimerView {
  /** Shared round duration as announced by the backend. */
  durationSeconds: number;
  /** Display countdown value; controllers derive it (see timerMath). */
  remainingSeconds: number;
  /** Externally controlled pause (tutorial director); live play never pauses. */
  paused: boolean;
  /** Display-urgency flag decided by the controller. */
  urgent: boolean;
  /** Short notices about timer modifiers ("-5s pressure", "+5s Fortify"). */
  modifierNotices?: string[];
}

/**
 * Externally supplied interaction gating. Live controllers derive these from
 * backend state; the tutorial director scripts them. Low-level components
 * consume ONLY these — no isTutorial/isDailyBoss/isTimeTrial branches.
 */
export interface InteractionPermissions {
  canSelectAnswer: boolean;
  canChangeAnswer: boolean;
  canSelectAbility: boolean;
  canReviewSubmission: boolean;
  canConfirmSubmission: boolean;
  canAdvance: boolean;
  /** Optional per-control explanations, keyed by control name. */
  disabledReasons?: Record<string, string>;
}

/** A level-progression ability option (Level 2 choice / Level 3 unlock). */
export interface LevelUpOptionView {
  id: string;
  name: string;
  description: string;
}

/** Everything locked — safe default while loading or between rounds. */
export const NO_INTERACTIONS: InteractionPermissions = Object.freeze({
  canSelectAnswer: false,
  canChangeAnswer: false,
  canSelectAbility: false,
  canReviewSubmission: false,
  canConfirmSubmission: false,
  canAdvance: false,
});

/**
 * The canonical resolved-round contract is the existing settlement adapter
 * output — already backend-authoritative, identity-mapped, and reveal-only.
 * Re-exported (not duplicated) so arena consumers depend on ranked-core.
 */
export type ResolvedRoundView = AdaptedSettlement;
export type ResolvedCombatantView = AdaptedPlayerSettlement;
