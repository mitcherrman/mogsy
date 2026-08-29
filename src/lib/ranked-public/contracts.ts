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
import { isRankedRole, type RankedRole } from "./roles";
import {
  readTimelineTopic, type TimelineTopic,
} from "@/components/quiz/timeline/timelineNodeModel";
import { parseRankTier, type RankTier } from "@/lib/progression/tiers";

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

// ------------------------------------------------- Mastery Slice (Phase 4F)

/**
 * One pre-reveal Mastery Slice challenge (`mastery_slice.v1`, Phase 4F proof
 * of concept). Field names mirror the backend module's public allow-list
 * exactly (`ranked_modules/mastery_slice.py::PUBLIC_CHALLENGE_FIELDS`) and,
 * beneath `promptSemantics`/`comparisonSemantics`, the EXISTING Mastery
 * `prompt_semantics`/`comparison_semantics` wire shape those interaction
 * renderers already parse — nothing here reformats them.
 */
export interface MasterySliceChallengeView {
  challengeIndex: number;
  interactionKind: string;
  questionFamily: string;
  prompt: string;
  answerType: "single_choice" | "numeric" | "boolean";
  answerOptions: string[];
  /** Raw backend `prompt_semantics` dict, present only for `atomic_recall`. */
  promptSemantics: Record<string, unknown> | null;
  /** Raw backend `comparison_semantics` dict, present only for
   *  `comparison_left_right`. */
  comparisonSemantics: Record<string, unknown> | null;
}

// ------------------------------------------------- Meta Reflex cards (v4)

/**
 * The module VERSION at which `item_cost_duel` stops being five item-cost
 * pairs and becomes the mixed Meta Reflex block (QUIZ1 Phase 4).
 *
 * The module ID is unchanged on purpose — it is what every historical row,
 * reveal and analytics record already stores — so the version is the only
 * thing that says which card contract a segment speaks. Version dispatch is
 * therefore EXPLICIT here and in the renderer registry, never inferred from
 * which fields happen to be present: guessing would let a v1 payload be read
 * as a v4 one the moment the backend added a field.
 */
export const META_REFLEX_MIXED_VERSION = 4;

export type MetaReflexCardKind = "magnitude" | "recognition" | "classification";

const _META_REFLEX_KINDS: ReadonlySet<string> = new Set<MetaReflexCardKind>([
  "magnitude", "recognition", "classification",
]);

/**
 * A NAMED side: the entity is identified because the prompt asks about two
 * named things ("which item costs more?", "which champion is ranged?").
 *
 * `media` is a repo-relative asset path on the combat API origin, or null when
 * the entity has no art. It is never parsed for identity — `label` is the only
 * thing rendered as a name.
 */
export interface MetaReflexNamedSide {
  entityId: string;
  label: string;
  media: string | null;
}

/**
 * An ANONYMOUS side: a recognition card's prompt names its target, so the
 * entity id, the label and the ordinary asset path would each BE the answer.
 * The backend therefore publishes one positional URL and nothing else, and the
 * client answers with the positional card id.
 */
export interface MetaReflexArtSide {
  mediaUrl: string;
}

interface MetaReflexCardBase {
  challengeIndex: number;
  prompt: string;
  /** "item" | "champion" | "ability" — display grouping only. */
  entityKind: string;
  /** Server-issued positional tokens. The ONLY thing a v4 answer may name. */
  leftCardId: string;
  rightCardId: string;
}

export interface MetaReflexMagnitudeCard extends MetaReflexCardBase {
  kind: "magnitude";
  left: MetaReflexNamedSide;
  right: MetaReflexNamedSide;
}

/**
 * "Which champion uses Energy?" — projected exactly like a magnitude card
 * because the two champions are the QUESTION. What is absent from the payload,
 * and must therefore be absent from the UI, is the property being asked about.
 */
export interface MetaReflexClassificationCard extends MetaReflexCardBase {
  kind: "classification";
  left: MetaReflexNamedSide;
  right: MetaReflexNamedSide;
}

export interface MetaReflexRecognitionCard extends MetaReflexCardBase {
  kind: "recognition";
  left: MetaReflexArtSide;
  right: MetaReflexArtSide;
}

export type MetaReflexCard =
  | MetaReflexMagnitudeCard
  | MetaReflexClassificationCard
  | MetaReflexRecognitionCard;

/** One side of a settled card, as the backend described it. */
export interface SettledCardSide {
  label: string | null;
  /**
   * The compared value, ALREADY FORMATTED server-side ("3,200 gold", "66 AD",
   * "Ranged"). `null` where the card compares nothing — a recognition card —
   * which is a different statement from an empty string and is rendered as
   * nothing rather than as a blank.
   */
  valueDisplay: string | null;
}

/**
 * RG3 — one Meta Reflex card the viewer has FINISHED, and may therefore be
 * told about.
 *
 * A reflex card is terminal after one tap or one expiry: the server has scored
 * it and the player can never answer it again, which is exactly the argument
 * that lets a settled ROUND disclose, applied one card down. The block's five
 * cards are independent questions, so knowing card 1 says nothing about card 2.
 *
 * `outcome` is the server's word, not a comparison this client makes. A client
 * that derived it by matching `selectedCardId` against `correctCardId` would be
 * re-judging an attempt the server already judged, and the two could disagree
 * on the one case that matters: a card that expired in the same instant it was
 * tapped.
 */
export interface SettledCardReveal {
  challengeIndex: number;
  kind: MetaReflexCardKind | null;
  entityKind: string | null;
  outcome: "correct" | "incorrect" | "timeout" | "unanswered";
  /** The positional token the viewer answered with, or null. */
  selectedCardId: string | null;
  /** The positional token that was right, or null if the payload omitted it. */
  correctCardId: string | null;
  left: SettledCardSide;
  right: SettledCardSide;
}

