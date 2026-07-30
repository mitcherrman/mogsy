import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, History, Swords } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  groupConsecutiveTimelineEntries,
  type TimelineRun,
} from "@/lib/combat-lab/timelineGroups";

export type TimelineStripEntry = {
  id: number;
  index: number;
  kind: "basic-attack" | "active";
  action_id?: string;
  label: string;
  abilityKey?: "Q" | "W" | "E" | "R";
  abilityRank?: number;
  defender?: string;
  final_damage: number;
  raw_damage?: number;
  damage_type?: string | null;
  shield_absorbed?: number;
  damage_reduction_percent?: number | null;
  hp_after: number;
  hp_max: number;
  events?: unknown[];
  /** Stored ability art for this action, when one could be resolved. */
  iconUrl?: string | null;
};

/** Newest runs are always shown; anything older hides behind `+N more`. */
const VISIBLE_RUNS = 6;

const round = (n: number) => Math.round(n).toLocaleString();

/**
 * Compact horizontal combat timeline shown directly beneath the workspace.
 *
 * Consecutive identical actions collapse into one pill (`AA ×7 · 107 each`) —
 * see lib/combat-lab/timelineGroups for the equivalence rule. The collapse is
 * display-only: `entries` is never rewritten, every underlying action stays
 * addressable, and clicking a pill still drives the shared selectedTimelineId so
 * the full panel opens the detail for it. When a run stands for several actions
 * its pill selects the most recent of them, which is the one whose HP figure the
 * pill is showing.
 */
export default function CombatTimelineStrip({
  entries,
  selectedId,
  onSelect,
}: {
  entries: TimelineStripEntry[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showAll, setShowAll] = useState(false);

  const runs = useMemo(() => groupConsecutiveTimelineEntries(entries), [entries]);
  const hiddenCount = Math.max(0, runs.length - VISIBLE_RUNS);
  const visibleRuns = showAll || hiddenCount === 0 ? runs : runs.slice(-VISIBLE_RUNS);

  // Keep the latest action in view. `scrollTo` is guarded because environments
  // without a layout engine (jsdom) do not implement it, and an effect that
  // throws here takes the whole workspace down with it.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === "function") {
      el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    }
  }, [entries.length, showAll]);

  return (
    <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
      <CardContent className="flex items-center gap-3 px-3 py-2">
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <History className="h-3.5 w-3.5 text-primary" />
          Timeline
          {entries.length > 0 && (
            <span className="rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 tabular-nums">
              {entries.length}
            </span>
          )}
        </div>
        {entries.length === 0 ? (
          <div className="text-xs text-muted-foreground/70">
            No actions yet — cast a basic attack or ability to start the sequence.
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5"
          >
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="shrink-0 rounded-md border border-border/60 bg-background/40 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {showAll
                  ? `Hide ${hiddenCount} earlier`
                  : `+${hiddenCount} more`}
                <span className="sr-only">
                  {showAll
                    ? ` — collapse the ${hiddenCount} earlier timeline entries`
                    : ` — show ${hiddenCount} earlier timeline entries`}
                </span>
              </button>
            )}
            {visibleRuns.map((run, i) => (
              <TimelinePill
                key={run.key}
                run={run}
                showArrow={i > 0 || (hiddenCount > 0 && !showAll)}
                isLatest={i === visibleRuns.length - 1}
                selected={run.entries.some((e) => e.id === selectedId)}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TimelinePill({
  run,
  showArrow,
  isLatest,
  selected,
  onSelect,
}: {
  run: TimelineRun<TimelineStripEntry>;
  showArrow: boolean;
  isLatest: boolean;
  selected: boolean;
  onSelect: (id: number | null) => void;
}) {
  const e = run.latest;
  const name = e.abilityKey ? e.abilityKey : e.kind === "basic-attack" ? "AA" : e.label;
  const repeated = run.count > 1;
  const damageText = repeated
    ? `${round(run.damageEach)} each`
    : round(e.final_damage);
  const title = repeated
    ? `#${run.first.index}–#${e.index} ${e.label} ×${run.count} — ${round(run.damageEach)} dmg each, ${round(run.totalDamage)} total · ${round(e.hp_after)} HP left`
    : `#${e.index} ${e.label} — ${round(e.final_damage)} dmg · ${round(e.hp_after)} HP left`;
  const accessibleName = repeated
    ? `${e.label}, repeated ${run.count} times, ${round(run.damageEach)} damage each, ${round(e.hp_after)} HP remaining`
    : `Action ${e.index}, ${e.label}, ${round(e.final_damage)} damage, ${round(e.hp_after)} HP remaining`;

  return (
    <div
      className={`flex shrink-0 items-center gap-1.5 ${
        isLatest ? "animate-in fade-in slide-in-from-right-2 duration-300" : ""
      }`}
    >
      {showArrow && <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
      <button
        type="button"
        onClick={() => onSelect(selected ? null : e.id)}
        title={title}
        aria-label={accessibleName}
        aria-pressed={selected}
        className={`flex items-center gap-1.5 rounded-md border py-1 pl-1 pr-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          selected
            ? "border-primary/70 bg-primary/20 text-primary"
            : isLatest
              ? "border-primary/50 bg-primary/10 text-foreground shadow-[0_0_14px_-6px_hsl(var(--primary)/0.8)]"
              : "border-border/60 bg-background/40 text-foreground/80 hover:border-primary/40"
        }`}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-background/70 ring-1 ring-inset ring-white/10">
          {e.iconUrl ? (
            <img src={e.iconUrl} alt="" draggable={false} className="h-full w-full object-cover" />
          ) : (
            <Swords className="h-3 w-3 text-foreground/60" />
          )}
        </span>
        <span className="max-w-[110px] truncate">{name}</span>
        {repeated && (
          <span className="rounded-sm bg-foreground/10 px-1 text-[10px] font-bold tabular-nums text-foreground/80">
            ×{run.count}
          </span>
        )}
        <span className="tabular-nums font-bold text-destructive">{damageText}</span>
      </button>
    </div>
  );
}
