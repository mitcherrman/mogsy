/**
 * /dev/graph1 — GRAPH1 native bar-race dev page.
 *
 * Every race renders through the SAME RacePlayer/RaceRenderer; the selector
 * only changes which dataset is fetched, and it is built from the discovery
 * endpoint rather than a hardcoded list, so a newly declared race appears
 * here with no frontend change.
 *
 * This page owns the URL. Control state (dataset, top-N, filters, non-default
 * display toggles) is mirrored into the query string so a race view can be
 * shared and reproduced exactly. A `?api=` override points the fetches at a
 * local backend and is carried through every URL update.
 */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import RacePlayer from "@/components/graph1/RacePlayer";
import { Button } from "@/components/ui/button";
import { resolveDisplayToggles } from "@/graph1/contract";
import {
  initialControlState,
  parseControlState,
  serializeControlState,
  type Graph1ControlState,
} from "@/graph1/controlState";
import { reconcileFilters, deriveFacets } from "@/graph1/filters";
import { resolveDatasetKey, useGraph1Catalog } from "@/graph1/useGraph1Catalog";
import { useGraph1Dataset } from "@/graph1/useGraph1Dataset";

function Notice({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "error";
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "text-sm text-destructive"
          : "text-sm text-muted-foreground"
      }
    >
      {children}
    </p>
  );
}

export default function Graph1RacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const apiOverride = searchParams.get("api") ?? undefined;

  const catalog = useGraph1Catalog(apiOverride);
  const datasetKey = resolveDatasetKey(catalog.data, searchParams.get("d") ?? undefined);
  const entry = catalog.data?.datasets.find((d) => d.key === datasetKey);

  const { data, isLoading, error } = useGraph1Dataset(
    datasetKey ?? "",
    apiOverride,
    { enabled: Boolean(datasetKey) },
  );

  // Toggle defaults come from the loaded payload when we have it, and from
  // the catalog entry beforehand, so the URL can be parsed against the right
  // baseline either way. Both resolve by VALUE, never by field presence.
  const toggleDefaults = useMemo(
    () =>
      data
        ? resolveDisplayToggles(data)
        : {
            winOverlay: entry?.display?.defaultToggles?.winOverlay ?? true,
            eventHeader: entry?.display?.defaultToggles?.eventHeader ?? true,
            contextLine: entry?.display?.defaultToggles?.contextLine ?? true,
            entityMedia: entry?.display?.defaultToggles?.entityMedia ?? true,
            rankNumber: entry?.display?.defaultToggles?.rankNumber ?? true,
            valueLabel: entry?.display?.defaultToggles?.valueLabel ?? true,
            dateLabel: entry?.display?.defaultToggles?.dateLabel ?? true,
            secondaryLabel:
              entry?.display?.defaultToggles?.secondaryLabel ?? true,
          },
    [data, entry],
  );

  const controls = data?.definition.controls ?? entry?.controls;

  const state = useMemo<Graph1ControlState | undefined>(() => {
    if (!datasetKey) return undefined;
    const parsed = parseControlState(searchParams, toggleDefaults, {
      datasetKey,
      controls,
    });
    // a shared link may name values this dataset does not have
    return data
      ? { ...parsed, filters: reconcileFilters(parsed.filters, deriveFacets(data)) }
      : parsed;
  }, [searchParams, toggleDefaults, datasetKey, controls, data]);

  const commit = useCallback(
    (next: Graph1ControlState) => {
      setSearchParams(
        serializeControlState(next, toggleDefaults, {
          controls,
          preserve: searchParams,
        }),
        { replace: true },
      );
    },
    [setSearchParams, toggleDefaults, controls, searchParams],
  );

  const selectDataset = useCallback(
    (key: string) => {
      // a new race has its own facets and defaults: start clean rather than
      // carrying filters that mean nothing here
      commit(initialControlState(key, toggleDefaults, controls));
    },
    [commit, toggleDefaults, controls],
  );

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">GRAPH1 · ranked race</h1>

        {catalog.isLoading && <Notice>Loading datasets…</Notice>}
        {catalog.error instanceof Error && (
          <Notice tone="error">
            {catalog.error.message} — the dataset catalog is unavailable
          </Notice>
        )}
        {catalog.data && catalog.data.datasets.length === 0 && (
          <Notice>No datasets are available from this backend.</Notice>
        )}

        {catalog.data && catalog.data.datasets.length > 0 && (
          <nav aria-label="Dataset" className="flex flex-wrap gap-2">
            {catalog.data.datasets.map((d) => (
              <Button
                key={d.key}
                type="button"
                size="sm"
                variant={d.key === datasetKey ? "default" : "outline"}
                aria-pressed={d.key === datasetKey}
                onClick={() => selectDataset(d.key)}
                title={d.scopeDescription}
              >
                {d.title}
              </Button>
            ))}
          </nav>
        )}

        {entry?.snapshot?.eventCount !== undefined && !data && (
          <Notice>
            {entry.snapshot.eventCount.toLocaleString()} games ·{" "}
            {entry.snapshot.rankedEntityCount?.toLocaleString()}{" "}
            {entry.rankedEntityType}s
          </Notice>
        )}
      </header>

      {isLoading && datasetKey && <Notice>Loading dataset…</Notice>}
      {error instanceof Error && (
        <Notice tone="error">
          {error.message} — start the local API and pass
          ?api=http://localhost:8321
        </Notice>
      )}
      {data && state && (
        <RacePlayer
          key={data.id}
          dataset={data}
          state={state}
          onStateChange={commit}
        />
      )}
    </main>
  );
}