/**
 * One challenge of a `mastery_slice.v1` segment (Phase 4F proof of concept).
 *
 * Deliberately the SAME shape `ranked_modules.mastery_slice.public_view`
 * emits — no reformatting here. `promptSemantics`/`comparisonSemantics` are
 * handed straight to the EXISTING Mastery interaction renderers
 * (`features/mastery/interactions`), never re-parsed into a new structure.
 */
export interface MasterySliceChallengeView {
  challengeIndex: number;
  interactionKind: string;
  questionFamily: string;
  prompt: string;
  answerType: "single_choice" | "numeric" | "boolean";
  answerOptions: string[];
  promptSemantics: Record<string, unknown> | null;
  comparisonSemantics: Record<string, unknown> | null;
}

/**
 * The block's cards, discriminated by the card contract the segment's module
 * ID (and, for `item_cost_duel`, version) pins. Exactly one shape is ever
 * present: none are merged and none fall back to one another.
 */
export type SegmentBlockView =
  | { contract: "item_cost"; challenges: SegmentChallengeView[] }
  | { contract: "meta_reflex"; cards: MetaReflexCard[] }
  | { contract: "mastery_slice"; challenges: MasterySliceChallengeView[] };

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
  /**
   * Per-card timing (QUIZ1 Phase 3), all null for a block-clocked segment.
   * These are SERVER timestamps: a client renders a countdown from them and
   * decides nothing, so a drifting or tampered local clock changes no outcome.
   */
  cardTimerMs: number | null;
  ownCardIndex: number | null;
  ownCardStartedAt: string | null;
  ownCardDeadline: string | null;
  /** Per-card expiry flags for the viewer, or null on a block-clocked segment. */
  ownTimedOutChallenges: boolean[] | null;
  /** Present only in the challenge phase. */
  prompt: string | null;
  /** Present only in the challenge phase; discriminated by card contract. */
  block: SegmentBlockView | null;
  /**
   * RG3 — the viewer's OWN finished cards, oldest first. Empty on every
   * block-clocked segment, on a module version that does not publish them, and
   * before the first card settles.
   */
  ownCardReveals: SettledCardReveal[];
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
  /** R1: `role` is the FROZEN League role of each participant. Always
   * present as a key; `null` for every pre-R1 match and for any player the
   * backend has no role for. Never derived from `classId`. */
  players: (PublicCombatantSource & { maxHp: number | null; role: RankedRole | null })[];
  activeRound: PublicActiveRound | null;
  nextRoundDurationSeconds: number;
  question: PublicQuestionSource | null;
  /** Always populated by the reader; defaults to `quiz.v1` when absent. */
  segment: SegmentMeta;
  /** Owner state of the active multi-challenge segment; null for quiz. */
  segmentState: SegmentStateView | null;
  progressionPendingPlayers: string[];
  /**
   * R1: can a level-up EVER be due in this match? Derived by the backend from
   * the match's own FROZEN config, so it answers for the match as created and
   * never for how the server is configured now.
   *
   * This — and ONLY this — decides whether legacy ability/progression UI may
   * render. Role, class, XP, the feature flag, and whether a choice happens to
   * be pending right now are all wrong signals for that question.
   *
   * Compatibility-safe: an older backend that does not send the field at all
   * reads as `true`, so a client that ships ahead of the backend keeps showing
   * the progression UI that legacy matches require rather than hiding it.
   */
  progressionEnabled: boolean;
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
  /**
   * The queue entry's own server-side status, passed through verbatim by
   * `_status_snapshot` in `ranked_public/queue.py`.
   *
   * `claimed` is REAL and was missing here. It is the pairing window: the
   * pairing pass has taken this entry for a match but has not yet written the
   * match rows, so the account is neither waiting nor matched. The entry
   * cannot be cancelled in that state (the DELETE answers
   * `RANKED_CANNOT_CANCEL`), and a reader that folds `claimed` in with
   * `cancelled`/`expired` concludes the player left the queue at the exact
   * moment they were being given a match. Callers must treat it as
   * still-in-flight — see THE PAIRING WINDOW in `useRankedQueue.ts`.
   */
  status: "not_queued" | "waiting" | "claimed" | "matched" | "cancelled" | "expired";
  matchId: string | null;
  queueVersion: number | null;
  /** Legacy combat class the entry carries. Retained because the contract
   * still carries it; never shown to the normal player and never mapped to
   * or from `role`. */
  classId: string | null;
  /** R1: the League role this entry queued as. Null with the backend flag
   * off or on a pre-R1 entry. */
  role: RankedRole | null;
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

/**
 * R1 role off the wire. Null/absent/unrecognised all read as `null` — "no
 * role" is a normal, permanently-supported value, and an unknown role is
 * never coerced into one of the five or synthesized from a class.
 */
function readRole(value: unknown): RankedRole | null {
  return isRankedRole(value) ? value : null;
}

/**
 * R1 `progression_enabled`, parsed COMPATIBILITY-SAFE.
 *
 * Only an explicit `false` hides the legacy progression UI. Absent, null, or
 * any non-boolean reads as `true`, because the field is absent exactly when
 * this client is talking to a backend that predates R1 — and on such a
 * backend every match is a legacy match whose ability tray and Level 2 choice
 * are mandatory. Defaulting to `false` here would wedge a reconnecting player
 * on an old match waiting for a choice control the client had hidden.
 */
function readProgressionEnabled(value: unknown): boolean {
  return value !== false;
}

