import { useQuery } from "@tanstack/react-query";
import { fetchChampionBaseStats, type ChampionBaseStats } from "@/lib/league-docs/api";

/**
 * Full champion base-stat table for League Docs (index + detail pages share
 * one cached list — 172 small rows). Errors surface via react-query so pages
 * can render a retryable failure state.
 */
export function useChampionBaseStats() {
  return useQuery<ChampionBaseStats[]>({
    queryKey: ["league-docs", "champion-base-stats"],
    queryFn: fetchChampionBaseStats,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}
