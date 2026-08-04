/**
 * Shared native top-10 race renderer — presentation ONLY.
 *
 * One component serves every launch configuration; entity-specific looks
 * (champion icon vs player initials) flow exclusively through the entity
 * registry's media descriptor. It receives a fully computed RaceFrameState
 * and positions rows with transforms; it never calculates canonical totals,
 * never reorders source events, and contains no requestAnimationFrame.
 * That keeps it directly reusable from a future Remotion composition.
 */
import type { Graph1EntityPresentation } from "@/graph1/contract";
import type { RaceFrameState, RaceRow } from "@/graph1/engine";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 52;
const ACCENTS = [
  "bg-amber-600",
  "bg-sky-600",
  "bg-emerald-600",
  "bg-rose-600",
  "bg-violet-600",
  "bg-cyan-700",
  "bg-orange-600",
  "bg-teal-600",
  "bg-fuchsia-700",
  "bg-lime-700",
];

/** deterministic accent from the stable entity id (never from rank) */
export function accentClassFor(entityId: string): string {
  let h = 0;
  for (let i = 0; i < entityId.length; i++) {
    h = (h * 31 + entityId.charCodeAt(i)) | 0;
  }
  return ACCENTS[Math.abs(h) % ACCENTS.length];
}

function Avatar({ entity }: { entity: Graph1EntityPresentation }) {
  if (entity.media.kind === "image") {
    return (
      <img
        src={entity.media.src}
        alt={entity.displayName}
        loading="lazy"
        className="h-9 w-9 shrink-0 rounded-md object-cover bg-muted"
      />
    );
  }
  const text = entity.media.value;
  return (
    <div
      aria-hidden
      className={cn(
        "h-9 w-9 shrink-0 rounded-md flex items-center justify-center",
        "text-xs font-bold text-white",
        accentClassFor(entity.id),
      )}
    >
      {text}
    </div>
  );
}

function Row({
  row,
  entity,
  metricLabel,
}: {
  row: RaceRow;
  entity: Graph1EntityPresentation;
  metricLabel: string;
}) {
  return (
    <div
      data-entity-id={entity.id}
      role="listitem"
      aria-label={`Rank ${row.rank}: ${entity.displayName}, ${row.displayValue} ${metricLabel}`}
      className="absolute inset-x-0 flex items-center gap-2 px-1"
      style={{
        height: ROW_HEIGHT,
        transform: `translateY(${row.y * ROW_HEIGHT}px)`,
        opacity: row.opacity,
      }}
    >
      <span className="w-7 text-right text-sm font-semibold tabular-nums text-muted-foreground">
        {row.rank}
      </span>
      <Avatar entity={entity} />
      <div className="relative h-9 min-w-0 flex-1">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-r-md opacity-80",
            accentClassFor(entity.id),
          )}
          style={{ width: `${Math.max(2, row.barFraction * 100)}%` }}
        />
        <div className="absolute inset-y-0 left-2 flex items-center gap-2 min-w-0">
          <span className="truncate text-sm font-semibold text-white drop-shadow-sm">
            {entity.displayName}
          </span>
          {entity.identityStatus !== "canonical" && (
            <span
              className="rounded bg-black/30 px-1 text-[10px] uppercase tracking-wide text-white/80"
              title={`identity: ${entity.identityStatus}`}
            >
              {entity.identityStatus === "role_resolved" ? "role" : entity.identityStatus}
            </span>
          )}
        </div>
      </div>
      <span className="w-14 text-right text-sm font-bold tabular-nums">
        {row.displayValue}
      </span>
    </div>
  );
}

export interface RaceRendererProps {
  frame: RaceFrameState;
  entities: Record<string, Graph1EntityPresentation>;
  metricLabel: string;
  topN: number;
}

export default function RaceRenderer({
  frame,
  entities,
  metricLabel,
  topN,
}: RaceRendererProps) {
  return (
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
          />
        );
      })}
    </div>
  );
}
