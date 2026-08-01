/**
 * Compact, fixed-height summary of the last resolved round (Phase 2 compact
 * layout). The full RevealPanel pushed the next active round's controls below
 * the fold; this banner keeps the settlement readable in one reserved row and
 * makes the complete authoritative breakdown an opt-in expansion instead.
 *
 * Stateless about the data: every value is the same backend pass-through the
 * RevealPanel renders — nothing is recomputed here. The expansion mounts the
 * unchanged RevealPanel, so no detail is lost, only deferred.
 *
 * The one-row summary has a reserved min-height and the toggle sits in the
 * same slot in both states, so collapsing/expanding never reflows content
 * above it. Parents key this component on the round so a NEW settlement always
 * starts collapsed.
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  ResolvedCombatantView,
  ResolvedRoundView,
} from "@/lib/ranked-core/viewTypes";
import { RevealPanel } from "./RevealPanel";

const OUTCOME_COPY: Record<ResolvedCombatantView["outcome"], string> = {
  correct: "Correct",
  incorrect: "Incorrect",
  timed_out: "Timed out",
};

export interface RevealBannerProps {
  settlement: ResolvedRoundView;
  viewerSlot: "p1" | "p2";
  namesByPlayerId?: Record<string, string>;
}

function SideSummary({
  player,
  name,
}: {
  player: ResolvedCombatantView;
  name: string;
}) {
  return (
    <span
      data-testid={`reveal-side-${player.playerId}`}
      className="whitespace-nowrap text-muted-foreground"
    >
      <span className="font-semibold text-foreground">{name}</span>{" "}
      {OUTCOME_COPY[player.outcome]}
      {player.finalDamageDealt > 0 && (
        <span className="tabular-nums"> · {player.finalDamageDealt} dmg</span>
      )}
      {player.leveledUp && " · Level up"}
    </span>
  );
}

export function RevealBanner({
  settlement,
  viewerSlot,
  namesByPlayerId,
}: RevealBannerProps) {
  const [open, setOpen] = useState(false);
  // A NEW settlement always starts collapsed (render-time reset, no effect
  // tick): the expanded breakdown never carries over to a later round.
  const [seen, setSeen] = useState(settlement);
  if (seen !== settlement) {
    setSeen(settlement);
    setOpen(false);
  }
  const opponentSlot = viewerSlot === "p1" ? "p2" : "p1";
  const viewer = settlement.players[viewerSlot];
  const opponent = settlement.players[opponentSlot];
  const nameOf = (p: ResolvedCombatantView) =>
    namesByPlayerId?.[p.playerId] ?? p.playerId;

  return (
    <section
      aria-label="Round result"
      data-testid="reveal-panel"
      className="ranked-panel px-3 py-2 sm:px-4"
    >
      <div className="flex min-h-[2.25rem] flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span
          role="status"
          data-testid="reveal-headline"
          className="text-sm font-semibold"
        >
          Round {settlement.roundNumber} resolved
          {settlement.endReason === "deadline_expired" && " — time expired"}
        </span>
        <SideSummary player={viewer} name={nameOf(viewer)} />
        <SideSummary player={opponent} name={nameOf(opponent)} />
        {settlement.matchOver && (
          <span className="font-semibold" data-testid="reveal-match-over">
            Match over
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          data-testid="reveal-details-toggle"
          className="ml-auto inline-flex min-h-[1.75rem] items-center gap-1 rounded px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          Details
          <ChevronDown
            aria-hidden
            className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>
      {open && (
        <div className="mt-2 border-t border-border pt-2">
          <RevealPanel
            settlement={settlement}
            viewerSlot={viewerSlot}
            namesByPlayerId={namesByPlayerId}
            testId="reveal-panel-details"
          />
        </div>
      )}
    </section>
  );
}
