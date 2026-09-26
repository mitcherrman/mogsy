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
 * LAYOUT — ONE DAILY OBJECT (HUB6)
 * ───────────────────────────────
 * A run is one contained object: a header that says when it was and how it
 * went (date, score, an accuracy ring beside its C/A), then its stages hung
 * on a numbered spine so they visibly belong to it, then its own analysis
 * footer. Structure is carried by containment, the spine and type weight —
 * not by labels: a stage's analysis toggle is an icon whose name is given to
 * assistive tech.
 *
 * The run and each stage are inline-size containers (HUB3's row pattern).
 * Wide, a stage is one ruled line (node, kind, result, questions, toggle).
 * Narrow, it wraps: kind and toggle first, then the result and the question
 * rail indented past the spine. Nothing has a width that can push the page
 * sideways.
 */
import { useEffect, useId, useRef, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  Crosshair,
  LineChart,
  RotateCcw,
  Shield,
  Swords,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import QuestionTimeline from "@/components/quiz/workspace/QuestionTimeline";
import { useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import { relativeMatchAge } from "@/components/quiz/workspace/RankedMatchRow";
import {
  DailyRunAnalysis,
  StageAnalysis,
  hasExpansion,
} from "@/components/quiz/workspace/HistoryAnalysis";
import { AccuracyRing } from "@/components/quiz/workspace/historyVisuals";
import {
  endedByNote,
  percent,
  planDateLabel,
  stageKindLabel,
} from "@/components/quiz/workspace/historyFormat";
import { useReveal } from "@/lib/motion/useReveal";
import type { MatchReviewView } from "@/lib/ranked-public/contracts";
import type { AnalyticsCapability, DailyHistoryRecord, HistoryStage } from "@/lib/history/contracts";

/** One glyph per stage kind, so a stage is recognised before it is read. A
 *  kind this client does not know yet gets none rather than a wrong one. */
const STAGE_ICON: Readonly<Record<string, LucideIcon>> = {
  standard: Swords,
  time_trial: Timer,
  survival: Shield,
  weak_areas: Crosshair,
  review: RotateCcw,
};

/** The spine's node: 22px, centred on the spine. Stacked, the stage's second
 *  and third lines are indented 30px to clear it — when the stage is at least
 *  16rem wide. Narrower (320px at 200% text), the question rail needs every
 *  pixel for its one 88px icon and two arrows, so the indent is dropped
 *  rather than pushing the rail past the run. */
const NODE = 22;

/**
 * Tailwind emits only whole literal class names, hence two sets. Touch needs
 * the wider threshold because its question targets are 44px.
 *
 * Wide: one ruled line — kind, result, questions, toggle. Stacked: the kind
 * and its toggle share the first line — the kind keeps its whole name and the
 * toggle wraps before the name would break — the result takes the next line
 * and the question rail the one after, both indented past the spine.
 */
const STAGE_LAYOUT = {
  fine: {
    line: "flex flex-wrap items-center gap-x-2.5 gap-y-1 [@container(min-width:34rem)]:flex-nowrap",
    kind: "order-1 max-w-full shrink-0 [@container(min-width:34rem)]:w-[9rem] [@container(min-width:34rem)]:flex-none",
    toggle: "order-2 ml-auto [@container(min-width:34rem)]:order-4",
    result:
      "order-3 basis-full pl-0 [@container(min-width:16rem)]:pl-[30px] [@container(min-width:34rem)]:order-2 [@container(min-width:34rem)]:basis-auto [@container(min-width:34rem)]:w-[8rem] [@container(min-width:34rem)]:pl-0",
    timeline:
      "order-4 basis-full justify-start pl-0 [@container(min-width:16rem)]:pl-[30px] [@container(min-width:34rem)]:order-3 [@container(min-width:34rem)]:basis-0 [@container(min-width:34rem)]:flex-1 [@container(min-width:34rem)]:pl-0",
    analysis: "[@container(min-width:16rem)]:pl-[30px]",
  },
  coarse: {
    line: "flex flex-wrap items-center gap-x-2.5 gap-y-1 [@container(min-width:44rem)]:flex-nowrap",
    kind: "order-1 max-w-full shrink-0 [@container(min-width:44rem)]:w-[9rem] [@container(min-width:44rem)]:flex-none",
    toggle: "order-2 ml-auto [@container(min-width:44rem)]:order-4",
    result:
      "order-3 basis-full pl-0 [@container(min-width:16rem)]:pl-[30px] [@container(min-width:44rem)]:order-2 [@container(min-width:44rem)]:basis-auto [@container(min-width:44rem)]:w-[8rem] [@container(min-width:44rem)]:pl-0",
    timeline:
      "order-4 basis-full justify-start pl-0 [@container(min-width:16rem)]:pl-[30px] [@container(min-width:44rem)]:order-3 [@container(min-width:44rem)]:basis-0 [@container(min-width:44rem)]:flex-1 [@container(min-width:44rem)]:pl-0",
    analysis: "[@container(min-width:16rem)]:pl-[30px]",
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
  iconOnly = false,
  className = "",
}: {
  open: boolean;
  onToggle: () => void;
  controls: string;
  label: string;
  state: string;
  testId: string;
  buttonRef?: React.Ref<HTMLButtonElement>;
  /** The stage toggle shows its chart glyph only; its name is still its
   *  accessible name and its tooltip. */
  iconOnly?: boolean;
  className?: string;
}) {
  const coarse = useCoarsePointer();
  const Icon = iconOnly ? BarChart3 : LineChart;
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      data-testid={testId}
      data-state={state}
      onClick={onToggle}
      title={iconOnly ? label : undefined}
      className={`${className} inline-flex shrink-0 items-center justify-center gap-1 rounded-md border text-[10px] font-bold uppercase tracking-[0.14em] transition-colors hover:bg-[rgba(96,68,28,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        coarse ? "min-h-[44px] min-w-[44px] px-2" : iconOnly ? "h-7 px-1.5" : "h-7 px-2"
      }`}
      style={{
        color: LEAGUECRAFT_INK.brass,
        borderColor: open ? "rgba(96,68,28,0.4)" : "transparent",
        background: open ? "rgba(96,68,28,0.1)" : undefined,
      }}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {iconOnly ? <span className="sr-only">{label}</span> : label}
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
  const Icon = STAGE_ICON[stage.kind];
  const note = endedByNote(stage.basic.endedBy);
  const played = stage.basic.answered > 0;
  const expandable = stageHasOwnExpansion(stage.capability, run);

  return (
    <li
      data-testid="daily-stage-row"
      data-stage-kind={stage.kind}
      data-stage-order={stage.order}
      className="relative py-1.5 [container-type:inline-size]"
    >
      <div className={layout.line}>
        <span
          className={`${layout.kind} flex min-w-0 items-center gap-2 text-[12.5px] font-semibold`}
          style={{ color: LEAGUECRAFT_INK.strong }}
          data-testid="daily-stage-kind"
        >
          {/* The spine's node: the stage's persisted order. */}
          <span
            aria-hidden="true"
            className="relative z-[1] inline-grid shrink-0 place-items-center rounded-full border text-[10.5px] font-bold tabular-nums"
            style={{
              width: NODE,
              height: NODE,
              borderColor: "rgba(83,56,8,0.55)",
              background: "#ecdcb4",
              color: LEAGUECRAFT_INK.brass,
            }}
          >
            {stage.order + 1}
          </span>
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: LEAGUECRAFT_INK.brass }} aria-hidden="true" />}
          <span className="break-words">{kind}</span>
        </span>

        {/* The stage's factual result, ruleset-aware: Standard is scored, so
            its score leads; every stage states C/A; a Time Trial or Survival
            that ended on its own rule says so, in the Daily recap's words. */}
        <span
          className={`${layout.result} shrink-0 text-[12px] tabular-nums`}
          style={{ color: LEAGUECRAFT_INK.body }}
          data-testid="daily-stage-result"
        >
          {played || stage.basic.score > 0 ? (
            <>
              {stage.kind === "standard" && (
                <span className="font-bold" style={{ color: LEAGUECRAFT_INK.strong }} data-testid="daily-stage-score">
                  {stage.basic.score}
                  <span className="sr-only"> score</span>
                  <span aria-hidden="true" style={{ color: LEAGUECRAFT_INK.faint }}> · </span>
                </span>
              )}
              <span className="font-semibold" aria-label={`${stage.basic.correct} of ${stage.basic.answered} correct`}>
                {stage.basic.correct}/{stage.basic.answered}
              </span>
              {note && (
                <span className="text-[11px] italic" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="daily-stage-ended">
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
            iconOnly
            state={stage.capability.state}
            testId="stage-analysis-toggle"
            className={layout.toggle}
          />
        ) : null}
      </div>
      {expandable && open && (
        <div className={layout.analysis}>
          <StageAnalysis stage={stage} id={regionId} onRetry={onRetry} />
        </div>
      )}
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
  // The ring draws its share the first time the run is seen.
  const ring = useReveal<HTMLSpanElement>({ durationMs: 750 });

  useEffect(() => {
    if (openAnalysisSignal === null || !expandable) return;
    setOpen(true);
    toggleRef.current?.focus({ preventScroll: true });
    // The run may sit below an open Owned & Missed section, or arrive after
    // the hub already scrolled to History — so it brings itself into view.
    // Instant, not smooth: an arrival that silently stays put is the worse
    // failure.
    rowRef.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
  }, [openAnalysisSignal, expandable]);

  return (
    <li
      ref={rowRef}
      data-testid="daily-run-row"
      data-run-stages={record.stages.length}
      className="relative my-3 rounded-lg border [container-type:inline-size] first:mt-0 last:mb-0"
      style={{
        borderColor: "rgba(96,68,28,0.36)",
        background: LEAGUECRAFT_INK.inset,
        boxShadow: "inset 0 1px 0 rgba(255,249,233,0.35), 0 1px 0 rgba(255,249,233,0.4)",
      }}
    >
      {/* The marginal rule, in brass: a Daily has no verdict to colour it. */}
      <span aria-hidden="true" className="absolute inset-y-0 -left-px w-[3px] rounded-l-lg" style={{ background: "#8a6a2c" }} />

      {/* ── When it was, and how it went ─────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b py-2.5 pl-4 pr-3"
        style={{ borderColor: "rgba(96,68,28,0.22)" }}
      >
        <span
          aria-hidden="true"
          className="hidden h-9 w-9 shrink-0 place-items-center rounded-md border [@container(min-width:22rem)]:grid"
          style={{ borderColor: "rgba(83,56,8,0.4)", background: "rgba(255,246,222,0.35)" }}
        >
          <CalendarDays className="h-4 w-4" style={{ color: LEAGUECRAFT_INK.brass }} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 text-[10px]">
            <span
              className="font-extrabold uppercase tracking-[0.2em]"
              style={{ color: LEAGUECRAFT_INK.brass, textShadow: LEAGUECRAFT_INK.press }}
            >
              Daily
            </span>
            <span style={{ color: LEAGUECRAFT_INK.faint }} data-testid="daily-run-age">
              {relativeMatchAge(record.completedAt)}
            </span>
          </div>
          <div
            className="text-[17px] font-extrabold leading-tight"
            style={{ color: LEAGUECRAFT_INK.strong, textShadow: LEAGUECRAFT_INK.press }}
            data-testid="daily-run-date"
          >
            {planDateLabel(record.planDate)}
          </div>
        </div>

        <span className="min-w-0 flex-1" />

        <div className="flex shrink-0 items-center gap-3 tabular-nums" data-testid="daily-run-basic">
          <div className="text-right leading-none">
            <div className="text-[9.5px] font-bold uppercase tracking-[0.16em]" style={{ color: LEAGUECRAFT_INK.faint }}>
              Score
            </div>
            <div
              className="mt-1 text-[22px] font-black"
              style={{ color: LEAGUECRAFT_INK.strong, textShadow: LEAGUECRAFT_INK.press }}
              data-testid="daily-run-score"
            >
              {record.basic.score}
            </div>
          </div>
          <span aria-hidden="true" className="h-8 w-px" style={{ background: "rgba(96,68,28,0.25)" }} />
          <span ref={ring.ref} className="flex items-center gap-2">
            <AccuracyRing accuracy={record.basic.accuracy} progress={ring.progress} size={46} stroke={4}>
              {accuracy ? (
                <span className="text-[11.5px] font-extrabold" style={{ color: LEAGUECRAFT_INK.strong }} data-testid="daily-run-accuracy">
                  {accuracy}
                </span>
              ) : (
                <span className="text-[11.5px]" style={{ color: LEAGUECRAFT_INK.faint }} aria-hidden="true">
                  —
                </span>
              )}
            </AccuracyRing>
            <span
              className="text-[13px] font-semibold"
              style={{ color: LEAGUECRAFT_INK.body }}
              aria-label={`${record.basic.correct} of ${record.basic.answered} correct`}
            >
              {record.basic.correct}/{record.basic.answered}
            </span>
          </span>
        </div>
      </div>

      {/* ── The stages, as persisted, on one spine ────────────────────── */}
      <div className="relative py-1 pl-4 pr-3">
        <span
          aria-hidden="true"
          className="absolute bottom-4 top-4 w-px"
          style={{ left: `calc(1rem + ${NODE / 2}px - 0.5px)`, background: "rgba(96,68,28,0.3)" }}
        />
        <ol className="relative" aria-label="Stages" data-testid="daily-stages">
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
      </div>

      {expandable && (
        <div className="border-t pb-2 pl-4 pr-3 pt-1.5" style={{ borderColor: "rgba(96,68,28,0.22)" }}>
          <AnalysisToggle
            buttonRef={toggleRef}
            open={open}
            onToggle={() => setOpen((v) => !v)}
            controls={regionId}
            label="Run analysis"
            state={record.capability.state}
            testId="daily-analysis-toggle"
            className="-ml-2"
          />
          {open && <DailyRunAnalysis record={record} id={regionId} onRetry={onRetry} />}
        </div>
      )}
    </li>
  );
}
