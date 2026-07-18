// ---------------------------------------------------------------------------
// Pure adapter: exact private-player envelope -> owning-player model.
//
// Scoped strictly to ONE owner: the validator already guarantees the payload
// carries only the owner's hidden state (opponent private data is
// structurally absent from the backend projection). This adapter renames and
// normalizes only — no charge math, no correctness inference, no resolved
// combat facts, no optimistic updates, no personal timers (the active-round
// deadline it exposes is the single SHARED round timer).
// ---------------------------------------------------------------------------

import { validatePrivatePlayerEnvelope } from "./rankedDuelEnvelopeValidation";

export interface AdaptedPrivatePlayer {
  matchId: string;
  roundNumber: number;
  ownerPlayerId: string;
  /** Owner's accepted answer state (neutral submitted flag). */
  answerSubmitted: boolean;
  /** Ability-window state for the owner's own selection. */
  selectionPhase: "open" | "locked" | "revealed" | null;
  /** Nullable: no ability selected is a valid, deliberate state. */
  selectedAbilityId: string | null;
  // --- eligibility & progression (owner only) ---
  unlockedAbilityIds: string[];
  lockedAbilityIds: string[];
  level2ChoiceMade: boolean;
  level2Choice: string | null;
  level2Options: string[];
  level3FinalUnlockId: string | null;
  level3Unlocked: boolean;
  /** Owner's CURRENT live charges — pass-through, never calculated. */
  remainingCharges: Record<string, number | null>;
  // --- owner carryover & Combat Lab data ---
  pendingEffects: {
    fortify: boolean;
    arcaneCharge: boolean;
    focus: boolean;
    insight: boolean;
    tempo: boolean;
  };
  consecutiveCorrect: number;
  combatLabUnlockDeltaSeconds: number;
  /** The single SHARED round deadline (both players); null when inactive. */
  sharedActiveDeadline: string | null;
  sharedNextRoundDurationSeconds: number;
}

export function adaptPrivatePlayer(
  envelope: unknown,
  expectedOwnerId: string,
): AdaptedPrivatePlayer {
  const validated = validatePrivatePlayerEnvelope(envelope, expectedOwnerId);
  const payload = validated.payload;
  const owner = payload.players.find((p) => p.player_id === payload.owner_player_id);

  return {
    matchId: payload.match_id,
    roundNumber: validated.round_number,
    ownerPlayerId: payload.owner_player_id,
    answerSubmitted: owner?.has_submitted ?? false,
    selectionPhase: payload.own_selection.phase,
    selectedAbilityId: payload.own_selection.selected_ability_id,
    unlockedAbilityIds: [...payload.own_abilities.unlocked_ability_ids],
    lockedAbilityIds: [...payload.own_abilities.locked_ability_ids],
    level2ChoiceMade: payload.own_abilities.level2_choice_made,
    level2Choice: payload.own_abilities.level2_choice,
    level2Options: [...payload.own_abilities.level2_options],
    level3FinalUnlockId: payload.own_abilities.level3_final_unlock_id,
    level3Unlocked: payload.own_abilities.level3_unlocked,
    remainingCharges: { ...payload.own_abilities.remaining_charges },
    pendingEffects: {
      fortify: payload.own_carryover.pending_fortify,
      arcaneCharge: payload.own_carryover.pending_arcane_charge,
      focus: payload.own_carryover.pending_focus,
      insight: payload.own_carryover.pending_insight,
      tempo: payload.own_carryover.pending_tempo,
    },
    consecutiveCorrect: payload.own_carryover.consecutive_correct,
    combatLabUnlockDeltaSeconds: payload.own_combat_lab_unlock_delta_seconds,
    sharedActiveDeadline: payload.active_round?.active_deadline ?? null,
    sharedNextRoundDurationSeconds: payload.next_round_duration_seconds,
  };
}