function readPlayer(value: unknown, i: number):
PublicCombatantSource & { maxHp: number | null; role: RankedRole | null } {
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
    role: readRole(p.role),
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
    // RG2. Tolerant like the presentation reader above and for the same
    // reason: this block carries no secret and no combat value, so a malformed
    // or absent one degrades to a neutral timeline node rather than breaking
    // an otherwise valid live match.
    topic: readTimelineTopic(q.topic),
  };
}

/**
 * Read a STANDALONE public question payload — the same block a live round
 * transports, delivered by an endpoint that returns only the question.
 *
 * Exported for the admin candidate preview (RA9), which reads exactly this
 * shape from `/api/admin/ranked-duel/questions/candidates/{id}/public-view`.
 * It reuses this reader rather than growing a second copy of the transport
 * normalization, so presentation/option-media handling and the
 * `assertNoCorrectness` guard cannot diverge between the two callers. Pure and
 * unchanged for the live path — this is a re-export, not a new behaviour.
 */
export function readPublicQuestion(value: unknown): PublicQuestionSource | null {
  return readQuestion(value);
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
    progressionEnabled: readProgressionEnabled(payload.progression_enabled),
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
  // RG3 — the mixed-card (v4) answer vocabulary. The set above was written
  // against v1's item-cost payload and knew none of these spellings, so a
  // compared value could have arrived on a LIVE card and passed the walk.
  // Naming them is what makes `own_card_reveals` the only way any of them can
  // reach this reader.
  "left_value", "right_value", "correct_entity_id", "correct_side",
  "correct_card_id",
]);

/**
 * The ONE key of a live segment payload that legitimately carries answers
 * (RG3): the cards this viewer has already finished.
 *
 * It is LIFTED OUT before the pre-reveal walk and checked on its own terms,
 * never exempted inside the walk. An exemption would blind the guard to the
 * same field appearing anywhere under a key of this name; lifting it means the
 * guard still sees — and still rejects — `left_value` everywhere else.
 */
const SETTLED_REVEAL_KEY = "own_card_reveals";

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

/** A magnitude / classification side: named entity + optional art. */
function readNamedSide(v: unknown, label: string): MetaReflexNamedSide {
  const o = rec(v, label);
  return {
    entityId: str(o.entity_id, `${label}.entity_id`),
    label: str(o.label, `${label}.label`),
    media: nstr(o.media, `${label}.media`),
  };
}

/**
 * A recognition side: positional art and NOTHING else.
 *
 * `entity_id` / `label` are rejected rather than ignored. The backend's own
 * projection cannot emit them for this kind, so their presence means the
 * payload is not what it claims to be — and quietly dropping them would let a
 * future mistake ship the answer into the DOM unnoticed.
 */
function readArtSide(v: unknown, label: string): MetaReflexArtSide {
  const o = rec(v, label);
  for (const forbidden of ["entity_id", "label", "media"]) {
    if (forbidden in o) {
      throw new RankedPublicParseError(
        `${label} is a recognition card side and must not carry ${forbidden}`);
    }
  }
  return { mediaUrl: str(o.media_url, `${label}.media_url`) };
}

/**
 * One Meta Reflex card, parsed into a discriminated union on `kind`.
 *
 * Strict and fail-closed in both directions: an unknown kind is rejected
 * (rendering it would mean guessing which fields are safe to show), and each
 * kind's sides are read through the reader for THAT kind only, so a magnitude
 * card cannot be rendered as art-only and a recognition card cannot acquire a
 * label. Hidden fields are not read as optional "just in case" — the compared
 * value, the correct side and the classification simply do not exist here.
 */
function readMetaReflexCard(v: unknown, label: string): MetaReflexCard {
  const o = rec(v, label);
  const kind = str(o.kind, `${label}.kind`);
  if (!_META_REFLEX_KINDS.has(kind)) {
    throw new RankedPublicParseError(`${label}.kind "${kind}" is not a Meta Reflex card kind`);
  }
  const base = {
    challengeIndex: num(o.challenge_index, `${label}.challenge_index`),
    prompt: str(o.prompt, `${label}.prompt`),
    entityKind: str(o.entity_kind, `${label}.entity_kind`),
    leftCardId: str(o.left_card_id, `${label}.left_card_id`),
    rightCardId: str(o.right_card_id, `${label}.right_card_id`),
  };
  if (kind === "recognition") {
    return { ...base, kind, left: readArtSide(o.left, `${label}.left`),
      right: readArtSide(o.right, `${label}.right`) };
  }
  return {
    ...base,
    kind: kind as "magnitude" | "classification",
    left: readNamedSide(o.left, `${label}.left`),
    right: readNamedSide(o.right, `${label}.right`),
  };
}

/**
 * The challenge block, read under the card contract the module VERSION pins.
 *
 * Version dispatch is the whole point: a v1–v3 payload is never offered to the
 * v4 reader and vice versa, so an old payload cannot be coerced into the new
 * shape by a lucky field name, and a v4 payload cannot be silently rendered by
 * the item renderer that would then submit an `item_id` the server refuses.
 */
function readMasterySliceChallenge(v: unknown, label: string): MasterySliceChallengeView {
  const c = rec(v, label);
  const answerType = c.answer_type;
  if (answerType !== "single_choice" && answerType !== "numeric" && answerType !== "boolean") {
    throw new RankedPublicParseError(`${label}.answer_type must be a Mastery answer type`);
  }
  return {
    challengeIndex: num(c.challenge_index, `${label}.challenge_index`),
    interactionKind: str(c.interaction_kind, `${label}.interaction_kind`),
    questionFamily: str(c.question_family, `${label}.question_family`),
    prompt: str(c.prompt, `${label}.prompt`),
    answerType,
    answerOptions: strList(c.answer_options, `${label}.answer_options`),
    promptSemantics: c.prompt_semantics === null || c.prompt_semantics === undefined
      ? null : rec(c.prompt_semantics, `${label}.prompt_semantics`),
    comparisonSemantics: c.comparison_semantics === null || c.comparison_semantics === undefined
      ? null : rec(c.comparison_semantics, `${label}.comparison_semantics`),
  };
}

