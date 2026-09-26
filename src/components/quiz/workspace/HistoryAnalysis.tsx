/**
 * HUB4 → HUB6.1 — the Premium analytics of a Daily (its Overview) and of a
 * Stage (its ruleset facts), inside Daily Focus.
 *
 * WHAT EACH LAYER OWNS (HUB6.1, owner-locked)
 * ───────────────────────────────────────────
 * Daily Overview: this run against compatible earlier runs — the accuracy
 * history (the server's fitted trajectory, drawn chronologically, with the
 * historical average on the same axis), the exact change from the previous
 * compatible Daily, and the personal-best score. Nothing else: no category
 * or question-type bars, no learning-signal lists, no Review-recovery tile,
 * no population, no Academy lifetime aggregate.
 *
 * Stage: the ruleset's own facts the server projects — Time Trial's settled
 * questions, Survival's depth and strikes used. The stage's exact questions
 * and its own visual live in `StageFocus`. HUB4's per-stage category and
 * question-type bars are not part of the launch presentation (the data is
 * still parsed; nothing here reads it).
 *
 * THE SERVER DECIDES, THE PAGE WORDS IT
 * ─────────────────────────────────────
 * Which state an analysis is in comes from HUB2's `analytics_capability`,
 * never from a local entitlement check:
 *
 *   available                analytics, as sent
 *   upgrade_required         the existing Premium invitation
 *   insufficient_evidence    the server's counts, in words — never a paywall
 *   temporarily_unavailable  a restrained retry — never a paywall
 *   not_applicable           nothing at all
 *
 * Every figure is the server's. A metric whose evidence was insufficient has
 * a null value: its figure keeps its place with an em dash and the server's
 * count ("2 of 5 matching runs"), and the chart keeps its frame, so "not yet"
 * never reads as "zero" or as "bad".
 */
import { Link } from "react-router-dom";
import { Lock, MoveRight, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import {
  ChartFrame,
  DormantTrajectory,
  FRAME_INK,
  Pips,
  TrajectoryChart,
} from "@/components/quiz/workspace/historyVisuals";
import { DAILY_TONE, stageTone } from "@/components/quiz/workspace/stageTheme";
import { staggered, useReveal } from "@/lib/motion/useReveal";
import {
  RUN_METRIC_LABELS,
  TRAJECTORY_LABEL,
  insufficientReasonText,
  instantDateLabel,
  percent,
  signedPoints,
  stageKindLabel,
  sufficiencyText,
} from "@/components/quiz/workspace/historyFormat";
import type {
  AnalyticsCapability,
  DailyAnalytics,
  DailyHistoryRecord,
  HistoryStage,
  Metric,
  PersonalBest,
  Trajectory,
} from "@/lib/history/contracts";

/** Where the Premium invitation points — the destination every existing
 *  History/Review upsell already uses. */
export const PREMIUM_HREF = "/lol/premium";

// ------------------------------------------------------------ small pieces

function Caption({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`text-[9.5px] font-bold uppercase tracking-[0.16em] ${className}`}
      style={{ color: LEAGUECRAFT_INK.faint }}
    >
      {children}
    </div>
  );
}

/**
 * One comparison figure. A figure whose evidence is not in yet keeps its
 * place — label, an em dash, and the server's count as its hint.
 */
function Figure({
  label,
  value,
  hint,
  testId,
  pending = false,
  legend,
  size = "text-[24px]",
}: {
  label: string;
  value?: React.ReactNode;
  hint?: string | null;
  testId?: string;
  pending?: boolean;
  /** A key mark drawn before the label (the average's dash on the chart). */
  legend?: React.ReactNode;
  size?: string;
}) {
  return (
    <div className="min-w-0" data-testid={testId} data-pending={pending ? "true" : undefined}>
      <Caption className="flex items-center gap-1.5">
        {legend}
        {label}
      </Caption>
      <div
        className={`mt-1 ${size} font-extrabold leading-none tabular-nums`}
        style={{
          color: pending ? FRAME_INK : LEAGUECRAFT_INK.strong,
          textShadow: pending ? undefined : LEAGUECRAFT_INK.press,
        }}
      >
        {pending ? <span aria-label="Not available yet">—</span> : value}
      </div>
      {hint && (
        <div className="mt-1 text-[10.5px] leading-snug" style={{ color: LEAGUECRAFT_INK.faint }}>
          {hint}
        </div>
      )}
    </div>
  );
}

/** A figure's number, counted into place with its reveal. The final value is
 *  what renders whenever there is no motion to show. */
