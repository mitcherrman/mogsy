/**
 * EVERYTHING BELOW THE RESULT WORD — the shared half of every end screen.
 *
 * Snapshot, progress, report, timeline, review, actions, in that order, each
 * absent when its mode has nothing to put there. Ranked, the Daily, Time Trial
 * and a practice quiz all render THIS, so the order a player learns on one
 * screen is the order they get on the other four.
 *
 * It is a separate component from `GameResultsShell` for one reason: the arena
 * modes already have a hero. `MatchOverFrame` has drawn Ranked's mascot,
 * result word and scoreline since F1, three other surfaces depend on it, and
 * replacing it to gain a shared body would be a redesign of the live arena's
 * terminal contract to fix a layout problem below it. So the arena keeps its
 * hero and mounts this; the two non-arena modes get `GameResultsShell`, which
 * is this plus `ResultHero`.
 *
 * RE1 — `variant="compact"`, for a mode whose centrepiece sits ABOVE this body
 * and whose end screen must fit one viewport (Ranked). The same sections, in
 * the same order, re-weighted: snapshot and progress collapse into one record
 * strip, the report, the timeline and the mode's review content fold into a
 * closed "Match details" disclosure, and the actions sit on one row. Nothing
 * is dropped — every section is one click away — and `full`, the default, is
 * exactly what every other mode has always rendered.
 */
import { ChevronDown } from "lucide-react";
import { GameResultsModel } from "./model";
import { MogzyMatchReport } from "./MogzyMatchReport";
import { ResultActions } from "./ResultActions";
import { ResultProgress } from "./ResultProgress";
import { ResultStatGrid } from "./ResultStatGrid";
import { ResultSummaryStrip } from "./ResultSummaryStrip";
import { ResultTimeline } from "./ResultTimeline";

export function GameResultsBody({ model, variant = "full", detailsSummary = null }: {
  model: GameResultsModel;
  variant?: "full" | "compact";
  /**
   * Compact only: the quiet line on the closed disclosure, e.g. "10 modules ·
   * 3 new questions". The mode writes it, because only the mode knows which
   * counts are worth promising behind the click.
   */
  detailsSummary?: string | null;
}) {
  const snapshot = model.snapshot ?? [];
  const progress = model.progress ?? [];
  const report = model.report ?? [];
  const timeline = model.timeline ?? null;
  const hasTimeline = timeline !== null && timeline.entries.length > 0;
  const hasAnything = snapshot.length > 0 || progress.length > 0 || report.length > 0
    || hasTimeline || model.review !== undefined
    || model.actions !== undefined;
  if (!hasAnything) return null;

  if (variant === "compact") {
    const hasDetails = report.length > 0 || hasTimeline || model.review !== undefined;
    return (
      <div data-testid="game-results-body" data-variant="compact" className="space-y-3">
        <ResultSummaryStrip stats={snapshot} progress={progress} />
        {hasDetails && (
          <details data-testid="result-details"
            className="group rounded-[0.6rem] border border-white/10 bg-[#0b1727]">
            <summary data-testid="result-details-toggle"
              className="flex min-h-[40px] cursor-pointer list-none items-center gap-2 px-3
                text-xs font-semibold text-slate-300 hover:text-slate-100
                [&::-webkit-details-marker]:hidden">
              <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 transition-transform
                group-open:rotate-180 motion-reduce:transition-none" />
              <span>Match details</span>
              {detailsSummary && (
                <span className="ml-auto truncate text-[11px] font-normal text-muted-foreground">
                  {detailsSummary}
                </span>
              )}
            </summary>
            <div className="space-y-4 border-t border-white/10 px-3 py-3">
              <MogzyMatchReport lines={report} />
              {hasTimeline && (
                <ResultTimeline entries={timeline.entries} unitLabel={timeline.unitLabel} />
              )}
              {model.review}
            </div>
          </details>
        )}
        {model.actions && <ResultActions actions={model.actions} inline />}
      </div>
    );
  }

  return (
    <div data-testid="game-results-body" className="space-y-4">
      <ResultStatGrid stats={snapshot} />
      <ResultProgress items={progress} />
      <MogzyMatchReport lines={report} />
      {timeline && (
        <ResultTimeline entries={timeline.entries} unitLabel={timeline.unitLabel} />
      )}
      {model.review}
      {model.actions && <ResultActions actions={model.actions} />}
    </div>
  );
}
