// ---------------------------------------------------------------------------
// FRONTEND-LOCAL representations of the backend's round-settlement concepts.
//
// These types mirror the currently stabilized backend round/match/combat
// settlement layer closely enough to prove the frontend can consume
// already-resolved results. They are NOT the final transport schema: when the
// real API contract lands, these must be replaced by (or validated against)
// the actual response types. They live inside the /dev/ranked-duel prototype
// on purpose — do not move them into shared API or domain directories.
//
// Every numeric field is a FINAL resolved value produced by the backend.
// Nothing in the frontend derives one of these numbers from another.
// ---------------------------------------------------------------------------

export type BackendPlayerKey = "playerOne" | "playerTwo";

export type BackendAnswerOutcome = "correct" | "incorrect" | "timed_out";

/** Relative answer-speed outcome as resolved by the backend. */
export type BackendRelativeSpeed = "faster" | "slower" | "not_applicable";

export interface BackendSelectedAbility {
  abilityId: string;
  name: string;
}

/**
 * Combat Lab carryover / stored-modifier data attached by the backend
 * settlement. Opaque to the frontend beyond display.
 */
export interface BackendCombatLabCarryover {
  /** e.g. "stored_burn", "sunfire_stack" — backend-owned identifier. */
  key: string;
  /** Human-readable summary the backend resolved for display. */
  summary: string;
  /** "created" | "consumed" | "updated" as resolved by the backend. */
  status: "created" | "consumed" | "updated";
}

export interface BackendPlayerSettlement {
  answerOutcome: BackendAnswerOutcome;
  /** Milliseconds from question start to submission; null when timed out. */
  answerTimeMs: number | null;
  relativeSpeed: BackendRelativeSpeed;

  // --- HP / damage (all resolved by the backend combat settlement) ---
  hpBefore: number;
  /**
   * Opponent's resolved outgoing damage BEFORE this player's shield and
   * reduction are applied. Attacker-side class bonuses are already included
   * by the backend; only defender-side mitigation follows.
   */
  baseIncomingDamage: number;
  /** Portion of incoming damage absorbed by shields. */
  shieldAbsorbed: number;
  /** Flat/percent reduction total the backend already applied. */
  damageReductionAmount: number;
  /** Damage actually applied to HP after all modifiers. */
  finalDamage: number;
  hpAfter: number;

  // --- XP / level (resolved by the backend) ---
  xpBefore: number;
  xpAwarded: number;
  xpAfter: number;
  levelBefore: number;
  levelAfter: number;

  // --- Active ability & charges (rules live in the backend) ---
  selectedAbility: BackendSelectedAbility | null;
  chargesBefore: number | null;
  chargesConsumed: number;
  chargesAfter: number | null;

  combatLabCarryover: BackendCombatLabCarryover | null;
}

/**
 * One shared next-round timer for BOTH players. Class timer effects resolve
 * into a single shared question duration on the backend — there are no
 * per-player timers anywhere in this model.
 *
 * `durationSeconds` is the AUTHORITATIVE value the frontend applies to the
 * next round. `deltaSeconds` (vs. the baseline round length) is optional
 * display metadata only — it is never used to compute the duration.
 */
export interface BackendSharedNextRoundTimer {
  durationSeconds: number;
  deltaSeconds?: number;
}

export interface BackendRoundSettlement {
  roundId: string;
  matchId: string;
  players: Record<BackendPlayerKey, BackendPlayerSettlement>;
  sharedNextRoundTimer: BackendSharedNextRoundTimer;
  matchOver: boolean;
  /** Resolved by the backend; null unless matchOver. Never derived locally. */
  winner: BackendPlayerKey | null;
}
