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
  buildStatBoard,
  resolveSnapshotPoint,
  snapshotPointLabel,
  statBoardTitle,
  SNAPSHOT_ORDERS,
  type Graph1SnapshotDataset,
  type Graph1SnapshotOrder,
} from "@/graph1/snapshotContract";
import StatBoard from "./StatBoard";

export interface StatBoardState {
  pointId?: string;
  order: Graph1SnapshotOrder;
  topN: number;
}

const ORDER_LABEL: Record<Graph1SnapshotOrder, string> = {
  highest: "Highest",
  lowest: "Lowest",
};

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
  topNOptions = [5, 10, 15, 20],
}: {
  dataset: Graph1SnapshotDataset;
  state: StatBoardState;
  onStateChange: (next: StatBoardState) => void;
  topNOptions?: number[];
}) {
  // Total resolution: a stale point id from a shared link (Level 20 carried
  // onto attack range, say) falls back to the payload's declared default
  // rather than emptying the board.
  const pointId = resolveSnapshotPoint(dataset, state.pointId);
  const snapshots = dataset.definition.snapshots;
  const hasLevels = snapshots.kind === "level";

  const options = { pointId, order: state.order, topN: state.topN };
  const rows = useMemo(
    () => buildStatBoard(dataset, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataset, pointId, state.order, state.topN],
  );

  const coverage = dataset.coverage;
  const ranked = coverage.eligibleChampionCount ?? dataset.rows.length;
  const excluded = coverage.excludedChampionCount ?? 0;

  const subtitle = [
    dataset.definition.scope.label,
    `${ranked} champions ranked`,
    hasLevels ? snapshotPointLabel(dataset, pointId) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const footnote =
    `Source: ${coverage.source}` +
    (excluded > 0 ? ` · ${excluded} champion(s) excluded with accounting` : "");

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
          {topNOptions.map((n) => (
            <Button
              key={n}
              type="button"
              size="sm"
              variant={n === state.topN ? "default" : "outline"}
              aria-pressed={n === state.topN}
              onClick={() => onStateChange({ ...state, topN: n })}
            >
              {n}
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
      </div>

      <StatBoard
        title={statBoardTitle(dataset, options)}
        subtitle={subtitle}
        rows={rows}
        entities={dataset.entities}
        unit={dataset.definition.metric.unit}
        footnote={footnote}
      />
    </div>
  );
}
