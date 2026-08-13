/**
 * The only network layer for the SIM2 team-combat UI.
 *
 * Four calls, and nothing else in this feature is allowed to call `fetch`:
 *   - GET  the Phase 4A catalog       (free, cacheable, ETag-revalidated)
 *   - POST one simulation             (billable, idempotent by key, never
 *                                      automatically retried)
 *   - GET  the Phase 4E recovery list (free, authenticated, read-only)
 *   - POST one recovery by handle     (free — the result was charged when it
 *                                      was produced; never runs a simulation)
 *
 * The POST deliberately has NO client timeout and NO abort signal. Aborting a
 * billable request does not stop the server, it only destroys the evidence of
 * what happened — the request would complete, possibly charge, and the client
 * would be left in exactly the "uncertain" state this feature works hardest to
 * avoid. Letting it finish is the safer failure mode.
 *
 * Phase 4C: every POST carries the prepared request's `Idempotency-Key`. The
 * key is supplied by the caller and never minted here — a key created at the
 * fetch call would be new on every attempt, which would turn a recovery into a
 * second billable simulation, exactly the bug the key exists to prevent.
 */
import { COMBAT_API_BASE_URL } from "@/lib/combat-lab/api";
import { getBackendAuthHeaders } from "@/lib/backend-auth";

import { assertTeamSimCatalog, MalformedCatalogError } from "./catalog";
import {
  errorFromResponse,
  errorFromTransportFailure,
  TeamSimError,
} from "./errors";
import {
  IDEMPOTENCY_HEADER,
  IDEMPOTENCY_REPLAYED_HEADER,
  TEAM_SIM_CATALOG_PATH,
  TEAM_SIM_RECOVER_PATH,
  TEAM_SIM_RECOVERABLE_PATH,
  TEAM_SIM_SIMULATE_PATH,
  type RecoverableListing,
  type RecoverableRequest,
  type RecoverableStatus,
  type TeamSimCatalog,
  type TeamSimulationRequest,
  type TeamSimulationResponse,
} from "./contract";

export type CatalogLoad = {
  catalog: TeamSimCatalog;
  etag: string | null;
  /** True when the server answered 304 and the cached body was reused. */
  fromCache: boolean;
};

/**
 * Module-level ETag memo. The endpoint sends a strong ETag plus
 * `Cache-Control: public, max-age=300`; sending `If-None-Match` explicitly
 * means a revalidation costs an empty 304 instead of ~93 KB, and — unlike the
 * browser's transparent cache — it is observable, so the UI can tell the
 * operator the catalog was revalidated rather than re-downloaded.
 */
let cachedEtag: string | null = null;
let cachedCatalog: TeamSimCatalog | null = null;

/** Test seam: drop the in-module ETag memo. */
export function __resetCatalogCache(): void {
  cachedEtag = null;
  cachedCatalog = null;
}

export async function fetchTeamSimCatalog(): Promise<CatalogLoad> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cachedEtag && cachedCatalog) headers["If-None-Match"] = cachedEtag;

  let response: Response;
  try {
    response = await fetch(`${COMBAT_API_BASE_URL}${TEAM_SIM_CATALOG_PATH}`, {
      method: "GET",
      headers,
    });
  } catch (cause) {
    throw errorFromTransportFailure(cause);
  }

  if (response.status === 304) {
    // Only reachable when we sent If-None-Match, which requires a cached body.
    if (cachedCatalog) {
      return { catalog: cachedCatalog, etag: cachedEtag, fromCache: true };
    }
    throw new TeamSimError({
      kind: "malformed_response",
      certainty: "rejected",
      status: 304,
      message: "The server reported the catalog unchanged, but nothing was cached.",
    });
  }

  if (!response.ok) {
    const body = await readJsonSafely(response);
    throw errorFromResponse(response.status, body, response.headers);
  }

  const body = await readJsonSafely(response);
  let catalog: TeamSimCatalog;
  try {
    catalog = assertTeamSimCatalog(body);
  } catch (cause) {
    throw new TeamSimError({
      kind: "malformed_response",
      certainty: "rejected",
      status: response.status,
      code: "catalog_malformed",
      message:
        cause instanceof MalformedCatalogError
          ? cause.message
          : "Simulation catalog is malformed.",
      detail: cause instanceof MalformedCatalogError ? { field: cause.field } : null,
    });
  }

  cachedEtag = response.headers?.get?.("etag") ?? null;
  cachedCatalog = catalog;
  return { catalog, etag: cachedEtag, fromCache: false };
}

/** A completed simulation, plus whether the server replayed a stored one. */
export type SimulationOutcome = {
  response: TeamSimulationResponse;
  /**
   * `Idempotency-Replayed: true` — this body was produced by an earlier
   * request with the same key, and retrieving it cost nothing.
   */
  replayed: boolean;
};

