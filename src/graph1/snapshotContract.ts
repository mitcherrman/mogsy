/**
 * GRAPH1 ranked-SNAPSHOT contract — schemaVersion 1 (Phase 5).
 *
 * Mirrors the backend builder (League_Combat_Simulator graph1/stat_snapshot.py).
 * A snapshot payload is NOT a race: it carries `rows`, not `events`, and it has
 * no time axis, no accumulation and no playback. One payload per stat holds
 * every champion's canonical value at every snapshot point that stat has, so
 * the order (highest/lowest), the point (Level 1 … Level 20) and the row count
 * are pure presentation choices that cost no request.
 *
 * WHY THIS IS NOT MODELLED AS A ONE-STEP RACE
 * The race engine ranks by "higher cumulative total first" and derives bar
 * length from value / leader value. A "lowest" board is therefore
 * inexpressible there without inverting the numbers — which would make the
 * printed value a lie. Snapshots rank here instead, in `buildStatBoard`, which
 * is a pure function of (payload, point, order, topN).
 *
 * Values arrive as INTEGER DISPLAY UNITS (`round(value * scale)`), the same
 * convention the stat race accumulates in, so a board prints exactly what the
 * canonical engine computed with no float text on the wire.
 */
import type {
  Graph1EntityPresentation,
  Graph1EntityRef,
  Graph1EntityType,
  Graph1MetricId,
  Graph1ControlSchema,
  Graph1Coverage,
  Graph1DisplayHints,
  Graph1ValueDisplay,
} from "./contract";

/** Level-scaled stats declare one point per level; level-independent stats
 * (move speed, attack range) declare the single "base" point, so a consumer
 * never has to special-case them. */
export type Graph1SnapshotKind = "level" | "static";

export interface Graph1SnapshotPoint {
  id: string;
  label: string;
}

export interface Graph1Snapshots {
  kind: Graph1SnapshotKind;
  unitLabel: string;
  defaultId: string;
  points: Graph1SnapshotPoint[];
}

export interface Graph1SnapshotRow {
  rankedEntityId: string;
  /** point id → integer display units. Carries exactly the declared points. */
  values: Record<string, number>;
}

export interface Graph1SnapshotDataset {
  schemaVersion: 1;
  id: string;
  visualizationType: "ranked-snapshot";
  definition: {
    title: string;
    focusEntity: Graph1EntityRef;
    rankedEntityType: Graph1EntityType;
    metric: {
      id: Graph1MetricId;
      label: string;
      unit: string;
      /** "none": a snapshot value is READ, never accumulated. */
      accumulation: "none";
      valueDisplay?: Graph1ValueDisplay;
    };
    scope: { id: string; label: string };
    snapshots: Graph1Snapshots;
    display?: Graph1DisplayHints;
    controls?: Graph1ControlSchema;
  };
  entities: Record<string, Graph1EntityPresentation>;
  rows: Graph1SnapshotRow[];
  coverage: Graph1Coverage & {
    statId?: string;
    rosterCount?: number;
    eligibleChampionCount?: number;
    excludedChampionCount?: number;
    snapshotPointCount?: number;
  };
}

export const SNAPSHOT_ORDERS = ["highest", "lowest"] as const;
export type Graph1SnapshotOrder = (typeof SNAPSHOT_ORDERS)[number];

export function isSnapshotOrder(value: unknown): value is Graph1SnapshotOrder {
  return (SNAPSHOT_ORDERS as readonly unknown[]).includes(value);
}

/**
 * Cheap structural gate run after fetch, before ranking. Mirrors
 * `assertDataset` for races: it rejects the wrong visualization type outright
 * rather than letting a race payload reach a board that cannot render it.
 *
 * An EMPTY row list is rejected, unlike an empty race: a snapshot's universe
 * is the whole roster, so zero rows means the build lost the roster, never
 * "this focus entity legitimately has no data".
 */
export function assertSnapshotDataset(value: unknown): Graph1SnapshotDataset {
  const ds = value as Graph1SnapshotDataset;
  if (
    !ds ||
    ds.schemaVersion !== 1 ||
    ds.visualizationType !== "ranked-snapshot"
  ) {
    throw new Error("GRAPH1: unsupported snapshot dataset schema");
  }
  if (!Array.isArray(ds.rows) || ds.rows.length === 0) {
    throw new Error("GRAPH1: snapshot dataset has no rows");
  }
  const points = ds.definition?.snapshots?.points;
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error("GRAPH1: snapshot dataset declares no snapshot points");
  }
  return ds;
}

