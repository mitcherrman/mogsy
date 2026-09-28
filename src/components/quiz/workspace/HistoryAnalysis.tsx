/**
 * HUB4 → HUB6.1 → HUB6.3E — the Daily Overview's analytics, inside the
 * expanded Daily.
 *
 * HUB6.3E: a payload with HUB6.3B personal analytics renders the Premium
 * analytics room (`analytics/DailyOverview`). An older HUB2.3 payload keeps
 * the accuracy history below, minus two things HUB6.3E removed everywhere:
 * the raw Daily-score "personal best" (Review awards points after misses, so
 * the total is not a performance record) and the Up / Down / Stable label.
 * A Free reader keeps this Daily's own facts above the one invitation.
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
 * Stage (HUB6.2): the selected stage's quick facts sit on its own row and its
 * deeper visual in the Daily's analytics region — both in `StageAnalytics`.
 * HUB4's per-stage category and question-type bars are not part of the launch
 * presentation (the data is still parsed; nothing reads it).
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
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import {
  ChartFrame,
  DormantTrajectory,
  FRAME_INK,
  TrajectoryChart,
} from "@/components/quiz/workspace/historyVisuals";
import { staggered, useReveal } from "@/lib/motion/useReveal";
import {
  RUN_METRIC_LABELS,
  insufficientReasonText,
  percent,
  signedPoints,
  stageKindLabel,
  sufficiencyText,
} from "@/components/quiz/workspace/historyFormat";
import { accuracyComparison, correctOfPlayed } from "@/components/quiz/workspace/historyComparisons";
import DailyOverview from "@/components/quiz/workspace/analytics/DailyOverview";
import { coreStreak } from "@/components/quiz/workspace/analytics/derive";
import type {
  AnalyticsCapability,
  DailyAnalytics,
  DailyHistoryRecord,
  Metric,
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
  const summary = t.values.map((v) => percent(v)).join(", ");
  return (
    <div className="min-w-0" data-testid="history-trajectory">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <Caption>Accuracy · last {t.values.length} runs</Caption>
      </div>
      <div role="img" aria-label={`Accuracy over your last ${t.values.length} matching runs, oldest first: ${summary}`}>
        <TrajectoryChart values={t.values} average={average} progress={progress} height="h-[11rem]" />
      </div>
    </div>
  );
}

// ------------------------------------------------------------ capability

/**
 * The existing Premium invitation, set in the empty frame the analysis would
 * draw in — the structure is shown, never a sample of it: there is no data
 * behind the frame, so nothing is drawn on it.
 */
export function PremiumInvitation({ testId }: { testId: string }) {
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

export function Unavailable({ onRetry, testId }: { onRetry?: () => void; testId: string }) {
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

// ------------------------------------------------------------ Free facts

/**
 * This Daily's own facts — Free (owner tier rule): correct / questions
 * played, accuracy, and the Core longest streak with the stage that produced
 * it (the max of the three core stages' own Free streaks).
 */
export function FreeDailyFacts({ record }: { record: DailyHistoryRecord }) {
  const streak = coreStreak(record);
  const item = (label: string, value: React.ReactNode, testId: string, aria?: string) => (
    <div className="min-w-0" data-testid={testId} aria-label={aria}>
      <Caption>{label}</Caption>
      <div className="mt-0.5 text-[16px] font-extrabold tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }}>{value}</div>
    </div>
  );
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2" data-testid="daily-free-facts">
      {item("Correct", `${record.basic.correct} / ${record.basic.questionsPlayed}`, "free-correct",
        correctOfPlayed(record.basic.correct, record.basic.questionsPlayed))}
      {item("Accuracy", percent(record.basic.accuracy) ?? "—", "free-accuracy")}
      {streak && item(
        "Core longest streak",
        <>
          {streak.length}
          <span className="ml-1.5 text-[11px] font-bold" style={{ color: LEAGUECRAFT_INK.faint }}>
            {streak.kinds.map(stageKindLabel).join(", ")}
          </span>
        </>,
        "free-core-streak",
      )}
    </div>
  );
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

  if (capability.state === "upgrade_required") {
    // Free: this Daily's own facts stay; the analysis is invited once.
    return shell(
      <div className="space-y-3">
        <FreeDailyFacts record={record} />
        <PremiumInvitation testId="daily-analysis-upgrade" />
      </div>,
    );
  }
  if (capability.state === "temporarily_unavailable") {
    return shell(<Unavailable onRetry={onRetry} testId="daily-analysis-unavailable" />);
  }
  if (!analytics) {
    return shell(<Insufficient text={insufficientReasonText(capability.reasonCode)} testId="daily-analysis-insufficient" />);
  }
  // HUB6.3E: the Premium analytics room, whenever HUB6.3B's personal block
  // is on the wire. `insufficient_evidence` and `available` share it: every
  // section says what it has, or that this is the first attempt.
  if (analytics.personal) return shell(<DailyOverview record={record} analytics={analytics} />);
  // An older (HUB2.3) payload: its accuracy history, as before.
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
  // HUB6.3B's previous-Daily block names both accuracies, so the figure can
  // read "88% vs 84%" and count the points between the two SHOWN percentages.
  const prior = a.personal?.previousDaily;
  const versus = prior?.current?.accuracy != null && prior.previous?.accuracy != null
    ? accuracyComparison(prior.current.accuracy, prior.previous.accuracy)
    : null;
  const points = versus ? versus.points : delta.value;
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
        {points !== null ? (
          <Figure
            testId="daily-analysis-delta"
            label="Previous Daily"
            value={
              <Counted
                value={points}
                progress={figure}
                // Mid-count, a value still rounding to zero keeps the final
                // sign rather than flashing "0 points".
                format={(v) => (Math.round(v) === 0 && Math.round(points) !== 0
                  ? `${points > 0 ? "+" : "−"}0 points`
                  : signedPoints(v))}
              />
            }
            hint={versus ? `accuracy, ${versus.versus}` : "accuracy"}
          />
        ) : (
          <Figure testId="history-pending-delta" pending label="Previous Daily" hint={sufficiencyText(delta.sufficiency)} />
        )}

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