/**
 * Run exactly one simulation. Billable, unless the server replays one.
 *
 * `idempotencyKey` is required by the endpoint and comes from the caller, so
 * that recovering an uncertain request reuses the ORIGINAL key: same key plus
 * same body is the only combination the backend replays instead of charging.
 *
 * Every failure becomes a TeamSimError whose `certainty` says whether the
 * server actually rejected the request. Callers never see a bare fetch
 * rejection, so "no answer" can never be mistaken for "rejected".
 */
export async function submitTeamSimulation(
  request: TeamSimulationRequest,
  idempotencyKey: string
): Promise<SimulationOutcome> {
  const authHeaders = await getBackendAuthHeaders();

  let response: Response;
  try {
    response = await fetch(`${COMBAT_API_BASE_URL}${TEAM_SIM_SIMULATE_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        [IDEMPOTENCY_HEADER]: idempotencyKey,
        ...authHeaders,
      },
      body: JSON.stringify(request),
    });
  } catch (cause) {
    throw errorFromTransportFailure(cause);
  }

  if (!response.ok) {
    const body = await readJsonSafely(response);
    throw errorFromResponse(response.status, body, response.headers);
  }

  const body = await readJsonSafely(response);
  return {
    response: assertSimulationResponse(body),
    replayed: response.headers?.get?.(IDEMPOTENCY_REPLAYED_HEADER) === "true",
  };
}

/**
 * A 200 whose body cannot be read is NOT a rejection: the simulation ran and
 * may have been charged. It is reported as uncertain for that reason.
 */
export function assertSimulationResponse(body: unknown): TeamSimulationResponse {
  const bad = (field: string) =>
    new TeamSimError({
      kind: "malformed_response",
      certainty: "unknown",
      status: 200,
      code: "response_malformed",
      message: `The simulation response is missing or invalid: ${field}.`,
      detail: { field },
    });

  if (!body || typeof body !== "object" || Array.isArray(body)) throw bad("body");
  const b = body as Record<string, unknown>;
  if (!b.termination || typeof b.termination !== "object") throw bad("termination");
  if (!Array.isArray(b.events)) throw bad("events");
  if (!b.trace || typeof b.trace !== "object") throw bad("trace");
  if (!b.effective_builds || typeof b.effective_builds !== "object") {
    throw bad("effective_builds");
  }
  if (!b.combatant_summaries || typeof b.combatant_summaries !== "object") {
    throw bad("combatant_summaries");
  }
  if (!b.team_summaries || typeof b.team_summaries !== "object") {
    throw bad("team_summaries");
  }
  return body as TeamSimulationResponse;
}

/* ─────────────────────── Phase 4E server recovery ────────────────────── */

const RECOVERABLE_STATUSES: readonly RecoverableStatus[] = [
  "completed",
  "pending",
  "stale",
];

/**
 * The caller's own recoverable requests. Free, read-only, account-scoped.
 *
 * A 401/403 here is ordinary — a signed-out visitor has nothing to recover —
 * so the caller renders nothing rather than an alarm. Every other failure is a
 * TeamSimError like the rest of this module, and none of them is retried
 * automatically: this is a list, and a list that refetches itself would poll a
 * paid-request surface nobody asked it to.
 */
export async function fetchRecoverableRequests(): Promise<RecoverableListing> {
  const authHeaders = await getBackendAuthHeaders();

  let response: Response;
  try {
    response = await fetch(`${COMBAT_API_BASE_URL}${TEAM_SIM_RECOVERABLE_PATH}`, {
      method: "GET",
      headers: { Accept: "application/json", ...authHeaders },
    });
  } catch (cause) {
    throw errorFromTransportFailure(cause);
  }

  if (!response.ok) {
    const body = await readJsonSafely(response);
    throw errorFromResponse(response.status, body, response.headers);
  }
  return assertRecoverableListing(await readJsonSafely(response));
}

/**
 * Collect one completed result by its opaque handle.
 *
 * POST, matching the endpoint — and matching what it is for the operator: an
 * explicit, deliberate act. It cannot charge and cannot run a simulation, but
 * it is never issued by anything except a click.
 *
 * The response is the ORIGINAL accepted body, so it is validated by exactly
 * the same assertion a fresh simulation is. `replayed` comes from the same
 * header, which the server always sets to `true` here.
 */
export async function recoverSimulation(
  recoveryId: string
): Promise<SimulationOutcome> {
  const authHeaders = await getBackendAuthHeaders();
  // The handle is opaque and server-minted, but it is going into a PATH, so it
  // is encoded rather than trusted to be path-safe.
  const url =
    `${COMBAT_API_BASE_URL}${TEAM_SIM_RECOVER_PATH}/` +
    encodeURIComponent(recoveryId);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", ...authHeaders },
    });
  } catch (cause) {
    throw errorFromTransportFailure(cause);
  }

  if (!response.ok) {
    const body = await readJsonSafely(response);
    throw errorFromResponse(response.status, body, response.headers);
  }

  const body = await readJsonSafely(response);
  return {
    response: assertSimulationResponse(body),
    replayed: response.headers?.get?.(IDEMPOTENCY_REPLAYED_HEADER) === "true",
  };
}

/**
 * Validate a discovery payload, NORMALIZING entries rather than failing the
 * list — and never handing the renderer a field it has not checked.
 *
 * Two rules, and the second is the one that is easy to get wrong:
 *
 *  - One malformed entry must not hide the others. This list is how somebody
 *    finds a simulation they have already paid for; refusing to render all of
 *    them because one is unreadable would be the worst possible trade. An
 *    entry without a usable handle or status could not be recovered anyway, so
 *    dropping it loses nothing that was ever actionable.
 *
 *  - Every field the UI RENDERS is checked here, not just the ones it acts on.
 *    Validating only `recovery_id`/`status`/`replay_available` would let
 *    `champions: {a: "Vayne"}` through to a `.join()` in the panel. There is no
 *    error boundary on this route, so that throw unmounts the whole tree — a
 *    blank page that hides every recoverable paid result AND any result already
 *    on screen. A field that fails its check becomes null, which the panel
 *    already renders as "unavailable"; the entry stays recoverable.
 */
export function assertRecoverableListing(body: unknown): RecoverableListing {
  const bad = (field: string) =>
    new TeamSimError({
      kind: "malformed_response",
      certainty: "rejected",
      status: 200,
      code: "recoverable_malformed",
      message: `The recovery list is missing or invalid: ${field}.`,
      detail: { field },
    });

  if (!body || typeof body !== "object" || Array.isArray(body)) throw bad("body");
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.recoverable_requests)) throw bad("recoverable_requests");

  const entries = b.recoverable_requests
    .map(normalizeRecoverableRequest)
    .filter((entry): entry is RecoverableRequest => entry !== null);
  return {
    contract_version: typeof b.contract_version === "string" ? b.contract_version : "",
    endpoint: typeof b.endpoint === "string" ? b.endpoint : "",
    retention_seconds:
      typeof b.retention_seconds === "number" ? b.retention_seconds : 0,
    limit: typeof b.limit === "number" ? b.limit : entries.length,
    count: entries.length,
    recoverable_requests: entries,
  };
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const strs = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((e) => typeof e === "string") ? v : null;

/** A timestamp the UI can actually format. An unparseable one renders as
 *  "Invalid Date", which looks like a bug in the recovery surface rather than
 *  in the value — so it is dropped instead. */
const stamp = (v: unknown): string | null => {
  const s = str(v);
  return s && Number.isFinite(new Date(s).getTime()) ? s : null;
};

function normalizeRecoverableRequest(value: unknown): RecoverableRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;

  // Required to be actionable at all. Without a handle it cannot be recovered;
  // without a known status the UI has no behaviour for it; without a creation
  // time it cannot be placed in the list the operator is scanning.
  const recovery_id = str(v.recovery_id);
  const created_at = stamp(v.created_at);
  if (!recovery_id || !created_at) return null;
  if (!RECOVERABLE_STATUSES.includes(v.status as RecoverableStatus)) return null;

  const champions = v.champions as Record<string, unknown> | undefined;
  const a = champions ? strs(champions.a) : null;
  const bTeam = champions ? strs(champions.b) : null;

  return {
    recovery_id,
    status: v.status as RecoverableStatus,
    // Derived from the status rather than trusted: `replay_available` and
    // `status` are two statements of one fact, and the status is the one the
    // UI already switches on. A backend that disagreed with itself must not
    // put a "Recover" button on something with no stored result.
    replay_available: v.status === "completed",
    created_at,
    expires_at: stamp(v.expires_at) ?? "",
    completed_at: stamp(v.completed_at),
    // A missing cost renders as "undefined credits" if passed through; 0 is
    // the honest floor for a number the server did not state.
    credit_cost: num(v.credit_cost) ?? 0,
    credits_charged: num(v.credits_charged) ?? 0,
    contract_version: str(v.contract_version) ?? "",
    team_shape: str(v.team_shape),
    champions: a === null && bTeam === null ? null : { a: a ?? [], b: bTeam ?? [] },
    winner: str(v.winner),
    termination_reason: str(v.termination_reason),
    event_count: num(v.event_count),
    response_bytes: num(v.response_bytes),
  };
}

async function readJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
