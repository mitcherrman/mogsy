/**
 * SIM2 team-simulation wire contract (backend Phase 3A/3B/3C/4A).
 *
 * These types mirror `schemas/team_simulation_schemas.py` and the Phase 4A
 * catalog payload EXACTLY. They are the only place the wire vocabulary is
 * described; every other module in this folder speaks these types or the
 * local draft model, never ad-hoc object literals.
 *
 * Two rules this file exists to enforce:
 *  - the catalog (`GET /api/combat-lab/team-simulate/catalog/v1`) is the sole
 *    source of the input vocabulary. `/api/meta/items` describes a DIFFERENT,
 *    smaller set and must never feed these selectors.
 *  - `effective_builds` is what actually ran. Nothing here re-derives a build
 *    from the request after the fact.
 */

/* ───────────────────────────── catalog ───────────────────────────── */

export const TEAM_SIM_CATALOG_PATH =
  "/api/combat-lab/team-simulate/catalog/v1";
export const TEAM_SIM_SIMULATE_PATH = "/api/combat-lab/team-simulate/v1";

/**
 * Phase 4E server-side recovery. Two authenticated, account-scoped surfaces:
 * a bounded list of the caller's own unresolved/completed requests, and a
 * collector for one of them by opaque handle. Neither charges credits and
 * neither runs a simulation.
 *
 * Hard-coded here rather than read from the catalog, deliberately. These are
 * how a paid result is collected after the browser lost everything — and a
 * catalog fetch is exactly the kind of thing that may also be failing at that
 * moment. Gating recovery on the catalog would make one outage hide the
 * other. A test asserts these agree with `catalog.recovery` when the catalog
 * IS available, so drift is caught without creating the dependency.
 */
export const TEAM_SIM_RECOVERABLE_PATH =
  "/api/combat-lab/team-simulate/recoverable/v1";
export const TEAM_SIM_RECOVER_PATH =
  "/api/combat-lab/team-simulate/recover/v1";

/**
 * Phase 4C headers. Named here rather than inlined at the fetch call, so the
 * catalog's published `billing.idempotency_header` can be checked against the
 * value this client actually sends.
 */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";
export const IDEMPOTENCY_REPLAYED_HEADER = "Idempotency-Replayed";

/** Generic per-slot cast, available on every champion. */
export type AbilitySlot = "P" | "Q" | "W" | "E" | "R";
/** Ranked ability slots (the passive has no rank). */
export type RankedAbilitySlot = "Q" | "W" | "E" | "R";
export type CritMode = "expected" | "force" | "none";
export type TargetingPolicy =
  | "fixed"
  | "first_living"
  | "lowest_hp"
  | "lowest_hp_pct";
export type OnFailurePolicy = "skip" | "retry" | "halt";

export type CatalogChampionAction = {
  active_name: string;
  label: string;
  ability_slot: string;
  mechanic_type: string;
  implemented: boolean;
  cast?: number;
  variant?: string;
};

export type CatalogChampion = {
  name: string;
  basic_attack: boolean;
  generic_slot_actions: string[];
  actions: CatalogChampionAction[];
};

export type CatalogItem = {
  name: string;
  item_id: number | null;
  status: "supported" | "unsupported";
  reason?: string;
};

export type CatalogRune = {
  name: string;
  status: "supported" | "unsupported";
  tree?: string;
  reason?: string;
};

export type CatalogTargetingPolicy = {
  policy: string;
  description: string;
  requires_priority: boolean;
};

export type CatalogPricingRow = {
  team_a_size: number;
  team_b_size: number;
  credits: number;
};

/** `build_options.level` (Phase 4C). */
export type CatalogLevelBounds = {
  min: number;
  max: number;
  default: number;
};

/**
 * `billing` (Phase 4C): the backend's own statement of how this endpoint
 * charges and how a paid request is recovered. Every value here is read, never
 * assumed — the same rule Phase 4B already applied to
 * `pricing.charged_only_on_success`.
 */
