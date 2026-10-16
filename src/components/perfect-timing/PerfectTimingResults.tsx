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
 *
 * PT5: a Mastery Slice's results tell ONE ability's story — the champion and
 * ability once, the score out of three stages, and one line saying what each
 * change did to the TRUE cooldown (the rank step, then the item's haste),
 * from the server's revealed values only. The ladder rows are the stages.
 */
import { SubjectArt } from "@/components/interaction-grammar/shared";
import type { PtRunSummary } from "@/lib/perfect-timing/viewModel";
import { dataLabelText, formatMs, runStats, sliceStory } from "./presentation";
import { RunLadder } from "./RunLadder";
import "./perfectTiming.css";

export interface PerfectTimingResultsProps {
  summary: PtRunSummary;
  onPlayAgain: () => void;
  /** An optional quiet exit ("Back to the lab"). */
  onExit?: (() => void) | null;
  /** PT5: the quiet exit's label (the mode picker says "Change mode"). */
  exitLabel?: string;
}

export function PerfectTimingResults({ summary, onPlayAgain, onExit = null, exitLabel = "Back to the lab" }: PerfectTimingResultsProps) {
  const stats = runStats(summary);
  const first = summary.rounds[0]?.round ?? null;
  const slice = Boolean(first?.slice);
  const story = slice ? sliceStory(summary) : null;
  return (
    <section data-testid="pt-results" className="pt-results" aria-label="Run results" data-total-points={stats.totalPoints}
      data-mode={slice ? "slice" : "random"}>
      <div className="pt-results-summary">
        <p className="pt-results-eyebrow" data-testid="pt-results-headline">{slice ? "Mastery slice complete" : "Run complete"}</p>
        {slice && first ? (
          <p className="pt-slice-subject" data-testid="pt-slice-subject">
            <span className="pt-slice-subject-icon" aria-hidden>
              <SubjectArt media={first.iconUrl ? { src: first.iconUrl, alt: "" } : null} monogram={first.slot} className="h-full w-full" />
            </span>
            <span><b>{first.championName}</b> <i>{first.slot}</i> {first.abilityName}</span>
          </p>
        ) : null}
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
        {story ? <p className="pt-slice-story" data-testid="pt-slice-story">{story}</p> : null}
        <div className="pt-results-actions">
          <button type="button" className="pt-next" data-testid="pt-play-again" onClick={onPlayAgain}>{slice ? "New slice" : "Play again"}</button>
          {onExit ? <button type="button" className="pt-quiet" data-testid="pt-exit" onClick={onExit}>{exitLabel}</button> : null}
        </div>
        <p className="pt-results-data" data-testid="pt-results-data">{dataLabelText(summary.patchLabel, summary.patchSource)}</p>
      </div>
      <RunLadder summary={summary} />
    </section>
  );
}
