/**
 * LIVE / COMPLETED / UPCOMING — the three states a reader is shown (PPH3).
 *
 * Each is its own word, shape AND colour, so the state never depends on
 * colour alone: LIVE is a solid filled badge with a pulse, COMPLETED a solid
 * neutral badge with a check, UPCOMING an outlined badge with a clock.
 *
 * A game whose feed went stale or failed is none of the three, and is never
 * forced into one: callers fall back to the live page's own `StatusPill`
 * (STALE / SOURCE FAILING / NO DATA) for that game.
 */
import { Check, Clock } from "lucide-react";

import type { MatchState } from "@/lib/pro-play/hubSeries";
import { cn } from "@/lib/utils";

export const MATCH_STATE_LABEL: Record<MatchState, string> = {
  live: "Live",
  completed: "Completed",
  upcoming: "Upcoming",
};

export default function MatchStateBadge({
  state,
  size = "md",
  qualifier,
  className,
}: {
  state: MatchState;
  size?: "sm" | "md";
  /** e.g. "Delayed" on a live game whose feed is behind. */
  qualifier?: string | null;
  className?: string;
}) {
  return (
    <span
      data-testid="match-state"
      data-state={state}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded font-bold uppercase leading-none tracking-[0.12em]",
        size === "md" ? "px-2 py-1 text-[11px]" : "px-1.5 py-[3px] text-[9.5px]",
        state === "live" && "bg-emerald-500 text-emerald-950",
        state === "completed" && "bg-muted text-foreground/80",
        state === "upcoming" && "border border-cyan-400/80 text-cyan-300",
        className,
      )}
    >
      {state === "live" && (
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-950/60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-950" />
        </span>
      )}
      {state === "completed" && <Check className={size === "md" ? "h-3 w-3" : "h-2.5 w-2.5"} aria-hidden="true" />}
      {state === "upcoming" && <Clock className={size === "md" ? "h-3 w-3" : "h-2.5 w-2.5"} aria-hidden="true" />}
      {MATCH_STATE_LABEL[state]}
      {qualifier && <span className="font-semibold normal-case tracking-normal opacity-80">· {qualifier}</span>}
    </span>
  );
}
