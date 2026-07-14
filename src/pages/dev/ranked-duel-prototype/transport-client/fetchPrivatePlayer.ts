// ---------------------------------------------------------------------------
// Minimal read-only HTTP client for the backend private owning-player
// endpoint (backend commit befa025):
//
//   GET /api/ranked-duels/{match_id}/rounds/current/private/{player_id}
//
// BOUNDARY: returns a strictly VALIDATED private envelope, with explicit
// owner validation (the envelope's owner must be the requested player id).
// Adaptation (adaptPrivatePlayer) happens at the call site. Private data is
// owner-scoped inspection state only — it is never dispatched into
// duelMachine, and this client never calculates answers, abilities, charges,
// carryover, progression, timer, HP, XP, or level values. The backend
// sanitizes player-not-found responses (no player enumeration) and the
// frontend preserves that: unknown players surface only the backend's own
// sanitized message. No retries, polling, caching, or fixture fallback.
// ---------------------------------------------------------------------------

import { PrivatePlayerEnvelope } from "../transport-adapter/rankedDuelEnvelopeTypes";
import {
  EnvelopeValidationError,
  validatePrivatePlayerEnvelope,
} from "../transport-adapter/rankedDuelEnvelopeValidation";

export type PrivatePlayerFetchErrorKind =
  | "invalid_request" // rejected locally before any network call
  | "match_not_found" // HTTP 404 (ranked_duel_match_not_found)
  | "player_not_found" // HTTP 404 (ranked_duel_player_not_found, sanitized)
  | "no_active_round" // HTTP 409
  | "backend_error" // HTTP 500
  | "unexpected_status"
  | "invalid_json"
  | "invalid_envelope" // includes owner-id mismatch (fails validation)
  | "network"
  | "aborted";

/** Typed, dev-facing error for this one endpoint. Never a raw stack trace. */
export class PrivatePlayerFetchError extends Error {
  readonly kind: PrivatePlayerFetchErrorKind;
  readonly status?: number;
  /** Backend `detail.error_code` when the backend supplied one. */
  readonly errorCode?: string;

  constructor(
    kind: PrivatePlayerFetchErrorKind,
    message: string,
    opts: { status?: number; errorCode?: string } = {},
  ) {
    super(message);
    this.name = "PrivatePlayerFetchError";
    this.kind = kind;
    this.status = opts.status;
    this.errorCode = opts.errorCode;
  }
}

export interface FetchPrivatePlayerOptions {
  baseUrl: string;
  matchId: string;
  /** The owning player being requested; also the expected envelope owner. */
  playerId: string;
  signal?: AbortSignal;
}

export const buildPrivatePlayerUrl = (
  baseUrl: string,
  matchId: string,
  playerId: string,
): string =>
  `${baseUrl.replace(/\/+$/, "")}/api/ranked-duels/${encodeURIComponent(
    matchId,
  )}/rounds/current/private/${encodeURIComponent(playerId)}`;

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
 * Fetch the current private owning-player state and return the strictly
 * validated raw envelope (owner verified against the requested player id).
 * Throws PrivatePlayerFetchError for every failure mode.
 */
export async function fetchPrivatePlayer({
  baseUrl,
  matchId,
  playerId,
  signal,
}: FetchPrivatePlayerOptions): Promise<PrivatePlayerEnvelope> {
  if (!baseUrl.trim()) {
    throw new PrivatePlayerFetchError("invalid_request", "base URL is required");
  }
  if (!matchId.trim()) {
    throw new PrivatePlayerFetchError("invalid_request", "match id is required");
  }
  if (!playerId.trim()) {
    throw new PrivatePlayerFetchError("invalid_request", "owning player id is required");
  }

  let res: Response;
  try {
    res = await fetch(buildPrivatePlayerUrl(baseUrl, matchId, playerId), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      throw new PrivatePlayerFetchError("aborted", "request was aborted");
    }
    throw new PrivatePlayerFetchError(
      "network",
      `could not reach the ranked-duel backend: ${(err as Error)?.message ?? "network error"}`,
    );
  }

  if (!res.ok) {
    const { errorCode, message } = await readErrorDetail(res);
    const opts = { status: res.status, errorCode };
    if (res.status === 404) {
      // Two sanitized 404s: unknown match vs unknown player. Preserve the
      // backend's non-enumerating message verbatim — never elaborate on
      // whether or which players exist.
      if (errorCode === "ranked_duel_player_not_found") {
        throw new PrivatePlayerFetchError(
          "player_not_found",
          message ?? "no such player in this match",
          opts,
        );
      }
      throw new PrivatePlayerFetchError("match_not_found", message ?? "match not found", opts);
    }
    if (res.status === 409) {
      throw new PrivatePlayerFetchError(
        "no_active_round",
        message ?? "match has no active round",
        opts,
      );
    }
    if (res.status === 500) {
      throw new PrivatePlayerFetchError(
        "backend_error",
        message ?? "backend failed to project private player state",
        opts,
      );
    }
    throw new PrivatePlayerFetchError(
      "unexpected_status",
      message ?? `unexpected HTTP status ${res.status}`,
      opts,
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new PrivatePlayerFetchError("invalid_json", "response body was not valid JSON", {
      status: res.status,
    });
  }

  try {
    // Single source of truth: the existing strict validator, WITH explicit
    // owner validation against the requested player id.
    return validatePrivatePlayerEnvelope(body, playerId);
  } catch (err) {
    if (err instanceof EnvelopeValidationError) {
      throw new PrivatePlayerFetchError("invalid_envelope", err.message, { status: res.status });
    }
    throw err;
  }
}
