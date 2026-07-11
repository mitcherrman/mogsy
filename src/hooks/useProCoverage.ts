import { useQuery } from "@tanstack/react-query";
import { getProCoverage, type ProCoverageResponse } from "@/lib/league-docs/api";

/**
 * Esports data coverage for the League Docs Pro Data page. Coverage moves as
 * the historical import runs, so cache more briefly than static reference data.
 */
export function useProCoverage() {
  return useQuery<ProCoverageResponse>({
    queryKey: ["league-docs", "pro-coverage"],
    queryFn: getProCoverage,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}
