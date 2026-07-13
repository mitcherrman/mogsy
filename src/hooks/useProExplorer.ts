import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  explorerQueryKey,
  getProExplorer,
  type ExplorerFilters,
  type ExplorerResponse,
} from "@/lib/league-docs/explorer";

/**
 * Pro Data Explorer results for the active filter/sort/page set. Results change
 * as the esports import runs, so cache briefly. keepPreviousData keeps the
 * current page visible while the next page/sort loads (no empty flash).
 */
export function useProExplorer(filters: ExplorerFilters, enabled = true) {
  return useQuery<ExplorerResponse>({
    queryKey: ["league-docs", "pro-explorer", explorerQueryKey(filters)],
    queryFn: () => getProExplorer(filters),
    enabled,
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
