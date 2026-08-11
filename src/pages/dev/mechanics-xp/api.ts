// Dev-only client for the backend league-mechanics XP calculator
// (GET/POST /api/mechanics/xp/*). All calculation happens in the backend
// engine; this module only shapes requests and holds response types.

import { COMBAT_API_BASE_URL } from "@/lib/combat-lab/api";

export type MinionType = "melee" | "caster" | "cannon" | "super";

export interface MinionEventInput {
  kind: "minion";
  minion_type: MinionType;
  recipient_count: number;
  event_id?: string;
}

export interface XpConfig {
  ruleset_id: string;
  effective_patch: string;
  verified_through: string;
  map: string;
  mode: string;
  level_cap: number;
  minion_base_xp: Record<string, string>;
  share_multipliers: Record<string, string>;
  rounding_strategies: string[];
  manifest: Array<{
    mechanic_id: string;
    description: string;
    value_repr: string;
    status: string;
    confidence: string;
    effective_patch: string;
    verified_through: string;
    implementation_allowed: boolean;
    empirical_test_required: boolean;
    caveat: string;
    sources: Array<{ source_class: string; name: string; location: string }>;
  }>;
}

export interface LedgerEntry {
  event_id: string;
  event_kind: string;
  detail: string;
  base_xp: string;
  share_multiplier: string | null;
  awarded_xp: string;
  discarded_at_cap_xp: string;
  cumulative_before: string;
  cumulative_after: string;
  level_before: number;
  level_after: number;
  rule_ids: string[];
  caveats: string[];
}

export interface SimulationResult {
  ruleset_id: string;
  patch: string;
  effective_patch: string;
  verified_through: string;
  ending_level: number;
  ending_cumulative_xp: string;
  xp_within_current_level: string;
  xp_to_next_level: string | null;
  level_up_events: Array<{
    event_id: string;
    new_level: number;
    cumulative_xp_at_level_up: string;
  }>;
  event_ledger: LedgerEntry[];
  applied_rules: Array<{
    rule_id: string;
    description?: string;
    value_repr?: string;
    status: string;
    confidence?: string;
    effective_patch?: string;
    verified_through?: string;
    sources?: Array<{ name: string; location: string; source_class: string }>;
  }>;
  warnings: string[];
}

export const MINION_TYPES: MinionType[] = ["melee", "caster", "cannon", "super"];