export type CatalogBilling = {
  unit: string;
  charged_only_on_success: boolean;
  idempotency_required: boolean;
  idempotency_header: string;
  idempotency_replayed_header: string;
  idempotency_key_min_length: number;
  idempotency_key_max_length: number;
  idempotency_key_charset: string;
  idempotency_retention_seconds: number;
  idempotency_scope: string;
  replay_charges: number;
  conflict_status: number;
  conflict_code: string;
  in_progress_status: number;
  in_progress_code: string;
  replay_is_byte_identical: boolean;
};

/**
 * `recovery` (Phase 4E): the backend's statement of how a paid request is
 * discovered and collected once the browser no longer holds its key.
 *
 * OPTIONAL on {@link TeamSimCatalog}. A backend that predates Phase 4E simply
 * does not publish it, and the frontend must not treat that as "recovery is
 * off" — the paths are hard-coded above and the recovery UI is driven by the
 * discovery response, never by this block. It exists so the published contract
 * is describable and so a drift test can compare the two.
 */
export type CatalogRecovery = {
  supported: boolean;
  discovery_path: string;
  discovery_method: string;
  recovery_path: string;
  recovery_method: string;
  requires_account: boolean;
  discovery_is_read_only: boolean;
  recovery_charges: number;
  recovery_invokes_scheduler: boolean;
  recovery_replayed_header: string;
  max_results: number;
  paginated: boolean;
  order: string;
  retention_seconds: number;
  recovery_id_format: string;
  statuses: string[];
  replay_available_statuses: string[];
  not_found_status: number;
  not_found_code: string;
  in_progress_status: number;
  in_progress_code: string;
  stale_status: number;
  stale_code: string;
  note?: string;
};

export type TeamSimCatalog = {
  catalog_contract_version: string;
  contract_version: string;
  catalog_digest: string;
  generated_from: Record<string, string>;
  champions: CatalogChampion[];
  items: { supported: CatalogItem[]; known_unsupported: CatalogItem[] };
  runes: {
    supported: CatalogRune[];
    known_unsupported: CatalogRune[];
    rune_page_legality_modelled: boolean;
  };
  actions: {
    action_types: string[];
    basic_attack: Record<string, unknown>;
    generic_slot_actions: {
      type: string;
      slots: string[];
      all_champions: boolean;
      description: string;
    };
    champion_actions_field: string;
    validation_note: string;
  };
  ability_rules: {
    slots: string[];
    rank_bounds: Record<string, { min: number; max: number }>;
    defaults: Record<string, number>;
    strict_integers: boolean;
    keys_case_insensitive: boolean;
    duplicate_keys_rejected: boolean;
  };
  build_options: {
    crit_modes: string[];
    max_items_per_combatant: number;
    max_runes_per_combatant: number;
    /**
     * Phase 4C. Before this the frontend mirrored the literals `1..18` from the
     * Python schema; it now reads them, so a change to the level range reaches
     * this UI through the catalog like every other bound.
     */
    level: CatalogLevelBounds;
    starting_hp: string;
  };
  targeting_policies: CatalogTargetingPolicy[];
  targeting_tie_break: string;
  action_plan_options: {
    repeat: boolean[];
    on_failure: string[];
    not_before: { type: string; minimum: number; description: string };
    max_steps_per_plan: number;
    empty_plan_is_legal: boolean;
    plan_exhaustion: string;
  };
  scheduler_limits: {
    max_duration: { default: number; maximum: number };
    max_events: { default: number; maximum: number };
    max_trace_events: { default: number; maximum: number };
    request_body_bytes: number;
    json_nesting_depth: number;
  };
  /**
   * Phase 7A. Optional so a pre-7A catalog still parses; the page falls back
   * to a single hard-coded level when it is absent rather than offering
   * choices this deployment would reject.
   */
  trace_options?: {
    default: TraceDetail;
    allowed: TraceDetail[];
    field: string;
    affects_idempotency_digest: boolean;
    descriptions: Partial<Record<TraceDetail, string>>;
  };
  team_limits: {
    min_team_size: number;
    max_team_size: number;
    max_runtime_id_length: number;
    max_champion_name_length: number;
    max_build_entry_length: number;
  };
  pricing: {
    unit: string;
    costs: CatalogPricingRow[];
    charged_only_on_success: boolean;
  };
  /** Phase 4C. See {@link CatalogBilling}. */
  billing: CatalogBilling;
  /** Phase 4E. Optional by design — see {@link CatalogRecovery}. */
  recovery?: CatalogRecovery;
  rate_limit: { scope: string; limit: number; window_seconds: number };
  execution_assumptions: Record<string, unknown>;
  unsupported_mechanics: string[];
};

