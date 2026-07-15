// ---------------------------------------------------------------------------
// Narrow HTTP client for the playable staff ranked duel.
//
// Endpoints (exactly the ones this page needs):
//   POST /api/admin/ranked-duels                                  (X-Admin-Key)
//   GET  /api/ranked-duels/{m}/rounds/current/public              (no auth)
//   GET  /api/ranked-duels/{m}/rounds/current/private/{p}         (player token)
//   POST /api/ranked-duels/{m}/rounds/current/submission          (player token)
//   POST /api/ranked-duels/{m}/progression/level-two-choice       (player token)
//
// Credential rules enforced here, not by callers:
//   * the admin key is sent ONLY on the admin creation request;
//   * the participant token is sent ONLY on private/submission/progression;
//   * the public endpoint receives NO credentials at all;
//   * no credential is ever placed in a URL, logged, or persisted here.
//
// Backend errors arrive as {detail: {error_code, message}} (gameplay) or
// {detail: "..."} (the shared admin-key dependency). Both are normalized into
// RankedDuelApiError. No response body is logged. No retries and no fixture
// fallback — the caller owns cadence and backoff.
// ---------------------------------------------------------------------------

import {
  LevelTwoConfirmed,
  PrivatePlayerView,
  PublicRoundView,
  RankedDuelParseError,
  StaffMatchCreated,
  SubmissionAccepted,
  readLevelTwoConfirmed,
  readPrivatePlayer,
  readPublicRound,
  readStaffMatchCreated,
  readSubmissionAccepted,
} from "./rankedDuelTypes";

export const PLAYER_TOKEN_HEADER = "X-Ranked-Duel-Player-Token";
export const ADMIN_KEY_HEADER = "X-Admin-Key";

export const DEFAULT_STAFF_DUEL_API_BASE =
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) ?? "http://127.0.0.1:8000";

export type RankedDuelErrorKind =
  | "invalid_request" // rejected locally, no network call made
  | "backend" // backend responded with an error status
  | "invalid_response" // 2xx body did not match the contract
  | "network" // backend unreachable
  | "aborted";

/** Normalized transport error. Never carries a stack trace to the UI. */
export class RankedDuelApiError extends Error {
  readonly kind: RankedDuelErrorKind;
  readonly status?: number;
  /** Backend `detail.error_code`, when the backend supplied one. */
  readonly errorCode?: string;
  /** Additive detail fields (e.g. progression_pending_players on a 409). */
  readonly detail?: Record<string, unknown>;

