/**
 * HUB6.1 — Daily Focus: one Daily, opened into its analysis screen.
 *
 *   HISTORY → DAILY RECORD → (expand) DAILY FOCUS → (stage) STAGE FOCUS → (question) INSPECTOR
 *
 * Only one Daily is ever in Focus (the History section owns which). Inside
 * it there is ONE analytics canvas, showing either the Daily Overview or
 * exactly one stage. Choosing a stage replaces the canvas content — it never
 * appends a second panel — and "← Daily Overview" puts the overview back in
 * the same place. The stage navigator above the canvas is this run's
 * persisted stage sequence (four on a first Daily, five otherwise, in saved
 * order), and it stays available in every view.
 *
 * A question opened from a stage uses the existing inspector (Popover on a
 * fine pointer, Sheet on touch); closing it leaves Focus, view and scroll
 * exactly where they were, because none of them is state the inspector owns.
 */
import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import { relativeMatchAge } from "@/components/quiz/workspace/RankedMatchRow";
import { DailyRunAnalysis } from "@/components/quiz/workspace/HistoryAnalysis";
import StageFocus from "@/components/quiz/workspace/StageFocus";
import { AccuracyRing } from "@/components/quiz/workspace/historyVisuals";
import { DAILY_TONE, stageTone } from "@/components/quiz/workspace/stageTheme";
import { endedByNote, percent, planDateLabel, stageKindLabel } from "@/components/quiz/workspace/historyFormat";
import { useReveal } from "@/lib/motion/useReveal";
import type { MatchReviewView } from "@/lib/ranked-public/contracts";
import type { DailyHistoryRecord } from "@/lib/history/contracts";

/** What the canvas shows: the Daily Overview, or one stage by its id. */
export type FocusView = "overview" | string;

