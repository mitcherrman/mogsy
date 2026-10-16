/**
 * PT4 — the owner Perfect Timing lab's client for `/api/admin/perfect-timing/*`
 * (backend PT3, `routes/admin_perfect_timing.py`).
 *
 * Every call carries the owner's admin headers (`buildAdminHeaders`), so the
 * backend's `require_admin` + `PERFECT_TIMING_LAB_ENABLED` are the
 * authorization boundary — the route gate and the lazy chunk are presentation,
 * not security. Responses are read by the strict parsers in `contract.ts`.
 *
 * RETRIES. `lock` is idempotent server-side (same round + same `elapsed_ms`
 * returns the identical body), so a lock whose response was lost may be sent
 * again: up to 3 retries with backoff, on a network failure or a 5xx only. A
 * 4xx is the server's answer and is never retried. `deal` mints new rounds on
 * every call and is never retried automatically.
 */
import { ADMIN_API_BASE_URL, buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";
import { MAX_ELAPSED_MS, PtContractError, parseDeal, parseRelease, type PtDeal, type PtRelease } from "./contract";

export const PERFECT_TIMING_API = "/api/admin/perfect-timing";

/** Backoff before retry 1, 2 and 3. */
export const LOCK_RETRY_DELAYS_MS: readonly number[] = [300, 800, 1600];

export class PerfectTimingApiError extends Error {
  constructor(message: string, readonly status: number | null, readonly code: string | null) {
    super(message);
    this.name = "PerfectTimingApiError";
  }
  /** A network failure or a 5xx: worth sending again. */
  get transient(): boolean {
    return this.status === null || this.status >= 500;
  }
}

type Fetch = typeof fetch;

export interface PerfectTimingApiOptions {
  fetchImpl?: Fetch;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
}

async function post(path: string, body: unknown, fetchImpl: Fetch): Promise<unknown> {
  const url = `${ADMIN_API_BASE_URL}${PERFECT_TIMING_API}${path}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { ...(await buildAdminHeaders(url)), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PerfectTimingApiError("Could not reach the admin backend.", null, null);
  }
  let json: unknown = null;
  try { json = await res.json(); } catch { json = null; }
  if (!res.ok) {
    const detail = (json as { detail?: unknown } | null)?.detail;
    const err = (detail as { error?: { code?: string; message?: string } } | undefined)?.error;
    const message = err?.message ?? (typeof detail === "string" ? detail : `Backend returned ${res.status}.`);
    throw new PerfectTimingApiError(message, res.status, err?.code ?? null);
  }
  return json;
}

function read<T>(parse: (raw: unknown) => T, raw: unknown): T {
  try {
    return parse(raw);
  } catch (err) {
    const why = err instanceof PtContractError ? ` (${err.message})` : "";
    throw new PerfectTimingApiError(`Backend returned a response this page could not read${why}.`, 200, "PT_CONTRACT");
  }
}

export function perfectTimingApi(options: PerfectTimingApiOptions = {}) {
  const fetchImpl: Fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  return {
    deal: async (count: number): Promise<PtDeal> => read(parseDeal, await post("/deal", { count }, fetchImpl)),

    lock: async (roundId: string, elapsedMs: number): Promise<PtRelease> => {
      if (!Number.isInteger(elapsedMs) || elapsedMs < 0 || elapsedMs > MAX_ELAPSED_MS) {
        throw new PerfectTimingApiError("That time cannot be submitted.", null, "PT_CLIENT_RANGE");
      }
      const path = `/rounds/${encodeURIComponent(roundId)}/lock`;
      for (let attempt = 0; ; attempt++) {
        try {
          const release = read(parseRelease, await post(path, { elapsed_ms: elapsedMs }, fetchImpl));
          if (release.round_id !== roundId || release.elapsed_ms !== elapsedMs) {
            throw new PerfectTimingApiError("Backend released a different round or time.", 200, "PT_CONTRACT");
          }
          return release;
        } catch (err) {
          const transient = err instanceof PerfectTimingApiError && err.transient;
          if (!transient || attempt >= LOCK_RETRY_DELAYS_MS.length) throw err;
          await sleep(LOCK_RETRY_DELAYS_MS[attempt]);
        }
      }
    },
  };
}
export type PerfectTimingApi = ReturnType<typeof perfectTimingApi>;
