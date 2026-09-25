/**
 * DC-LANE-C — THE DAILY STAGE RESULT, in Ranked's end-screen language.
 *
 * The same pieces Ranked's end screen and every non-arena mode finish on —
 * `ResultHero` (mascot, eyebrow, headline, score), the Performance snapshot
 * and `ResultActions`' primary weight — filled from the parent's settled
 * stage result (`buildDailyStageResult`). What makes it a DAILY step rather
 * than a match ending:
 *
 *   * the headline is the stage's, never Victory / Defeat / Draw;
 *   * the one action is CONTINUE, which moves within the Daily — there is no
 *     Play Again, no Ranked queue, no Back to lobby;
 *   * "Up next" and the day's ladder sit under the numbers.
 *
 * ORDER, top to bottom: tag → hero → snapshot → up next / ladder →
 * [placement] → Continue. `placement` is the one slot a future optional
 * monetization unit can occupy. It is rendered only once the result is
 * settled, it is given nothing it can call, and Continue neither waits on it
 * nor lives inside it — progression never depends on what fills it.
 *
 * PENDING (`stage.result === null`, the `stage-settling` phase): the hero is
 * up at once with "Scoring stage…", and Continue is shown disabled so the
 * layout does not jump when the numbers land. Continue exists only once the
 * parent has advanced past this stage, so it can never run ahead of the server.
 */
import type { ReactNode } from "react";
import { ResultActions } from "@/components/game-results/ResultActions";
import { ResultHero } from "@/components/game-results/ResultHero";
import { ResultStatGrid } from "@/components/game-results/ResultStatGrid";
import type { DailyRun, DailyStage } from "@/lib/daily-challenge/run/contracts";
import { currentStage } from "@/lib/daily-challenge/run/contracts";
import { buildDailyStageResult } from "@/lib/daily-challenge/run/stageResultModel";
import { StageLadder, StageTag } from "./StageTag";

/** What a placement is told. Facts only — nothing it could advance the day with. */
export interface StageResultPlacementContext {
  runId: string;
  stageId: string;
  stageKind: DailyStage["kind"];
  stageIndex: number;
}

/**
 * A future optional placement between the result and Continue. Returns null
 * for "nothing here". Not wired to any provider.
 */
export type StageResultPlacement = (ctx: StageResultPlacementContext) => ReactNode;

export function DailyStageResult({
  run, stage, error, onRetry, busy, onProceed, placement,
}: {
  run: DailyRun;
  stage: DailyStage;
  error?: string | null;
  onRetry?: () => void;
  busy?: boolean;
  /** Leave the result. Absent while pending. */
  onProceed?: () => void;
  placement?: StageResultPlacement;
}) {
  const model = buildDailyStageResult(run, stage);
  const settled = stage.result !== null;
  const next = currentStage(run);
  const perfectClose = run.status === "completed" && run.outcome === "perfect";
  const placed = settled && placement
    ? placement({ runId: run.runId, stageId: stage.id, stageKind: stage.kind, stageIndex: stage.index })
    : null;
  const continueLabel = !settled ? "Scoring…"
    : run.status === "completed" ? "See today's results" : "Continue";

  return (
    <section
      aria-label="Stage result"
      aria-live="polite"
      data-testid="daily-stage-result"
      data-stage-kind={stage.kind}
      data-pending={settled ? undefined : "true"}
      className="ranked-shell mx-auto flex w-full max-w-2xl flex-col gap-4"
    >
      <div className="flex justify-center">
        <StageTag stage={stage} size="lg" />
      </div>
      <ResultHero model={model} />

      {settled ? (
        <div data-testid="daily-stage-result-summary">
          <ResultStatGrid stats={model.snapshot ?? []} />
        </div>
      ) : (
        <p className="ranked-beat__meta text-center" data-testid="daily-stage-result-scoring">
          Scoring stage…
        </p>
      )}

      {settled && (next ? (
        <p className="flex items-center justify-center gap-2 text-xs" data-testid="daily-stage-result-next">
          <span className="ranked-eyebrow">Up next</span> <StageTag stage={next} />
        </p>
      ) : perfectClose ? (
        <p className="text-center text-xs" data-testid="daily-stage-result-perfect">Nothing to review</p>
      ) : null)}
      <StageLadder run={run} highlight={stage.id} />

      {placed && (
        <div data-testid="daily-stage-result-placement">{placed}</div>
      )}

      {error && (
        <div className="flex flex-col items-center gap-2">
          <p role="alert" className="text-xs text-rose-300" data-testid="daily-run-error">{error}</p>
          {onRetry && (
            <button type="button" onClick={onRetry} disabled={busy} data-testid="daily-run-retry"
              className="rounded border border-white/30 px-3 py-1 text-xs uppercase tracking-[0.16em]">
              Try again
            </button>
          )}
        </div>
      )}

      <ResultActions actions={{
        primary: {
          label: continueLabel,
          onClick: () => onProceed?.(),
          disabled: !settled || !onProceed,
          testId: "daily-stage-result-continue",
        },
      }} />
    </section>
  );
}
