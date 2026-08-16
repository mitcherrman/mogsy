/**
 * Shared native top-10 race renderer — presentation ONLY.
 *
 * One component serves every launch configuration; entity-specific looks
 * (champion icon vs player initials, secondary team/region context) flow
 * exclusively through the entity registry's media descriptor, engine row
 * state and the narrow declarative display hints. It receives a fully
 * computed RaceFrameState and positions rows with transforms; it never
 * calculates canonical totals, never reorders source events, and contains
 * no requestAnimationFrame. That keeps it directly reusable from a future
 * Remotion composition.
 *
 * Win/loss encoding: the FULL bar length is total games painted in the
 * entity's dim base color (the un-overlaid remainder IS the losses — real
 * data, not absence); the brighter same-hue segment inset from the left is
 * cumulative wins. A legend states the encoding.
 */
import type {
  Graph1EntityPresentation,
  Graph1ValueDisplay,
} from "@/graph1/contract";
import { entityColor } from "@/graph1/colors";
import type { RaceFrameState, RaceRow } from "@/graph1/engine";
import { cn } from "@/lib/utils";
// Phase 5: the media ladder moved out so the stat board resolves entity
// avatars through the SAME code path. Behaviour here is unchanged.
import EntityAvatar, {
  NativeLazyImg,
  type Graph1ImageComponent,
} from "./EntityAvatar";
import RoleGlyph from "./RoleGlyph";

const ROW_HEIGHT = 52;

/**
 * The value printed beside a bar. Count metrics show the whole-unit integer
 * at floor(position) — numbers step while bars glide (the Phase 1 look).
 *
 * Stat metrics (valueDisplay present) have two modes:
 *   exact (default) — only canonical checkpoint values are ever printed: the
 *   settled level's stat holds through the transition and switches directly
 *   at the next checkpoint. Bars and ranks still animate; the number is
 *   deliberately stepped because the intermediate numbers are not real
 *   champion stats.
 *   smooth — the interpolated value scaled to stat units, ticking with the
 *   bar and landing exactly on the canonical value at every checkpoint (the
 *   social-clip look).
 */
function formatRowValue(
  row: RaceRow,
  valueDisplay: Graph1ValueDisplay | null | undefined,
  exactValues: boolean,
): string {
  if (!valueDisplay) return String(row.displayValue);
  const units = exactValues ? row.checkpointValue : row.value;
  return (units / valueDisplay.scale).toFixed(valueDisplay.decimals);
}

/**
 * Layer switches. The two original fields keep their names and meaning; the
 * Phase 2 additions are optional and default ON, so a caller that passes only
 * the original pair renders exactly what it rendered before.
 */
export interface RaceRendererDisplay {
  showWinOverlay: boolean;
  showSecondaryEntityLabel: boolean;
  showEntityMedia?: boolean;
  showRankNumber?: boolean;
  showValueLabel?: boolean;
  /** stat metrics only: false interpolates the printed number between
   * checkpoints (smooth mode). Omitted/true = exact checkpoint values. */
  exactValues?: boolean;
}

/** Kept as an alias so every existing caller and test keeps compiling; the
 * type itself now lives with the shared avatar. */
export type RaceRendererImageComponent = Graph1ImageComponent;

function rowAriaLabel(
  row: RaceRow,
  entity: Graph1EntityPresentation,
  metricLabel: string,
  display: RaceRendererDisplay,
  valueDisplay: Graph1ValueDisplay | null | undefined,
): string {
  let label = `Rank ${row.rank}: ${entity.displayName}, ${formatRowValue(row, valueDisplay, display.exactValues !== false)} ${metricLabel}`;
  if (display.showWinOverlay) {
    label += `, ${row.displayWins} wins, ${row.displayLosses} losses`;
  }
  if (display.showSecondaryEntityLabel && row.latestContext) {
    const { team, region } = row.latestContext;
    if (team) label += `, ${team}${region ? ` (${region})` : ""}`;
  }
  return label;
}

