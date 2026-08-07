/**
 * Failure classification for the billable team-simulation POST.
 *
 * The distinction this module exists for: a request the SERVER answered is a
 * known outcome; a request that never produced an answer is not. The backend
 * offers no client-retry idempotency, so a blind retry after a lost response
 * is a second billable simulation. Nothing here retries, and nothing here
 * claims a charge outcome the response does not carry.
 *
 *   outcome "rejected"  — the server answered with a status that means the
 *                         simulation did not run. Combined with the catalog's
 *                         `pricing.charged_only_on_success`, that is a
 *                         backend-published fact, not an inference.
 *   outcome "unknown"   — a 5xx (the run may have started) or no answer at all
 *                         (network failure, timeout, abort). The UI must warn
 *                         and must never auto-retry.
 */

/** Whether the response proves the simulation did not run. */
export type TeamSimOutcomeCertainty = "rejected" | "unknown";

export type TeamSimErrorKind =
  | "auth_required"
  | "account_required"
  | "insufficient_credits"
  | "request_too_large"
  | "invalid_request"
  | "rate_limited"
  | "server_error"
  | "network"
  | "malformed_response";

const KIND_BY_STATUS: Record<number, TeamSimErrorKind> = {
  401: "auth_required",
  402: "insufficient_credits",
  403: "account_required",
  413: "request_too_large",
  422: "invalid_request",
  429: "rate_limited",
};

/** Anything the API layer throws for a failed simulation or catalog call. */
export class TeamSimError extends Error {
  readonly kind: TeamSimErrorKind;
  readonly certainty: TeamSimOutcomeCertainty;
  readonly status: number | null;
  /** Stable backend code (`insufficient_credits`, `unknown_item`, …). */
  readonly code: string | null;
  /** Backend credit block, when the response carried one (402). */
  readonly credits: unknown | null;
  /** Seconds, from Retry-After (429). Informational — nothing auto-retries. */
  readonly retryAfterSeconds: number | null;
  /** Sanitized structured body for the operator debug section. */
  readonly detail: unknown;

  constructor(opts: {
    message: string;
    kind: TeamSimErrorKind;
    certainty: TeamSimOutcomeCertainty;
    status?: number | null;
    code?: string | null;
    credits?: unknown;
    retryAfterSeconds?: number | null;
    detail?: unknown;
  }) {
    super(opts.message);
    this.name = "TeamSimError";
    this.kind = opts.kind;
    this.certainty = opts.certainty;
    this.status = opts.status ?? null;
    this.code = opts.code ?? null;
    this.credits = opts.credits ?? null;
    this.retryAfterSeconds = opts.retryAfterSeconds ?? null;
    this.detail = opts.detail ?? null;
  }

  /** True when the user must be warned that the charge status is unknown. */
  get isUncertain(): boolean {
    return this.certainty === "unknown";
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Flatten FastAPI's two 422 shapes into one code+message pair.
 *  - adapter rejection:  {"detail": {"code": "unknown_item", "message": "…"}}
 *  - schema rejection:   {"detail": [{"loc": [...], "msg": "…"}, …]}
 */
export function normalizeErrorBody(body: unknown): {
  code: string | null;
  message: string | null;
} {
  if (!isObj(body)) return { code: null, message: null };
  const detail = body.detail;

  if (isObj(detail)) {
    return {
      code: typeof detail.code === "string" ? detail.code : null,
      message: typeof detail.message === "string" ? detail.message : null,
    };
  }
  if (Array.isArray(detail) && detail.length > 0) {
    const parts: string[] = [];
    for (const entry of detail) {
      if (!isObj(entry)) continue;
      const loc = Array.isArray(entry.loc)
        ? entry.loc.filter((p) => p !== "body").join(".")
        : "";
      const msg = typeof entry.msg === "string" ? entry.msg : "invalid value";
      parts.push(loc ? `${loc}: ${msg}` : msg);
    }
    return { code: "schema_invalid", message: parts.join("; ") || null };
  }
  if (typeof detail === "string") return { code: null, message: detail };
  return { code: null, message: null };
}

const DEFAULT_MESSAGE: Record<TeamSimErrorKind, string> = {
  auth_required: "Sign in with a verified account to run team simulations.",
  account_required:
    "A signed-in account is required — guest and anonymous sessions cannot run team simulations.",
  insufficient_credits: "You have no Combat Lab credits left today.",
  request_too_large: "The scenario is too large for this endpoint.",
  invalid_request: "The scenario was rejected before the simulation ran.",
  rate_limited: "Too many team simulations. Wait a moment before running another.",
  server_error: "The simulation failed on the server.",
  network:
    "The request did not complete. The status of this simulation is unknown.",
  malformed_response: "The server returned a response this page cannot read.",
};

/** Build a typed error from a real HTTP response. */
export function errorFromResponse(
  status: number,
  body: unknown,
  headers?: { get(name: string): string | null }
): TeamSimError {
  const kind: TeamSimErrorKind =
    KIND_BY_STATUS[status] ?? (status >= 500 ? "server_error" : "invalid_request");
  const { code, message } = normalizeErrorBody(body);
  const rawRetry = headers?.get("retry-after") ?? null;
  const retryAfterSeconds =
    rawRetry !== null && rawRetry !== "" && Number.isFinite(Number(rawRetry))
      ? Number(rawRetry)
      : null;

  const credits =
    isObj(body) && isObj(body.detail) && isObj(body.detail.credits)
      ? body.detail.credits
      : null;

  return new TeamSimError({
    // A 5xx means the simulation may have started: the response carries no
    // credit outcome either way, so the charge status is not knowable here.
    certainty: status >= 500 ? "unknown" : "rejected",
    kind,
    status,
    code,
    credits,
    retryAfterSeconds,
    detail: body,
    message: message || DEFAULT_MESSAGE[kind],
  });
}

/** Build a typed error for a request that never produced a response. */
export function errorFromTransportFailure(cause: unknown): TeamSimError {
  const causeMessage =
    cause instanceof Error ? cause.message : String(cause ?? "unknown");
  return new TeamSimError({
    kind: "network",
    certainty: "unknown",
    message: DEFAULT_MESSAGE.network,
    detail: { transport_error: causeMessage },
  });
}

/**
 * The one sentence the UI shows whenever the outcome is not knowable. Kept
 * here so every surface says the same thing.
 */
export const UNCERTAIN_STATUS_WARNING =
  "The request status is uncertain. Do not retry automatically; retrying may use additional credits.";
