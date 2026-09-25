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
 * a null value and is left out of the figures; the counts behind it are
 * listed once, quietly, so "not yet" never reads as "zero" or as "bad".
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
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
} from "@/lib/history/contracts";

/** Where the Premium invitation points — the destination every existing
 *  History/Review upsell already uses. */
export const PREMIUM_HREF = "/lol/premium";

// ------------------------------------------------------------ small pieces

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[9.5px] font-bold uppercase tracking-[0.16em]"
      style={{ color: LEAGUECRAFT_INK.faint }}
    >
      {children}
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: string | null;
  testId?: string;
}) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <Caption>{label}</Caption>
      <div
        className="text-[15px] font-bold leading-tight tabular-nums"
        style={{ color: LEAGUECRAFT_INK.strong, textShadow: LEAGUECRAFT_INK.press }}
      >
        {value}
      </div>
      {hint && (
        <div className="text-[10px]" style={{ color: LEAGUECRAFT_INK.faint }}>
          {hint}
        </div>
      )}
    </div>
  );
}

/** One categorical bar on a common zero baseline, with its counts as text. */
function RatioBar({
  label,
  correct,
  answered,
  accuracy,
  hint,
}: {
  label: string;
  correct: number;
  answered: number;
  accuracy: number;
  hint?: string;
}) {
  const width = Math.max(0, Math.min(100, Math.round(accuracy * 100)));
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 text-[11px]" data-testid="history-bar">
      <span className="min-w-0 truncate" style={{ color: LEAGUECRAFT_INK.body }} title={label}>
        {label}
        {hint && <span style={{ color: LEAGUECRAFT_INK.faint }}> · {hint}</span>}
      </span>
      <span className="tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }}>
        {correct}/{answered} · {percent(accuracy)}
      </span>
      <span
        aria-hidden="true"
        className="col-span-2 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: LEAGUECRAFT_INK.inset }}
      >
        <span
          className="block h-full rounded-full"
          style={{ width: `${width}%`, background: LEAGUECRAFT_INK.accent }}
        />
      </span>
    </li>
  );
}

function CategoryBars({ title, groups }: { title: string; groups: CategoryPerformance[] }) {
  // Only groups the server found sufficient carry an accuracy; the rest are
  // not drawn as short bars, because a short bar would be a claim.
  const shown = groups.filter((g) => g.accuracy !== null);
  if (shown.length === 0) return null;
  return (
    <div className="space-y-1" data-testid="history-categories">
      <Caption>{title}</Caption>
      <ul className="space-y-1">
        {shown.map((g) => (
          <RatioBar
            key={g.category}
            label={categoryLabel(g.category)}
            correct={g.correct}
            answered={g.answered}
            accuracy={g.accuracy!}
          />
        ))}
      </ul>
    </div>
  );
}

