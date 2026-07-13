// ---------------------------------------------------------------------------
// Pure adapter: backend-shaped round settlement -> frontend display model.
//
// SHAPE TRANSLATION ONLY. The adapter renames fields, converts backend player
// keys to the prototype's "p1"/"p2", normalizes optional values into
// display-safe ones, and validates invariants. It never recomputes damage,
// XP, levels, shields, reductions, charges, class effects, or the winner —
// every number passes through exactly as the backend resolved it. The only
// derivations are presentational comparisons (e.g. leveledUp = after > before)
// and string formatting for log/badge display.
//
// Frontend-local to the /dev/ranked-duel prototype; to be replaced by (or
// validated against) the real API contract when it lands.
// ---------------------------------------------------------------------------

import { PlayerId } from "../fixtures";
import {
  BackendPlayerKey,
  BackendPlayerSettlement,
  BackendRoundSettlement,
} from "./backendSettlementTypes";

/**
 * Prototype-safe bound for the shared next-round timer delta (display
 * metadata). Values beyond ±10s would make the prototype's 20s baseline
 * unusable, so they're rejected as malformed fixture data.
 */
export const MAX_TIMER_DELTA_SECONDS = 10;
/** Sanity ceiling for the authoritative shared duration. */
export const MAX_TIMER_DURATION_SECONDS = 60;

export class SettlementAdapterError extends Error {
  constructor(message: string) {
    super(`Invalid backend settlement fixture: ${message}`);
    this.name = "SettlementAdapterError";
  }
}

/** Display model consumed by the prototype UI (never raw backend shapes). */
export interface AdaptedPlayerSettlement {
  outcome: "correct" | "incorrect" | "timed_out";
  wasFaster: boolean;
  /** Display string, e.g. "3.1s" — null when timed out. */
  answerTimeLabel: string | null;
  hpBefore: number;
  hpAfter: number;
  baseDamage: number;
  shieldAbsorbed: number;
  damageReduced: number;
  finalDamage: number;
  xpBefore: number;
  xpAwarded: number;
  xpAfter: number;
  levelBefore: number;
  levelAfter: number;
  leveledUp: boolean;
  /** Always display-safe: "No active ability" when the backend sent null. */
  abilityName: string;
  abilityId: string | null;
  /** Null when the ability system reported no charge pool. */
  chargesBefore: number | null;
  chargesConsumed: number;
  chargesAfter: number | null;
  /** e.g. "Stored burn consumed: +6 damage applied" — null when absent. */
  carryoverSummary: string | null;
  carryoverStatus: "created" | "consumed" | "updated" | null;
}

export interface AdaptedSettlement {
  roundId: string;
  players: Record<PlayerId, AdaptedPlayerSettlement>;
  /** THE single authoritative shared timer for the next round. */
  sharedNextRoundDurationSeconds: number;
  /** Display metadata only; never used to compute the duration. */
  sharedTimerDeltaSeconds: number | null;
  matchOver: boolean;
  winner: PlayerId | null;
  /** Compact combat-log line built from backend-resolved values. */
  summary: string;
}

const PLAYER_KEY_TO_ID: Record<BackendPlayerKey, PlayerId> = {
  playerOne: "p1",
  playerTwo: "p2",
};

const nonNegative = (value: number, field: string): void => {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    throw new SettlementAdapterError(`${field} must be a nonnegative number (got ${value})`);
  }
};

const validatePlayer = (key: BackendPlayerKey, p: BackendPlayerSettlement): void => {
  if (!p) throw new SettlementAdapterError(`missing settlement record for ${key}`);
  nonNegative(p.hpBefore, `${key}.hpBefore`);
  nonNegative(p.hpAfter, `${key}.hpAfter`);
  nonNegative(p.baseIncomingDamage, `${key}.baseIncomingDamage`);
  nonNegative(p.finalDamage, `${key}.finalDamage`);
  nonNegative(p.shieldAbsorbed, `${key}.shieldAbsorbed`);
  nonNegative(p.damageReductionAmount, `${key}.damageReductionAmount`);
  nonNegative(p.xpBefore, `${key}.xpBefore`);
  nonNegative(p.xpAwarded, `${key}.xpAwarded`);
  nonNegative(p.xpAfter, `${key}.xpAfter`);
  nonNegative(p.chargesConsumed, `${key}.chargesConsumed`);
  if (p.chargesAfter !== null) nonNegative(p.chargesAfter, `${key}.chargesAfter`);
  if (p.chargesBefore !== null) nonNegative(p.chargesBefore, `${key}.chargesBefore`);
  if (p.levelBefore < 1 || p.levelAfter < 1) {
    throw new SettlementAdapterError(`${key} levels must be >= 1`);
  }
};

