/**
 * Focus-entity discovery for the parameterized GRAPH1 families (Phase 3A).
 *
 * Two shapes, because the two domains are not the same size:
 *
 *   champions — 172 of them, ~30 KB. Fetched ONCE and filtered client-side, so
 *               typing is instant and costs no requests.
 *   players   — thousands. Debounced server search, one request per settled
 *               query, each keyed so React Query caches per term and an
 *               in-flight request for a stale term is dropped.
 *
 * Neither hook ever fetches a race payload; the backend answers both from an
 * in-memory index so a keystroke never reaches the facts table.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { GRAPH1_API_BASE } from "./useGraph1Dataset";

export interface Graph1EntityMedia {
  kind?: string;
  src?: string;
  value?: string;
  fallbackText?: string;
}

export interface Graph1Entity {
  id: string;
  label: string;
  games: number;
  sublabel?: string;
  country?: string;
  role?: string;
  media?: Graph1EntityMedia;
  /**
   * Part of the highlighted major-pro set. Discovery PRIORITY only — it never
   * gates access. Every listed entity is graphable, searchable and
   * deep-linkable regardless, so this must never become a filter.
   */
  featured?: boolean;
  /** Teams: the display short code (SKT/GEN/G2) used as avatar text. Display
   * ONLY — `TSM` and `Team Same Mordeczki` share one, so it is never a key. */
  short?: string;
  /** Teams: the region this identity competed in. */
  region?: string;
}

interface ChampionEntitiesResponse {
  family: string;
  total: number;
  entities: Graph1Entity[];
}

interface PlayerEntitiesResponse {
  family: string;
  query: string;
  limit: number;
  listedTotal: number;
  minGames: number;
  entities: Graph1Entity[];
}

interface TeamEntitiesResponse {
  family: string;
  query: string;
  limit: number;
  listedTotal: number;
  minGames: number;
  entities: Graph1Entity[];
}

const base = (apiBase?: string) =>
  (apiBase || GRAPH1_API_BASE).replace(/\/+$/, "");

/** Every champion, fetched once and cached for the session. */
export function useGraph1Champions(apiBase?: string, enabled = true) {
  const origin = base(apiBase);
  return useQuery<ChampionEntitiesResponse>({
    queryKey: ["graph1-entities", "champions", origin],
    enabled,
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const res = await fetch(`${origin}/api/graph1/entities/champions`);
      if (!res.ok) {
        throw new Error(`GRAPH1 champions: HTTP ${res.status}`);
      }
      return (await res.json()) as ChampionEntitiesResponse;
    },
  });
}

/** Debounce a fast-changing value so each keystroke does not become a request. */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

/**
 * Server-side player search. `query` should already be debounced.
 *
 * An empty query is a legitimate request — the backend answers it with the top
 * of the listing, which is what the picker should show before the reader types.
 */
export function useGraph1PlayerSearch(
  query: string,
  apiBase?: string,
  enabled = true,
) {
  const origin = base(apiBase);
  const q = query.trim();
  return useQuery<PlayerEntitiesResponse>({
    queryKey: ["graph1-entities", "players", origin, q],
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    queryFn: async ({ signal }) => {
      const url = new URL(`${origin}/api/graph1/entities/players`);
      if (q) url.searchParams.set("q", q);
      const res = await fetch(url.toString(), { signal });
      if (!res.ok) {
        throw new Error(`GRAPH1 players: HTTP ${res.status}`);
      }
      return (await res.json()) as PlayerEntitiesResponse;
    },
  });
}

/**
 * Server-side team search. `query` should already be debounced.
 *
 * Each row is ONE canonical team identity. A renamed organisation appears once
 * per name it has held — `SK Telecom T1` (2014-2019) and `T1` (2020-2026) have
 * zero games in common and are two separate options here on purpose. Lineage
 * is deliberately not merged, so never collapse two rows because their labels
 * or their short codes look alike.
 */
export function useGraph1TeamSearch(
  query: string,
  apiBase?: string,
  enabled = true,
) {
  const origin = base(apiBase);
  const q = query.trim();
  return useQuery<TeamEntitiesResponse>({
    queryKey: ["graph1-entities", "teams", origin, q],
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    queryFn: async ({ signal }) => {
      const url = new URL(`${origin}/api/graph1/entities/teams`);
      if (q) url.searchParams.set("q", q);
      const res = await fetch(url.toString(), { signal });
      if (!res.ok) {
        throw new Error(`GRAPH1 teams: HTTP ${res.status}`);
      }
      return (await res.json()) as TeamEntitiesResponse;
    },
  });
}

/**
 * Sort discovery results so the highlighted set leads.
 *
 * This is ORDERING, never filtering: a broader-pro player or team keeps its
 * row and stays one scroll away. Ties keep the backend's order, which is by
 * games — so the list stays deterministic and a search still ranks by
 * relevance within each group.
 */
export function featuredFirst(entities: Graph1Entity[]): Graph1Entity[] {
  return [...entities].sort(
    (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)),
  );
}
