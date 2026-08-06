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

/** Lane positions that carry a glyph. The backend emits only these five;
 * every other `primary_role` value (Coach, Caster, Manager, Analyst, …) and
 * every unresolved player arrives with no role at all. */
export const GRAPH1_PLAYER_ROLES = [
  "Top",
  "Jungle",
  "Mid",
  "Bot",
  "Support",
] as const;
export type Graph1PlayerRole = (typeof GRAPH1_PLAYER_ROLES)[number];

export function isGraph1PlayerRole(value: unknown): value is Graph1PlayerRole {
  return (GRAPH1_PLAYER_ROLES as readonly unknown[]).includes(value);
}

/** `role` is the Phase 2 role-enhanced initials variant. It is additive: a
 * payload without it renders exactly the ordinary initials it always did. */
export type Graph1Media =
  | { kind: "image"; src: string; fallbackText: string }
  | { kind: "initials"; value: string; role?: Graph1PlayerRole }
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

export interface Graph1EventContext {
  gameId?: string;
  matchId?: string;
  gameNumber?: number;
  playerId?: string;
  rawPlayerName?: string;
  championId?: string;
  team?: string;
  opponent?: string;
  league?: string;
  region?: string;
  tournament?: string;
  patch?: string | null;
}

export interface Graph1Event {
  sequence: number;
  occurredAt: string; // ISO-8601 Z, second resolution (verified UTC source)
  rankedEntityId: string;
  delta: number; // always 1 for cumulative-games races
  /** 1 when the participant won this game (source `win`, participant
   * perspective, validated 0/1 with zero nulls). Additive in schema v1;
   * absent only in pre-1.1 payloads, treated as 0. */
  winsDelta?: 0 | 1;
  context: Graph1EventContext;
}

/** Every display layer the user can switch off. All-true is the owner-approved
 * live appearance; a toggle removes a layer, it never adds one. */
export interface Graph1DisplayToggles {
  winOverlay: boolean;
  eventHeader: boolean;
  contextLine: boolean;
  entityMedia: boolean;
  rankNumber: boolean;
  valueLabel: boolean;
  dateLabel: boolean;
  secondaryLabel: boolean;
}

export const GRAPH1_TOGGLE_KEYS = [
  "winOverlay",
  "eventHeader",
  "contextLine",
  "entityMedia",
  "rankNumber",
  "valueLabel",
  "dateLabel",
  "secondaryLabel",
] as const satisfies readonly (keyof Graph1DisplayToggles)[];

/** Narrow declarative renderer hints — the shared renderer never branches on
 * dataset identity, only on these. `defaultToggles` is additive (Phase 2). */
export interface Graph1DisplayHints {
  contextMode: "event-header" | "latest-entity-context";
  showSecondaryEntityLabel: boolean;
  defaultToggles?: Partial<Graph1DisplayToggles>;
}

/** ------------------------------------------------------------------------
 * Declarative control schema (Phase 2, optional).
 *
 * The page builds its control surface from this rather than from per-dataset
 * React conditionals. Every field is optional at the type level because a
 * backend that predates Phase 2 omits the whole block — consumers must fall
 * back on VALUES, never on field presence.
 */
export type Graph1MetricId = "cumulative_games" | "cumulative_wins";

export interface Graph1MetricSpec {
  id: Graph1MetricId;
  label: string;
  unit: string;
  accumulation: "sum";
  default?: boolean;
}

/** Allow-listed event fields a filter may read. Mirrors FILTER_SOURCES in
 * the backend registry; anything else is rejected before it ships. */
export type Graph1FilterSource =
  | "occurredAt"
  | "context.region"
  | "context.league";

export interface Graph1FilterSpec {
  id: "year" | "region" | "league";
  kind: "range" | "enum";
  source: Graph1FilterSource;
  label: string;
  widget: "range" | "select" | "combobox";
  advanced: boolean;
}

export interface Graph1ControlSchema {
  metrics: Graph1MetricSpec[];
  filters: Graph1FilterSpec[];
  topN: { default: number; options: number[] };
  speed: { default: number; options: number[] };
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
    display?: Graph1DisplayHints;
    /** Additive (Phase 2). Absent on pre-Phase-2 payloads. */
    controls?: Graph1ControlSchema;
  };
  entities: Record<string, Graph1EntityPresentation>;
  events: Graph1Event[];
  coverage: Graph1Coverage;
}

