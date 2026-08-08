/**
 * Fetch the GRAPH1 dataset catalog (GET /api/graph1/datasets).
 *
 * The catalog is cheap by contract — the backend answers it from declared
 * config plus a committed fixture, never a dataset build — so the page can
 * request it first and build its selector before any payload arrives.
 *
 * Same API-base convention as useGraph1Dataset: VITE_COMBAT_API_URL with the
 * production origin as fallback, and a `?api=` override on the dev page.
 */
import { useQuery } from "@tanstack/react-query";

import {
  assertCatalog,
  parseFamilyDatasetKey,
  type Graph1Catalog,
} from "./contract";
import { GRAPH1_API_BASE } from "./useGraph1Dataset";

export function useGraph1Catalog(apiBase?: string) {
  const base = (apiBase || GRAPH1_API_BASE).replace(/\/+$/, "");
  return useQuery<Graph1Catalog>({
    queryKey: ["graph1-catalog", base],
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const res = await fetch(`${base}/api/graph1/datasets`);
      if (!res.ok) {
        throw new Error(`GRAPH1 catalog: HTTP ${res.status}`);
      }
      return assertCatalog(await res.json());
    },
  });
}

/**
 * Pick the dataset to show.
 *
 * Handles the "selected dataset no longer present" case: a stale URL, a
 * removed race, or a backend serving a different registry must not leave the
 * page pointing at nothing — it falls back to the first available dataset.
 * Returns null only when the catalog is genuinely empty.
 */
export function resolveDatasetKey(
  catalog: Graph1Catalog | undefined,
  requested: string | undefined,
): string | null {
  const datasets = catalog?.datasets ?? [];
  if (requested && datasets.some((d) => d.key === requested)) return requested;
  // A family instance key (`<family>:<entity>`) is NEVER in the catalog: the
  // catalog lists fixed races, and a family has thousands of possible instances.
  // It must pass through untouched so the backend can accept it or 404. Silently
  // substituting datasets[0] here would render a DIFFERENT race than a shared
  // link asked for, with nothing to tell the reader it had happened.
  if (parseFamilyDatasetKey(requested)) return requested;
  if (datasets.length === 0) return null;
  return datasets[0].key;
}
