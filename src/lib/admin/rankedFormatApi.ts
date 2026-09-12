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
// The catalog used to carry a `mastery_sets` block: the declared
// capabilities of a closed registry of prebuilt Mastery sets a slot could
// name (their step ceiling, their scenario variants, their live readiness).
// Those sets were hardcoded parameterizations of the Mastery generators and
// were deleted, so the block and its types went with them. A Mastery slot now
// names a GENERATOR and its subject, described by ordinary catalog fields
// like every other module's.

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
  // The structural semantics the Mastery interaction renderers draw from, and
  // the server-authored presentation metadata the media band reads. Present on
  // the wire since long before the Generator Lab — the preview copies the
  // public challenge verbatim — and typed here now because the Lab renders a
  // sample through the REAL renderers rather than as text, and those need
  // exactly these fields.
  prompt_semantics?: Record<string, unknown> | null;
  comparison_semantics?: Record<string, unknown> | null;
  presentation?: Record<string, unknown> | null;
}

/**
 * What a generated slice WAS, as the segment would have frozen it.
 *
 * The backend's served-artifact block (`mastery/serving/artifact.py`), through
 * that module's own redaction. Read verbatim: nothing here is derived,
 * relabelled or defaulted, because the whole value of a provenance panel is
 * that it reports the backend's own answer.
 *
 * `null` is a legitimate value and means the generator stamped no block —
 * "absent means unknown", the same compatibility rule every other reader of
 * this block follows.
 */
export interface MasteryGeneratedArtifact {
  artifact_schema_version: number | null;
  generator_type: string | null;
  generator_version: string | null;
  generator_config: Record<string, unknown>;
  subject_key: string | null;
  artifact_instance_id: string | null;
  mastery_set_id: string | null;
  artifact_digest: string | null;
  patch_display: string | null;
  patch_key_digest: string | null;
  is_prototype: boolean | null;
}

export interface MasterySlicePreview {
  schema_version: string;
  is_sample: boolean;
  note: string;
  mastery_set_id: string;
  prompt: string;
  challenge_count: number;
  module_config: Record<string, unknown>;
  /** The seed the caller sent back, verbatim. `null` when none was sent. */
  seed?: string | null;
  /**
   * The salt the generator was ACTUALLY run with, derived server-side from the
   * seed. Echoed rather than recomputed here: a second derivation in this repo
   * would agree today and drift the first time the backend's changed, and the
   * screen would then be telling an operator how to reproduce something with
   * the wrong number.
   */
  selection_salt?: string | null;
  mastery_artifact?: MasteryGeneratedArtifact | null;
  challenges: MasterySlicePreviewChallenge[];
}

/** One family of the subject's candidate pool, and how deep it is. */
export interface MasteryCoverageFamily {
  family: string;
  count: number;
}

/**
 * How much a generator could produce for a subject — a COUNT, never content.
 *
 * The question asked BEFORE choosing a question count, which a preview cannot
 * answer because it reports a ceiling only by hitting it. Fields beyond
 * `total_candidates` / `families` are per-generator and optional: a matchup
 * splits its universe, an applied chain states its certification, and a
 * champion has neither.
 */
export interface MasteryGeneratorCoverage {
  coverage_schema_version: number;
  generator_type: string;
  subject_ids: string[];
  total_candidates: number;
  families: MasteryCoverageFamily[];
  comparison_families: MasteryCoverageFamily[];
  note: string;
  comparison_candidates?: number;
  atomic_candidates?: number;
  ability_key?: string;
  certified?: boolean;
  certified_attacker_abilities?: { champion_id: string; ability_key: string }[];
  certified_target_ids?: string[];
}

export interface MasterySliceCoverageView {
  schema_version: string;
  subject_key: string;
  subject_label: string;
  min_challenge_count: number;
  coverage: MasteryGeneratorCoverage;
}

export const previewMasterySlice = (
  moduleConfig: Record<string, unknown>, challengeCount: number,
  seed?: string | null,
) =>
  request<MasterySlicePreview>("/api/ranked/admin/mastery-slice/preview", {
    method: "POST",
    body: JSON.stringify({
      module_config: moduleConfig,
      challenge_count: challengeCount,
      // Omitted rather than sent as null when there is none, so a caller that
      // never learned about seeds (the Builder's own preview panel) sends the
      // byte-identical body it always sent and gets the byte-identical sample.
      ...(seed ? { seed } : {}),
    }),
  });

export const fetchMasterySliceCoverage = (moduleConfig: Record<string, unknown>) =>
  request<MasterySliceCoverageView>("/api/ranked/admin/mastery-slice/coverage", {
    method: "POST",
    body: JSON.stringify({ module_config: moduleConfig }),
  });

export const saveFormatConfig = (target: ConfigTarget, format: RankedFormatJson) =>
  request<SavedConfig>(`/api/ranked/admin/format-config/${target}`, {
    method: "PUT",
    body: JSON.stringify({ format }),
  });
