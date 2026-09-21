/**
 * DCMOD-E — THE DAILY'S HEADER ROW, over the canonical arena.
 *
 * Handed to the child match as its `chrome`, which is the route's own slot
 * above the arena: nothing inside the arena changes. It says, at all times
 * during a stage, WHERE in the day the player is and WHICH MODE they are
 * playing — the ruleset tag is always visible, so the modes are learned — and
 * for a governed stage, the ruleset's one number:
 *
 *   * Time Trial — the server's remaining active-answer bank (`projectTimeBank`
 *     holds it still through every non-answerable window);
 *   * Survival — mistakes left, as a count of marks. Never a health bar.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import type { RankedPresentationPhase } from "@/lib/ranked-core/flow/rankedFlow";
import type { DailyRun, DailyStage, DailyStrikes, DailyTimeBank } from "@/lib/daily-challenge/run/contracts";
import { stageContentLine } from "@/lib/daily-challenge/run/stageIdentity";
import { formatBank, projectTimeBank } from "@/lib/daily-challenge/run/timeBank";
import { StageTag } from "./StageTag";

const LEAGUECRAFT_HREF = "/quiz";

export function TimeBankMeter({ bank, skewMs, childPhase }: {
  bank: DailyTimeBank;
  skewMs: number;
  childPhase: RankedPresentationPhase | null;
}) {
  const answerable = childPhase === "answering";
  const holding = !bank.draining || !answerable;
  // A display tick, and only a display tick — and none at all while held.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (holding) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [holding]);
  const ms = projectTimeBank({ bank, nowMs: holding ? Date.now() : now, skewMs, answerable });
  const pct = bank.totalMs > 0 ? Math.max(0, Math.min(100, (ms / bank.totalMs) * 100)) : 0;
  return (
    <div data-testid="daily-time-bank" data-bank-ms={String(ms)}
      data-bank-state={holding ? "held" : "draining"}
      role="timer" aria-label={`Time bank ${formatBank(ms)} left`}
      className="flex items-center gap-2">
      <span className="text-[0.625rem] uppercase tracking-[0.18em] text-[var(--ranked-muted,#a8a29e)]">Bank</span>
      <span aria-hidden className="relative h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
        <span className={`absolute inset-y-0 left-0 rounded-full ${ms < 10_000 ? "bg-rose-400" : "bg-amber-300"}`}
          style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono text-sm tabular-nums">{formatBank(ms)}</span>
    </div>
  );
}

export function StrikesMeter({ strikes }: { strikes: DailyStrikes }) {
  const left = Math.max(0, strikes.max - strikes.used);
  return (
    <div data-testid="daily-strikes" data-strikes-used={String(strikes.used)}
      data-strikes-max={String(strikes.max)} data-strikes-remaining={String(left)}
      aria-label={`${left} of ${strikes.max} mistakes left`}
      className="flex items-center gap-2">
      <span className="text-[0.625rem] uppercase tracking-[0.18em] text-[var(--ranked-muted,#a8a29e)]">
        Mistakes left
      </span>
      <span aria-hidden className="flex gap-1">
        {Array.from({ length: strikes.max }, (_, i) => (
          <span key={i} data-testid="daily-strike-mark" data-spent={i < strikes.used ? "true" : "false"}
            className={`flex h-4 w-4 items-center justify-center rounded-sm border text-[0.625rem] font-bold ${
              i < strikes.used
                ? "border-rose-400/70 text-rose-300"
                : "border-[rgba(240,215,140,0.6)] bg-[rgba(240,215,140,0.15)]"}`}>
            {i < strikes.used ? "✕" : ""}
          </span>
        ))}
      </span>
    </div>
  );
}

/** The ruleset's number for the active stage, from the server's live state. */
function RulesetReadout({ stage, skewMs, childPhase }: {
  stage: DailyStage; skewMs: number; childPhase: RankedPresentationPhase | null;
}) {
  const live = stage.live;
  if (stage.ruleset?.id === "time_trial" && live?.timeBank) {
    return <TimeBankMeter bank={live.timeBank} skewMs={skewMs} childPhase={childPhase} />;
  }
  if (stage.ruleset?.id === "survival") {
    const strikes = live?.strikes
      ?? (stage.ruleset.maxStrikes ? { used: 0, max: stage.ruleset.maxStrikes } : null);
    return strikes ? <StrikesMeter strikes={strikes} /> : null;
  }
  return null;
}

export function DailyStageChrome({ run, stage, skewMs = 0, childPhase = null }: {
  run: DailyRun;
  stage: DailyStage | null;
  skewMs?: number;
  childPhase?: RankedPresentationPhase | null;
}) {
  const content = stage ? stageContentLine(stage) : null;
  return (
    <header data-testid="daily-stage-chrome" className={arenaHeaderRowClass("wide")}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        <h1 className="ranked-title text-lg font-bold leading-tight">Daily Challenge</h1>
        {stage && (
          <>
            <span data-testid="daily-stage-position"
              className="text-xs tabular-nums text-[var(--ranked-muted,#a8a29e)]">
              Stage {stage.index + 1} of {run.stages.length}
            </span>
            <StageTag stage={stage} />
            {content && (
              <span data-testid="daily-stage-content" className="truncate text-xs text-[var(--ranked-muted,#a8a29e)]">
                {content}
              </span>
            )}
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-4">
        {stage && <RulesetReadout stage={stage} skewMs={skewMs} childPhase={childPhase} />}
        <Link to={LEAGUECRAFT_HREF} className="text-sm text-muted-foreground underline">
          Back to Quiz
        </Link>
      </div>
    </header>
  );
}
