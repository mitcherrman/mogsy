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
 * strip, the report and the timeline fold into a closed "Match details"
 * disclosure, and the actions sit on one row. Nothing is dropped — every
 * section is one click away — and `full`, the default, is exactly what every
 * other mode has always rendered.
 *
 * MPE — THE REVIEW SLOT IS THE REWARD, AND A REWARD IS NOT A DETAIL
 * ─────────────────────────────────────────────────────────────────
 * `model.review` is the mode's own reward content — for Ranked, the discovery
 * ceremony. RE1 folded it into the compact disclosure with the report and the
 * timeline, which meant the one new thing a match gave the player was closed
 * by default under a toggle, while its sound played for a panel nobody could
 * see. It now renders in the OPEN flow in both variants: after the record
 * strip and before the details, so the screen reads result → record → reward
 * → the way on. The disclosure keeps the analysis (report, timeline).
 *
 * The sections ENTER in that reading order on a short stagger (`reward-enter`,
 * `--reward-delay`), the one motion vocabulary every result surface shares.
 */
import type { CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { GameResultsModel } from "./model";
import { MogzyMatchReport } from "./MogzyMatchReport";
import { ResultActions } from "./ResultActions";
import { ResultProgress } from "./ResultProgress";
import { ResultStatGrid } from "./ResultStatGrid";
import { ResultSummaryStrip } from "./ResultSummaryStrip";
import { ResultTimeline } from "./ResultTimeline";

/**
 * RC8 — open the compact end screen's "Match details" in place and bring it
 * into view. For a match whose review lives only on this screen (Role
 * Challenge is excluded from Ranked history by design). Returns whether a
 * disclosure was found.
 */
export function openResultDetails(root: ParentNode = document): boolean {
  const details = root.querySelector<HTMLDetailsElement>('[data-testid="result-details"]');
  if (!details) return false;
  details.open = true;
  details.scrollIntoView({ block: "nearest", behavior: "smooth" });
  details.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
  return true;
}

/** Where each section enters, in ms after the body mounts. */
const ENTER = {
  snapshot: 60, progress: 140, review: 220, report: 300, actions: 380,
} as const;

function enterStyle(ms: number): CSSProperties {
  return { "--reward-delay": `${ms}ms` } as CSSProperties;
}

export function GameResultsBody({ model, variant = "full", detailsSummary = null }: {
  model: GameResultsModel;
  variant?: "full" | "compact";
  /**
   * Compact only: the quiet line on the closed disclosure, e.g. "10 modules".
   * The mode writes it, because only the mode knows which counts are worth
   * promising behind the click.
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
    const hasDetails = report.length > 0 || hasTimeline;
    return (
      <div data-testid="game-results-body" data-variant="compact" className="space-y-3">
        <ResultSummaryStrip stats={snapshot} progress={progress} enterDelayMs={ENTER.snapshot} />
        {model.review !== undefined && (
          <div data-testid="result-review" className="reward-enter" style={enterStyle(ENTER.review)}>
            {model.review}
          </div>
        )}
        {hasDetails && (
          <details data-testid="result-details"
            className="group reward-enter rounded-[0.6rem] border border-white/10 bg-[#0b1727]"
            style={enterStyle(ENTER.report)}>
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
            </div>
          </details>
        )}
        {model.actions && (
          <div className="reward-enter" style={enterStyle(ENTER.actions)}>
            <ResultActions actions={model.actions} inline />
          </div>
        )}
      </div>
    );
  }

  return (
    <div data-testid="game-results-body" className="space-y-4">
      {snapshot.length > 0 && (
        <div className="reward-enter" style={enterStyle(ENTER.snapshot)}>
          <ResultStatGrid stats={snapshot} />
        </div>
      )}
      <ResultProgress items={progress} enterDelayMs={ENTER.progress} />
      {report.length > 0 && (
        <div className="reward-enter" style={enterStyle(ENTER.review)}>
          <MogzyMatchReport lines={report} />
        </div>
      )}
      {hasTimeline && (
        <div className="reward-enter" style={enterStyle(ENTER.report)}>
          <ResultTimeline entries={timeline.entries} unitLabel={timeline.unitLabel} />
        </div>
      )}
      {/* Full keeps its order: a practice run's review is remediation (the
          questions missed), which belongs after the analysis, not before it. */}
      {model.review !== undefined && (
        <div data-testid="result-review" className="reward-enter" style={enterStyle(ENTER.report)}>
          {model.review}
        </div>
      )}
      {model.actions && (
        <div className="reward-enter" style={enterStyle(ENTER.actions)}>
          <ResultActions actions={model.actions} />
        </div>
      )}
    </div>
  );
}
