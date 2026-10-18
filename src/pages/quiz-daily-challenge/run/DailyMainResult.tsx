/**
 * DV2-P2A — THE MAIN DAILY RESULT: Today's Challenge, complete.
 *
 * On a plan v5+ day Standard IS the Daily. When it settles, this replaces the
 * ordinary stage result: the same end-screen pieces (`ResultHero`,
 * `ResultStatGrid`, `ResultActions`), with the Daily's own number, earned
 * before anything optional is offered:
 *
 *   tag → hero (Today's Challenge · Complete · Daily score) → Standard's
 *   snapshot → the optional sections, named as optional → [placement] →
 *   Play More Challenges | Done for now
 *
 * The score is `run.mainScore` (the server's frozen main score) and nothing
 * else; the snapshot is Standard's own settled result. Optional content is
 * offered as a choice, never as the rest of the Daily: "Done for now" only
 * leaves the page (no server call — there is no skip-extras mutation), and
 * the run stays open and resumable.
 *
 * DRS1 — pending (Standard handed back, the parent not yet synced) and
 * settled draw the same frame: the headline is the same, the hero reserves
 * its score row, the snapshot has a declared floor, the optional panel is
 * built from the plan (known before scoring), and both actions are drawn
 * (disabled while pending). Settling fills slots; it does not create height.
 *
 * MPE-D — THE REVEAL, keyed on the settle. The frame above is right, but all
 * of its motion happened at MOUNT (the pending frame), so the Daily score
 * popped into its reserved row at the very instant `daily.stage.complete`
 * sounded. Now the sequence starts when `settled` flips (`DAILY_REVEAL_BEATS`,
 * with the hero's own `SCORE_REVEAL_BEATS`):
 *
 *   0 ms     "Scoring…" becomes "Complete"; Mogzy, who was THINKING through the
 *            scoring, cheers; the completion sting (fired by `useDailyRun`).
 *   160 ms   the Daily score counts 0 → `run.mainScore` (640 ms) and lands with
 *            the shared reward-number bump; `daily.score.reveal` begins here so
 *            its confirmation note lands with the number.
 *   520 ms   one light sweep crosses the hero; 560 ms the "Daily score" label.
 *   900 ms   the Performance snapshot enters inside its reserved floor.
 *
 * Nothing waits on it: both actions enable at 0 ms, and leaving mid-sequence
 * cancels the timers. Reduced motion prints the final score at once. Only the
 * mount that WATCHED the settle ever draws this screen (a reload lands on
 * `OptionalEntryBeat`), so the ceremony is seen once and never replayed.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import { ResultActions } from "@/components/game-results/ResultActions";
import { ResultHero, SCORE_REVEAL_BEATS } from "@/components/game-results/ResultHero";
import { ResultStatGrid } from "@/components/game-results/ResultStatGrid";
import { useSfx } from "@/lib/audio/useSfx";
import type { DailyRun, DailyStage } from "@/lib/daily-challenge/run/contracts";
import { currentStage, isMainDailyComplete } from "@/lib/daily-challenge/run/contracts";
import { dailySection, dailySections } from "@/lib/daily-challenge/run/stageCategory";
import { buildDailyMainResult, optionalNextLabel } from "@/lib/daily-challenge/run/stageResultModel";
import { DAILY_DISCOVERY_HOLD_MS, DailyDiscoveries } from "./DailyDiscoveries";
import {
  RESULT_FOCUS_CLEARANCE, RESULT_FRAME_GAP, RESULT_HERO_DENSITY, RESULT_SNAPSHOT_3COL, RESULT_TAG_DENSITY,
  TOUCH_TARGET,
} from "./dailyResultDensity";
import type { StageResultPlacement } from "./DailyStageResult";
import { StageTag } from "./StageTag";

/**
 * The snapshot slot's floor: Standard's (DailyStageResult `SNAPSHOT_FLOOR`).
 * The main snapshot has at most three tiles (Correct, Accuracy, Missed with
 * its hint line): one row of three below `sm` (F05; 86px measured at 320px,
 * where it was two rows and 10rem), one row from it, as Standard's four did.
 */
const MAIN_SNAPSHOT_FLOOR = "min-h-[5.5rem] sm:min-h-[6rem]";

/** MPE-D — the section's beats, in ms after the result settles. */
export const DAILY_REVEAL_BEATS = {
  /** The score cue: with the count, so the confirmation lands with the number. */
  cue: SCORE_REVEAL_BEATS.count,
  /** The Performance snapshot enters, once the score has landed. */
  snapshot: 900,
} as const;

/** The engine's identity for a run's score cue. Exported so a test can name it. */
export function dailyScoreSoundEventId(runId: string): string {
  return `daily:${runId}:main:score`;
}

function delayStyle(ms: number): CSSProperties {
  return { "--reward-delay": `${ms}ms` } as CSSProperties;
}

