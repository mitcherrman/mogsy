/**
 * HUB4 — one completed Daily run in History: Daily → Stage → Question.
 *
 * THE PARENT IDENTIFIES AND SUMMARISES; THE STAGES ARE THE COMPOSITION
 * ───────────────────────────────────────────────────────────────────
 * The run's own line carries what only the run owns: which Daily it was, its
 * score, its C/A and its accuracy. Beneath it, every persisted stage in its
 * persisted order — four when the run's first Daily had no Weak Areas, five
 * normally, and exactly what the server sent in every case. The stage list IS
 * the run's composition, so no separate sequence restates it.
 *
 * QUESTIONS ARE OPEN BEFORE ANYTHING IS EXPANDED
 * ──────────────────────────────────────────────
 * Every stage carries HUB3's `QuestionTimeline`, unchanged: its icons fill
 * from the stage's own child-match review (`review_identity`), open the same
 * `QuestionReviewCard` in a Popover on a fine pointer and in a bottom Sheet on
 * touch, and need no Premium expansion. The only expansions here are the
 * Premium analyses, and each appears only when the server's capability state
 * gives it something to say.
 *
 * LAYOUT — HUB3's ROW PATTERN
 * ───────────────────────────
 * The run and each stage are inline-size containers. Wide, a stage is one
 * ruled line (order, kind, result, questions, analysis toggle). Narrow, it
 * wraps: kind and result first, the question rail on its own full-width line.
 * Nothing has a width that can push the page sideways.
 */
