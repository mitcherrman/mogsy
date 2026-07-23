/**
 * Strict frontend contracts for the F1.2–F1.4 public Ranked backend.
 *
 * Readers parse the versioned backend envelopes into camelCase shapes that
 * feed the canonical `ranked-core` view adapters directly (PublicCombatantSource
 * / PrivateAbilitySource / PublicQuestionSource). They preserve the
 * hidden-information contract: a public/private payload is rejected if it
 * carries any pre-reveal correctness (`correct_index`), and the opponent's
 * private ability state is structurally absent from the private reader.
 *
 * The existing `.v1` staff/tutorial envelope validators are untouched; these
 * are new v2/v1 public schemas:
 *   ranked_duel.public_round.v2   ranked_duel.private_player.v2
 *   ranked_duel.resolved_round.v2 ranked_duel.resume.v1
 *   ranked_duel.match_result.v1   ranked_duel.queue_status.v1
 */

import type {
  PublicCombatantSource,
  PrivateAbilitySource,
  PublicQuestionSource,
} from "@/lib/ranked-core/adapters/adaptToViews";

export class RankedPublicParseError extends Error {
  constructor(message: string) {
    super(`Ranked public contract: ${message}`);
    this.name = "RankedPublicParseError";
  }
}

// ---------------------------------------------------------------- helpers

function rec(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RankedPublicParseError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function str(value: unknown, label: string): string {
  if (typeof value !== "string") throw new RankedPublicParseError(`${label} must be a string`);
  return value;
}

function nstr(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new RankedPublicParseError(`${label} must be a string or null`);
  return value;
}

function num(value: unknown, label: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new RankedPublicParseError(`${label} must be a number`);
  }
  return value;
}

function nnum(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  return num(value, label);
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new RankedPublicParseError(`${label} must be a boolean`);
  return value;
}

function nbool(value: unknown, label: string): boolean | null {
  if (value === null || value === undefined) return null;
  return bool(value, label);
}

function strList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new RankedPublicParseError(`${label} must be an array`);
  return value.map((v, i) => str(v, `${label}[${i}]`));
}

/** Hidden-information guard: no pre-reveal correctness may appear. */
function assertNoCorrectness(payload: Record<string, unknown>, label: string): void {
  if ("correct_index" in payload || "correctIndex" in payload) {
    throw new RankedPublicParseError(`${label} leaked a correct answer index`);
  }
}

function envelope(body: unknown, expectedType: string, versionPrefix: string) {
  const env = rec(body, "envelope");
  if (env.projection_type !== expectedType) {
    throw new RankedPublicParseError(
      `expected projection_type "${expectedType}" (got ${String(env.projection_type)})`,
    );
  }
  const schema = str(env.schema_version, "schema_version");
  if (!schema.startsWith(versionPrefix)) {
    throw new RankedPublicParseError(`unexpected schema_version "${schema}"`);
  }
  return {
    schemaVersion: schema,
    matchId: nstr(env.match_id, "match_id"),
    roundNumber: nnum(env.round_number, "round_number"),
    serverTime: str(env.server_time, "server_time"),
    payload: rec(env.payload, "payload"),
  };
}

// ------------------------------------------------------------ view types

export type PresenceState =
  | "connected"
  | "disconnected_grace"
  | "disconnected"
  | "forfeited"
  | "abandoned"
  | "unknown";

export interface PresenceView {
  participantStatus: PresenceState;
  opponentConnectionState: PresenceState;
  reconnectGraceDeadline: string | null;
  ownReconnectGraceDeadline: string | null;
}

export interface PublicActiveRound {
  roundNumber: number;
  startedAt: string;
  activeDeadline: string;
  durationSeconds: number;
  pressureApplied: boolean;
  readyToResolve: boolean;
}

/** Non-secret playtest metadata (prototype label only; never correctness). */
export interface PlaytestMeta {
  questionBankMode: string;
  isPlaceholder: boolean;
  isBotMatch: boolean;
}

