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
import type { SurvivalStatus } from "@/lib/ranked-core/survivalFinish";
import { StageTag } from "./StageTag";

const LEAGUECRAFT_HREF = "/quiz";

export function TimeBankMeter({ bank, skewMs, childPhase }: {
  bank: DailyTimeBank;
  skewMs: number;
  childPhase: RankedPresentationPhase | null;
}) {
  const answerable = childPhase === "answering";
  // Draining is possible when the server said so at `asOf`, or when the
  // reading was taken during a lead-in and names the question's own
  // answerable instant (see `projectTimeBank`). Otherwise the display holds.
  const canDrain = bank.draining || (bank.answerableAt !== null && !bank.answered);
  const holding = !canDrain || !answerable;
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

/**
 * DC-SURV-UX — Survival's status: how far the player has got, and the strikes.
 * No denominator: the stage has no length a player is meant to reach, and
 * the server's module ceiling is never shown as a target.
 */
export function StrikesMeter({ strikes, answered = null }: { strikes: DailyStrikes; answered?: number | null }) {
  const left = Math.max(0, strikes.max - strikes.used);
  const out = strikes.used >= strikes.max;
  return (
    <div data-testid="daily-strikes" data-strikes-used={String(strikes.used)}
      data-strikes-max={String(strikes.max)} data-strikes-remaining={String(left)}
      data-strikes-out={out ? "true" : "false"}
      aria-label={`${left} of ${strikes.max} mistakes left`}
      className="flex items-center gap-2">
      {answered !== null && (
        <span data-testid="daily-survival-answered" className="whitespace-nowrap font-mono text-xs tabular-nums">
          {answered} answered
          <span aria-hidden className="px-1 text-[var(--ranked-muted,#a8a29e)]">·</span>
        </span>
      )}
      <span className="hidden text-[0.625rem] uppercase tracking-[0.18em] text-[var(--ranked-muted,#a8a29e)] sm:inline">
        Strikes
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
      <span data-testid="daily-strikes-count" className="whitespace-nowrap font-mono text-xs tabular-nums">
        {Math.min(strikes.used, strikes.max)} / {strikes.max}
      </span>
    </div>
  );
}

/** The ruleset's number for the active stage, from the server's live state. */
function RulesetReadout({ stage, skewMs, childPhase, survival }: {
  stage: DailyStage; skewMs: number; childPhase: RankedPresentationPhase | null;
  survival: SurvivalStatus | null;
}) {
  const live = stage.live;
  if (stage.ruleset?.id === "time_trial" && live?.timeBank) {
    return <TimeBankMeter bank={live.timeBank} skewMs={skewMs} childPhase={childPhase} />;
  }
  if (stage.ruleset?.id === "survival") {
    // Both sources are the server's own ledger; the higher reading is simply
    // the more recent one (strikes never go down within a stage).
    const max = live?.strikes?.max ?? survival?.maxStrikes ?? stage.ruleset.maxStrikes ?? null;
    const used = Math.max(live?.strikes?.used ?? 0, survival?.strikesUsed ?? 0);
    return max ? <StrikesMeter strikes={{ used, max }} answered={survival?.answered ?? null} /> : null;
  }
  return null;
}

export function DailyStageChrome({ run, stage, skewMs = 0, childPhase = null, survival = null }: {
  run: DailyRun;
  stage: DailyStage | null;
  skewMs?: number;
  childPhase?: RankedPresentationPhase | null;
  /** The active Survival child's reported status (DC-SURV-UX). */
  survival?: SurvivalStatus | null;
}) {
  const content = stage ? stageContentLine(stage) : null;
  return (
    <header data-testid="daily-stage-chrome" className={`${arenaHeaderRowClass("wide")} flex-wrap`}>
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
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-1">
        {stage && <RulesetReadout stage={stage} skewMs={skewMs} childPhase={childPhase} survival={survival} />}
        <Link to={LEAGUECRAFT_HREF} className="text-sm text-muted-foreground underline">
          Back to Quiz
        </Link>
      </div>
    </header>
  );
}
