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
import { scopeQuery, type Graph1Scope } from "./scope";
import {
  datasetUrl,
  Graph1HttpError,
  GRAPH1_API_BASE,
  readErrorDetail,
} from "./useGraph1Dataset";

export function useGraph1Snapshot(
  datasetKey: string,
  apiBase?: string,
  options: {
    enabled?: boolean;
    scope?: Graph1Scope;
    /**
     * Ratio metric (Phase E). Present turns the SAME dataset key into a
     * ranked-snapshot BOARD: a ratio goes down as often as up, so it cannot
     * be raced. The board is derived from the same query, policy and scope as
     * the race, which is why the two can never disagree.
     */
    metric?: string;
  } = {},
) {
  const base = (apiBase || GRAPH1_API_BASE).replace(/\/+$/, "");
  const query = {
    ...(options.scope ? scopeQuery(options.scope) : {}),
    ...(options.metric ? { metric: options.metric } : {}),
  };
  return useQuery<Graph1SnapshotDataset>({
    queryKey: ["graph1-snapshot", base, datasetKey, query],
    enabled: options.enabled ?? true,
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    // A 409 is a deliberate REFUSAL — the denominator cannot be trusted for
    // this scope — and a 400/404 is a settled answer too. None improve on a
    // retry, and re-asking for a refused ratio only delays telling the reader.
    retry: (count, error) =>
      count < 1 &&
      !(error instanceof Graph1HttpError && error.status < 500),
    queryFn: async () => {
      const res = await fetch(
        datasetUrl(base, datasetKey, options.scope, options.metric),
      );
      if (!res.ok) {
        throw new Graph1HttpError(
          res.status,
          `GRAPH1 snapshot ${datasetKey}: HTTP ${res.status}`,
          await readErrorDetail(res),
        );
      }
      return assertSnapshotDataset(await res.json());
    },
  });
}
