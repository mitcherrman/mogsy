// ---------------------------------------------------------------------------
// Read-only admin client for the question preview.
//
// Extracted from the retired Ranked Duel Review client (`lib/ranked-duel-review/
// api.ts`) when that admin surface was removed. Only the READ path survived —
// the accept/reject/revise/export/validate mutations went with the workflow
// they belonged to.
//
// Read-only here is STRUCTURAL, not a convention: `request()` takes no `method`
// option and hard-codes GET, so this module cannot issue a mutation even if a
// future caller asks it to. That is strictly stronger than the guard test which
// used to assert the absence of `method: "POST"` in the preview subtree, and it
// is why the preview can be hosted inside Quiz Review without re-opening a
// second way to act on a candidate.
//
// The backend path is unchanged (`/api/admin/ranked-duel/questions/...`): the
// Ranked candidate corpus and its review service are a still-valid independent
// domain that Quiz Review's "All sources" view already reads. Only the admin UI
// in front of it was retired.
// ---------------------------------------------------------------------------

import { buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";

const API_BASE_URL =
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) || "http://127.0.0.1:8000";

/** The Ranked candidate admin API this preview reads from. */
export const QUESTION_PREVIEW_BASE = "/api/admin/ranked-duel/questions";

/**
 * The player-facing projection of one candidate question.
 *
 * Deliberately carries NO correct answer or index: a preview payload that knew
 * the answer would be one refactor away from leaking it to a player surface.
 * The reveal state takes the answer from the admin row the caller already
 * holds.
 */
export interface QuestionPreviewView {
  question_id: string;
  prompt: string;
  options: string[];
  category: string | null;
  /** Question-safe premise metadata (Quiz/Broadcast `metadata` shape). */
  presentation?: Record<string, unknown> | null;
  /** Canonical answer-option media, POSITIONAL: entry i describes option i. */
  option_media?: Array<{
    type: string;
    name: string;
    icon: string;
    id?: string | number;
  }> | null;
  /** Backend module identity ("quiz" for the candidate bank). */
  module_id?: string;
  derived_status?: string;
}

export type PreviewApiErrorKind =
  | "auth"          // 401/403 missing/invalid admin credential
  | "not_found"     // 404
  | "invalid_request" // 400
  | "server"        // 5xx (sanitized)
  | "network"
  | "aborted"
  | "unknown";

/** One typed error for the whole surface. Never carries a stack trace to UI. */
export class PreviewApiError extends Error {
  readonly kind: PreviewApiErrorKind;
  readonly status: number;
  readonly errorCode?: string;
  constructor(
    kind: PreviewApiErrorKind,
    message: string,
    opts: { status?: number; errorCode?: string } = {},
  ) {
    super(message);
    this.name = "PreviewApiError";
    this.kind = kind;
    this.status = opts.status ?? 0;
    this.errorCode = opts.errorCode;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

async function readDetail(
  res: Response,
): Promise<{ errorCode?: string; message?: string }> {
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

function classify(status: number): PreviewApiErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 400) return "invalid_request";
  if (status >= 500) return "server";
  return "unknown";
}

/**
 * One GET. No `method` parameter exists, and no body is ever sent — the only
 * request this module can express is a read.
 */
async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  // Account-bound: bearer from the current Supabase session by default; the
  // fallback admin key is attached only when explicitly active.
  const headers: Record<string, string> = await buildAdminHeaders(url);

  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers, signal });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      throw new PreviewApiError("aborted", "Request was aborted");
    }
    throw new PreviewApiError("network", "Could not reach the backend.");
  }

  if (res.ok) return (await res.json()) as T;

  const { errorCode, message } = await readDetail(res);
  throw new PreviewApiError(
    classify(res.status),
    message ?? `Request failed (HTTP ${res.status})`,
    { status: res.status, errorCode },
  );
}

export const questionPreviewApi = {
  /** The player-facing projection of one Ranked candidate. A read, always. */
  rankedCandidateView: (candidateId: string, signal?: AbortSignal) =>
    getJson<QuestionPreviewView>(
      `${QUESTION_PREVIEW_BASE}/candidates/${encodeURIComponent(candidateId)}/public-view`,
      signal,
    ),
};

/** Safe, user-facing text for any client error (no stacks, no internals). */
export function describePreviewError(err: unknown): string {
  if (err instanceof PreviewApiError) {
    switch (err.kind) {
      case "auth":
        return err.message || "Admin authorization missing or invalid.";
      case "not_found":
        return "That question no longer exists.";
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
