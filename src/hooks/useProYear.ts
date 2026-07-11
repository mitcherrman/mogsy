import { useQuery } from "@tanstack/react-query";
import { ApiStatusError, getProYear, type ProYearDetail } from "@/lib/league-docs/api";

/** Sanity bounds for the :year route param — outside this is treated as invalid, not fetched. */
export function isPlausibleProYear(year: number | null): year is number {
  return year !== null && Number.isInteger(year) && year >= 2000 && year <= 2100;
}

/**
 * One year of esports coverage detail. Pass null (or an implausible year) to
 * disable fetching entirely. A 404 (untracked year) is surfaced via the error
 * and never retried.
 */
export function useProYear(year: number | null) {
  const enabled = isPlausibleProYear(year);
  return useQuery<ProYearDetail, Error>({
    queryKey: ["league-docs", "pro-year", year],
    queryFn: () => getProYear(year as number),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: (failureCount, error) =>
      !(error instanceof ApiStatusError && error.status === 404) && failureCount < 2,
  });
}
