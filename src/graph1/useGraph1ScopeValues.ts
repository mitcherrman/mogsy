/**
 * Scope-value discovery (GET /api/graph1/scope-values).
 *
 * The four scope dimensions are DATA, never a hardcoded list: leagues,
 * tournaments, regions and patches all change as the sport does, and only
 * values with qualifying professional data are offered — a filter that could
 * only ever produce an empty graph is not shown at all.
 *
 * Each option carries its exact canonical `value` (what the request and the
 * URL must use — `league=LCK` matches nothing, `league=LoL Champions Korea`
 * does) alongside a friendly `label`. Never key off the label.
 *
 * One request answers every dimension and is cached for the session, so
 * opening the scope panel costs nothing after the first time.
 */
import { useQuery } from "@tanstack/react-query";

import { GRAPH1_API_BASE } from "./useGraph1Dataset";

export interface Graph1ScopeOption {
  /** Exact canonical identity. Goes into the URL and the request unchanged. */
  value: string;
  /** Friendly display name, e.g. "LCK" for "LoL Champions Korea". */
  label: string;
  games: number;
  /** Leagues and tournaments: part of the highlighted major-pro set. */
  major?: boolean;
  /** Tournaments only: the league this tournament belongs to. */
  league?: string;
}

interface ScopeDimension {
  total: number;
  values: Graph1ScopeOption[];
}

export interface Graph1ScopeValues {
  leagues: ScopeDimension;
  tournaments: ScopeDimension;
  regions: ScopeDimension;
  patches: ScopeDimension;
}

const EMPTY: ScopeDimension = { total: 0, values: [] };

export function useGraph1ScopeValues(apiBase?: string, enabled = true) {
  const origin = (apiBase || GRAPH1_API_BASE).replace(/\/+$/, "");
  return useQuery<Graph1ScopeValues>({
    queryKey: ["graph1-scope-values", origin],
    enabled,
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const res = await fetch(`${origin}/api/graph1/scope-values`);
      if (!res.ok) throw new Error(`GRAPH1 scope values: HTTP ${res.status}`);
      const raw = (await res.json()) as Partial<Graph1ScopeValues>;
      // A dimension the backend has not shipped yet reads as empty, so its
      // control simply does not render — never as a crash.
      return {
        leagues: raw.leagues ?? EMPTY,
        tournaments: raw.tournaments ?? EMPTY,
        regions: raw.regions ?? EMPTY,
        patches: raw.patches ?? EMPTY,
      };
    },
  });
}

/** Canonical value -> friendly label, for rendering a scope someone shared. */
export function scopeLabelIndex(
  values: Graph1ScopeValues | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!values) return out;
  for (const dim of [values.leagues, values.tournaments, values.regions]) {
    for (const option of dim.values) out[option.value] = option.label;
  }
  return out;
}

/**
 * Patches newest-first.
 *
 * Discovery returns them in chronological order (by the backend's numeric
 * `patch_sort`, so "16.9" sorts before "16.10" — a string sort would not).
 * That order is the authority; this only reverses it, because the patch a
 * reader wants is almost always the current one.
 */
export function patchesNewestFirst(
  values: Graph1ScopeValues | undefined,
): Graph1ScopeOption[] {
  return [...(values?.patches.values ?? [])].reverse();
}

/**
 * Tournaments for the selected league, or all of them when none is selected.
 *
 * Composing league + tournament is legal, so this narrows rather than
 * replaces: it is a convenience for finding "Worlds 2024 Main Event" among
 * 820 tournaments, not an eligibility rule.
 */
export function tournamentsForLeague(
  values: Graph1ScopeValues | undefined,
  league: string | undefined,
): Graph1ScopeOption[] {
  const all = values?.tournaments.values ?? [];
  if (!league) return all;
  const scoped = all.filter((t) => t.league === league);
  // A league whose tournaments are not labelled must not silently offer none.
  return scoped.length ? scoped : all;
}
