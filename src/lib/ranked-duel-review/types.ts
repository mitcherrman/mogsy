// ---------------------------------------------------------------------------
// Frontend types for the Ranked Duel candidate-review admin API.
//
// These mirror the LIVE, audited backend contract
// (`ranked_candidate_review/ADMIN_API_CONTRACT.md`, endpoints under
// `/api/admin/ranked-duel/questions`). The service is the single source of
// truth; the frontend only reads what the UI consumes and tolerates unknown
// additive fields.
//
// SEPARATE storage model from the normal quiz lifecycle — this never touches
// quiz_builder_drafts / quiz_questions / packs. Correct answers/indices appear
// ONLY in candidate detail (admin-only), never in list summaries.
// ---------------------------------------------------------------------------

/** Stored review decision (before staleness is derived). */
export type ReviewDecision = "unreviewed" | "accepted" | "revised" | "rejected";

/** Status derived by the backend (decision + staleness/orphan computation). */
export type DerivedStatus =
  | "unreviewed"
  | "accepted"
  | "revised"
  | "rejected"
  | "stale_source_changed"
  | "orphaned";

/** Fields a revision patch may edit (ADMIN_API_CONTRACT §3). Nothing else. */
export const EDITABLE_REVISION_FIELDS = [
  "question_text",
  "options",
  "correct_answer",
  "difficulty_target",
  "distractor_derivations",
  "review_note",
] as const;

/** Correct-index distribution, JSON-keyed "0".."3". */
export type IndexDistribution = Record<string, number>;

export interface ReviewStatus {
  total_source_candidates: number;
  unreviewed: number;
  accepted: number;
  revised: number;
  rejected: number;
  stale_source_changed: number;
  invalid_revised_records: number;
  exportable: number;
  orphaned_review_records: number;
  orphaned_ids: string[];
  counts_by_family: Record<string, Record<string, number>>;
  accepted_correct_index_distribution: IndexDistribution;
  minimum_required_count: number;
  all_indices_represented: boolean;
  distribution_warning: boolean;
  distribution_warning_detail: string | null;
  structural_validation_ok: boolean;
  structural_problems: string[];
  external_alpha_ready: boolean;
  external_alpha_blockers: string[];
}

/** One candidate summary row — deliberately WITHOUT any correct answer/index. */
export interface CandidateSummary {
  candidate_id: string;
  family: string | null;
  difficulty: string | null;
  prompt_summary: string;
  decision: ReviewDecision;
  derived_status: DerivedStatus;
  stale: boolean;
  exportable: boolean;
  source_hash: string;
  reviewed_at: string | null;
  reviewer: string | null;
}

export interface ReviewRecordView {
  decision: ReviewDecision;
  reviewer: string | null;
  reviewed_at: string | null;
  notes: string;
  revised_candidate: Record<string, unknown> | null;
  source_hash: string | null;
  history: Array<Record<string, unknown>>;
}

/** Full admin detail — the ONLY place the correct answer/index is exposed. */
export interface CandidateDetail {
  candidate_id: string;
  source_hash: string;
  candidate_version: string | number | null;
  family: string | null;
  difficulty_target: string | null;
  difficulty_features: unknown;
  question_text: string | null;
  options: string[];
  correct_answer: string | number | null;
  correct_answer_index: number | null;
  scenario: unknown;
  formula_id: string | null;
  inputs: unknown;
  calculation_steps: unknown;
  distractor_derivations: unknown;
  data_version: string | number | null;
  plausibility_validation: unknown;
  generation_safety: unknown;
  derived_status: DerivedStatus;
  review: ReviewRecordView;
  validation_warnings: string[];
}

/** Result of an accept/reject/revise mutation. */
export interface DecisionResult {
  candidate_id: string;
  decision: ReviewDecision;
  reviewer: string;
  reviewed_at: string;
  notes: string;
  source_hash: string;
}

export interface ValidateReport {
  source_candidates: number;
  review_records: number;
  stale: number;
  stale_ids: string[];
  problems: string[];
  structural_valid: boolean;
  export: {
    present?: boolean;
    status?: string;
    accepted_count?: number;
    alpha_ready?: boolean;
    correct_index_distribution?: IndexDistribution;
    diagnostics?: unknown;
    [k: string]: unknown;
  };
  external_alpha_ready: boolean;
}

export interface ExportResult {
  export_path: string;
  counts: {
    exported: number;
    accepted: number;
    revised: number;
    source_total: number;
  };
  excluded: {
    unreviewed?: number;
    rejected?: number;
    stale?: number;
    invalid_revised?: number;
    [k: string]: number | undefined;
  };
}

export interface CandidateListParams {
  decision?: ReviewDecision;
  family?: string;
  difficulty?: string;
  stale?: boolean;
  exportable?: boolean;
  search?: string;
}

/** Editable-only patch for a revision (extra keys are rejected by backend). */
export interface RevisionPatch {
  question_text?: string;
  options?: string[];
  correct_answer?: unknown;
  difficulty_target?: string;
  distractor_derivations?: unknown;
  review_note?: string;
}

export interface AcceptBody {
  source_hash: string;
  reviewer: string;
  notes?: string;
  overwrite?: boolean;
}
export interface RejectBody {
  source_hash: string;
  reviewer: string;
  reason: string;
  notes?: string;
  overwrite?: boolean;
}
export interface ReviseBody {
  source_hash: string;
  reviewer: string;
  patch: RevisionPatch;
  notes?: string;
  overwrite?: boolean;
}
