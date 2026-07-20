// Combat Sim Battles — backend contract types (Phase 3A).
//
// These mirror the immutable, reveal-safe backend projections (Phases 1/2A/2B).
// The frontend NEVER derives a winner, outcome, score, or lifecycle transition
// on its own — every authoritative value here comes from the server.

export type BattleStatus =
  | "draft"
  | "validated"
  | "scheduled"
  | "open"
  | "locked"
  | "revealed"
  | "void";

/** Public lifecycle states a user can actually see (draft/validated are hidden). */
export type PublicBattleStatus = Exclude<BattleStatus, "draft" | "validated">;

export type Side = "left" | "right";
export type WinnerSide = "left" | "right" | "draw";
export type PredictionOutcome = "correct" | "incorrect" | "push" | "void";

export type BattleAction = {
  type: "active" | "basic_attack";
  slot: string | null;
  active_name: string | null;
};

export type BattleSideSummary = {
  champion: string;
  level: number;
  items: string[];
  runes: string[];
  ability_ranks: Record<string, number>;
  crit_mode: string;
  starting_hp: number | null;
  target_assumptions: Record<string, unknown>;
  action_count: number;
  actions: BattleAction[];
};

export type EngineMeta = {
  engine_version?: string;
  comparison_version?: string;
  data_version?: string;
  patch_version?: string;
  patch_version_known?: boolean;
};

// --- prediction / settlement read models ---------------------------------- //
export type PredictionSummary = {
  left_count: number;
  right_count: number;
  total_count: number;
  left_percent: number;
  right_percent: number;
};

export type MyPrediction = {
  predicted_side: Side;
  created_at: string;
  updated_at: string;
  revision: number;
} | null;

export type SettlementSummary = {
  status: "pending" | "completed" | "failed" | "void";
  winner_side?: WinnerSide | null;
  prediction_count: number;
  correct_count: number;
  incorrect_count: number;
  push_count: number;
  void_count: number;
  score_awarded_total: number;
  scoring_version: string;
  error_code?: string | null;
  completed_at?: string | null;
};

export type MyPredictionResult = {
  predicted_side: Side;
  winner_side: WinnerSide | null;
  outcome: PredictionOutcome;
  score_awarded: number;
  scoring_version: string;
  settled_at: string;
} | null;

// --- frozen combat result ------------------------------------------------- //
export type PerActionResult = {
  index: number;
  type: "active" | "basic_attack";
  slot: string | null;
  active_name: string | null;
  hp_before: number;
  executed: boolean;
  applied_hp_damage: number;
  hp_after: number;
  classification: string;
  formula_status: string | null;
  eligibility: string;
  state_used?: unknown;
  healing_applied?: number;
};

export type SequenceResult = {
  attacker_champion: string;
  defender_champion: string;
  requested_action_count: number;
  executed_action_count: number;
  skipped_action_count: number;
  reached_lethal: boolean;
  first_lethal_action_index: number | null;
  executed_actions_to_lethal: number | null;
  starting_target_hp: number;
  final_target_hp: number;
  target_max_hp: number;
  applied_hp_damage: number;
  applied_hp_damage_pct: number;
  healing_generated: number;
  healing_applied: number;
  per_action: PerActionResult[];
  warnings: string[];
  blocking_errors: string[];
  eligible: boolean;
  sequence_engine_version?: string;
  action_contract_version?: string;
};

export type ComparisonMetrics = {
  pct_tolerance: number;
  left: Record<string, unknown>;
  right: Record<string, unknown>;
};

export type FrozenResultPublic = {
  winner_side: WinnerSide;
  decision_reason: string;
  comparison_metrics: ComparisonMetrics;
  comparison_version: string;
  left_result: SequenceResult;
  right_result: SequenceResult;
  warnings: string[];
  result_checksum: string;
  generated_at: string;
};

// --- endpoint responses --------------------------------------------------- //
export type BattleListItem = {
  battle_id: string;
  slug: string;
  title: string;
  status: PublicBattleStatus;
  battle_format: string;
  open_at: string | null;
  lock_at: string | null;
  reveal_at: string | null;
  left_champion: string | null;
  right_champion: string | null;
};

export type BattleDetail = {
  battle_id: string;
  slug: string;
  title: string;
  description: string;
  status: PublicBattleStatus;
  battle_format: string;
  healing_enabled: boolean;
  open_at: string | null;
  lock_at: string | null;
  reveal_at: string | null;
  created_at: string;
  engine: EngineMeta;
  left: BattleSideSummary;
  right: BattleSideSummary;
  // present only when revealed:
  result?: FrozenResultPublic;
  // Phase 2A/2B additive fields:
  prediction_summary: PredictionSummary;
  my_prediction: MyPrediction;
  settlement_summary: SettlementSummary;
  my_prediction_result: MyPredictionResult;
  // present (non-null) only when the battle was voided — shown publicly so a
  // user who reaches a cancelled battle can see why:
  voided_at?: string | null;
  void_reason?: string | null;
};

export type BattleResultResponse = {
  slug: string;
  status: PublicBattleStatus;
  revealed: boolean;
  result?: FrozenResultPublic;
  reveal_at?: string | null;
  message?: string;
};

export type PredictionResponse = {
  battle_id: string;
  slug: string;
  predicted_side: Side;
  outcome: "created" | "changed" | "unchanged";
  revision: number;
  created_at: string;
  updated_at: string;
  status: string;
};

export type ArenaScore = {
  arena_score: number;
  correct_predictions: number;
  settled_predictions: number;
  scoring_version: string;
};

// --- admin projections ---------------------------------------------------- //
export type AdminBattle = {
  battle_id: string;
  slug: string;
  title: string;
  description: string;
  stored_status: BattleStatus;
  effective_status: BattleStatus;
  battle_format: string;
  healing_enabled: boolean;
  open_at: string | null;
  lock_at: string | null;
  reveal_at: string | null;
  left_snapshot: unknown;
  right_snapshot: unknown;
  engine_metadata: unknown;
  validation_report: unknown;
  frozen_result: FrozenResultPublic | null;
  winner_side: WinnerSide | null;
  decision_reason: string | null;
  input_checksum: string | null;
  result_checksum: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  prediction_summary?: PredictionSummary;
};

export type AdminValidationReport = {
  publishable: boolean;
  blocking_error_count: number;
  warning_count: number;
  issues: Array<{ side: string; severity: string; code: string; message: string }>;
  determinism: Record<string, unknown>;
  summary: Record<string, unknown>;
};

export type AdminSettlementAudit = {
  summary: SettlementSummary;
  audit: {
    battle_id: string;
    ok: boolean;
    checks: Record<string, boolean>;
    issues: string[];
    settlement_status: string;
  };
};
