import { useQuery } from "@tanstack/react-query";
import { COMBAT_API_BASE_URL } from "@/lib/combat-lab/api";

export const KNOWLEDGE_STATS_PATH = "/lol/stats";
export const KNOWLEDGE_STATS_API_PATH = "/api/public/knowledge-stats/v1";

export type KnowledgeStatsMode =
  | "practice"
  | "time_trial"
  | "daily_challenge"
  | "role_challenge"
  | "ranked"
  | "journey";

export type EntityType = "champion" | "item" | "rune" | "summoner_spell";

export interface StatsSummary {
  answers: number;
  correct: number;
  incorrect: number;
  accuracy: number | null;
  distinct_question_keys: number;
  first_answered_at: string | null;
  last_answered_at: string | null;
}

export interface ModeSummary extends StatsSummary {
  mode: KnowledgeStatsMode;
  recorded_timeouts: number;
  available: boolean;
}

export interface EntityStats {
  entity_type: EntityType;
  entity_key: string;
  role: "subject" | "comparison_subject" | "answer_subject";
  answers: number;
  correct: number;
  incorrect: number;
  accuracy: number | null;
  distinct_question_keys: number;
  minimum_sample: number;
  rank_eligible: boolean;
  confidence: "insufficient" | "emerging" | "established" | "strong";
  modes: Partial<Record<KnowledgeStatsMode, {
    answers: number;
    correct: number;
    accuracy: number | null;
  }>>;
}

export interface KnowledgeStatsResponse {
  schema_version: 1;
  generated_at: string;
  filter: { mode: KnowledgeStatsMode | null };
  answer_totals: StatsSummary;
  attribution_totals: {
    attributed_answers: number;
    unattributed_answers: number;
    answer_coverage: number | null;
    entity_attributions: number;
    note: string;
  };
  modes: ModeSummary[];
  entities: EntityStats[];
  coverage: {
    unsupported_answers_by_family: Record<string, number>;
    excluded_bot_records: number;
    excluded_demo_records: number;
    excluded_non_public_records: number;
    recorded_timeouts_excluded_from_accuracy: number;
    duplicate_records: number;
    conflicting_duplicate_records: number;
    unavailable_sources: Array<{
      mode: string;
      reason: string;
      answer_records?: number;
    }>;
    global_exclusions: {
      excluded_bot_records: number;
      excluded_demo_records: number;
      excluded_non_public_records: number;
      note: string;
    };
  };
  methodology: {
    minimum_sample: number;
    ranking_rule: string;
    timeout_rule: string;
    bot_rule: string;
    demo_rule: string;
    identity_rule: string;
  };
}

export class KnowledgeStatsHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function fetchKnowledgeStats(
  mode: KnowledgeStatsMode | null,
  signal?: AbortSignal,
): Promise<KnowledgeStatsResponse> {
  const query = mode ? `?mode=${encodeURIComponent(mode)}` : "";
  const response = await fetch(
    `${COMBAT_API_BASE_URL}${KNOWLEDGE_STATS_API_PATH}${query}`,
    { headers: { Accept: "application/json" }, signal },
  );
  if (!response.ok) {
    let message = "Knowledge statistics are unavailable right now.";
    try {
      const body = await response.json() as { detail?: { message?: string } };
      message = body.detail?.message || message;
    } catch {
      // Keep the stable public error copy for a non-JSON upstream response.
    }
    throw new KnowledgeStatsHttpError(response.status, message);
  }
  return response.json() as Promise<KnowledgeStatsResponse>;
}

export function useKnowledgeStats(mode: KnowledgeStatsMode | null) {
  return useQuery({
    queryKey: ["public-knowledge-stats", 1, mode],
    queryFn: ({ signal }) => fetchKnowledgeStats(mode, signal),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
