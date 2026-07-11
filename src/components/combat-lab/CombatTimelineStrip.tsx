import { useEffect, useRef } from "react";
import { ArrowRight, History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export type TimelineStripEntry = {
  id: number;
  index: number;
  kind: "basic-attack" | "active";
  label: string;
  abilityKey?: "Q" | "W" | "E" | "R";
  final_damage: number;
  hp_after: number;
  hp_max: number;
};

/**
 * Compact horizontal combat timeline shown directly beneath the workspace.
 * Renders the same entries as the full CombatTimelinePanel; clicking a chip
 * drives the shared selectedTimelineId so detail opens in the full panel.
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

  // keep the latest action in view
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [entries.length]);

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
            {entries.map((e, i) => {
              const isLast = i === entries.length - 1;
              const selected = selectedId === e.id;
              const name = e.abilityKey ? `${e.abilityKey}` : e.kind === "basic-attack" ? "AA" : e.label;
              return (
                <div
                  key={e.id}
                  className={`flex shrink-0 items-center gap-1.5 ${
                    isLast ? "animate-in fade-in slide-in-from-right-2 duration-300" : ""
                  }`}
                >
                  {i > 0 && <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
                  <button
                    type="button"
                    onClick={() => onSelect(selected ? null : e.id)}
                    title={`#${e.index} ${e.label} — ${Math.round(e.final_damage).toLocaleString()} dmg · ${Math.round(e.hp_after).toLocaleString()} HP left`}
                    className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? "border-primary/70 bg-primary/20 text-primary"
                        : isLast
                          ? "border-accent/50 bg-accent/10 text-foreground"
                          : "border-border/60 bg-background/40 text-foreground/80 hover:border-primary/40"
                    }`}
                  >
                    <span className="max-w-[110px] truncate">{name}</span>
                    <span className="tabular-nums font-bold text-destructive">
                      {Math.round(e.final_damage).toLocaleString()}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
