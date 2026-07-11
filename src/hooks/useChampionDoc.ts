import { useQuery } from "@tanstack/react-query";
import { ApiStatusError, getChampionDoc, type ChampionDoc } from "@/lib/league-docs/api";

/** True when the query failed because the champion does not exist (HTTP 404). */
export function isChampionNotFound(error: unknown): boolean {
  return error instanceof ApiStatusError && error.status === 404;
}

/**
 * Combined champion documentation for League Docs detail pages
 * (identity + stats + abilities + trust metadata in one request).
 * 404s are not retried — an unknown slug is an answer, not a failure.
 */
export function useChampionDoc(slug: string) {
  return useQuery<ChampionDoc>({
    queryKey: ["league-docs", "champion-doc", slug.toLowerCase()],
    queryFn: () => getChampionDoc(slug),
    enabled: !!slug,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: (failureCount, error) => !isChampionNotFound(error) && failureCount < 1,
  });
}
