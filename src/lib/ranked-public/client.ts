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
  readMatchResult,
  readPrivatePlayer,
  readPublicRound,
  readQueueStatus,
  readResolvedEnvelope,
  readResume,
  HeartbeatView,
  MatchResultView,
  PrivatePlayerView,
  PublicRoundView,
  QueueStatusView,
  ResumeView,
} from "./contracts";

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
  "RANKED_QUESTION_POOL_UNAVAILABLE", "RANKED_CANNOT_CANCEL", "RANKED_INVALID_CLASS",
  "RANKED_RATE_LIMITED",
]);

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

// ------------------------------------------------------------- queue

export const joinQueue = (classId: string | null, signal?: AbortSignal): Promise<QueueStatusView> =>
  request("/api/ranked/queue", readQueueStatus, {
    method: "POST", body: classId ? { class_id: classId } : {}, signal,
  });

export const getQueueStatus = (signal?: AbortSignal): Promise<QueueStatusView> =>
  request("/api/ranked/queue", readQueueStatus, { signal });

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

export const submitRound = (matchId: string, roundNumber: number, answerIndex: number,
                            abilityId: string | null, signal?: AbortSignal) =>
  request(`/api/ranked/matches/${encodeURIComponent(matchId)}/rounds/${roundNumber}/submission`,
    raw, { method: "POST", body: { round_number: roundNumber, answer: answerIndex, ability_id: abilityId }, signal });

export const chooseLevelTwo = (matchId: string, abilityId: string, signal?: AbortSignal) =>
  request(`/api/ranked/matches/${encodeURIComponent(matchId)}/progression/level-two-choice`,
    raw, { method: "POST", body: { ability_id: abilityId }, signal });

export const sendPresence = (matchId: string, signal?: AbortSignal): Promise<HeartbeatView> =>
  request(`/api/ranked/matches/${encodeURIComponent(matchId)}/presence`, readHeartbeat,
    { method: "POST", signal });

export const getMatchResult = (matchId: string, signal?: AbortSignal): Promise<MatchResultView> =>
  request(`/api/ranked/matches/${encodeURIComponent(matchId)}/result`, readMatchResult, { signal });
