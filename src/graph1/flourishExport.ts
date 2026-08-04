/**
 * Deterministic Flourish-compatible tabular export — pure transforms only.
 *
 * Consumes an already-built canonical VisualizationDataset (the exact JSON
 * the backend builder writes and the golden digest manifest pins) and
 * produces three sheets per dataset:
 *
 *   games sheet  — Flourish bar-chart-race wide form: one row per ranked
 *                  entity; columns Label, Entity ID, Image, then one
 *                  cumulative-games column per observed month. Matches the
 *                  backend exporter's sampling convention (value = cumulative
 *                  total as of the LAST event inside that month) so the two
 *                  tools agree column-for-column.
 *   wins sheet   — same shape, cumulative wins. Flourish has no layered
 *                  two-metric bar, so wins ship as a separate sheet; rows in
 *                  BOTH sheets are ordered by final total games (then id) so
 *                  the files line up row-for-row.
 *   events sheet — long form, full fidelity: one row per event in sequence
 *                  order with the exact occurredAt timestamp, entity id +
 *                  label + identity status, per-event deltas, running
 *                  cumulative games/wins, and every context field. This is
 *                  the sheet that preserves what the wide form's monthly
 *                  sampling cannot.
 *
 * Everything here is a pure function of the dataset — no wall clock, no
 * randomness, no filesystem. Byte-level concerns (sha256 hashing, writing)
 * live in scripts/export-graph1-flourish.ts. The race engine and Remotion
 * composition are deliberately not imported: cumulative reduction is
 * re-derived independently here, mirroring the backend's final_totals /
 * final_wins reconciliation functions, and the final wide column is asserted
 * against it before anything is returned.
 *
 * Digest traceability: `digestLines` reproduces the backend totals_digest
 * preimage (`<entityId>\t<total>\n`, ids sorted) so sha256(digestLines(...))
 * can be compared verbatim against finalTotalsDigest / finalWinsDigest in
 * graph1/fixtures/graph1_digests.json.
 */
import type { Graph1Event, VisualizationDataset } from "./contract";

// ---------------------------------------------------------------------------
// independent cumulative reductions (reconciliation, mirrors backend)

export function finalTotals(dataset: VisualizationDataset): Map<string, number> {
  const totals = new Map<string, number>();
  for (const e of dataset.events) {
    totals.set(e.rankedEntityId, (totals.get(e.rankedEntityId) ?? 0) + e.delta);
  }
  return totals;
}

export function finalWins(dataset: VisualizationDataset): Map<string, number> {
  const wins = new Map<string, number>();
  for (const e of dataset.events) {
    wins.set(e.rankedEntityId, (wins.get(e.rankedEntityId) ?? 0) + (e.winsDelta ?? 0));
  }
  return wins;
}

/** Backend totals_digest preimage: `<id>\t<value>\n` per entity, ids sorted.
 * sha256 of this string must equal the pinned finalTotalsDigest /
 * finalWinsDigest for the same dataset. (Sort is JS default UTF-16 code-unit
 * order — identical to Python's code-point sort for all BMP ids.) */
export function digestLines(values: Map<string, number>): string {
  return [...values.keys()]
    .sort()
    .map((id) => `${id}\t${values.get(id)}\n`)
    .join("");
}

// ---------------------------------------------------------------------------
// CSV serialization (RFC 4180, deterministic bytes)

export type CsvCell = string | number;

function csvField(value: CsvCell): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8-ready CSV text: LF line endings, single trailing newline. */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvField).join(","));
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// wide sheets (Flourish bar chart race)

export interface Sheet {
  header: string[];
  rows: CsvCell[][];
}

export type WideMetric = "totalGames" | "wins";

/** Months observed in the event stream, in stream order (events arrive
 * ordered by sequence, whose occurredAt is non-decreasing). */
function observedMonths(events: Graph1Event[]): string[] {
  const months: string[] = [];
  for (const e of events) {
    const month = e.occurredAt.slice(0, 7);
    if (months.length === 0 || months[months.length - 1] !== month) {
      months.push(month);
    }
  }
  return months;
}

