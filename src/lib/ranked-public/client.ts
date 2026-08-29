/**
 * Typed public Ranked API client (F1.5).
 *
 * Identity is the Supabase bearer JWT only (getBackendAuthHeaders). The
 * client sends NO admin key, NO participant token, and NO user/match/opponent
 * id in a request body; ownership is derived server-side from the verified
 * `sub`. Every call supports an AbortSignal, surfaces typed errors, and never
 * falls back to fixture data or computes combat locally. Request discipline
 * mirrors the Time Trial client.
 */

import { getBackendAuthHeaders } from "@/lib/backend-auth";
import {
  readHeartbeat,
  readMatchHistory,
  readMatchReview,
  readMatchResult,
  readPrivatePlayer,
  readPublicRound,
  readQueueStatus,
  readRankedProgression,
  readRankedRole,
  readResolvedEnvelope,
  readResume,
  HeartbeatView,
  MatchHistoryView,
  MatchReviewView,
  MatchResultView,
  PrivatePlayerView,
  PublicRoundView,
  QueueStatusView,
  RankedProgressionView,
  RankedRoleView,
  ResumeView,
} from "./contracts";
import type { RankedRole } from "./roles";

export const RANKED_API_BASE =
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) ?? "http://127.0.0.1:8000";

export type RankedApiErrorKind =
  | "invalid_request"
  | "backend"
  | "invalid_response"
  | "network"
  | "aborted";

const KNOWN_CODES: ReadonlySet<string> = new Set([
  "FEATURE_DISABLED", "AUTH_REQUIRED", "ACCOUNT_REQUIRED",
  "RANKED_NOT_A_PARTICIPANT", "RANKED_MATCH_COMPLETE", "RANKED_PROGRESSION_REQUIRED",
  "RANKED_NO_ACTIVE_ROUND", "RANKED_STALE_ROUND", "RANKED_INVALID_ANSWER",
  "RANKED_INVALID_ABILITY", "RANKED_ABILITY_NO_CHARGES", "RANKED_PROGRESSION_NOT_REQUIRED",
  "RANKED_INVALID_PROGRESSION_CHOICE", "RANKED_ROUND_NOT_RESOLVED", "RANKED_MATCH_NOT_COMPLETE",
  "RANKED_INTEGRITY_ERROR",
  "RANKED_QUEUE_DISABLED", "RANKED_QUEUE_NOT_ELIGIBLE", "RANKED_ACTIVE_MATCH_EXISTS",
  "RANKED_ALREADY_QUEUED",
  "RANKED_QUESTION_POOL_UNAVAILABLE", "RANKED_CANNOT_CANCEL", "RANKED_INVALID_CLASS",
  "RANKED_RATE_LIMITED",
  // R1 League-role identity.
  "RANKED_ROLE_REQUIRED", "RANKED_INVALID_ROLE",
  "RANKED_BOT_DISABLED",
  // multi-challenge segments (Phase B)
  "RANKED_NO_ACTIVE_SEGMENT", "RANKED_WRONG_SEGMENT_PHASE",
  "RANKED_WRONG_CHALLENGE_INDEX", "RANKED_SEGMENT_COMPLETE",
  "RANKED_ABILITY_NOT_AVAILABLE_IN_MODULE", "RANKED_INVALID_CHOICE",
  "RANKED_INVALID_CHALLENGE_INDEX", "RANKED_MODULE_DATA_UNAVAILABLE",
]);

/** Server-authoritative acknowledgement of a segment action. */
export interface SegmentAbilityAck {
  status: string;
  segmentNumber: number;
  abilityId: string | null;
  confirmed: boolean;
  idempotent: boolean;
}

export interface SegmentChallengeAck {
  status: string;
  segmentNumber: number;
  challengeIndex: number;
  idempotent: boolean;
  conflicting: boolean;
  segmentResolved: boolean;
  /** The SERVER's next index. The client never increments its own. */
  nextChallengeIndex: number;
}

/** A 429 throttle is transient — back off and retry, never fatal. */
export const isRateLimited = (e: unknown): boolean =>
  e instanceof RankedApiError && (e.status === 429 || e.code === "RANKED_RATE_LIMITED");

