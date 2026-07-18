// ---------------------------------------------------------------------------
// Minimal read-only HTTP client for the backend resolved-round endpoint
// (backend commit 8e0809a):
//
//   GET /api/ranked-duels/{match_id}/rounds/{round_number}/resolved
//
// BOUNDARY: this function returns a strictly VALIDATED resolved envelope and
// nothing more. Player-id mapping, adaptation (adaptResolvedRoundEnvelope ->
// adaptBackendSettlement), and reducer dispatch all happen at the call site —
// the client never decides p1/p2 identity and never touches combat or timer
// values. No retries, no polling, no caching, no fallback to fixtures.
//
// Dev-prototype local; not a production transport client.
// ---------------------------------------------------------------------------

import { ResolvedRoundEnvelope } from "@/lib/ranked-core/transport/rankedDuelEnvelopeTypes";
import {
  EnvelopeValidationError,
  validateResolvedRoundEnvelope,
} from "@/lib/ranked-core/transport/rankedDuelEnvelopeValidation";

/** Same env convention as the repo's other backend clients. */
export const DEFAULT_RANKED_DUEL_API_BASE =
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) ||
  "http://127.0.0.1:8000";

export type ResolvedRoundFetchErrorKind =
  | "invalid_request" // rejected locally before any network call
  | "match_or_round_not_found" // HTTP 404
  | "round_not_resolved" // HTTP 409
  | "backend_error" // HTTP 500
  | "unexpected_status" // any other non-2xx
  | "invalid_json" // 200 but unparseable body
  | "invalid_envelope" // 200 but fails the strict envelope validator
  | "network" // fetch rejected (unreachable, DNS, CORS...)
  | "aborted"; // caller's AbortSignal fired

/** Typed, dev-facing error for this one endpoint. Never a raw stack trace. */
export class ResolvedRoundFetchError extends Error {
  readonly kind: ResolvedRoundFetchErrorKind;
  readonly status?: number;
  /** Backend `detail.error_code` when the backend supplied one. */
  readonly errorCode?: string;

  constructor(
    kind: ResolvedRoundFetchErrorKind,
    message: string,
    opts: { status?: number; errorCode?: string } = {},
  ) {
    super(message);
    this.name = "ResolvedRoundFetchError";
    this.kind = kind;
    this.status = opts.status;
    this.errorCode = opts.errorCode;
  }
}

export interface FetchResolvedRoundOptions {
  baseUrl: string;
  matchId: string;
  roundNumber: number;
  signal?: AbortSignal;
}

export const buildResolvedRoundUrl = (
  baseUrl: string,
  matchId: string,
  roundNumber: number,
): string =>
  `${baseUrl.replace(/\/+$/, "")}/api/ranked-duels/${encodeURIComponent(
    matchId,
  )}/rounds/${roundNumber}/resolved`;

/** Extract the backend's {detail: {error_code, message}} body when present. */
const readErrorDetail = async (
  res: Response,
): Promise<{ errorCode?: string; message?: string }> => {
  try {
    const body: unknown = await res.json();
    const detail = (body as { detail?: unknown })?.detail;
    if (typeof detail === "object" && detail !== null) {
      const d = detail as { error_code?: unknown; message?: unknown };
      return {
        errorCode: typeof d.error_code === "string" ? d.error_code : undefined,
        message: typeof d.message === "string" ? d.message : undefined,
      };
    }
  } catch {
    // Non-JSON error body — fall through to a status-only error.
  }
  return {};
};

/**
 * Fetch one resolved round and return the strictly validated raw envelope.
 * Throws ResolvedRoundFetchError for every failure mode; never retries and
 * never falls back to fixture data.
 */
export async function fetchResolvedRound({
  baseUrl,
  matchId,
  roundNumber,
  signal,
}: FetchResolvedRoundOptions): Promise<ResolvedRoundEnvelope> {
  if (!baseUrl.trim()) {
    throw new ResolvedRoundFetchError("invalid_request", "base URL is required");
  }
  if (!matchId.trim()) {
    throw new ResolvedRoundFetchError("invalid_request", "match id is required");
  }
  if (!Number.isInteger(roundNumber) || roundNumber < 1) {
    throw new ResolvedRoundFetchError(
      "invalid_request",
      `round number must be a positive integer (got ${roundNumber})`,
    );
  }

  let res: Response;
  try {
    res = await fetch(buildResolvedRoundUrl(baseUrl, matchId, roundNumber), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      throw new ResolvedRoundFetchError("aborted", "request was aborted");
    }
    throw new ResolvedRoundFetchError(
      "network",
      `could not reach the ranked-duel backend: ${(err as Error)?.message ?? "network error"}`,
    );
  }

  if (!res.ok) {
    const { errorCode, message } = await readErrorDetail(res);
    const opts = { status: res.status, errorCode };
    if (res.status === 404) {
      throw new ResolvedRoundFetchError(
        "match_or_round_not_found",
        message ?? "match or round not found",
        opts,
      );
    }
    if (res.status === 409) {
      throw new ResolvedRoundFetchError(
        "round_not_resolved",
        message ?? "round has not resolved yet",
        opts,
      );
    }
    if (res.status === 500) {
      throw new ResolvedRoundFetchError(
        "backend_error",
        message ?? "backend failed to project the resolved round",
        opts,
      );
    }
    throw new ResolvedRoundFetchError(
      "unexpected_status",
      message ?? `unexpected HTTP status ${res.status}`,
      opts,
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ResolvedRoundFetchError("invalid_json", "response body was not valid JSON", {
      status: res.status,
    });
  }

  try {
    // Single source of envelope truth — the existing strict validator.
    return validateResolvedRoundEnvelope(body);
  } catch (err) {
    if (err instanceof EnvelopeValidationError) {
      throw new ResolvedRoundFetchError("invalid_envelope", err.message, {
        status: res.status,
      });
    }
    throw err;
  }
}
