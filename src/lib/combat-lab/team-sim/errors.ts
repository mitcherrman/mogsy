/**
 * Failure classification for the billable team-simulation POST.
 *
 * The distinction this module exists for: a request the SERVER answered is a
 * known outcome; a request that never produced an answer is not. Nothing here
 * retries, and nothing here claims a charge outcome the response does not
 * carry.
 *
 *   outcome "rejected"  — the server answered with a status that means the
 *                         simulation did not run. Combined with the catalog's
 *                         `pricing.charged_only_on_success`, that is a
 *                         backend-published fact, not an inference.
 *   outcome "unknown"   — a 5xx (the run may have started) or no answer at all
 *                         (network failure, timeout, abort). The UI must warn
 *                         and must never auto-retry.
 *
 * Phase 4C changes what "unknown" MEANS, not how it is detected. The backend
 * now honors `Idempotency-Key`, so resending the identical request with the
 * same key either replays the original result or reports it still running —
 * it cannot charge twice. That makes an explicit, operator-driven recovery a
 * safe offer where before there was only a warning. It does not make
 * AUTOMATIC retries acceptable: a request the operator did not ask for is
 * still one they did not authorize, and idempotency is defense in depth, not
 * permission.
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
  | "idempotency_conflict"
  | "idempotency_in_progress"
  | "idempotency_key_rejected"
  | "service_unavailable"
  | "result_unreadable"
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
  503: "service_unavailable",
};

/**
 * Statuses this endpoint shares between an idempotency outcome and something
 * ordinary, told apart by the stable code in the body.
 *
 * 400 matters because a generic 400 (a proxy, a WAF, malformed transport JSON)
 * would otherwise be titled "Request identifier rejected" and told to mint a
 * new key — advice that loops forever when the key was never the problem.
 *
 * 409 has no non-idempotency meaning on this endpoint today, so an
 * unrecognised one falls through to `invalid_request`. That is
 * certainty "rejected", which is right for a conflict and NOT knowably right
 * for an in-progress whose body failed to parse: the original request may
 * still be running. Bounded and rare (it needs a rewritten body), but stated
 * rather than assumed away.
 */