  constructor(
    kind: RankedDuelErrorKind,
    message: string,
    opts: { status?: number; errorCode?: string; detail?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = "RankedDuelApiError";
    this.kind = kind;
    this.status = opts.status;
    this.errorCode = opts.errorCode;
    this.detail = opts.detail;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const trimBase = (baseUrl: string): string => {
  if (!baseUrl.trim()) {
    throw new RankedDuelApiError("invalid_request", "backend base URL is required");
  }
  return baseUrl.trim().replace(/\/+$/, "");
};

const requireValue = (value: string, label: string): string => {
  if (!value?.trim()) {
    throw new RankedDuelApiError("invalid_request", `${label} is required`);
  }
  return value.trim();
};

export const buildUrl = {
  createMatch: (baseUrl: string) => `${trimBase(baseUrl)}/api/admin/ranked-duels`,
  publicRound: (baseUrl: string, matchId: string) =>
    `${trimBase(baseUrl)}/api/ranked-duels/${encodeURIComponent(matchId)}/rounds/current/public`,
  privatePlayer: (baseUrl: string, matchId: string, playerId: string) =>
    `${trimBase(baseUrl)}/api/ranked-duels/${encodeURIComponent(
      matchId,
    )}/rounds/current/private/${encodeURIComponent(playerId)}`,
  submission: (baseUrl: string, matchId: string) =>
    `${trimBase(baseUrl)}/api/ranked-duels/${encodeURIComponent(
      matchId,
    )}/rounds/current/submission`,
  levelTwoChoice: (baseUrl: string, matchId: string) =>
    `${trimBase(baseUrl)}/api/ranked-duels/${encodeURIComponent(
      matchId,
    )}/progression/level-two-choice`,
};

/** Read {detail:{error_code,message}} or {detail:"..."} without logging it. */
const readErrorDetail = async (
  res: Response,
): Promise<{ errorCode?: string; message?: string; detail?: Record<string, unknown> }> => {
  try {
    const body: unknown = await res.json();
    const detail = isRecord(body) ? body.detail : undefined;
    if (typeof detail === "string") return { message: detail };
    if (isRecord(detail)) {
      return {
        errorCode: typeof detail.error_code === "string" ? detail.error_code : undefined,
        message: typeof detail.message === "string" ? detail.message : undefined,
        detail,
      };
    }
  } catch {
    // Non-JSON error body — fall back to a status-only error.
  }
  return {};
};

interface RequestOptions {
  method: "GET" | "POST";
  url: string;
  /** Participant token — applied only by participant endpoints. */
  playerToken?: string;
  /** Admin key — applied only by the admin creation endpoint. */
  adminKey?: string;
  body?: unknown;
  signal?: AbortSignal;
}

const request = async ({
  method,
  url,
  playerToken,
  adminKey,
  body,
  signal,
}: RequestOptions): Promise<unknown> => {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (playerToken) headers[PLAYER_TOKEN_HEADER] = playerToken;
  if (adminKey) headers[ADMIN_KEY_HEADER] = adminKey;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      throw new RankedDuelApiError("aborted", "request was aborted");
    }
    throw new RankedDuelApiError(
      "network",
      "could not reach the ranked-duel backend (is it running?)",
    );
  }

  if (!res.ok) {
    const { errorCode, message, detail } = await readErrorDetail(res);
    throw new RankedDuelApiError("backend", message ?? `request failed (HTTP ${res.status})`, {
      status: res.status,
      errorCode,
      detail,
    });
  }

  try {
    return await res.json();
  } catch {
    throw new RankedDuelApiError("invalid_response", "response body was not valid JSON", {
      status: res.status,
    });
  }
};

const parsed = <T>(read: () => T): T => {
  try {
    return read();
  } catch (err) {
    if (err instanceof RankedDuelParseError) {
      throw new RankedDuelApiError("invalid_response", err.message);
    }
    throw err;
  }
};

// --- staff creation (admin key only) ---------------------------------------

export interface CreateStaffMatchInput {
  baseUrl: string;
  adminKey: string;
  matchId: string;
  playerOneId: string;
  playerTwoId: string;
  playerOneClass: string;
  playerTwoClass: string;
  experimentArm: string;
  signal?: AbortSignal;
}

export async function createStaffMatch(input: CreateStaffMatchInput): Promise<StaffMatchCreated> {
  const adminKey = requireValue(input.adminKey, "admin key");
  const body = await request({
    method: "POST",
    url: buildUrl.createMatch(input.baseUrl),
    adminKey,
    body: {
      match_id: requireValue(input.matchId, "match id"),
      player_one_id: requireValue(input.playerOneId, "player one id"),
      player_two_id: requireValue(input.playerTwoId, "player two id"),
      player_one_class: input.playerOneClass,
      player_two_class: input.playerTwoClass,
      experiment_arm: input.experimentArm,
    },
    signal: input.signal,
  });
  return parsed(() => readStaffMatchCreated(body));
}

// --- participant reads / commands (participant token only) ------------------

export async function fetchPublicRoundLive(
  baseUrl: string,
  matchId: string,
  signal?: AbortSignal,
): Promise<PublicRoundView> {
  // No credentials: the public projection is deliberately unauthenticated.
  const body = await request({
    method: "GET",
    url: buildUrl.publicRound(baseUrl, requireValue(matchId, "match id")),
    signal,
  });
  return parsed(() => readPublicRound(body));
}

export async function fetchPrivatePlayerLive(
  baseUrl: string,
  matchId: string,
  playerId: string,
  playerToken: string,
  signal?: AbortSignal,
): Promise<PrivatePlayerView> {
  const id = requireValue(playerId, "player id");
  const body = await request({
    method: "GET",
    url: buildUrl.privatePlayer(baseUrl, requireValue(matchId, "match id"), id),
    playerToken: requireValue(playerToken, "participant token"),
    signal,
  });
  return parsed(() => readPrivatePlayer(body, id));
}

export interface SubmitRoundInput {
  baseUrl: string;
  matchId: string;
  playerToken: string;
  /** The backend's active round number — never a locally counted one. */
  roundNumber: number;
  answerIndex: number;
  abilityId: string | null;
  signal?: AbortSignal;
}

export async function submitRound(input: SubmitRoundInput): Promise<SubmissionAccepted> {
  const body = await request({
    method: "POST",
    url: buildUrl.submission(input.baseUrl, requireValue(input.matchId, "match id")),
    playerToken: requireValue(input.playerToken, "participant token"),
    // Field names are the backend's SubmissionIn model (extra="forbid").
    body: {
      round_number: input.roundNumber,
      answer: input.answerIndex,
      ability_id: input.abilityId,
    },
    signal: input.signal,
  });
  return parsed(() => readSubmissionAccepted(body));
}

export async function submitLevelTwoChoice(input: {
  baseUrl: string;
  matchId: string;
  playerToken: string;
  abilityId: string;
  signal?: AbortSignal;
}): Promise<LevelTwoConfirmed> {
  const body = await request({
    method: "POST",
    url: buildUrl.levelTwoChoice(input.baseUrl, requireValue(input.matchId, "match id")),
    playerToken: requireValue(input.playerToken, "participant token"),
    body: { ability_id: requireValue(input.abilityId, "ability id") },
    signal: input.signal,
  });
  return parsed(() => readLevelTwoConfirmed(body));
}

// --- error presentation -----------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  ranked_duel_match_not_found:
    "This match no longer exists on the backend. Staff matches live in memory only — a backend restart clears them.",
  ranked_duel_invalid_player_token: "That participant token is not valid for this match.",
  ranked_duel_token_player_mismatch: "That token belongs to the other player in this match.",
  ranked_duel_player_not_found: "No such player in this match.",
  ranked_duel_no_active_round: "No round is active right now.",
  ranked_duel_stale_round: "That round already ended — waiting for the next round.",
  ranked_duel_duplicate_submission: "You already locked in this round.",
  ranked_duel_invalid_answer_option: "Choose one of the listed answers.",
  ranked_duel_invalid_ability: "That ability is not available to you.",
  ranked_duel_ability_no_charges: "That ability has no charges left.",
  ranked_duel_progression_choice_required:
    "A Level 2 ability choice is required before play continues.",
  ranked_duel_progression_choice_not_required: "No Level 2 choice is needed right now.",
  ranked_duel_invalid_progression_choice: "Choose one of the offered Level 2 abilities.",
  ranked_duel_match_complete: "The match is over — no further submissions are accepted.",
  ranked_duel_match_already_exists: "A match with that ID already exists on the backend.",
  ranked_duel_experiment_disabled:
    "The treatment arm is disabled by the backend experiment kill switch.",
  ranked_duel_invalid_experiment_arm: "Unknown experiment arm.",
  ranked_duel_invalid_class: "Unknown class.",
  ranked_duel_not_playable: "That match has no gameplay lifecycle (not a playable staff duel).",
  ranked_duel_registry_unavailable: "The backend session registry is not configured.",
  ranked_duel_projection_error: "The backend failed to build that projection.",
};

