/**
 * Thin fetch wrapper for the Mogsy Knowledge Admin API.
 * Base = VITE_COMBAT_API_URL + /api/admin/knowledge
 * Every request carries the X-Admin-Key header from sessionStorage.
 *
 * We only speak endpoints defined in docs/admin_ui_api_contract.md.
 * If a page needs data not covered by the contract, it must render an
 * explicit "backend endpoint pending" placeholder rather than invent one.
 */
import { buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";
import type {
  ApprovalResponse,
  HealthResponse,
  PatchRundownResponse,
  EditResponse,
  UpdateDetail,
  UpdatesListResponse,
  UndoResponse,
  PatchAnalyticsResponse,
  PatchIntelligenceResponse,
  GameplayImpactResponse,
  ApplyHistoryResponse,
  AutomationRunResponse,
  AutomationConfig,
  LedgerResponse,
  PatchReport,
} from "./types";

const BASE = `${(import.meta.env.VITE_COMBAT_API_URL || "").replace(/\/$/, "")}/api/admin/knowledge`;

export class KnowledgeApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail || `HTTP ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

type QueryValue = string | number | boolean | undefined | null;
type QueryLike = Record<string, QueryValue>;

async function request<T>(
  path: string,
  init: RequestInit & { query?: QueryLike } = {},
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  // Account-bound: current Supabase bearer by default; explicit fallback key
  // added only when active. Origin-guarded to the backend.
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(await buildAdminHeaders(url.toString()))) {
    headers.set(k, v);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url.toString(), { ...init, headers });
  const text = await res.text();
  let payload: unknown;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { detail: text }; }
  if (!res.ok) {
    const detail = (payload as { detail?: string } | null)?.detail ?? `HTTP ${res.status}`;
    throw new KnowledgeApiError(res.status, detail);
  }
  return payload as T;
}

export interface UpdatesQuery {
  champion?: string;
  property?: string;
  provider?: string;
  confidence_min?: number;
  change_type?: string;
  patch_version?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export const knowledgeApi = {
  listUpdates: (q: UpdatesQuery = {}) =>
    request<UpdatesListResponse>("/updates", { query: q as QueryLike }),

  getUpdate: (id: number) =>
    request<UpdateDetail>(`/updates/${id}`),

  approve: (id: number, opts: { dry_run: boolean; approved_by?: string }) =>
    request<ApprovalResponse>(`/updates/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(opts),
    }),

  approveProgression: (id: number, opts: { dry_run: boolean; approved_by?: string }) =>
    request<ApprovalResponse>(`/updates/${id}/approve-progression`, {
      method: "POST",
      body: JSON.stringify(opts),
    }),

  reject: (id: number, reason: string, rejectedBy?: string) =>
    request<{ status: string }>(`/updates/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(rejectedBy ? { reason, rejected_by: rejectedBy } : { reason }),
    }),

  /**
   * Correct Mogzy's interpreted value on a PENDING update before approval.
   * No production write occurs — the edited value still requires explicit
   * approval. The change is recorded in the append-only edit history and
   * the original parser evidence is preserved untouched.
   */
  editUpdate: (id: number, opts: { proposed_value: number; edited_by?: string; note?: string }) =>
    request<EditResponse>(`/updates/${id}/edit`, {
      method: "POST",
      body: JSON.stringify(opts),
    }),

  health: (q: { category?: string; champion?: string; health_below?: number } = {}) =>
    request<HealthResponse>("/health", { query: q as QueryLike }),

  patchRundown: (q: { patch_version?: string; champion?: string; include_consensus?: boolean } = {}) =>
    request<PatchRundownResponse>("/patch-rundown", { query: q as QueryLike }),

  /**
   * Patch Intelligence analytics. Backend owns all derivation; the UI
   * only reads. Fields may be null / omitted while the endpoint is still
   * being built out — the UI renders "awaiting backend" for those.
   */
  patchAnalytics: (q: { patch_version?: string; include_changes?: boolean } = {}) =>
    request<PatchAnalyticsResponse>("/patch-analytics", { query: q as QueryLike }),

  /**
   * Patch Intelligence — deterministic analysis (patch score, executive
   * summary, insights, headlines). All fields are backend-owned; the UI
   * only renders. Failures gracefully degrade to /patch-analytics +
   * /patch-rundown.
   */
  patchIntelligence: (q: { patch_version?: string } = {}) =>
    request<PatchIntelligenceResponse>("/patch-intelligence", { query: q as QueryLike }),

  /**
   * Gameplay Impact — deterministic gameplay-aware analytics
   * (simulation candidates, ability metrics, champion impacts). All
   * derivation happens server-side; the UI only renders returned fields.
   */
  gameplayImpact: (q: { patch_version?: string } = {}) =>
    request<GameplayImpactResponse>("/gameplay-impact", { query: q as QueryLike }),

  /**
   * Recently applied approvals (grouped per approval batch), newest first.
   * Read-only — powers the Review Queue "Approved Changes" side panel.
   * active=true → only undoable; active=false → only already-undone.
   */
  applyHistory: (q: { limit?: number; patch_version?: string; champion?: string; active?: boolean } = {}) =>
    request<ApplyHistoryResponse>("/apply-history", { query: q as QueryLike }),

  /**
   * Undo a previously-applied write. Backend enforces safety:
   * only restores the prior value if the current DB value still matches
   * the applied new value. Otherwise responds with a descriptive error
   * (surfaced verbatim in the UI).
   */
  /**
   * Patch automation (F3.2). Real writes require BOTH mode:"apply" here
   * AND KNOWLEDGE_AUTO_APPLY_ENABLED at backend deployment config — the
   * backend caps over-privileged requests to dry_run, never escalates.
   */
  runAutomation: (opts: { patch_version?: string; mode: "decision_only" | "dry_run" | "apply" }) =>
    request<AutomationRunResponse>("/automation/run", {
      method: "POST",
      body: JSON.stringify(opts),
    }),

  automationReport: (patchVersion: string) =>
    request<PatchReport>("/automation/report", { query: { patch_version: patchVersion } }),

  automationConfig: () =>
    request<AutomationConfig>("/automation/config"),

  /** Unified chronological ledger (newest first) over proposals, edits,
   *  applies, undos, and automation decisions. */
  ledger: (q: {
    patch_version?: string; champion?: string; property?: string;
    actor_type?: "automatic" | "manual"; event_type?: string; limit?: number;
  } = {}) =>
    request<LedgerResponse>("/ledger", { query: q as QueryLike }),

  undoApply: (historyId: number) =>
    request<UndoResponse>(`/apply-history/${historyId}/undo`, {
      method: "POST",
    }),

  /** Undo one STRUCTURAL apply (champion identity / ability creation /
   *  role tags). historyId comes from ApprovalResponse.history_id on a
   *  structural apply — distinct from numeric apply-history ids. Backend
   *  refuses (409) on drift or double-undo. */
  undoStructural: (historyId: number) =>
    request<UndoResponse>(`/structural-history/${historyId}/undo`, {
      method: "POST",
    }),
};

export const knowledgeApiBase = BASE;