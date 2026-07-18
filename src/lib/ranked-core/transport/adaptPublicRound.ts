// ---------------------------------------------------------------------------
// Pure adapter: exact public-round envelope -> frontend presentation model.
//
// Rename/normalize ONLY. Players resolve by explicit backend player id
// (never array position); the winner maps through the same association. No
// timers, deadlines, HP, XP, levels, or hidden state are calculated or
// inferred — the public projection contains no hidden information and this
// adapter cannot create any.
// ---------------------------------------------------------------------------

import type { PlayerSlot as PlayerId } from "../viewTypes";
import { PlayerIdMapping } from "../backend/adaptBackendSettlement";
import {
  BackendPublicPlayer,
  PublicRoundEnvelope,
} from "./rankedDuelEnvelopeTypes";
import {
  EnvelopeValidationError,
  validatePublicRoundEnvelope,
} from "./rankedDuelEnvelopeValidation";

export interface AdaptedPublicPlayer {
  playerId: string;
  classId: string;
  hp: number;
  totalXp: number;
  level: number;
  hasSubmitted: boolean;
  /** Neutral status only — never the ability identity. */
  abilitySelectionPhase: "open" | "locked" | null;
  hasAbilitySelected: boolean | null;
}

export interface AdaptedPublicRound {
  matchId: string;
  roundNumber: number;
  matchStatus: "active" | "complete";
  completedRounds: number;
  players: Record<PlayerId, AdaptedPublicPlayer>;
  /** ONE shared round timer for both players; null when no round is active. */
  activeRound: {
    roundNumber: number;
    startedAt: string;
    activeDeadline: string;
    durationSeconds: number;
    pressureApplied: boolean;
    readyToResolve: boolean;
  } | null;
  sharedNextRoundDurationSeconds: number;
  matchOver: boolean;
  winner: PlayerId | null;
  completionReason: string | null;
}

const adaptPlayer = (p: BackendPublicPlayer): AdaptedPublicPlayer => ({
  playerId: p.player_id,
  classId: p.class_id,
  hp: p.hp,
  totalXp: p.total_xp,
  level: p.level,
  hasSubmitted: p.has_submitted,
  abilitySelectionPhase: p.ability_selection_phase,
  hasAbilitySelected: p.has_ability_selected,
});

export function adaptPublicRound(
  envelope: unknown,
  ids: PlayerIdMapping,
): AdaptedPublicRound {
  const validated: PublicRoundEnvelope = validatePublicRoundEnvelope(envelope);
  const payload = validated.payload;
  if (ids.p1PlayerId === ids.p2PlayerId) {
    throw new EnvelopeValidationError("p1 and p2 must map to distinct player ids");
  }
  const find = (playerId: string, slot: string): BackendPublicPlayer => {
    const found = payload.players.find((p) => p.player_id === playerId);
    if (!found) {
      throw new EnvelopeValidationError(
        `expected ${slot} player_id "${playerId}" is missing from the public payload`,
      );
    }
    return found;
  };
  const p1 = find(ids.p1PlayerId, "p1");
  const p2 = find(ids.p2PlayerId, "p2");

  if (payload.winner_id !== null &&
      payload.winner_id !== ids.p1PlayerId && payload.winner_id !== ids.p2PlayerId) {
    throw new EnvelopeValidationError(`unrecognized winner_id "${payload.winner_id}"`);
  }

  return {
    matchId: payload.match_id,
    roundNumber: validated.round_number,
    matchStatus: payload.match_status,
    completedRounds: payload.completed_rounds,
    players: { p1: adaptPlayer(p1), p2: adaptPlayer(p2) },
    activeRound:
      payload.active_round === null
        ? null
        : {
            roundNumber: payload.active_round.round_number,
            startedAt: payload.active_round.started_at,
            activeDeadline: payload.active_round.active_deadline,
            durationSeconds: payload.active_round.duration_seconds,
            pressureApplied: payload.active_round.pressure_applied,
            readyToResolve: payload.active_round.ready_to_resolve,
          },
    sharedNextRoundDurationSeconds: payload.next_round_duration_seconds,
    matchOver: payload.match_over,
    winner:
      payload.winner_id === null ? null : payload.winner_id === ids.p1PlayerId ? "p1" : "p2",
    completionReason: payload.completion_reason,
  };
}
