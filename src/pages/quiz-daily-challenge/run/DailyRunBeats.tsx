/**
 * DCMOD-E — THE DAILY'S PRESENTATION BEATS, in RFX1's beat vocabulary.
 *
 * The same `.ranked-beat` language Ranked's intro, warnings and outro speak —
 * scrim, gold rules, uppercase title — at the same two intensities:
 *
 *   MAJOR   the Daily intro (the day's lineup), and the final completion
 *   MEDIUM  a stage's intro tag
 *
 * A stage's RESULT is not a beat any more (DC-LANE-C): it is
 * `DailyStageResult`, in Ranked's end-screen language, left with Continue.
 *
 * NOTHING HERE HOLDS ANYTHING. How long a beat stays up is `flow.ts`'s pacing
 * applied by `useDailyRun`; these draw.
 */
import type { ReactNode } from "react";
import type { DailyRun, DailyStage } from "@/lib/daily-challenge/run/contracts";
import { DAILY_INTRO_MS, STAGE_INTRO_MIN_MS } from "@/lib/daily-challenge/run/flow";
import { stageContentLine, stageIdentity } from "@/lib/daily-challenge/run/stageIdentity";
import { StageLadder, StageTag } from "./StageTag";

function Beat({ testId, intensity, ms, children, extra }: {
  testId: string;
  intensity: "major" | "medium";
  ms: number;
  children: ReactNode;
  extra?: Record<string, string | undefined>;
}) {
  return (
    <section data-testid={testId} data-beat-ms={String(ms)} aria-live="polite" {...extra}
      className={`ranked-beat ranked-beat--${intensity} rounded-md py-10`}
      style={{ minHeight: "min(70vh, 38rem)" }}>
      <span aria-hidden className="ranked-beat__scrim rounded-md" />
      <div className="ranked-beat__inner px-4">{children}</div>
    </section>
  );
}

/** MAJOR — one challenge, and what is in it. */
export function DailyIntroBeat({ run }: { run: DailyRun }) {
  return (
    <Beat testId="daily-intro" intensity="major" ms={DAILY_INTRO_MS}>
      <p className="ranked-beat__meta">{run.planDate}</p>
      <h2 className="ranked-title ranked-beat__title">Daily Challenge</h2>
      <span aria-hidden className="ranked-beat__rule" />
      <p className="ranked-beat__meta">
        {run.stages.length} stages · Review closes the day
      </p>
      <StageLadder run={run} />
    </Beat>
  );
}

/** MEDIUM — the stage's tag: its mode, what it is about, and its one rule. */
export function StageIntroBeat({ run, stage, error, onRetry, busy }: {
  run: DailyRun;
  stage: DailyStage;
  error?: string | null;
  onRetry?: () => void;
  busy?: boolean;
}) {
  const id = stageIdentity(stage);
  const content = stageContentLine(stage);
  const closing = stage.kind === "review";
  return (
    <Beat testId="daily-stage-intro" intensity="medium" ms={STAGE_INTRO_MIN_MS}
      extra={{ "data-stage-kind": stage.kind, "data-closing": closing ? "true" : undefined }}>
      <p className="ranked-beat__meta" data-testid="daily-stage-intro-position">
        {closing ? "Final stage" : `Stage ${stage.index + 1} of ${run.stages.length}`}
      </p>
      <StageTag stage={stage} size="lg" />
      {content && (
        <h2 className="ranked-title ranked-beat__title" data-testid="daily-stage-intro-content">
          {content}
        </h2>
      )}
      <span aria-hidden className="ranked-beat__rule" />
      <p className="max-w-md text-sm text-[var(--ranked-vellum,#f1e6c8)]/85" data-testid="daily-stage-intro-rule">
        {id.rule}
      </p>
      {error && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <p role="alert" className="text-xs text-rose-300" data-testid="daily-run-error">{error}</p>
          {onRetry && (
            <button type="button" onClick={onRetry} disabled={busy} data-testid="daily-run-retry"
              className="rounded border border-white/30 px-3 py-1 text-xs uppercase tracking-[0.16em]">
              Try again
            </button>
          )}
        </div>
      )}
    </Beat>
  );
}
