/**
 * GRAPH1 canonical visualization contract — schemaVersion 1.
 *
 * Mirrors the backend builder (League_Combat_Simulator graph1/dataset_builder.py)
 * byte-for-byte semantics: `events` arrive ordered by `sequence`, which was
 * assigned ONCE at build time from the accepted Phase 0 ordering policy
 * (match_date → match_id → game number → game_id). Consumers replay that
 * sequence; they never re-sort or reinterpret source order.
 */

export type Graph1EntityType =
  | "champion"
  | "player"
  | "team"
  | "league"
  | "tournament"
  | "unknown";

export interface Graph1EntityRef {
  type: Graph1EntityType;
  id: string;
}

export type Graph1IdentityStatus =
  | "canonical"
  | "role_resolved"
  | "ambiguous"
  | "unmatched";

export type Graph1Media =
  | { kind: "image"; src: string; fallbackText: string }
  | { kind: "initials"; value: string }
  | { kind: "neutral"; value: string };

export interface Graph1EntityPresentation {
  id: string;
  type: Graph1EntityType;
  displayName: string;
  shortName?: string;
  identityStatus: Graph1IdentityStatus;
  media: Graph1Media;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface Graph1Event {
  sequence: number;
  occurredAt: string; // ISO-8601 Z, second resolution (verified UTC source)
  rankedEntityId: string;
  delta: number; // always 1 for cumulative-games races
  context: {
    gameId?: string;
    matchId?: string;
    gameNumber?: number;
    playerId?: string;
    rawPlayerName?: string;
    championId?: string;
    team?: string;
    league?: string;
    tournament?: string;
    patch?: string | null;
  };
}

export interface Graph1Coverage {
  source: string;
  sourceRevision?: string;
  /** Source time (max imported_at of emitted rows) — deterministic builds. */
  generatedAt: string;
  firstEventAt: string;
  lastEventAt: string;
  eligibleEventCount: number;
  excludedEventCount: number;
  distinctRankedEntityCount: number;
  identityCounts?: Record<string, number>;
  warnings: string[];
}

export interface VisualizationDataset {
  schemaVersion: 1;
  id: string;
  visualizationType: "ranked-race";
  definition: {
    title: string;
    focusEntity: Graph1EntityRef;
    rankedEntityType: Graph1EntityType;
    metric: {
      id: "cumulative_games";
      label: string;
      unit: "games";
      accumulation: "sum";
    };
    scope: { id: "all-pro"; label: string };
  };
  entities: Record<string, Graph1EntityPresentation>;
  events: Graph1Event[];
  coverage: Graph1Coverage;
}

/** Cheap structural gate run after fetch, before indexing. */
export function assertDataset(value: unknown): VisualizationDataset {
  const ds = value as VisualizationDataset;
  if (!ds || ds.schemaVersion !== 1 || ds.visualizationType !== "ranked-race") {
    throw new Error("GRAPH1: unsupported dataset schema");
  }
  if (!Array.isArray(ds.events) || ds.events.length === 0) {
    throw new Error("GRAPH1: dataset has no events");
  }
  return ds;
}
