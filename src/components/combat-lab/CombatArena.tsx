import { ReactNode } from "react";
import { Swords } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Center combat card: header with the matchup and reset controls, then the
 * caller-supplied action controls. Presentational only.
 *
 * This is the primary column of the workspace, but it no longer says so with a
 * bright gold outline. A gold frame here, a gold Basic Attack border and gold
 * ability accents inside it all competed at the same volume, so nothing read as
 * more important than anything else. Dominance now comes from what the column
 * *is*: a more opaque surface than the side panels, a real drop shadow that
 * lifts it off the page, and a hairline neutral frame. Gold is left for the
 * things that earn it — an active control, a result, a status change.
 */
export default function CombatArena({
  attackerName,
  defenderName,
  controls,
  status,
  children,
}: {
  attackerName: string;
  defenderName: string;
  controls?: ReactNode;
  /** Optional banner between the header and the controls (e.g. defeated). */
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="relative overflow-hidden border-border/70 bg-card/95 shadow-[0_14px_36px_-20px_hsl(215_80%_2%/0.95)] backdrop-blur-sm">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
      <CardContent className="space-y-2.5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <Swords className="h-4 w-4 shrink-0 text-foreground/60" />
            <span className="min-w-0 truncate text-sm font-bold text-foreground">{attackerName}</span>
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              vs
            </span>
            <span className="min-w-0 truncate text-sm font-bold text-foreground/90">
              {defenderName}
            </span>
          </div>
          {controls}
        </div>
        {status}
        {children}
      </CardContent>
    </Card>
  );
}