export class RankedApiError extends Error {
  kind: RankedApiErrorKind;
  status: number;
  code: string | null;
  constructor(kind: RankedApiErrorKind, status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "RankedApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export const isAborted = (e: unknown): boolean =>
  e instanceof RankedApiError ? e.kind === "aborted" : (e as { name?: string })?.name === "AbortError";

/**
 * The server answered, but this client could not READ what it said.
 *
 * Deterministic by nature — the same payload will fail the same way on every
 * poll — which is why callers must surface it instead of folding it into the
 * ordinary transient-failure backoff.
 */
export const isContractError = (e: unknown): boolean =>
  e instanceof RankedApiError && e.kind === "invalid_response";

export const isFatal = (e: unknown): boolean =>
  e instanceof RankedApiError &&
  (e.code === "RANKED_NOT_A_PARTICIPANT" || e.code === "AUTH_REQUIRED" ||
    e.code === "ACCOUNT_REQUIRED" || e.status === 404);

async function toApiError(response: Response): Promise<RankedApiError> {
  let detail: unknown = null;
  try {
    detail = (await response.json())?.detail ?? null;
  } catch {
    detail = null;
  }
  let code: string | null = null;
  let message = `request failed (${response.status})`;
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    if (typeof d.code === "string") code = d.code;
    if (typeof d.message === "string") message = d.message;
  }
  return new RankedApiError("backend", response.status,
    code && KNOWN_CODES.has(code) ? message : message, code);
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, parse: (json: unknown) => T,
                          { method = "GET", body, signal }: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { ...(await getBackendAuthHeaders()) };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(`${RANKED_API_BASE}${path}`, {
      method, headers, signal,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") {
      throw new RankedApiError("aborted", 0, "request aborted");
    }
    throw new RankedApiError("network", 0, "could not reach the ranked service");
  }
  if (!response.ok) throw await toApiError(response);
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new RankedApiError("invalid_response", response.status, "malformed response body");
  }
  try {
    return parse(json);
  } catch (e) {
    throw new RankedApiError("invalid_response", response.status,
      e instanceof Error ? e.message : "response failed validation");
  }
}

const raw = (json: unknown) => json as Record<string, unknown>;

// ------------------------------------------------ League role identity (R1)

/**
 * The caller's own Ranked League role, or the unselected state (`role: null`).
 *
 * Identity is the bearer JWT; no user id is ever sent. A backend that predates
 * R1 answers 404/405 — callers treat that as "role identity not available"
 * and fall back to the legacy path rather than blocking the player.
 */
export const getRankedRole = (signal?: AbortSignal): Promise<RankedRoleView> =>
  request("/api/ranked/role", readRankedRole, { signal });

/**
 * Set/change the caller's Ranked League role. The backend is the authority on
 * when this is legal — it rejects with `RANKED_ACTIVE_MATCH_EXISTS` or
 * `RANKED_ALREADY_QUEUED` while the account is mid-flight, and this client
 * deliberately does not re-derive "busy" itself.
 */
export const setRankedRole = (role: RankedRole, signal?: AbortSignal): Promise<RankedRoleView> =>
  request("/api/ranked/role", readRankedRole, {
    method: "PUT", body: { role }, signal,
  });

// --------------------------------------- Ranked tier progression (RE1 3B)

/**
 * The caller's own Ranked rating and its derived five-tier standing.
 *
 * Self-scoped: identity is the bearer JWT and no opponent's rating is ever
 * returned. A backend that predates RE1 Phase 3B answers 404/405 — callers
 * treat that as "no Ranked progression to show" and render nothing, rather
 * than blocking the queue.
 */
export const getRankedProgression = (signal?: AbortSignal): Promise<RankedProgressionView> =>
  request("/api/ranked/progression", readRankedProgression, { signal });

// ------------------------------------------------------------- queue