function Counted({ value, progress, format }: { value: number; progress: number; format: (v: number) => string }) {
  return <>{format(progress >= 1 ? value : value * progress)}</>;
}

const AVERAGE_DASH = (
  <span
    aria-hidden="true"
    className="inline-block w-3.5"
    style={{ borderTop: `1.5px dashed ${LEAGUECRAFT_INK.faint}` }}
  />
);

const TREND_ICON = { up: TrendingUp, down: TrendingDown, stable: MoveRight } as const;

/**
 * The Daily's accuracy history: the server's fitted trajectory — the last
 * compatible completed runs, oldest first, this run last — on a fixed 0–100%
 * axis, with the historical average dashed on the same axis. Before the
 * server has enough compatible runs, the same frame plots only this run and
 * the average, with the evidence count beneath it.
 */
function AccuracyHistory({
  trajectory,
  average,
  current,
  progress,
}: {
  trajectory: Metric<Trajectory>;
  average: number | null;
  current: number | null;
  progress: number;
}) {
  const t = trajectory.value;
  if (!t || t.values.length < 2) {
    return (
      <div className="min-w-0" data-testid="history-pending-trend" data-pending="true">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <Caption>{RUN_METRIC_LABELS.trajectory}</Caption>
          <span className="text-[10.5px]" style={{ color: LEAGUECRAFT_INK.faint }}>
            {sufficiencyText(trajectory.sufficiency)}
          </span>
        </div>
        <DormantTrajectory
          observed={trajectory.sufficiency.observed}
          required={trajectory.sufficiency.required}
          current={current}
          average={average}
          progress={progress}
          height="h-[9.5rem]"
        />
      </div>
    );
  }
  const Icon = TREND_ICON[t.direction];
  const summary = t.values.map((v) => percent(v)).join(", ");
  return (
    <div className="min-w-0" data-testid="history-trajectory" data-direction={t.direction}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <Caption>Trend · last {t.values.length} runs</Caption>
        <span
          className="inline-flex items-center gap-1 text-[14px] font-bold leading-none"
          style={{ color: LEAGUECRAFT_INK.strong, textShadow: LEAGUECRAFT_INK.press }}
        >
          <Icon className="h-4 w-4" style={{ color: LEAGUECRAFT_INK.accent }} aria-hidden="true" />
          {TRAJECTORY_LABEL[t.direction]}
        </span>
      </div>
      <div role="img" aria-label={`Accuracy over your last ${t.values.length} matching runs, oldest first: ${summary}`}>
        <TrajectoryChart values={t.values} average={average} progress={progress} height="h-[11rem]" />
      </div>
    </div>
  );
}

/** The personal best, as a crest: the score under a trophy, gilded when this
 *  run holds it. */
function PersonalBestCrest({ best, progress }: { best: Metric<PersonalBest>; progress: number }) {
  const b = best.value;
  if (!b) {
    return (
      <div className="flex min-w-0 items-center gap-3" data-testid="history-pending-best" data-pending="true">
        <span
          aria-hidden="true"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-dashed"
          style={{ borderColor: FRAME_INK, color: FRAME_INK }}
        >
          <Trophy className="h-5 w-5" />
        </span>
        <Figure pending label={RUN_METRIC_LABELS.personalBest} hint={sufficiencyText(best.sufficiency)} />
      </div>
    );
  }
  const current = b.isCurrent;
  return (
    <div className="flex min-w-0 items-center gap-3" data-testid="daily-analysis-best" data-current={current ? "true" : "false"}>
      <span
        aria-hidden="true"
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 transition-transform duration-300 motion-reduce:transition-none"
        style={{
          borderColor: DAILY_TONE.edge,
          background: current ? "radial-gradient(circle at 35% 30%, #f6df9a, #c49a3c 70%)" : DAILY_TONE.tint,
          color: current ? "#3a2708" : DAILY_TONE.ink,
          boxShadow: current ? "0 0 0 3px rgba(196,154,60,0.25), inset 0 1px 0 rgba(255,249,233,0.6)" : undefined,
          transform: `scale(${0.8 + 0.2 * progress})`,
        }}
      >
        <Trophy className="h-5 w-5" />
      </span>
      <Figure
        label={RUN_METRIC_LABELS.personalBest}
        value={<Counted value={b.score} progress={progress} format={(v) => String(Math.round(v))} />}
        hint={
          current
            ? b.tied
              ? `this run · tied, first on ${instantDateLabel(b.earliestCompletedAt)}`
              : "this run"
            : instantDateLabel(b.earliestCompletedAt)
        }
      />
    </div>
  );
}

