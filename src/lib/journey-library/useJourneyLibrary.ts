/**
 * JLIB-FE — the Journey Library list, read once per page session.
 *
 * `GET /api/journeys` composes every Journey live on the server, so it is
 * fetched on entry, cached by React Query for the session (no polling, no
 * focus/reconnect refetch), and refetched only when a launch proves the list
 * stale (`JOURNEY_VERSION_NOT_ACTIVE`).
 */
import { useQuery } from "@tanstack/react-query";
import { listJourneys } from "@/lib/ranked-public/client";
import type { JourneyLibraryView } from "./contracts";

export const JOURNEY_LIBRARY_QUERY_KEY = ["journey-library"] as const;

export function useJourneyLibrary() {
  return useQuery<JourneyLibraryView>({
    queryKey: JOURNEY_LIBRARY_QUERY_KEY,
    queryFn: ({ signal }) => listJourneys(signal),
    staleTime: 10 * 60_000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}
