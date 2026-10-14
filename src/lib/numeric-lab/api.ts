/**
 * NUM-REC2 — the owner numeric lab's client for `/api/admin/numeric-lab/*`.
 *
 * The backend holds both historical captures; this client only ever receives
 * PUBLIC rounds, and a round's private block only in the answer to its own
 * Lock. Every call carries the owner's admin headers (`buildAdminHeaders`), so
 * the backend's `require_admin` is the authorization boundary — the route
 * gate and the lazy chunk are presentation, not security.
 *
 * Nothing here grades, scores or stores.
 */
import { ADMIN_API_BASE_URL, buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";
import type { PublicCapturedScenario, ReleasedScenario } from "@/lib/combat-estimate/contract";
import type { StatDropPublic, StatDropReveal } from "@/lib/interaction-grammar/types";

export const NUMERIC_LAB_API = "/api/admin/numeric-lab";

export class NumericLabApiError extends Error {
  constructor(message: string, readonly status: number | null, readonly code: string | null) {
    super(message);
    this.name = "NumericLabApiError";
  }
}

export interface StatDropPublicRound {
  id: string;
  domain: "pro-play" | "leaguecraft";
  title: string;
  shape: string;
  provenance_label: string;
  content: StatDropPublic;
}

export interface StatDropRounds {
  contract: "numeric_lab.stat_drop.public.v1";
  authority_label: string;
  capture_source: { branch: string; commit: string };
  rounds: StatDropPublicRound[];
}

export interface StatDropRelease {
  contract: "numeric_lab.stat_drop.release.v1";
  round_id: string;
  value: number;
  authority_label: string;
  released: StatDropReveal;
}

export interface CombatEstimateRounds {
  contract: "numeric_lab.combat_estimate.public.v1";
  authority_label: string;
  capture: {
    contract: string; captured_at: string; backend_commit: string; implementation: string;
    scale_policy: { id: string; development_only: true };
  };
  rounds: PublicCapturedScenario[];
}

export interface CombatEstimateRelease {
  contract: "numeric_lab.combat_estimate.release.v1";
  round_id: string;
  estimate: number;
  authority_label: string;
  backend_commit: string;
  released: ReleasedScenario;
}

type Fetch = typeof fetch;

async function request<T>(path: string, expectContract: string, init: RequestInit | undefined, fetchImpl: Fetch): Promise<T> {
  const url = `${ADMIN_API_BASE_URL}${NUMERIC_LAB_API}${path}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      ...init,
      headers: { ...(await buildAdminHeaders(url)), ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    });
  } catch {
    throw new NumericLabApiError("Could not reach the admin backend.", null, null);
  }
  let body: unknown = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    const detail = (body as { detail?: unknown } | null)?.detail;
    const err = (detail as { error?: { code?: string; message?: string } } | undefined)?.error;
    const message = err?.message ?? (typeof detail === "string" ? detail : `Backend returned ${res.status}.`);
    throw new NumericLabApiError(message, res.status, err?.code ?? null);
  }
  if ((body as { contract?: string } | null)?.contract !== expectContract) {
    throw new NumericLabApiError("Backend returned a response this page could not read.", res.status, null);
  }
  return body as T;
}

export function numericLabApi(fetchImpl: Fetch = (input, init) => fetch(input, init)) {
  return {
    statDropRounds: () =>
      request<StatDropRounds>("/stat-drop/rounds", "numeric_lab.stat_drop.public.v1", undefined, fetchImpl),
    lockStatDrop: (roundId: string, value: number) =>
      request<StatDropRelease>(`/stat-drop/rounds/${encodeURIComponent(roundId)}/lock`, "numeric_lab.stat_drop.release.v1",
        { method: "POST", body: JSON.stringify({ value }) }, fetchImpl),
    combatEstimateRounds: () =>
      request<CombatEstimateRounds>("/combat-estimate/rounds", "numeric_lab.combat_estimate.public.v1", undefined, fetchImpl),
    lockCombatEstimate: (roundId: string, estimate: number) =>
      request<CombatEstimateRelease>(`/combat-estimate/rounds/${encodeURIComponent(roundId)}/lock`, "numeric_lab.combat_estimate.release.v1",
        { method: "POST", body: JSON.stringify({ estimate }) }, fetchImpl),
  };
}
export type NumericLabApi = ReturnType<typeof numericLabApi>;
