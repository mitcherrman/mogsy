// ---------------------------------------------------------------------------
// Pure runtime validation for the three ranked-duel read envelopes
// (backend commits 8e0809a / befa025). Validators accept `unknown`, fail
// closed with EnvelopeValidationError, and are strict about the envelope:
// exactly the five backend fields, the exact kind pair, and the exact
// payload field sets — extra fields are rejected, which is also what
// enforces the public/private privacy boundary structurally (a private
// payload can never pass the public validator and vice versa).
//
// No combat value is computed or reconciled here — shape checks only.
// ---------------------------------------------------------------------------

import {
  BackendOwnAbilities,
  BackendOwnCarryover,
  BackendOwnSelection,
  BackendPublicActiveRound,
  BackendPublicPlayer,
  BackendPublicRoundProjection,
  BackendPrivatePlayerProjection,
  PRIVATE_SCHEMA_VERSION,
  PUBLIC_SCHEMA_VERSION,
  PrivatePlayerEnvelope,
  PublicRoundEnvelope,
  RESOLVED_SCHEMA_VERSION,
  ResolvedRoundEnvelope,
} from "./rankedDuelEnvelopeTypes";
import { BackendResolvedRoundProjection } from "../backend-adapter/backendSettlementTypes";

export class EnvelopeValidationError extends Error {
  constructor(message: string) {
    super(`Invalid ranked-duel envelope: ${message}`);
    this.name = "EnvelopeValidationError";
  }
}

const ENVELOPE_FIELDS = [
  "schema_version",
  "projection_type",
  "match_id",
  "round_number",
  "payload",
] as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const fail = (message: string): never => {
  throw new EnvelopeValidationError(message);
};

const requireExactKeys = (
  obj: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void => {
  for (const k of keys) {
    if (!(k in obj)) fail(`${label}: missing field "${k}"`);
  }
  for (const k of Object.keys(obj)) {
    if (!keys.includes(k)) fail(`${label}: unexpected field "${k}"`);
  }
};

const str = (v: unknown, label: string): string => {
  if (typeof v !== "string" || v.length === 0) fail(`${label} must be a non-empty string`);
  return v as string;
};
const num = (v: unknown, label: string): number => {
  if (typeof v !== "number" || Number.isNaN(v)) fail(`${label} must be a number`);
  return v as number;
};
const bool = (v: unknown, label: string): boolean => {
  if (typeof v !== "boolean") fail(`${label} must be a boolean`);
  return v as boolean;
};
const strArray = (v: unknown, label: string): string[] => {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    fail(`${label} must be an array of strings`);
  }
  return v as string[];
};
/** Backend timestamps are UTC ISO-8601 strings (duel_transport_projection._iso). */
const isoTimestamp = (v: unknown, label: string): string => {
  const s = str(v, label);
  if (Number.isNaN(Date.parse(s))) fail(`${label} must be an ISO-8601 timestamp`);
  return s;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], label: string): T => {
  if (typeof v !== "string" || !allowed.includes(v as T)) {
    fail(`${label} must be one of ${allowed.join("|")} (got ${JSON.stringify(v)})`);
  }
  return v as T;
};

/**
 * The shared five-field envelope check: exact field set, exact kind pair,
 * valid metadata types. Returns the payload for per-kind validation.
 */