function Navigator({
  record,
  view,
  onView,
  overviewRef,
  selectedRef,
}: {
  record: DailyHistoryRecord;
  view: FocusView;
  onView: (v: FocusView) => void;
  overviewRef: React.Ref<HTMLButtonElement>;
  selectedRef: React.Ref<HTMLButtonElement>;
}) {
  const coarse = useCoarsePointer();
  const Overview = DAILY_TONE.icon;
  const base =
    "relative flex shrink-0 snap-start flex-col justify-center gap-0.5 rounded-lg border px-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const height = coarse ? "min-h-[52px]" : "min-h-[46px]";
  const selectedOverview = view === "overview";
  return (
    /* Touch: the strip scrolls within itself (a swipe), never the page.
       Mouse: it wraps, so no stage hides behind a horizontal scrollbar. */
    <div
      className={coarse ? "-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]" : ""}
      data-testid="daily-focus-nav-scroll"
    >
      <nav aria-label="Daily stages" data-testid="daily-focus-nav">
        <ol className={`flex gap-1.5 ${coarse ? "snap-x" : "flex-wrap"}`}>
          <li>
            <button
              ref={selectedOverview ? selectedRef : overviewRef}
              type="button"
              onClick={() => onView("overview")}
              aria-current={selectedOverview ? "page" : undefined}
              data-testid="daily-focus-overview"
              className={`${base} ${height} min-w-[7.5rem]`}
              style={{
                borderColor: selectedOverview ? DAILY_TONE.edge : "rgba(96,68,28,0.2)",
                background: selectedOverview ? DAILY_TONE.tint : "transparent",
                borderTopWidth: 3,
                borderTopColor: selectedOverview ? DAILY_TONE.ink : "rgba(96,68,28,0.2)",
              }}
            >
              <span className="flex items-center gap-1.5 text-[11.5px] font-bold" style={{ color: DAILY_TONE.ink }}>
                <Overview className="h-3.5 w-3.5" aria-hidden="true" />
                Daily Overview
              </span>
            </button>
          </li>
          {record.stages.map((stage) => {
            const tone = stageTone(stage.kind);
            const Icon = tone.icon;
            const selected = view === stage.stageId;
            const note = endedByNote(stage.basic.endedBy);
            const played = stage.basic.answered > 0 || stage.basic.score > 0;
            return (
              <li key={stage.stageId}>
                <button
                  ref={selected ? selectedRef : undefined}
                  type="button"
                  onClick={() => onView(stage.stageId)}
                  aria-current={selected ? "page" : undefined}
                  data-testid="daily-focus-stage"
                  data-stage-kind={stage.kind}
                  data-stage-order={stage.order}
                  className={`${base} ${height} min-w-[8.25rem]`}
                  style={{
                    borderColor: selected ? tone.edge : "rgba(96,68,28,0.2)",
                    background: selected ? tone.tint : "transparent",
                    borderTopWidth: 3,
                    borderTopColor: tone.ink,
                  }}
                >
                  <span className="flex items-center gap-1.5 text-[11.5px] font-bold" style={{ color: tone.ink }}>
                    <span className="tabular-nums" style={{ color: LEAGUECRAFT_INK.faint }}>
                      {stage.order + 1}
                    </span>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {stageKindLabel(stage.kind)}
                  </span>
                  <span className="text-[11px] tabular-nums" style={{ color: LEAGUECRAFT_INK.body }}>
                    {played ? (
                      <>
                        {stage.kind === "standard" && <span className="font-bold">{stage.basic.score} · </span>}
                        <span className="font-semibold">
                          {stage.basic.correct}/{stage.basic.answered}
                        </span>
                        {note && <span className="italic" style={{ color: LEAGUECRAFT_INK.faint }}> · {note}</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}

export default function DailyFocus({
  record,
  view,
  onView,
  reviewFor,
  onRetry,
  collapse,
}: {
  record: DailyHistoryRecord;
  view: FocusView;
  onView: (v: FocusView) => void;
  reviewFor: (matchId: string | null) => MatchReviewView | null;
  onRetry?: () => void;
  /** The header's collapse control (the run's own toggle). */
  collapse: React.ReactNode;
}) {
  const ring = useReveal<HTMLSpanElement>({ durationMs: 900 });
  const accuracy = percent(record.basic.accuracy);
  const stage = view === "overview" ? null : record.stages.find((s) => s.stageId === view) ?? null;
  const overviewRef = useRef<HTMLButtonElement | null>(null);
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Direction of travel for the canvas transition: deeper (Overview → stage,
  // or a later stage) enters from the right; back enters from the left.
  const order = (v: FocusView) => (v === "overview" ? -1 : record.stages.findIndex((s) => s.stageId === v));
  const previous = useRef<FocusView>(view);
  const direction = order(view) >= order(previous.current) ? "right" : "left";
  useEffect(() => {
    if (previous.current === view) return;
    previous.current = view;
    // Keep the reader at the canvas they just changed: if its top has
    // scrolled above the viewport, bring it back — instantly, so nothing is
    // animated for a reader who asked for less motion.
    const top = canvasRef.current?.getBoundingClientRect().top;
    if (top !== undefined && top < 0) canvasRef.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
  }, [view]);

  const back = () => {
    onView("overview");
    // The back control unmounts with the stage; focus goes to the overview
    // entry it returned to rather than being dropped on the page.
    requestAnimationFrame?.(() => selectedRef.current?.focus({ preventScroll: true }));
  };

  return (
    <div className="history-unfold" data-testid="daily-focus" data-view={stage ? stage.kind : "overview"}>
      {/* ── The Daily: when, and how it went ───────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 pb-3 pt-3.5">
        <span
          aria-hidden="true"
          className="hidden h-12 w-12 shrink-0 place-items-center rounded-lg border [@container(min-width:26rem)]:grid"
          style={{ borderColor: DAILY_TONE.edge, background: "rgba(255,246,222,0.4)" }}
        >
          <DAILY_TONE.icon className="h-5 w-5" style={{ color: DAILY_TONE.ink }} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 text-[10.5px]">
            <span className="font-extrabold uppercase tracking-[0.2em]" style={{ color: DAILY_TONE.ink, textShadow: LEAGUECRAFT_INK.press }}>
              Daily
            </span>
            <span style={{ color: LEAGUECRAFT_INK.faint }} data-testid="daily-run-age">
              {relativeMatchAge(record.completedAt)}
            </span>
          </div>
          <div
            className="text-[24px] font-black leading-tight"
            style={{ color: LEAGUECRAFT_INK.strong, textShadow: LEAGUECRAFT_INK.press }}
            data-testid="daily-run-date"
          >
            {planDateLabel(record.planDate)}
          </div>
        </div>
        <span className="min-w-0 flex-1" />
        {/* Wraps rather than overhanging: at 320px with 200% text the ring
            and its C/A take a line of their own under the score. */}
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-4 gap-y-2 tabular-nums" data-testid="daily-run-basic">
          <div className="text-right leading-none">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: LEAGUECRAFT_INK.faint }}>
              Score
            </div>
            <div
              className="mt-1 text-[34px] font-black"
              style={{ color: LEAGUECRAFT_INK.strong, textShadow: LEAGUECRAFT_INK.press }}
              data-testid="daily-run-score"
            >
              {record.basic.score}
            </div>
          </div>
          <span aria-hidden="true" className="hidden h-12 w-px [@container(min-width:22rem)]:block" style={{ background: "rgba(96,68,28,0.25)" }} />
          <span ref={ring.ref} className="flex min-w-0 items-center gap-2.5">
            <AccuracyRing accuracy={record.basic.accuracy} progress={ring.progress} size={68} stroke={6}>
              {accuracy ? (
                <span className="text-[15px] font-black" style={{ color: LEAGUECRAFT_INK.strong }} data-testid="daily-run-accuracy">
                  {accuracy}
                </span>
              ) : (
                <span className="text-[15px]" style={{ color: LEAGUECRAFT_INK.faint }} aria-hidden="true">
                  —
                </span>
              )}
            </AccuracyRing>
            <span
              className="text-[16px] font-bold"
              style={{ color: LEAGUECRAFT_INK.body }}
              aria-label={`${record.basic.correct} of ${record.basic.answered} correct`}
            >
              {record.basic.correct}/{record.basic.answered}
            </span>
          </span>
        </div>
        <div className="basis-full [@container(min-width:40rem)]:basis-auto">{collapse}</div>
      </div>

      {/* ── The stages: this run's persisted sequence, and the way in ──── */}
      <div className="border-y px-3 py-2.5" style={{ borderColor: "rgba(96,68,28,0.2)", background: "rgba(112,82,36,0.06)" }}>
        <Navigator record={record} view={view} onView={onView} overviewRef={overviewRef} selectedRef={selectedRef} />
      </div>

      {/* ── The ONE canvas ─────────────────────────────────────────────── */}
      <div
        ref={canvasRef}
        className="min-h-[16rem] scroll-mt-4 overflow-x-clip px-4 py-4"
        data-testid="daily-focus-canvas"
        data-view={stage ? "stage" : "overview"}
        data-stage-kind={stage?.kind}
        role="region"
        aria-label={stage ? `${stageKindLabel(stage.kind)} stage` : "Daily Overview"}
      >
        <div key={view} className={`history-canvas-in history-canvas-in--${direction}`}>
          {stage ? (
            <StageFocus
              stage={stage}
              review={reviewFor(stage.reviewMatchId)}
              onBack={back}
              onRetry={onRetry}
              runCapabilityState={record.capability.state}
            />
          ) : (
            <DailyRunAnalysis record={record} onRetry={onRetry} />
          )}
        </div>
      </div>
    </div>
  );
}

/** The run's one expand/collapse control, in its two positions. */
export function FocusToggle({
  open,
  onToggle,
  state,
  buttonRef,
  className = "",
}: {
  open: boolean;
  onToggle: () => void;
  /** The run's capability state, for hosts and tests; it changes nothing
   *  here — Focus opens for every run, analytics appear only where granted. */
  state: string;
  buttonRef?: React.Ref<HTMLButtonElement>;
  className?: string;
}) {
  const coarse = useCoarsePointer();
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-expanded={open}
      data-testid="daily-analysis-toggle"
      data-state={state}
      onClick={onToggle}
      className={`${className} inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border text-[10px] font-bold uppercase tracking-[0.14em] transition-colors hover:bg-[rgba(96,68,28,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        coarse ? "min-h-[44px] px-3" : "h-8 px-2.5"
      }`}
      style={{
        color: LEAGUECRAFT_INK.brass,
        borderColor: open ? "rgba(96,68,28,0.4)" : "rgba(96,68,28,0.22)",
        background: open ? "rgba(96,68,28,0.08)" : undefined,
      }}
    >
      <DAILY_TONE.icon className="h-3.5 w-3.5" aria-hidden="true" />
      Run analysis
      <ChevronDown
        className={`h-3 w-3 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        aria-hidden="true"
      />
    </button>
  );
}