function FamilyBars({ groups }: { groups: LearningGroupPerformance[] }) {
  const shown = groups.filter((g) => g.accuracy !== null);
  if (shown.length === 0) return null;
  return (
    <div className="space-y-1" data-testid="history-families">
      <Caption>Question types</Caption>
      <ul className="space-y-1">
        {shown.map((g) => (
          <RatioBar
            key={g.identity}
            label={familyLabel(g.identity)}
            correct={g.correct}
            answered={g.answered}
            accuracy={g.accuracy!}
            hint={`${g.runCount} runs`}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * The run-accuracy trajectory. Drawn only when the server sent one — which
 * it does only for five compatible runs — oldest to newest, with its
 * direction label and every value in text for a reader who cannot see it.
 * Static: HUB6 owns reveal motion, and with none here reduced motion needs no
 * branch.
 */
function TrajectoryLine({ values, direction }: { values: number[]; direction: "up" | "down" | "stable" }) {
  if (values.length < 2) return null;
  const w = 100;
  const h = 28;
  const pad = 3;
  const points = values
    .map((v, i) => {
      const x = pad + (i * (w - 2 * pad)) / (values.length - 1);
      const y = h - pad - Math.max(0, Math.min(1, v)) * (h - 2 * pad);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const summary = values.map((v) => percent(v)).join(", ");
  return (
    <div className="min-w-0" data-testid="history-trajectory" data-direction={direction}>
      <Caption>Trend · last {values.length} runs</Caption>
      <div className="flex items-center gap-2">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          className="h-7 w-24 shrink-0"
          role="img"
          aria-label={`Accuracy over your last ${values.length} matching runs, oldest first: ${summary}`}
        >
          <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} stroke={LEAGUECRAFT_INK.rule} strokeWidth={0.6} />
          <polyline
            points={points}
            fill="none"
            stroke={LEAGUECRAFT_INK.accent}
            strokeWidth={1.6}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span
          className="text-[15px] font-bold leading-tight"
          style={{ color: LEAGUECRAFT_INK.strong, textShadow: LEAGUECRAFT_INK.press }}
        >
          {TRAJECTORY_LABEL[direction]}
        </span>
      </div>
    </div>
  );
}

/** The metrics still waiting on evidence, with the server's counts. One quiet
 *  line — the absence of a comparison is a fact, not a section. */
function PendingComparisons({ items }: { items: { label: string; metric: Metric<unknown> }[] }) {
  const pending = items.filter((i) => i.metric.value === null);
  if (pending.length === 0) return null;
  return (
    <p className="text-[10.5px] leading-relaxed" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="history-pending">
      Not enough matching history yet for{" "}
      {pending.map((p, i) => (
        <span key={p.label}>
          {i > 0 ? " · " : ""}
          <span style={{ color: LEAGUECRAFT_INK.body }}>{p.label}</span> ({sufficiencyText(p.metric.sufficiency)})
        </span>
      ))}
      .
    </p>
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

function PremiumInvitation({ testId }: { testId: string }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-2"
      data-testid={testId}
      style={{ borderColor: "rgba(96,68,28,0.42)", background: LEAGUECRAFT_INK.inset }}
    >
      <p className="min-w-0 flex-1 text-[11px]" style={{ color: LEAGUECRAFT_INK.body }}>
        Run and stage analysis is part of Mogzy Premium.
      </p>
      <Button
        asChild
        size="sm"
        variant="outline"
        className="h-7 text-[11px]"
        style={{ borderColor: "rgba(96,68,28,0.45)", color: LEAGUECRAFT_INK.brass }}
      >
        <Link to={PREMIUM_HREF}>Upgrade to Mogzy Premium</Link>
      </Button>
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
  const shell = (children: React.ReactNode) => (
    <div
      id={id}
      role="region"
      aria-label="Run analysis"
      className="mt-1.5 space-y-2.5 border-t pt-2"
      style={{ borderColor: "rgba(96,68,28,0.24)" }}
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
  if (capability.state === "insufficient_evidence" || !analytics) {
    // The server's per-metric counts, when it sent them; its reason otherwise.
    return shell(
      analytics ? (
        <PendingComparisons items={runMetricItems(analytics)} />
      ) : (
        <Insufficient text={insufficientReasonText(capability.reasonCode)} testId="daily-analysis-insufficient" />
      ),
    );
  }

  const a = analytics;
  const figures: React.ReactNode[] = [];
  if (a.previousRunDeltaPp.value !== null) {
    figures.push(
      <Figure key="delta" testId="daily-analysis-delta" label="Accuracy vs last run" value={signedPoints(a.previousRunDeltaPp.value)} />,
    );
  }
  if (a.historicalAverage.value !== null) {
    figures.push(
      <Figure
        key="avg"
        testId="daily-analysis-average"
        label="Average accuracy"
        value={percent(a.historicalAverage.value) ?? "—"}
        hint={`${a.historicalAverage.sufficiency.observed} earlier runs`}
      />,
    );
  }
  if (a.personalBest.value !== null) {
    const best = a.personalBest.value;
    figures.push(
      <Figure
        key="best"
        testId="daily-analysis-best"
        label="Best score"
        value={String(best.score)}
        hint={
          best.isCurrent
            ? best.tied
              ? `this run · tied, first on ${instantDateLabel(best.earliestCompletedAt)}`
              : "this run"
            : instantDateLabel(best.earliestCompletedAt)
        }
      />,
    );
  }
  const recovery = a.reviewRecoveryRate.value;

  return shell(
    <>
      {(figures.length > 0 || a.trajectory.value) && (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
          {figures}
          {a.trajectory.value && (
            <TrajectoryLine values={a.trajectory.value.values} direction={a.trajectory.value.direction} />
          )}
        </div>
      )}
      {recovery && (
        <p className="text-[11px]" style={{ color: LEAGUECRAFT_INK.body }} data-testid="daily-analysis-recovery">
          <span className="font-semibold" style={{ color: LEAGUECRAFT_INK.strong }}>Review recovery</span>{" "}
          <span className="tabular-nums">
            {recovery.correct} of {recovery.attempted}
            {recovery.rate !== null && ` · ${percent(recovery.rate)}`}
          </span>
        </p>
      )}
      <CategoryBars title="Categories" groups={a.categoryPerformance} />
      <LearningSignals record={record} analytics={a} />
      <PendingComparisons items={runMetricItems(a)} />
    </>,
  );
}

function runMetricItems(a: DailyAnalytics) {
  return [
    { label: RUN_METRIC_LABELS.previousRunDeltaPp, metric: a.previousRunDeltaPp as Metric<unknown> },
    { label: RUN_METRIC_LABELS.historicalAverage, metric: a.historicalAverage as Metric<unknown> },
    { label: RUN_METRIC_LABELS.personalBest, metric: a.personalBest as Metric<unknown> },
    { label: RUN_METRIC_LABELS.trajectory, metric: a.trajectory as Metric<unknown> },
    { label: RUN_METRIC_LABELS.reviewRecoveryRate, metric: a.reviewRecoveryRate as Metric<unknown> },
  ];
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
  const shell = (children: React.ReactNode) => (
    <div
      id={id}
      role="region"
      aria-label={`${stageKindLabel(stage.kind)} stage analysis`}
      className="mt-1 space-y-2 pb-1 pl-1"
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

  return shell(<StageAnalyticsBody stage={stage} analytics={analytics} />);
}

function StageAnalyticsBody({ stage, analytics }: { stage: HistoryStage; analytics: StageAnalytics }) {
  const facts: React.ReactNode[] = [];
  if (stage.kind === "survival" && analytics.strikesUsed !== null) {
    facts.push(
      <Figure
        key="strikes"
        testId="stage-analysis-strikes"
        label="Strikes used"
        value={
          stage.ruleset.maxStrikes !== null
            ? `${analytics.strikesUsed} of ${stage.ruleset.maxStrikes}`
            : String(analytics.strikesUsed)
        }
      />,
    );
  }
  return (
    <>
      <p className="text-[10.5px]" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="stage-analysis-samples">
        Compared with{" "}
        <span className="font-semibold tabular-nums" style={{ color: LEAGUECRAFT_INK.body }}>
          {analytics.historicalSamples}
        </span>{" "}
        earlier matching {stageKindLabel(stage.kind)} {analytics.historicalSamples === 1 ? "stage" : "stages"}.
      </p>
      {facts.length > 0 && <div className="flex flex-wrap gap-x-5 gap-y-2">{facts}</div>}
      {stage.kind === "weak_areas" && analytics.selectedThemes.length > 0 && (
        <p className="text-[11px]" style={{ color: LEAGUECRAFT_INK.body }} data-testid="stage-analysis-themes">
          <span className="font-semibold" style={{ color: LEAGUECRAFT_INK.strong }}>Built from</span>{" "}
          {analytics.selectedThemes.map(familyLabel).join(", ")}
        </p>
      )}
      <CategoryBars title="Categories" groups={analytics.categoryPerformance} />
      <FamilyBars groups={analytics.familyPerformance} />
    </>
  );
}