// ------------------------------------------------------------ capability

/**
 * The existing Premium invitation, set in the empty frame the analysis would
 * draw in — the structure is shown, never a sample of it: there is no data
 * behind the frame, so nothing is drawn on it.
 */
function PremiumInvitation({ testId }: { testId: string }) {
  return (
    <div className="relative" data-testid={testId}>
      <div className="opacity-60" aria-hidden="true">
        <ChartFrame gutter={false} height="h-[7rem]">{null}</ChartFrame>
      </div>
      <div className="absolute inset-0 grid place-items-center px-2">
        <div
          className="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-md border px-3 py-2.5"
          style={{ borderColor: "rgba(96,68,28,0.3)", background: "rgba(239,224,187,0.94)" }}
        >
          <p className="flex min-w-0 items-center gap-1.5 text-[11.5px]" style={{ color: LEAGUECRAFT_INK.body }}>
            <Lock className="h-3.5 w-3.5 shrink-0" style={{ color: LEAGUECRAFT_INK.brass }} aria-hidden="true" />
            Run and stage analysis is part of Mogzy Premium.
          </p>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-8 text-[11px] [@media(pointer:coarse)]:h-11"
            style={{ borderColor: "rgba(96,68,28,0.45)", color: LEAGUECRAFT_INK.brass }}
          >
            <Link to={PREMIUM_HREF}>Upgrade to Mogzy Premium</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function Unavailable({ onRetry, testId }: { onRetry?: () => void; testId: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
      <p className="text-[11px]" style={{ color: LEAGUECRAFT_INK.faint }}>
        Analysis is unavailable right now.
      </p>
      {onRetry && (
        <Button size="sm" variant="outline" className="h-7 text-[11px] [@media(pointer:coarse)]:h-11" onClick={onRetry} data-testid={`${testId}-retry`}>
          Try again
        </Button>
      )}
    </div>
  );
}

function Insufficient({ text, testId }: { text: string; testId: string }) {
  return (
    <p className="text-[11px]" style={{ color: LEAGUECRAFT_INK.faint }} data-testid={testId}>
      {text}
    </p>
  );
}

/** Whether a capability state earns an analytics surface at all. */
export function hasExpansion(capability: AnalyticsCapability): boolean {
  return capability.state !== "not_applicable";
}

// ------------------------------------------------------------ Daily Overview

/**
 * The Daily Overview's analytics. Null for `not_applicable` — the Daily
 * Focus then shows the basic record and its stages only.
 */
export function DailyRunAnalysis({
  record,
  onRetry,
  id,
}: {
  record: DailyHistoryRecord;
  onRetry?: () => void;
  id?: string;
}) {
  const { capability, analytics } = record;
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1100, delayMs: 120 });
  if (!hasExpansion(capability)) return null;
  const shell = (children: React.ReactNode) => (
    <section
      ref={reveal.ref}
      id={id}
      aria-label="Run analysis"
      className="min-w-0"
      data-testid="daily-analysis"
      data-state={capability.state}
    >
      {children}
    </section>
  );

  if (capability.state === "upgrade_required") return shell(<PremiumInvitation testId="daily-analysis-upgrade" />);
  if (capability.state === "temporarily_unavailable") {
    return shell(<Unavailable onRetry={onRetry} testId="daily-analysis-unavailable" />);
  }
  if (!analytics) {
    return shell(<Insufficient text={insufficientReasonText(capability.reasonCode)} testId="daily-analysis-insufficient" />);
  }
  // `insufficient_evidence` with analytics and `available` share one layout:
  // every comparison has its place, filled or waiting on its count.
  return shell(<OverviewBody record={record} analytics={analytics} progress={reveal.progress} />);
}

