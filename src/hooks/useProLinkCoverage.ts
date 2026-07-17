import { useQuery } from "@tanstack/react-query";
import { getProLinkCoverage, type ProLinkCoverageResponse } from "@/lib/league-docs/api";

/**
 * Cross-source link coverage for the Pro Data overview. Values move only on
 * imports/promotions (at most daily), so the pro-coverage cache windows fit.
 * Stale data is kept visible if a background refetch fails (TanStack default).
 */
export function useProLinkCoverage() {
  return useQuery<ProLinkCoverageResponse>({
    queryKey: ["league-docs", "pro-link-coverage"],
    queryFn: getProLinkCoverage,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}
