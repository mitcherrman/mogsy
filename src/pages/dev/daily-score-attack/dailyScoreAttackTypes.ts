/**
 * Client types for the Daily Score Attack backend contracts (E1.4,
 * backend commit c771e736). Single-player only — deliberately parallel to,
 * and never importing, the Ranked two-player types/validators.
 */

export const TODAY_SCHEMA = "daily_score_attack.today.v1";
export const RUN_SCHEMA = "daily_score_attack.run.v1";
export const RESOLUTION_SCHEMA = "daily_score_attack.answer_resolution.v1";
export const RESULTS_SCHEMA = "daily_score_attack.results.v1";
export const HISTORY_SCHEMA = "daily_score_attack.history.v1";

export type DsaChoice = string | { label: string; image_path?: string };

export type DsaQuestion = {
  sequence: number;
  question_id: number;
  question_text: string;
  choices: DsaChoice[];
  difficulty_label: "easy" | "medium" | "hard";
  category: string | null;
  /** True when the question has media. The raw (answer-bearing) asset path is
   * never sent; media is fetched from the opaque, auth-scoped image_url. */
  has_image: boolean;
  image_url: string | null;
};

export type DsaRunStatus = "active" | "completed" | "expired";

export type DsaRun = {
  schema_version: typeof RUN_SCHEMA | typeof RESULTS_SCHEMA;
  run_id: string;
  official: boolean;
  status: DsaRunStatus;
  challenge_date: string;
  challenge_version: number;
  rules_version: number;
  started_at: string;
  expires_at: string;
  /** Server-computed remaining ms at response time (display seed only). */
  remaining_ms: number;
  total_score: number;
  combo: number;
  correct_count: number;
  incorrect_count: number;
  presented_count: number;
  answered_count: number;
  highest_combo: number;
  integrity_status: "ok" | "degraded";
  /** Active runs only. */
  sequence?: number;
  question?: DsaQuestion;
  /** Terminal runs only. */
  completion_reason?: "pool_exhausted" | "timer_expired";
  participated?: boolean;
  bonus_xp_awarded?: boolean;
  streak_awarded?: boolean;
  resumed?: boolean;
};

export type DsaResolution = {
  schema_version: typeof RESOLUTION_SCHEMA;
  run_id: string;
  sequence: number;
  is_correct: boolean;
  selected_index: number | null;
  correct_index: number;
  explanation: string | null;
  base_score: number;
  speed_bonus: number;
  multiplier: { num: number; den: number };
  combo_before: number;
  combo_after: number;
  awarded_score: number;
  already_resolved: boolean;
  conflicting_retry: boolean;
  run: DsaRun;
};

export type DsaBreakdownItem = {
  sequence: number;
  question_text: string;
  choices: DsaChoice[];
  category: string | null;
  difficulty_label: string;
  resolution_reason: "answered" | "run_expired";
  selected_index: number | null;
  correct_index: number;
  explanation: string | null;
  is_correct: boolean;
  base_score: number;
  speed_bonus: number;
  combo_after: number;
  awarded_score: number;
};

export type DsaResults = DsaRun & { breakdown: DsaBreakdownItem[] };

export type DsaToday = {
  schema_version: typeof TODAY_SCHEMA;
  enabled: boolean;
  challenge_date: string;
  challenge_version: number;
  rules_version: number;
  question_count: number;
  run_duration_seconds: number;
  seconds_until_reset: number;
  official_run: {
    run_id: string;
    status: DsaRunStatus;
    score: number;
    completed_at: string | null;
  } | null;
  auth_required_for_official: boolean;
  practice_available: boolean;
  /** Server-authoritative current daily streak (UTC). The backend /today
   * projection always emits this as a non-negative integer (0 when none),
   * so it is required, not optional. */
  daily_streak: number;
  /** Legacy Daily Challenge already completed (bonus paid) today; the DSA
   * official run stays playable but earns no second bonus or streak. */
  legacy_completed_today?: boolean;
};

export type DsaHistory = {
  schema_version: typeof HISTORY_SCHEMA;
  entries: Array<{
    challenge_date: string;
    score: number;
    correct_count: number;
    answered_count: number;
    highest_combo: number;
    completion_reason: string | null;
  }>;
  personal_best: { challenge_date: string; score: number } | null;
  daily_streak: number;
};

export type DsaErrorCode =
  | "FEATURE_DISABLED"
  | "AUTH_REQUIRED"
  | "ACCOUNT_REQUIRED"
  | "CHALLENGE_UNAVAILABLE"
  | "CHALLENGE_CORRUPT"
  | "NO_RUN"
  | "RUN_NOT_FOUND"
  | "OFFICIAL_REQUIRED_FIRST"
  | "OFFICIAL_RUN_ACTIVE"
  | "OFFICIAL_RUN_TERMINAL"
  | "RUN_EXPIRED"
  | "RUN_TERMINAL"
  | "RUN_ACTIVE"
  | "STALE_QUESTION"
  | "INVALID_OPTION"
  | "INTEGRITY_ERROR"
  | "NETWORK"
  | "MALFORMED_RESPONSE";

export function dsaChoiceLabel(choice: DsaChoice): string {
  return typeof choice === "string" ? choice : choice.label;
}