/** Public round: neutral, pre-reveal. Players satisfy PublicCombatantSource. */
export interface PublicRoundView {
  schemaVersion: string;
  serverTime: string;
  matchId: string;
  matchStatus: string;
  matchOver: boolean;
  winnerId: string | null;
  completionReason: string | null;
  completedRounds: number;
  players: (PublicCombatantSource & { maxHp: number | null })[];
  activeRound: PublicActiveRound | null;
  nextRoundDurationSeconds: number;
  question: PublicQuestionSource | null;
  progressionPendingPlayers: string[];
  presence: PresenceView | null;
  playtest?: PlaytestMeta | null;
}

export interface PrivatePlayerView extends PublicRoundView {
  ownerPlayerId: string;
  ownSelection: { phase: string | null; selectedAbilityId: string | null };
  ownAbilities: PrivateAbilitySource & {
    level2ChoiceMade: boolean;
    level2Choice: string | null;
    level2Options: string[];
    level3FinalUnlockId: string | null;
    level3Unlocked: boolean;
  };
}

export interface QueueStatusView {
  schemaVersion: string;
  serverTime: string;
  status: "not_queued" | "waiting" | "matched" | "cancelled" | "expired";
  matchId: string | null;
  queueVersion: number | null;
  classId: string | null;
  enqueuedAt: string | null;
}

export type TerminalReason = "combat" | "forfeit" | "no_contest";

export interface MatchResultView {
  schemaVersion: string;
  serverTime: string;
  matchId: string;
  outcome: "decisive" | "draw";
  winnerUserId: string | null;
  completionReason: string | null;
  terminalReason: TerminalReason;
  finalRoundNumber: number;
  ratingApplicationStatus: string;
}

export interface HeartbeatView {
  status: string;
  matchId: string;
  active: boolean;
}

// --------------------------------------------------------------- readers

function readPresence(value: unknown): PresenceView | null {
  if (value === null || value === undefined) return null;
  const p = rec(value, "presence");
  const state = (v: unknown, l: string): PresenceState => {
    const s = str(v, l);
    return (["connected", "disconnected_grace", "disconnected", "forfeited",
      "abandoned", "unknown"].includes(s) ? s : "unknown") as PresenceState;
  };
  return {
    participantStatus: state(p.participant_status, "participant_status"),
    opponentConnectionState: state(p.opponent_connection_state, "opponent_connection_state"),
    reconnectGraceDeadline: nstr(p.reconnect_grace_deadline, "reconnect_grace_deadline"),
    ownReconnectGraceDeadline: nstr(p.own_reconnect_grace_deadline, "own_reconnect_grace_deadline"),
  };
}

function readPlayer(value: unknown, i: number): PublicCombatantSource & { maxHp: number | null } {
  const p = rec(value, `players[${i}]`);
  return {
    playerId: str(p.player_id, "player_id"),
    classId: str(p.class_id, "class_id"),
    hp: num(p.hp, "hp"),
    totalXp: num(p.total_xp, "total_xp"),
    level: num(p.level, "level"),
    hasSubmitted: bool(p.has_submitted, "has_submitted"),
    abilitySelectionPhase: nstr(p.ability_selection_phase, "ability_selection_phase"),
    hasAbilitySelected: nbool(p.has_ability_selected, "has_ability_selected"),
    maxHp: nnum(p.max_hp, "max_hp"),
  };
}

function readActiveRound(value: unknown): PublicActiveRound | null {
  if (value === null || value === undefined) return null;
  const r = rec(value, "active_round");
  return {
    roundNumber: num(r.round_number, "round_number"),
    startedAt: str(r.started_at, "started_at"),
    activeDeadline: str(r.active_deadline, "active_deadline"),
    durationSeconds: num(r.duration_seconds, "duration_seconds"),
    pressureApplied: bool(r.pressure_applied, "pressure_applied"),
    readyToResolve: bool(r.ready_to_resolve, "ready_to_resolve"),
  };
}