/* ─────────────────────── recovery discovery (4E) ─────────────────── */

/**
 * `completed` — a stored result exists; collecting it is free.
 * `pending`   — running right now. Checking says so; it starts nothing.
 * `stale`     — the reservation was abandoned. Nothing was stored and nothing
 *               was charged, and the server cannot resume it: the ledger keeps
 *               a digest of the request, never its body.
 */
export type RecoverableStatus = "completed" | "pending" | "stale";

/**
 * One entry in the recovery list.
 *
 * `recovery_id` is an opaque server handle, not the idempotency key — the key
 * never leaves the client that minted it. `team_shape` and `champions` are
 * null for a record created before this contract existed; the UI reports that
 * rather than inventing a description.
 */
export type RecoverableRequest = {
  recovery_id: string;
  status: RecoverableStatus;
  replay_available: boolean;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
  credit_cost: number;
  credits_charged: number;
  contract_version: string;
  team_shape: string | null;
  champions: { a: string[]; b: string[] } | null;
  winner: string | null;
  termination_reason: string | null;
  event_count: number | null;
  response_bytes: number | null;
};

export type RecoverableListing = {
  contract_version: string;
  endpoint: string;
  retention_seconds: number;
  limit: number;
  count: number;
  recoverable_requests: RecoverableRequest[];
};

/* ───────────────────────────── request ───────────────────────────── */

export type TeamSimActionRequest = {
  type: "basic_attack" | "active";
  active_name?: string;
  slot?: string;
  not_before: number;
};

export type TeamSimPlanRequest = {
  steps: TeamSimActionRequest[];
  repeat: boolean;
  on_failure: OnFailurePolicy;
};

export type TeamSimTargetingRequest = {
  policy: TargetingPolicy;
  /** Only sent (and only legal) for policy "fixed". */
  priority?: string[];
};

export type TeamSimCombatantRequest = {
  runtime_id: string;
  champion: string;
  level: number;
  items: string[];
  runes: string[];
  ability_ranks: Record<string, number>;
  crit_mode: CritMode;
  starting_hp?: number;
};

export type TeamSimTeamRequest = {
  team_id: string;
  combatants: TeamSimCombatantRequest[];
};

/**
 * How much of the event trace the response carries (Phase 7A). Orthogonal to
 * `max_trace_events`, which bounds HOW MANY rows come back: this bounds how
 * much each row carries, and which families appear at all.
 *
 * Every level runs the identical simulation and returns identical summaries,
 * winner, damage totals, deaths and termination — so it is a presentation
 * choice, never a different fight. It IS part of the backend's request
 * digest, though, so changing it means a NEW paid run under a new idempotency
 * key rather than a re-render of one already bought. That is why the page
 * never re-submits on its own when the selector changes.
 */
export type TraceDetail = "summary" | "standard" | "full";

export type TeamSimLimitsRequest = {
  max_duration: number;
  max_events: number;
  max_trace_events: number;
  /**
   * Optional on the wire, and that is deliberate rather than lax: a backend
   * that does not publish `trace_options` does not accept this field either
   * (every request model on the contract is `extra="forbid"`), so the request
   * builder omits it entirely there instead of sending a level.
   */
  trace_detail?: TraceDetail;
};

export type TeamSimulationRequest = {
  contract_version: string;
  scenario_id: string;
  team_a: TeamSimTeamRequest;
  team_b: TeamSimTeamRequest;
  action_plans: Record<string, TeamSimPlanRequest>;
  targeting: Record<string, TeamSimTargetingRequest>;
  limits: TeamSimLimitsRequest;
};

/* ───────────────────────────── response ──────────────────────────── */

/** Scheduler event source. Filters key off THIS, never off inferred types. */
export type TeamSimEventSource =
  | "scheduler"
  | "kernel"
  | "targeting"
  | "lifecycle"
  | "termination";