const KIND_BY_CODE: Record<number, Record<string, TeamSimErrorKind>> = {
  400: {
    idempotency_key_required: "idempotency_key_rejected",
    idempotency_key_invalid: "idempotency_key_rejected",
  },
  409: {
    idempotency_conflict: "idempotency_conflict",
    idempotency_in_progress: "idempotency_in_progress",
  },
  // The endpoint's two 503s make OPPOSITE statements about money:
  // `idempotency_unavailable` is a fail-closed refusal (nothing ran, nothing
  // charged); `idempotency_result_unreadable` means a completed record exists,
  // so the charge DID commit and only the result is lost.
  503: {
    idempotency_result_unreadable: "result_unreadable",
  },
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
  idempotency_conflict:
    "This request's key was already used for a different scenario. Run the scenario again to start a new request.",
  idempotency_in_progress:
    "This request is still running on the server. Check again in a moment — checking does not start a second simulation.",
  idempotency_key_rejected:
    "The server rejected this request's identifier. Run the scenario again to mint a new one.",
  // Deliberately says NOTHING about charging. A 503 can come from the endpoint
  // (a documented fail-closed refusal) or from anything in front of it, and the
  // two are not the same fact. The specific claim lives below, gated on the
  // endpoint's own code.
  service_unavailable: "The server did not accept the request.",
  result_unreadable:
    "The server accepted and charged this request but cannot read back its result. Check your credit balance before running it again.",
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
  const { code, message } = normalizeErrorBody(body);
  const kind: TeamSimErrorKind =
    (code ? KIND_BY_CODE[status]?.[code] : undefined) ??
    KIND_BY_STATUS[status] ??
    (status >= 500 ? "server_error" : "invalid_request");
  const rawRetry = headers?.get("retry-after") ?? null;
  const retryAfterSeconds =
    rawRetry !== null && rawRetry !== "" && Number.isFinite(Number(rawRetry))
      ? Number(rawRetry)
      : null;

  const credits =
    isObj(body) && isObj(body.detail) && isObj(body.detail.credits)
      ? body.detail.credits
      : null;

  // A 5xx means the simulation may have started: the response carries no
  // credit outcome either way, so the charge status is not knowable here.
  // The one exception is the endpoint's own 503 `idempotency_unavailable`,
  // which is a documented fail-CLOSED refusal — nothing ran and nothing was
  // charged. A 503 from anything else (a proxy, a cold start) never carries
  // that code, so it keeps failing toward the warning.
  const provenRefusal = status === 503 && code === "idempotency_unavailable";

  return new TeamSimError({
    certainty: status >= 500 && !provenRefusal ? "unknown" : "rejected",
    kind,
    status,
    code,
    credits,
    retryAfterSeconds,
    detail: body,
    // The endpoint's coded 503 carries the exception TYPE name as its message
    // (deliberately — it leaks nothing), which means nothing to an operator, so
    // this is the one place the client writes better copy than the server. It
    // is also the ONLY 503 allowed to claim nothing was charged: a 503 from a
    // proxy or a cold start gets DEFAULT_MESSAGE, which makes no such claim.
    message: provenRefusal
      ? "The server refused the request because it could not record it. Nothing ran and nothing was charged."
      : message || DEFAULT_MESSAGE[kind],
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
 *
 * Phase 4C rewrote it. The old wording — "retrying may use additional
 * credits" — was accurate before the endpoint honored `Idempotency-Key` and
 * is now WRONG for the recovery this page offers: checking the same request
 * resends the same key and the same bytes, which the backend replays rather
 * than re-charging. Saying otherwise would push operators away from the one
 * action that resolves the uncertainty. Nothing still retries on its own.
 */
export const UNCERTAIN_STATUS_WARNING =
  "The request status is uncertain. Nothing retries on its own — use “Check this request”, which resends the same request identifier and cannot be charged twice.";

/**
 * The same state, when no recovery control is available — because the catalog
 * reports idempotency is not required, or the request is not one that can be
 * re-sent unchanged. Then the pre-Phase-4C warning is the accurate one, and
 * promising a button that is not on screen would be worse than saying nothing.
 */
export const UNCERTAIN_STATUS_WARNING_NO_RECOVERY =
  "The request status is uncertain. Do not retry automatically; running again is a new request and may use additional credits.";

/**
 * Leaving the page while an uncertain request is unresolved discards the
 * request identifier, and with it the only safe way to ask what happened.
 */
export const UNRESOLVED_REQUEST_LEAVE_WARNING =
  "Checking is only possible while this page stays open — reloading or leaving discards the request identifier, and running again would be a new charge.";

/**
 * The same moment, once the request identifier is also written to browser
 * session storage (Phase 4D).
 *
 * The old sentence is now FALSE in this configuration, and a false warning is
 * not a harmless one: it pushes operators into a "must not reload" panic, and
 * when they reload anyway and find the request waiting for them, it teaches
 * them the warnings are noise. What is still true is narrower and worth
 * saying — leaving interrupts the visible response, and the recovery survives
 * only in THIS tab, for THIS account. It does not claim the simulation is
 * cancelled, because it is not.
 */
export const UNRESOLVED_REQUEST_LEAVE_WARNING_RECOVERABLE =
  "Leaving interrupts the response you are waiting for — it does not cancel the simulation. Reload this tab while signed in to the same account and the request can be checked again without another charge; closing the tab or the browser discards that option.";

/* ─────────────────────── Phase 4D recovery surface ─────────────────────── */

export const STORED_RECOVERY_TITLE = "Unfinished simulation";
export const STORED_RECOVERY_BODY =
  "A previous simulation from this tab was never resolved. It may have completed and been charged. Checking resends the identical request with its original identifier, so the server returns the result it already produced — it cannot charge a second time.";
export const STORED_RECOVERY_ACTION_LABEL = "Recover simulation";
export const STORED_RECOVERY_FORGET_LABEL = "Forget recovery";
export const STORED_RECOVERY_FORGET_HINT =
  "Forgetting only clears this browser's copy. The server may still have run and charged the request, and it will no longer be recoverable here — check your credit balance rather than assuming nothing happened.";

/**
 * Refusing a paid run because it could not be written down first.
 *
 * Stated as a completed fact ("was not sent"), because the operator's next
 * decision depends on knowing that no credits are at risk right now.
 */
export const RECOVERY_STORAGE_BLOCKED_TITLE = "Browser recovery is unavailable";
export const RECOVERY_STORAGE_BLOCKED_BODY =
  "This simulation was NOT sent. The request identifier could not be saved to this browser's session storage, and without it a completed simulation could be charged with no way to collect its result. Enable site data for this site (private browsing and blocked storage are the usual causes), then run again.";

export const RECOVERY_IDENTITY_PENDING_TITLE = "Confirming your account";
export const RECOVERY_IDENTITY_PENDING_BODY =
  "This simulation was NOT sent. Recovery information is stored per account, so the run waits until this browser has confirmed which account you are signed in as. Try again in a moment.";

export const RECOVERY_COLLISION_TITLE = "An earlier request is still unresolved";
export const RECOVERY_COLLISION_BODY =
  "This simulation was NOT sent. One unresolved request is kept per account in this tab, and starting a new one would overwrite the identifier the earlier request needs. Recover it, or explicitly forget it first.";

/**
 * Whether re-sending THIS request unchanged, with its original key, can tell
 * the operator anything new.
 *
 * One rule, one place: the leave-guard, the fallback card and the failure
 * notice all consult it, and a control that appears without the warning (or a
 * warning promising a control that is not there) would be worse than either.
 *
 *  - genuinely uncertain outcomes  → yes, that is the whole point
 *  - `idempotency_in_progress`     → yes; it is a rejection of THIS attempt
 *                                    that explicitly means "ask again"
 *  - `result_unreadable`           → no; the stored result is gone, so asking
 *                                    again fails identically until it expires
 *  - every other rejection         → no; the operator must fix something first
 */
export function isRecoverable(error: TeamSimError | null): boolean {
  if (!error) return false;
  if (error.kind === "result_unreadable") return false;
  return error.certainty !== "rejected" || error.kind === "idempotency_in_progress";
}

/**
 * Shown next to the recovery control, so the operator knows what pressing it
 * actually does.
 */
export const RECOVERY_ACTION_LABEL = "Check this request";
export const RECOVERY_ACTION_HINT =
  "Resends the identical request with its original identifier. The server returns the result it already produced, or reports it still running. It cannot charge a second time.";
