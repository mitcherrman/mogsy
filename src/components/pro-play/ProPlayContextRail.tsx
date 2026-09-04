/**
 * The context rail — everything a longer question stem would have said.
 *
 * "In LCK, across their full careers, who has the higher win rate on Kennen"
 * becomes a short stem plus four chips: CHAMPION → PLAYER · LCK · ALL TIME ·
 * WIN RATE. That is the product decision Step 1 encoded and this renders; the
 * stem is never re-expanded to compensate.
 *
 * The server has ALREADY sorted and deduplicated `scope_tags` — "LCK 2026"
 * suppresses a separate "LCK" and "2026" — so this maps them in order and
 * neither re-sorts nor re-filters. Doing either here would silently diverge
 * from the contract's own dedup rule.
 */
import ProPlayTooltip from "./ProPlayTooltip";
import { cn } from "@/lib/utils";
import {
  RECENT_ESPORTS_TAG,
  type ProPlayQuestionContext,
  type ProPlayTag,
} from "@/lib/pro-play/contract";

/**
 * Chip tone per scope-tag type. Restrained on purpose: the brief asks for a
 * readable metadata hierarchy, not a tag cloud, so competition identity
 * (league/tournament/pro) carries the gold accent the Pro Play surface
 * already uses, and the temporal facts (year, patch, all-time) stay quiet.
 */
const TAG_TONE: Record<string, string> = {
  league: "border-[#c9a84c]/35 bg-[#c9a84c]/10 text-[#e2c98a]",
  pro_play: "border-[#c9a84c]/35 bg-[#c9a84c]/10 text-[#e2c98a]",
  tournament: "border-[#c9a84c]/30 bg-[#c9a84c]/[0.07] text-[#e2c98a]",
  year: "border-border bg-muted/40 text-muted-foreground",
  patch: "border-border bg-muted/40 text-muted-foreground",
  all_time: "border-border bg-muted/40 text-muted-foreground",
};

const DEFAULT_TONE = "border-border bg-muted/40 text-muted-foreground";

const CHIP_BASE =
  "inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 " +
  "text-[10px] font-semibold uppercase leading-tight tracking-wide";

/**
 * A chip. With a tooltip it becomes a focusable disclosure (see
 * `ProPlayTooltip`), so the hidden text — "LoL Champions Korea" behind "LCK" —
 * is reachable by keyboard and touch, not only by hover.
 */
function Chip({
  label,
  tooltip,
  tone,
  testId,
  dataType,
}: {
  label: string;
  tooltip?: string | null;
  tone: string;
  testId?: string;
  dataType?: string;
}) {
  return (
    <ProPlayTooltip
      label={label}
      tooltip={tooltip}
      testId={testId}
      className="max-w-full"
    >
      <span className={cn(CHIP_BASE, tone, "truncate")} data-tag-type={dataType}>
        {label}
      </span>
    </ProPlayTooltip>
  );
}

export interface ProPlayContextRailProps {
  context: ProPlayQuestionContext;
  className?: string;
}

export default function ProPlayContextRail({
  context,
  className,
}: ProPlayContextRailProps) {
  const scopeTags: ProPlayTag[] = Array.isArray(context.scope_tags)
    ? context.scope_tags
    : [];
  return (
    <div
      data-pro-play-context-rail
      // `flex-wrap` rather than a scroller: at 375px a four-chip rail wraps to
      // two short lines, which reads better than a hidden horizontal overflow
      // the user has to discover.
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      <Chip
        label={context.relationship.label}
        tone="border-[#c9a84c]/45 bg-[#c9a84c]/15 text-[#f0dcae]"
        testId="pro-play-relationship"
        dataType="relationship"
      />
      {scopeTags.map((tag) => (
        <Chip
          key={`${tag.type}:${tag.id ?? tag.label}`}
          label={tag.label}
          tooltip={tag.tooltip}
          tone={TAG_TONE[tag.type] ?? DEFAULT_TONE}
          testId="pro-play-scope-tag"
          dataType={tag.type}
        />
      ))}
      <Chip
        label={context.metric.label}
        tooltip={context.metric.tooltip}
        tone="border-sky-400/30 bg-sky-400/10 text-sky-200"
        testId="pro-play-metric-tag"
        dataType="metric"
      />
      {(context.editorial_tags ?? []).map((tag) => (
        <Chip
          key={tag.id}
          // Present, not dominant: this is a review/current-emphasis marker,
          // not a permanent brand taxonomy, so it gets a distinct hue and the
          // same weight as every other chip.
          label={tag.id === RECENT_ESPORTS_TAG ? "Recent Esports" : tag.label}
          tooltip={tag.tooltip ?? tag.label}
          tone="border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
          testId="pro-play-editorial-tag"
          dataType="editorial"
        />
      ))}
    </div>
  );
}
