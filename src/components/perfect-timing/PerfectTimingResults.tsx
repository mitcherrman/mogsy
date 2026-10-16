/**
 * PERFECT TIMING — THE RESULTS: the run, on one screen.
 *
 * PT4.4: no longer the shared `GameResultsShell` (a scrolling page). The score
 * leads, three facts follow, the run ladder shows every round with its ability
 * icon, and the way on is Play again. It is laid out to fit the viewport:
 * summary and ladder side by side where there is width, stacked where there is
 * not, with the ladder rows giving way before anything overflows.
 *
 * THE ONE SUM. The score is the sum of the reveals' points. Nothing else is
 * computed from a duration the server did not already state. The data line
 * prints the patch label WITH its source, never a bare patch.
 */
import type { PtRunSummary } from "@/lib/perfect-timing/viewModel";
import { dataLabelText, formatMs, runStats } from "./presentation";
import { RunLadder } from "./RunLadder";
import "./perfectTiming.css";

export interface PerfectTimingResultsProps {
  summary: PtRunSummary;
  onPlayAgain: () => void;
  /** An optional quiet exit ("Back to the lab"). */
  onExit?: (() => void) | null;
  /** PGM2 — the exit's words (a public host: "Back to More Challenges"). */
  exitLabel?: string;
}

export function PerfectTimingResults({ summary, onPlayAgain, onExit = null, exitLabel = "Back to the lab" }: PerfectTimingResultsProps) {
  const stats = runStats(summary);
  return (
    <section data-testid="pt-results" className="pt-results" aria-label="Run results" data-total-points={stats.totalPoints}>
      <div className="pt-results-summary">
        <p className="pt-results-eyebrow" data-testid="pt-results-headline">Run complete</p>
        <p className="pt-results-score" data-testid="pt-total-points">
          <b>{stats.totalPoints}</b>
          <span>/ {stats.maxPoints}</span>
          <small>pts</small>
        </p>
        <dl className="pt-results-stats">
          <div data-testid="pt-stat-landed" data-good={stats.hits === stats.played && stats.played > 0 ? "true" : "false"}>
            <dt>Landed</dt>
            <dd>{stats.hits} / {stats.played}</dd>
            <dd className="pt-results-hint">{stats.perfect} perfect{stats.voided ? ` · ${stats.voided} voided` : ""}</dd>
          </div>
          {stats.meanAbsErrorMs !== null && (
            <div data-testid="pt-stat-mean">
              <dt>Mean error</dt>
              <dd>{formatMs(stats.meanAbsErrorMs)}</dd>
            </div>
          )}
          {stats.bestAbsErrorMs !== null && (
            <div data-testid="pt-stat-best" data-good={stats.bestAbsErrorMs <= 100 ? "true" : "false"}>
              <dt>Closest</dt>
              <dd>{formatMs(stats.bestAbsErrorMs)}</dd>
            </div>
          )}
        </dl>
        <div className="pt-results-actions">
          <button type="button" className="pt-next" data-testid="pt-play-again" onClick={onPlayAgain}>Play again</button>
          {onExit ? <button type="button" className="pt-quiet" data-testid="pt-exit" onClick={onExit}>{exitLabel}</button> : null}
        </div>
        <p className="pt-results-data" data-testid="pt-results-data">{dataLabelText(summary.patchLabel, summary.patchSource)}</p>
      </div>
      <RunLadder summary={summary} />
    </section>
  );
}