// Defense-in-depth mirror of the backend sanitizer: a question-safe presentation
// blob never names correctness / a solution / an explanation. This is a soft
// guard — an unsafe or oversized blob DROPS to null (text fallback) rather than
// rejecting the whole round payload, so a malformed optional field cannot break
// an active match.
const _PRESENTATION_REJECT_TOKENS = ["correct", "solution", "explanation"];
const _PRESENTATION_MAX_DEPTH = 8;
const _PRESENTATION_MAX_NODES = 600;

function presentationIsSafe(value: unknown, depth: number, budget: { n: number }): boolean {
  if (depth > _PRESENTATION_MAX_DEPTH) return false;
  if (--budget.n < 0) return false;
  if (value === null || typeof value !== "object") return true;
  if (Array.isArray(value)) {
    return value.every((v) => presentationIsSafe(v, depth + 1, budget));
  }
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const low = key.toLowerCase();
    if (_PRESENTATION_REJECT_TOKENS.some((t) => low.includes(t))) return false;
    if (!presentationIsSafe(v, depth + 1, budget)) return false;
  }
  return true;
}

/** Optional, question-safe rich-visual metadata. Absent/unsafe/malformed → null. */
function readOptionalPresentation(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  if (!presentationIsSafe(value, 0, { n: _PRESENTATION_MAX_NODES })) return null;
  const obj = value as Record<string, unknown>;
  return Object.keys(obj).length > 0 ? obj : null;
}

function readQuestion(value: unknown): PublicQuestionSource | null {
  if (value === null || value === undefined) return null;
  const q = rec(value, "question");
  assertNoCorrectness(q, "question");
  return {
    questionId: str(q.question_id, "question_id"),
    prompt: str(q.prompt, "prompt"),
    options: strList(q.options, "options"),
    category: nstr(q.category, "category"),
    presentation: readOptionalPresentation(q.presentation),
  };
}

function readPublicPayload(payload: Record<string, unknown>): Omit<PublicRoundView,
  "schemaVersion" | "serverTime"> {
  assertNoCorrectness(payload, "public payload");
  const players = Array.isArray(payload.players)
    ? payload.players.map((p, i) => readPlayer(p, i))
    : (() => { throw new RankedPublicParseError("players must be an array"); })();
  return {
    matchId: str(payload.match_id, "match_id"),
    matchStatus: str(payload.match_status, "match_status"),
    matchOver: bool(payload.match_over, "match_over"),
    winnerId: nstr(payload.winner_id, "winner_id"),
    completionReason: nstr(payload.completion_reason, "completion_reason"),
    completedRounds: num(payload.completed_rounds, "completed_rounds"),
    players,
    activeRound: readActiveRound(payload.active_round),
    nextRoundDurationSeconds: num(payload.next_round_duration_seconds, "next_round_duration_seconds"),
    question: readQuestion(payload.question),
    progressionPendingPlayers: Array.isArray(payload.progression_pending_players)
      ? strList(payload.progression_pending_players, "progression_pending_players") : [],
    presence: readPresence(payload.presence),
    playtest: readPlaytest(payload.playtest),
  };
}

function readPlaytest(v: unknown): PlaytestMeta | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return {
    questionBankMode: typeof o.question_bank_mode === "string" ? o.question_bank_mode : "production",
    isPlaceholder: o.is_placeholder === true,
    isBotMatch: o.is_bot_match === true,
  };
}

export function readPublicRound(body: unknown): PublicRoundView {
  const env = envelope(body, "public_round", "ranked_duel.public_round.v2");
  return { schemaVersion: env.schemaVersion, serverTime: env.serverTime,
    ...readPublicPayload(env.payload) };
}

