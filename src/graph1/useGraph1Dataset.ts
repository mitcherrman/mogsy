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
import { scopeQuery, type Graph1Scope } from "./scope";

export const GRAPH1_API_BASE = (
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) ||
  "https://web-production-83e53.up.railway.app"
).replace(/\/+$/, "");

/**
 * A GRAPH1 request the backend answered with a status.
 *
 * The status is carried because the four failures mean four different things
 * to a reader and each has its own copy: 400 a malformed request, 404 an
 * entity that is not selectable, **409 a metric the backend refuses for this
 * scope** (an incomplete ban-coverage denominator), 5xx the service. The
 * refusal in particular must never be softened into a plausible-looking
 * number — the whole point of the 409 is that no trustworthy number exists.
 */
export class Graph1HttpError extends Error {
  readonly status: number;
  readonly detail?: string;

  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.name = "Graph1HttpError";
    this.status = status;
    this.detail = detail;
  }
}

/** The backend's `detail` string, when it sent one. Never throws. */
export async function readErrorDetail(res: Response): Promise<string | undefined> {
  try {
    const body = await res.json();
    const detail = (body as { detail?: unknown })?.detail;
    return typeof detail === "string" ? detail : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Request URL for one dataset under one scope.
 *
 * An UNSCOPED graph appends nothing at all, so its request, cache entry and
 * ETag stay byte-identical to the pre-Phase-E one and every existing deep
 * link keeps resolving to exactly the payload it always did.
 */
export function datasetUrl(
  base: string,
  datasetKey: string,
  scope?: Graph1Scope,
  apiMetric?: string,
  minGames?: number,
): string {
  const params = new URLSearchParams(scope ? scopeQuery(scope) : {});
  if (apiMetric) params.set("metric", apiMetric);
  if (minGames !== undefined) params.set("min_games", String(minGames));
  const query = params.toString();
  // `datasetKey` carries `:` separators that must survive as-is; the backend
  // routes on the raw path segment, and encodeURIComponent would break it.
  const path = `${base}/api/graph1/datasets/${datasetKey}`;
  return query ? `${path}?${query}` : path;
}

export function useGraph1Dataset(
  datasetKey: string,
  apiBase?: string,
  options: { enabled?: boolean; scope?: Graph1Scope } = {},
) {
  const base = (apiBase || GRAPH1_API_BASE).replace(/\/+$/, "");
  const query = options.scope ? scopeQuery(options.scope) : {};
  return useQuery<VisualizationDataset>({
    // The scope is part of the identity: two scopes of one dataset are two
    // payloads, and caching them under one key would serve the wrong race.
    queryKey: ["graph1-dataset", base, datasetKey, query],
    // the page holds off until the catalog names a dataset
    enabled: options.enabled ?? true,
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    // A 4xx is the backend's final answer — a refusal, a bad key, an unknown
    // entity. Retrying only delays the message. Transient failures still do.
    retry: (count, error) =>
      count < 1 &&
      !(error instanceof Graph1HttpError && error.status < 500),
    queryFn: async () => {
      const started = performance.now();
      const res = await fetch(datasetUrl(base, datasetKey, options.scope));
      if (!res.ok) {
        throw new Graph1HttpError(
          res.status,
          `GRAPH1 dataset ${datasetKey}: HTTP ${res.status}`,
          await readErrorDetail(res),
        );
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