function readSegmentBlock(
  raw: unknown, moduleId: string, moduleVersion: number,
): SegmentBlockView | null {
  if (raw === null || raw === undefined) return null;
  const block = rec(raw, "segment_state.challenges");
  const list = Array.isArray(block.challenges) ? block.challenges : [];
  if (moduleId === "mastery_slice") {
    return {
      contract: "mastery_slice",
      challenges: list.map((c, i) => readMasterySliceChallenge(c, `challenges[${i}]`)),
    };
  }
  if (moduleVersion >= META_REFLEX_MIXED_VERSION) {
    return {
      contract: "meta_reflex",
      cards: list.map((c, i) => readMetaReflexCard(c, `cards[${i}]`)),
    };
  }
  return {
    contract: "item_cost",
    challenges: list.map((c, i) => {
      const challenge = rec(c, `challenges[${i}]`);
      return {
        challengeIndex: num(challenge.challenge_index, `challenges[${i}].challenge_index`),
        left: readSegmentItem(challenge.left, `challenges[${i}].left`),
        right: readSegmentItem(challenge.right, `challenges[${i}].right`),
      };
    }),
  };
}

/**
 * The viewer's own already-submitted choices, flattened to the one token the
 * client needs. Which key carries it is the version's business: v4 records the
 * CARD that was picked (`card_id`), v1–v3 recorded the item (`item_id`). Each
 * is read strictly under its own contract, so a v4 segment can never surface a
 * v3-shaped choice and vice versa.
 */
function readSubmittedChoices(
  raw: unknown, moduleId: string, moduleVersion: number,
): (string | null)[] {
  const choices = Array.isArray(raw) ? raw : [];
  const key = moduleId === "mastery_slice"
    ? "selected"
    : moduleVersion >= META_REFLEX_MIXED_VERSION ? "card_id" : "item_id";
  return choices.map((c) => {
    if (c === null || c === undefined) return null;
    const choice = rec(c, "own_submitted_choices[]");
    if (key === "selected") {
      // A Mastery Slice choice may be a string, number, or boolean; the echo
      // is display-only, so it is stringified rather than re-typed.
      const v = choice[key];
      return v === null || v === undefined ? null : String(v);
    }
    return str(choice[key], `own_submitted_choices[].${key}`);
  });
}

/**
 * Strict reader for the owner segment state.
 *
 * Absent/null → null (a quiz segment, and every legacy payload). A PRESENT but
 * hidden-information-carrying payload is a hard parse error, not a degrade:
 * unlike the tolerant `segment` discriminator, this block drives real input,
 * so a malformed one must not be rendered at all.
 */
/** One settled card, read field by field. Nothing is forwarded wholesale. */
function readSettledCardReveal(v: unknown, label: string): SettledCardReveal {
  const o = rec(v, label);
  const outcome = o.outcome;
  if (outcome !== "correct" && outcome !== "incorrect"
      && outcome !== "timeout" && outcome !== "unanswered") {
    throw new RankedPublicParseError(
      `${label}.outcome must be a settled-card outcome (got ${String(outcome)})`);
  }
  const side = (raw: unknown, where: string): SettledCardSide => {
    const s = rec(raw, where);
    return {
      label: nstr(s.label, `${where}.label`),
      valueDisplay: nstr(s.value_display, `${where}.value_display`),
    };
  };
  const kind = o.kind;
  return {
    challengeIndex: num(o.challenge_index, `${label}.challenge_index`),
    kind: typeof kind === "string" && _META_REFLEX_KINDS.has(kind)
      ? (kind as MetaReflexCardKind) : null,
    entityKind: nstr(o.entity_kind, `${label}.entity_kind`),
    outcome,
    selectedCardId: nstr(o.selected_card_id, `${label}.selected_card_id`),
    correctCardId: nstr(o.correct_card_id, `${label}.correct_card_id`),
    left: side(o.left, `${label}.left`),
    right: side(o.right, `${label}.right`),
  };
}

/**
 * The settled-card reveals, re-checked against the viewer's own active index.
 *
 * The backend derives both from one schedule and asserts the same invariant at
 * its transport boundary, so this can only fire on a payload that is already
 * wrong. It exists anyway because the cost of being wrong here is the answer to
 * a card the player is still looking at: the reader REFUSES the payload rather
 * than filtering it, so a contract breach is loud instead of partially obeyed.
 */
function readSettledCardReveals(v: unknown, activeIndex: number): SettledCardReveal[] {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v)) {
    throw new RankedPublicParseError("own_card_reveals must be an array");
  }
  return v.map((entry, i) => {
    const reveal = readSettledCardReveal(entry, `own_card_reveals[${i}]`);
    if (reveal.challengeIndex >= activeIndex) {
      throw new RankedPublicParseError(
        `own_card_reveals[${i}] discloses card ${reveal.challengeIndex} while `
        + `the viewer may still answer card ${activeIndex}`);
    }
    return reveal;
  });
}