export function readPrivatePlayer(body: unknown): PrivatePlayerView {
  const env = envelope(body, "private_player", "ranked_duel.private_player.v2");
  const payload = env.payload;
  const base = readPublicPayload(payload);
  const sel = rec(payload.own_selection, "own_selection");
  const ab = rec(payload.own_abilities, "own_abilities");
  const charges: Record<string, number | null> = {};
  const rawCharges = rec(ab.remaining_charges, "remaining_charges");
  for (const [k, v] of Object.entries(rawCharges)) charges[k] = nnum(v, `remaining_charges.${k}`);
  return {
    schemaVersion: env.schemaVersion, serverTime: env.serverTime, ...base,
    ownerPlayerId: str(payload.owner_player_id, "owner_player_id"),
    ownSelection: {
      phase: nstr(sel.phase, "own_selection.phase"),
      selectedAbilityId: nstr(sel.selected_ability_id, "own_selection.selected_ability_id"),
    },
    ownAbilities: {
      selectionPhase: nstr(sel.phase, "own_selection.phase"),
      selectedAbilityId: nstr(sel.selected_ability_id, "own_selection.selected_ability_id"),
      unlockedAbilityIds: strList(ab.unlocked_ability_ids, "unlocked_ability_ids"),
      lockedAbilityIds: strList(ab.locked_ability_ids, "locked_ability_ids"),
      remainingCharges: charges,
      level2ChoiceMade: bool(ab.level2_choice_made, "level2_choice_made"),
      level2Choice: nstr(ab.level2_choice, "level2_choice"),
      level2Options: strList(ab.level2_options, "level2_options"),
      level3FinalUnlockId: nstr(ab.level3_final_unlock_id, "level3_final_unlock_id"),
      level3Unlocked: bool(ab.level3_unlocked, "level3_unlocked"),
    },
  };
}

/** Resolved round: unwrap the v2 envelope; the payload IS the backend
 * resolved projection that ranked-core's settlement adapter consumes. */
export function readResolvedEnvelope(body: unknown): {
  schemaVersion: string; serverTime: string; payload: Record<string, unknown>;
} {
  const env = envelope(body, "resolved_round", "ranked_duel.resolved_round.v2");
  return { schemaVersion: env.schemaVersion, serverTime: env.serverTime, payload: env.payload };
}

export function readQueueStatus(body: unknown): QueueStatusView {
  const env = envelope(body, "queue_status", "ranked_duel.queue_status.v1");
  const p = env.payload;
  const status = str(p.status, "status");
  return {
    schemaVersion: env.schemaVersion, serverTime: env.serverTime,
    status: status as QueueStatusView["status"],
    matchId: nstr(p.match_id, "match_id"),
    queueVersion: nnum(p.queue_version, "queue_version"),
    classId: nstr(p.class_id, "class_id"),
    enqueuedAt: nstr(p.enqueued_at, "enqueued_at"),
  };
}

export function readMatchResult(body: unknown): MatchResultView {
  const env = envelope(body, "match_result", "ranked_duel.match_result.v1");
  const p = env.payload;
  return {
    schemaVersion: env.schemaVersion, serverTime: env.serverTime,
    matchId: str(p.match_id, "match_id"),
    outcome: str(p.outcome, "outcome") as MatchResultView["outcome"],
    winnerUserId: nstr(p.winner_user_id, "winner_user_id"),
    completionReason: nstr(p.completion_reason, "completion_reason"),
    terminalReason: (str(p.terminal_reason, "terminal_reason") as TerminalReason),
    finalRoundNumber: num(p.final_round_number, "final_round_number"),
    ratingApplicationStatus: str(p.rating_application_status, "rating_application_status"),
  };
}

export interface MatchHistoryEntryView {
  matchId: string;
  viewerOutcome: "win" | "loss" | "draw";
  terminalReason: TerminalReason;
  completionReason: string | null;
  finalRoundNumber: number;
  completedAt: string;
  isBotMatch: boolean;
  viewerClass: string;
  opponentClass: string;
  opponentDisplayName: string | null;
  opponentIsBot: boolean;
}