/**
 * Safe, user-facing text for any client error. Never exposes stack traces,
 * raw objects, credentials, or opponent-private state.
 */
export function describeError(err: unknown): string {
  if (err instanceof RankedDuelApiError) {
    if (err.errorCode && ERROR_MESSAGES[err.errorCode]) return ERROR_MESSAGES[err.errorCode];
    if (err.kind === "network") return err.message;
    if (err.kind === "aborted") return "Request cancelled.";
    if (err.kind === "backend" && (err.status === 401 || err.status === 403)) {
      // Includes the shared admin-key dependency's plain-string detail.
      return err.message || "Not authorized.";
    }
    if (err.kind === "invalid_response") {
      return "The backend returned data this page could not read.";
    }
    return err.message;
  }
  return "Something went wrong.";
}

/** True when the error means the match itself is gone (backend restart). */
export const isMatchGone = (err: unknown): boolean =>
  err instanceof RankedDuelApiError && err.errorCode === "ranked_duel_match_not_found";

/** True when the participant's credentials were rejected. */
export const isCredentialError = (err: unknown): boolean =>
  err instanceof RankedDuelApiError &&
  (err.errorCode === "ranked_duel_invalid_player_token" ||
    err.errorCode === "ranked_duel_token_player_mismatch" ||
    err.errorCode === "ranked_duel_player_not_found");

/** True when there is simply no active round (progression gate or match over). */
export const isNoActiveRound = (err: unknown): boolean =>
  err instanceof RankedDuelApiError && err.errorCode === "ranked_duel_no_active_round";

/** Pending Level 2 players carried on the 409 no-active-round detail. */
export const pendingPlayersFromError = (err: unknown): string[] => {
  if (!(err instanceof RankedDuelApiError) || !err.detail) return [];
  const pending = err.detail.progression_pending_players;
  return Array.isArray(pending) ? pending.filter((p): p is string => typeof p === "string") : [];
};
