// ---------------------------------------------------------------------------
// Pure adapter: exact backend resolved-round projection -> frontend display
// model.
//
// Input is the frontend-local mirror of `project_resolved_round` (backend
// commit 3eaba46). SHAPE TRANSLATION ONLY: rename snake_case fields, map the
// sorted player array onto the prototype's "p1"/"p2", convert backend enum
// spellings ("timeout" -> "timed_out"), normalize nullable values into
// display-safe ones, and validate invariants.
//
// The adapter NEVER calculates damage, HP, XP, XP-before, levels, winners,
// charges, charge-before, answer timing, answer order ranks, timer durations,
// carryover mechanics, or Combat Lab behavior. Every number passes through
// exactly as the backend resolved it. Level-ups come from the backend's
// explicit level_up_events, not numeric comparison.
// ---------------------------------------------------------------------------

import { PlayerId } from "../fixtures";
import {
  BackendCompletionReason,
  BackendResolvedPlayer,
  BackendResolvedRoundProjection,
  BackendRoundEndReason,
} from "./backendSettlementTypes";

/**
 * Prototype-safe bound for the raw shared timer delta (display metadata;
 * the backend clamps the real duration — this only rejects absurd fixtures).
 */
export const MAX_TIMER_DELTA_SECONDS = 10;
/** Sanity ceiling for the authoritative shared duration. */
export const MAX_TIMER_DURATION_SECONDS = 60;

/**
 * Explicit association between frontend player slots and backend player ids.
 * The backend sorts `players` by player_id for deterministic serialization —
 * array POSITION carries no side identity, so the caller (which knows which
 * backend player it is presenting as p1/p2) must say so by id.
 */
export interface PlayerIdMapping {
  p1PlayerId: string;
  p2PlayerId: string;
}

export class SettlementAdapterError extends Error {
  constructor(message: string) {
    super(`Invalid backend resolved projection: ${message}`);
    this.name = "SettlementAdapterError";
  }
}

/** Display model consumed by the prototype UI (never raw backend shapes). */
export interface AdaptedPlayerSettlement {
  playerId: string;
  outcome: "correct" | "incorrect" | "timed_out";
  /** Backend UTC ISO timestamp, passed through for display; null = none. */
  submittedAt: string | null;
  answeredFirst: boolean;
  timedOut: boolean;
  abilityId: string | null;
  /** Display-safe: the ability id, or "No active ability" when null. */
  abilityName: string;
  // --- authoritative damage audit (directional) ---
  baseDamageDealt: number;
  outgoingBonus: number;
  finalDamageDealt: number;
  shieldAbsorbed: number;
  incomingReduction: number;
  finalDamageReceived: number;
  hpBefore: number;
  hpAfter: number;
  reachedZeroHp: boolean;
  // --- XP / level (no XP-before exists in the backend projection) ---
  xpGained: number;
  totalXpAfter: number;
  levelBefore: number;
  levelAfter: number;
  /** From the backend's explicit events — never derived numerically. */
  leveledUp: boolean;
  levelUpEvents: { previousLevel: number; newLevel: number; totalXpAfter: number; thresholdsCrossed: number[] }[];
  // --- charges: consumption + IMMUTABLE post-round snapshot only ---
  chargeConsumed: boolean;
  consumedAbilityId: string | null;
  /**
   * Historical remaining charges AFTER this round, straight from the
   * backend's commit-time snapshot. Immutable for this round; never
   * reconstructed from or reconciled with live state. null = uncharged
   * use policy. There is deliberately NO charges-before field.
   */
  remainingChargesAfterRound: Record<string, number | null>;
  // --- carryover (gained/consumed kept separate) & streak ---
  effectsGained: string[];
  effectsConsumed: string[];
  consecutiveCorrect: number;
  /** Combat Lab timing data — kept separate from all damage fields. */
  combatLabUnlockDeltaSeconds: number;
}

export interface AdaptedSettlement {
  matchId: string;
  roundNumber: number;
  questionId: string | null;
  endReason: BackendRoundEndReason;
  pressureApplied: boolean;
  players: Record<PlayerId, AdaptedPlayerSettlement>;
  /** THE single authoritative shared timer for the next round. */
  sharedNextRoundDurationSeconds: number;
  /** Raw backend delta — display metadata only, never used to compute. */
  sharedTimerDeltaSeconds: number;
  matchOver: boolean;
  /** Null on non-terminal rounds AND on simultaneous-knockout draws. */
  winner: PlayerId | null;
  completionReason: BackendCompletionReason | null;
  /** Compact combat-log line built from backend-resolved values. */
  summary: string;
}

const OUTCOMES = new Set(["correct", "incorrect", "timeout"]);
const END_REASONS = new Set(["both_answered", "deadline_expired"]);
const COMPLETION_REASONS = new Set(["knockout", "simultaneous_knockout"]);