// Counts mode builds an ordered list melee -> caster -> cannon -> super.
// Order matters for which event triggers a level-up; this fixed order is a
// UI convention, not a game fact.
export function buildEventsFromCounts(
  counts: Record<MinionType, number>,
  recipientCount: number,
): MinionEventInput[] {
  const events: MinionEventInput[] = [];
  for (const type of MINION_TYPES) {
    const n = Math.max(0, Math.floor(counts[type] ?? 0));
    for (let i = 1; i <= n; i += 1) {
      events.push({
        kind: "minion",
        minion_type: type,
        recipient_count: recipientCount,
        event_id: `${type}-${i}`,
      });
    }
  }
  return events;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${COMBAT_API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    let detail = `${response.status}`;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
      else detail = JSON.stringify(body?.detail ?? body);
    } catch {
      // keep status code
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export function fetchXpConfig(): Promise<XpConfig> {
  return request<XpConfig>("/api/mechanics/xp/config");
}

export function simulateXp(body: {
  patch: string;
  starting_level: number;
  starting_cumulative_xp: string;
  events: MinionEventInput[];
  rounding_strategy: string;
}): Promise<SimulationResult> {
  return request<SimulationResult>("/api/mechanics/xp/simulate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// --- Phase 1B: wave generation and breakpoint analysis -----------------------
// All wave/XP math stays in the backend; this section only shapes requests
// and types responses.

export interface MissedMinionRuleInput {
  wave_number?: number | null;
  minion_type?: MinionType | null;
  count?: number;
  event_ids?: string[];
}

export interface BreakpointsParams {
  patch: string;
  startingLevel: number;
  startingCumulativeXp: string;
  startWave: number;
  waveCount: number;
  recipientCount: number;
  orderingStrategy: string;
  roundingStrategy: string;
  missedMinions: MissedMinionRuleInput[];
  targetLevels: number[];
  superMinionsPerWave: number;
}

export interface BreakpointsBody {
  patch: string;
  starting_level: number;
  starting_cumulative_xp: string;
  start_wave: number;
  wave_count: number;
  recipient_count: number;
  ordering_strategy: string;
  rounding_strategy: string;
  missed_minions: MissedMinionRuleInput[];
  target_levels: number[];
  super_minions_per_wave: number;
}

// Pure, testable request shaping: numbers coerced to integers, target levels
// deduped and sorted, decimal XP passed through as a string untouched.
export function buildBreakpointsBody(params: BreakpointsParams): BreakpointsBody {
  return {
    patch: params.patch,
    starting_level: Math.floor(params.startingLevel),
    starting_cumulative_xp: params.startingCumulativeXp.trim(),
    start_wave: Math.floor(params.startWave),
    wave_count: Math.floor(params.waveCount),
    recipient_count: Math.floor(params.recipientCount),
    ordering_strategy: params.orderingStrategy,
    rounding_strategy: params.roundingStrategy,
    missed_minions: params.missedMinions,
    target_levels: [...new Set(params.targetLevels.map((n) => Math.floor(n)))].sort(
      (a, b) => a - b,
    ),
    super_minions_per_wave: Math.floor(params.superMinionsPerWave),
  };
}

export interface WaveSummary {
  wave_number: number;
  spawn_time_seconds: number;
  spawn_time_display: string;
  is_cannon_wave: boolean;
  minion_counts: Record<string, number>;
  omitted_count: number;
  wave_xp: string;
  cumulative_xp_after_wave: string | null;
  level_after_wave: number | null;
}

export interface TargetLevelBreakpoint {
  target_level: number;
  reached: boolean;
  wave_number: number | null;
  event_id: string | null;
  minion_type: string | null;
  sequence_within_wave: number | null;
  global_sequence: number | null;
  spawn_time_seconds: number | null;
  spawn_time_display: string | null;
  cumulative_xp: string | null;
  xp_over_threshold: string | null;
}

export interface OmittedEvent {
  wave_number: number;
  sequence_within_wave: number;
  global_sequence: number;
  minion_type: string;
  event_id: string;
  spawn_time_seconds: number;
  spawn_time_display: string;
}

export interface BreakpointAnalysisResult {
  request_summary: Record<string, unknown>;
  generation: {
    ruleset_id: string;
    effective_patch: string;
    verified_through: string;
    waves: Array<{
      wave_number: number;
      spawn_time_display: string;
      is_cannon_wave: boolean;
      minion_counts: Record<string, number>;
    }>;
  };
  simulation: SimulationResult;
  target_level_breakpoints: TargetLevelBreakpoint[];
  unreached_targets: number[];
  wave_summaries: WaveSummary[];
  omitted_events: OmittedEvent[];
  warnings: string[];
  applied_rules: SimulationResult["applied_rules"];
}

export interface BreakpointDelta {
  target_level: number;
  baseline_wave: number | null;
  comparison_wave: number | null;
  baseline_event: string | null;
  comparison_event: string | null;
  wave_delta: number | null;
  event_delta: number | null;
}

export interface ComparisonResult {
  baseline: BreakpointAnalysisResult;
  comparison: BreakpointAnalysisResult;
  level_breakpoint_deltas: BreakpointDelta[];
  xp_difference: string;
  first_divergence: {
    ledger_index: number;
    baseline_event: string | null;
    comparison_event: string | null;
  } | null;
  warnings: string[];
}

export function analyzeBreakpoints(
  body: BreakpointsBody,
): Promise<BreakpointAnalysisResult> {
  return request<BreakpointAnalysisResult>("/api/mechanics/xp/breakpoints", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function compareBreakpoints(
  baseline: BreakpointsBody,
  comparison: BreakpointsBody,
): Promise<ComparisonResult> {
  return request<ComparisonResult>("/api/mechanics/xp/breakpoints/compare", {
    method: "POST",
    body: JSON.stringify({ baseline, comparison }),
  });
}
