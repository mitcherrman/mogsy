// ---------------------------------------------------------------------------
// Read-only admin operations client.
//
// Three existing backend endpoints that had no frontend consumer at all:
//   GET /api/ranked/launch-readiness   the per-gate Ranked readiness verdict
//   GET /api/ranked/rating-status      rating backlog + policy/flag state
//   GET /api/admin/db/status           live database summary and restore limits
//   GET /api/admin/analytics/health    FUNNEL1B3 outbox delivery state (FUNNEL1C)
//
// READS ONLY. Nothing here writes, and nothing here is added to the backend:
// all three routes already exist behind `require_admin` and are unchanged.
// Credentials come from the shared buildAdminHeaders() helper, so this uses
// exactly the same authorization path as every other admin client.
// ---------------------------------------------------------------------------

import { ADMIN_API_BASE_URL, buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";

export interface ReadinessCheck {
  status: "ok" | "warn" | "blocked";
  detail: string;
}

export interface LaunchReadiness {
  schema_version: string;
  server_time: string;
  verdict: "ready" | "ready_with_restrictions" | "not_ready";
  checks: Record<string, ReadinessCheck>;
}

export interface RatingStatus {
  schema_version: string;
  server_time: string;
  policy_version: string;
  rating_enabled: boolean;
  rate_forfeits: boolean;
  results_by_status: Record<string, number>;
}

export interface DbStatus {
  ok: boolean;
  path: string;
  exists: boolean;
  size_bytes: number;
  healthy?: boolean;
  tables: Record<string, boolean>;
  row_counts: Record<string, number>;
  env_LOL_CALC_DB_PATH?: string;
  identity_db?: {
    env_var: string;
    env_set: boolean;
    resolved_path: string;
    present: boolean;
  };
  restore_limits?: {
    max_upload_bytes: number;
    allowed_destination_dirs: string[];
  };
}

/**
 * FUNNEL1B3 authoritative-analytics delivery state (routes/analytics_health.py).
 * Only the fields Admin renders are typed; the endpoint never includes a
 * credential, and Admin does not render the ingest endpoint URL either.
 */
export interface AnalyticsHealth {
  ok: boolean;
  problems: string[];
  gameplay_seen: boolean;
  configured?: boolean;
  enabled?: boolean;
  drainer_alive?: boolean;
  stale_after_seconds?: number;
  last_drain_at?: string | number | null;
  outbox?: {
    total?: number;
    unsent?: number;
    oldest_unsent_age_seconds?: number | null;
    abandoned?: number;
    dead_lettered?: number;
  };
  counters?: Record<string, number | string | null>;
}

/** A read that failed, described well enough to render honestly. */
export class AdminOpsError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = "AdminOpsError";
    this.status = status;
  }
}

async function adminGet<T>(path: string): Promise<T> {
  const url = `${ADMIN_API_BASE_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: await buildAdminHeaders(url) });
  } catch {
    throw new AdminOpsError("Could not reach the admin backend.", null);
  }
  if (res.status === 401 || res.status === 403) {
    throw new AdminOpsError(
      "The backend refused this request. Backend admin access is a separate authority from your Supabase role.",
      res.status,
    );
  }
  if (!res.ok) {
    throw new AdminOpsError(`Backend returned ${res.status}.`, res.status);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new AdminOpsError("Backend returned a response this page could not read.", res.status);
  }
}

export const fetchLaunchReadiness = () =>
  adminGet<LaunchReadiness>("/api/ranked/launch-readiness");

export const fetchRatingStatus = () => adminGet<RatingStatus>("/api/ranked/rating-status");

export const fetchDbStatus = () => adminGet<DbStatus>("/api/admin/db/status");

export const fetchAnalyticsHealth = () => adminGet<AnalyticsHealth>("/api/admin/analytics/health");

/** Human label for a readiness verdict. */
export function verdictLabel(verdict: LaunchReadiness["verdict"]): string {
  switch (verdict) {
    case "ready":
      return "Ready";
    case "ready_with_restrictions":
      return "Ready with restrictions";
    default:
      return "Not ready";
  }
}
