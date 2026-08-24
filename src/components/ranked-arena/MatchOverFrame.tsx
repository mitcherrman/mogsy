/**
 * Canonical match-completion frame (F1 Phase C2). Result, final combatant
 * views, action labels, and any statistics content are all supplied by the
 * controller — no matchmaking, rating, persistence, history, or mode copy
 * lives here. Works for a human opponent or a future boss unchanged.
 */
import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CombatantView } from "@/lib/ranked-core/viewTypes";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import type { MogzyMascotPose } from "@/components/mascot/mascot-assets";
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
  /**
   * The other duelist, or absent (ARENA1 Step 5).
   *
   * "For a human opponent or a future boss unchanged" was this file's original
   * promise, and it turned out to assume there is always a second column. A
   * SOLO mode is the case that breaks it, and the honest answer is one column
   * — not a placeholder combatant, which would be exactly the fake opponent a
   * solo mode exists to avoid. Ranked and the Tutorial both pass one and their
   * frame is untouched.
   */
  opponent?: CombatantView | null;
  /** Controller copy override for the eyebrow above the headline. */
  eyebrow?: string;
  /** Controller copy override; defaults derive from result only. */
  heading?: string;
  /** e.g. backend completion reason, round count — rendered verbatim. */
  subheading?: string;
  /** Optional statistics/summary content slot. */
  summary?: ReactNode;
  primaryAction?: MatchOverAction;
  secondaryAction?: MatchOverAction;
  /** R1: does this match have a level/XP layer? Defaults true. */
  progressionEnabled?: boolean;
}

const DEFAULT_HEADING: Record<MatchResult, string> = {
  victory: "Victory",
  defeat: "Defeat",
  draw: "Draw",
};

// Result-driven banner styling (never mode identity). Literal hex so the banner
// reads premium under the /quiz theme AND in the dev inspector alike.
const RESULT_STYLE: Record<MatchResult, { eyebrow: string; heading: string }> = {
  victory: { eyebrow: "text-[#f0d78c]", heading: "ranked-title text-[#f5e6b8]" },
  defeat: { eyebrow: "text-rose-300/80", heading: "text-rose-200" },
  draw: { eyebrow: "text-[#7fd6ef]", heading: "text-slate-100" },
};

// Decorative emotional payoff only — the heading text carries the result.
const RESULT_POSE: Record<MatchResult, MogzyMascotPose> = {
  victory: "cheering",
  defeat: "defeated",
  draw: "base",
};

export function MatchOverFrame({
  result,
  player,
  opponent = null,
  eyebrow,
  heading,
  subheading,
  summary,
  primaryAction,
  secondaryAction,
  // R1: forwarded to both panels so the terminal frame agrees with the live
  // arena about whether this match ever had a level/XP layer. Defaults true,
  // so every existing caller is unchanged.
  progressionEnabled = true,
}: MatchOverFrameProps) {
  return (
    <section
      aria-label="Match over"
      data-testid="match-over-frame"
      data-result={result}
      className="space-y-4"
    >
      <header className="ranked-panel px-4 py-6 text-center space-y-1">
        <MogzyMascot pose={RESULT_POSE[result]} decorative
          className="mx-auto mb-2 h-20 w-20 sm:h-24 sm:w-24" />
        <div className={`ranked-eyebrow ${RESULT_STYLE[result].eyebrow}`}>{eyebrow ?? "Match Complete"}</div>
        <h2 className={`text-3xl font-black uppercase tracking-[0.06em] ${RESULT_STYLE[result].heading}`}
          data-testid="match-over-heading">
          {heading ?? DEFAULT_HEADING[result]}
        </h2>
        {subheading && (
          <p className="text-sm text-muted-foreground" data-testid="match-over-subheading">
            {subheading}
          </p>
        )}
      </header>

      {/* Two columns when there are two duelists; ONE COLUMN, at a duelist
          column's width, when there is one.

          Not a two-column grid with an empty cell — that reads as a missing
          opponent rather than as a solo run. And not a full-bleed single
          column either: this panel sizes its identity slot as a FRACTION of
          its own width, so a column given the whole frame draws a crest the
          height of a small poster. Capping it at roughly the width it would
          have had beside a second duelist keeps the panel the same OBJECT the
          arena has been showing all match. */}
      <div className={`grid gap-3 ${
        opponent ? "md:grid-cols-2" : "mx-auto w-full max-w-sm"}`}>
        <CombatantPanel combatant={player} showRoundStatus={false}
          progressionEnabled={progressionEnabled} />
        {opponent && (
          <CombatantPanel combatant={opponent} showRoundStatus={false}
            progressionEnabled={progressionEnabled} />
        )}
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
