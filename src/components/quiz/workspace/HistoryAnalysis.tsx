/**
 * HUB4 — the Premium expansions of a Daily run and of a Stage.
 *
 * WHAT THE EXPANSION ADDS, AND WHAT IT MUST NOT REPEAT
 * ───────────────────────────────────────────────────
 * The row above already states the run's score, C/A and accuracy and every
 * stage's result. The expansion only adds what the row cannot: comparison
 * with compatible earlier runs, category performance, learning signals and
 * Review recovery for a run; compatible-cohort and ruleset detail for a
 * stage. Nothing basic is restated to fill space.
 *
 * THE SERVER DECIDES, THE PAGE WORDS IT
 * ─────────────────────────────────────
 * Which state an expansion is in comes from HUB2's `analytics_capability`,
 * never from a local entitlement check, and each state reads differently:
 *
 *   available                analytics, as sent
 *   upgrade_required         the existing Premium invitation
 *   insufficient_evidence    the server's counts, in words — never a paywall
 *   temporarily_unavailable  a restrained retry — never a paywall
 *   not_applicable           no expansion at all (handled by the row)
 *
 * Every figure is the server's. A metric whose evidence was insufficient has
 * a null value: its figure keeps its place with an em dash and the server's
 * count ("2 of 5 matching runs"), and the trend keeps its empty frame, so
 * "not yet" never reads as "zero" or as "bad" (HUB6).
 */
