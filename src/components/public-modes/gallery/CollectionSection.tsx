/**
 * MC-UX1 — one collection of the gallery: a compact heading (what kind of
 * games, how often) over its cards.
 */
import type { ReactNode } from "react";
import { Crosshair, PauseCircle, Sun, Swords } from "lucide-react";
import type { GalleryGroup } from "@/lib/public-modes/gallery";
import { cn } from "@/lib/utils";

const MARK = { daily_extras: Sun, knowledge_arena: Swords, precision_recall: Crosshair, more: Sun } as const;

export function CollectionSection({ group, pausedReason = null, children }: {
  group: GalleryGroup;
  /** Every card here is paused for this one reason: say it once. */
  pausedReason?: string | null;
  children: ReactNode;
}) {
  const Mark = MARK[group.id];
  const headingId = `mc-${group.id}-title`;
  return (
    <section id={`mc-${group.id}`} className="mc-section flex flex-col gap-3" aria-labelledby={headingId}
      data-testid={`more-challenges-collection-${group.id}`}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <span className="mc-section-mark" aria-hidden="true"><Mark className="h-3.5 w-3.5 text-[#f0d78c]" /></span>
          <h2 id={headingId} className="ranked-title text-xl font-semibold sm:text-2xl">{group.title}</h2>
          <span className="mc-section-rule" aria-hidden="true" />
          {group.cadence && <span className="mc-cadence">{group.cadence}</span>}
        </div>
        {group.blurb && (
          <p className="pl-10 text-[13px] leading-snug text-[color:var(--ranked-muted)] sm:text-sm">{group.blurb}</p>
        )}
        {pausedReason && (
          <p className="ml-10 mt-1 inline-flex items-center gap-2 self-start rounded-md border border-[rgba(169,179,193,0.3)]
            bg-[rgba(7,15,28,0.7)] px-3 py-1.5 text-[13px] text-[#d4dae2]" role="status"
            data-testid={`more-challenges-paused-${group.id}`}>
            <PauseCircle className="h-4 w-4 flex-none opacity-80" aria-hidden="true" />
            {pausedReason}
          </p>
        )}
      </div>
      <ul
        className={cn(
          "grid grid-cols-1 gap-3 sm:grid-cols-2",
          group.id === "daily_extras" ? "lg:grid-cols-2" : "lg:grid-cols-6",
        )}
        data-testid={`more-challenges-grid-${group.id}`}
      >
        {children}
      </ul>
    </section>
  );
}
