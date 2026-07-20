// Combat Sim Battles — typed API client (Phase 3A).
//
// Reuses the established backend conventions:
//   - public calls: Bearer via getBackendAuthHeaders() (optional identity).
//   - admin calls:  buildAdminHeaders() (Bearer + optional X-Admin-Key).
//   - VITE_COMBAT_API_URL base (fallback 127.0.0.1:8000).
//
// Errors surface as a structured BattlesApiError carrying the HTTP status and
// the backend's { code, message, ... } detail so callers can react to 401/403/
// 404/409 (lock race) and validation errors precisely. The frontend never
// derives a winner/outcome/score/lifecycle — this client only reads/writes.

import { getBackendAuthHeaders } from "@/lib/backend-auth";
import { buildAdminHeaders, ADMIN_API_BASE_URL } from "@/lib/admin-auth/adminCredentials";
import type {
  BattleListItem, BattleDetail, BattleResultResponse, PredictionSummary,
  PredictionResponse, SettlementSummary, ArenaScore, MyPrediction,
  AdminBattle, AdminValidationReport, AdminSettlementAudit, Side,
} from "./types";

export const BATTLES_API_BASE_URL = ADMIN_API_BASE_URL;

export class BattlesApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: unknown;
  constructor(status: number, code: string, message: string, detail?: unknown) {
    super(message);
    this.name = "BattlesApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
  /** A submission arrived after lock (or any window transition) — refetch state. */
  get isWindowClosed() {
    return this.status === 409 && this.code === "window_closed";
  }
  get isAuthRequired() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isNotFound() {
    return this.status === 404;
  }
}

async function parseError(res: Response): Promise<BattlesApiError> {
  let code = `http_${res.status}`;
  let message = res.statusText || "Request failed";
  let detail: unknown;
  try {
    const body = await res.json();
    detail = body;
    const d = (body && (body.detail ?? body)) as Record<string, unknown> | string;
    if (typeof d === "string") {
      message = d;
    } else if (d && typeof d === "object") {
      if (typeof d.code === "string") code = d.code;
      if (typeof d.message === "string") message = d.message;
    }
  } catch {
    /* non-JSON error body */
  }
  return new BattlesApiError(res.status, code, message, detail);
}

type ReqInit = RequestInit & { admin?: boolean; signal?: AbortSignal };

async function request<T>(path: string, init?: ReqInit): Promise<T> {
  const url = `${BATTLES_API_BASE_URL}${path}`;
  const authHeaders = init?.admin
    ? await buildAdminHeaders(url)
    : await getBackendAuthHeaders();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// --------------------------------------------------------------------------- //
// Public
// --------------------------------------------------------------------------- //
export const battlesApi = {
  list: (signal?: AbortSignal) =>
    request<{ battles: BattleListItem[] }>("/api/combat-battles", { signal }),

  detail: (slug: string, signal?: AbortSignal) =>
    request<BattleDetail>(`/api/combat-battles/${encodeURIComponent(slug)}`, { signal }),

  result: (slug: string, signal?: AbortSignal) =>
    request<BattleResultResponse>(
      `/api/combat-battles/${encodeURIComponent(slug)}/result`, { signal }),

  predictionSummary: (slug: string, signal?: AbortSignal) =>
    request<{ prediction_summary: PredictionSummary }>(
      `/api/combat-battles/${encodeURIComponent(slug)}/prediction-summary`, { signal }),

  myPrediction: (slug: string, signal?: AbortSignal) =>
    request<{ my_prediction: MyPrediction; my_prediction_result: unknown }>(
      `/api/combat-battles/${encodeURIComponent(slug)}/prediction`, { signal }),

  settlementSummary: (slug: string, signal?: AbortSignal) =>
    request<{ settlement_summary: SettlementSummary }>(
      `/api/combat-battles/${encodeURIComponent(slug)}/settlement-summary`, { signal }),

  submitPrediction: (slug: string, predicted_side: Side, clientRequestId?: string) =>
    request<PredictionResponse>(
      `/api/combat-battles/${encodeURIComponent(slug)}/prediction`,
      {
        method: "PUT",
        body: JSON.stringify({ predicted_side, client_request_id: clientRequestId ?? null }),
      }),

  myArenaScore: (signal?: AbortSignal) =>
    request<ArenaScore>("/api/combat-battles/arena-score/me", { signal }),
};

// --------------------------------------------------------------------------- //
// Admin (server derives all authoritative values — no winner/score/user input)
// --------------------------------------------------------------------------- //
export type CreateBattleBody = {
  title: string;
  description?: string;
  healing_enabled?: boolean;
  left: unknown;
  right: unknown;
  slug?: string;
};

export const battlesAdminApi = {
  list: (signal?: AbortSignal) =>
    request<{ battles: AdminBattle[] }>("/api/admin/combat-battles", { admin: true, signal }),

  get: (id: string, signal?: AbortSignal) =>
    request<AdminBattle>(`/api/admin/combat-battles/${id}`, { admin: true, signal }),

  create: (body: CreateBattleBody) =>
    request<AdminBattle>("/api/admin/combat-battles", {
      admin: true, method: "POST", body: JSON.stringify(body),
    }),

  update: (id: string, body: Partial<CreateBattleBody>) =>
    request<AdminBattle>(`/api/admin/combat-battles/${id}`, {
      admin: true, method: "PUT", body: JSON.stringify(body),
    }),

  validate: (id: string) =>
    request<{ battle_id: string; status: string; report: AdminValidationReport }>(
      `/api/admin/combat-battles/${id}/validate`, { admin: true, method: "POST" }),

  publish: (id: string, times: { open_at: string; lock_at: string; reveal_at: string }) =>
    request<AdminBattle>(`/api/admin/combat-battles/${id}/publish`, {
      admin: true, method: "POST", body: JSON.stringify(times),
    }),

  void: (id: string, reason: string) =>
    request<AdminBattle>(`/api/admin/combat-battles/${id}/void`, {
      admin: true, method: "POST", body: JSON.stringify({ reason }),
    }),

  reproduce: (id: string) =>
    request<Record<string, unknown>>(`/api/admin/combat-battles/${id}/reproduce`, {
      admin: true, method: "POST",
    }),

  settle: (id: string) =>
    request<SettlementSummary & { already_settled?: boolean }>(
      `/api/admin/combat-battles/${id}/settle`, { admin: true, method: "POST" }),

  settlement: (id: string, signal?: AbortSignal) =>
    request<AdminSettlementAudit>(`/api/admin/combat-battles/${id}/settlement`, {
      admin: true, signal,
    }),
};
