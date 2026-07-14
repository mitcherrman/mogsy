// ---------------------------------------------------------------------------
// FRONTEND-LOCAL mirrors of the ranked-duel read-endpoint envelopes.
//
// These types mirror backend commits 8e0809a / befa025 exactly: the routes in
// routes/ranked_duel.py wrap each domain projection in a minimal FIVE-field
// envelope — schema_version, projection_type, match_id, round_number,
// payload — and nothing else (no timestamps, event ids, revisions, or other
// transport metadata; the backend route tests assert exactly these five
// keys). Payloads are the verbatim outputs of project_resolved_round /
// project_public_round / project_private_player.
//
// Deterministic fixture data only; local to the /dev/ranked-duel prototype.
// ---------------------------------------------------------------------------

import { BackendResolvedRoundProjection } from "../backend-adapter/backendSettlementTypes";

export const RESOLVED_SCHEMA_VERSION = "ranked_duel.resolved_round.v1" as const;
export const PUBLIC_SCHEMA_VERSION = "ranked_duel.public_round.v1" as const;
export const PRIVATE_SCHEMA_VERSION = "ranked_duel.private_player.v1" as const;

/** The backend's exact five-field envelope. Nothing more, nothing less. */
export interface RankedDuelEnvelope<S extends string, T extends string, P> {
  schema_version: S;
  projection_type: T;
  match_id: string;
  /** 1-based; for current-round endpoints, the active round number. */
  round_number: number;
  payload: P;
}

export type ResolvedRoundEnvelope = RankedDuelEnvelope<
  typeof RESOLVED_SCHEMA_VERSION,
  "resolved_round",
  BackendResolvedRoundProjection
>;

// ---------------------------------------------------------------------------
// project_public_round payload — safe for BOTH players before reveal. The
// backend never puts answers, correctness, selected ability ids, or charge
// inventories here; only neutral submitted/locked booleans.
// ---------------------------------------------------------------------------

export interface BackendPublicPlayer {
  player_id: string;
  class_id: string;
  hp: number;
  total_xp: number;
  level: number;
  has_submitted: boolean;
  /** null when no round is active. */
  ability_selection_phase: "open" | "locked" | null;
  /** Status only — never the ability identity. null when no active round. */
  has_ability_selected: boolean | null;
}

export interface BackendPublicActiveRound {
  round_number: number;
  started_at: string; // UTC ISO-8601
  active_deadline: string; // UTC ISO-8601
  /** ONE shared round duration — there are no per-player timers. */
  duration_seconds: number;
  pressure_applied: boolean;
  ready_to_resolve: boolean;
}

export interface BackendPublicRoundProjection {
  match_id: string;
  match_status: "active" | "complete";
  completed_rounds: number;
  /** Sorted by player_id — a serialization detail, not side identity. */
  players: BackendPublicPlayer[];
  active_round: BackendPublicActiveRound | null;
  next_round_duration_seconds: number;
  match_over: boolean;
  winner_id: string | null;
  completion_reason: string | null;
}

export type PublicRoundEnvelope = RankedDuelEnvelope<
  typeof PUBLIC_SCHEMA_VERSION,
  "public_round",
  BackendPublicRoundProjection
>;

// ---------------------------------------------------------------------------
// project_private_player payload — the public view PLUS the owning player's
// OWN hidden state. The opponent's private selection/charges are
// structurally absent (the backend cannot even reach them here).
// ---------------------------------------------------------------------------

export interface BackendOwnSelection {
  phase: "open" | "locked" | "revealed" | null;
  selected_ability_id: string | null;
}

export interface BackendOwnAbilities {
  unlocked_ability_ids: string[];
  locked_ability_ids: string[];
  level2_choice_made: boolean;
  level2_choice: string | null;
  level2_options: string[];
  level3_final_unlock_id: string | null;
  level3_unlocked: boolean;
  /** Owner's CURRENT live charges; null = uncharged use policy. */
  remaining_charges: Record<string, number | null>;
}

export interface BackendOwnCarryover {
  pending_fortify: boolean;
  pending_arcane_charge: boolean;
  pending_focus: boolean;
  pending_insight: boolean;
  pending_tempo: boolean;
  consecutive_correct: number;
}

export interface BackendPrivatePlayerProjection extends BackendPublicRoundProjection {
  owner_player_id: string;
  own_selection: BackendOwnSelection;
  own_abilities: BackendOwnAbilities;
  own_carryover: BackendOwnCarryover;
  own_combat_lab_unlock_delta_seconds: number;
}

export type PrivatePlayerEnvelope = RankedDuelEnvelope<
  typeof PRIVATE_SCHEMA_VERSION,
  "private_player",
  BackendPrivatePlayerProjection
>;
