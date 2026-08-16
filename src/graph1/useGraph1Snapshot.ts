/**
 * Fetch one GRAPH1 ranked-SNAPSHOT dataset.
 *
 * Same endpoint, API-base convention and caching policy as `useGraph1Dataset`
 * — only the structural gate differs, because a board must not try to render
 * a race payload (or the reverse). Kept as a separate hook rather than a
 * generic one so each caller's `data` is narrowed to the shape it can
 * actually render.
 *
 * One payload per stat carries EVERY snapshot point, so changing the level,
 * the order or the row count re-ranks in place and issues no request. Only
 * changing the stat refetches — and react-query then serves it from cache on
 * the way back.
 */
import { useQuery } from "@tanstack/react-query";

import {
  assertSnapshotDataset,
  type Graph1SnapshotDataset,
} from "./snapshotContract";
import { GRAPH1_API_BASE } from "./useGraph1Dataset";

export function useGraph1Snapshot(
  datasetKey: string,
  apiBase?: string,
  options: { enabled?: boolean } = {},
) {
  const base = (apiBase || GRAPH1_API_BASE).replace(/\/+$/, "");
  return useQuery<Graph1SnapshotDataset>({
    queryKey: ["graph1-snapshot", base, datasetKey],
    enabled: options.enabled ?? true,
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const res = await fetch(`${base}/api/graph1/datasets/${datasetKey}`);
      if (!res.ok) {
        throw new Error(`GRAPH1 snapshot ${datasetKey}: HTTP ${res.status}`);
      }
      return assertSnapshotDataset(await res.json());
    },
  });
}
