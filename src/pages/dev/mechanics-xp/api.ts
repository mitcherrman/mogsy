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