/**
 * Join the matchmaking queue.
 *
 * `classId` is the LEGACY combat class and is optional: passing `null` uses
 * the backend's own compatibility default. R1 sends null from the normal
 * player path — the client never picks a class on the player's behalf and,
 * above all, never derives one from the player's role. The role the entry
 * carries is read server-side from the account's stored preference, so it
 * cannot be spoofed or accidentally set by a queue request.
 *
 * `matchWithBot` is the ADMIN TESTING path and the only thing that changes
 * the shape of the answer: the backend verifies admin authorization from the
 * caller's own verified session, creates an unrated Ranked match against a
 * bot, and replies with a `matched` status carrying its id — so the ordinary
 * matched -> handoff path runs unchanged and there is no bot-specific state
 * anywhere in the controller. A non-admin sending it is REFUSED
 * (`RANKED_BOT_NOT_AUTHORIZED`), never silently queued: authorization lives
 * on the server and this flag is a request, not a grant.
 *
 * The field is omitted entirely when false, so an ordinary join sends exactly
 * the body it always sent.
 */
export const joinQueue = (
  classId: string | null,
  signal?: AbortSignal,
  options?: { matchWithBot?: boolean },
): Promise<QueueStatusView> =>
  request("/api/ranked/queue", readQueueStatus, {
    method: "POST",
    body: {
      ...(classId ? { class_id: classId } : {}),
      ...(options?.matchWithBot ? { match_with_bot: true } : {}),
    },
    signal,
  });

export const getQueueStatus = (signal?: AbortSignal): Promise<QueueStatusView> =>
  request("/api/ranked/queue", readQueueStatus, { signal });

/** The caller's own active match, or null. Account-bound reconnect discovery so
 * a full page reload can recover an active match — including a bot match, which
 * is never in the queue and so cannot be recovered from queue status. */
export interface ActiveMatchInfo {
  matchId: string;
  isBotMatch: boolean;
  /**
   * RG1 — the instant this match stops being reconnectable, and whether it
   * still is.
   *
   * Ranked does not resume hours-old matches. An unexplained absence gets a
   * short reconnect window (45s, `RECONNECT_WINDOW_SECONDS` on the backend);
   * past it the match is forfeited by the ordinary lifecycle and the account
   * is free to queue again. The endpoint SETTLES an expired match before
   * answering, so in practice a match returned here is one that can genuinely
   * be rejoined — the flag is read rather than assumed, because "the server
   * still lists it" and "you may still play it" stopped being the same
   * question when the window was introduced.
   *
   * Absent on an older backend, which is read as reconnectable: that
   * deployment has no window, so every active match is one.
   */
  reconnectDeadline: string | null;
  withinReconnectWindow: boolean;
}

export const getActiveMatch = (signal?: AbortSignal): Promise<ActiveMatchInfo | null> =>
  request("/api/ranked/active-match", (json) => {
    const am = (json as Record<string, unknown>).active_match;
    if (am == null || typeof am !== "object") return null;
    const m = am as Record<string, unknown>;
    if (typeof m.match_id !== "string") return null;
    return {
      matchId: m.match_id,
      isBotMatch: m.is_bot_match === true,
      reconnectDeadline: typeof m.reconnect_deadline === "string"
        ? m.reconnect_deadline : null,
      withinReconnectWindow: m.within_reconnect_window !== false,
    };
  }, { signal });

/**
 * RG1 — concede the match, deliberately.
 *
 * The ONLY intent signal Ranked accepts. A closed tab, a reload, a route
 * change and a dropped connection are indistinguishable at the server and are
 * all treated as an absence with a reconnect window; this is how a player says
 * the thing the transport cannot. The body is empty by design — identity comes
 * from the token and the match from the path, so there is no field with which
 * to forfeit anyone else or to claim any outcome.
 *
 * Idempotent: a match that is already terminal answers 200 with
 * `forfeited: false`.
 */
export interface ForfeitResult {
  matchId: string;
  forfeited: boolean;
  alreadyComplete: boolean;
}

export const forfeitMatch = (matchId: string, signal?: AbortSignal): Promise<ForfeitResult> =>
  request(`/api/ranked/matches/${encodeURIComponent(matchId)}/forfeit`, (json) => {
    const m = (json ?? {}) as Record<string, unknown>;
    return {
      matchId: typeof m.match_id === "string" ? m.match_id : matchId,
      forfeited: m.forfeited === true,
      alreadyComplete: m.already_complete === true,
    };
  }, { method: "POST", signal });