function OverviewBody({
  record,
  analytics: a,
  progress,
}: {
  record: DailyHistoryRecord;
  analytics: DailyAnalytics;
  progress: number;
}) {
  const figure = staggered(progress, 1, 2, 0.4);
  const delta = a.previousRunDeltaPp;
  const average = a.historicalAverage;
  const drawsAverage = average.value !== null;

  return (
    <div className="grid gap-x-8 gap-y-5 [@container(min-width:40rem)]:grid-cols-[minmax(0,1.7fr)_minmax(12rem,1fr)]">
      <AccuracyHistory
        trajectory={a.trajectory}
        average={average.value}
        current={record.basic.accuracy}
        progress={progress}
      />

      <div className="grid content-start gap-x-6 gap-y-5 [@container(min-width:26rem)]:grid-cols-2 [@container(min-width:40rem)]:grid-cols-1">
        {delta.value !== null ? (
          <Figure
            testId="daily-analysis-delta"
            label="Previous Daily"
            value={
              <Counted
                value={delta.value}
                progress={figure}
                // Mid-count, a value still rounding to zero keeps the final
                // sign rather than flashing "0 pp".
                format={(v) => (Math.round(v) === 0 && Math.round(delta.value!) !== 0
                  ? `${delta.value! > 0 ? "+" : "−"}0 pp`
                  : signedPoints(v))}
              />
            }
            hint="accuracy"
          />
        ) : (
          <Figure testId="history-pending-delta" pending label="Previous Daily" hint={sufficiencyText(delta.sufficiency)} />
        )}

        <PersonalBestCrest best={a.personalBest} progress={figure} />

        {average.value !== null ? (
          <Figure
            testId="daily-analysis-average"
            label="Average accuracy"
            legend={drawsAverage ? AVERAGE_DASH : undefined}
            value={<Counted value={average.value} progress={figure} format={(v) => percent(v) ?? "—"} />}
            hint={`${average.sufficiency.observed} earlier runs`}
          />
        ) : (
          <Figure testId="history-pending-average" pending label="Average accuracy" hint={sufficiencyText(average.sufficiency)} />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Stage

/**
 * A stage's ruleset facts, as the server projects them: Time Trial's settled
 * questions under the active bank; Survival's depth and strikes used against
 * the frozen limit. Nothing is compared: the DTO carries no earlier stages'
 * values (HUB6.1 audit), so no comparison is drawn or implied.
 *
 * Returns null where the stage has nothing of its own to add.
 */
export function StageAnalysis({
  stage,
  onRetry,
  progress = 1,
}: {
  stage: HistoryStage;
  onRetry?: () => void;
  progress?: number;
}) {
  const { capability, analytics } = stage;
  const shell = (children: React.ReactNode) => (
    <section
      aria-label={`${stageKindLabel(stage.kind)} stage analysis`}
      className="min-w-0"
      data-testid="stage-analysis"
      data-state={capability.state}
    >
      {children}
    </section>
  );

  if (!hasExpansion(capability)) return null;
  if (capability.state === "upgrade_required") return shell(<PremiumInvitation testId="stage-analysis-upgrade" />);
  if (capability.state === "temporarily_unavailable") {
    return shell(<Unavailable onRetry={onRetry} testId="stage-analysis-unavailable" />);
  }
  if (!analytics) {
    return shell(<Insufficient testId="stage-analysis-insufficient" text={insufficientReasonText(capability.reasonCode)} />);
  }

  const tone = stageTone(stage.kind);
  const facts: React.ReactNode[] = [];
  if (stage.kind === "time_trial" && analytics.settledQuestions !== null) {
    facts.push(
      <Figure
        key="settled"
        testId="stage-analysis-settled"
        label="Settled questions"
        value={<Counted value={analytics.settledQuestions} progress={progress} format={(v) => String(Math.round(v))} />}
        size="text-[28px]"
      />,
    );
  }
  if (stage.kind === "survival" && analytics.depth !== null) {
    facts.push(
      <Figure
        key="depth"
        testId="stage-analysis-depth"
        label="Depth"
        value={<Counted value={analytics.depth} progress={progress} format={(v) => String(Math.round(v))} />}
        size="text-[28px]"
      />,
    );
  }
  if (stage.kind === "survival" && analytics.strikesUsed !== null) {
    facts.push(
      <div key="strikes" className="min-w-0" data-testid="stage-analysis-strikes">
        <Caption>Strikes used</Caption>
        <div className="mt-1.5 flex items-center gap-2.5">
          {stage.ruleset.maxStrikes !== null && (
            <Pips used={analytics.strikesUsed} max={stage.ruleset.maxStrikes} progress={progress} ink={tone.ink} />
          )}
          <span className="text-[16px] font-extrabold tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }}>
            {stage.ruleset.maxStrikes !== null
              ? `${analytics.strikesUsed} of ${stage.ruleset.maxStrikes}`
              : String(analytics.strikesUsed)}
          </span>
        </div>
      </div>,
    );
  }
  if (facts.length === 0) return null;
  return shell(<div className="flex flex-wrap items-end gap-x-10 gap-y-4 px-1">{facts}</div>);
}
