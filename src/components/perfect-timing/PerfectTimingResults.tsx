/**
 * PERFECT TIMING — THE RESULTS: the run, on the shared end screen.
 *
 * Builds the `GameResultsModel` (see `resultsModel.tsx`) and hands it to
 * `GameResultsShell`, so a player leaving a Perfect Timing run sees the same
 * hero, the same snapshot grid and the same way-out buttons every other Mogzy
 * mode ends on. The one piece this mode adds is its own review content, the
 * run ladder (`RunLadder.tsx`).
 */
import { useMemo } from "react";
import { GameResultsShell } from "@/components/game-results/GameResultsShell";
import type { PtRunSummary } from "@/lib/perfect-timing/viewModel";
import { buildPerfectTimingResultsModel } from "./resultsModel";
import "./perfectTiming.css";

export interface PerfectTimingResultsProps {
  summary: PtRunSummary;
  onPlayAgain: () => void;
  /** An optional quiet exit ("Back to the lab"). */
  onExit?: (() => void) | null;
}

export function PerfectTimingResults({ summary, onPlayAgain, onExit = null }: PerfectTimingResultsProps) {
  const model = useMemo(() => buildPerfectTimingResultsModel(summary, { onPlayAgain, onExit }), [summary, onPlayAgain, onExit]);
  return (
    <div data-testid="pt-results" className="pt-results" data-total-points={model.score?.you}>
      <GameResultsShell model={model} />
    </div>
  );
}
