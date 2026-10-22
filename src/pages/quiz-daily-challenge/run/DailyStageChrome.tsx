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
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import type { RankedPresentationPhase } from "@/lib/ranked-core/flow/rankedFlow";
import type { DailyRun, DailyStage, DailyStrikes, DailyTimeBank } from "@/lib/daily-challenge/run/contracts";
import { hasMainDaily, isMainDailyComplete } from "@/lib/daily-challenge/run/contracts";
import { stagePositionLabel } from "@/lib/daily-challenge/run/stageResultModel";
import { stageContentLine, stageIdentity } from "@/lib/daily-challenge/run/stageIdentity";
import { formatBank, projectTimeBank } from "@/lib/daily-challenge/run/timeBank";
import { CountdownDigits } from "@/components/quiz-timer/CountdownDigits";
import { countdownDataAttrs } from "@/lib/quiz-timer/countdownFeedback";
import { useCountdownSfx, useServerTimeoutSfx } from "@/lib/quiz-timer/useCountdownFeedback";
import type { SurvivalStatus } from "@/lib/ranked-core/survivalFinish";
import { StageTag } from "./StageTag";
import { NextDailyCountdown } from "./NextDailyCountdown";

const LEAGUECRAFT_HREF = "/quiz";

export function TimeBankMeter({ bank, skewMs, childPhase, stageId = null }: {
  bank: DailyTimeBank;
  skewMs: number;
  childPhase: RankedPresentationPhase | null;
  /** The stage this bank belongs to: the bank's clock identity (MISC W2D). */
  stageId?: string | null;
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
  // MISC W2D (F10–F12) — the bank IS the Time Trial's answer clock: its last
  // five seconds knock and pulse while it drains (one clock across all the
  // stage's questions, so a remainder resumed on the next question never
  // re-sounds), and TIME'S UP sounds only when the SERVER's own reading says
  // the bank is spent — never from this projection reaching zero.
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const bankKey = stageId ? `daily-bank:${stageId}` : null;
  const clock = { remainingSeconds: seconds, paused: holding };
  useCountdownSfx({ clockKey: bankKey, remainingSeconds: seconds, running: !holding,
    armed: answerable && !bank.answered });
  useServerTimeoutSfx({ settledKey: bankKey,
    serverTimedOut: bank.totalMs > 0 && bank.remainingMs <= 0 });
  return (
    <div data-testid="daily-time-bank" data-bank-ms={String(ms)}
      data-bank-state={holding ? "held" : "draining"}
      role="timer" aria-label={`Time bank ${formatBank(ms)} left`}
      className="flex shrink-0 items-center gap-1 md:gap-2">
      <span className="hidden text-[0.625rem] uppercase tracking-[0.18em] text-[var(--ranked-muted,#a8a29e)] md:inline">Bank</span>
      <span aria-hidden className="relative hidden h-1.5 w-20 overflow-hidden rounded-full bg-white/10 md:inline-block">
        <span className={`absolute inset-y-0 left-0 rounded-full ${ms < 10_000 ? "bg-rose-400" : "bg-amber-300"}`}
          style={{ width: `${pct}%` }} />
      </span>
      <span data-testid="daily-time-bank-value" {...countdownDataAttrs(clock)}
        className="whitespace-nowrap font-mono text-[10px] tabular-nums min-[500px]:text-sm">
        <CountdownDigits timer={clock}>{formatBank(ms)}</CountdownDigits>
      </span>
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
      className="flex shrink-0 items-center gap-1 md:gap-2">
      {answered !== null && (
        <span data-testid="daily-survival-answered" className="hidden whitespace-nowrap font-mono text-xs tabular-nums md:inline">
          {answered} answered
          <span aria-hidden className="px-1 text-[var(--ranked-muted,#a8a29e)]">·</span>
        </span>
      )}
      <span className="hidden text-[0.625rem] uppercase tracking-[0.18em] text-[var(--ranked-muted,#a8a29e)] sm:inline">
        Strikes
      </span>
      <span aria-hidden className="hidden gap-1 md:flex">
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
      <span data-testid="daily-strikes-count" className="whitespace-nowrap font-mono text-[10px] tabular-nums min-[500px]:text-xs">
        {Math.min(strikes.used, strikes.max)} / {strikes.max}
      </span>
    </div>
  );
}

/** The ruleset's number for the active stage, from the server's live state. */
function RulesetReadout({ stage, skewMs, childPhase, survival, strikesFloor }: {
  stage: DailyStage; skewMs: number; childPhase: RankedPresentationPhase | null;
  survival: SurvivalStatus | null; strikesFloor: number | null;
}) {
  const live = stage.live;
  if (stage.ruleset?.id === "time_trial" && live?.timeBank) {
    return <TimeBankMeter bank={live.timeBank} skewMs={skewMs} childPhase={childPhase}
      stageId={stage.id} />;
  }
  if (stage.ruleset?.id === "survival") {
    // Both sources are the server's own ledger; the higher reading is simply
    // the more recent one (strikes never go down within a stage).
    const max = live?.strikes?.max ?? survival?.maxStrikes ?? stage.ruleset.maxStrikes ?? null;
    const daily = live?.strikes ? Math.max(live.strikes.used, live.strikes.live ?? 0) : 0;
    // B7 — and the stage's last server-reported count, so the terminal 3/3
    // survives the parent advancing (a completed stage has no `live`).
    const used = Math.max(daily, survival?.strikesUsed ?? 0, strikesFloor ?? 0);
    // DRS1 — the live count while the child reports it; once the stage has
    // completed the parent drops that status (`useDailyRun.adopt`), and the
    // completed stage's own authoritative result carries the same fact. Without
    // the fallback "N answered ·" vanished at the result and a phone's chrome
    // lost a wrapped row (-20px). Never computed client-side, never carried
    // across stages: this reads only THIS stage's server-stated result.
    const answered = survival?.answered ?? stage.result?.answered ?? null;
    return max ? <StrikesMeter strikes={{ used, max }} answered={answered} /> : null;
  }
  return null;
}

/**
 * The header's way out. DV2-P2A: once a v5 day's MAIN Daily is complete,
 * leaving is not exiting an unfinished Daily (the leave guard agrees, unless
 * an optional child is live), so it reads "Done for now".
 */
function exitLabel(run: DailyRun): string {
  if (run.status !== "active") return "Back to Quiz";
  return isMainDailyComplete(run) ? "Done for now" : "Exit Daily Challenge";
}

export function DailyStageChrome({
  run, stage, skewMs = 0, childPhase = null, survival = null, strikesFloor = null,
}: {
  run: DailyRun;
  stage: DailyStage | null;
  skewMs?: number;
  childPhase?: RankedPresentationPhase | null;
  /** The active Survival child's reported status (DC-SURV-UX). */
  survival?: SurvivalStatus | null;
  /** B7 — the highest strike count the server reported for this stage. */
  strikesFloor?: number | null;
}) {
  // Keep section and distinct content accessible, but out of the phone's
  // single-row space budget. The mode tag is the only visible stage label.
  const content = stage ? stageContentLine(stage) : null;
  const backLabel = exitLabel(run);
  return (
    <header data-testid="daily-stage-chrome"
      className={`${arenaHeaderRowClass("wide")} !flex-nowrap !gap-1 sm:!gap-2`}>
      <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-2">
        <Link to={LEAGUECRAFT_HREF} aria-label={backLabel} title={backLabel}
          className="inline-flex h-7 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-300">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <h1 aria-label="Daily Challenge"
          className="ranked-title shrink-0 whitespace-nowrap text-[clamp(10px,2.65vw,18px)] font-bold leading-none tracking-[-0.035em]">
          <span className="hidden min-[360px]:inline">Daily Challenge</span>
          <span aria-hidden="true" className="min-[360px]:hidden">Daily</span>
        </h1>
        {stage && (
          <>
            <span data-testid="daily-stage-position" className="sr-only">
              {hasMainDaily(run) ? stagePositionLabel(run, stage) : `Stage ${stage.index + 1} of ${run.stages.length}`}
            </span>
            <StageTag stage={stage} size="compact" />
            {content && content.trim().toLowerCase() !== stageIdentity(stage).label.toLowerCase() && (
              <span data-testid="daily-stage-content"
                className="sr-only lg:not-sr-only lg:max-w-32 lg:truncate lg:text-xs lg:text-[var(--ranked-muted,#a8a29e)]">
                {content}
              </span>
            )}
          </>
        )}
      </div>
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1 sm:gap-2">
        {stage && <RulesetReadout stage={stage} skewMs={skewMs} childPhase={childPhase}
          survival={survival} strikesFloor={strikesFloor} />}
        <NextDailyCountdown nextDailyAt={run.nextDailyAt} serverNow={run.serverNow} />
        <a data-testid="daily-screenshot-cta" href="https://mogzy.lol"
          target="_blank" rel="noopener noreferrer" aria-label="Play now at mogzy.lol"
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[9px] min-[400px]:text-[10px] min-[500px]:text-xs">
          <span className="font-semibold text-sky-200">mogzy.lol</span>
          <span className="font-bold uppercase text-amber-300">PLAY NOW</span>
        </a>
      </div>
    </header>
  );
}
