/**
 * Typed Daily Challenge v2 API client (DC1 Phase 5, backend `1e3146e`).
 *
 * Identity is the Supabase bearer token and nothing else. The client sends no
 * user id, no challenge date, no run ownership claim, no correctness, no score
 * and no elapsed time — the answer body is `{selected_index}` and run creation
 * has no body at all. Ownership and the day are both decided server-side from
 * the verified `sub` and the server's clock.
 *
 * GUEST-FIRST, DELIBERATELY
 * ─────────────────────────
 * The Daily is not behind a signup wall: a Supabase ANONYMOUS session owns an
 * official run exactly as an account does. So the write paths call
 * `ensureBackendAuthToken()`, which mints an anonymous session if the visitor
 * has none, rather than surfacing a login prompt. What the backend refuses is
 * the tokenless fallback, where every guest would share one identity — so a
 * request that genuinely could not establish a session fails loudly here
 * rather than silently starting somebody else's run.
 *
 * The claim endpoint is NOT wired in this phase. It needs the PRIOR anonymous
 * session's access token, which is gone by the time Supabase has swapped the
 * session for the new account's — capturing it safely is an auth-flow change,
 * not a Daily Challenge change. See the phase notes.
 */

import { ensureBackendAuthToken, getBackendAuthHeaders } from "@/lib/backend-auth";
import {
  DcAnswerAck,
  DcHistory,
  DcParseError,
  DcRun,
  DcToday,
  readAnswer,
  readHistory,
  readRun,
  readToday,
} from "./contracts";

export const DAILY_CHALLENGE_API_BASE =
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) ?? "http://127.0.0.1:8000";

const BASE_PATH = "/api/daily-challenge";

/**
 * Every stable code this surface can answer with, from the backend's own
 * `_ERROR_STATUS` table. Listed so an unknown code is visibly unknown rather
 * than quietly handled as if it were understood.
 */
export type DcErrorCode =
  | "SESSION_REQUIRED"
  | "NO_DAILY_AVAILABLE"
  | "RUN_NOT_FOUND"
  | "RUN_COMPLETE"
  | "CARD_NOT_CURRENT"
  | "META_REFLEX_NOT_ACTIVATED"
  | "OPTION_ELIMINATED"
  | "ALREADY_RESOLVED"
  | "INVALID_OPTION"
  | "RUN_INTEGRITY"
  | "REWARD_INTEGRITY"
  | "DAILY_UNAVAILABLE"
  | "RATE_LIMITED"
  | "CLAIM_INVALID_PROOF"
  | "CLAIM_NOT_ELIGIBLE"
  | "CLAIM_CONFLICT";

const KNOWN_CODES: ReadonlySet<string> = new Set<DcErrorCode>([
  "SESSION_REQUIRED", "NO_DAILY_AVAILABLE", "RUN_NOT_FOUND", "RUN_COMPLETE",
  "CARD_NOT_CURRENT", "META_REFLEX_NOT_ACTIVATED", "OPTION_ELIMINATED",
  "ALREADY_RESOLVED", "INVALID_OPTION", "RUN_INTEGRITY", "REWARD_INTEGRITY",
  "DAILY_UNAVAILABLE", "RATE_LIMITED", "CLAIM_INVALID_PROOF",
  "CLAIM_NOT_ELIGIBLE", "CLAIM_CONFLICT",
]);

export type DcApiErrorKind = "backend" | "invalid_response" | "network" | "aborted";

export class DcApiError extends Error {
  kind: DcApiErrorKind;
  status: number;
  code: DcErrorCode | null;