function readSegmentState(v: unknown): SegmentStateView | null {
  if (v === null || v === undefined) return null;
  const o = rec(v, "segment_state");
  if (o.active === false) return null;
  // The walk sees everything EXCEPT the settled-card carve-out, which is
  // checked on its own terms below. See SETTLED_REVEAL_KEY.
  const preReveal: Record<string, unknown> = { ...o };
  delete preReveal[SETTLED_REVEAL_KEY];
  assertSegmentIsPreRevealSafe(preReveal);
  const ability = rec(o.own_ability, "segment_state.own_ability");
  const unavailable: Record<string, string> = {};
  for (const [k, val] of Object.entries(
    rec(ability.unavailable_ability_ids, "unavailable_ability_ids"),
  )) {
    unavailable[k] = str(val, `unavailable_ability_ids.${k}`);
  }
  const moduleVersion = num(o.module_version, "segment_state.module_version");
  const moduleId = str(o.module_id, "segment_state.module_id");
  const challengeBlock = o.challenges === null || o.challenges === undefined
    ? null : rec(o.challenges, "segment_state.challenges");
  return {
    segmentNumber: num(o.segment_number, "segment_state.segment_number"),
    moduleId,
    moduleVersion,
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
    ownSubmittedChoices: readSubmittedChoices(o.own_submitted_choices, moduleId, moduleVersion),
    ownChallengesCompleted: num(o.own_challenges_completed, "own_challenges_completed"),
    opponentChallengesCompleted: num(
      o.opponent_challenges_completed, "opponent_challenges_completed"),
    opponentFinished: o.opponent_finished === true,
    ownFinished: o.own_finished === true,
    cardTimerMs: nnum(o.card_timer_ms, "card_timer_ms"),
    ownCardIndex: nnum(o.own_card_index, "own_card_index"),
    ownCardStartedAt: nstr(o.own_card_started_at, "own_card_started_at"),
    ownCardDeadline: nstr(o.own_card_deadline, "own_card_deadline"),
    ownTimedOutChallenges: Array.isArray(o.own_timed_out_challenges)
      ? o.own_timed_out_challenges.map((f, i) =>
        bool(f, `own_timed_out_challenges[${i}]`))
      : null,
    prompt: challengeBlock ? nstr(challengeBlock.prompt, "challenges.prompt") : null,
    block: readSegmentBlock(o.challenges, moduleId, moduleVersion),
    ownCardReveals: readSettledCardReveals(
      o[SETTLED_REVEAL_KEY],
      num(o.own_next_challenge_index, "own_next_challenge_index")),
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

/**
 * One settled card, normalised across both reveal contracts.
 *
 * v1–v3 describe an item-cost pair (`left_item_id` / `left_cost`); v4 describes
 * a mixed card (`left_entity_id` / `left_label` / `left_value`, where "value"
 * is a number for a magnitude card, the canonical property for a classification
 * card, and nothing at all for a recognition card). Both are read into this one
 * shape so the transcript has a single rendering path, and the reader — not the
 * component — decides what each contract's fields MEAN.
 */
export interface SegmentRevealChallenge {
  challengeIndex: number;
  /** Card kind; null for a v1–v3 segment, which had only one. */
  kind: MetaReflexCardKind | null;
  leftId: string;
  rightId: string;
  correctId: string;
  /** Label frozen with the card (v4). Null for v1–v3 → look up in `items`. */
  leftLabel: string | null;
  rightLabel: string | null;
  /** Formatted compared value, or null where the card has none. */
  leftValue: string | null;
  rightValue: string | null;
}

export interface SegmentRevealPlayer {
  segmentResult: SegmentResult | null;
  correct: number;
  incorrect: number;
  unanswered: number;
  totalResponseMs: number;
  perChallengeMs: (number | null)[];
  choices: (string | null)[];
  // --- Meta Reflex additive scoring (module v2+). Absent on a v1 block. ---
  /**
   * The player cleared every card in the block. Worth `PERFECT_BONUS` damage
   * server-side; the MAGNITUDE is a server constant and is deliberately not
   * reconstructed here — this is the flag the settlement states, nothing more.
   */
  perfect: boolean;
  /**
   * Damage earned for finishing a PERFECT block strictly sooner than the
   * opponent. 0 for everyone else, including the fastest player of an
   * imperfect block: the premium is layered on accuracy and is worth nothing
   * without it. Read straight off the settlement — never derived from
   * `perChallengeMs`, which cannot see the server's own timing authority.
   */
  speedBonus: number;
  /**
   * The block damage the MODULE derived (correct + perfect + speed), before
   * the engine's modifiers, shields and reductions. Null on a v1 block.
   *
   * NOT the number to show as "damage dealt": that is the engine's
   * `final_damage_dealt`, which this can legitimately differ from. It is here
   * so the bonus breakdown is auditable against the total.
   */
  damageDealt: number | null;
}

export interface SegmentRevealView {
  moduleId: string;
  /** Which card contract this transcript was settled under. */
  moduleVersion: number;
  challengeCount: number;
  challenges: SegmentRevealChallenge[];
  players: Record<string, SegmentRevealPlayer>;
  /** Already-public display metadata, keyed by item id. Empty for v4, whose
   * cards carry their own labels. */
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
      // Additive-scoring fields, read COMPATIBILITY-SAFE. A v1 Item Cost Duel
      // block carries none of them and must keep parsing byte-identically, so
      // absent reads as "no bonus" rather than as a malformed payload.
      perfect: nbool(p.perfect, `players.${pid}.perfect`) === true,
      speedBonus: nnum(p.speed_bonus, `players.${pid}.speed_bonus`) ?? 0,
      damageDealt: nnum(p.damage_dealt, `players.${pid}.damage_dealt`),
    };
  }
  const items: Record<string, SegmentItemView> = {};
  if (o.items && typeof o.items === "object") {
    for (const [id, value] of Object.entries(o.items as Record<string, unknown>)) {
      items[id] = readSegmentItem(value, `items.${id}`);
    }
  }
  // Pre-v4 rows predate the field; they are all v1 by construction.
  const moduleVersion = typeof o.module_version === "number" ? o.module_version : 1;
  return {
    moduleId: str(o.module_id, "segment_reveal.module_id"),
    moduleVersion,
    challengeCount: num(o.challenge_count, "segment_reveal.challenge_count"),
    challenges: challenges.map((c, i) => readRevealChallenge(c, i, moduleVersion)),
    players,
    items,
  };
}