export type TeamSimEvent = {
  seq: number;
  time: number;
  source: TeamSimEventSource | string;
  type: string;
  actor_id: string | null;
  actor_team: string | null;
  target_id: string | null;
  target_team: string | null;
  action_id: string | null;
  payload: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  /**
   * Phase 7A repeat group. Present only when this row stands for MORE than
   * one identical occurrence — one event never carries it — so `repeats` is
   * a reliable "this is a collapsed row" signal rather than a count to check.
   * The row keeps its own `seq`/`time` (the FIRST occurrence), and the block
   * names the span the group covers.
   */
  repeats?: {
    count: number;
    first_seq: number;
    last_seq: number;
    first_time: number;
    last_time: number;
  };
};

export type TeamSimTermination = {
  reason: string;
  winner: string | null;
  detail: string;
};

export type TeamSimTrace = {
  truncated: boolean;
  simulated_event_count: number;
  returned_event_count: number;
  rule: string;
  summaries_cover_full_simulation: boolean;
  /**
   * Phase 7A, all optional so a response from a pre-7A backend (or a
   * recovered result stored before this phase) still types and renders. Read
   * them through the helpers in ./result rather than directly, so the
   * "absent means the old behaviour" reading lives in exactly one place.
   */
  detail?: TraceDetail;
  /** True when the LEVEL removed or folded something (never true at `full`). */
  compacted?: boolean;
  /** simulated - returned: the level's removals plus any truncation. */
  omitted_event_count?: number;
  /** Of those, the ones folded into a `repeats` row rather than dropped. */
  grouped_event_count?: number;
};

export type EffectiveBuildItem = { name: string; item_id: number | null };

export type EffectiveBuild = {
  champion: string;
  level: number;
  items: EffectiveBuildItem[];
  runes: string[];
  ability_ranks: Record<string, number>;
  crit_mode: string;
  starting_hp: number;
  starting_hp_source: string;
  max_hp: number;
  data_version: { patch: string | null; catalog_digest: string };
};

export type TeamSimCombatantSummary = {
  runtime_id: string;
  team_id: string;
  champion: string;
  slot_index: number;
  alive: boolean;
  death_time: number | null;
  final_hp: number;
  max_hp: number;
  damage_dealt_total: number;
  damage_dealt_primary: number;
  damage_taken_total: number;
  damage_taken_primary: number;
  scoped_pool_damage_taken: number;
  healing_generated: number;
  healing_applied: number;
  actions_attempted: number;
  actions_executed: number;
  failures: number;
  skips: number;
  delays: number;
  target_changes: number;
  final_target_id: string | null;
  plan: {
    steps: number;
    repeat: boolean;
    on_failure: string;
    cursor: number;
    halted: boolean;
    exhausted: boolean;
  };
  final_cooldowns: Record<string, unknown>;
};

export type TeamSimTeamSummary = {
  team_id: string;
  members: string[];
  living: string[];
  dead: string[];
  eliminated: boolean;
  damage_dealt_total: number;
  damage_dealt_primary: number;
  damage_taken_total: number;
  damage_taken_primary: number;
  healing_applied: number;
  actions_executed: number;
};

/** Backend credit status. Same shape `/api/combat-lab/credits` returns. */
export type TeamSimCredits = {
  is_pro: boolean;
  unlimited: boolean;
  credits_used: number;
  credits_limit: number | null;
  credits_remaining: number | null;
  blocked: boolean;
  reset_at: string | null;
  upsell_message: string | null;
  tokens_required?: boolean;
};

export type TeamSimulationResponse = {
  contract_version: string;
  scenario_id: string;
  termination: TeamSimTermination;
  duration: number;
  event_count: number;
  events: TeamSimEvent[];
  effective_builds: Record<string, EffectiveBuild>;
  trace: TeamSimTrace;
  credits: TeamSimCredits;
  team_summaries: Record<string, TeamSimTeamSummary>;
  combatant_summaries: Record<string, TeamSimCombatantSummary>;
  final_targets: Record<string, string | null>;
  pair_ledger: Record<string, unknown>;
  scheduler_assumptions: Record<string, string>;
  unsupported_mechanics: string[];
  warnings: string[];
};