const nonNegative = (value: unknown, field: string): void => {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    throw new SettlementAdapterError(`${field} must be a nonnegative number (got ${value})`);
  }
};

const validatePlayer = (p: BackendResolvedPlayer, label: string): void => {
  if (!p || typeof p.player_id !== "string" || p.player_id.length === 0) {
    throw new SettlementAdapterError(`${label}: missing player projection`);
  }
  if (!OUTCOMES.has(p.outcome)) {
    throw new SettlementAdapterError(`${label}: unrecognized outcome "${p.outcome}"`);
  }
  if (typeof p.timed_out !== "boolean") {
    throw new SettlementAdapterError(`${label}: timed_out must be an explicit boolean`);
  }
  if (!p.damage) throw new SettlementAdapterError(`${label}: damage audit missing`);
  for (const f of [
    "base_damage_dealt",
    "outgoing_bonus",
    "final_damage_dealt",
    "shield_absorbed",
    "incoming_reduction",
    "final_damage_received",
  ] as const) {
    nonNegative(p.damage[f], `${label}.damage.${f}`);
  }
  nonNegative(p.hp_before, `${label}.hp_before`);
  nonNegative(p.hp_after, `${label}.hp_after`);
  nonNegative(p.xp_gained, `${label}.xp_gained`);
  nonNegative(p.total_xp_after, `${label}.total_xp_after`);
  if (p.level_before < 1 || p.level_after < 1) {
    throw new SettlementAdapterError(`${label}: levels must be >= 1`);
  }
  if (p.charge_consumed && p.consumed_ability_id === null) {
    throw new SettlementAdapterError(`${label}: charge_consumed without consumed_ability_id`);
  }
  for (const [abilityId, remaining] of Object.entries(p.remaining_charges ?? {})) {
    if (remaining !== null) {
      nonNegative(remaining, `${label}.remaining_charges.${abilityId}`);
    }
  }
  if (!p.carryover || !Array.isArray(p.carryover.effects_gained) || !Array.isArray(p.carryover.effects_consumed)) {
    throw new SettlementAdapterError(`${label}: carryover gained/consumed lists missing`);
  }
  nonNegative(p.carryover.consecutive_correct, `${label}.carryover.consecutive_correct`);
};

const adaptPlayer = (p: BackendResolvedPlayer): AdaptedPlayerSettlement => ({
  playerId: p.player_id,
  // Enum spelling conversion only ("timeout" -> frontend "timed_out").
  outcome: p.outcome === "timeout" ? "timed_out" : p.outcome,
  submittedAt: p.submitted_at,
  answeredFirst: p.answered_first,
  timedOut: p.timed_out,
  abilityId: p.selected_ability_id,
  abilityName: p.selected_ability_id ?? "No active ability",
  baseDamageDealt: p.damage.base_damage_dealt,
  outgoingBonus: p.damage.outgoing_bonus,
  finalDamageDealt: p.damage.final_damage_dealt,
  shieldAbsorbed: p.damage.shield_absorbed,
  incomingReduction: p.damage.incoming_reduction,
  finalDamageReceived: p.damage.final_damage_received,
  hpBefore: p.hp_before,
  hpAfter: p.hp_after,
  reachedZeroHp: p.reached_zero_hp,
  xpGained: p.xp_gained,
  totalXpAfter: p.total_xp_after,
  levelBefore: p.level_before,
  levelAfter: p.level_after,
  leveledUp: p.level_up_events.length > 0,
  levelUpEvents: p.level_up_events.map((e) => ({
    previousLevel: e.previous_level,
    newLevel: e.new_level,
    totalXpAfter: e.total_xp_after,
    thresholdsCrossed: [...e.thresholds_crossed],
  })),
  chargeConsumed: p.charge_consumed,
  consumedAbilityId: p.consumed_ability_id,
  remainingChargesAfterRound: { ...p.remaining_charges },
  effectsGained: [...p.carryover.effects_gained],
  effectsConsumed: [...p.carryover.effects_consumed],
  consecutiveCorrect: p.carryover.consecutive_correct,
  combatLabUnlockDeltaSeconds: p.combat_lab_unlock_delta_seconds,
});

/** String formatting from backend-resolved values only — no combat math. */
const buildSummary = (players: Record<PlayerId, AdaptedPlayerSettlement>): string => {
  const part = (id: PlayerId): string => {
    const p = players[id];
    const bits = [`${id} ${p.outcome.replace("_", " ")}`];
    if (p.finalDamageReceived > 0) bits.push(`took ${p.finalDamageReceived} dmg`);
    if (p.shieldAbsorbed > 0) bits.push(`shield ${p.shieldAbsorbed}`);
    if (p.incomingReduction > 0) bits.push(`reduced ${p.incomingReduction}`);
    return bits.join(", ");
  };
  return `${part("p1")} · ${part("p2")}`;
};