/** A settled card, read under the contract its module version pins. */
function readRevealChallenge(raw: unknown, i: number,
                             moduleVersion: number): SegmentRevealChallenge {
  const ch = rec(raw, `segment_reveal.challenges[${i}]`);
  const challengeIndex = num(ch.challenge_index, `challenges[${i}].challenge_index`);
  if (moduleVersion < META_REFLEX_MIXED_VERSION) {
    return {
      challengeIndex,
      kind: null,
      leftId: str(ch.left_item_id, `challenges[${i}].left_item_id`),
      rightId: str(ch.right_item_id, `challenges[${i}].right_item_id`),
      correctId: str(ch.correct_item_id, `challenges[${i}].correct_item_id`),
      leftLabel: null,
      rightLabel: null,
      // Every v1–v3 magnitude was gold, so the unit is safe to state here and
      // only here. v4's magnitudes are gold, HP, armour, range or move speed,
      // and the backend sends no unit — so v4 renders the bare number.
      leftValue: `${num(ch.left_cost, `challenges[${i}].left_cost`)}g`,
      rightValue: `${num(ch.right_cost, `challenges[${i}].right_cost`)}g`,
    };
  }
  const kind = str(ch.kind, `challenges[${i}].kind`);
  if (!_META_REFLEX_KINDS.has(kind)) {
    throw new RankedPublicParseError(
      `challenges[${i}].kind "${kind}" is not a Meta Reflex card kind`);
  }
  const value = (v: unknown, label: string): string | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "number" || typeof v === "string") return String(v);
    throw new RankedPublicParseError(`${label} must be a number, a string or null`);
  };
  return {
    challengeIndex,
    kind: kind as MetaReflexCardKind,
    leftId: str(ch.left_entity_id, `challenges[${i}].left_entity_id`),
    rightId: str(ch.right_entity_id, `challenges[${i}].right_entity_id`),
    correctId: str(ch.correct_entity_id, `challenges[${i}].correct_entity_id`),
    leftLabel: nstr(ch.left_label, `challenges[${i}].left_label`),
    rightLabel: nstr(ch.right_label, `challenges[${i}].right_label`),
    leftValue: value(ch.left_value, `challenges[${i}].left_value`),
    rightValue: value(ch.right_value, `challenges[${i}].right_value`),
  };
}

/**
 * The ENTITY a recorded choice names, for one settled card.
 *
 * v1–v3 recorded the item itself, so the choice already is the entity. v4
 * records the CARD (`c2:left`), which is exactly why the transcript cannot
 * compare a choice against `correctId` directly — it has to ask the card which
 * entity was on that side. Returns null for no answer, and for a token that
 * does not belong to this card.
 */
