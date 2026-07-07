/**
 * Type definitions mirroring docs/admin_ui_api_contract.md (Phase 10).
 * Additive evolution rules apply — unknown keys ignored, `null` means
 * "not derivable" and must render as absent (not as an error).
 */

export type Provider = "wiki" | "patch_notes";
export type UpdateStatus = "PENDING" | "APPROVED" | "REJECTED" | string;
export type ChangeType = "STAT_CHANGE" | "UNKNOWN_FIELD" | "NOT_SUPPORTED" | string;
export type Severity = "major" | "moderate" | "minor" | "unknown";
export type HealthCategory = "HEALTHY" | "NEEDS_REVIEW" | "CRITICAL" | "NO_DATA";
export type RecommendedAction =
  | "approve_progression"
  | "approve"
  | "verify_source"
  | "manual_review"
  | "none";
export type ConsensusClassification =
  | "CONSENSUS"
  | "DB_OUTDATED"
  | "PROVIDER_DISAGREEMENT"
  | "AMBIGUOUS"
  | "INSUFFICIENT_DATA";

export interface UpdateRow {
  id: number;
  entity_type: string;
  entity_name: string;
  ability_key: string | null;
  ability_name?: string | null;
  property: string;
  rank: number | null;
  current_value: number | string | null;
  proposed_value: number | string | null;
  change_type: ChangeType;
  status: UpdateStatus;
  provider: Provider;
  source_url: string | null;
  confidence: number;
  patch_version: string | null;
  created_at: string;

  // UI enrichments
  delta: number | null;
  delta_pct: number | null;
  severity: Severity;
  flags: string[];
  group_key: string;
}

export interface GroupRow {
  group_key: string;
  champion: string;
  ability_key: string | null;
  property: string;
  providers: Provider[];
  update_ids: number[];
  rank_count: number;
  confidence_min: number;
  has_patch_notes: boolean;
}

export interface UpdatesListResponse {
  total: number;
  limit: number;
  offset: number;
  updates: UpdateRow[];
  groups: GroupRow[];
}

export interface DiffEntry {
  rank: number;
  current: number | null;
  proposed: number | null;
  delta: number | null;
  delta_pct: number | null;
  changed: boolean;
  pending_update_id: number | null;
}

export interface ApplyHistoryEntry {
  id: number;
  proposed_update_id: number;
  rank: number | null;
  old_value: number | string | null;
  new_value: number | string | null;
  old_full_progression: string | null;
  new_full_progression: string | null;
  change_type: ChangeType;
  provider: Provider;
  patch_version: string | null;
  confidence: number;
  approved_by: string;
  applied_at: string;
  /** True if this apply can still be undone (backend-computed). */
  reversible?: boolean;
  /** ISO timestamp when this apply was previously undone. */
  undone_at?: string | null;
  undone_by?: string | null;
}

export interface UpdateDetail {
  champion: string;
  ability: { key: string | null; name: string | null };
  property: string;
  affected_ranks: number[];

  db_live_progression: (number | null)[];
  proposed_progression: (number | null)[];

  diff: DiffEntry[];

  providers: Provider[];
  confidence: number;
  confidence_breakdown: {
    parser_confidence: number;
    record_confidence: number;
    provider_weight: number;
    parser_name: string;
  };
  patch_version: string | null;
  source_url: string | null;

  raw_evidence: {
    raw_value: string | null;
    parsed_text: string | null;
    proposed_raw_value: string | null;
    proposed_full_progression: string | null;
  };
  grammar_type: string | null;

  consensus: {
    classification: ConsensusClassification;
    confidence: number;
    consensus_value: number | string | null;
  } | null;

  apply_history: ApplyHistoryEntry[];

  warnings: string[];
  recommended_action: RecommendedAction;

  update: UpdateRow & Record<string, unknown>;
  sibling_pending_ranks: {
    id: number;
    rank: number;
    current_value: number | string | null;
    proposed_value: number | string | null;
  }[];
  status?: UpdateStatus;
}

export interface HealthIssue {
  ability_key: string | null;
  property: string;
  change_type: ChangeType;
  patch_version: string | null;
  provider: Provider;
  rank_count: number;
  current_sample: number | string | null;
  proposed_sample: number | string | null;
}

export interface ChampionHealth {
  champion: string;
  health_score: number;
  health_category: HealthCategory;
  coverage_pct: number;
  confidence_avg: number;
  pending_review_count: number;
  stat_change_count: number;
  unknown_field_count: number;
  not_supported_count: number;
  properties_in_registry: number;
  properties_discovered: number;
  properties_verified: number;
  parser_gap: boolean;
  last_wiki_verification: string | null;
  last_patch_verification: string | null;
  last_successful_verification: string | null;
  last_provider: Provider | null;
  latest_patch_version_seen: string | null;
  issues: HealthIssue[];
}

export interface HealthResponse {
  count: number;
  summary: Record<HealthCategory, number>;
  champions: ChampionHealth[];
}

export interface RundownGroup {
  entity_name: string;
  ability_key: string | null;
  property: string;
  provider: Provider;
  status: UpdateStatus;
  patch_version: string | null;
  rank_count: number;
  confidence_min: number;
  confidence_max: number;
}

export interface ReviewCounts {
  pending: number;
  applied: number;
  rejected: number;
  total?: number;
}

export interface PatchRundownResponse {
  filters: { patch_version: string | null; champion: string | null };
  review_counts: ReviewCounts;
  groups: RundownGroup[];
  by_champion: Record<string, ReviewCounts>;
  by_property: Record<string, ReviewCounts>;
  by_provider: Record<string, ReviewCounts>;
  by_severity: Record<Severity, number>;
  consensus_counts?: {
    consensus: number;
    db_outdated: number;
    provider_disagreement: number;
    ambiguous: number;
    insufficient_data: number;
  };
}

export interface ApprovalPlan {
  old_full_progression?: string | null;
  new_full_progression?: string | null;
  rank_writes?: {
    rank: number;
    old_value: number | string | null;
    new_value: number | string | null;
  }[];
  [k: string]: unknown;
}

export interface ApprovalResponse {
  dry_run: boolean;
  plan: ApprovalPlan;
  applied?: boolean;
  new_full_progression?: string | null;
  /** Present on successful writes so the UI can offer Undo. */
  apply_history_id?: number | null;
  [k: string]: unknown;
}

export interface UndoResponse {
  undone: boolean;
  apply_history_id: number;
  restored_value?: number | string | null;
  restored_full_progression?: string | null;
  [k: string]: unknown;
}