// ---------------------------------------------------------------------------
// Admin Ranked Builder client.
//
// Three backend endpoints, all behind the same require_admin the rest of the
// admin clients use, reached through the shared buildAdminHeaders() path:
//
//   GET /api/ranked/admin/module-catalog          what may be offered
//   GET /api/ranked/admin/format-config/{target}  the saved config + fallback
//   PUT /api/ranked/admin/format-config/{target}  save it
//
// This module carries NO validation rules. Which pools exist, which families
// exist, which module versions may be used, what a legal timer is — all of it
// lives in the backend's Ranked format schema, and a second copy here would be
// a second answer that can disagree with the one the match snapshot is
// actually read back through. What this file does instead is carry the
// backend's REFUSAL back to the screen intact.
// ---------------------------------------------------------------------------

import { ADMIN_API_BASE_URL, buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";

/** The two independently saved configuration targets. */
export const CONFIG_TARGETS = ["admin_bot", "public"] as const;
export type ConfigTarget = (typeof CONFIG_TARGETS)[number];

export const TARGET_LABELS: Record<ConfigTarget, string> = {
  admin_bot: "Admin Bot Ranked",
  public: "Public Ranked",
};

// --- format shapes ---------------------------------------------------------
//
// Deliberately permissive. The builder edits a few named fields and must carry
// everything else through untouched, so an unknown key is normal rather than
// an error: a format may legitimately contain fields this build does not know
// about, and dropping one on save would silently change what players receive.

export interface SegmentSpecJson {
  module_id: string;
  module_version: number;
  [key: string]: unknown;
}

export interface RankedFormatJson {
  format_id: string;
  format_version: number;
  status: string;
  segment_pattern: SegmentSpecJson[];
  [key: string]: unknown;
}

// --- catalog ---------------------------------------------------------------

export type CatalogFieldType = "enum" | "multi_enum" | "number" | "integer" | "text";

export interface CatalogOption {
  value: string;
  label: string;
  // Optional per-option metadata. Today only the Mastery module's
  // `module_config.mastery_set_id` options carry it, as a soft ceiling on
  // that set's `challenge_count` — presentational only, so it is typed
  // optional and every reader must handle its absence.
  max_questions?: number;
}

export interface CatalogField {
  key: string;
  label: string;
  type: CatalogFieldType;
  required: boolean;
  options?: CatalogOption[];
  help?: string;
  min?: number;
  min_items?: number;
}

export interface CatalogModule {
  module_id: string;
  module_version: number;
  label: string;
  description: string;
  defaults: SegmentSpecJson;
  fields: CatalogField[];
  fixed?: Record<string, unknown>;
}

export interface ModuleCatalog {
  schema_version: string;
  modules: CatalogModule[];
  cycle_note: string;
}

// --- config ----------------------------------------------------------------

export interface FormatConfigView {
  schema_version: string;
  target: ConfigTarget;
  targets: string[];
  revision: number | null;
  config: RankedFormatJson | null;
  saved_by: string | null;
  saved_at: string | null;
  fallback: RankedFormatJson | null;
  fallback_unavailable: { code: string; message: string } | null;
  consumed_by_match_creation: boolean;
}

export interface SavedConfig {
  target: ConfigTarget;
  revision: number;
  format: RankedFormatJson;
  saved_by: string | null;
  saved_at: string | null;
}

/**
 * A backend refusal, with its own error CODE preserved.
 *
 * The code matters because the page treats one of them specially:
 * RANKED_STORED_CONFIG_INVALID means the lane is currently refusing to create
 * matches, which is an operational state an admin must be told about plainly —
 * not a form error to swallow.
 */
export class RankedFormatApiError extends Error {
  readonly status: number | null;
  readonly code: string | null;

  constructor(message: string, status: number | null, code: string | null = null) {
    super(message);
    this.name = "RankedFormatApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${ADMIN_API_BASE_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        ...(await buildAdminHeaders(url)),
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch {
    throw new RankedFormatApiError("Could not reach the admin backend.", null);
  }

  // Read the body before branching on status: the backend's typed errors carry
  // their reason in detail.message, and a generic "Backend returned 422" would
  // throw away the one sentence that says what is actually wrong.
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (res.ok) {
    if (body === null) {
      throw new RankedFormatApiError(
        "Backend returned a response this page could not read.",
        res.status,
      );
    }
    return body as T;
  }

  const detail = (body as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === "object") {
    const { code, message } = detail as { code?: string; message?: string };
    if (message) {
      throw new RankedFormatApiError(message, res.status, code ?? null);
    }
  }
  if (typeof detail === "string") {
    throw new RankedFormatApiError(detail, res.status, null);
  }
  if (res.status === 401 || res.status === 403) {
    throw new RankedFormatApiError(
      "The backend refused this request. Backend admin access is a separate authority from your Supabase role.",
      res.status,
    );
  }
  throw new RankedFormatApiError(`Backend returned ${res.status}.`, res.status);
}

export const fetchModuleCatalog = () =>
  request<ModuleCatalog>("/api/ranked/admin/module-catalog");

export const fetchFormatConfig = (target: ConfigTarget) =>
  request<FormatConfigView>(`/api/ranked/admin/format-config/${target}`);

export const saveFormatConfig = (target: ConfigTarget, format: RankedFormatJson) =>
  request<SavedConfig>(`/api/ranked/admin/format-config/${target}`, {
    method: "PUT",
    body: JSON.stringify({ format }),
  });
