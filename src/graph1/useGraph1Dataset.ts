/**
 * Fetch one GRAPH1 dataset from the Combat/Railway API.
 *
 * Same API-base convention as useChampionAssets: VITE_COMBAT_API_URL with the
 * production origin as fallback. A `?api=` query override exists on the dev
 * page for local backends (the /api/graph1 routes ship with this phase and
 * are not deployed yet).
 */
import { useQuery } from "@tanstack/react-query";

import { assertDataset, type VisualizationDataset } from "./contract";

export const GRAPH1_API_BASE = (
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) ||
  "https://web-production-83e53.up.railway.app"
).replace(/\/+$/, "");

export function useGraph1Dataset(
  datasetKey: string,
  apiBase?: string,
  options: { enabled?: boolean } = {},
) {
  const base = (apiBase || GRAPH1_API_BASE).replace(/\/+$/, "");
  return useQuery<VisualizationDataset>({
    queryKey: ["graph1-dataset", base, datasetKey],
    // the page holds off until the catalog names a dataset
    enabled: options.enabled ?? true,
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const started = performance.now();
      const res = await fetch(`${base}/api/graph1/datasets/${datasetKey}`);
      if (!res.ok) {
        throw new Error(`GRAPH1 dataset ${datasetKey}: HTTP ${res.status}`);
      }
      const dataset = assertDataset(await res.json());
      if (import.meta.env?.DEV) {
        console.info(
          `[graph1] ${datasetKey}: ${dataset.events.length} events fetched+parsed in ` +
            `${Math.round(performance.now() - started)}ms`,
        );
      }
      return dataset;
    },
  });
}
