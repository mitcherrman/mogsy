/**
 * /dev/graph1 — GRAPH1 native bar-race dev page.
 *
 * Every race renders through the SAME RacePlayer/RaceRenderer; the selector
 * only changes which dataset is fetched, and it is built from the discovery
 * endpoint rather than a hardcoded list, so a newly declared race appears
 * here with no frontend change.
 *
 * Phase 3A adds parameterized FAMILIES alongside the two fixed races. Choosing
 * `Player -> champions` or `Champion -> players` selects a template; a searchable
 * picker then binds it to any valid focus entity, producing the dataset key
 * `<family>:<entity>`. Faker and Azir survive both as frozen legacy races and as
 * the default focus values of the two families.
 *
 * This page owns the URL. Control state (dataset, top-N, filters, non-default
 * display toggles) is mirrored into the query string so a race view can be
 * shared and reproduced exactly. A `?api=` override points the fetches at a
 * local backend and is carried through every URL update.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import EntityPicker from "@/components/graph1/EntityPicker";
import RacePlayer from "@/components/graph1/RacePlayer";
import { Button } from "@/components/ui/button";
import {
  familyDatasetKey,
  parseFamilyDatasetKey,
  resolveDisplayToggles,
  type Graph1DisplayToggles,
} from "@/graph1/contract";
import {
  initialControlState,
  parseControlState,
  serializeControlState,
  type Graph1ControlState,
} from "@/graph1/controlState";
import { reconcileFilters, deriveFacets } from "@/graph1/filters";
import { resolveDatasetKey, useGraph1Catalog } from "@/graph1/useGraph1Catalog";
import { useGraph1Dataset } from "@/graph1/useGraph1Dataset";
import {
  useDebounced,
  useGraph1Champions,
  useGraph1PlayerSearch,
  type Graph1Entity,
} from "@/graph1/useGraph1Entities";

/**
 * Default focus entity per family. These are the two races that shipped as
 * hand-registered datasets and are now what the audit called for: example
 * parameter values, not engineered datasets. Clicking a family lands on a race
 * that already works, and the picker changes it from there.
 */
const FAMILY_DEFAULT_FOCUS: Record<string, string> = {
  "player-champions": "Faker",
  "champion-players": "azir",
  // The stat family's tokens are stats, not roster entities; AD is the only
  // one this phase, so selecting the family lands straight on the race and
  // no picker is rendered (focusEntityType "stat" matches neither picker).
  "champion-stat-growth": "attack-damage",
};

