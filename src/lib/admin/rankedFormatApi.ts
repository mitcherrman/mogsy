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
  // Optional per-option metadata, kept for older catalogs that still publish
  // it. On-demand Mastery has no static ceiling to publish (availability is
  // resolved live at save time), so nothing sends this today for the Mastery
  // module itself — but other modules' set/variant options may still carry it
  // as a soft ceiling on that option's `challenge_count`, presentational only.
  // Optional and every reader must handle its absence; the backend schema
  // remains the authority on the real bound.
  max_questions?: number;
  /** Optional per-option explanation, shown on hover. */
  help?: string;
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
  /**
   * Another field in the same segment whose value CHOOSES this field's
   * options. Present, `options_by` is keyed by that field's value and
   * `options` is unused.
   *
   * Generic, not a Mastery special case: any field whose choices depend on
   * another field declares this, and the renderer needs to know nothing about
   * either field. A parent value with no entry in `options_by` means the
   * capability does not exist for that selection, and the control is not
   * rendered at all — an absent control rather than an empty one.
   */
  depends_on?: string;
  options_by?: Record<string, CatalogOption[]>;
  // Show this field only while every named field already holds the given
  // value. The backend publishes it for tagged-union configs — Mastery's
  // champion fields depend on `module_config.mastery_mode` — so the form
  // shows only the fields the selected mode actually uses. A display rule,
  // never a validation one: the backend independently refuses a config
  // carrying fields from the wrong branch.
  visible_when?: Record<string, string>;
}

/**
 * One runtime Mastery Set's DECLARED generation capabilities, plus its live
 * publication/readiness state.
 *
 * Read verbatim from the backend catalog. The admin screen renders what a set
 * says it supports and nothing else, so a future runtime set becomes
 * configurable here by being registered on the backend rather than by a change
 * to this repo.
 */
export interface MasterySetVariant {
  variant_id: string;
  label: string;
  description: string;
  max_questions: number;
}

export interface MasterySetReadiness {
  state: "ready" | "blocked" | "error";
  detail: string;
  available_steps?: number;
  available_variants?: Record<string, number>;
}

export interface MasterySetCapability {
  set_id: string;
  display_name: string;
  description: string;
  display_revision: string;
  max_questions: number;
  variants: MasterySetVariant[];
  supports_variant_weighting: boolean;
  supports_difficulty: boolean;
  /** Present only when the backend probed liveness for this request. */
  readiness?: MasterySetReadiness;
}

export interface CatalogModule {
  module_id: string;
  module_version: number;
  label: string;
  description: string;
  defaults: SegmentSpecJson;
  fields: CatalogField[];
  fixed?: Record<string, unknown>;
  /** Runtime-generation capabilities, on the modules that have them. */
  mastery_sets?: MasterySetCapability[];
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

// --- runtime generation preview -------------------------------------------

/**
 * A SAMPLE of what a generation policy currently produces.
 *
 * Generated by the backend on request, from the real generation path, and
 * stored nowhere — see `ranked_public/mastery_preview.py`. Nothing in this
 * repo computes, renders or fabricates any part of it, which is why the whole
 * shape is read verbatim rather than adapted.
 */
export interface MasterySlicePreviewChallenge {
  challenge_index: number;
  interaction_kind: string;
  question_family: string;
  prompt: string;
  answer_type: string;
  answer_options: string[];
  correct_answer: string | number | boolean | null;
  explanation: string | null;
}

export interface MasterySlicePreview {
  schema_version: string;
  is_sample: boolean;
  note: string;
  mastery_set_id: string;
  prompt: string;
  challenge_count: number;
  module_config: Record<string, unknown>;
  challenges: MasterySlicePreviewChallenge[];
}

export const previewMasterySlice = (
  moduleConfig: Record<string, unknown>, challengeCount: number,
) =>
  request<MasterySlicePreview>("/api/ranked/admin/mastery-slice/preview", {
    method: "POST",
    body: JSON.stringify({
      module_config: moduleConfig,
      challenge_count: challengeCount,
    }),
  });

export const saveFormatConfig = (target: ConfigTarget, format: RankedFormatJson) =>
  request<SavedConfig>(`/api/ranked/admin/format-config/${target}`, {
    method: "PUT",
    body: JSON.stringify({ format }),
  });