/*
 * THERE IS NO `createBotMatch`. `POST /api/ranked/bot-matches` — the
 * standalone Ranked Bot product's endpoint, open to every verified account and
 * carrying a difficulty and a bot class — is retired on the backend and its
 * client is gone with it.
 *
 * A bot match is now an ADMIN TESTING request on the ordinary join:
 * `joinQueue(null, signal, { matchWithBot: true })`. That keeps one creation
 * path, one transport, and one place where authorization is decided (the
 * server, from the verified session).
 */

export const cancelQueue = (signal?: AbortSignal): Promise<QueueStatusView> =>
  request("/api/ranked/queue", readQueueStatus, { method: "DELETE", signal });

// ------------------------------------------------------------- match

export const resumeMatch = (matchId: string, signal?: AbortSignal): Promise<ResumeView> =>
  request(`/api/ranked/matches/${encodeURIComponent(matchId)}/resume`, readResume,
    { method: "POST", signal });

export const getPublicRound = (matchId: string, signal?: AbortSignal): Promise<PublicRoundView> =>
  request(`/api/ranked/matches/${encodeURIComponent(matchId)}`, readPublicRound, { signal });

export const getPrivatePlayer = (matchId: string, signal?: AbortSignal): Promise<PrivatePlayerView> =>
  request(`/api/ranked/matches/${encodeURIComponent(matchId)}/private`, readPrivatePlayer, { signal });

export const getResolvedRound = (matchId: string, round: number, signal?: AbortSignal) =>
  request(`/api/ranked/matches/${encodeURIComponent(matchId)}/rounds/${round}/resolved`,
    readResolvedEnvelope, { signal });

/**
 * Lock the answer. R3: the body carries the answer and nothing else — the
 * ability is drafted separately and never travels with the answer, so one click
 * on an option is the entire submission.
 */
export const submitRound = (matchId: string, roundNumber: number, answerIndex: number,
                            signal?: AbortSignal) =>
  request(`/api/ranked/matches/${encodeURIComponent(matchId)}/rounds/${roundNumber}/submission`,
    raw, { method: "POST", body: { round_number: roundNumber, answer: answerIndex }, signal });

/**
 * Arm, change, or clear the quiz round's ability. `null` is the explicit No
 * Ability choice — and the default, so it never has to be sent at all.
 *
 * Non-blocking: callable before or after the answer, as often as the player
 * likes, for as long as the round stays open. There is no confirm step; the
 * round's close is what freezes the choice.
 */
export const setRoundAbility = (matchId: string, roundNumber: number,
                                abilityId: string | null, signal?: AbortSignal) =>
  request(`/api/ranked/matches/${encodeURIComponent(matchId)}/rounds/${roundNumber}/ability`,
    raw, { method: "POST", body: { ability_id: abilityId }, signal });

// ------------------------------------------ multi-challenge segments

const segmentBase = (matchId: string, segmentNumber: number) =>
  `/api/ranked/matches/${encodeURIComponent(matchId)}/segments/${segmentNumber}`;

const readAbilityAck = (json: unknown): SegmentAbilityAck => {
  const o = json as Record<string, unknown>;
  return {
    status: typeof o.status === "string" ? o.status : "draft",
    segmentNumber: Number(o.segment_number),
    abilityId: typeof o.ability_id === "string" ? o.ability_id : null,
    confirmed: o.confirmed === true,
    idempotent: o.idempotent === true,
  };
};

const readChallengeAck = (json: unknown): SegmentChallengeAck => {
  const o = json as Record<string, unknown>;
  if (typeof o.next_challenge_index !== "number") {
    throw new Error("missing next_challenge_index");
  }
  return {
    status: typeof o.status === "string" ? o.status : "accepted",
    segmentNumber: Number(o.segment_number),
    challengeIndex: Number(o.challenge_index),
    idempotent: o.idempotent === true,
    conflicting: o.conflicting === true,
    segmentResolved: o.segment_resolved === true,
    nextChallengeIndex: o.next_challenge_index,
  };
};