export interface MatchHistoryView {
  schemaVersion: string;
  serverTime: string;
  entries: MatchHistoryEntryView[];
  count: number;
}

/** Match history (ranked_duel.match_history.v1): the caller's own terminal
 * results only. The backend never sends raw account ids here — opponents are
 * display name + class + bot flag; a stray user-id-like field is rejected. */
export function readMatchHistory(body: unknown): MatchHistoryView {
  const env = envelope(body, "match_history", "ranked_duel.match_history.v1");
  const p = env.payload;
  if (!Array.isArray(p.entries)) throw new RankedPublicParseError("entries must be an array");
  const entries = p.entries.map((raw, i) => {
    const e = rec(raw, `entries[${i}]`);
    if ("winner_user_id" in e || "opponent_user_id" in e) {
      throw new RankedPublicParseError(`entries[${i}] leaked a raw account id`);
    }
    const outcome = str(e.viewer_outcome, `entries[${i}].viewer_outcome`);
    if (outcome !== "win" && outcome !== "loss" && outcome !== "draw") {
      throw new RankedPublicParseError(`entries[${i}].viewer_outcome is invalid`);
    }
    return {
      matchId: str(e.match_id, `entries[${i}].match_id`),
      viewerOutcome: outcome,
      terminalReason: str(e.terminal_reason, `entries[${i}].terminal_reason`) as TerminalReason,
      completionReason: nstr(e.completion_reason, `entries[${i}].completion_reason`),
      finalRoundNumber: num(e.final_round_number, `entries[${i}].final_round_number`),
      completedAt: str(e.completed_at, `entries[${i}].completed_at`),
      isBotMatch: bool(e.is_bot_match, `entries[${i}].is_bot_match`),
      viewerClass: str(e.viewer_class, `entries[${i}].viewer_class`),
      opponentClass: str(e.opponent_class, `entries[${i}].opponent_class`),
      opponentDisplayName: nstr(e.opponent_display_name, `entries[${i}].opponent_display_name`),
      opponentIsBot: bool(e.opponent_is_bot, `entries[${i}].opponent_is_bot`),
    } satisfies MatchHistoryEntryView;
  });
  return {
    schemaVersion: env.schemaVersion, serverTime: env.serverTime,
    entries, count: num(p.count, "count"),
  };
}

export function readHeartbeat(body: unknown): HeartbeatView {
  const b = rec(body, "heartbeat");
  return {
    status: str(b.status, "status"),
    matchId: str(b.match_id, "match_id"),
    active: bool(b.active, "active"),
  };
}

export interface ResumeView {
  schemaVersion: string;
  serverTime: string;
  matchStatus: string;
  matchOver: boolean;
  public: PublicRoundView;
  private: PrivatePlayerView;
  progressionPendingPlayers: string[];
  latestResolved: Record<string, unknown> | null;  // resolved v2 envelope
  result: MatchResultView | null;
}

export function readResume(body: unknown): ResumeView {
  const env = envelope(body, "resume", "ranked_duel.resume.v1");
  const p = env.payload;
  return {
    schemaVersion: env.schemaVersion, serverTime: env.serverTime,
    matchStatus: str(p.match_status, "match_status"),
    matchOver: bool(p.match_over, "match_over"),
    public: readPublicRound(p.public),
    private: readPrivatePlayer(p.private),
    progressionPendingPlayers: Array.isArray(p.progression_pending_players)
      ? strList(p.progression_pending_players, "progression_pending_players") : [],
    latestResolved: p.latest_resolved_round === null || p.latest_resolved_round === undefined
      ? null : rec(p.latest_resolved_round, "latest_resolved_round"),
    result: p.result === null || p.result === undefined ? null : readMatchResult(p.result),
  };
}
