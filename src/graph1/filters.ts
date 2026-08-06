/**
 * Pure filtering and facet derivation over a loaded dataset.
 *
 * Filtering happens BEFORE indexing: `applyFilters` returns a plain event
 * array, `filteredDataset` wraps it back into a dataset, and everything
 * downstream — buildRaceIndex, buildCadence, stateAt, RaceRenderer, the
 * Remotion composition — is untouched. There is still exactly one engine and
 * one renderer; a filter is a different input to them, never a second path.
 *
 * Determinism: these are pure functions of (dataset, filter state). No clock,
 * no randomness, no mutation of the source dataset. Equal filter state always
 * yields an identical event array, so frames are reproducible from a URL.
 *
 * Source ordering is preserved. Filtered events keep their ORIGINAL
 * `sequence` values, which therefore become non-contiguous — that is fine and
 * deliberate: `buildRaceIndex` walks array order and never reads `sequence`,
 * and keeping the original value preserves provenance back to the full race.
 *
 * Facets are derived here rather than served by the backend: every filterable
 * dimension already rides on each event, so a single client-side pass costs
 * nothing and needs no extra request.
 */
import type {
  Graph1Event,
  Graph1FilterSpec,
  VisualizationDataset,
} from "./contract";

export interface Graph1FilterState {
  /** inclusive UTC year bounds; null = unbounded on that side */
  yearFrom: number | null;
  yearTo: number | null;
  /** selected values; empty = no constraint */
  regions: string[];
  leagues: string[];
}

export const EMPTY_FILTERS: Graph1FilterState = {
  yearFrom: null,
  yearTo: null,
  regions: [],
  leagues: [],
};

export function isFilterActive(state: Graph1FilterState): boolean {
  return (
    state.yearFrom !== null ||
    state.yearTo !== null ||
    state.regions.length > 0 ||
    state.leagues.length > 0
  );
}

/** UTC year of an ISO-8601 Z timestamp, without constructing a Date. */
export function eventYear(event: Graph1Event): number {
  return Number(event.occurredAt.slice(0, 4));
}

/**
 * Filtered event stream.
 *
 * Returns the ORIGINAL array reference when no filter is active, so an
 * untouched race is bit-for-bit the race it was before Phase 2 (and skips a
 * pointless copy of 18k events).
 */
export function applyFilters(
  dataset: VisualizationDataset,
  state: Graph1FilterState,
): Graph1Event[] {
  if (!isFilterActive(state)) return dataset.events;

  const regions = state.regions.length ? new Set(state.regions) : null;
  const leagues = state.leagues.length ? new Set(state.leagues) : null;

  return dataset.events.filter((event) => {
    if (state.yearFrom !== null && eventYear(event) < state.yearFrom) {
      return false;
    }
    if (state.yearTo !== null && eventYear(event) > state.yearTo) return false;
    if (regions && !regions.has(event.context.region ?? "")) return false;
    if (leagues && !leagues.has(event.context.league ?? "")) return false;
    return true;
  });
}

/**
 * A dataset view over a filtered event stream.
 *
 * `entities` is deliberately carried over whole rather than pruned: the
 * renderer looks entities up by id, unreferenced entries cost nothing to
 * keep, and rebuilding the map would be the expensive part. Coverage counts
 * are recomputed so the header reports the filtered race honestly.
 */
export function filteredDataset(
  dataset: VisualizationDataset,
  state: Graph1FilterState,
): VisualizationDataset {
  const events = applyFilters(dataset, state);
  if (events === dataset.events) return dataset;

  const rankedEntityIds = new Set(events.map((e) => e.rankedEntityId));
  return {
    ...dataset,
    events,
    coverage: {
      ...dataset.coverage,
      eligibleEventCount: events.length,
      distinctRankedEntityCount: rankedEntityIds.size,
      firstEventAt: events.length
        ? events[0].occurredAt
        : dataset.coverage.firstEventAt,
      lastEventAt: events.length
        ? events[events.length - 1].occurredAt
        : dataset.coverage.lastEventAt,
    },
  };
}

// ---------------------------------------------------------------------------
// facets

export interface Graph1FacetValue {
  value: string;
  count: number;
}

export interface Graph1Facets {
  years: number[];
  minYear: number | null;
  maxYear: number | null;
  regions: Graph1FacetValue[];
  leagues: Graph1FacetValue[];
}

const EMPTY_FACETS: Graph1Facets = {
  years: [],
  minYear: null,
  maxYear: null,
  regions: [],
  leagues: [],
};

function rank(counts: Map<string, number>): Graph1FacetValue[] {
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    // most frequent first, ties alphabetical — deterministic either way
    .sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : 1));
}

/**
 * Value domains for every filterable dimension, in ONE pass over the events.
 * Counts drive the "(1,204)" hints beside options and let a combobox rank
 * 301 leagues usefully instead of alphabetically.
 */
export function deriveFacets(dataset: VisualizationDataset): Graph1Facets {
  if (dataset.events.length === 0) return EMPTY_FACETS;

  const years = new Set<number>();
  const regions = new Map<string, number>();
  const leagues = new Map<string, number>();

  for (const event of dataset.events) {
    years.add(eventYear(event));
    const region = event.context.region;
    if (region) regions.set(region, (regions.get(region) ?? 0) + 1);
    const league = event.context.league;
    if (league) leagues.set(league, (leagues.get(league) ?? 0) + 1);
  }

  const sortedYears = [...years].sort((a, b) => a - b);
  return {
    years: sortedYears,
    minYear: sortedYears[0] ?? null,
    maxYear: sortedYears[sortedYears.length - 1] ?? null,
    regions: rank(regions),
    leagues: rank(leagues),
  };
}

/**
 * Drop selections the dataset cannot satisfy and clamp the year window.
 *
 * Switching datasets, or arriving from a shared URL built against different
 * data, must not leave a filter selected that matches nothing — that reads as
 * a broken race rather than an empty filter.
 */
export function reconcileFilters(
  state: Graph1FilterState,
  facets: Graph1Facets,
): Graph1FilterState {
  const regionValues = new Set(facets.regions.map((r) => r.value));
  const leagueValues = new Set(facets.leagues.map((l) => l.value));
  const clamp = (year: number | null): number | null => {
    if (year === null || facets.minYear === null || facets.maxYear === null) {
      return year;
    }
    return Math.min(Math.max(year, facets.minYear), facets.maxYear);
  };
  const yearFrom = clamp(state.yearFrom);
  const yearTo = clamp(state.yearTo);
  return {
    yearFrom: yearFrom !== null && yearTo !== null && yearFrom > yearTo
      ? yearTo
      : yearFrom,
    yearTo,
    regions: state.regions.filter((r) => regionValues.has(r)),
    leagues: state.leagues.filter((l) => leagueValues.has(l)),
  };
}

/** Filter specs a dataset declares, split for the primary/advanced surfaces. */
export function partitionFilterSpecs(
  specs: Graph1FilterSpec[] | undefined,
): { primary: Graph1FilterSpec[]; advanced: Graph1FilterSpec[] } {
  const all = specs ?? [];
  return {
    primary: all.filter((s) => !s.advanced),
    advanced: all.filter((s) => s.advanced),
  };
}
