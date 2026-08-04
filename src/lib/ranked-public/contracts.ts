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
import type { OptionMediaView } from "@/lib/ranked-core/viewTypes";

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

/**
 * Additive segment/module discriminator (Ranked Phase A).
 *
 * Identity and shape only — never module payload and never a canonical answer.
 * OPTIONAL by contract: a v2 payload (or any legacy round) simply omits it, and
 * the reader defaults to `quiz.v1`, which is exactly the module those rounds
 * were created under. `question` remains present and unchanged alongside it.
 */
export interface SegmentMeta {
  moduleId: string;
  moduleVersion: number;
  challengeCount: number;
  /** The VIEWER's own next challenge; 0 for a quiz segment. */
  challengeIndex: number;
  segmentNumber: number | null;
  /**
   * Authoritative phase of a multi-challenge segment, or null for a quiz /
   * legacy round. Phase B slice 4 additive: a v2 payload that omits these
   * reads as a quiz segment, exactly as before.
   */
  phase: SegmentPhase;
  abilityDeadline: string | null;
  challengeStartedAt: string | null;
  challengeDeadline: string | null;
  pressureApplied: boolean;
  resolved: boolean;
}

export type SegmentPhase = "ability" | "challenges" | null;

/** Default applied when the backend omits `segment` (v2 payloads, legacy rounds). */
export const LEGACY_SEGMENT: SegmentMeta = Object.freeze({
  moduleId: "quiz",
  moduleVersion: 1,
  challengeCount: 1,
  challengeIndex: 0,
  segmentNumber: null,
  phase: null,
  abilityDeadline: null,
  challengeStartedAt: null,
  challengeDeadline: null,
  pressureApplied: false,
  resolved: false,
});

/** One pre-reveal item card. These four fields are the backend allow-list. */
export interface SegmentItemView {
  itemId: string;
  name: string | null;
  itemType: string | null;
  assetPath: string | null;
}

export interface SegmentChallengeView {
  challengeIndex: number;
  left: SegmentItemView;
  right: SegmentItemView;
}

/** The viewer's OWN ability state inside a multi-challenge segment. */
export interface SegmentAbilityView {
  selectedAbilityId: string | null;
  confirmed: boolean;
  availableAbilityIds: string[];
  /** ability id -> human reason it cannot be picked here (e.g. Mage Insight). */
  unavailableAbilityIds: Record<string, string>;
}

/**
 * Owner-scoped state of the active multi-challenge segment.
 *
 * Everything here is pre-reveal safe by construction on the backend: the
 * opponent appears ONLY as a completion count and a confirmation flag, and no
 * canonical cost, correct item, or correctness is present until settlement.
 * The reader below rejects the payload outright if any of that appears — a
 * structural key check, never a substring scan, so the legitimate module id
 * `item_cost_duel` and the field `challenge_count` are not false positives.
 */
export interface SegmentStateView {
  segmentNumber: number;
  moduleId: string;
  moduleVersion: number;
  phase: SegmentPhase;
  challengeCount: number;
  abilityDeadline: string | null;
  challengeStartedAt: string | null;
  challengeDeadline: string | null;
  pressureApplied: boolean;
  ownAbility: SegmentAbilityView;
  opponentAbilityConfirmed: boolean;
  ownNextChallengeIndex: number;
  ownSubmittedChoices: (string | null)[];
  ownChallengesCompleted: number;
  opponentChallengesCompleted: number;
  opponentFinished: boolean;
  ownFinished: boolean;
  /** Present only in the challenge phase. */
  prompt: string | null;
  challenges: SegmentChallengeView[];
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
  /** Always populated by the reader; defaults to `quiz.v1` when absent. */
  segment: SegmentMeta;
  /** Owner state of the active multi-challenge segment; null for quiz. */
  segmentState: SegmentStateView | null;
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

/**
 * Optional canonical ANSWER-OPTION media (RA6). Positional: entry i describes
 * option i.
 *
 * Tolerant like `readOptionalPresentation` and for the same reason: this block
 * carries no secret and no combat value, so a malformed one must degrade to
 * text-only answers rather than break an otherwise valid live match. Every
 * entry must be well-formed — one bad entry drops the WHOLE array, matching the
 * backend's all-or-nothing rule so a partial set can never single an option
 * out. Length is checked against the options by the view adapter, which is the
 * one place both are in hand.
 */
function readOptionMedia(value: unknown): OptionMediaView[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const entries: OptionMediaView[] = [];
  for (const raw of value) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.type !== "string" || !entry.type) return null;
    if (typeof entry.name !== "string" || !entry.name) return null;
    if (typeof entry.icon !== "string" || !entry.icon) return null;
    entries.push({
      type: entry.type,
      name: entry.name,
      icon: entry.icon,
      ...(typeof entry.id === "string" || typeof entry.id === "number"
        ? { id: entry.id }
        : {}),
    });
  }
  return entries;
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
    optionMedia: readOptionMedia(q.option_media),
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
    segment: readSegment(payload.segment),
    segmentState: readSegmentState(payload.segment_state),
    progressionPendingPlayers: Array.isArray(payload.progression_pending_players)
      ? strList(payload.progression_pending_players, "progression_pending_players") : [],
    presence: readPresence(payload.presence),
    playtest: readPlaytest(payload.playtest),
  };
}

