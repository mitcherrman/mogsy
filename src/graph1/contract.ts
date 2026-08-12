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
  /** Phase 4A: the focus of a stat-growth race is the stat itself. */
  | "stat"
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
  /** Champion level this event belongs to (stat-growth races only). */
  level?: number;
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
  /** Stat races only (Phase 4A polish): ON shows only canonical checkpoint
   * values (the settled level's exact stat); OFF interpolates the number
   * between checkpoints for smoother social-clip playback. Turning it OFF
   * removes the truth guarantee, never a layer — but it still fits the
   * off-relative-to-defaults URL convention because exact is the default. */
  exactValues: boolean;
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
  "exactValues",
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
export type Graph1MetricId =
  | "cumulative_games"
  | "cumulative_wins"
  /** Phase 4A: a calculated champion stat accumulated as integer display
   * units over a level progression (monotone, so it races like a count). */
  | "champion_stat_value";

/** How to print accumulated integer units as a stat value: show
 * `value / scale` with `decimals` decimals. Absent on count metrics, whose
 * integers ARE the display value. */
export interface Graph1ValueDisplay {
  scale: number;
  decimals: number;
}

export interface Graph1MetricSpec {
  id: Graph1MetricId;
  label: string;
  unit: string;
  accumulation: "sum";
  default?: boolean;
  valueDisplay?: Graph1ValueDisplay;
}

/**
 * A discrete progression axis (Phase 4A). When present, playback advances one
 * STEP (e.g. one champion level) per cadence beat, all of a step's events
 * apply together during that step's transition, and the header labels the
 * position with `stepLabels[step]` ("Level 7") instead of a calendar date.
 * `stepEventCounts[i]` is how many consecutive events belong to step i; the
 * counts must sum to `events.length` or the progression is ignored (per-event
 * playback, exactly the pre-4A behaviour).
 */
export interface Graph1Progression {
  kind: string; // "level" today; new kinds must stay discrete-step shaped
  unitLabel: string; // "Level"
  stepLabels: string[];
  stepEventCounts: number[];
  /** Milliseconds one step occupies at 1x. Optional; consumers default it. */
  msPerStep?: number;
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
  /**
   * Source time (max imported_at of emitted rows) — deterministic builds.
   * All three are null for a zero-event race, because all three read the
   * emitted rows and a valid focus entity may legitimately have none.
   */
  generatedAt: string | null;
  firstEventAt: string | null;
  lastEventAt: string | null;
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
      id: Graph1MetricId;
      label: string;
      unit: string;
      accumulation: "sum";
      /** Present on stat metrics only (Phase 4A). */
      valueDisplay?: Graph1ValueDisplay;
    };
    scope: { id: string; label: string };
    /** Additive (Phase 4A). Absent on chronological (esports) payloads. */
    progression?: Graph1Progression;
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

/**
 * A parameterized race FAMILY (Phase 3A). Where a catalog entry is one fixed
 * race, a family is a template the user binds to a focus entity they pick; the
 * resulting dataset key is `<family.id>:<entity id>`.
 *
 * Declarative by contract: the backend must answer discovery without opening a
 * database, so a family deliberately carries no entity counts and no entity
 * list. `entitySource` names the endpoint that does.
 */
export interface Graph1Family {
  id: string;
  label: string;
  focusEntityType: string;
  rankedEntityType: Graph1EntityType;
  mediaStrategy?: "champion-icon" | "role-initials";
  keyTemplate?: string;
  entitySource?: string;
  /** Stat families ship their closed token set inline instead of an
   * entitySource endpoint (Phase 4A). */
  stats?: { id: string; label: string; unit: string }[];
  defaultEntity?: string;
  display?: Graph1DisplayHints;
  controls?: Graph1ControlSchema;
  defaultTopN?: number;
}

export interface Graph1Catalog {
  schemaVersion: number;
  datasets: Graph1CatalogEntry[];
  /** Empty against a backend that predates Phase 3A. */
  families: Graph1Family[];
}

/** Build the dataset key for one family instance. */
export function familyDatasetKey(familyId: string, entityId: string): string {
  return `${familyId}:${entityId}`;
}

/**
 * Split a dataset key into family + entity, or null when it is not a family key.
 * A legacy key such as `faker-champions` has no separator and returns null,
 * which is how the page tells the two kinds apart.
 */
export function parseFamilyDatasetKey(
  key: string | undefined,
): { familyId: string; entityId: string } | null {
  if (!key) return null;
  const at = key.indexOf(":");
  if (at <= 0 || at === key.length - 1) return null;
  return { familyId: key.slice(0, at), entityId: key.slice(at + 1) };
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
  // `families` is additive: a pre-Phase-3A backend omits it entirely, which must
  // degrade to "no parameterized families offered", never to a broken catalog.
  const families = (Array.isArray(catalog.families) ? catalog.families : []).filter(
    (family): family is Graph1Family =>
      !!family && typeof family.id === "string" && family.id.length > 0,
  );
  return { schemaVersion: catalog.schemaVersion ?? 1, datasets, families };
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
 * The dataset's progression axis, or null for per-event (chronological)
 * playback. FAIL-SAFE: a progression whose step counts do not exactly cover
 * the event list (wrong lengths, non-positive counts, wrong sum — e.g. after
 * a filter removed events) is ignored rather than trusted, because a stale
 * step map would mislabel levels and desynchronize playback.
 */
export function resolveProgression(
  dataset: VisualizationDataset,
): Graph1Progression | null {
  const progression = dataset.definition.progression;
  if (!progression) return null;
  const counts = progression.stepEventCounts;
  const labels = progression.stepLabels;
  if (!Array.isArray(counts) || !Array.isArray(labels)) return null;
  if (counts.length === 0 || counts.length !== labels.length) return null;
  let sum = 0;
  for (const count of counts) {
    if (!Number.isInteger(count) || count <= 0) return null;
    sum += count;
  }
  return sum === dataset.events.length ? progression : null;
}

/** The metric's value-display rule, or null for plain integer metrics. */
export function resolveValueDisplay(
  dataset: VisualizationDataset,
): Graph1ValueDisplay | null {
  const valueDisplay = dataset.definition.metric.valueDisplay;
  if (!valueDisplay) return null;
  if (!Number.isFinite(valueDisplay.scale) || valueDisplay.scale <= 0) {
    return null;
  }
  return valueDisplay;
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
    exactValues: declared?.exactValues ?? true,
    secondaryLabel: declared?.secondaryLabel ?? true,
  };
}

/** Cheap structural gate run after fetch, before indexing. */
export function assertDataset(value: unknown): VisualizationDataset {
  const ds = value as VisualizationDataset;
  if (!ds || ds.schemaVersion !== 1 || ds.visualizationType !== "ranked-race") {
    throw new Error("GRAPH1: unsupported dataset schema");
  }
  if (!Array.isArray(ds.events)) {
    throw new Error("GRAPH1: dataset has no events array");
  }
  // An EMPTY event list is valid and must not throw. With a parameterized focus
  // entity, "this entity has no matching games" is a real answer, and the race
  // surface already has an empty state for it — rejecting the payload here would
  // turn that into an error notice instead.
  return ds;
}
