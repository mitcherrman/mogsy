import { ReactNode } from "react";
import { Swords } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Center combat card: header with the matchup and reset controls, then the
 * caller-supplied action controls. Presentational only.
 *
 * This is the primary column of the workspace, so the frame is deliberately
 * heavier than the side panels' and carries a top accent rule. The matchup used
 * to sit in a bordered banner of its own below the header; it is now inline in
 * the header, which removes a full box from the middle of the page without
 * losing the information.
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
    <Card className="relative overflow-hidden border-primary/40 bg-card/80 shadow-[0_0_28px_-16px_hsl(var(--primary)/0.7)] backdrop-blur-sm">
      <div className="h-[2px] w-full bg-gradient-to-r from-primary/0 via-primary/70 to-accent/0" />
      <CardContent className="space-y-2.5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <Swords className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 truncate text-sm font-bold text-primary">{attackerName}</span>
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              vs
            </span>
            <span className="min-w-0 truncate text-sm font-bold text-accent">{defenderName}</span>
          </div>
          {controls}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
