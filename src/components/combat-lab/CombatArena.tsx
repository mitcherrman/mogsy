import { ReactNode } from "react";
import { Swords } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Center combat card: header with reset controls, attacker-vs-defender
 * banner, and the caller-supplied action controls. Presentational only.
 */
export default function CombatArena({
  attackerName,
  defenderName,
  controls,
  children,
}: {
  attackerName: string;
  defenderName: string;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="border-primary/30 bg-card/70 backdrop-blur-sm">
      <CardContent className="space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
            <Swords className="h-4 w-4 text-primary" />
            Combat
          </div>
          {controls}
        </div>
        <div className="flex items-center justify-center gap-3 rounded-md border border-border/50 bg-background/40 px-3 py-2">
          <span className="min-w-0 truncate text-sm font-bold text-primary">{attackerName}</span>
          <Swords className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">
            VS
          </span>
          <Swords className="h-4 w-4 shrink-0 rotate-180 text-muted-foreground" />
          <span className="min-w-0 truncate text-sm font-bold text-accent">{defenderName}</span>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