/** ------------------------------------------------------------------------
 * Discovery catalog — GET /api/graph1/datasets (schemaVersion 2).
 *
 * Built from declared config plus pinned fixture facts; it never triggers a
 * dataset build, so it is cheap enough to be the page's first request.
 */
export interface Graph1CatalogSnapshot {
  /** true: these facts come from the committed digest manifest and may lag
   * live coverage. The loaded payload's own `coverage` is authoritative. */
  pinned: boolean;
  source?: string;
  eventCount?: number;
  rankedEntityCount?: number;
  excludedEventCount?: number;
  firstEventAt?: string;
  lastEventAt?: string;
  sourceRevision?: string;
}

export interface Graph1CatalogEntry {
  key: string;
  title: string;
  rankedEntityType: Graph1EntityType;
  focusEntity?: { type: string; label: string };
  metric?: Graph1MetricSpec;
  scope?: { id: string; label: string };
  scopeDescription?: string;
  mediaStrategy?: "champion-icon" | "role-initials";
  display?: Graph1DisplayHints;
  controls?: Graph1ControlSchema;
  defaultTopN?: number;
  snapshot?: Graph1CatalogSnapshot;
}

export interface Graph1Catalog {
  schemaVersion: number;
  datasets: Graph1CatalogEntry[];
}

/**
 * Structural gate for the catalog. Tolerates schemaVersion 1 (which carried
 * only key/title/rankedEntityType) and drops individually malformed entries
 * rather than failing the whole page — a selector with one bad row should
 * still offer the good ones.
 */
export function assertCatalog(value: unknown): Graph1Catalog {
  const catalog = value as Graph1Catalog;
  if (!catalog || !Array.isArray(catalog.datasets)) {
    throw new Error("GRAPH1: malformed dataset catalog");
  }
  const datasets = catalog.datasets.filter(
    (entry): entry is Graph1CatalogEntry =>
      !!entry && typeof entry.key === "string" && entry.key.length > 0,
  );
  return { schemaVersion: catalog.schemaVersion ?? 1, datasets };
}

/** The pre-Phase-2 hints, used whenever a payload omits `display`. */
export const GRAPH1_FALLBACK_HINTS: Graph1DisplayHints = {
  contextMode: "event-header",
  showSecondaryEntityLabel: false,
};

export function resolveDisplayHints(
  dataset: VisualizationDataset,
): Graph1DisplayHints {
  return dataset.definition.display ?? GRAPH1_FALLBACK_HINTS;
}

/** True when any event carries winsDelta (absent only in pre-1.1 payloads). */
export function datasetHasWins(dataset: VisualizationDataset): boolean {
  return dataset.events.some((e) => e.winsDelta !== undefined);
}

/**
 * Effective display-toggle defaults for a dataset.
 *
 * COMPATIBILITY RULE: fall back on VALUES, never on field presence. A backend
 * that predates Phase 2 omits `defaultToggles` entirely, and a partially
 * migrated one may send only some keys — in both cases every missing key must
 * resolve to the behaviour that shipped before, or the UI empties out
 * mid-migration. `winOverlay` in particular falls back to whether the data
 * actually carries wins, exactly as Phase 1 computed it.
 */
export function resolveDisplayToggles(
  dataset: VisualizationDataset,
): Graph1DisplayToggles {
  const declared = dataset.definition.display?.defaultToggles;
  const winsAvailable = datasetHasWins(dataset);
  return {
    winOverlay: declared?.winOverlay ?? winsAvailable,
    eventHeader: declared?.eventHeader ?? true,
    contextLine: declared?.contextLine ?? true,
    entityMedia: declared?.entityMedia ?? true,
    rankNumber: declared?.rankNumber ?? true,
    valueLabel: declared?.valueLabel ?? true,
    dateLabel: declared?.dateLabel ?? true,
    secondaryLabel: declared?.secondaryLabel ?? true,
  };
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
