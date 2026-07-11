import { useQuery } from "@tanstack/react-query";
import { ApiStatusError, getProChampion, type ProChampionDetail } from "@/lib/league-docs/api";

/** Route-param sanity check: slugs are lowercase-ish word/hyphen strings. */
export function isPlausibleChampionSlug(slug: string | undefined): slug is string {
  return typeof slug === "string" && /^[a-zA-Z0-9'’.&-]{1,40}$/.test(slug.trim());
}

/**
 * Pro-data detail for one champion. Pass an implausible/empty slug to disable
 * fetching. A 404 (unknown champion) surfaces via the error and never retries.
 */
export function useProChampion(slug: string | null) {
  const enabled = slug !== null;
  return useQuery<ProChampionDetail, Error>({
    queryKey: ["league-docs", "pro-champion", slug],
    queryFn: () => getProChampion(slug as string),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: (failureCount, error) =>
      !(error instanceof ApiStatusError && error.status === 404) && failureCount < 2,
  });
}
