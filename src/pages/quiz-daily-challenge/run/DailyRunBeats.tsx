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
 *
 * DV2-P2A — a plan v5+ day is drawn in its hierarchy: the intro is about
 * Today's Challenge (Standard) alone, with the optional sections named once,
 * quietly; a stage tag says its SECTION, never "Stage X of N"; and
 * `OptionalEntryBeat` is the arrival screen of a main-complete day. v1–v4 are
 * drawn exactly as before.
 */
import type { ReactNode } from "react";
import type { DailyRun, DailyStage } from "@/lib/daily-challenge/run/contracts";
import { hasMainDaily, mainStage } from "@/lib/daily-challenge/run/contracts";
import { DAILY_INTRO_MS, STAGE_INTRO_MIN_MS } from "@/lib/daily-challenge/run/flow";
import { DAILY_SECTION_LABEL, dailySection } from "@/lib/daily-challenge/run/stageCategory";
import { optionalNextLabel } from "@/lib/daily-challenge/run/stageResultModel";
import { stageContentLine, stageIdentity } from "@/lib/daily-challenge/run/stageIdentity";
import { ResultActions } from "@/components/game-results/ResultActions";
import { SectionLadder, StageLadder, StageTag } from "./StageTag";

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
  const main = mainStage(run);
  if (main) return <MainDailyIntro run={run} main={main} />;
  return (
    <Beat testId="daily-intro" intensity="major" ms={DAILY_INTRO_MS}>
      <p className="ranked-beat__meta">{run.planDate}</p>
      <h2 className="ranked-title ranked-beat__title">Daily Challenge</h2>
      <span aria-hidden className="ranked-beat__rule" />
      <p className="ranked-beat__meta">
        {run.stages.length} stages today
      </p>
      <StageLadder run={run} />
    </Beat>
  );
}

/**
 * DV2-P2A — MAJOR, v5+: Today's Challenge is the Daily. Standard is the one
 * thing on the beat; the optional sections are named once, quietly, and are
 * not listed as stages to get through.
 */
function MainDailyIntro({ run, main }: { run: DailyRun; main: DailyStage }) {
  const content = stageContentLine(main);
  return (
    <Beat testId="daily-intro" intensity="major" ms={DAILY_INTRO_MS} extra={{ "data-hierarchy": "main" }}>
      <p className="ranked-beat__meta">{run.planDate}</p>
      <h2 className="ranked-title ranked-beat__title">Daily Challenge</h2>
      <span aria-hidden className="ranked-beat__rule" />
      <p className="ranked-eyebrow text-[#f0d78c]" data-testid="daily-intro-section">
        {DAILY_SECTION_LABEL.today}
      </p>
      <StageTag stage={main} size="lg" />
      {content && (
        <p className="text-sm font-semibold text-[var(--ranked-vellum,#f1e6c8)]" data-testid="daily-intro-content">
          {content}
        </p>
      )}
      <p className="max-w-md text-sm text-[var(--ranked-vellum,#f1e6c8)]/85" data-testid="daily-intro-rule">
        {stageIdentity(main).rule}
      </p>
      <p className="ranked-beat__meta opacity-75" data-testid="daily-intro-optional">
        More Challenges and Review open after — both optional
      </p>
    </Beat>
  );
}

/**
 * Where a stage's tag says it sits. Legacy: its place in the one challenge.
 * v5+: its section, with the optional ones marked as such.
 */
function stageIntroPosition(run: DailyRun, stage: DailyStage): string {
  if (hasMainDaily(run)) {
    const section = dailySection(stage);
    return section === "today" ? DAILY_SECTION_LABEL.today : `${DAILY_SECTION_LABEL[section]} · Optional`;
  }
  return stage.kind === "review" ? "Final stage" : `Stage ${stage.index + 1} of ${run.stages.length}`;
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
      extra={{ "data-stage-kind": stage.kind, "data-closing": closing ? "true" : undefined,
        "data-section": hasMainDaily(run) ? dailySection(stage) : undefined }}>
      <p className="ranked-beat__meta" data-testid="daily-stage-intro-position">
        {stageIntroPosition(run, stage)}
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

/**
 * DV2-P2A — MAJOR: the arrival screen of a page load onto a v5 day whose MAIN
 * Daily is already complete and whose next optional stage has not started.
 *
 * It is not the main result (that was shown once, when Standard settled, to
 * the mount that watched it) and it replays nothing: it states the day's
 * standing from the snapshot (Today's Challenge complete, its frozen Daily
 * score) and offers the optional part as a choice. Nothing is launched until
 * the player continues; "Done for now" only leaves.
 */
export function OptionalEntryBeat({ run, stage, onPlayOptional, onDone }: {
  run: DailyRun;
  /** The current (optional) stage the server points at. */
  stage: DailyStage;
  onPlayOptional: () => void;
  onDone: () => void;
}) {
  return (
    <Beat testId="daily-optional-entry" intensity="major" ms={0}
      extra={{ "data-section": dailySection(stage) }}>
      <p className="ranked-beat__meta">{run.planDate}</p>
      <p className="ranked-eyebrow text-[#f0d78c]">{DAILY_SECTION_LABEL.today}</p>
      <h2 className="ranked-title ranked-beat__title" data-testid="daily-optional-entry-status">Complete</h2>
      {run.mainScore !== null && (
        <p className="flex flex-col items-center gap-0.5" data-testid="daily-optional-entry-score">
          <span className="text-4xl font-black leading-none tabular-nums text-[#f5e6b8]">
            {run.mainScore.toLocaleString()}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ranked-muted,#a8a29e)]">
            Daily score
          </span>
        </p>
      )}
      <span aria-hidden className="ranked-beat__rule" />
      <SectionLadder run={run} highlight={stage.id} />
      <p className="flex items-center justify-center gap-2 text-xs" data-testid="daily-optional-entry-next">
        <span className="ranked-eyebrow">Up next · Optional</span> <StageTag stage={stage} />
      </p>
      <div className="w-full max-w-sm pt-1">
        <ResultActions actions={{
          primary: { label: optionalNextLabel(stage), onClick: onPlayOptional, testId: "daily-optional-continue" },
          secondary: { label: "Done for now", onClick: onDone, testId: "daily-done-for-now" },
        }} />
      </div>
    </Beat>
  );
}
