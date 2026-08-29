import { COMBAT_API_BASE_URL } from "@/lib/combat-lab/api";

export type MogzyStatus =
  | "matches"
  | "applied"
  | "pending"
  | "mismatch"
  | "unresolved"
  | "needs_interpretation"
  | "not_represented";

export type PatchEntityType = "champion" | "item" | "rune" | "system";

export type PatchEditorialDirection = "buff" | "nerf" | "adjustment";

/**
 * Backend editorial-direction provenance, in authority order:
 * riot_section > riot_text_semantic > riot_patch_highlights > mogzy_inferred.
 * ("none" means the backend has no claim; the payload then carries a null
 * source rather than the literal string.)
 */
export type PatchEditorialSource =
  | "riot_section"
  | "riot_text_semantic"
  | "riot_patch_highlights"
  | "mogzy_inferred";

export type PatchNumericDirection =
  | "positive"
  | "negative"
  | "mixed"
  | "neutral"
  | "non_numeric";

export type HistoricalClassification =
  | "exact_revert"
  | "partial_revert"
  | "over_revert"
  | "return_to_historical_state"
  | "no_historical_match"
  | "mixed_or_incomparable";

export type HistoricalNormalizedValue = {
  kind: "integer" | "decimal" | "ratio" | "rank_array" | "ratio_array" | string;
  unit: string;
  values: string[];
};

export type HistoricalSourceSummary = {
  type: string;
  url: string | null;
  revision_id: string | null;
};

export type HistoricalReference = {
  candidate_id?: number | null;
  patch_version: string | null;
  before: HistoricalNormalizedValue | null;
  after: HistoricalNormalizedValue | null;
  source: HistoricalSourceSummary | null;
};

/**
 * Additive Step 2G contract. Every field remains optional so a partial rollout
 * or an older backend can never make the underlying Riot change unreadable.
 */
export type PatchHistoricalContext = {
  status: "analyzed" | "mismatch" | "unresolved" | "ineligible" | "unavailable" | string;
  reason?: string | null;
  lifecycle?: "preview" | "published" | "shipped" | "withdrawn_or_blocked" | string;
  lifecycle_state?: string | null;
  active?: boolean;
  hypothetical?: boolean;
  parameter_key?: string | null;
  normalized_before?: HistoricalNormalizedValue | null;
  normalized_after?: HistoricalNormalizedValue | null;
  verified_latest?: HistoricalNormalizedValue | null;
  before_matches?: boolean | null;
  classification?: HistoricalClassification | null;
  flags?: string[];
  patches_elapsed?: number | null;
  calendar_days_elapsed?: number | null;
  current_source?: { url?: string | null; parser_revision?: string | null } | null;
  reference?: HistoricalReference | null;
};

export type PatchReportChange = {
  group_title: string;
  ability_slot: string | null;
  ability_icon_url: string | null;
  property_name: string;
  change_kind: "numeric" | "mechanical";
  is_new: boolean;
  before_raw: string | null;
  after_raw: string | null;
  detail_text: string | null;
  mogzy_property: string | null;
  mogzy_current_raw: string | null;
  mogzy_status: MogzyStatus;
  proposal_id: number | null;
  proposal_status: string | null;
  historical_context?: PatchHistoricalContext | null;
};

export type PatchReportCard = {
  id: number;
  entity_type: PatchEntityType;
  entity_name: string;
  entity_slug: string | null;
  section_id: string;
  section_title: string;
  official_image_url: string | null;
  mogzy_image_path: string | null;
  mogzy_entity_ref: string | null;
  context_text: string | null;
  aggregate_status: MogzyStatus;
  /**
   * Backend-resolved editorial direction contract. Optional: payloads from
   * backends predating the authority system omit these fields entirely, and
   * consumers fall back to local numeric inference. When present, null means
   * "authoritatively unclassified" (e.g. bugfix-only), not "unknown".
   */
  editorial_direction?: PatchEditorialDirection | null;
  editorial_direction_source?: PatchEditorialSource | null;
  numeric_direction?: PatchNumericDirection | null;
  changes: PatchReportChange[];
};

export type PatchReportSummary = {
  patch_version: string;
  source_url: string;
  built_at: string;
  section_titles: string[];
  card_count: number;
  change_count: number;
  cards_by_type: Partial<Record<PatchEntityType, number>>;
  cards_by_status: Partial<Record<MogzyStatus, number>>;
};

export type PatchReportDetail = {
  patch_version: string;
  source_url: string;
  built_at: string;
  section_titles: string[];
  skipped_sections: string[];
  historical_context_summary?: unknown;
  cards: PatchReportCard[];
};

export function resolvePatchReportAsset(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${COMBAT_API_BASE_URL}/${path.replace(/^\/+/, "")}`;
}

export async function fetchPatchReports(): Promise<{ patches: PatchReportSummary[] }> {
  const res = await fetch(`${COMBAT_API_BASE_URL}/api/patch-reports`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Patch reports request failed (${res.status})`);
  return res.json();
}

export async function fetchPatchReport(version: string): Promise<PatchReportDetail> {
  const res = await fetch(
    `${COMBAT_API_BASE_URL}/api/patch-reports/${encodeURIComponent(version)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`Patch report ${version} request failed (${res.status})`);
  return res.json();
}
