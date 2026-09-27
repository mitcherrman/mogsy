/**
 * DCMOD-E — the Daily RUN transport (DCMOD-B's `/api/daily-run`).
 *
 * A TRANSPORT INTERFACE first, and an HTTP implementation of it second, so the
 * whole presentation can be driven by fixtures (`fixtures.ts`) while B is
 * unmerged, and bound to the real API at integration without touching a
 * component. Identity is the bearer token alone — the same guest-first rule
 * as the DC2 client: the client sends no user id, no date and no result.
 *
 * USERS2.3C-Daily — the two entity-creating POSTs (start, launch) carry the
 * canonical browser correlation (`@/lib/analytics/correlation`): observability
 * ids the server freezes on the run and on the stage's child match, never an
 * identity. `sync` carries none (see `syncRun`). The GETs send no body and
 * never touch correlation or auth minting.
 */
import { ensureBackendAuthToken, getBackendAuthHeaders } from "@/lib/backend-auth";
import { withBrowserCorrelation } from "@/lib/analytics/correlation";
import { DailyRun, DailyRunParseError, readDailyRun, readDailyToday } from "./contracts";

export interface DailyRunTransport {
  /** Today's run for this caller, or null. Never writes. */
  readToday(signal?: AbortSignal): Promise<DailyRun | null>;
  /**
   * Create today's run, or return the existing one. Idempotent. Each call is
   * one player-initiated interaction; only the call that CREATES the run has
   * its correlation frozen server-side.
   */
  startToday(signal?: AbortSignal): Promise<DailyRun>;
  readRun(runId: string, signal?: AbortSignal): Promise<DailyRun>;
  /**
   * Create (or return) the current stage's child match. Idempotent per stage.
   * `interactionId` is the ONE logical launch's id, reused by the caller on
   * every automatic retry; omitted, a fresh id is minted for this call.
   */
  launchStage(runId: string, stageIndex: number, signal?: AbortSignal,
              interactionId?: string): Promise<DailyRun>;
  /**
   * Pull the active child's result and advance the run at most once. Carries
   * no correlation: it is a server-authoritative pull retried automatically,
   * creates no entity, and the run and stage it advances are already
   * correlated by `startToday` and `launchStage`.
   */
  syncRun(runId: string, signal?: AbortSignal): Promise<DailyRun>;
}

export type DailyRunErrorCode =
  | "SESSION_REQUIRED" | "ACCOUNT_REQUIRED" | "DAILY_RUN_NOT_FOUND" | "DAILY_RUN_CONFLICT"
  | "DAILY_RUN_CHILD_UNAVAILABLE" | "DAILY_RUN_INTEGRITY" | "DAILY_RUN_NOT_WIRED";

const KNOWN: ReadonlySet<string> = new Set<DailyRunErrorCode>([
  "SESSION_REQUIRED", "ACCOUNT_REQUIRED", "DAILY_RUN_NOT_FOUND", "DAILY_RUN_CONFLICT",
  "DAILY_RUN_CHILD_UNAVAILABLE", "DAILY_RUN_INTEGRITY", "DAILY_RUN_NOT_WIRED",
]);

export class DailyRunApiError extends Error {
  constructor(
    public kind: "backend" | "invalid_response" | "network" | "aborted",
    public status: number,
    message: string,
    public code: DailyRunErrorCode | null = null,
  ) {
    super(message);
    this.name = "DailyRunApiError";
  }
}

export const isDailyRunAborted = (e: unknown): boolean =>
  e instanceof DailyRunApiError ? e.kind === "aborted" : (e as { name?: string })?.name === "AbortError";

export const DAILY_RUN_API_BASE =
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) ?? "http://127.0.0.1:8000";

const BASE_PATH = "/api/daily-run";

async function request<T>(path: string, parse: (json: unknown) => T,
                          method: "GET" | "POST", signal?: AbortSignal,
                          body?: Record<string, unknown>): Promise<T> {
  // USERS1 — a GET is a read and must never create an identity. `readToday`
  // runs on the Leaguecraft hub for every visitor, so minting here was one of
  // the page-load paths that filled auth.users. A POST is the person starting
  // or advancing a run, which is a genuine write boundary.
  if (method === "POST") await ensureBackendAuthToken();
  const headers: Record<string, string> = { ...(await getBackendAuthHeaders()) };
  const init: RequestInit = { method, headers, signal };
  if (method === "POST" && body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  let response: Response;
  try {
    response = await fetch(`${DAILY_RUN_API_BASE}${path}`, init);
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") {
      throw new DailyRunApiError("aborted", 0, "request aborted");
    }
    throw new DailyRunApiError("network", 0, "could not reach the Daily Challenge service");
  }
  if (!response.ok) {
    let code: DailyRunErrorCode | null = null;
    let message = `request failed (${response.status})`;
    try {
      const detail = (await response.json())?.detail;
      if (detail && typeof detail === "object") {
        if (typeof detail.code === "string" && KNOWN.has(detail.code)) code = detail.code;
        if (typeof detail.message === "string") message = detail.message;
      }
    } catch { /* keep the status line */ }
    throw new DailyRunApiError("backend", response.status, message, code);
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new DailyRunApiError("invalid_response", response.status, "malformed response body");
  }
  try {
    return parse(json);
  } catch (e) {
    throw new DailyRunApiError("invalid_response", response.status,
      e instanceof DailyRunParseError ? e.message : "response failed validation");
  }
}

const enc = encodeURIComponent;

export const httpDailyRunTransport: DailyRunTransport = {
  readToday: (signal) => request(`${BASE_PATH}/today`, readDailyToday, "GET", signal),
  startToday: (signal) => request(`${BASE_PATH}/today`, readDailyRun, "POST", signal,
    withBrowserCorrelation({})),
  readRun: (runId, signal) => request(`${BASE_PATH}/${enc(runId)}`, readDailyRun, "GET", signal),
  launchStage: (runId, stageIndex, signal, interactionId) => request(
    `${BASE_PATH}/${enc(runId)}/stages/${stageIndex}/launch`, readDailyRun, "POST", signal,
    withBrowserCorrelation({}, interactionId)),
  syncRun: (runId, signal) => request(`${BASE_PATH}/${enc(runId)}/sync`, readDailyRun, "POST", signal),
};
