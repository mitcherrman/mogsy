// ADMIN RETENTION V2 — the cohort read and its availability, shared by the
// Users panel and the Overview card (see components/admin/users/CohortRetention).
import { useQuery } from "@tanstack/react-query";
import { loadAnalytics, ROW_CAP, type LoadedAnalytics } from "./loadAnalytics";
import {
  cohortLookbackStart,
  cohortWindow,
  computeCohortRetention,
  type CohortGrain,
  type CohortReport,
  type RetentionLens,
} from "./cohorts";
import { filterDatasetByTraffic, type TrafficFilter } from "./traffic";

/** One read shared by the Users panel and the Overview card. */
export function useCohortAnalytics(refreshKey = 0) {
  return useQuery({
    queryKey: ["admin", "retention-cohorts", refreshKey],
    queryFn: () => loadAnalytics({ start: cohortLookbackStart(Date.now()) }),
    staleTime: 60_000,
  });
}

/** Which truncated table makes a lens unobservable. Ascending reads lose the NEWEST rows. */
export function lensUnavailableReason(loaded: LoadedAnalytics, lens: RetentionLens): string | null {
  const t = loaded.truncated;
  const hit = lens === "browser" ? (t.sessions || t.visitors) : t.events;
  if (!hit) return null;
  return `The ${lens === "browser" ? "session / visitor" : "event"} read exceeded ${ROW_CAP.toLocaleString()} rows and lost its newest rows, so returns cannot be confirmed. Move this aggregate into SQL.`;
}

export function buildReport(
  loaded: LoadedAnalytics,
  filter: TrafficFilter,
  lens: RetentionLens,
  grain: CohortGrain,
): CohortReport {
  const now = loaded.loadedAt;
  const ds = filterDatasetByTraffic(loaded.dataset, filter, loaded.overrides).dataset;
  return computeCohortRetention(ds, cohortWindow(grain, now), now, lens, grain);
}
