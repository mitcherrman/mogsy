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

/* ────────────────────────────────────────────────────────────────────────
   Patch Analytics (GET /patch-analytics)

   Everything is nullable / optional. The frontend does NOT compute or
   derive fields — if the backend returns `null` (or omits a key), the UI
   renders an "awaiting backend" / "no data" placeholder.
   ──────────────────────────────────────────────────────────────────────── */

export interface AnalyticsHero {
  champions_changed?: number | null;
  values_changed?: number | null;
  properties_changed?: number | null;
  buff_count?: number | null;
  nerf_count?: number | null;
  pending_changes?: number | null;
  approved_changes?: number | null;
  /** 0..1 fraction of the champion pool with tracked changes. */
  champion_coverage?: number | null;
}

export interface AnalyticsRankingEntry {
  champion?: string | null;
  ability_key?: string | null;
  property?: string | null;
  detail?: string | null;
  value?: number | string | null;
}

export interface AnalyticsRankings {
  most_changed_champion?: AnalyticsRankingEntry | null;
  biggest_buff?: AnalyticsRankingEntry | null;
  biggest_nerf?: AnalyticsRankingEntry | null;
  largest_cooldown_reduction?: AnalyticsRankingEntry | null;
  largest_mana_increase?: AnalyticsRankingEntry | null;
  largest_percentage_increase?: AnalyticsRankingEntry | null;
  largest_percentage_decrease?: AnalyticsRankingEntry | null;
  [k: string]: AnalyticsRankingEntry | null | undefined;
}

export interface AnalyticsPropertyBreakdown {
  count?: number | null;
  largest_delta?: number | string | null;
  largest_pct?: number | string | null;
  top_champion?: string | null;
  buff_count?: number | null;
  nerf_count?: number | null;
}

export interface AnalyticsChampionChange {
  rank?: number | null;
  ability_key?: string | null;
  property?: string | null;
  old_value?: number | string | null;
  new_value?: number | string | null;
  delta?: number | null;
  delta_pct?: number | null;
  severity?: Severity | null;
}

export interface AnalyticsChampion {
  champion: string;
  values_changed?: number | null;
  properties_changed?: number | null;
  buff_count?: number | null;
  nerf_count?: number | null;
  max_severity?: Severity | null;
  net_change_score?: number | null;
  changes?: AnalyticsChampionChange[] | null;
}

export interface AnalyticsKnowledge {
  /** All values are 0..1 fractions if present. */
  coverage?: number | null;
  approved?: number | null;
  pending?: number | null;
  parser_gaps?: number | null;
  consensus?: number | null;
  confidence?: number | null;
  health?: number | null;
}

export interface PatchAnalyticsResponse {
  patch_version?: string | null;
  hero?: AnalyticsHero | null;
  rankings?: AnalyticsRankings | null;
  property_breakdown?: Record<string, AnalyticsPropertyBreakdown | null> | null;
  champions?: AnalyticsChampion[] | null;
  knowledge?: AnalyticsKnowledge | null;
  [k: string]: unknown;
}

/* ────────────────────────────────────────────────────────────────────────
   Patch Intelligence (GET /patch-intelligence)

   Deterministic analysis owned entirely by the backend. All fields are
   nullable / optional. The frontend never derives, calculates, or
   invents values — missing keys render as "awaiting backend" states.
   ──────────────────────────────────────────────────────────────────────── */

export interface PatchScore {
  /** 0..100 integer score. */
  score?: number | null;
  classification?: string | null;
  explanation?: string | null;
}

export interface ExecutiveSummaryInput {
  primary_theme?: string | null;
  secondary_theme?: string | null;
  largest_buff?: string | null;
  largest_nerf?: string | null;
  patch_classification?: string | null;
  champions_changed?: number | null;
  values_changed?: number | null;
  buff_count?: number | null;
  nerf_count?: number | null;
  [k: string]: unknown;
}

export interface InterestingFact {
  headline?: string | null;
  /** 0..1 confidence fraction. */
  confidence?: number | null;
  evidence?: unknown;
  [k: string]: unknown;
}

export interface PatchInsight {
  title?: string | null;
  kind?: string | null;
  description?: string | null;
  available?: boolean | null;
  availability?: string | null;
  unavailable_reason?: string | null;
  evidence?: unknown;
  [k: string]: unknown;
}

export interface HeadlineSuggestion {
  headline?: string | null;
  kind?: string | null;
  [k: string]: unknown;
}

export interface PatchIntelligenceResponse {
  patch_version?: string | null;
  patch_score?: PatchScore | null;
  executive_summary_input?: ExecutiveSummaryInput | null;
  interesting_facts?: InterestingFact[] | null;
  insights?: PatchInsight[] | null;
  headline_suggestions?: HeadlineSuggestion[] | null;
  [k: string]: unknown;
}