/** Draft the segment ability. `null` is the explicit No Ability choice. */
export const draftSegmentAbility = (
  matchId: string, segmentNumber: number, abilityId: string | null,
  signal?: AbortSignal,
): Promise<SegmentAbilityAck> =>
  request(`${segmentBase(matchId, segmentNumber)}/ability`, readAbilityAck,
    { method: "POST", body: { ability_id: abilityId }, signal });

/** Lock the current draft. Safe to retry: the backend is idempotent. */
export const confirmSegmentAbility = (
  matchId: string, segmentNumber: number, abilityId: string | null,
  signal?: AbortSignal,
): Promise<SegmentAbilityAck> =>
  request(`${segmentBase(matchId, segmentNumber)}/ability/confirm`, readAbilityAck,
    { method: "POST", body: { ability_id: abilityId }, signal });

/**
 * What a segment answer may name, per card contract.
 *
 * A union rather than two optional fields, because the backend accepts EXACTLY
 * one of `item_id` / `card_id` and rejects a body carrying both. Modelling it
 * this way is what makes "never send `item_id` for a v4 card" a compile-time
 * property instead of a convention: a caller holding a card id cannot produce
 * the other branch.
 */
export type SegmentChoice =
  | { itemId: string }
  | { cardId: string }
  /** `mastery_slice.v1` (Phase 4F): the Mastery step's chosen answer. */
  | { selected: string | number | boolean };

/**
 * Submit one challenge. The body carries the chosen card/item token and nothing
 * else — no timing, no correctness, no index (the index is in the path and must
 * equal the server's expected index).
 *
 * `card_id` is `item_cost_duel.v4`'s positional token (`c2:left`); `item_id` is
 * the v1–v3 item name. The server refuses a body with both, and refuses an
 * `item_id` on a v4 segment outright rather than guessing what it meant.
 */
export const submitSegmentChallenge = (
  matchId: string, segmentNumber: number, challengeIndex: number,
  choice: SegmentChoice, signal?: AbortSignal,
): Promise<SegmentChallengeAck> =>
  request(
    `${segmentBase(matchId, segmentNumber)}/challenges/${challengeIndex}`,
    readChallengeAck, {
      method: "POST",
      body: "cardId" in choice ? { card_id: choice.cardId }
        : "selected" in choice ? { selected: choice.selected }
        : { item_id: choice.itemId },
      signal,
    });

export const chooseLevelTwo = (matchId: string, abilityId: string, signal?: AbortSignal) =>
  request(`/api/ranked/matches/${encodeURIComponent(matchId)}/progression/level-two-choice`,
    raw, { method: "POST", body: { ability_id: abilityId }, signal });

export const sendPresence = (matchId: string, signal?: AbortSignal): Promise<HeartbeatView> =>
  request(`/api/ranked/matches/${encodeURIComponent(matchId)}/presence`, readHeartbeat,
    { method: "POST", signal });

export const getMatchResult = (matchId: string, signal?: AbortSignal): Promise<MatchResultView> =>
  request(`/api/ranked/matches/${encodeURIComponent(matchId)}/result`, readMatchResult, { signal });

/** The caller's own completed matches, newest first (limit clamped server-side). */
export const getMatchHistory = (limit?: number, signal?: AbortSignal): Promise<MatchHistoryView> =>
  request(`/api/ranked/history${limit ? `?limit=${limit}` : ""}`, readMatchHistory, { signal });

/**
 * MALT B1 — the caller's post-match review of ONE finished match.
 *
 * Terminal-only and membership-gated on the server: 403 for a match the caller
 * did not play, 409 while it is still running. Correct answers are present
 * because the match is over, and a round that never resolved still withholds
 * its own — which is why this is a separate call rather than a widening of
 * `/history` or of the answer-free `/question-library`.
 */
export const getMatchReview = (matchId: string, signal?: AbortSignal): Promise<MatchReviewView> =>
  request(`/api/ranked/matches/${encodeURIComponent(matchId)}/review`,
    readMatchReview, { signal });
