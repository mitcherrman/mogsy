// ---------------------------------------------------------------------------
// Minimal read-only HTTP client for the backend public current-round
// endpoint (backend commit befa025):
//
//   GET /api/ranked-duels/{match_id}/rounds/current/public
//
// BOUNDARY: returns a strictly VALIDATED public envelope and nothing more.
// Player-id mapping and adaptation (adaptPublicRound) happen at the call
// site. The public projection is read-only shared state — it is NEVER routed
// through APPLY_BACKEND_SETTLEMENT (that action is reserved for resolved
// settlements), and this client never calculates timer, HP, XP, level,
// winner, or phase values. No retries, polling, caching, or fixture
// fallback. Dev-prototype local; not a production transport client.
// ---------------------------------------------------------------------------

import { PublicRoundEnvelope } from "../transport-adapter/rankedDuelEnvelopeTypes";
import {
  EnvelopeValidationError,
  validatePublicRoundEnvelope,
} from "../transport-adapter/rankedDuelEnvelopeValidation";

export type PublicRoundFetchErrorKind =
  | "invalid_request" // rejected locally before any network call
  | "match_not_found" // HTTP 404
  | "no_active_round" // HTTP 409 (no active round; includes completed matches)
  | "backend_error" // HTTP 500
  | "unexpected_status"
  | "invalid_json"
  | "invalid_envelope"
  | "network"
  | "aborted";

/** Typed, dev-facing error for this one endpoint. Never a raw stack trace. */
export class PublicRoundFetchError extends Error {
  readonly kind: PublicRoundFetchErrorKind;
  readonly status?: number;
  /** Backend `detail.error_code` when the backend supplied one. */
  readonly errorCode?: string;

  constructor(
    kind: PublicRoundFetchErrorKind,
    message: string,
    opts: { status?: number; errorCode?: string } = {},
  ) {
    super(message);
    this.name = "PublicRoundFetchError";
    this.kind = kind;
    this.status = opts.status;
    this.errorCode = opts.errorCode;
  }
}

export interface FetchPublicRoundOptions {
  baseUrl: string;
  matchId: string;
  signal?: AbortSignal;
}

export const buildPublicRoundUrl = (baseUrl: string, matchId: string): string =>
  `${baseUrl.replace(/\/+$/, "")}/api/ranked-duels/${encodeURIComponent(
    matchId,
  )}/rounds/current/public`;

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
 * Fetch the current public round and return the strictly validated raw
 * envelope. Throws PublicRoundFetchError for every failure mode.
 */
export async function fetchPublicRound({
  baseUrl,
  matchId,
  signal,
}: FetchPublicRoundOptions): Promise<PublicRoundEnvelope> {
  if (!baseUrl.trim()) {
    throw new PublicRoundFetchError("invalid_request", "base URL is required");
  }
  if (!matchId.trim()) {
    throw new PublicRoundFetchError("invalid_request", "match id is required");
  }

  let res: Response;
  try {
    res = await fetch(buildPublicRoundUrl(baseUrl, matchId), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      throw new PublicRoundFetchError("aborted", "request was aborted");
    }
    throw new PublicRoundFetchError(
      "network",
      `could not reach the ranked-duel backend: ${(err as Error)?.message ?? "network error"}`,
    );
  }

  if (!res.ok) {
    const { errorCode, message } = await readErrorDetail(res);
    const opts = { status: res.status, errorCode };
    if (res.status === 404) {
      throw new PublicRoundFetchError("match_not_found", message ?? "match not found", opts);
    }
    if (res.status === 409) {
      throw new PublicRoundFetchError(
        "no_active_round",
        message ?? "match has no active round",
        opts,
      );
    }
    if (res.status === 500) {
      throw new PublicRoundFetchError(
        "backend_error",
        message ?? "backend failed to project the public round",
        opts,
      );
    }
    throw new PublicRoundFetchError(
      "unexpected_status",
      message ?? `unexpected HTTP status ${res.status}`,
      opts,
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new PublicRoundFetchError("invalid_json", "response body was not valid JSON", {
      status: res.status,
    });
  }

  try {
    // Single source of envelope truth — the existing strict validator (which
    // also structurally rejects any hidden/private field).
    return validatePublicRoundEnvelope(body);
  } catch (err) {
    if (err instanceof EnvelopeValidationError) {
      throw new PublicRoundFetchError("invalid_envelope", err.message, { status: res.status });
    }
    throw err;
  }
}
