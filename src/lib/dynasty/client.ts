/**
 * ROG1-D1 — the Worlds Dynasty run transport for `/api/admin/dynasty`
 * (ROG1-C1, League_Combat_Simulator PR #36).
 *
 *     POST /runs                      {start_key}                              create or resume
 *     GET  /runs/{run_id}                                                      resume (verified replay)
 *     POST /runs/{run_id}/actions     {expected_seq, action_id, kind, payload}
 *
 * A TRANSPORT INTERFACE first and an HTTP implementation second, so the page
 * can be driven by recorded backend responses (`fixtureTransport.ts`) in tests
 * and the DEV preview. Every HTTP call carries the owner's admin headers
 * (`buildAdminHeaders`); the backend's `DYNASTY_ENABLED` + `require_admin` are
 * the authorization boundary. The client sends ids and choices only: never a
 * seed, a modifier, a roll or an outcome.
 */
import { ADMIN_API_BASE_URL, buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";
import { DynastyContractError, readDynastySnapshot, type DynastyActionKind, type DynastySnapshot } from "./contracts";

export const DYNASTY_API = "/api/admin/dynasty";

export interface DynastyActionRequest {
  expected_seq: number;
  action_id: string;
  kind: DynastyActionKind;
  payload: Record<string, unknown>;
}

export interface DynastyTransport {
  /** Create the owner's run for `startKey`, or resume it. Idempotent. */
  start(startKey: string, signal?: AbortSignal): Promise<DynastySnapshot>;
  read(runId: string, signal?: AbortSignal): Promise<DynastySnapshot>;
  act(runId: string, action: DynastyActionRequest, signal?: AbortSignal): Promise<DynastySnapshot>;
}

/**
 * What went wrong, in the terms the page acts on.
 *
 *  - `network`: no answer at all. Safe to retry the SAME request: actions are
 *    idempotent on `action_id`.
 *  - `backend`: the server answered with an error; `code` is its
 *    `detail.code` (e.g. `STALE_SEQ`, `NOT_OFFERED`, `DYNASTY_DISABLED`).
 *  - `invalid_response`: an answer this client refuses to render.
 */
export class DynastyApiError extends Error {
  constructor(
    readonly kind: "network" | "backend" | "invalid_response" | "aborted",
    readonly status: number | null,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "DynastyApiError";
  }
}

type Fetch = typeof fetch;

/** `{detail: {code, message}}` from the Dynasty routes; a list from FastAPI's own body validation. */
export function readErrorBody(status: number, body: unknown): { code: string | null; message: string } {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const d = detail as { code?: unknown; message?: unknown };
    return {
      code: typeof d.code === "string" ? d.code : null,
      message: typeof d.message === "string" ? d.message : `Backend returned ${status}.`,
    };
  }
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: unknown } | undefined;
    return { code: "BAD_REQUEST", message: typeof first?.msg === "string" ? first.msg : "The request was malformed." };
  }
  if (typeof detail === "string") return { code: null, message: detail };
  return { code: null, message: `Backend returned ${status}.` };
}

export function httpDynastyTransport(fetchImpl: Fetch = (input, init) => fetch(input, init)): DynastyTransport {
  async function request(path: string, init: RequestInit, signal?: AbortSignal): Promise<DynastySnapshot> {
    const url = `${ADMIN_API_BASE_URL}${DYNASTY_API}${path}`;
    let res: Response;
    try {
      res = await fetchImpl(url, {
        ...init,
        signal,
        headers: { ...(await buildAdminHeaders(url)), ...(init.body ? { "Content-Type": "application/json" } : {}) },
      });
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") throw new DynastyApiError("aborted", null, null, "Aborted.");
      throw new DynastyApiError("network", null, null, "Could not reach the Dynasty backend.");
    }
    let body: unknown = null;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok) {
      const { code, message } = readErrorBody(res.status, body);
      throw new DynastyApiError("backend", res.status, code, message);
    }
    try {
      return readDynastySnapshot(body);
    } catch (e) {
      const why = e instanceof DynastyContractError ? e.message : "unreadable response";
      throw new DynastyApiError("invalid_response", res.status, null, why);
    }
  }
  return {
    start: (startKey, signal) =>
      request("/runs", { method: "POST", body: JSON.stringify({ start_key: startKey }) }, signal),
    read: (runId, signal) => request(`/runs/${encodeURIComponent(runId)}`, { method: "GET" }, signal),
    act: (runId, action, signal) =>
      request(`/runs/${encodeURIComponent(runId)}/actions`, { method: "POST", body: JSON.stringify(action) }, signal),
  };
}

/** An id matching the backend's `[A-Za-z0-9_.:-]{8,80}`. Not secret, not a seed: an idempotency key. */
export function newClientId(prefix: string): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${rand}`.slice(0, 80);
}
