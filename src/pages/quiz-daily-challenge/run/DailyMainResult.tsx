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
 */
import { ResultActions } from "@/components/game-results/ResultActions";
import { ResultHero } from "@/components/game-results/ResultHero";
import { ResultStatGrid } from "@/components/game-results/ResultStatGrid";
import type { DailyRun, DailyStage } from "@/lib/daily-challenge/run/contracts";
import { currentStage, isMainDailyComplete } from "@/lib/daily-challenge/run/contracts";
import { dailySections } from "@/lib/daily-challenge/run/stageCategory";
import { buildDailyMainResult, optionalNextLabel } from "@/lib/daily-challenge/run/stageResultModel";
import type { StageResultPlacement } from "./DailyStageResult";
import { StageTag } from "./StageTag";

/**
 * The snapshot slot's floor: Standard's (DailyStageResult `SNAPSHOT_FLOOR`).
 * The main snapshot has at most three tiles (Correct, Accuracy, Missed with
 * its hint line): two rows below `sm`, one from it, as Standard's four did.
 */
const MAIN_SNAPSHOT_FLOOR = "min-h-[10rem] sm:min-h-[6rem]";

export function DailyMainResult({
  run, stage, error, onRetry, busy, onProceed, onDone, placement,
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
}) {
  const settled = isMainDailyComplete(run) && stage.status === "completed";
  const model = buildDailyMainResult(run, stage);
  const optional = dailySections(run).filter((g) => g.id !== "today");
  const next = currentStage(run);
  const placed = settled && placement
    ? placement({ runId: run.runId, stageId: stage.id, stageKind: stage.kind, stageIndex: stage.index })
    : null;

  return (
    <section
      aria-label="Today's Challenge result"
      aria-live="polite"
      data-testid="daily-main-result"
      data-stage-kind={stage.kind}
      data-pending={settled ? undefined : "true"}
      className="ranked-shell mx-auto flex w-full max-w-2xl flex-col gap-4"
    >
      <div className="flex justify-center">
        <StageTag stage={stage} size="lg" />
      </div>
      <ResultHero model={model} reserveScore />

      <div data-testid="daily-main-result-snapshot-slot" className={MAIN_SNAPSHOT_FLOOR}>
        {settled ? (
          <div data-testid="daily-main-result-summary">
            <ResultStatGrid stats={model.snapshot ?? []} />
          </div>
        ) : (
          // The hero already says "Scoring…"; the slot only holds its height.
          <span aria-hidden data-testid="daily-main-result-scoring" />
        )}
      </div>

      {optional.length > 0 && (
        <section aria-label="Optional" data-testid="daily-main-optional"
          className="space-y-2 rounded-[0.6rem] border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-center">
            <span className="ranked-eyebrow">Optional</span>
            <span className="block pt-1 text-xs text-[var(--ranked-muted,#a8a29e)]">
              Keep playing if you like. Nothing here changes your Daily score.
            </span>
          </p>
          <ul className="flex flex-col items-center gap-2.5 sm:flex-row sm:items-start sm:justify-center sm:gap-8">
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
              className="rounded border border-white/30 px-3 py-1 text-xs uppercase tracking-[0.16em]">
              Try again
            </button>
          )}
        </div>
      )}

      <ResultActions actions={{
        primary: {
          label: settled ? optionalNextLabel(next) : "Scoring…",
          onClick: () => onProceed?.(),
          disabled: !settled || !onProceed,
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