export function revealChoiceEntityId(
  reveal: SegmentRevealView,
  challenge: SegmentRevealChallenge,
  choice: string | null,
): string | null {
  if (choice === null) return null;
  if (reveal.moduleVersion < META_REFLEX_MIXED_VERSION) return choice;
  if (choice === `c${challenge.challengeIndex}:left`) return challenge.leftId;
  if (choice === `c${challenge.challengeIndex}:right`) return challenge.rightId;
  return null;
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
    role: readRole(p.role),
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
  /** R1: carried ALONGSIDE the class, never instead of it. `null` on every
   * historical row — such a row renders from the class fields as a clearly
   * legacy label, and NEVER as a role mapped from that class. */
  viewerRole: RankedRole | null;
  opponentRole: RankedRole | null;
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
      viewerRole: readRole(e.viewer_role),
      opponentRole: readRole(e.opponent_role),
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

/**
 * The caller's own Ranked role preference (`GET/PUT /api/ranked/role`).
 *
 * `role: null` is a normal, permanent answer — an account that has never
 * chosen has no row. It is NOT an error state and is NOT filled in from the
 * account's legacy class or match history.
 */
export interface RankedRoleView {
  role: RankedRole | null;
  selectedAt: string | null;
  updatedAt: string | null;
}

export function readRankedRole(body: unknown): RankedRoleView {
  const b = rec(body, "ranked_role");
  return {
    role: readRole(b.role),
    selectedAt: nstr(b.selected_at, "selected_at"),
    updatedAt: nstr(b.updated_at, "updated_at"),
  };
}

/**
 * The caller's own Ranked five-tier progression (`GET /api/ranked/progression`).
 *
 * RE1 Phase 3B. Every number here is DERIVED SERVER-SIDE from the competitive
 * rating; this client renders them and re-derives no threshold of its own, so
 * a later cutoff change cannot leave the two disagreeing. Nothing is stored.
 *
 * This is Mogzy competitive standing, NOT the player's Riot Solo Queue rank.
 */
export interface RankedProgressionView {
  rating: number;
  tier: RankTier;
  nextTier: RankTier | null;
  nextTierRating: number | null;
  ratingToNext: number;
  progressPercent: number;
  /** False for an account that has never had a rated match. */
  rated: boolean;
  matchesRated: number;
}

/**
 * Parse the progression payload. The tier must be one of the canonical five —
 * a legacy League tier (iron/platinum/emerald/master/grandmaster) or an
 * unknown token is a contract violation here, not a value to render.
 */
export function readRankedProgression(body: unknown): RankedProgressionView {
  const b = rec(body, "ranked_progression");
  const tier = parseRankTier(b.ranked_tier);
  if (tier === null) {
    throw new RankedPublicParseError("ranked_tier must be a canonical five-tier value");
  }
  const rawNext = b.ranked_next_tier;
  let nextTier: RankTier | null = null;
  if (rawNext !== null && rawNext !== undefined) {
    nextTier = parseRankTier(rawNext);
    if (nextTier === null) {
      throw new RankedPublicParseError("ranked_next_tier must be canonical or null");
    }
  }
  return {
    rating: num(b.rating, "rating"),
    tier,
    nextTier,
    nextTierRating: nnum(b.ranked_next_tier_rating, "ranked_next_tier_rating"),
    ratingToNext: num(b.ranked_rating_to_next, "ranked_rating_to_next"),
    progressPercent: num(b.ranked_progress_percent, "ranked_progress_percent"),
    rated: b.rated === undefined ? true : bool(b.rated, "rated"),
    matchesRated: b.matches_rated === undefined ? 0 : num(b.matches_rated, "matches_rated"),
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
  /** R1, mirrored at the resume top level exactly as
   * `progressionPendingPlayers` already is, so a reconnecting client can
   * settle "does this match have progression at all" without reaching into
   * the embedded public projection. Same compatibility-safe parse. */
  progressionEnabled: boolean;
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
    progressionEnabled: readProgressionEnabled(p.progression_enabled),
    latestResolved: p.latest_resolved_round === null || p.latest_resolved_round === undefined
      ? null : rec(p.latest_resolved_round, "latest_resolved_round"),
    result: p.result === null || p.result === undefined ? null : readMatchResult(p.result),
  };
}

// ---------------------------------------------- MALT B1: post-match review

/**
 * What an icon on a match timeline was PROVEN to depict.
 *
 * The backend derives this from the round's frozen, already-sanitized media
 * blob and never from the prompt's prose, so a `champion` hint is a fact about
 * the question rather than a guess about its wording. The ladder degrades
 * honestly: a verified entity, then a picture whose class is unstated
 * (`entity`), then the round's `category`, then nothing.
 */
export type ReviewIconKind =
  | "champion"
  | "ability"
  | "item"
  | "rune"
  | "summoner_spell"
  | "entity"
  | "meta_reflex"
  | "category"
  | "generic";

const REVIEW_ICON_KINDS: readonly string[] = [
  "champion", "ability", "item", "rune", "summoner_spell",
  "entity", "meta_reflex", "category", "generic",
];

export interface ReviewIconHint {
  kind: ReviewIconKind;
  /** The entity's name, or the category string. `null` when nothing is named. */
  key: string | null;
  /**
   * A repo-relative asset path the backend verified on disk before freezing
   * it. Non-null therefore means the file exists — but it still has to be
   * resolved against the API base before it is an `src`.
   */
  icon: string | null;
}

export interface ReviewQuestion {
  prompt: string;
  options: string[];
  /** `null` while the round is not `revealed` — see `ReviewRound.revealed`. */
  correctOptionIndex: number | null;
  /**
   * The candidate's own STRUCTURED review material — formula id, rounding
   * rule, worked steps, distractor derivations, scenario note. It is
   * deliberately not prose: the question pipeline has never had a single
   * explanation string, so this carries the reviewed fields verbatim and the
   * renderer decides how to print them.
   */
  explanation: Record<string, unknown> | null;
}

export interface ReviewCardSide {
  /** Reveal-only: a recognition card's label IS its answer. */
  label: string | null;
  icon: string | null;
  value: number | string | null;
}

export interface ReviewChallenge {
  challengeIndex: number;
  prompt: string | null;
  kind: string | null;
  entityKind: string | null;
  left: ReviewCardSide;
  right: ReviewCardSide;
  correctSide: "left" | "right" | null;
  viewerSide: "left" | "right" | null;
  isCorrect: boolean | null;
}

export interface ReviewSubmission {
  answerIndex: number | null;
  isCorrect: boolean | null;
  /** Meta Reflex only — a five-card block is not one answer. */
  correctCount: number | null;
  answeredCount: number | null;
  challengeCount: number | null;
}

export interface ReviewRound {
  roundNumber: number;
  kind: "quiz" | "meta_reflex";
  moduleId: string;
  category: string | null;
  canonicalQuestionRef: string | null;
  /**
   * Whether this ROUND resolved. A terminal match can still hold an abandoned
   * round, and the shared question bank means its answer must stay withheld —
   * so `revealed: false` carries prompt and options with a null correct index.
   */
  revealed: boolean;
  iconHint: ReviewIconHint;
  /**
   * RG2 — the resolved public subject, difficulty tier and proven icon, the
   * SAME block a live round carries. `iconHint` above is unchanged and stays
   * beside it: shipped clients read it there.
   *
   * `null` for a payload from a backend that predates RG2, which is what the
   * legacy bridge in `@/lib/quiz/publicCategory` exists to cover.
   */
  topic: TimelineTopic | null;
  question: ReviewQuestion | null;
  challenges: ReviewChallenge[] | null;
  viewerSubmission: ReviewSubmission;
}

export interface MatchReviewView {
  schemaVersion: string;
  serverTime: string;
  matchId: string;
  /** The round the match ENDED on. Not a score. */
  finalRoundNumber: number;
  roundCount: number;
  rounds: ReviewRound[];
}

function reviewIconHint(raw: unknown, label: string): ReviewIconHint {
  const h = rec(raw, label);
  const kind = str(h.kind, `${label}.kind`);
  if (!REVIEW_ICON_KINDS.includes(kind)) {
    throw new RankedPublicParseError(`${label}.kind is unknown: ${kind}`);
  }
  return {
    kind: kind as ReviewIconKind,
    key: nstr(h.key, `${label}.key`),
    icon: nstr(h.icon, `${label}.icon`),
  };
}

function reviewSide(raw: unknown, label: string): ReviewCardSide {
  const s = rec(raw, label);
  const value = s.value;
  return {
    label: nstr(s.label, `${label}.label`),
    icon: nstr(s.icon, `${label}.icon`),
    value:
      value === null || value === undefined
        ? null
        : typeof value === "number" || typeof value === "string"
          ? value
          : null,
  };
}

function reviewChallenge(raw: unknown, label: string): ReviewChallenge {
  const c = rec(raw, label);
  const side = (v: unknown, name: string): "left" | "right" | null => {
    const s = nstr(v, name);
    if (s === null) return null;
    if (s !== "left" && s !== "right") {
      throw new RankedPublicParseError(`${name} must be "left" or "right"`);
    }
    return s;
  };
  return {
    challengeIndex: num(c.challenge_index, `${label}.challenge_index`),
    prompt: nstr(c.prompt, `${label}.prompt`),
    kind: nstr(c.kind, `${label}.kind`),
    entityKind: nstr(c.entity_kind, `${label}.entity_kind`),
    left: reviewSide(c.left, `${label}.left`),
    right: reviewSide(c.right, `${label}.right`),
    correctSide: side(c.correct_side, `${label}.correct_side`),
    viewerSide: side(c.viewer_side, `${label}.viewer_side`),
    isCorrect: nbool(c.is_correct, `${label}.is_correct`),
  };
}

/**
 * Post-match review (`ranked_duel.match_review.v1`).
 *
 * This is the ONE reader that expects a correct answer, so the guard that
 * belongs here is the inverse of `assertNoCorrectness`: an UNREVEALED round
 * must not carry one. A backend that ever regressed the per-round gate would
 * fail loudly at the client boundary rather than quietly print the answer to
 * a question the reader can be asked again.
 */
export function readMatchReview(body: unknown): MatchReviewView {
  const env = envelope(body, "match_review", "ranked_duel.match_review.v1");
  const p = env.payload;
  if (!Array.isArray(p.rounds)) {
    throw new RankedPublicParseError("rounds must be an array");
  }
  const rounds = p.rounds.map((raw, i) => {
    const label = `rounds[${i}]`;
    const r = rec(raw, label);
    const kind = str(r.kind, `${label}.kind`);
    if (kind !== "quiz" && kind !== "meta_reflex") {
      throw new RankedPublicParseError(`${label}.kind is unknown: ${kind}`);
    }
    const revealed = bool(r.revealed, `${label}.revealed`);

    let question: ReviewQuestion | null = null;
    if (r.question !== null && r.question !== undefined) {
      const q = rec(r.question, `${label}.question`);
      const correctOptionIndex = nnum(
        q.correct_option_index, `${label}.question.correct_option_index`);
      if (!revealed && correctOptionIndex !== null) {
        throw new RankedPublicParseError(
          `${label} is not revealed but carried a correct answer`);
      }
      const explanation =
        q.explanation === null || q.explanation === undefined
          ? null
          : rec(q.explanation, `${label}.question.explanation`);
      if (!revealed && explanation !== null) {
        throw new RankedPublicParseError(
          `${label} is not revealed but carried an explanation`);
      }
      question = {
        prompt: str(q.prompt, `${label}.question.prompt`),
        options: strList(q.options, `${label}.question.options`),
        correctOptionIndex,
        explanation,
      };
    }

    let challenges: ReviewChallenge[] | null = null;
    if (Array.isArray(r.challenges)) {
      challenges = r.challenges.map((c, j) =>
        reviewChallenge(c, `${label}.challenges[${j}]`));
      if (!revealed && challenges.some((c) => c.correctSide !== null)) {
        throw new RankedPublicParseError(
          `${label} is not revealed but named a correct card`);
      }
    }

    const sub = rec(r.viewer_submission, `${label}.viewer_submission`);
    return {
      roundNumber: num(r.round_number, `${label}.round_number`),
      kind,
      moduleId: str(r.module_id, `${label}.module_id`),
      category: nstr(r.category, `${label}.category`),
      canonicalQuestionRef: nstr(
        r.canonical_question_ref, `${label}.canonical_question_ref`),
      revealed,
      iconHint: reviewIconHint(r.icon_hint, `${label}.icon_hint`),
      topic: readTimelineTopic((r as Record<string, unknown>).topic),
      question,
      challenges,
      viewerSubmission: {
        answerIndex: nnum(sub.answer_index, `${label}.viewer_submission.answer_index`),
        isCorrect: nbool(sub.is_correct, `${label}.viewer_submission.is_correct`),
        correctCount: nnum(sub.correct_count, `${label}.viewer_submission.correct_count`),
        answeredCount: nnum(sub.answered_count, `${label}.viewer_submission.answered_count`),
        challengeCount: nnum(sub.challenge_count, `${label}.viewer_submission.challenge_count`),
      },
    } satisfies ReviewRound;
  });

  return {
    schemaVersion: env.schemaVersion,
    serverTime: env.serverTime,
    matchId: str(p.match_id, "match_id"),
    finalRoundNumber: num(p.final_round_number, "final_round_number"),
    roundCount: num(p.round_count, "round_count"),
    rounds,
  };
}
