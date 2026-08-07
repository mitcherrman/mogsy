/**
 * The only network layer for the SIM2 team-combat UI.
 *
 * Two calls, and nothing else in this feature is allowed to call `fetch`:
 *   - GET  the Phase 4A catalog (free, cacheable, ETag-revalidated)
 *   - POST one simulation       (billable, non-idempotent, never retried)
 *
 * The POST deliberately has NO client timeout and NO abort signal. Aborting a
 * billable request does not stop the server, it only destroys the evidence of
 * what happened — the request would complete, possibly charge, and the client
 * would be left in exactly the "uncertain" state this feature works hardest to
 * avoid. Letting it finish is the safer failure mode.
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
  TEAM_SIM_CATALOG_PATH,
  TEAM_SIM_SIMULATE_PATH,
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

/**
 * Run exactly one simulation. Billable.
 *
 * Every failure becomes a TeamSimError whose `certainty` says whether the
 * server actually rejected the request. Callers never see a bare fetch
 * rejection, so "no answer" can never be mistaken for "rejected".
 */
export async function submitTeamSimulation(
  request: TeamSimulationRequest
): Promise<TeamSimulationResponse> {
  const authHeaders = await getBackendAuthHeaders();

  let response: Response;
  try {
    response = await fetch(`${COMBAT_API_BASE_URL}${TEAM_SIM_SIMULATE_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
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
  return assertSimulationResponse(body);
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

async function readJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