const adaptPlayer = (p: BackendPlayerSettlement): AdaptedPlayerSettlement => ({
  outcome: p.answerOutcome,
  wasFaster: p.relativeSpeed === "faster",
  answerTimeLabel: p.answerTimeMs === null ? null : `${(p.answerTimeMs / 1000).toFixed(1)}s`,
  hpBefore: p.hpBefore,
  hpAfter: p.hpAfter,
  baseDamage: p.baseIncomingDamage,
  shieldAbsorbed: p.shieldAbsorbed,
  damageReduced: p.damageReductionAmount,
  finalDamage: p.finalDamage,
  xpBefore: p.xpBefore,
  xpAwarded: p.xpAwarded,
  xpAfter: p.xpAfter,
  levelBefore: p.levelBefore,
  levelAfter: p.levelAfter,
  leveledUp: p.levelAfter > p.levelBefore,
  abilityName: p.selectedAbility?.name ?? "No active ability",
  abilityId: p.selectedAbility?.abilityId ?? null,
  chargesBefore: p.chargesBefore,
  chargesConsumed: p.chargesConsumed,
  chargesAfter: p.chargesAfter,
  carryoverSummary: p.combatLabCarryover?.summary ?? null,
  carryoverStatus: p.combatLabCarryover?.status ?? null,
});

/** String formatting from backend-resolved values only — no combat math. */
const buildSummary = (players: Record<PlayerId, AdaptedPlayerSettlement>): string => {
  const part = (id: PlayerId): string => {
    const p = players[id];
    const bits = [`${id} ${p.outcome.replace("_", " ")}`];
    if (p.finalDamage > 0) bits.push(`took ${p.finalDamage} dmg`);
    if (p.shieldAbsorbed > 0) bits.push(`shield ${p.shieldAbsorbed}`);
    if (p.damageReduced > 0) bits.push(`reduced ${p.damageReduced}`);
    return bits.join(", ");
  };
  return `${part("p1")} · ${part("p2")}`;
};

/**
 * Map one backend-shaped settlement into the prototype display model.
 * Fails closed: throws SettlementAdapterError on malformed fixture data.
 */
export function adaptBackendSettlement(raw: BackendRoundSettlement): AdaptedSettlement {
  if (!raw || !raw.players) throw new SettlementAdapterError("settlement or players missing");

  for (const key of ["playerOne", "playerTwo"] as BackendPlayerKey[]) {
    validatePlayer(key, raw.players[key]);
  }
  for (const key of Object.keys(raw.players)) {
    if (key !== "playerOne" && key !== "playerTwo") {
      throw new SettlementAdapterError(`unrecognized player key "${key}"`);
    }
  }

  const timer = raw.sharedNextRoundTimer;
  if (!timer || typeof timer.durationSeconds !== "number" || timer.durationSeconds <= 0) {
    throw new SettlementAdapterError("sharedNextRoundTimer.durationSeconds must be positive");
  }
  if (timer.durationSeconds > MAX_TIMER_DURATION_SECONDS) {
    throw new SettlementAdapterError(
      `shared duration ${timer.durationSeconds}s exceeds prototype ceiling of ${MAX_TIMER_DURATION_SECONDS}s`,
    );
  }
  if (
    timer.deltaSeconds !== undefined &&
    Math.abs(timer.deltaSeconds) > MAX_TIMER_DELTA_SECONDS
  ) {
    throw new SettlementAdapterError(
      `shared timer delta ${timer.deltaSeconds}s outside prototype-safe ±${MAX_TIMER_DELTA_SECONDS}s`,
    );
  }

  if (raw.winner !== null) {
    if (!raw.matchOver) {
      throw new SettlementAdapterError("winner set while matchOver is false");
    }
    if (raw.winner !== "playerOne" && raw.winner !== "playerTwo") {
      throw new SettlementAdapterError(`unrecognized winner "${raw.winner}"`);
    }
  }

  const players: Record<PlayerId, AdaptedPlayerSettlement> = {
    p1: adaptPlayer(raw.players.playerOne),
    p2: adaptPlayer(raw.players.playerTwo),
  };

  return {
    roundId: raw.roundId,
    players,
    sharedNextRoundDurationSeconds: timer.durationSeconds,
    sharedTimerDeltaSeconds: timer.deltaSeconds ?? null,
    matchOver: raw.matchOver,
    winner: raw.winner === null ? null : PLAYER_KEY_TO_ID[raw.winner],
    summary: buildSummary(players),
  };
}