const MAX_CHAMPION_ROWS = 40;

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

  // A family instance key is `<family>:<entity>`; a legacy key has no separator.
  const instance = parseFamilyDatasetKey(datasetKey ?? undefined);
  const families = catalog.data?.families ?? [];
  const activeFamily = instance
    ? families.find((f) => f.id === instance.familyId)
    : undefined;
  const focusType = activeFamily?.focusEntityType;

  const { data, isLoading, error } = useGraph1Dataset(
    datasetKey ?? "",
    apiOverride,
    { enabled: Boolean(datasetKey) },
  );

  // Toggle defaults come from the loaded payload when we have it, and from
  // the catalog entry beforehand, so the URL can be parsed against the right
  // baseline either way. Both resolve by VALUE, never by field presence.
  const toggleDefaults = useMemo<Graph1DisplayToggles>(() => {
    if (data) return resolveDisplayToggles(data);
    // Pre-payload baseline: a fixed race has a catalog entry, a family instance
    // has the family's declared defaults. Resolve by VALUE, never by presence.
    const declared =
      entry?.display?.defaultToggles ?? activeFamily?.display?.defaultToggles;
    return {
      winOverlay: declared?.winOverlay ?? true,
      eventHeader: declared?.eventHeader ?? true,
      contextLine: declared?.contextLine ?? true,
      entityMedia: declared?.entityMedia ?? true,
      rankNumber: declared?.rankNumber ?? true,
      valueLabel: declared?.valueLabel ?? true,
      dateLabel: declared?.dateLabel ?? true,
      secondaryLabel: declared?.secondaryLabel ?? true,
    };
  }, [data, entry, activeFamily]);

  const controls =
    data?.definition.controls ?? entry?.controls ?? activeFamily?.controls;

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
    (next: Graph1ControlState, { push = false }: { push?: boolean } = {}) => {
      setSearchParams(
        serializeControlState(next, toggleDefaults, {
          controls,
          preserve: searchParams,
        }),
        // Filter/toggle tweaks REPLACE so Back does not walk every slider nudge.
        // Changing which race is shown is real navigation and PUSHES, so
        // Back/Forward traverses the entities the reader looked at.
        { replace: !push },
      );
    },
    [setSearchParams, toggleDefaults, controls, searchParams],
  );

  const selectDataset = useCallback(
    (key: string) => {
      // a new race has its own facets and defaults: start clean rather than
      // carrying filters that mean nothing here
      commit(initialControlState(key, toggleDefaults, controls), { push: true });
    },
    [commit, toggleDefaults, controls],
  );

  const selectFamily = useCallback(
    (familyId: string) => {
      const current = parseFamilyDatasetKey(datasetKey ?? undefined);
      if (current?.familyId === familyId) return;
      // catalog-declared default first (stat families ship one), then the
      // hardcoded fallbacks that predate it
      const entityId =
        families.find((f) => f.id === familyId)?.defaultEntity ??
        FAMILY_DEFAULT_FOCUS[familyId];
      if (!entityId) return;
      selectDataset(familyDatasetKey(familyId, entityId));
    },
    [datasetKey, families, selectDataset],
  );

  const selectEntity = useCallback(
    (entity: Graph1Entity) => {
      if (!instance) return;
      selectDataset(familyDatasetKey(instance.familyId, entity.id));
    },
    [instance, selectDataset],
  );

  // --- focus-entity pickers -------------------------------------------------
  const [entityQuery, setEntityQuery] = useState("");
  // A query typed for players means nothing for champions; clear on family change.
  useEffect(() => setEntityQuery(""), [instance?.familyId]);

  const debouncedQuery = useDebounced(entityQuery);
  const championsQuery = useGraph1Champions(apiOverride, focusType === "champion");
  const playersQuery = useGraph1PlayerSearch(
    debouncedQuery,
    apiOverride,
    focusType === "player",
  );

  // 172 champions arrive once and filter locally, so typing costs no requests.
  const championOptions = useMemo(() => {
    const all = championsQuery.data?.entities ?? [];
    const needle = entityQuery.trim().toLowerCase();
    const matches = needle
      ? all.filter(
          (c) =>
            c.label.toLowerCase().includes(needle) || c.id.includes(needle),
        )
      : all;
    return {
      rows: matches.slice(0, MAX_CHAMPION_ROWS),
      hidden: Math.max(0, matches.length - MAX_CHAMPION_ROWS),
    };
  }, [championsQuery.data, entityQuery]);

  const playerRows = playersQuery.data?.entities ?? [];
  const focusLabel = data
    ? data.entities[data.definition.focusEntity.id]?.displayName
    : undefined;

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

        {families.length > 0 && (
          <nav aria-label="Race family" className="flex flex-wrap gap-2">
            {families.map((family) => (
              <Button
                key={family.id}
                type="button"
                size="sm"
                variant={family.id === instance?.familyId ? "default" : "outline"}
                aria-pressed={family.id === instance?.familyId}
                onClick={() => selectFamily(family.id)}
              >
                {family.label}
              </Button>
            ))}
          </nav>
        )}

        {activeFamily && focusType === "player" && (
          <EntityPicker
            label="Player"
            options={playerRows}
            selectedId={instance?.entityId}
            selectedLabel={focusLabel}
            onSelect={selectEntity}
            query={entityQuery}
            onQueryChange={setEntityQuery}
            placeholder="Search players…"
            loading={playersQuery.isLoading || playersQuery.isFetching}
            error={Boolean(playersQuery.error)}
            hiddenCount={
              playerRows.length >= (playersQuery.data?.limit ?? 25) ? 1 : 0
            }
          />
        )}

        {activeFamily && focusType === "champion" && (
          <EntityPicker
            label="Champion"
            options={championOptions.rows}
            selectedId={instance?.entityId}
            selectedLabel={focusLabel}
            onSelect={selectEntity}
            query={entityQuery}
            onQueryChange={setEntityQuery}
            placeholder="Search champions…"
            loading={championsQuery.isLoading}
            error={Boolean(championsQuery.error)}
            hiddenCount={championOptions.hidden}
          />
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
          {/* User-facing copy: a shared link may name a focus entity that is not
              selectable, which is a 404 from the API, not a local-setup problem. */}
          This race could not be loaded. The selected{" "}
          {focusType ?? "dataset"} may no longer be available — try another from
          the picker above.{" "}
          <span className="opacity-70">({error.message})</span>
        </Notice>
      )}
      {data && state && (
        <RacePlayer
          key={data.id}
          dataset={data}
          datasetKey={datasetKey ?? undefined}
          state={state}
          onStateChange={commit}
        />
      )}
    </main>
  );
}
