/**
 * StatBoard — the GRAPH1 ranked stat board. Presentation ONLY.
 *
 * Receives already-ranked rows from `buildStatBoard` (pure, in
 * snapshotContract.ts) and paints them. It computes no ranking, no ordering
 * and no stat value, contains no requestAnimationFrame and reads no clock —
 * the same discipline that keeps RaceRenderer directly reusable from a
 * Remotion composition.
 *
 * It is a BOARD, not a race frame: rows are in normal document flow rather
 * than absolutely positioned transforms, because nothing moves. That is what
 * lets it size to its content, wrap gracefully on a phone, and screenshot
 * cleanly — the "shareable Mogzy asset" the phase is for.
 *
 * Entity media goes through the shared EntityAvatar ladder, so a champion's
 * icon, initials fallback and color are identical here and in the race.
 */
import { useEffect, useRef } from "react";

import type { Graph1EntityPresentation } from "@/graph1/contract";
import { entityColor } from "@/graph1/colors";
import type { StatBoardRow } from "@/graph1/snapshotContract";
import { useReducedMotion } from "@/graph1/useReducedMotion";
import EntityAvatar, {
  NativeLazyImg,
  type Graph1ImageComponent,
} from "./EntityAvatar";

/** Medal tint for the top three. Purely decorative — rank is always printed
 * as a number too, so this never carries information on its own (and stays
 * legible to a reader who cannot distinguish the hues). */
function rankAccent(rank: number): string {
  if (rank === 1) return "text-amber-300";
  if (rank === 2) return "text-slate-300";
  if (rank === 3) return "text-orange-400";
  return "text-muted-foreground";
}

function BoardRow({
  row,
  entity,
  unit,
  imageComponent,
  highlighted = false,
  scrollTarget = false,
}: {
  row: StatBoardRow;
  entity: Graph1EntityPresentation;
  unit: string;
  imageComponent: Graph1ImageComponent;
  /** emphasized by the champion finder — presentation only */
  highlighted?: boolean;
  /** the one match to bring into view */
  scrollTarget?: boolean;
}) {
  const color = entityColor(entity.id);
  const ref = useRef<HTMLLIElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!scrollTarget) return;
    // jsdom and older browsers have no scrollIntoView — highlighting is the
    // feature, scrolling is the courtesy, so its absence must never throw
    ref.current?.scrollIntoView?.({
      block: "center",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [scrollTarget, reducedMotion, row.entityId]);

  return (
    <li
      ref={ref}
      data-entity-id={entity.id}
      data-rank={row.rank}
      data-highlighted={highlighted || undefined}
      aria-current={highlighted ? "true" : undefined}
      aria-label={`Rank ${row.rank}: ${entity.displayName}, ${row.label} ${unit}`}
      className={
        "flex items-center gap-2 sm:gap-3 rounded-lg transition-shadow" +
        // Emphasis only — no hue that would read as good/bad performance, and
        // nothing that changes the rank, the bar or the printed value.
        (highlighted
          ? " bg-primary/10 ring-2 ring-primary/70 shadow-[0_0_18px_-4px_hsl(var(--primary))] px-1 py-0.5"
          : "")
      }
    >
      <span
        className={
          "w-7 shrink-0 text-right text-base font-bold tabular-nums " +
          (highlighted ? "text-primary" : rankAccent(row.rank))
        }
      >
        {row.rank}
      </span>
      <EntityAvatar
        entity={entity}
        imageComponent={imageComponent}
        className="h-10 w-10"
      />
      <div className="relative h-10 min-w-0 flex-1 overflow-hidden rounded-md bg-muted/40">
        <div
          data-bar="value"
          className="absolute inset-y-0 left-0 rounded-md"
          style={{
            // never a zero-width sliver: the shortest bar on a "lowest" board
            // still has to read as a bar
            width: `${Math.max(3, row.barFraction * 100)}%`,
            backgroundColor: color.base,
          }}
        />
        <div className="absolute inset-y-0 left-3 flex items-center">
          <span className="truncate text-sm font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {entity.displayName}
          </span>
        </div>
      </div>
      <span className="w-16 shrink-0 text-right text-sm font-bold tabular-nums sm:w-20 sm:text-base">
        {row.label}
      </span>
    </li>
  );
}

export interface StatBoardProps {
  title: string;
  subtitle?: string;
  rows: StatBoardRow[];
  entities: Record<string, Graph1EntityPresentation>;
  /** printed in the a11y label and the column caption, e.g. "Armor" */
  unit: string;
  /** provenance line under the board — kept visible because a screenshot of
   * this travels without the page around it */
  footnote?: string;
  /** defaults to a lazy native <img>; Remotion would pass its <Img> */
  imageComponent?: Graph1ImageComponent;
  /** champion-finder matches to emphasize. Presentation only: the board still
   * renders every row it was given, in the order it was given them. */
  highlightedIds?: ReadonlySet<string>;
  /** the single match to scroll into view */
  scrollToId?: string | null;
  /**
   * Caption for the entity column, e.g. "Team". Defaults to "Champion", which
   * is what every stat board is — but a Phase-E ratio board ranks teams or
   * players, and calling those champions is simply wrong on screen.
   */
  entityLabel?: string;
}

export default function StatBoard({
  title,
  subtitle,
  rows,
  entities,
  unit,
  footnote,
  imageComponent = NativeLazyImg,
  highlightedIds,
  scrollToId,
  entityLabel = "Champion",
}: StatBoardProps) {
  return (
    <section
      data-testid="graph1-stat-board"
      className="rounded-xl border border-border bg-gradient-to-b from-background to-muted/30 p-4 sm:p-6"
    >
      <header className="mb-4 space-y-1">
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </header>

      <div className="mb-2 flex items-center gap-2 sm:gap-3">
        <span className="w-7 shrink-0 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
          #
        </span>
        <span className="w-10 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {entityLabel}
        </span>
        <span className="w-16 shrink-0 text-right text-[10px] uppercase tracking-wide text-muted-foreground sm:w-20">
          {unit}
        </span>
      </div>

      <ol aria-label={title} className="space-y-1.5">
        {rows.map((row) => {
          const entity = entities[row.entityId];
          if (!entity) return null;
          return (
            <BoardRow
              key={row.entityId}
              row={row}
              entity={entity}
              unit={unit}
              imageComponent={imageComponent}
              highlighted={highlightedIds?.has(row.entityId)}
              scrollTarget={scrollToId === row.entityId}
            />
          );
        })}
      </ol>

      {footnote && (
        <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
          {footnote}
        </p>
      )}
    </section>
  );
}
