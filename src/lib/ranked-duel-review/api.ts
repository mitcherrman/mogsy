// ---------------------------------------------------------------------------
// Frontend API client for the Ranked Duel candidate-review workflow.
//
// BOUNDARY STATUS: the backend HTTP endpoints these methods call DO NOT EXIST
// YET. The committed backend logic (`ranked_candidate_review/`) is CLI-only.
// This client is the frontend half of the contract in CONTRACT.md, written so
// the workspace can integrate the moment Claude 1 / Claude 3 ship the routes.
//
// It does NOT fabricate success and it NEVER writes review state or the
// accepted-bank file from the browser: every mutation is a backend command,
// and the export is a backend-owned file write. When the endpoints are absent
// the client surfaces `RankedDuelReviewUnavailableError` (HTTP 404 / 501) so
// the UI can show an honest "not available yet" state instead of fake data.
//
// Auth mirrors the quiz admin surface exactly: the shared session admin key
// (KNOWLEDGE_ADMIN_KEY) sent as X-Admin-Key. Same secret, same store.
// ---------------------------------------------------------------------------

import { getAdminKey } from "@/lib/knowledge-admin/key";
import type {
  RankedDuelReviewListParams,
  RankedDuelReviewListResponse,
  RankedDuelReviewProgress,
} from "./types";

const API_BASE_URL =
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) || "http://127.0.0.1:8000";

/** Base path for every ranked-duel review endpoint (see CONTRACT.md). */
export const RANKED_REVIEW_BASE = "/api/admin/ranked-duel/review";

/** Admin key missing locally or rejected by the backend (401/403). */
export class RankedDuelReviewAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RankedDuelReviewAuthError";
  }
}

/**
 * The endpoint is not implemented on the backend yet (404 / 501). Distinct
 * from a network error: it means "this workflow's API has not shipped," which
 * the UI renders as a documented boundary state, never as an empty result.
 */
export class RankedDuelReviewUnavailableError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RankedDuelReviewUnavailableError";
    this.status = status;
  }
}

/** A stale write was rejected by the backend concurrency check (409). */
export class RankedDuelReviewConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RankedDuelReviewConflictError";
  }
}

/** Any other non-OK backend response. Never exposes raw internals to the UI. */
export class RankedDuelReviewError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RankedDuelReviewError";
    this.status = status;
  }
}

async function readDetail(res: Response): Promise<string> {
  try {
    const body: unknown = await res.clone().json();
    const detail = (body as { detail?: unknown })?.detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      const msg = (detail as { message?: unknown }).message;
      if (typeof msg === "string") return msg;
    }
  } catch {
    // fall through to text
  }
  try {
    return await res.text();
  } catch {
    return res.statusText;
  }
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const key = getAdminKey();
  if (!key) throw new RankedDuelReviewAuthError("Admin key not set");

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": key,
        ...(init?.headers || {}),
      },
    });
  } catch {
    // Network-level failure — cannot reach the backend at all.
    throw new RankedDuelReviewError(0, "Could not reach the backend.");
  }

  if (res.ok) return (await res.json()) as T;

  const detail = await readDetail(res);
  if (res.status === 401 || res.status === 403) {
    throw new RankedDuelReviewAuthError(detail || "Invalid or missing admin key");
  }
  if (res.status === 404 || res.status === 501) {
    throw new RankedDuelReviewUnavailableError(
      res.status,
      detail || "Ranked Duel review endpoints are not available on this backend yet.",
    );
  }
  if (res.status === 409) {
    throw new RankedDuelReviewConflictError(
      detail || "This candidate changed since you loaded it. Reload and try again.",
    );
  }
  throw new RankedDuelReviewError(res.status, detail || `Request failed (HTTP ${res.status})`);
}

const buildQuery = (params: RankedDuelReviewListParams = {}): string => {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.scope) qs.set("scope", params.scope);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const s = qs.toString();
  return s ? `?${s}` : "";
};

/**
 * READ-ONLY runtime client. Deliberately narrow: only GET probes exist, so the
 * shipped frontend is INCAPABLE of writing a review decision or triggering the
 * export while the backend API is still absent. The write endpoints
 * (decide / export) are specified in CONTRACT.md and will be added here — with
 * their request/response types already modelled in ./types — once the backend
 * ships them. Until then there is no runtime path that can mutate review state.
 */
export const rankedDuelReviewApi = {
  /** GET candidates joined with their derived review status. */
  list: (params?: RankedDuelReviewListParams) =>
    adminRequest<RankedDuelReviewListResponse>(
      `${RANKED_REVIEW_BASE}/candidates${buildQuery(params)}`,
    ),

  /** GET aggregate progress counts per derived status. */
  progress: () =>
    adminRequest<RankedDuelReviewProgress>(`${RANKED_REVIEW_BASE}/progress`),
};

export const isRankedReviewUnavailable = (
  err: unknown,
): err is RankedDuelReviewUnavailableError =>
  err instanceof RankedDuelReviewUnavailableError;

export const isRankedReviewAuthError = (
  err: unknown,
): err is RankedDuelReviewAuthError => err instanceof RankedDuelReviewAuthError;
