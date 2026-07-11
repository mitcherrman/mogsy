import { useQuery } from "@tanstack/react-query";
import { getProChampions, type ProChampionsIndexResponse } from "@/lib/league-docs/api";

/**
 * Champion index of imported pro data. Counts grow while the historical
 * import runs, so cache briefly like the other pro-data queries.
 */
export function useProChampions() {
  return useQuery<ProChampionsIndexResponse>({
    queryKey: ["league-docs", "pro-champions"],
    queryFn: getProChampions,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}
