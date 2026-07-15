// ---------------------------------------------------------------------------
// Frontend types for the Ranked Duel candidate-review workflow.
//
// These MIRROR the committed backend review model in the League Combat
// Simulator repo (`ranked_candidate_review/` — store.py / validator.py /
// canonical.py / loader.py), which today is CLI-only. They are the frontend
// half of a boundary whose HTTP endpoints DO NOT EXIST YET; see CONTRACT.md.
//
// This is deliberately a SEPARATE data model from the normal quiz lifecycle
// (`quiz_builder_drafts`, `quiz_questions`, packs). The unified admin
// workspace shares presentation, never storage.
// ---------------------------------------------------------------------------

/** review_schema_version the frontend is written against (backend: "1.0.0"). */
export const RANKED_REVIEW_SCHEMA_VERSION = "1.0.0";

/** Stored decisions (store.DECISIONS minus the "unreviewed" seed value). */
export type RankedReviewDecision = "accepted" | "revised" | "rejected";

/**
 * Status as DERIVED by the backend at read time (store.derived_status):
 * the stored decision, or a computed state when the source moved on. The
 * frontend never computes these — it renders whatever the backend derived.
 */
export type RankedReviewStatus =
  | "unreviewed"
  | "accepted"
  | "revised"
  | "rejected"
  | "stale_source_changed"
  | "orphaned";

/** A candidate answer (validator: correct_answer is {type, value}). */
export interface RankedCandidateAnswer {
  type: string;
  value: string | number | null;
}

/**
 * One source candidate. Field set follows loader REQUIRED_FIELDS + canonical
 * identity. Extra provenance/metadata fields are tolerated (additive) and
 * surfaced generically in the evidence view.
 */
export interface RankedDuelCandidate {
  /** canonical.candidate_id — "family:seed:formula". Stable identity. */
  candidate_id: string;
  family: string;
  question_text: string;
  options: string[];
  correct_answer: RankedCandidateAnswer;
  seed?: string | number | null;
  /** Additive provenance/evidence fields (scenario, inputs, difficulty, …). */
  metadata?: Record<string, unknown>;
  [extra: string]: unknown;
}

/** One append-only history entry (store.apply_decision entry shape). */
export interface RankedReviewHistoryEntry {
  decision: RankedReviewDecision;
  reviewer: string;
  reviewed_at: string;
  notes: string;
}

/** Backend validator output for a revised candidate (validate_revision). */
export interface RankedReviewValidation {
  ok: boolean;
  errors: string[];
}

/** The stored review record for one candidate (store.record shape). */
export interface RankedReviewRecord {
  review_schema_version: string;
  candidate_id: string;
  source_hash: string | null;
  decision: RankedReviewDecision | "unreviewed";
  reviewer: string | null;
  reviewed_at: string | null;
  notes: string;
  revised_candidate: RankedDuelCandidate | null;
  validation: RankedReviewValidation | null;
  history: RankedReviewHistoryEntry[];
}

/** A candidate joined with its current derived review status, for the list. */
export interface RankedDuelReviewItem {
  candidate: RankedDuelCandidate;
  /** Current source hash of this candidate (canonical.candidate_hash). */
  source_hash: string;
  status: RankedReviewStatus;
  record: RankedReviewRecord | null;
}

export interface RankedDuelReviewListResponse {
  ok: boolean;
  items: RankedDuelReviewItem[];
  total: number;
}

/** Aggregate progress counts, one per derived status. */
export interface RankedDuelReviewProgress {
  ok: boolean;
  total: number;
  counts: Record<RankedReviewStatus, number>;
}

/**
 * A review decision the reviewer is submitting. `expected_source_hash` carries
 * the hash the UI last saw so the BACKEND can reject a stale write
 * (concurrent-modification detection — store.save); the frontend never writes
 * the review file itself.
 */
export interface RankedDuelDecisionRequest {
  decision: RankedReviewDecision;
  reviewer: string;
  notes: string;
  /** Required by the backend when decision === "revised". */
  revised_candidate?: RankedDuelCandidate;
  expected_source_hash: string;
}

export interface RankedDuelDecisionResponse {
  ok: boolean;
  record: RankedReviewRecord;
}

/** Result of validating/exporting the accepted bank (backend-owned write). */
export interface RankedDuelExportResponse {
  ok: boolean;
  /** Number of accepted candidates written to the export. */
  accepted_count: number;
  /** Path the backend wrote (reports/ranked_candidates_accepted.json). */
  export_path: string;
  /** Blocking validation errors that prevented/qualified the export. */
  errors: string[];
}

export interface RankedDuelReviewListParams {
  status?: RankedReviewStatus;
  scope?: string;
  limit?: number;
  offset?: number;
}