/**
 * Tolerant segment reader. Absent, null, or malformed -> `LEGACY_SEGMENT`.
 *
 * Tolerance is deliberate here and NOT a weakening of the contract: this block
 * carries no secret and no combat value, so an unparseable one must degrade to
 * the legacy quiz default rather than break an otherwise valid live match. The
 * strict readers guarding correctness (`assertNoCorrectness`, `readQuestion`)
 * are untouched.
 */
function readSegment(v: unknown): SegmentMeta {
  if (!v || typeof v !== "object" || Array.isArray(v)) return LEGACY_SEGMENT;
  const o = v as Record<string, unknown>;
  const int = (raw: unknown, fallback: number) =>
    typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : fallback;
  const iso = (raw: unknown) => (typeof raw === "string" && raw ? raw : null);
  return {
    moduleId: typeof o.module_id === "string" && o.module_id ? o.module_id : "quiz",
    moduleVersion: int(o.module_version, 1),
    challengeCount: int(o.challenge_count, 1),
    challengeIndex: int(o.challenge_index, 0),
    segmentNumber: typeof o.segment_number === "number" ? o.segment_number : null,
    phase: o.phase === "ability" || o.phase === "challenges" ? o.phase : null,
    abilityDeadline: iso(o.ability_deadline),
    challengeStartedAt: iso(o.challenge_started_at),
    challengeDeadline: iso(o.challenge_deadline),
    pressureApplied: o.pressure_applied === true,
    resolved: o.resolved === true,
  };
}

/**
 * Keys that may never appear inside a PRE-REVEAL segment payload.
 *
 * Matched as exact key names while walking the object graph. A substring scan
 * of the serialized JSON would reject the legitimate module id
 * `item_cost_duel` and the legitimate field `challenge_count`, so it is not
 * used here or anywhere else in this reader.
 */
const _FORBIDDEN_SEGMENT_KEYS: ReadonlySet<string> = new Set([
  "cost", "left_cost", "right_cost", "item_cost", "price", "price_gap",
  "correct", "is_correct", "correct_item_id", "correct_index", "answer",
  "opponent_choices", "opponent_submitted_choices", "opponent_choice",
  "opponent_ability_id", "opponent_selected_ability_id", "opponent_times",
  "opponent_submitted_at", "opponent_per_challenge_ms", "score", "scores",
  "winner", "winner_id", "segment_result", "outcomes", "reveal",
  "segment_private", "segment_private_json",
]);

function assertSegmentIsPreRevealSafe(node: unknown, depth = 0): void {
  if (depth > 12 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((v) => assertSegmentIsPreRevealSafe(v, depth + 1));
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (_FORBIDDEN_SEGMENT_KEYS.has(key)) {
      throw new RankedPublicParseError(`segment_state leaked a hidden field: ${key}`);
    }
    assertSegmentIsPreRevealSafe(value, depth + 1);
  }
}

function readSegmentItem(v: unknown, label: string): SegmentItemView {
  const o = rec(v, label);
  return {
    itemId: str(o.item_id, `${label}.item_id`),
    name: nstr(o.name, `${label}.name`),
    itemType: nstr(o.item_type, `${label}.item_type`),
    assetPath: nstr(o.asset_path, `${label}.asset_path`),
  };
}

/**
 * Strict reader for the owner segment state.
 *
 * Absent/null → null (a quiz segment, and every legacy payload). A PRESENT but
 * hidden-information-carrying payload is a hard parse error, not a degrade:
 * unlike the tolerant `segment` discriminator, this block drives real input,
 * so a malformed one must not be rendered at all.
 */
