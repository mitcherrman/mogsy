/**
 * StatBoardExplorer — controls + board for one `champion-stat-snapshot`
 * dataset.
 *
 * ONE tool, many boards. The stat lives in the dataset key (so it is the only
 * control that refetches); the snapshot point, the order and the row count are
 * read out of a single payload that already carries every champion at every
 * point, so switching Highest/Lowest or Level 1/Level 20 re-ranks in place
 * with no request and no chance of the board disagreeing with the data.
 *
 * The level control renders only for stats that HAVE levels. Move speed and
 * attack range declare a single "base" snapshot point, so there is nothing to
 * choose and the control is correctly absent rather than disabled.
 *
 * State is hoisted: the page owns it and mirrors it into the URL, exactly as
 * it does for races, so a board is shareable and reproducible.
 */
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  ALL_ROWS,
  buildStatBoard,
  findChampions,
  isAllRows,
  resolveSnapshotPoint,
  snapshotPointLabel,
  statBoardTitle,
  MIN_FIND_QUERY,
  SNAPSHOT_ORDERS,
  type Graph1RowCount,
  type Graph1SnapshotDataset,
  type Graph1SnapshotOrder,
} from "@/graph1/snapshotContract";
import StatBoard from "./StatBoard";

/**
 * Reader-facing nouns per ranked entity type. The board is shared by the
 * champion stat snapshots and the Phase-E ratio boards, and the latter rank
 * teams and players.
 */
const ENTITY_NOUNS: Record<string, { one: string; many: string; column: string }> = {
  champion: { one: "champion", many: "champions", column: "Champion" },
  team: { one: "team", many: "teams", column: "Team" },
  player: { one: "player", many: "players", column: "Player" },
};

export interface StatBoardState {
  pointId?: string;
  order: Graph1SnapshotOrder;
  /** a Top-N cap or ALL_ROWS — never a large sentinel number */
  rowCount: Graph1RowCount;
  /** champion-finder query; emphasizes rows, never filters them */
  find?: string;
}

const ORDER_LABEL: Record<Graph1SnapshotOrder, string> = {
  highest: "Highest",
  lowest: "Lowest",
};

function rowCountLabel(value: Graph1RowCount): string {
  return isAllRows(value) ? "All" : String(value);
}

function ControlGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

export default function StatBoardExplorer({
  dataset,
  state,
  onStateChange,
  rowCountOptions = [5, 10, 15, 20, ALL_ROWS],
}: {
  dataset: Graph1SnapshotDataset;
  state: StatBoardState;
  onStateChange: (next: StatBoardState) => void;
  rowCountOptions?: Graph1RowCount[];
}) {
  // Total resolution: a stale point id from a shared link (Level 20 carried
  // onto attack range, say) falls back to the payload's declared default
  // rather than emptying the board.
  const pointId = resolveSnapshotPoint(dataset, state.pointId);
  const snapshots = dataset.definition.snapshots;
  const hasLevels = snapshots.kind === "level";

  const options = { pointId, order: state.order, rowCount: state.rowCount };
  const rows = useMemo(
    () => buildStatBoard(dataset, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataset, pointId, state.order, state.rowCount],
  );

  // The finder runs over the ALREADY-RANKED rows and returns ids to
  // emphasize. It cannot reorder, cannot remove and cannot change a value.
  const query = state.find ?? "";
  const found = useMemo(
    () => findChampions(rows, dataset.entities, query),
    [rows, dataset.entities, query],
  );

  /**
   * What this board ranks.
   *
   * Read from the payload's declared `rankedEntityType`, because a Phase-E
   * ratio board reuses this contract to rank TEAMS or PLAYERS. Defaults to the
   * champion wording every stat board had, so nothing pre-Phase-E moves.
   */
  const noun = ENTITY_NOUNS[dataset.definition.rankedEntityType] ?? ENTITY_NOUNS.champion;

  const coverage = dataset.coverage;
  const ranked = coverage.eligibleChampionCount ?? dataset.rows.length;
  const excluded = coverage.excludedChampionCount ?? 0;

  const subtitle = [
    dataset.definition.scope.label,
    `${ranked} ${ranked === 1 ? noun.one : noun.many} ranked`,
    hasLevels ? snapshotPointLabel(dataset, pointId) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const footnote =
    `Source: ${coverage.source}` +
    (excluded > 0 ? ` · ${excluded} ${noun.one}(s) excluded with accounting` : "");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <ControlGroup label="Order">
          {SNAPSHOT_ORDERS.map((order) => (
            <Button
              key={order}
              type="button"
              size="sm"
              variant={order === state.order ? "default" : "outline"}
              aria-pressed={order === state.order}
              onClick={() => onStateChange({ ...state, order })}
            >
              {ORDER_LABEL[order]}
            </Button>
          ))}
        </ControlGroup>

        <ControlGroup label="Rows">
          {rowCountOptions.map((option) => (
            <Button
              key={String(option)}
              type="button"
              size="sm"
              variant={option === state.rowCount ? "default" : "outline"}
              aria-pressed={option === state.rowCount}
              onClick={() => onStateChange({ ...state, rowCount: option })}
            >
              {rowCountLabel(option)}
            </Button>
          ))}
        </ControlGroup>

        {hasLevels && (
          <label className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            {snapshots.unitLabel}
            <select
              aria-label={snapshots.unitLabel}
              value={pointId}
              onChange={(e) =>
                onStateChange({ ...state, pointId: e.target.value })
              }
              className="rounded border border-border bg-background px-1.5 py-1 text-xs normal-case tracking-normal text-foreground"
            >
              {snapshots.points.map((point) => (
                <option key={point.id} value={point.id}>
                  {point.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Smallest input that answers "where does this champion rank". The
            esports EntityPicker was considered and rejected: it needs a second
            request to /api/graph1/entities/champions and carries family
            semantics this board does not have, while the snapshot payload
            already ships every champion it can match. */}
        <label className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          Find {noun.one}
          <input
            type="search"
            aria-label={`Find ${noun.one}`}
            placeholder={`Search ${noun.one}…`}
            value={query}
            onChange={(e) => onStateChange({ ...state, find: e.target.value })}
            className="w-40 rounded border border-border bg-background px-2 py-1 text-xs normal-case tracking-normal text-foreground"
          />
        </label>
      </div>

      {query.trim().length >= MIN_FIND_QUERY && (
        <p role="status" className="text-xs text-muted-foreground">
          {found.missed
            ? `No ${noun.one} on this board matches “${query.trim()}”.`
            : found.matches.size === 1
              ? `${dataset.entities[found.best!]?.displayName} is rank ${
                  rows.find((r) => r.entityId === found.best)?.rank
                } of ${rows.length}.`
              : `${found.matches.size} ${noun.many} match “${query.trim()}”.`}
        </p>
      )}

      <StatBoard
        entityLabel={noun.column}
        title={statBoardTitle(dataset, options, rows.length)}
        subtitle={subtitle}
        rows={rows}
        entities={dataset.entities}
        unit={dataset.definition.metric.unit}
        footnote={footnote}
        highlightedIds={found.matches}
        scrollToId={found.best}
      />
    </div>
  );
}
