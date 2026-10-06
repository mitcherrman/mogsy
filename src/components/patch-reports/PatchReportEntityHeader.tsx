import { useState } from "react";
import { Link2 } from "lucide-react";
import {
  resolvePatchReportAsset,
  type PatchEditorialDirection,
  type PatchEditorialSource,
  type PatchEntityType,
  type PatchReportCard,
} from "@/lib/patch-reports/api";
import type { EditorialResolution } from "@/lib/patch-reports/report-structure";
import { cn } from "@/lib/utils";
import type { PatchReportEntityContext, PatchReportEntrySlots } from "./PatchReportEntrySlots";
import { PatchReportStatusMark } from "./PatchReportStatus";

const TYPE_LABEL: Record<PatchEntityType, string> = {
  champion: "Champion",
  item: "Item",
  rune: "Rune",
  system: "System",
};

const GENERIC_SECTIONS = new Set(["Champions", "Items", "Runes"]);

const DIRECTION: Record<PatchEditorialDirection, { label: string; glyph: string; tone: string }> = {
  buff: { label: "Buff", glyph: "▲", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  nerf: { label: "Nerf", glyph: "▼", tone: "border-red-500/40 bg-red-500/10 text-red-300" },
  adjustment: { label: "Adjustment", glyph: "◆", tone: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
};

const SOURCE_TEXT: Record<PatchEditorialSource, string> = {
  riot_section: "Riot's own section",
  riot_text_semantic: "Riot's patch text",
  riot_patch_highlights: "Riot's patch highlights",
  mogzy_inferred: "inferred by Mogzy",
};

/** Size classes of the report's entity image; Catch-Up passes a smaller set. */
const ENTITY_IMAGE_SIZE = "h-16 w-16 sm:h-20 sm:w-20";

export const EntityImage = ({
  card,
  sizeClassName = ENTITY_IMAGE_SIZE,
}: {
  card: PatchReportCard;
  sizeClassName?: string;
}) => {
  const [errored, setErrored] = useState(false);
  // Prefer Mogzy-served assets; fall back to the official image; degrade to initials.
  const src =
    (!errored && resolvePatchReportAsset(card.mogzy_image_path)) ||
    (!errored && card.official_image_url) ||
    null;
  if (!src) {
    return (
      <div
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-lg font-bold text-muted-foreground sm:text-xl",
          sizeClassName,
        )}
      >
        {card.entity_name.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={card.entity_name}
      loading="lazy"
      onError={() => setErrored(true)}
      className={cn("shrink-0 rounded-lg border border-[#c9a84c]/40 object-cover shadow-sm", sizeClassName)}
    />
  );
};

/**
 * Direction is only ever shown when the backend supplies it, and its source is
 * stated. A Mogzy-inferred direction is labelled as such rather than worn as
 * though it were Riot's claim.
 */
export const DirectionChip = ({ editorial }: { editorial: EditorialResolution }) => {
  const { direction, source, inferred } = editorial;
  if (!direction || !DIRECTION[direction]) return null;
  const { label, glyph, tone } = DIRECTION[direction];
  return (
    <span
      data-testid="patch-report-direction"
      title={source ? `${label} — ${SOURCE_TEXT[source]}` : label}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        tone,
      )}
    >
      <span aria-hidden>{glyph}</span>
      {label}
      {inferred && <span className="font-normal opacity-80">(inferred)</span>}
    </span>
  );
};

export const PatchReportEntityHeader = ({
  ctx,
  headingLevel,
  hideSectionBadge,
  showDirection,
  slots,
}: {
  ctx: PatchReportEntityContext;
  headingLevel: 2 | 3 | 4 | 5;
  hideSectionBadge: boolean;
  showDirection: boolean;
  slots?: PatchReportEntrySlots;
}) => {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4" | "h5";
  const { card, anchor: anchorId, editorial } = ctx.entity;
  const showSection = !hideSectionBadge && !GENERIC_SECTIONS.has(card.section_title);
  // "System" is a backend bucket (Arena champions, Mayhem augments, …), not a
  // useful label to a reader; the official section name says it better.
  const showType = card.entity_type !== "system";
  const count = card.changes.length;
  const share = slots?.entityShare?.(ctx) ?? null;

  return (
    <header className="flex items-start gap-3 px-4 pt-4 sm:gap-4 sm:px-5">
      <EntityImage card={card} />
      <div className="min-w-0 flex-1">
        {(showType || showSection) && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {showType && <span>{TYPE_LABEL[card.entity_type]}</span>}
            {showSection && (
              <span className={showType ? "normal-case tracking-normal" : undefined}>
                {showType && "· "}
                {card.section_title}
              </span>
            )}
          </p>
        )}
        <div className="group/title flex flex-wrap items-center gap-x-3 gap-y-1">
          <Heading id={`${anchorId}-title`} className="text-xl font-bold leading-tight sm:text-2xl">
            {card.entity_name}
          </Heading>
          <a
            href={share?.href ?? `#${anchorId}`}
            aria-label={share ? `Copy link to ${card.entity_name} changes` : `Link to ${card.entity_name} changes`}
            data-testid={share ? "patch-report-entity-share" : undefined}
            onClick={
              share
                ? (event) => {
                    // Keep modified clicks (new tab / window) native.
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                    event.preventDefault();
                    share.onShare();
                  }
                : undefined
            }
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded p-1 text-muted-foreground opacity-60 transition-opacity hover:text-[#c9a84c] hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60 motion-reduce:transition-none"
          >
            <Link2 aria-hidden className="h-4 w-4" />
          </a>
          {showDirection && <DirectionChip editorial={editorial} />}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            {count} change{count === 1 ? "" : "s"}
          </span>
          <PatchReportStatusMark status={card.aggregate_status} />
          {!card.mogzy_entity_ref && card.entity_type !== "system" && (
            <span className="italic">not in Mogzy&apos;s catalog yet</span>
          )}
        </p>
      </div>
      {slots?.entityActions && <div className="shrink-0">{slots.entityActions(ctx)}</div>}
    </header>
  );
};