  constructor(kind: DcApiErrorKind, status: number, message: string,
              code: DcErrorCode | null = null) {
    super(message);
    this.name = "DcApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export const isDcAborted = (e: unknown): boolean =>
  e instanceof DcApiError ? e.kind === "aborted"
    : (e as { name?: string })?.name === "AbortError";

/** A 429 is transient — back off and retry, never fatal. */
export const isDcRateLimited = (e: unknown): boolean =>
  e instanceof DcApiError && (e.status === 429 || e.code === "RATE_LIMITED");

/**
 * The server answered and this client could not READ it. Deterministic: the
 * same payload fails the same way every time, so it must be surfaced rather
 * than folded into the transient-failure backoff.
 */
export const isDcContractError = (e: unknown): boolean =>
  e instanceof DcApiError && e.kind === "invalid_response";

async function toApiError(response: Response): Promise<DcApiError> {
  let detail: unknown = null;
  try {
    detail = (await response.json())?.detail ?? null;
  } catch {
    detail = null;
  }
  let code: DcErrorCode | null = null;
  let message = `request failed (${response.status})`;
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    if (typeof d.code === "string" && KNOWN_CODES.has(d.code)) code = d.code as DcErrorCode;
    if (typeof d.message === "string") message = d.message;
  }
  return new DcApiError("backend", response.status, message, code);
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** Guarantee a session (minting an anonymous one) before sending. */
  requireSession?: boolean;
}

async function request<T>(
  path: string,
  parse: (json: unknown) => T,
  { method = "GET", body, signal, requireSession = false }: RequestOpts = {},
): Promise<T> {
  if (requireSession) {
    // Mints an anonymous Supabase session for a first-time visitor. Single-
    // flighted inside backend-auth, so several Daily calls racing at start-up
    // cannot mint several throwaway guests for one person.
    await ensureBackendAuthToken();
  }
  const headers: Record<string, string> = { ...(await getBackendAuthHeaders()) };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${DAILY_CHALLENGE_API_BASE}${path}`, {
      method, headers, signal,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") {
      throw new DcApiError("aborted", 0, "request aborted");
    }
    throw new DcApiError("network", 0, "could not reach the Daily Challenge service");
  }

  if (!response.ok) throw await toApiError(response);

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new DcApiError("invalid_response", response.status, "malformed response body");
  }
  try {
    return parse(json);
  } catch (e) {
    throw new DcApiError("invalid_response", response.status,
      e instanceof DcParseError ? e.message : "response failed validation");
  }
}

/** Today's Daily, its shape, and this caller's run on it if one exists. */
export function fetchToday(signal?: AbortSignal): Promise<DcToday> {
  return request(`${BASE_PATH}/today`, readToday, { signal, requireSession: true });
}

/**
 * Start today's official run, or return the one already in progress.
 *
 * Idempotent at the DATABASE — `ux_dc2_official` is a partial unique index over
 * (user, date) — so a double click, a retry after a dropped connection and a
 * second tab all receive the same run. The client adds no request id because
 * there is nothing a second request could create.
 */
export function startRun(signal?: AbortSignal): Promise<DcRun> {
  return request(`${BASE_PATH}/runs`, readRun,
    { method: "POST", signal, requireSession: true });
}

/** THE refresh call. Heals an expired Meta Reflex window before projecting. */
export function fetchRun(runId: string, signal?: AbortSignal): Promise<DcRun> {
  return request(`${BASE_PATH}/runs/${encodeURIComponent(runId)}`, readRun,
    { signal, requireSession: true });
}

/**
 * Open the current Meta Reflex card's six-second scored window.
 *
 * THE only thing in the system that can start a clock. Never called
 * speculatively: a GET must not commit the player to six seconds, so the
 * controller calls this after the ready surface is rendered and the player has
 * asked for the card.
 */
export function activateCard(runId: string, sequence: number,
                             signal?: AbortSignal): Promise<DcRun> {
  return request(
    `${BASE_PATH}/runs/${encodeURIComponent(runId)}/cards/${sequence}/activate`,
    readRun, { method: "POST", signal, requireSession: true });
}

/** Submit one answer. The whole body is the option index. */
export function submitAnswer(runId: string, sequence: number, selectedIndex: number,
                             signal?: AbortSignal): Promise<DcAnswerAck> {
  return request(
    `${BASE_PATH}/runs/${encodeURIComponent(runId)}/cards/${sequence}/answers`,
    readAnswer,
    { method: "POST", body: { selected_index: selectedIndex }, signal, requireSession: true });
}

/** The caller's own past Dailies, newest first. */
export function fetchHistory(limit = 30, signal?: AbortSignal): Promise<DcHistory> {
  return request(`${BASE_PATH}/history?limit=${encodeURIComponent(String(limit))}`,
    readHistory, { signal, requireSession: true });
}
