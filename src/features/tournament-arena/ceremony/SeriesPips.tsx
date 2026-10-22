/**
 * Series pips (ported from the Dynasty `BoPips`): one pip per win needed,
 * stamped in as a game lands; "Match point" pulses when one side is a game
 * from the series. Reduced motion: pips appear filled, no pulse.
 */
import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

import { winsNeeded } from "../engine/advance";

export function SeriesPips({ wins, bestOf, tone = "gold", stampFrom, label, size = "sm" }: {
  wins: number;
  bestOf: number;
  tone?: "gold" | "red";
  /** Pips at or above this index were just won: they stamp in. */
  stampFrom?: number;
  label: string;
  size?: "sm" | "md";
}) {
  const need = winsNeeded(bestOf);
  return (
    <span className="inline-flex items-center gap-[3px]" role="img" aria-label={`${label}: ${wins} of ${need} wins`} data-testid="ta-pips">
      {Array.from({ length: need }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{ "--i": i } as CSSProperties}
          className={cn("ta-pip", size === "md" && "h-2 w-3.5", i < wins && "ta-pip--on", tone === "red" && "ta-pip--red", i < wins && stampFrom !== undefined && i >= stampFrom && "ta-pip--stamp")}
        />
      ))}
    </span>
  );
}

export function matchPoint(winsA: number, winsB: number, bestOf: number): 0 | 1 | null {
  const need = winsNeeded(bestOf);
  if (need <= 1) return null;
  if (winsA === need - 1 && winsB < need) return 0;
  if (winsB === need - 1 && winsA < need) return 1;
  return null;
}