const validateEnvelopeShell = (
  raw: unknown,
  schemaVersion: string,
  projectionType: string,
): Record<string, unknown> => {
  if (!isRecord(raw)) fail("envelope must be an object");
  const env = raw as Record<string, unknown>;
  requireExactKeys(env, ENVELOPE_FIELDS, "envelope");
  if (env.schema_version !== schemaVersion) {
    fail(`wrong schema_version "${env.schema_version}" (expected "${schemaVersion}")`);
  }
  if (env.projection_type !== projectionType) {
    fail(`wrong projection_type "${env.projection_type}" (expected "${projectionType}")`);
  }
  str(env.match_id, "match_id");
  const round = num(env.round_number, "round_number");
  if (!Number.isInteger(round) || round < 1) fail("round_number must be a positive integer");
  if (!isRecord(env.payload)) fail("payload must be an object");
  return env.payload as Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Resolved envelope
// ---------------------------------------------------------------------------

/**
 * Validates the envelope shell and its association with the resolved
 * payload. Deep combat validation stays in adaptBackendSettlement — it is
 * not duplicated here.
 */
export function validateResolvedRoundEnvelope(raw: unknown): ResolvedRoundEnvelope {
  const payload = validateEnvelopeShell(raw, RESOLVED_SCHEMA_VERSION, "resolved_round");
  const env = raw as unknown as ResolvedRoundEnvelope;
  if (!Array.isArray(payload.players)) {
    fail("resolved payload must contain a players array");
  }
  if (payload.match_id !== env.match_id) {
    fail(`payload match_id "${payload.match_id}" does not match envelope "${env.match_id}"`);
  }
  if (payload.round_number !== env.round_number) {
    fail(
      `payload round_number ${payload.round_number} does not match envelope ${env.round_number}`,
    );
  }
  return env;
}

/** Convenience: validated payload for the existing settlement adapter. */
export function extractResolvedPayload(raw: unknown): BackendResolvedRoundProjection {
  return validateResolvedRoundEnvelope(raw).payload;
}

// ---------------------------------------------------------------------------
// Public envelope
// ---------------------------------------------------------------------------

const PUBLIC_PAYLOAD_FIELDS = [
  "match_id",
  "match_status",
  "completed_rounds",
  "players",
  "active_round",
  "next_round_duration_seconds",
  "match_over",
  "winner_id",
  "completion_reason",
] as const;

const PUBLIC_PLAYER_FIELDS = [
  "player_id",
  "class_id",
  "hp",
  "total_xp",
  "level",
  "has_submitted",
  "ability_selection_phase",
  "has_ability_selected",
] as const;

const ACTIVE_ROUND_FIELDS = [
  "round_number",
  "started_at",
  "active_deadline",
  "duration_seconds",
  "pressure_applied",
  "ready_to_resolve",
] as const;

const validatePublicPlayer = (v: unknown, label: string): BackendPublicPlayer => {
  if (!isRecord(v)) fail(`${label} must be an object`);
  const p = v as Record<string, unknown>;
  // The exact field set also enforces the privacy boundary: any hidden
  // field (selected_ability_id, outcome, charges, …) is rejected outright.
  requireExactKeys(p, PUBLIC_PLAYER_FIELDS, label);
  str(p.player_id, `${label}.player_id`);
  str(p.class_id, `${label}.class_id`);
  num(p.hp, `${label}.hp`);
  num(p.total_xp, `${label}.total_xp`);
  num(p.level, `${label}.level`);
  bool(p.has_submitted, `${label}.has_submitted`);
  if (p.ability_selection_phase !== null) {
    oneOf(p.ability_selection_phase, ["open", "locked"], `${label}.ability_selection_phase`);
  }
  if (p.has_ability_selected !== null) bool(p.has_ability_selected, `${label}.has_ability_selected`);
  return p as unknown as BackendPublicPlayer;
};

const validatePublicPayload = (
  payload: Record<string, unknown>,
  extraFields: readonly string[] = [],
): BackendPublicRoundProjection => {
  requireExactKeys(payload, [...PUBLIC_PAYLOAD_FIELDS, ...extraFields], "payload");
  str(payload.match_id, "payload.match_id");
  oneOf(payload.match_status, ["active", "complete"], "payload.match_status");
  num(payload.completed_rounds, "payload.completed_rounds");
  const players = payload.players;
  if (!Array.isArray(players) || players.length !== 2) {
    fail("payload.players must contain exactly two entries");
  }
  (players as unknown[]).forEach((p, i) => validatePublicPlayer(p, `players[${i}]`));
  if (payload.active_round !== null) {
    if (!isRecord(payload.active_round)) fail("active_round must be an object or null");
    const ar = payload.active_round as Record<string, unknown>;
    requireExactKeys(ar, ACTIVE_ROUND_FIELDS, "active_round");
    num(ar.round_number, "active_round.round_number");
    isoTimestamp(ar.started_at, "active_round.started_at");
    isoTimestamp(ar.active_deadline, "active_round.active_deadline");
    // ONE shared duration — no per-player timer fields exist to validate.
    num(ar.duration_seconds, "active_round.duration_seconds");
    bool(ar.pressure_applied, "active_round.pressure_applied");
    bool(ar.ready_to_resolve, "active_round.ready_to_resolve");
  }
  num(payload.next_round_duration_seconds, "payload.next_round_duration_seconds");
  bool(payload.match_over, "payload.match_over");
  if (payload.winner_id !== null) str(payload.winner_id, "payload.winner_id");
  if (payload.completion_reason !== null) str(payload.completion_reason, "payload.completion_reason");
  return payload as unknown as BackendPublicRoundProjection;
};

export function validatePublicRoundEnvelope(raw: unknown): PublicRoundEnvelope {
  const payload = validateEnvelopeShell(raw, PUBLIC_SCHEMA_VERSION, "public_round");
  validatePublicPayload(payload);
  const env = raw as unknown as PublicRoundEnvelope;
  if (payload.match_id !== env.match_id) fail("payload match_id does not match envelope");
  return env;
}

// ---------------------------------------------------------------------------
// Private envelope
// ---------------------------------------------------------------------------

const PRIVATE_EXTRA_FIELDS = [
  "owner_player_id",
  "own_selection",
  "own_abilities",
  "own_carryover",
  "own_combat_lab_unlock_delta_seconds",
] as const;

const OWN_SELECTION_FIELDS = ["phase", "selected_ability_id"] as const;
const OWN_ABILITIES_FIELDS = [
  "unlocked_ability_ids",
  "locked_ability_ids",
  "level2_choice_made",
  "level2_choice",
  "level2_options",
  "level3_final_unlock_id",
  "level3_unlocked",
  "remaining_charges",
] as const;
const OWN_CARRYOVER_FIELDS = [
  "pending_fortify",
  "pending_arcane_charge",
  "pending_focus",
  "pending_insight",
  "pending_tempo",
  "consecutive_correct",
] as const;

export function validatePrivatePlayerEnvelope(
  raw: unknown,
  expectedOwnerId?: string,
): PrivatePlayerEnvelope {
  const payload = validateEnvelopeShell(raw, PRIVATE_SCHEMA_VERSION, "private_player");
  // Public base + exactly the owner-scoped extension fields. Any opponent
  // private record or extra hidden field is an unexpected field -> rejected.
  validatePublicPayload(payload, PRIVATE_EXTRA_FIELDS);
  const owner = str(payload.owner_player_id, "payload.owner_player_id");
  if (expectedOwnerId !== undefined && owner !== expectedOwnerId) {
    fail(`payload owner "${owner}" does not match expected owner "${expectedOwnerId}"`);
  }

  if (!isRecord(payload.own_selection)) fail("own_selection must be an object");
  const sel = payload.own_selection as Record<string, unknown>;
  requireExactKeys(sel, OWN_SELECTION_FIELDS, "own_selection");
  if (sel.phase !== null) oneOf(sel.phase, ["open", "locked", "revealed"], "own_selection.phase");
  if (sel.selected_ability_id !== null) str(sel.selected_ability_id, "own_selection.selected_ability_id");

  if (!isRecord(payload.own_abilities)) fail("own_abilities must be an object");
  const ab = payload.own_abilities as Record<string, unknown>;
  requireExactKeys(ab, OWN_ABILITIES_FIELDS, "own_abilities");
  strArray(ab.unlocked_ability_ids, "own_abilities.unlocked_ability_ids");
  strArray(ab.locked_ability_ids, "own_abilities.locked_ability_ids");
  bool(ab.level2_choice_made, "own_abilities.level2_choice_made");
  if (ab.level2_choice !== null) str(ab.level2_choice, "own_abilities.level2_choice");
  strArray(ab.level2_options, "own_abilities.level2_options");
  if (ab.level3_final_unlock_id !== null) str(ab.level3_final_unlock_id, "own_abilities.level3_final_unlock_id");
  bool(ab.level3_unlocked, "own_abilities.level3_unlocked");
  if (!isRecord(ab.remaining_charges)) fail("own_abilities.remaining_charges must be an object");
  for (const [k, v] of Object.entries(ab.remaining_charges as Record<string, unknown>)) {
    if (v !== null && (typeof v !== "number" || v < 0)) {
      fail(`own_abilities.remaining_charges.${k} must be a nonnegative number or null`);
    }
  }

  if (!isRecord(payload.own_carryover)) fail("own_carryover must be an object");
  const co = payload.own_carryover as Record<string, unknown>;
  requireExactKeys(co, OWN_CARRYOVER_FIELDS, "own_carryover");
  for (const k of OWN_CARRYOVER_FIELDS.slice(0, 5)) bool(co[k], `own_carryover.${k}`);
  num(co.consecutive_correct, "own_carryover.consecutive_correct");

  num(payload.own_combat_lab_unlock_delta_seconds, "payload.own_combat_lab_unlock_delta_seconds");
  return raw as unknown as PrivatePlayerEnvelope;
}

// Re-export payload sub-types for adapter use without widening imports.
export type {
  BackendOwnAbilities,
  BackendOwnCarryover,
  BackendOwnSelection,
  BackendPublicActiveRound,
  BackendPrivatePlayerProjection,
};