import { Link } from "react-router-dom";
import { Lock, MoveRight, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import {
  ChartFrame,
  DormantTrajectory,
  FRAME_INK,
  Pips,
  RatioBar,
  TrajectoryChart,
} from "@/components/quiz/workspace/historyVisuals";
import { staggered, useReveal } from "@/lib/motion/useReveal";
import {
  RUN_METRIC_LABELS,
  SIGNAL_LABELS,
  SIGNAL_ORDER,
  TRAJECTORY_LABEL,
  categoryLabel,
  familyLabel,
  insufficientReasonText,
  instantDateLabel,
  percent,
  signedPoints,
  stageKindLabel,
  sufficiencyText,
} from "@/components/quiz/workspace/historyFormat";
import type {
  AnalyticsCapability,
  CategoryPerformance,
  DailyAnalytics,
  DailyHistoryRecord,
  HistoryQuestion,
  HistoryStage,
  LearningGroupPerformance,
  Metric,
  StageAnalytics,
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
 * place — label, an em dash, and the server's count as its hint — so a run's
 * analysis has the same shape before and after the comparison exists, and
 * "not yet" never reads as "zero".
 */
function Figure({
  label,
  value,
  hint,
  testId,
  pending = false,
  legend,
}: {
  label: string;
  value?: React.ReactNode;
  hint?: string | null;
  testId?: string;
  pending?: boolean;
  /** A key mark drawn before the label (the average's dash on the chart). */
  legend?: React.ReactNode;
}) {
  return (
    <div className="min-w-0" data-testid={testId} data-pending={pending ? "true" : undefined}>
      <Caption className="flex items-center gap-1.5">
        {legend}
        {label}
      </Caption>
      <div
        className="mt-0.5 text-[20px] font-extrabold leading-none tabular-nums"
        style={{
          color: pending ? FRAME_INK : LEAGUECRAFT_INK.strong,
          textShadow: pending ? undefined : LEAGUECRAFT_INK.press,
        }}
      >
        {pending ? <span aria-label="Not available yet">—</span> : value}
      </div>
      {hint && (
        <div className="mt-1 text-[10px] leading-snug" style={{ color: LEAGUECRAFT_INK.faint }}>
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

/** Bars laid out two to a row once the record is wide enough to hold them. */
const BAR_GRID = "grid gap-x-6 gap-y-1.5 [@container(min-width:36rem)]:grid-cols-2";

function CategoryBars({ title, groups, progress }: { title: string; groups: CategoryPerformance[]; progress: number }) {
  // Only groups the server found sufficient carry an accuracy; the rest are
  // not drawn as short bars, because a short bar would be a claim.
  const shown = groups.filter((g) => g.accuracy !== null);
  if (shown.length === 0) return null;
  return (
    <div className="space-y-1.5" data-testid="history-categories">
      <Caption>{title}</Caption>
      <ul className={BAR_GRID}>
        {shown.map((g, i) => (
          <RatioBar
            key={g.category}
            label={categoryLabel(g.category)}
            correct={g.correct}
            answered={g.answered}
            accuracy={g.accuracy!}
            progress={staggered(progress, i, shown.length, 0.35)}
          />
        ))}
      </ul>
    </div>
  );
}

function FamilyBars({ groups, progress }: { groups: LearningGroupPerformance[]; progress: number }) {
  const shown = groups.filter((g) => g.accuracy !== null);
  if (shown.length === 0) return null;
  return (
    <div className="space-y-1.5" data-testid="history-families">
      <Caption>Question types</Caption>
      <ul className={BAR_GRID}>
        {shown.map((g, i) => (
          <RatioBar
            key={g.identity}
            label={familyLabel(g.identity)}
            correct={g.correct}
            answered={g.answered}
            accuracy={g.accuracy!}
            hint={`${g.runCount} runs`}
            progress={staggered(progress, i, shown.length, 0.35)}
          />
        ))}
      </ul>
    </div>
  );
}

const TREND_ICON = { up: TrendingUp, down: TrendingDown, stable: MoveRight } as const;

/**
 * The run-accuracy trajectory. Drawn only when the server sent one — which
 * it does only for five compatible runs — oldest to newest, the last point
 * being this run, with the server's direction label and every value in text
 * for a reader who cannot see it. Before that, the same frame stands empty
 * with the server's count.
 */
function TrendBlock({
  trajectory,
  average,
  progress,
}: {
  trajectory: Metric<Trajectory>;
  average: number | null;
  progress: number;
}) {
  const t = trajectory.value;
  if (!t || t.values.length < 2) {
    return (
      <div className="min-w-0" data-testid="history-pending-trend" data-pending="true">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <Caption>{RUN_METRIC_LABELS.trajectory}</Caption>
          <span className="text-[10px]" style={{ color: LEAGUECRAFT_INK.faint }}>
            {sufficiencyText(trajectory.sufficiency)}
          </span>
        </div>
        <DormantTrajectory observed={trajectory.sufficiency.observed} required={trajectory.sufficiency.required} />
      </div>
    );
  }
  const Icon = TREND_ICON[t.direction];
  const summary = t.values.map((v) => percent(v)).join(", ");
  return (
    <div className="min-w-0" data-testid="history-trajectory" data-direction={t.direction}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <Caption>Trend · last {t.values.length} runs</Caption>
        <span
          className="inline-flex items-center gap-1 text-[13px] font-bold leading-none"
          style={{ color: LEAGUECRAFT_INK.strong, textShadow: LEAGUECRAFT_INK.press }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color: LEAGUECRAFT_INK.accent }} aria-hidden="true" />
          {TRAJECTORY_LABEL[t.direction]}
        </span>
      </div>
      <div role="img" aria-label={`Accuracy over your last ${t.values.length} matching runs, oldest first: ${summary}`}>
        <TrajectoryChart values={t.values} average={average} progress={progress} />
      </div>
    </div>
  );
}

function questionName(q: HistoryQuestion | undefined, stage: HistoryStage | undefined): string {
  const kind = stage ? stageKindLabel(stage.kind) : "";
  const subject = q?.subjectLabel ?? (q?.category ? categoryLabel(q.category) : null);
  if (!q) return kind;
  return subject ? `${kind} · ${subject}` : `${kind} · question ${q.reviewPosition}`;
}

/** How many questions a signal names before it summarises the rest. The
 *  count beside the label is always the full number. */
const SIGNAL_NAMES_SHOWN = 4;

function LearningSignals({ record, analytics }: { record: DailyHistoryRecord; analytics: DailyAnalytics }) {
  const byId = new Map<string, { q: HistoryQuestion; stage: HistoryStage }>();
  for (const stage of record.stages) {
    for (const q of stage.questions) {
      if (q.questionResultId) byId.set(q.questionResultId, { q, stage });
    }
  }
  const groups = SIGNAL_ORDER.map((type) => ({
    type,
    signals: analytics.learningSignals.filter((s) => s.type === type),
  })).filter((g) => g.signals.length > 0);
  if (groups.length === 0) return null;
  return (
    <div className="space-y-1" data-testid="history-signals">
      <Caption>Learning signals</Caption>
      <ul className="space-y-0.5 text-[11px]">
        {groups.map(({ type, signals }) => (
          <li key={type} data-testid={`history-signal-${type}`} className="leading-snug">
            <span className="font-semibold" style={{ color: LEAGUECRAFT_INK.strong }}>
              {SIGNAL_LABELS[type]}
            </span>{" "}
            <span className="tabular-nums" style={{ color: LEAGUECRAFT_INK.faint }}>
              {signals.length}
            </span>
            {type !== "first_in_available_history" && (
              <span style={{ color: LEAGUECRAFT_INK.body }}>
                {" — "}
                {signals
                  .slice(0, SIGNAL_NAMES_SHOWN)
                  .map((s) => {
                    const hit = s.questionResultId ? byId.get(s.questionResultId) : undefined;
                    const name = questionName(hit?.q, hit?.stage);
                    return s.previous ? `${name} (last seen ${instantDateLabel(s.previous.completedAt)})` : name;
                  })
                  .join("; ")}
                {signals.length > SIGNAL_NAMES_SHOWN && ` +${signals.length - SIGNAL_NAMES_SHOWN} more`}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------ capability

/**
 * The existing Premium invitation, set beside the empty frame the analysis
 * would draw in — the structure is shown, never a sample of it: there is no
 * data behind the frame, so nothing is drawn on it.
 */
function PremiumInvitation({ testId }: { testId: string }) {
  return (
    <div
      className="grid items-center gap-3 rounded-md border px-3 py-2.5 [@container(min-width:32rem)]:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]"
      data-testid={testId}
      style={{ borderColor: "rgba(96,68,28,0.3)", background: LEAGUECRAFT_INK.inset }}
    >
      <div className="hidden opacity-70 [@container(min-width:32rem)]:block" aria-hidden="true">
        <ChartFrame gutter={false}>{null}</ChartFrame>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[11.5px]" style={{ color: LEAGUECRAFT_INK.body }}>
          <Lock className="h-3.5 w-3.5 shrink-0" style={{ color: LEAGUECRAFT_INK.brass }} aria-hidden="true" />
          Run and stage analysis is part of Mogzy Premium.
        </p>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="h-8 text-[11px]"
          style={{ borderColor: "rgba(96,68,28,0.45)", color: LEAGUECRAFT_INK.brass }}
        >
          <Link to={PREMIUM_HREF}>Upgrade to Mogzy Premium</Link>
        </Button>
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
        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onRetry} data-testid={`${testId}-retry`}>
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

/** Whether a capability state earns an expansion affordance at all. */
export function hasExpansion(capability: AnalyticsCapability): boolean {
  return capability.state !== "not_applicable";
}

/** The expansion's body unrolls from its top edge as it opens (CSS
 *  `history-unfold`, removed under reduced motion); its marks then draw. */
const UNFOLD = "history-unfold";

// ------------------------------------------------------------ Daily

export function DailyRunAnalysis({
  record,
  onRetry,
  id,
}: {
  record: DailyHistoryRecord;
  onRetry?: () => void;
  id: string;
}) {
  const { capability, analytics } = record;
  const reveal = useReveal<HTMLDivElement>({ durationMs: 900, delayMs: 120 });
  const shell = (children: React.ReactNode) => (
    <div
      ref={reveal.ref}
      id={id}
      role="region"
      aria-label="Run analysis"
      className={`${UNFOLD} mt-1 space-y-3.5 rounded-md border px-3 py-3`}
      style={{ borderColor: "rgba(96,68,28,0.22)", background: "rgba(255, 246, 222, 0.28)" }}
      data-testid="daily-analysis"
      data-state={capability.state}
    >
      {children}
    </div>
  );

  if (capability.state === "upgrade_required") return shell(<PremiumInvitation testId="daily-analysis-upgrade" />);
  if (capability.state === "temporarily_unavailable") {
    return shell(<Unavailable onRetry={onRetry} testId="daily-analysis-unavailable" />);
  }
  if (!analytics) {
    // No per-metric counts to lay out: the server's reason, in words.
    return shell(<Insufficient text={insufficientReasonText(capability.reasonCode)} testId="daily-analysis-insufficient" />);
  }

  // `insufficient_evidence` with analytics and `available` share one layout:
  // every comparison has its place, filled or waiting on its count.
  return shell(<RunAnalysisBody record={record} analytics={analytics} progress={reveal.progress} />);
}

function RunAnalysisBody({
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
  const best = a.personalBest;
  const recovery = a.reviewRecoveryRate;
  const drawsAverage = a.trajectory.value !== null && average.value !== null;

  return (
    <>
      <div className="grid gap-x-6 gap-y-4 [@container(min-width:36rem)]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <TrendBlock trajectory={a.trajectory} average={average.value} progress={progress} />

        <div className="grid grid-cols-2 content-start gap-x-4 gap-y-3.5">
          {delta.value !== null ? (
            <Figure
              testId="daily-analysis-delta"
              label="Accuracy vs last run"
              value={
                <Counted
                  value={delta.value}
                  progress={figure}
                  // Mid-count, a value still rounding to zero keeps the
                  // final sign rather than flashing "±0".
                  format={(v) => (Math.round(v) === 0 && Math.round(delta.value!) !== 0
                    ? `${delta.value! > 0 ? "+" : "−"}0 pts`
                    : signedPoints(v))}
                />
              }
            />
          ) : (
            <Figure testId="history-pending-delta" pending label="Accuracy vs last run" hint={sufficiencyText(delta.sufficiency)} />
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

          {best.value !== null ? (
            <Figure
              testId="daily-analysis-best"
              label="Best score"
              value={<Counted value={best.value.score} progress={figure} format={(v) => String(Math.round(v))} />}
              hint={
                best.value.isCurrent
                  ? best.value.tied
                    ? `this run · tied, first on ${instantDateLabel(best.value.earliestCompletedAt)}`
                    : "this run"
                  : instantDateLabel(best.value.earliestCompletedAt)
              }
            />
          ) : (
            <Figure testId="history-pending-best" pending label="Best score" hint={sufficiencyText(best.sufficiency)} />
          )}

          {recovery.value ? (
            <Figure
              testId="daily-analysis-recovery"
              label={RUN_METRIC_LABELS.reviewRecoveryRate}
              value={`${recovery.value.correct} of ${recovery.value.attempted}`}
              hint={recovery.value.rate !== null ? percent(recovery.value.rate) : null}
            />
          ) : (
            <Figure
              testId="history-pending-recovery"
              pending
              label={RUN_METRIC_LABELS.reviewRecoveryRate}
              hint={sufficiencyText(recovery.sufficiency)}
            />
          )}
        </div>
      </div>

      <CategoryBars title="Categories" groups={a.categoryPerformance} progress={staggered(progress, 1, 2, 0.3)} />
      <LearningSignals record={record} analytics={a} />
    </>
  );
}

// ------------------------------------------------------------ Stage

/**
 * Stage analysis, ruleset-aware. The stage row already prints C/A and the
 * terminal note, so Time Trial's settled count, Survival's depth and the
 * Review's attempted count (all equal to the row's A) are not repeated;
 * what is added is what the row does not carry: strikes used, the Weak Areas
 * themes, and the compatible cohort's category and question-type results.
 * No generic response-time comparison exists here, by design.
 */
export function StageAnalysis({
  stage,
  onRetry,
  id,
}: {
  stage: HistoryStage;
  onRetry?: () => void;
  id: string;
}) {
  const { capability, analytics } = stage;
  const reveal = useReveal<HTMLDivElement>({ durationMs: 800, delayMs: 80 });
  const shell = (children: React.ReactNode) => (
    <div
      ref={reveal.ref}
      id={id}
      role="region"
      aria-label={`${stageKindLabel(stage.kind)} stage analysis`}
      className={`${UNFOLD} mb-1.5 mt-1 space-y-2.5 rounded-md border px-3 py-2.5`}
      style={{ borderColor: "rgba(96,68,28,0.2)", background: "rgba(255, 246, 222, 0.24)" }}
      data-testid="stage-analysis"
      data-state={capability.state}
    >
      {children}
    </div>
  );

  if (capability.state === "upgrade_required") return shell(<PremiumInvitation testId="stage-analysis-upgrade" />);
  if (capability.state === "temporarily_unavailable") {
    return shell(<Unavailable onRetry={onRetry} testId="stage-analysis-unavailable" />);
  }
  if (capability.state === "insufficient_evidence" || !analytics) {
    const s = analytics?.comparisonSufficiency;
    return shell(
      <Insufficient
        testId="stage-analysis-insufficient"
        text={
          s
            ? `${insufficientReasonText(s.reasonCode ?? capability.reasonCode)} (${sufficiencyText(s)}.)`
            : insufficientReasonText(capability.reasonCode)
        }
      />,
    );
  }

  return shell(<StageAnalyticsBody stage={stage} analytics={analytics} progress={reveal.progress} />);
}

function StageAnalyticsBody({
  stage,
  analytics,
  progress,
}: {
  stage: HistoryStage;
  analytics: StageAnalytics;
  progress: number;
}) {
  const strikes =
    stage.kind === "survival" && analytics.strikesUsed !== null ? (
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1" data-testid="stage-analysis-strikes">
        <Caption>Strikes used</Caption>
        {stage.ruleset.maxStrikes !== null && (
          <Pips used={analytics.strikesUsed} max={stage.ruleset.maxStrikes} progress={progress} />
        )}
        <span className="text-[12px] font-bold tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }}>
          {stage.ruleset.maxStrikes !== null
            ? `${analytics.strikesUsed} of ${stage.ruleset.maxStrikes}`
            : String(analytics.strikesUsed)}
        </span>
      </div>
    ) : null;
  return (
    <>
      <p className="text-[10.5px]" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="stage-analysis-samples">
        Compared with{" "}
        <span className="font-semibold tabular-nums" style={{ color: LEAGUECRAFT_INK.body }}>
          {analytics.historicalSamples}
        </span>{" "}
        earlier matching {stageKindLabel(stage.kind)} {analytics.historicalSamples === 1 ? "stage" : "stages"}.
      </p>
      {strikes}
      {stage.kind === "weak_areas" && analytics.selectedThemes.length > 0 && (
        <p className="text-[11px]" style={{ color: LEAGUECRAFT_INK.body }} data-testid="stage-analysis-themes">
          <span className="font-semibold" style={{ color: LEAGUECRAFT_INK.strong }}>Built from</span>{" "}
          {analytics.selectedThemes.map(familyLabel).join(", ")}
        </p>
      )}
      <CategoryBars title="Categories" groups={analytics.categoryPerformance} progress={progress} />
      <FamilyBars groups={analytics.familyPerformance} progress={progress} />
    </>
  );
}