/**
 * Map one exact backend resolved projection into the prototype display
 * model. Fails closed: throws SettlementAdapterError on malformed data.
 */
export function adaptBackendSettlement(
  raw: BackendResolvedRoundProjection,
  ids: PlayerIdMapping,
): AdaptedSettlement {
  if (!raw) throw new SettlementAdapterError("projection missing");
  if (!ids || !ids.p1PlayerId || !ids.p2PlayerId) {
    throw new SettlementAdapterError("explicit p1/p2 player-id mapping is required");
  }
  if (ids.p1PlayerId === ids.p2PlayerId) {
    throw new SettlementAdapterError(
      `p1 and p2 must map to distinct player ids (both "${ids.p1PlayerId}")`,
    );
  }
  if (typeof raw.match_id !== "string" || raw.match_id.length === 0) {
    throw new SettlementAdapterError("match_id must be a non-empty string");
  }
  if (!Number.isInteger(raw.round_number) || raw.round_number < 1) {
    throw new SettlementAdapterError(`round_number must be a positive integer (got ${raw.round_number})`);
  }
  if (!END_REASONS.has(raw.end_reason)) {
    throw new SettlementAdapterError(`unrecognized end_reason "${raw.end_reason}"`);
  }
  if (!Array.isArray(raw.players) || raw.players.length !== 2) {
    throw new SettlementAdapterError(
      `players must contain exactly two projections (got ${raw.players?.length ?? "none"})`,
    );
  }
  if (raw.players[0]?.player_id === raw.players[1]?.player_id) {
    throw new SettlementAdapterError(
      `duplicate player_id "${raw.players[0]?.player_id}" in projection`,
    );
  }
  // Identity is resolved by player_id, NEVER by array position — the
  // backend's lexical sort is a serialization detail, not side identity.
  const findPlayer = (playerId: string, slot: string): BackendResolvedPlayer => {
    const found = raw.players.find((p) => p?.player_id === playerId);
    if (!found) {
      throw new SettlementAdapterError(
        `expected ${slot} player_id "${playerId}" is missing from the projection`,
      );
    }
    return found;
  };
  const rawP1 = findPlayer(ids.p1PlayerId, "p1");
  const rawP2 = findPlayer(ids.p2PlayerId, "p2");
  validatePlayer(rawP1, `player "${ids.p1PlayerId}"`);
  validatePlayer(rawP2, `player "${ids.p2PlayerId}"`);

  if (
    typeof raw.next_round_duration_seconds !== "number" ||
    raw.next_round_duration_seconds <= 0
  ) {
    throw new SettlementAdapterError("next_round_duration_seconds must be positive");
  }
  if (raw.next_round_duration_seconds > MAX_TIMER_DURATION_SECONDS) {
    throw new SettlementAdapterError(
      `shared duration ${raw.next_round_duration_seconds}s exceeds prototype ceiling of ${MAX_TIMER_DURATION_SECONDS}s`,
    );
  }
  if (
    typeof raw.next_round_duration_delta !== "number" ||
    Number.isNaN(raw.next_round_duration_delta) ||
    Math.abs(raw.next_round_duration_delta) > MAX_TIMER_DELTA_SECONDS
  ) {
    throw new SettlementAdapterError(
      `next_round_duration_delta outside prototype-safe ±${MAX_TIMER_DELTA_SECONDS}s`,
    );
  }

  if (raw.winner_id !== null) {
    if (!raw.match_over) {
      throw new SettlementAdapterError("winner_id set while match_over is false");
    }
    if (raw.winner_id !== ids.p1PlayerId && raw.winner_id !== ids.p2PlayerId) {
      throw new SettlementAdapterError(`unrecognized winner_id "${raw.winner_id}"`);
    }
  }
  if (raw.completion_reason !== null && !COMPLETION_REASONS.has(raw.completion_reason)) {
    throw new SettlementAdapterError(`unrecognized completion_reason "${raw.completion_reason}"`);
  }
  if (raw.match_over && raw.completion_reason === null) {
    throw new SettlementAdapterError("match_over requires a completion_reason");
  }

  const players: Record<PlayerId, AdaptedPlayerSettlement> = {
    p1: adaptPlayer(rawP1),
    p2: adaptPlayer(rawP2),
  };
  // Winner resolves through the same explicit id association.
  const winner: PlayerId | null =
    raw.winner_id === null ? null : raw.winner_id === ids.p1PlayerId ? "p1" : "p2";

  return {
    matchId: raw.match_id,
    roundNumber: raw.round_number,
    questionId: raw.question_id,
    endReason: raw.end_reason,
    pressureApplied: raw.pressure_applied,
    players,
    sharedNextRoundDurationSeconds: raw.next_round_duration_seconds,
    sharedTimerDeltaSeconds: raw.next_round_duration_delta,
    matchOver: raw.match_over,
    winner,
    completionReason: raw.completion_reason,
    summary: buildSummary(players),
  };
}