function readSegmentState(v: unknown): SegmentStateView | null {
  if (v === null || v === undefined) return null;
  const o = rec(v, "segment_state");
  if (o.active === false) return null;
  assertSegmentIsPreRevealSafe(o);
  const ability = rec(o.own_ability, "segment_state.own_ability");
  const unavailable: Record<string, string> = {};
  for (const [k, val] of Object.entries(
    rec(ability.unavailable_ability_ids, "unavailable_ability_ids"),
  )) {
    unavailable[k] = str(val, `unavailable_ability_ids.${k}`);
  }
  const challengeBlock = o.challenges === null || o.challenges === undefined
    ? null : rec(o.challenges, "segment_state.challenges");
  const rawChallenges = challengeBlock && Array.isArray(challengeBlock.challenges)
    ? challengeBlock.challenges : [];
  const choices = Array.isArray(o.own_submitted_choices) ? o.own_submitted_choices : [];
  return {
    segmentNumber: num(o.segment_number, "segment_state.segment_number"),
    moduleId: str(o.module_id, "segment_state.module_id"),
    moduleVersion: num(o.module_version, "segment_state.module_version"),
    phase: o.phase === "ability" || o.phase === "challenges" ? o.phase : null,
    challengeCount: num(o.challenge_count, "segment_state.challenge_count"),
    abilityDeadline: nstr(o.ability_deadline, "ability_deadline"),
    challengeStartedAt: nstr(o.challenge_started_at, "challenge_started_at"),
    challengeDeadline: nstr(o.challenge_deadline, "challenge_deadline"),
    pressureApplied: o.pressure_applied === true,
    ownAbility: {
      selectedAbilityId: nstr(ability.selected_ability_id, "selected_ability_id"),
      confirmed: bool(ability.confirmed, "own_ability.confirmed"),
      availableAbilityIds: strList(ability.available_ability_ids, "available_ability_ids"),
      unavailableAbilityIds: unavailable,
    },
    opponentAbilityConfirmed: o.opponent_ability_confirmed === true,
    ownNextChallengeIndex: num(o.own_next_challenge_index, "own_next_challenge_index"),
    // The backend stores a raw `{item_id}` choice; the client only ever needs
    // which item was picked, so it is flattened here and nothing else is kept.
    ownSubmittedChoices: choices.map((c) => {
      if (c === null || c === undefined) return null;
      const choice = rec(c, "own_submitted_choices[]");
      return str(choice.item_id, "own_submitted_choices[].item_id");
    }),
    ownChallengesCompleted: num(o.own_challenges_completed, "own_challenges_completed"),
    opponentChallengesCompleted: num(
      o.opponent_challenges_completed, "opponent_challenges_completed"),
    opponentFinished: o.opponent_finished === true,
    ownFinished: o.own_finished === true,
    prompt: challengeBlock ? nstr(challengeBlock.prompt, "challenges.prompt") : null,
    challenges: rawChallenges.map((c, i) => {
      const challenge = rec(c, `challenges[${i}]`);
      return {
        challengeIndex: num(challenge.challenge_index, `challenges[${i}].challenge_index`),
        left: readSegmentItem(challenge.left, `challenges[${i}].left`),
        right: readSegmentItem(challenge.right, `challenges[${i}].right`),
      };
    }),
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

// ------------------------------------------------- resolved segment reveal

export type SegmentResult = "win" | "loss" | "draw" | "timeout";

export interface SegmentRevealChallenge {
  challengeIndex: number;
  leftItemId: string;
  rightItemId: string;
  leftCost: number;
  rightCost: number;
  correctItemId: string;
}

export interface SegmentRevealPlayer {
  segmentResult: SegmentResult | null;
  correct: number;
  incorrect: number;
  unanswered: number;
  totalResponseMs: number;
  perChallengeMs: (number | null)[];
  choices: (string | null)[];
}

export interface SegmentRevealView {
  moduleId: string;
  challengeCount: number;
  challenges: SegmentRevealChallenge[];
  players: Record<string, SegmentRevealPlayer>;
  /** Already-public display metadata, keyed by item id. */
  items: Record<string, SegmentItemView>;
}

const _SEGMENT_RESULTS: ReadonlySet<string> = new Set([
  "win", "loss", "draw", "timeout"]);

/**
 * Post-settlement segment transcript, or null when the resolved round was a
 * quiz round (no `segment_reveal`).
 *
 * This is the ONLY reader that accepts canonical costs and correct item ids —
 * by then they are terminal data both participants may see. It is deliberately
 * separate from `readSegmentState`, which rejects exactly these fields.
 */
export function readSegmentReveal(payload: unknown): SegmentRevealView | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = (payload as Record<string, unknown>).segment_reveal;
  if (raw === null || raw === undefined) return null;
  const o = rec(raw, "segment_reveal");
  const challenges = Array.isArray(o.challenges) ? o.challenges : [];
  const players: Record<string, SegmentRevealPlayer> = {};
  for (const [pid, value] of Object.entries(rec(o.players, "segment_reveal.players"))) {
    const p = rec(value, `players.${pid}`);
    const result = nstr(p.segment_result, `players.${pid}.segment_result`);
    players[pid] = {
      segmentResult: result && _SEGMENT_RESULTS.has(result)
        ? (result as SegmentResult) : null,
      correct: num(p.correct, `players.${pid}.correct`),
      incorrect: num(p.incorrect, `players.${pid}.incorrect`),
      unanswered: num(p.unanswered, `players.${pid}.unanswered`),
      totalResponseMs: num(p.total_response_ms, `players.${pid}.total_response_ms`),
      perChallengeMs: (Array.isArray(p.per_challenge_ms) ? p.per_challenge_ms : [])
        .map((ms, i) => nnum(ms, `players.${pid}.per_challenge_ms[${i}]`)),
      choices: (Array.isArray(p.choices) ? p.choices : [])
        .map((c, i) => nstr(c, `players.${pid}.choices[${i}]`)),
    };
  }
  const items: Record<string, SegmentItemView> = {};
  if (o.items && typeof o.items === "object") {
    for (const [id, value] of Object.entries(o.items as Record<string, unknown>)) {
      items[id] = readSegmentItem(value, `items.${id}`);
    }
  }
  return {
    moduleId: str(o.module_id, "segment_reveal.module_id"),
    challengeCount: num(o.challenge_count, "segment_reveal.challenge_count"),
    challenges: challenges.map((c, i) => {
      const ch = rec(c, `segment_reveal.challenges[${i}]`);
      return {
        challengeIndex: num(ch.challenge_index, `challenges[${i}].challenge_index`),
        leftItemId: str(ch.left_item_id, `challenges[${i}].left_item_id`),
        rightItemId: str(ch.right_item_id, `challenges[${i}].right_item_id`),
        leftCost: num(ch.left_cost, `challenges[${i}].left_cost`),
        rightCost: num(ch.right_cost, `challenges[${i}].right_cost`),
        correctItemId: str(ch.correct_item_id, `challenges[${i}].correct_item_id`),
      };
    }),
    players,
    items,
  };
}

export interface SegmentSettlementView {
  reveal: SegmentRevealView;
  /** Damage each player DEALT this segment, straight from the settlement. */
  damageByPlayerId: Record<string, number>;
  /** The ability each player actually used, revealed only now. */
  abilitiesByPlayerId: Record<string, string | null>;
}

/**
 * A resolved round's segment transcript plus the settlement values it needs,
 * or null when the round was an ordinary quiz round.
 *
 * The damage and ability values are read from the same authoritative
 * settlement the arena already renders — nothing is recomputed here.
 */
export function readSegmentSettlement(payload: unknown): SegmentSettlementView | null {
  const reveal = readSegmentReveal(payload);
  if (!reveal) return null;
  const damageByPlayerId: Record<string, number> = {};
  const abilitiesByPlayerId: Record<string, string | null> = {};
  const players = (payload as Record<string, unknown>)?.players;
  if (Array.isArray(players)) {
    for (const raw of players) {
      if (!raw || typeof raw !== "object") continue;
      const p = raw as Record<string, unknown>;
      const pid = typeof p.player_id === "string" ? p.player_id : null;
      if (!pid) continue;
      const damage = p.damage as Record<string, unknown> | undefined;
      if (damage && typeof damage.final_damage_dealt === "number") {
        damageByPlayerId[pid] = damage.final_damage_dealt;
      }
      abilitiesByPlayerId[pid] = typeof p.selected_ability_id === "string"
        ? p.selected_ability_id : null;
    }
  }
  return { reveal, damageByPlayerId, abilitiesByPlayerId };
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
  /** Viewer's own applied rating movement (F2.2); null when the result was
   * skipped/pending or predates rating application. */
  ratingDelta: number | null;
  ratingAfter: number | null;
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
      // Absent on pre-F2.2 backends — tolerate missing as null.
      ratingDelta: nnum(e.rating_delta, `entries[${i}].rating_delta`),
      ratingAfter: nnum(e.rating_after, `entries[${i}].rating_after`),
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
