/**
 * Canonical match-completion frame (F1 Phase C2). Result, final combatant
 * views, action labels, and any statistics content are all supplied by the
 * controller — no matchmaking, rating, persistence, history, or mode copy
 * lives here. Works for a human opponent or a future boss unchanged.
 */
import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CombatantView } from "@/lib/ranked-core/viewTypes";
import { CombatantPanel } from "./CombatantPanel";

export type MatchResult = "victory" | "defeat" | "draw";

export interface MatchOverAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface MatchOverFrameProps {
  result: MatchResult;
  player: CombatantView;
  opponent: CombatantView;
  /** Controller copy override; defaults derive from result only. */
  heading?: string;
  /** e.g. backend completion reason, round count — rendered verbatim. */
  subheading?: string;
  /** Optional statistics/summary content slot. */
  summary?: ReactNode;
  primaryAction?: MatchOverAction;
  secondaryAction?: MatchOverAction;
}

const DEFAULT_HEADING: Record<MatchResult, string> = {
  victory: "Victory",
  defeat: "Defeat",
  draw: "Draw",
};

export function MatchOverFrame({
  result,
  player,
  opponent,
  heading,
  subheading,
  summary,
  primaryAction,
  secondaryAction,
}: MatchOverFrameProps) {
  return (
    <section
      aria-label="Match over"
      data-testid="match-over-frame"
      data-result={result}
      className="space-y-4"
    >
      <header className="text-center space-y-1">
        <h2 className="text-2xl font-bold" data-testid="match-over-heading">
          {heading ?? DEFAULT_HEADING[result]}
        </h2>
        {subheading && (
          <p className="text-sm text-muted-foreground" data-testid="match-over-subheading">
            {subheading}
          </p>
        )}
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <CombatantPanel combatant={player} showRoundStatus={false} />
        <CombatantPanel combatant={opponent} showRoundStatus={false} />
      </div>

      {summary && <div data-testid="match-over-summary">{summary}</div>}

      {(primaryAction || secondaryAction) && (
        <div className="flex flex-col sm:flex-row gap-2">
          {primaryAction && (
            <Button
              type="button"
              data-testid="match-over-primary"
              disabled={primaryAction.disabled}
              onClick={primaryAction.onClick}
              className="flex-1 min-h-[44px]"
            >
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              type="button"
              variant="outline"
              data-testid="match-over-secondary"
              disabled={secondaryAction.disabled}
              onClick={secondaryAction.onClick}
              className="flex-1 min-h-[44px]"
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