/** Row order shared by BOTH wide sheets: final total games desc, id asc. */
export function wideRowOrder(dataset: VisualizationDataset): string[] {
  const games = finalTotals(dataset);
  return [...games.keys()].sort((a, b) => {
    const diff = games.get(b)! - games.get(a)!;
    return diff !== 0 ? diff : a < b ? -1 : 1;
  });
}

export function buildWideSheet(
  dataset: VisualizationDataset,
  metric: WideMetric,
): Sheet {
  const events = dataset.events;
  const months = observedMonths(events);

  // cumulative snapshot at the end of each observed month (replay in
  // sequence order — the dataset's authoritative ordering)
  const running = new Map<string, number>();
  const perMonth = new Map<string, Map<string, number>>();
  let monthIdx = 0;
  for (const e of events) {
    const month = e.occurredAt.slice(0, 7);
    while (month !== months[monthIdx]) {
      perMonth.set(months[monthIdx], new Map(running));
      monthIdx += 1;
    }
    const delta = metric === "totalGames" ? e.delta : (e.winsDelta ?? 0);
    running.set(e.rankedEntityId, (running.get(e.rankedEntityId) ?? 0) + delta);
  }
  perMonth.set(months[monthIdx], new Map(running));

  // reconciliation: the replayed end state must equal the independent
  // reduction the golden digests are computed from
  const canonical = metric === "totalGames" ? finalTotals(dataset) : finalWins(dataset);
  if (running.size !== canonical.size) {
    throw new Error(`GRAPH1 flourish: ${metric} replay diverged (entity count)`);
  }
  for (const [id, v] of canonical) {
    if (running.get(id) !== v) {
      throw new Error(`GRAPH1 flourish: ${metric} replay diverged for ${id}`);
    }
  }

  const header = ["Label", "Entity ID", "Image", ...months];
  const rows: CsvCell[][] = [];
  for (const id of wideRowOrder(dataset)) {
    const entity = dataset.entities[id];
    if (!entity) throw new Error(`GRAPH1 flourish: no entity registry entry for ${id}`);
    const image = entity.media.kind === "image" ? entity.media.src : "";
    const row: CsvCell[] = [entity.displayName, id, image];
    for (const month of months) {
      row.push(perMonth.get(month)?.get(id) ?? 0);
    }
    if (row[row.length - 1] !== (canonical.get(id) ?? 0)) {
      throw new Error(`GRAPH1 flourish: final column mismatch for ${id}`);
    }
    rows.push(row);
  }
  return { header, rows };
}

// ---------------------------------------------------------------------------
// long events sheet (full fidelity)

export const EVENTS_HEADER = [
  "sequence",
  "occurred_at",
  "entity_id",
  "entity_type",
  "entity_label",
  "identity_status",
  "delta",
  "wins_delta",
  "cumulative_games",
  "cumulative_wins",
  "game_id",
  "match_id",
  "game_number",
  "player_id",
  "raw_player_name",
  "champion_id",
  "team",
  "opponent",
  "league",
  "region",
  "tournament",
  "patch",
] as const;

export function buildEventsSheet(dataset: VisualizationDataset): Sheet {
  const games = new Map<string, number>();
  const wins = new Map<string, number>();
  const rows: CsvCell[][] = [];
  for (const e of dataset.events) {
    const id = e.rankedEntityId;
    const entity = dataset.entities[id];
    if (!entity) throw new Error(`GRAPH1 flourish: no entity registry entry for ${id}`);
    const g = (games.get(id) ?? 0) + e.delta;
    const w = (wins.get(id) ?? 0) + (e.winsDelta ?? 0);
    games.set(id, g);
    wins.set(id, w);
    const c = e.context;
    rows.push([
      e.sequence,
      e.occurredAt,
      id,
      entity.type,
      entity.displayName,
      entity.identityStatus,
      e.delta,
      e.winsDelta ?? 0,
      g,
      w,
      c.gameId ?? "",
      c.matchId ?? "",
      c.gameNumber ?? "",
      c.playerId ?? "",
      c.rawPlayerName ?? "",
      c.championId ?? "",
      c.team ?? "",
      c.opponent ?? "",
      c.league ?? "",
      c.region ?? "",
      c.tournament ?? "",
      c.patch ?? "",
    ]);
  }
  return { header: [...EVENTS_HEADER], rows };
}
