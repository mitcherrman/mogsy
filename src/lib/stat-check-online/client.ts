/**
 * Typed Stat Check multiplayer API client.
 *
 * Identity is the Supabase bearer JWT only (getBackendAuthHeaders). The
 * client sends NO user id in any body; ownership derives server-side from
 * the verified `sub`. Every payload passes the fail-closed contract readers
 * before reaching application code. Request discipline mirrors the Ranked
 * public client.
 */

import { getBackendAuthHeaders } from "@/lib/backend-auth";
import {
  readActiveRoom,
  readMatchPrivate,
  readMatchPublic,
  readMatchResult,
  readResolvedRound,
  readResume,
  readRoomCreated,
  readRoomJoined,
  readRoomView,
  type ActiveRoomView,
  type MatchPrivateView,
  type MatchPublicView,
  type MatchResultView,
  type ResolvedRoundView,
  type ResumeView,
  type RoomCreated,
  type RoomJoined,
  type RoomView,
} from "./contracts";

export const STAT_CHECK_API_BASE =
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) ?? "http://127.0.0.1:8000";

export type StatCheckApiErrorKind = "invalid_request" | "backend" | "invalid_response" | "network" | "aborted";

export class StatCheckApiError extends Error {
  kind: StatCheckApiErrorKind;
  status: number;
  code: string | null;
  constructor(kind: StatCheckApiErrorKind, status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "StatCheckApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export const isAborted = (error: unknown): boolean =>
  error instanceof StatCheckApiError
    ? error.kind === "aborted"
    : (error as { name?: string })?.name === "AbortError";

/** Errors that must stop polling instead of retrying. */
export const isFatal = (error: unknown): boolean =>
  error instanceof StatCheckApiError &&
  (error.code === "SC_NOT_A_PARTICIPANT" ||
    error.code === "AUTH_REQUIRED" ||
    error.code === "ACCOUNT_REQUIRED" ||
    error.code === "FEATURE_DISABLED" ||
    error.status === 404);

async function request<T>(
  path: string,
  reader: (raw: unknown) => T,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(await getBackendAuthHeaders()),
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(`${STAT_CHECK_API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (isAborted(error)) throw new StatCheckApiError("aborted", 0, "aborted");
    throw new StatCheckApiError("network", 0, "network error");
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail = (payload as { detail?: { code?: string; message?: string } } | null)?.detail;
    throw new StatCheckApiError(
      "backend",
      response.status,
      detail?.message ?? `HTTP ${response.status}`,
      detail?.code ?? null,
    );
  }
  try {
    return reader(payload);
  } catch (error) {
    throw new StatCheckApiError("invalid_response", response.status, (error as Error).message);
  }
}

export const statCheckOnlineApi = {
  createRoom: (signal?: AbortSignal): Promise<RoomCreated> =>
    request("/api/stat-check/rooms", readRoomCreated, { method: "POST", signal }),
  joinRoom: (inviteCode: string, signal?: AbortSignal): Promise<RoomJoined> =>
    request("/api/stat-check/rooms/join", readRoomJoined, {
      method: "POST",
      body: { invite_code: inviteCode },
      signal,
    }),
  getRoom: (roomId: string, signal?: AbortSignal): Promise<RoomView> =>
    request(`/api/stat-check/rooms/${encodeURIComponent(roomId)}`, readRoomView, { signal }),
  setReady: (roomId: string, ready: boolean, signal?: AbortSignal): Promise<RoomView> =>
    request(`/api/stat-check/rooms/${encodeURIComponent(roomId)}/ready`, readRoomView, {
      method: "POST",
      body: { ready },
      signal,
    }),
  cancelRoom: (roomId: string, signal?: AbortSignal): Promise<unknown> =>
    request(`/api/stat-check/rooms/${encodeURIComponent(roomId)}`, (raw) => raw, {
      method: "DELETE",
      signal,
    }),
  getActiveRoom: (signal?: AbortSignal): Promise<ActiveRoomView> =>
    request("/api/stat-check/active-room", readActiveRoom, { signal }),

  submitItemChoice: (matchId: string, itemId: string, signal?: AbortSignal): Promise<unknown> =>
    request(`/api/stat-check/matches/${encodeURIComponent(matchId)}/item-choice`, (raw) => raw, {
      method: "POST",
      body: { item_id: itemId },
      signal,
    }),
  submitLock: (
    matchId: string,
    roundNumber: number,
    assignments: Record<string, string>,
    equipped: { category_id: string; item_id: string } | null,
    signal?: AbortSignal,
  ): Promise<unknown> =>
    request(
      `/api/stat-check/matches/${encodeURIComponent(matchId)}/rounds/${roundNumber}/lock`,
      (raw) => raw,
      { method: "POST", body: { round_number: roundNumber, assignments, equipped }, signal },
    ),
  getMatchPublic: (matchId: string, signal?: AbortSignal): Promise<MatchPublicView> =>
    request(`/api/stat-check/matches/${encodeURIComponent(matchId)}`, readMatchPublic, { signal }),
  getMatchPrivate: (matchId: string, signal?: AbortSignal): Promise<MatchPrivateView> =>
    request(`/api/stat-check/matches/${encodeURIComponent(matchId)}/private`, readMatchPrivate, { signal }),
  getResolvedRound: (matchId: string, roundNumber: number, signal?: AbortSignal): Promise<ResolvedRoundView> =>
    request(
      `/api/stat-check/matches/${encodeURIComponent(matchId)}/rounds/${roundNumber}/resolved`,
      readResolvedRound,
      { signal },
    ),
  resumeMatch: (matchId: string, signal?: AbortSignal): Promise<ResumeView> =>
    request(`/api/stat-check/matches/${encodeURIComponent(matchId)}/resume`, readResume, {
      method: "POST",
      signal,
    }),
  getMatchResult: (matchId: string, signal?: AbortSignal): Promise<MatchResultView> =>
    request(`/api/stat-check/matches/${encodeURIComponent(matchId)}/result`, readMatchResult, { signal }),
  sendPresence: (matchId: string, signal?: AbortSignal): Promise<unknown> =>
    request(`/api/stat-check/matches/${encodeURIComponent(matchId)}/presence`, (raw) => raw, {
      method: "POST",
      signal,
    }),
  concede: (matchId: string, signal?: AbortSignal): Promise<unknown> =>
    request(`/api/stat-check/matches/${encodeURIComponent(matchId)}/concede`, (raw) => raw, {
      method: "POST",
      signal,
    }),
};

export type StatCheckOnlineApi = typeof statCheckOnlineApi;