function Row({
  row,
  entity,
  metricLabel,
  display,
  imageComponent,
  valueDisplay,
}: {
  row: RaceRow;
  entity: Graph1EntityPresentation;
  metricLabel: string;
  display: RaceRendererDisplay;
  imageComponent: RaceRendererImageComponent;
  valueDisplay?: Graph1ValueDisplay | null;
}) {
  const color = entityColor(entity.id);
  const secondary =
    display.showSecondaryEntityLabel && row.latestContext
      ? [row.latestContext.team, row.latestContext.region]
          .filter(Boolean)
          .join(" · ")
      : null;
  return (
    <div
      data-entity-id={entity.id}
      role="listitem"
      aria-label={rowAriaLabel(row, entity, metricLabel, display, valueDisplay)}
      className="absolute inset-x-0 flex items-center gap-2 px-1"
      style={{
        height: ROW_HEIGHT,
        transform: `translateY(${row.y * ROW_HEIGHT}px)`,
        opacity: row.opacity,
      }}
    >
      {display.showRankNumber !== false && (
        <span className="w-7 text-right text-sm font-semibold tabular-nums text-muted-foreground">
          {row.rank}
        </span>
      )}
      {display.showEntityMedia !== false && (
        <EntityAvatar entity={entity} imageComponent={imageComponent} />
      )}
      <div className="relative h-9 min-w-0 flex-1">
        {/* total-games bar: dim base color; remainder past the win segment
            reads as losses */}
        <div
          data-bar="total"
          className="absolute inset-y-0 left-0 rounded-r-md"
          style={{
            width: `${Math.max(2, row.barFraction * 100)}%`,
            backgroundColor: color.base,
          }}
        />
        {display.showWinOverlay && (
          <div
            data-bar="wins"
            className="absolute inset-y-1 left-0 rounded-r-sm"
            style={{
              width: `${row.winBarFraction * 100}%`,
              backgroundColor: color.win,
              opacity: 0.9,
            }}
          />
        )}
        <div className="absolute inset-y-0 left-2 flex items-center gap-2 min-w-0">
          <span className="truncate text-sm font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {entity.displayName}
          </span>
          {secondary && (
            <span className="hidden truncate text-[11px] text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] sm:inline">
              {secondary}
            </span>
          )}
          {entity.identityStatus !== "canonical" && (
            <span
              className="rounded bg-black/40 px-1 text-[10px] uppercase tracking-wide text-white/80"
              title={`identity: ${entity.identityStatus}`}
            >
              {entity.identityStatus === "role_resolved" ? "role" : entity.identityStatus}
            </span>
          )}
        </div>
      </div>
      {display.showValueLabel !== false && (
        <span className="w-24 text-right tabular-nums">
          <span className="text-sm font-bold">
            {formatRowValue(row, valueDisplay, display.exactValues !== false)}
          </span>
          {display.showWinOverlay && (
            <span className="ml-1 hidden text-[11px] text-muted-foreground md:inline">
              {row.displayWins}W–{row.displayLosses}L
            </span>
          )}
        </span>
      )}
    </div>
  );
}

export interface RaceRendererProps {
  frame: RaceFrameState;
  entities: Record<string, Graph1EntityPresentation>;
  metricLabel: string;
  topN: number;
  display: RaceRendererDisplay;
  /** stat metrics print scaled interpolated values; omit for count metrics */
  valueDisplay?: Graph1ValueDisplay | null;
  /** defaults to a lazy native <img>; Remotion passes its <Img> */
  imageComponent?: RaceRendererImageComponent;
}

export default function RaceRenderer({
  frame,
  entities,
  metricLabel,
  topN,
  display,
  valueDisplay,
  imageComponent = NativeLazyImg,
}: RaceRendererProps) {
  return (
    <div className="space-y-2">
      <div
        role="list"
        aria-label={`Top ${topN} by ${metricLabel}`}
        className="relative overflow-hidden"
        style={{ height: topN * ROW_HEIGHT }}
      >
        {frame.rows.map((row) => {
          const entity = entities[row.entityId];
          if (!entity) return null;
          return (
            <Row
              key={entity.id}
              row={row}
              entity={entity}
              metricLabel={metricLabel}
              display={display}
              imageComponent={imageComponent}
              valueDisplay={valueDisplay}
            />
          );
        })}
      </div>
      {display.showWinOverlay && (
        <p className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span
              aria-hidden
              className={cn("inline-block h-2.5 w-5 rounded-sm")}
              style={{ backgroundColor: "#38bdf8" }}
            />
            wins (bright inset)
          </span>
          <span className="flex items-center gap-1">
            <span
              aria-hidden
              className="inline-block h-2.5 w-5 rounded-sm"
              style={{ backgroundColor: "#075985" }}
            />
            losses (dim remainder)
          </span>
          <span>bar length = total games</span>
        </p>
      )}
    </div>
  );
}
