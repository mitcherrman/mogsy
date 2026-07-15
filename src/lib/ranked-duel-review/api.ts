// ---------------------------------------------------------------------------
// Frontend HTTP client for the Ranked Duel candidate-review admin API
// (backend "Add ranked candidate review admin API"). Eight endpoints under
// /api/admin/ranked-duel/questions, all X-Admin-Key protected.
//
// Every mutation is an explicit, single human action carrying the caller's
// `source_hash` (optimistic concurrency) and `reviewer`. Reads never mutate.
// Correct answers/indices are only ever read from get(); the client never
// derives, recomputes, or bulk-acts on candidates. Backend errors arrive as
// `{detail:{error_code,message}}` and are mapped to a typed error whose
// `errorCode` the UI keys on (stale vs conflict vs invalid-revision, …).
// ---------------------------------------------------------------------------

import { getAdminKey } from "@/lib/knowledge-admin/key";
import type {
  AcceptBody,
  CandidateDetail,
  CandidateListParams,
  CandidateSummary,
  DecisionResult,
  ExportResult,
  RejectBody,
  ReviewStatus,
  ReviseBody,
  ValidateReport,
} from "./types";

const API_BASE_URL =
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) || "http://127.0.0.1:8000";

export const RANKED_REVIEW_BASE = "/api/admin/ranked-duel/questions";

/** Backend error_code values (ADMIN_API_CONTRACT §6). */
export type ReviewErrorCode =
  | "candidate_not_found"
  | "invalid_request"
  | "stale_candidate"
  | "decision_conflict"
  | "invalid_revision"
  | "export_not_ready"
  | "export_validation_failed"
  | "malformed_source"
  | "malformed_review_store"
  | "storage_error"
  | "internal_error"
  | string;

export type ReviewApiErrorKind =
  | "auth" // 401/403 missing/invalid admin key
  | "not_found" // 404
  | "invalid_request" // 400
  | "stale" // 409 stale_candidate
  | "conflict" // 409 decision_conflict
  | "invalid_revision" // 422
  | "server" // 5xx (sanitized)
  | "network"
  | "aborted"
  | "unknown";

/** One typed error for the whole surface. Never carries a stack trace to UI. */
export class ReviewApiError extends Error {
  readonly kind: ReviewApiErrorKind;
  readonly status: number;
  readonly errorCode?: ReviewErrorCode;
  constructor(
    kind: ReviewApiErrorKind,
    message: string,
    opts: { status?: number; errorCode?: ReviewErrorCode } = {},
  ) {
    super(message);
    this.name = "ReviewApiError";
    this.kind = kind;
    this.status = opts.status ?? 0;
    this.errorCode = opts.errorCode;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

async function readDetail(
  res: Response,
): Promise<{ errorCode?: ReviewErrorCode; message?: string }> {
  try {
    const body: unknown = await res.json();
    const detail = isRecord(body) ? body.detail : undefined;
    if (typeof detail === "string") return { message: detail };
    if (isRecord(detail)) {
      return {
        errorCode: typeof detail.error_code === "string" ? detail.error_code : undefined,
        message: typeof detail.message === "string" ? detail.message : undefined,
      };
    }
  } catch {
    // non-JSON error body
  }
  return {};
}

function classify(status: number, errorCode?: ReviewErrorCode): ReviewApiErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 400) return "invalid_request";
  if (status === 409) return errorCode === "decision_conflict" ? "conflict" : "stale";
  if (status === 422) return "invalid_revision";
  if (status >= 500) return "server";
  return "unknown";
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const key = getAdminKey();
  if (!key) throw new ReviewApiError("auth", "Admin key not set");

  const headers: Record<string, string> = { "X-Admin-Key": key };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      throw new ReviewApiError("aborted", "Request was aborted");
    }
    throw new ReviewApiError("network", "Could not reach the backend.");
  }

  if (res.ok) return (await res.json()) as T;

  const { errorCode, message } = await readDetail(res);
  const kind = classify(res.status, errorCode);
  throw new ReviewApiError(kind, message ?? `Request failed (HTTP ${res.status})`, {
    status: res.status,
    errorCode,
  });
}

const buildQuery = (params: CandidateListParams = {}): string => {
  const qs = new URLSearchParams();
  if (params.decision) qs.set("decision", params.decision);
  if (params.family) qs.set("family", params.family);
  if (params.difficulty) qs.set("difficulty", params.difficulty);
  if (params.stale != null) qs.set("stale", String(params.stale));
  if (params.exportable != null) qs.set("exportable", String(params.exportable));
  if (params.search) qs.set("search", params.search);
  const s = qs.toString();
  return s ? `?${s}` : "";
};

export const rankedReviewApi = {
  // --- reads (never mutate) ---
  status: (signal?: AbortSignal) =>
    request<ReviewStatus>(`${RANKED_REVIEW_BASE}/status`, { signal }),

  listCandidates: (params?: CandidateListParams, signal?: AbortSignal) =>
    request<CandidateSummary[]>(`${RANKED_REVIEW_BASE}/candidates${buildQuery(params)}`, {
      signal,
    }),

  getCandidate: (candidateId: string, signal?: AbortSignal) =>
    request<CandidateDetail>(
      `${RANKED_REVIEW_BASE}/candidates/${encodeURIComponent(candidateId)}`,
      { signal },
    ),

  // --- mutations (explicit human action; source_hash concurrency) ---
  accept: (candidateId: string, body: AcceptBody) =>
    request<DecisionResult>(
      `${RANKED_REVIEW_BASE}/candidates/${encodeURIComponent(candidateId)}/accept`,
      { method: "POST", body },
    ),

  reject: (candidateId: string, body: RejectBody) =>
    request<DecisionResult>(
      `${RANKED_REVIEW_BASE}/candidates/${encodeURIComponent(candidateId)}/reject`,
      { method: "POST", body },
    ),

  revise: (candidateId: string, body: ReviseBody) =>
    request<DecisionResult>(
      `${RANKED_REVIEW_BASE}/candidates/${encodeURIComponent(candidateId)}/revise`,
      { method: "POST", body },
    ),

  // --- diagnostics + explicit export ---
  validate: () => request<ValidateReport>(`${RANKED_REVIEW_BASE}/validate`, { method: "POST" }),

  export: () => request<ExportResult>(`${RANKED_REVIEW_BASE}/export`, { method: "POST" }),
};

/** Safe, user-facing text for any client error (no stacks, no internals). */
export function describeReviewError(err: unknown): string {
  if (err instanceof ReviewApiError) {
    switch (err.kind) {
      case "auth":
        return err.message || "Admin key missing or invalid.";
      case "not_found":
        return "That candidate no longer exists.";
      case "stale":
        return "This candidate changed since you loaded it. Reload it before deciding.";
      case "conflict":
        return "This candidate already has a decision. Enable overwrite to replace it.";
      case "invalid_revision":
        return err.message || "The revision was rejected by validation.";
      case "invalid_request":
        return err.message || "The request was incomplete.";
      case "server":
        return err.message || "The backend reported an internal error.";
      case "network":
        return "Could not reach the backend (is it running?).";
      case "aborted":
        return "Request cancelled.";
      default:
        return err.message || "Something went wrong.";
    }
  }
  return "Something went wrong.";
}

export const isAuthError = (e: unknown): e is ReviewApiError =>
  e instanceof ReviewApiError && e.kind === "auth";
export const isStaleError = (e: unknown): e is ReviewApiError =>
  e instanceof ReviewApiError && e.kind === "stale";
export const isConflictError = (e: unknown): e is ReviewApiError =>
  e instanceof ReviewApiError && e.kind === "conflict";