import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import QuestionTimeline from "@/components/quiz/workspace/QuestionTimeline";
import { useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import { relativeMatchAge } from "@/components/quiz/workspace/RankedMatchRow";
import {
  DailyRunAnalysis,
  StageAnalysis,
  hasExpansion,
} from "@/components/quiz/workspace/HistoryAnalysis";
import {
  endedByNote,
  percent,
  planDateLabel,
  stageKindLabel,
} from "@/components/quiz/workspace/historyFormat";
import type { MatchReviewView } from "@/lib/ranked-public/contracts";
import type { AnalyticsCapability, DailyHistoryRecord, HistoryStage } from "@/lib/history/contracts";

/**
 * Tailwind emits only whole literal class names, hence two sets. Touch needs
 * the wider threshold because its question targets are 44px.
 *
 * Wide: one ruled line — kind, result, questions, toggle. Stacked: the kind
 * and its toggle share the first line — the kind keeps its whole name and the
 * toggle wraps before the name would break — the result takes the next line
 * and the question rail the one after.
 */
const STAGE_LAYOUT = {
  fine: {
    line: "flex flex-wrap items-center gap-x-2 gap-y-1 [@container(min-width:34rem)]:flex-nowrap",
    kind: "order-1 max-w-full shrink-0 [@container(min-width:34rem)]:w-[6.5rem] [@container(min-width:34rem)]:flex-none [@container(min-width:34rem)]:truncate",
    toggle: "order-2 ml-auto [@container(min-width:34rem)]:order-4",
    result: "order-3 basis-full [@container(min-width:34rem)]:order-2 [@container(min-width:34rem)]:basis-auto [@container(min-width:34rem)]:w-[7.5rem]",
    timeline:
      "order-4 basis-full justify-start [@container(min-width:34rem)]:order-3 [@container(min-width:34rem)]:basis-0 [@container(min-width:34rem)]:flex-1",
  },
  coarse: {
    line: "flex flex-wrap items-center gap-x-2 gap-y-1 [@container(min-width:44rem)]:flex-nowrap",
    kind: "order-1 max-w-full shrink-0 [@container(min-width:44rem)]:w-[6.5rem] [@container(min-width:44rem)]:flex-none [@container(min-width:44rem)]:truncate",
    toggle: "order-2 ml-auto [@container(min-width:44rem)]:order-4",
    result: "order-3 basis-full [@container(min-width:44rem)]:order-2 [@container(min-width:44rem)]:basis-auto [@container(min-width:44rem)]:w-[7.5rem]",
    timeline:
      "order-4 basis-full justify-start [@container(min-width:44rem)]:order-3 [@container(min-width:44rem)]:basis-0 [@container(min-width:44rem)]:flex-1",
  },
} as const;

/**
 * Whether a stage gets its own analysis toggle.
 *
 * `upgrade_required` and `temporarily_unavailable` are decided for the whole
 * run and inherited by its stages, so the run's one expansion speaks for
 * them — five identical invitations under one run would be the price printed
 * five times. A stage whose state differs from its run's still gets its own.
 */
export function stageHasOwnExpansion(stage: AnalyticsCapability, run: AnalyticsCapability): boolean {
  if (!hasExpansion(stage)) return false;
  if (stage.state === "available" || stage.state === "insufficient_evidence") return true;
  return stage.state !== run.state;
}

function AnalysisToggle({
  open,
  onToggle,
  controls,
  label,
  state,
  testId,
  buttonRef,
  className = "",
}: {
  open: boolean;
  onToggle: () => void;
  controls: string;
  label: string;
  state: string;
  testId: string;
  buttonRef?: React.Ref<HTMLButtonElement>;
  className?: string;
}) {
  const coarse = useCoarsePointer();
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      data-testid={testId}
      data-state={state}
      onClick={onToggle}
      className={`${className} inline-flex shrink-0 items-center gap-1 rounded px-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        coarse ? "min-h-[44px]" : "py-0.5"
      }`}
      style={{ color: LEAGUECRAFT_INK.brass }}
    >
      {label}
      <ChevronDown
        className={`h-3 w-3 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        aria-hidden="true"
      />
    </button>
  );
}

function StageRow({
  stage,
  run,
  review,
  onRetry,
}: {
  stage: HistoryStage;
  run: AnalyticsCapability;
  review: MatchReviewView | null;
  onRetry?: () => void;
}) {
  const layout = STAGE_LAYOUT[useCoarsePointer() ? "coarse" : "fine"];
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const kind = stageKindLabel(stage.kind);
  const note = endedByNote(stage.basic.endedBy);
  const played = stage.basic.answered > 0;
  const expandable = stageHasOwnExpansion(stage.capability, run);

  return (
    <li
      data-testid="daily-stage-row"
      data-stage-kind={stage.kind}
      data-stage-order={stage.order}
      className="border-t py-1 [container-type:inline-size] first:border-t-0"
      style={{ borderColor: "rgba(96,68,28,0.18)" }}
    >
      <div className={layout.line}>
        <span
          className={`${layout.kind} break-words text-[11.5px] font-semibold`}
          style={{ color: LEAGUECRAFT_INK.strong }}
          data-testid="daily-stage-kind"
        >
          <span className="mr-1.5 tabular-nums" style={{ color: LEAGUECRAFT_INK.faint }} aria-hidden="true">
            {stage.order + 1}
          </span>
          {kind}
        </span>

        {/* The stage's factual result, ruleset-aware: Standard is scored, so
            its score leads; every stage states C/A; a Time Trial or Survival
            that ended on its own rule says so, in the Daily recap's words. */}
        <span
          className={`${layout.result} shrink-0 text-[11px] tabular-nums`}
          style={{ color: LEAGUECRAFT_INK.body }}
          data-testid="daily-stage-result"
        >
          {played || stage.basic.score > 0 ? (
            <>
              {stage.kind === "standard" && (
                <span className="font-semibold" style={{ color: LEAGUECRAFT_INK.strong }} data-testid="daily-stage-score">
                  {stage.basic.score}
                  <span className="sr-only"> score</span>
                  <span aria-hidden="true"> · </span>
                </span>
              )}
              <span aria-label={`${stage.basic.correct} of ${stage.basic.answered} correct`}>
                {stage.basic.correct}/{stage.basic.answered}
              </span>
              {note && (
                <span style={{ color: LEAGUECRAFT_INK.faint }} data-testid="daily-stage-ended">
                  {" "}· {note}
                </span>
              )}
            </>
          ) : (
            <span style={{ color: LEAGUECRAFT_INK.faint }}>—</span>
          )}
        </span>

        {stage.questions.length > 0 && (
          <QuestionTimeline
            className={layout.timeline}
            matchId={stage.reviewMatchId ?? ""}
            // One timeline position per Ranked round/module occurrence
            // (HUB2.1 `round_number`), never one per question result: a
            // Standard or Survival round can settle several questions, and
            // the review draws them in one card. The review is the authority
            // once it lands; without round ordinals nothing holds the place.
            roundCount={stage.rounds?.length ?? 0}
            review={review}
          />
        )}

        {expandable ? (
          <AnalysisToggle
            open={open}
            onToggle={() => setOpen((v) => !v)}
            controls={regionId}
            label="Analysis"
            state={stage.capability.state}
            testId="stage-analysis-toggle"
            className={layout.toggle}
          />
        ) : null}
      </div>
      {expandable && open && <StageAnalysis stage={stage} id={regionId} onRetry={onRetry} />}
    </li>
  );
}

export default function DailyRunRow({
  record,
  reviewFor,
  onRetry,
  openAnalysisSignal = null,
}: {
  record: DailyHistoryRecord;
  /** The stage's loaded child-match review, from the record's ONE loader. */
  reviewFor: (matchId: string | null) => MatchReviewView | null;
  onRetry?: () => void;
  /** A changing value opens and focuses this run's analysis — the legacy
   *  `#trends` arrival. */
  openAnalysisSignal?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const rowRef = useRef<HTMLLIElement | null>(null);
  const expandable = hasExpansion(record.capability);
  const accuracy = percent(record.basic.accuracy);

  useEffect(() => {
    if (openAnalysisSignal === null || !expandable) return;
    setOpen(true);
    toggleRef.current?.focus({ preventScroll: true });
    // The run may sit below an open Owned & Missed section, or arrive after
    // the hub already scrolled to History — so it brings itself into view.
    // Instant, not smooth: an arrival that silently stays put is the worse
    // failure, and there is no motion here for reduced motion to remove.
    rowRef.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
  }, [openAnalysisSignal, expandable]);

  return (
    <li
      ref={rowRef}
      data-testid="daily-run-row"
      data-run-stages={record.stages.length}
      className="relative my-1.5 rounded border py-1.5 pl-3 pr-2.5 [container-type:inline-size] first:mt-0 last:mb-0"
      style={{ borderColor: "rgba(96,68,28,0.34)", background: LEAGUECRAFT_INK.inset }}
    >
      {/* The marginal rule, in brass: a Daily has no verdict to colour it. */}
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] rounded-l" style={{ background: "#8a6a2c" }} />

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <CalendarDays className="h-3 w-3 shrink-0 self-center" style={{ color: LEAGUECRAFT_INK.brass }} aria-hidden="true" />
        <span
          className="shrink-0 text-[10px] font-extrabold uppercase tracking-[0.18em]"
          style={{ color: LEAGUECRAFT_INK.brass, textShadow: LEAGUECRAFT_INK.press }}
        >
          Daily
        </span>
        <span className="shrink-0 text-[13px] font-semibold" style={{ color: LEAGUECRAFT_INK.strong }} data-testid="daily-run-date">
          {planDateLabel(record.planDate)}
        </span>
        <span className="min-w-0 flex-1" />
        <span className="flex shrink-0 flex-wrap items-baseline gap-x-2 text-[11px] tabular-nums" data-testid="daily-run-basic">
          <span style={{ color: LEAGUECRAFT_INK.faint }}>
            Score{" "}
            <span className="text-[13px] font-extrabold" style={{ color: LEAGUECRAFT_INK.strong, textShadow: LEAGUECRAFT_INK.press }} data-testid="daily-run-score">
              {record.basic.score}
            </span>
          </span>
          <span style={{ color: LEAGUECRAFT_INK.body }} aria-label={`${record.basic.correct} of ${record.basic.answered} correct`}>
            {record.basic.correct}/{record.basic.answered}
          </span>
          {accuracy && (
            <span className="font-semibold" style={{ color: LEAGUECRAFT_INK.strong }} data-testid="daily-run-accuracy">
              {accuracy}
            </span>
          )}
        </span>
      </div>

      <div className="text-[10.5px]" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="daily-run-age">
        {relativeMatchAge(record.completedAt)}
      </div>

      <ol className="mt-1" aria-label="Stages" data-testid="daily-stages">
        {record.stages.map((stage) => (
          <StageRow
            key={stage.stageId}
            stage={stage}
            run={record.capability}
            review={reviewFor(stage.reviewMatchId)}
            onRetry={onRetry}
          />
        ))}
      </ol>

      {expandable && (
        <div className="mt-0.5 flex">
          <AnalysisToggle
            buttonRef={toggleRef}
            open={open}
            onToggle={() => setOpen((v) => !v)}
            controls={regionId}
            label="Run analysis"
            state={record.capability.state}
            testId="daily-analysis-toggle"
          />
        </div>
      )}
      {expandable && open && <DailyRunAnalysis record={record} id={regionId} onRetry={onRetry} />}
    </li>
  );
}
