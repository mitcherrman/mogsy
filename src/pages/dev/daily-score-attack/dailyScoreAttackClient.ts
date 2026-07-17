/**
 * Typed API client for Daily Score Attack (backend commit c771e736).
 *
 * Identity comes exclusively from the Supabase bearer token
 * (ensureBackendAuthToken establishes an anonymous session for guests).
 * The client never sends user ids, timestamps, elapsed time, correctness,
 * score, or combo — the answer body is {sequence, selected_index} only.
 * Submit failures are surfaced as typed errors; there is NO local fallback
 * result (unlike the legacy Daily flow).
 */

import { ensureBackendAuthToken, getBackendAuthHeaders } from "@/lib/backend-auth";
import {
  readHistory,
  readResolution,
  readResults,
  readRun,
  readToday,
  DsaParseError,
} from "./dailyScoreAttackAdapters";
import {
  DsaErrorCode,
  DsaHistory,
  DsaResolution,
  DsaResults,
  DsaRun,
  DsaToday,
} from "./dailyScoreAttackTypes";

export const DSA_API_BASE =
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) ?? "http://127.0.0.1:8000";

export class DsaApiError extends Error {
  code: DsaErrorCode;
  status: number;
  /** Terminal run projection attached to RUN_EXPIRED responses. */
  run: DsaRun | null;

  constructor(code: DsaErrorCode, status: number, message: string, run: DsaRun | null = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.run = run;
  }
}

const KNOWN_CODES: ReadonlySet<string> = new Set([
  "FEATURE_DISABLED", "AUTH_REQUIRED", "ACCOUNT_REQUIRED", "CHALLENGE_UNAVAILABLE",
  "CHALLENGE_CORRUPT", "NO_RUN", "RUN_NOT_FOUND", "OFFICIAL_REQUIRED_FIRST",
  "OFFICIAL_RUN_ACTIVE", "OFFICIAL_RUN_TERMINAL", "RUN_EXPIRED", "RUN_TERMINAL",
  "RUN_ACTIVE", "STALE_QUESTION", "INVALID_OPTION", "INTEGRITY_ERROR",
]);

async function toApiError(response: Response): Promise<DsaApiError> {
  let detail: unknown = null;
  try {
    detail = (await response.json())?.detail ?? null;
  } catch {
    detail = null;
  }
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const record = detail as Record<string, unknown>;
    const code = typeof record.code === "string" && KNOWN_CODES.has(record.code)
      ? (record.code as DsaErrorCode)
      : "MALFORMED_RESPONSE";
    let run: DsaRun | null = null;
    if (record.run != null) {
      try {
        run = readRun(record.run);
      } catch {
        run = null;
      }
    }
    return new DsaApiError(code, response.status, String(record.message ?? code), run);
  }
  return new DsaApiError("MALFORMED_RESPONSE", response.status, "unexpected error shape");
}

async function request<T>(
  path: string,
  reader: (raw: unknown) => T,
  init: {
    method?: "GET" | "POST";
    requireIdentity?: boolean;
    signal?: AbortSignal;
    body?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.requireIdentity) {
    const token = await ensureBackendAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } else {
    Object.assign(headers, await getBackendAuthHeaders());
  }
  let response: Response;
  try {
    response = await fetch(`${DSA_API_BASE}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new DsaApiError("NETWORK", 0, "network request failed");
  }
  if (!response.ok) throw await toApiError(response);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new DsaApiError("MALFORMED_RESPONSE", response.status, "response was not JSON");
  }
  try {
    return reader(payload);
  } catch (error) {
    if (error instanceof DsaParseError) {
      throw new DsaApiError("MALFORMED_RESPONSE", response.status, error.message);
    }
    throw error;
  }
}

export function fetchToday(signal?: AbortSignal): Promise<DsaToday> {
  return request("/api/daily-score-attack/today", readToday, { signal });
}

export function startOfficialRun(signal?: AbortSignal): Promise<DsaRun> {
  return request("/api/daily-score-attack/runs", readRun, {
    method: "POST", requireIdentity: true, signal,
  });
}

export function startPracticeRun(signal?: AbortSignal): Promise<DsaRun> {
  return request("/api/daily-score-attack/practice-runs", readRun, {
    method: "POST", requireIdentity: true, signal,
  });
}

export function fetchCurrentRun(official: boolean, signal?: AbortSignal): Promise<DsaRun> {
  return request(
    `/api/daily-score-attack/runs/current?official=${official ? "true" : "false"}`,
    readRun,
    { requireIdentity: true, signal },
  );
}

export function submitAnswer(
  runId: string,
  sequence: number,
  selectedIndex: number,
  signal?: AbortSignal,
): Promise<DsaResolution> {
  return request(
    `/api/daily-score-attack/runs/${encodeURIComponent(runId)}/answers`,
    readResolution,
    {
      method: "POST",
      requireIdentity: true,
      signal,
      body: { sequence, selected_index: selectedIndex },
    },
  );
}

export function finalizeRun(runId: string, signal?: AbortSignal): Promise<DsaRun> {
  return request(
    `/api/daily-score-attack/runs/${encodeURIComponent(runId)}/finalize`,
    readRun,
    { method: "POST", requireIdentity: true, signal },
  );
}

export function fetchResults(runId: string, signal?: AbortSignal): Promise<DsaResults> {
  return request(
    `/api/daily-score-attack/runs/${encodeURIComponent(runId)}/results`,
    readResults,
    { requireIdentity: true, signal },
  );
}

export function fetchHistory(signal?: AbortSignal): Promise<DsaHistory> {
  return request("/api/daily-score-attack/history", readHistory, {
    requireIdentity: true, signal,
  });
}