/**
 * The snapshot point to show.
 *
 * Total, like every other GRAPH1 parse: an unknown or stale point id (a shared
 * link built against a different stat, a hand-edited URL) falls back to the
 * payload's declared default rather than rendering an empty board.
 */
export function resolveSnapshotPoint(
  dataset: Graph1SnapshotDataset,
  requested: string | undefined,
): string {
  const points = dataset.definition.snapshots.points;
  if (requested && points.some((p) => p.id === requested)) return requested;
  const declared = dataset.definition.snapshots.defaultId;
  if (points.some((p) => p.id === declared)) return declared;
  return points[0].id;
}

export function snapshotPointLabel(
  dataset: Graph1SnapshotDataset,
  pointId: string,
): string {
  return (
    dataset.definition.snapshots.points.find((p) => p.id === pointId)?.label ??
    pointId
  );
}

export interface StatBoardRow {
  /** 1-based position in the board */
  rank: number;
  entityId: string;
  /** canonical integer display units, straight off the payload */
  units: number;
  /** units / valueDisplay.scale — the real stat value */
  value: number;
  /** value formatted per valueDisplay.decimals, thousands-separated */
  label: string;
  /** units / the largest units among the DISPLAYED rows, in (0, 1] */
  barFraction: number;
}

export interface StatBoardOptions {
  pointId: string;
  order: Graph1SnapshotOrder;
  topN: number;
}

/**
 * Rank a snapshot payload into board rows. Pure: inputs fully determine
 * output, no clock, no randomness, no DOM — so it is directly callable from a
 * Remotion frame, exactly like the race engine's `stateAt`.
 *
 * ORDERING RULE (total, and the same rule the backend documents):
 *   1. value — descending for "highest", ascending for "lowest"
 *   2. entity id, lexical ascending
 * Rule 2 applies in BOTH directions, so tied champions always rank
 * alphabetically and the board is stable across rebuilds.
 *
 * BAR RULE: one rule, no special case — bar length is proportional to value,
 * scaled so the largest DISPLAYED value fills the row. On a "lowest" board
 * that means rank 1 has the shortest bar, which is what "lowest" should look
 * like. A zero-valued leader degrades to empty bars rather than dividing by
 * zero.
 */
export function buildStatBoard(
  dataset: Graph1SnapshotDataset,
  { pointId, order, topN }: StatBoardOptions,
): StatBoardRow[] {
  const scale = dataset.definition.metric.valueDisplay?.scale ?? 1;
  const decimals = dataset.definition.metric.valueDisplay?.decimals ?? 0;

  const ranked = dataset.rows
    .filter((row) => typeof row.values?.[pointId] === "number")
    .map((row) => ({ entityId: row.rankedEntityId, units: row.values[pointId] }))
    .sort((a, b) => {
      const delta = order === "highest" ? b.units - a.units : a.units - b.units;
      return delta !== 0 ? delta : a.entityId.localeCompare(b.entityId);
    })
    .slice(0, Math.max(1, topN));

  const widest = ranked.reduce((max, row) => Math.max(max, row.units), 0);

  return ranked.map((row, index) => ({
    rank: index + 1,
    entityId: row.entityId,
    units: row.units,
    value: row.units / scale,
    label: (row.units / scale).toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }),
    barFraction: widest > 0 ? row.units / widest : 0,
  }));
}

/**
 * The board's headline, built from what the reader actually chose:
 * "Top 10 Highest Attack Range", "Top 20 Highest Health at Level 20",
 * "Top 10 Lowest Armor at Level 1". A level-independent stat gets no "at …"
 * clause, because there is no level to name.
 */
export function statBoardTitle(
  dataset: Graph1SnapshotDataset,
  { pointId, order, topN }: StatBoardOptions,
): string {
  const direction = order === "highest" ? "Highest" : "Lowest";
  const stat = dataset.definition.metric.label;
  const at =
    dataset.definition.snapshots.kind === "level"
      ? ` at ${snapshotPointLabel(dataset, pointId)}`
      : "";
  return `Top ${topN} ${direction} ${stat}${at}`;
}
