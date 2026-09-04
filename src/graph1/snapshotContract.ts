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

/**
 * "Show every eligible champion", as a VALUE rather than a very large Top-N.
 *
 * A sentinel like 999 or 10000 would silently become wrong the moment the
 * roster outgrew it, and it would make the URL claim something the reader
 * never asked for ("top 9999"). This is a distinct member of the row-count
 * union instead, so "all" is unrepresentable as a number, cannot be
 * accidentally compared with `>`, and needs no ceiling to maintain: the board
 * simply does not slice.
 */
export const ALL_ROWS = "all" as const;

/** A Top-N cap, or the whole ranked roster. */
export type Graph1RowCount = number | typeof ALL_ROWS;

export function isAllRows(value: Graph1RowCount): value is typeof ALL_ROWS {
  return value === ALL_ROWS;
}

export interface StatBoardOptions {
  pointId: string;
  order: Graph1SnapshotOrder;
  rowCount: Graph1RowCount;
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
/**
 * One `Intl.NumberFormat` per decimal precision, reused across rows.
 *
 * `Number.toLocaleString(locale, options)` builds a formatter on EVERY call,
 * which is invisible at Top 10 and measurable at All: constructing 173 of
 * them was ~2.6 ms of the ~2.7 ms a full-roster rebuild cost. Caching the
 * handful of formatters the board can ever need takes that to ~0.1 ms, which
 * is why this board needs no virtualization.
 */
const NUMBER_FORMATS = new Map<number, Intl.NumberFormat>();

function formatValue(value: number, decimals: number): string {
  let format = NUMBER_FORMATS.get(decimals);
  if (!format) {
    format = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    NUMBER_FORMATS.set(decimals, format);
  }
  return format.format(value);
}

export function buildStatBoard(
  dataset: Graph1SnapshotDataset,
  { pointId, order, rowCount }: StatBoardOptions,
): StatBoardRow[] {
  const scale = dataset.definition.metric.valueDisplay?.scale ?? 1;
  const decimals = dataset.definition.metric.valueDisplay?.decimals ?? 0;

  const sorted = dataset.rows
    .filter((row) => typeof row.values?.[pointId] === "number")
    .map((row) => ({ entityId: row.rankedEntityId, units: row.values[pointId] }))
    .sort((a, b) => {
      const delta = order === "highest" ? b.units - a.units : a.units - b.units;
      return delta !== 0 ? delta : a.entityId.localeCompare(b.entityId);
    });

  // ALL_ROWS does not slice at all — the roster size is whatever the payload
  // carries, so a bigger roster needs no code change and no ceiling to raise.
  const ranked = isAllRows(rowCount)
    ? sorted
    : sorted.slice(0, Math.max(1, rowCount));

  const widest = ranked.reduce((max, row) => Math.max(max, row.units), 0);

  return ranked.map((row, index) => ({
    rank: index + 1,
    entityId: row.entityId,
    units: row.units,
    value: row.units / scale,
    label: formatValue(row.units / scale, decimals),
    barFraction: widest > 0 ? row.units / widest : 0,
  }));
}

/**
 * The board's headline, built from what the reader actually chose:
 * "Top 10 Highest Attack Range", "Top 20 Highest Health at Level 20",
 * "Top 10 Lowest Armor at Level 1". A level-independent stat gets no "at …"
 * clause, because there is no level to name.
 *
 * The all-rows headline states the roster size, and `renderedCount` is where
 * that number comes from — the rows actually on the board, never a constant.
 * A roster that grows to 174 reports 174 with no edit here.
 */
export function statBoardTitle(
  dataset: Graph1SnapshotDataset,
  { pointId, order, rowCount }: StatBoardOptions,
  renderedCount?: number,
): string {
  const direction = order === "highest" ? "Highest" : "Lowest";
  const stat = dataset.definition.metric.label;
  const at =
    dataset.definition.snapshots.kind === "level"
      ? ` at ${snapshotPointLabel(dataset, pointId)}`
      : "";
  if (isAllRows(rowCount)) {
    const count = renderedCount ?? dataset.rows.length;
    // A Phase-E ratio board reuses this contract to rank teams and players;
    // calling those "Champions" is wrong on screen.
    const plural =
      { champion: "Champions", team: "Teams", player: "Players" }[
        dataset.definition.rankedEntityType
      ] ?? "Champions";
    return `All ${count} ${plural} — ${direction} ${stat}${at}`;
  }
  return `Top ${rowCount} ${direction} ${stat}${at}`;
}

/** ------------------------------------------------------------------------
 * Champion finder (highlight, never filter).
 *
 * The question this answers is "where does this champion rank among
 * EVERYONE", so a match must never remove the rows around it — the context is
 * the answer. Matching is therefore a pure lookup over the already-ranked
 * board; it does not touch `buildStatBoard`, cannot reorder anything, and
 * cannot change a printed value.
 */

/** Minimum query length before anything highlights. One character matches a
 * third of the roster, which is noise rather than a finder. */
export const MIN_FIND_QUERY = 2;

/**
 * Case- and punctuation-insensitive key for a champion name.
 *
 * Champion names carry apostrophes (Kha'Zix, K'Sante, Cho'Gath, Bel'Veth),
 * periods (Dr. Mundo), ampersands (Nunu & Willump) and spaces (Aurelion Sol,
 * Renata Glasc, Master Yi). A reader typing "khazix", "dr mundo" or "nunu"
 * must find them, so every non-alphanumeric character is dropped on both
 * sides of the comparison.
 */
export function normalizeChampionName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface ChampionFindResult {
  /** entity ids to emphasize — every row whose name matches */
  matches: ReadonlySet<string>;
  /** the best-ranked match, for scroll-into-view; null when nothing matched */
  best: string | null;
  /** true when the reader typed enough to search but nothing matched */
  missed: boolean;
}

const NO_MATCHES: ChampionFindResult = {
  matches: new Set(),
  best: null,
  missed: false,
};

/**
 * Which rows a find query emphasizes.
 *
 * Substring match on the normalized name, so "kha" finds Kha'Zix and "yi"
 * finds Master Yi. Every match is highlighted (a query can legitimately name
 * several champions); `best` prefers an EXACT normalized name so typing a
 * full name lands on that champion even when it is a prefix of another —
 * "Kai'Sa" over nothing, and a hypothetical "Nunu" over "Nunu & Willump".
 * Among equally exact (or equally inexact) matches, the better-ranked row
 * wins, because `rows` is already in board order.
 */
export function findChampions(
  rows: readonly StatBoardRow[],
  entities: Record<string, Graph1EntityPresentation>,
  query: string,
): ChampionFindResult {
  const needle = normalizeChampionName(query);
  if (needle.length < MIN_FIND_QUERY) return NO_MATCHES;

  const matches = new Set<string>();
  let best: string | null = null;
  let bestIsExact = false;

  for (const row of rows) {
    const name = entities[row.entityId]?.displayName;
    if (!name) continue;
    const key = normalizeChampionName(name);
    if (!key.includes(needle)) continue;
    matches.add(row.entityId);
    const exact = key === needle;
    // rows are in board order, so the first match at a given exactness is
    // also the best-ranked one
    if (best === null || (exact && !bestIsExact)) {
      best = row.entityId;
      bestIsExact = exact;
    }
  }

  return { matches, best, missed: matches.size === 0 };
}