export function DailyMainResult({
  run, stage, error, onRetry, busy, onProceed, onDone, placement, onMoreChallenges, onReviewDiscoveries,
}: {
  run: DailyRun;
  /** The MAIN stage (Standard). */
  stage: DailyStage;
  error?: string | null;
  onRetry?: () => void;
  busy?: boolean;
  /** Go on into the optional stages. Absent while pending. */
  onProceed?: () => void;
  /** Leave for the hub. Presentation only. */
  onDone: () => void;
  placement?: StageResultPlacement;
  /**
   * PGM1 — open the public More Challenges catalog. When given and the run's
   * next stage is a bonus ("More Challenges") stage, "Play More Challenges"
   * goes there, where the player picks a mode, instead of straight into the
   * run's next stage. Review and the recap still proceed in place.
   */
  onMoreChallenges?: () => void;
  /**
   * MISC-W2C — into REVIEW → OWNED from the newly-earned-cards panel. The
   * panel (and its read) exists only where the host supplies this, exactly as
   * "Done for now" is the host's to give.
   */
  onReviewDiscoveries?: () => void;
}) {
  const settled = isMainDailyComplete(run) && stage.status === "completed";
  const model = buildDailyMainResult(run, stage);
  const optional = dailySections(run).filter((g) => g.id !== "today");
  const next = currentStage(run);
  const toCatalog = !!onMoreChallenges && next !== null && dailySection(next) === "more";
  const placed = settled && placement
    ? placement({ runId: run.runId, stageId: stage.id, stageKind: stage.kind, stageIndex: stage.index })
    : null;

  // The score cue, as the count begins. Marked fired only when the timer
  // fires, so StrictMode's run → clean-up → run leaves exactly one timer
  // standing; the engine's `eventId` dedupe is what makes a second mount silent.
  const sfx = useSfx();
  const cued = useRef(false);
  useEffect(() => {
    if (!settled || cued.current) return;
    const timer = window.setTimeout(() => {
      cued.current = true;
      sfx.play("daily.score.reveal", { eventId: dailyScoreSoundEventId(run.runId) });
    }, DAILY_REVEAL_BEATS.cue);
    return () => window.clearTimeout(timer);
  }, [settled, run.runId, sfx]);

  return (
    <section
      aria-label="Today's Challenge result"
      aria-live="polite"
      data-testid="daily-main-result"
      data-stage-kind={stage.kind}
      data-pending={settled ? undefined : "true"}
      data-settled={settled ? "true" : undefined}
      className={`ranked-shell mx-auto flex w-full max-w-2xl flex-col ${RESULT_FRAME_GAP} ${
        RESULT_TAG_DENSITY} ${RESULT_HERO_DENSITY} ${RESULT_FOCUS_CLEARANCE}`}
    >
      <div className="flex justify-center">
        <StageTag stage={stage} size="lg" />
      </div>
      <ResultHero model={model} reserveScore revealScore pendingPose="thinking" />

      <div data-testid="daily-main-result-snapshot-slot"
        className={`${MAIN_SNAPSHOT_FLOOR} ${RESULT_SNAPSHOT_3COL}`}>
        {settled ? (
          <div data-testid="daily-main-result-summary" className="reward-enter"
            style={delayStyle(DAILY_REVEAL_BEATS.snapshot)}>
            <ResultStatGrid stats={model.snapshot ?? []} />
          </div>
        ) : (
          // The hero already says "Scoring…"; the slot only holds its height.
          <span aria-hidden data-testid="daily-main-result-scoring" />
        )}
      </div>

      {onReviewDiscoveries && (
        <DailyDiscoveries stage={stage} settled={settled}
          holdMs={DAILY_DISCOVERY_HOLD_MS.mainResult} onReview={onReviewDiscoveries} />
      )}

      {optional.length > 0 && (
        <section aria-label="Optional" data-testid="daily-main-optional"
          className="space-y-2 rounded-[0.6rem] border border-white/10 bg-black/20 px-4 py-3
            max-sm:space-y-1.5 max-sm:px-3 max-sm:py-2.5">
          <p className="text-center">
            <span className="ranked-eyebrow">Optional</span>
            <span className="block pt-1 text-xs text-[var(--ranked-muted,#a8a29e)]">
              Keep playing if you like. Nothing here changes your Daily score.
            </span>
          </p>
          <ul className="flex flex-col items-center gap-2.5 max-sm:gap-1.5 sm:flex-row sm:items-start sm:justify-center sm:gap-8">
            {optional.map((g) => (
              <li key={g.id} data-testid={`daily-main-optional-${g.id}`} data-section={g.id}
                className="flex flex-col items-center gap-1">
                <span className="text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-[var(--ranked-vellum,#f1e6c8)]">
                  {g.label}
                </span>
                <span className="flex flex-wrap items-center justify-center gap-1.5">
                  {g.stages.map((s) => <StageTag key={s.id} stage={s} />)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {placed && (
        <div data-testid="daily-stage-result-placement">{placed}</div>
      )}

      {error && (
        <div className="flex flex-col items-center gap-2">
          <p role="alert" className="text-xs text-rose-300" data-testid="daily-run-error">{error}</p>
          {onRetry && (
            <button type="button" onClick={onRetry} disabled={busy} data-testid="daily-run-retry"
              className={`rounded border border-white/30 px-3 py-1 text-xs uppercase tracking-[0.16em] ${TOUCH_TARGET}`}>
              Try again
            </button>
          )}
        </div>
      )}

      <ResultActions actions={{
        primary: {
          label: settled ? optionalNextLabel(next) : "Scoring…",
          onClick: () => (toCatalog ? onMoreChallenges?.() : onProceed?.()),
          disabled: !settled || !(toCatalog || onProceed),
          testId: "daily-main-continue",
        },
        secondary: {
          label: "Done for now",
          onClick: onDone,
          disabled: !settled,
          testId: "daily-done-for-now",
        },
      }} />
    </section>
  );
}
