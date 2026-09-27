/**
 * HUB4 → HUB6.2 — one completed Daily run in History: Daily → Stage → Question.
 *
 * THE PARENT IDENTIFIES AND SUMMARISES; THE STAGES ARE THE COMPOSITION
 * ───────────────────────────────────────────────────────────────────
 * The run's own line carries what only the run owns: which Daily it was, its
 * score, its C/A and its accuracy. Beneath it, every persisted stage in its
 * persisted order — four when the run's first Daily had no Weak Areas, five
 * normally, and exactly what the server sent in every case. The stage list IS
 * the run's composition, so no separate sequence restates it.
 *
 * QUESTIONS ARE ALWAYS OPEN
 * ─────────────────────────
 * Every stage carries HUB3's `QuestionTimeline`, unchanged: its icons fill
 * from the stage's own child-match review (`review_identity`), open the same
 * `QuestionReviewCard` in a Popover on a fine pointer and in a bottom Sheet on
 * touch — collapsed, expanded, and with any stage selected.
 *
 * HUB6.2 — ONE ENTRY THAT GROWS (owner correction of HUB6.1)
 * ──────────────────────────────────────────────────────────
 * There is no second Daily screen and no stage screen. This one entry is the
 * backbone at every layer:
 *
 *   collapsed          header · every stage row + question rail · "Run analysis"
 *   expanded           the SAME header, rows and rails, in the same places; the
 *                      card's edges move outward and an analytics region opens
 *                      beneath the stages (Daily Overview)
 *   stage selected     the SAME rows; the chosen stage's row is lit in place
 *                      and gains its quick facts under its own icons; the
 *                      analytics region changes to that stage's visual
 *   question           the existing Popover / Sheet, from any icon
 *
 * A stage is selected by its own name in its own row — the rows ARE the
 * stage navigator — and "Daily Overview" in the footer puts the region back
 * without collapsing anything. Which run is expanded, and at which view, is
 * the History section's to decide: only one at a time.
 *
 * The run and each stage are inline-size containers (HUB3's row pattern).
 * Wide, a stage is one ruled line (node, name, result, questions). Narrow, it
 * wraps: the name first, then the result and the question rail indented past
 * the spine. Nothing has a width that can push the page sideways.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import QuestionTimeline from "@/components/quiz/workspace/QuestionTimeline";
import { buildStageViewModel } from "@/components/quiz/workspace/historyViewModel";
import {
  HistoryHighlightProvider,
  useHistoryHighlight,
  useStageHighlightState,
} from "@/components/quiz/workspace/historyHighlight";
import type { RoundVM } from "@/components/quiz/workspace/historyViewModel";
import QuestionContext from "@/components/quiz/workspace/analytics/QuestionContext";
import { CohortProvider } from "@/components/quiz/workspace/analytics/population";
import { HighlightBar } from "@/components/quiz/workspace/analytics/roomParts";
import { useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import { relativeMatchAge } from "@/components/quiz/workspace/RankedMatchRow";
import { DailyRunAnalysis, hasExpansion } from "@/components/quiz/workspace/HistoryAnalysis";
import { StageAnalyticsView, StageLocalFacts } from "@/components/quiz/workspace/StageAnalytics";
import { AccuracyRing } from "@/components/quiz/workspace/historyVisuals";
import { DAILY_TONE, stageTone } from "@/components/quiz/workspace/stageTheme";
import {
  endedByNote,
  percent,
  planDateLabel,
  stageKindLabel,
} from "@/components/quiz/workspace/historyFormat";
import { useMotionAllowed, useReveal } from "@/lib/motion/useReveal";
import type { MatchReviewView } from "@/lib/ranked-public/contracts";
import type { DailyHistoryRecord, HistoryStage } from "@/lib/history/contracts";

/** What the analytics region shows: the Daily Overview, or one stage by id. */
export type FocusView = "overview" | string;

/** The spine's node: 22px, centred on the spine. Stacked, the stage's second
 *  and third lines are indented 30px to clear it — when the stage is at least
 *  16rem wide. Narrower (320px at 200% text), the question rail needs every
 *  pixel for its one 88px icon and two arrows, so the indent is dropped
 *  rather than pushing the rail past the run. */
const NODE = 22;

/** How long the region takes to open or close (`history-region` in CSS). */
const REGION_MS = 320;

/**
 * Tailwind emits only whole literal class names, hence two sets. Touch needs
 * the wider threshold because its question targets are 44px.
 *
 * Wide: one ruled line — name, result, questions. Stacked: the name, then the
 * result and the question rail, both indented past the spine. A selected
 * stage's quick facts take a last line of their own, under its icons.
 */
const STAGE_LAYOUT = {
  fine: {
    line: "flex flex-wrap items-center gap-x-2.5 gap-y-1 [@container(min-width:34rem)]:flex-nowrap",
    kind: "order-1 max-w-full shrink-0 [@container(min-width:34rem)]:w-[9.5rem] [@container(min-width:34rem)]:flex-none",
    result:
      "order-3 basis-full pl-0 [@container(min-width:16rem)]:pl-[30px] [@container(min-width:34rem)]:order-2 [@container(min-width:34rem)]:basis-auto [@container(min-width:34rem)]:w-[8rem] [@container(min-width:34rem)]:pl-0",
    timeline:
      "order-4 basis-full justify-start pl-0 [@container(min-width:16rem)]:pl-[30px] [@container(min-width:34rem)]:order-3 [@container(min-width:34rem)]:basis-0 [@container(min-width:34rem)]:flex-1 [@container(min-width:34rem)]:pl-0",
    facts: "pl-0 [@container(min-width:16rem)]:pl-[30px]",
  },
  coarse: {
    line: "flex flex-wrap items-center gap-x-2.5 gap-y-1 [@container(min-width:44rem)]:flex-nowrap",
    kind: "order-1 max-w-full shrink-0 [@container(min-width:44rem)]:w-[9.5rem] [@container(min-width:44rem)]:flex-none",
    result:
      "order-3 basis-full pl-0 [@container(min-width:16rem)]:pl-[30px] [@container(min-width:44rem)]:order-2 [@container(min-width:44rem)]:basis-auto [@container(min-width:44rem)]:w-[8rem] [@container(min-width:44rem)]:pl-0",
    timeline:
      "order-4 basis-full justify-start pl-0 [@container(min-width:16rem)]:pl-[30px] [@container(min-width:44rem)]:order-3 [@container(min-width:44rem)]:basis-0 [@container(min-width:44rem)]:flex-1 [@container(min-width:44rem)]:pl-0",
    facts: "pl-0 [@container(min-width:16rem)]:pl-[30px]",
  },
} as const;

/** The run's one expand/collapse control. */
function FocusToggle({
  open,
  onToggle,
  state,
  buttonRef,
}: {
  open: boolean;
  onToggle: () => void;
  /** The run's capability state, for hosts and tests; it changes nothing
   *  here — every run expands, analytics appear only where granted. */
  state: string;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  const coarse = useCoarsePointer();
  const Icon = DAILY_TONE.icon;
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-expanded={open}
      data-testid="daily-analysis-toggle"
      data-state={state}
      onClick={onToggle}
      className={`-ml-1 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border text-[10px] font-bold uppercase tracking-[0.14em] transition-colors hover:bg-[rgba(96,68,28,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        coarse ? "min-h-[44px] px-3" : "h-8 px-2.5"
      }`}
      style={{
        color: LEAGUECRAFT_INK.brass,
        borderColor: open ? "rgba(96,68,28,0.4)" : "rgba(96,68,28,0.22)",
        background: open ? "rgba(96,68,28,0.08)" : undefined,
      }}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      Run analysis
      <ChevronDown
        className={`h-3 w-3 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        aria-hidden="true"
      />
    </button>
  );
}

function StageRow({
  record,
  stage,
  review,
  selected,
  dimmed,
  onSelect,
}: {
  record: DailyHistoryRecord;
  stage: HistoryStage;
  review: MatchReviewView | null;
  /** This stage is the one the analytics region shows. */
  selected: boolean;
  /** Another stage is selected: this row steps back, but stays whole. */
  dimmed: boolean;
  onSelect: () => void;
}) {
  const coarse = useCoarsePointer();
  const layout = STAGE_LAYOUT[coarse ? "coarse" : "fine"];
  const kind = stageKindLabel(stage.kind);
  const tone = stageTone(stage.kind);
  const Icon = tone.icon;
  const note = endedByNote(stage.basic.endedBy);
  const played = stage.basic.answered > 0;
  // HUB6.3D: the History track reads each position's result from the DTO.
  const view = useMemo(() => buildStageViewModel(stage), [stage]);
  const highlight = useStageHighlightState(stage.stageId);
  // HUB6.3E: a question's factual History context under its review card
  // (Free facts for everyone; Premium lines where the server sent them).
  const detail = useCallback(
    (round: RoundVM) => <QuestionContext record={record} stage={stage} round={round} />,
    [record, stage],
  );

  return (
    <li
      data-testid="daily-stage-row"
      data-stage-kind={stage.kind}
      data-stage-order={stage.order}
      data-selected={selected ? "true" : "false"}
      className={`relative [container-type:inline-size] transition-[padding] duration-300 motion-reduce:transition-none ${
        selected ? "py-2.5" : "py-1.5"
      }`}
    >
      {/* The selected stage is lit where it already is: a wash in its own
          ink behind the row, ruled on the spine side. The row's content does
          not move sideways. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-2 inset-y-0.5 rounded-lg border transition-opacity duration-300 motion-reduce:transition-none"
        style={{
          opacity: selected ? 1 : 0,
          background: `linear-gradient(90deg, ${tone.tint}, rgba(255,246,222,0.18))`,
          borderColor: tone.edge,
          boxShadow: `inset 3px 0 0 ${tone.ink}`,
        }}
      />
      <div
        className={`relative ${layout.line} transition-opacity duration-300 motion-reduce:transition-none`}
        style={{ opacity: dimmed ? 0.62 : 1 }}
      >
        {/* The stage's own name selects it — the rows ARE the navigator. */}
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={`${kind} stage analysis`}
          data-testid="stage-analysis-toggle"
          data-state={stage.capability.state}
          className={`${layout.kind} group -my-1 -ml-1 flex min-w-0 items-center rounded-md py-1 pl-1 pr-1.5 text-left transition-colors hover:bg-[rgba(96,68,28,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            coarse ? "min-h-[44px]" : ""
          }`}
        >
          <span
            className="flex min-w-0 items-center gap-2 text-[12.5px]"
            style={{ color: selected ? tone.ink : LEAGUECRAFT_INK.strong, fontWeight: selected ? 800 : 600 }}
            data-testid="daily-stage-kind"
          >
            {/* The spine's node: the stage's persisted order, in the stage's
                ink — filled when this stage is selected. */}
            <span
              aria-hidden="true"
              className="relative z-[1] inline-grid shrink-0 place-items-center rounded-full border-2 text-[10.5px] font-bold tabular-nums transition-colors duration-300 motion-reduce:transition-none"
              style={{
                width: NODE,
                height: NODE,
                borderColor: selected ? tone.ink : tone.edge,
                background: selected ? tone.ink : "#ecdcb4",
                color: selected ? "#f6ecd2" : tone.ink,
              }}
            >
              {stage.order + 1}
            </span>
            <Icon
              className={`shrink-0 transition-transform duration-300 motion-reduce:transition-none ${selected ? "h-4 w-4" : "h-3.5 w-3.5"}`}
              style={{ color: tone.ink }}
              aria-hidden="true"
            />
            <span className="break-words">{kind}</span>
          </span>
          <ChevronRight
            className={`ml-1 h-3 w-3 shrink-0 transition-opacity motion-reduce:transition-none ${
              selected ? "opacity-0" : "opacity-40 group-hover:opacity-100"
            }`}
            style={{ color: tone.ink }}
            aria-hidden="true"
          />
        </button>

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
            // the review draws them in one card. HUB6.3D: History's own
            // track — as many icons as fit, the DTO's outcome on each, and
            // more room on the selected stage.
            roundCount={stage.rounds?.length ?? 0}
            review={review}
            // A legacy stage without round ordinals keeps the Ranked track:
            // nothing may hold a position the record cannot place (HUB4.1).
            history={stage.rounds ? {
              rounds: view.rounds,
              size: selected ? "selected" : "row",
              highlight: highlight?.ids ?? null,
              locked: highlight?.locked ?? false,
              detail,
            } : undefined}
          />
        )}
      </div>

      {/* The selected stage's quick facts, under its own icons. */}
      {selected && (
        <div className={`history-facts-in relative mt-2 ${layout.facts}`}>
          <StageLocalFacts stage={stage} />
        </div>
      )}
    </li>
  );
}

/** A highlight belongs to the view it was made in: changing the run's view
 *  (another stage, the overview, collapse) clears it. */
function HighlightScope({ focus }: { focus: FocusView | null }) {
  const { setHighlight } = useHistoryHighlight();
  useEffect(() => {
    setHighlight(null);
  }, [focus, setHighlight]);
  return null;
}

type DailyRunRowProps = Parameters<typeof DailyRunEntry>[0];

/**
 * HUB6.3D: each Daily owns ONE local cross-highlight (analytics ↔ question
 * icons). Scoped to the run, so it can never light another run's icons.
 */
export default function DailyRunRow(props: DailyRunRowProps) {
  return (
    <HistoryHighlightProvider>
      <HighlightScope focus={props.focus ?? null} />
      <DailyRunEntry {...props} />
    </HistoryHighlightProvider>
  );
}

function DailyRunEntry({
  record,
  reviewFor,
  onRetry,
  focus = null,
  onFocus,
  openAnalysisSignal = null,
}: {
  record: DailyHistoryRecord;
  /** The stage's loaded child-match review, from the record's ONE loader. */
  reviewFor: (matchId: string | null) => MatchReviewView | null;
  onRetry?: () => void;
  /** This run's expanded view, or null when it is collapsed. */
  focus?: FocusView | null;
  /** Expand this run at a view, or (null) collapse it. */
  onFocus?: (view: FocusView | null) => void;
  /** A changing value focuses and reveals this run's expansion — the legacy
   *  `#trends` arrival, which the section has already opened. */
  openAnalysisSignal?: number | null;
}) {
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const rowRef = useRef<HTMLLIElement | null>(null);
  const accuracy = percent(record.basic.accuracy);
  const expanded = focus !== null;
  const selected = expanded && focus !== "overview" ? record.stages.find((s) => s.stageId === focus) ?? null : null;
  // The ring draws its share the first time the run is seen.
  const ring = useReveal<HTMLSpanElement>({ durationMs: 750 });
  const motion = useMotionAllowed();

  /* The region opens in two beats so it can GROW: mounted closed, then
     opened on the next frame (its rows transition 0fr → 1fr). Closing runs
     the same transition backwards before unmounting. Without motion both
     happen at once. */
  const [regionMounted, setRegionMounted] = useState(expanded);
  const [regionOpen, setRegionOpen] = useState(expanded);
  useEffect(() => {
    if (expanded) {
      setRegionMounted(true);
      if (!motion) {
        setRegionOpen(true);
        return;
      }
      const id = window.requestAnimationFrame(() => setRegionOpen(true));
      return () => window.cancelAnimationFrame(id);
    }
    setRegionOpen(false);
    if (!motion) {
      setRegionMounted(false);
      return;
    }
    const t = window.setTimeout(() => setRegionMounted(false), REGION_MS);
    return () => window.clearTimeout(t);
  }, [expanded, motion]);

  useEffect(() => {
    if (openAnalysisSignal === null || !expanded) return;
    toggleRef.current?.focus({ preventScroll: true });
    // The run may sit below an open Owned & Missed section, or arrive after
    // the hub already scrolled to History — so it brings itself into view.
    rowRef.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
  }, [openAnalysisSignal, expanded]);

  // Collapsing a run ABOVE this one moves this run up; if its top has left
  // the viewport as it expands, bring it back.
  const wasExpanded = useRef(expanded);
  useEffect(() => {
    if (expanded && !wasExpanded.current) {
      const top = rowRef.current?.getBoundingClientRect().top;
      if (top !== undefined && top < 0) rowRef.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
    }
    wasExpanded.current = expanded;
  }, [expanded]);

  // The region's transition direction: toward a later stage from the right,
  // back toward the overview / an earlier stage from the left.
  const order = (v: FocusView | null) =>
    v === null || v === "overview" ? -1 : record.stages.findIndex((s) => s.stageId === v);
  const previousView = useRef<FocusView | null>(focus);
  const direction = order(focus) >= order(previousView.current) ? "right" : "left";
  useEffect(() => {
    previousView.current = focus;
  }, [focus]);

  const select = (stage: HistoryStage) =>
    onFocus?.(selected?.stageId === stage.stageId ? "overview" : stage.stageId);
  // The Daily Overview has nothing to draw for a run without analytics at
  // all; a selected stage always has its own content.
  const regionHasContent = selected !== null || hasExpansion(record.capability);

  return (
    <li
      ref={rowRef}
      data-testid="daily-run-row"
      data-run-stages={record.stages.length}
      data-focused={expanded ? "true" : "false"}
      data-view={expanded ? (selected ? "stage" : "overview") : undefined}
      className={`relative scroll-mt-4 rounded-lg border [container-type:inline-size] first:mt-0 last:mb-0 transition-[margin,box-shadow,border-color,background-color] duration-300 motion-reduce:transition-none ${
        expanded ? "-mx-1.5 my-5 sm:-mx-2.5" : "mx-0 my-3"
      }`}
      style={{
        borderColor: expanded ? DAILY_TONE.edge : "rgba(96,68,28,0.36)",
        background: expanded ? "rgba(112, 82, 36, 0.12)" : LEAGUECRAFT_INK.inset,
        boxShadow: expanded
          ? "inset 0 1px 0 rgba(255,249,233,0.4), 0 14px 32px -18px rgba(58,39,8,0.6), 0 0 0 1px rgba(138,106,44,0.2)"
          : "inset 0 1px 0 rgba(255,249,233,0.35), 0 1px 0 rgba(255,249,233,0.4)",
      }}
    >
      {/* The marginal rule, in the Daily's brass: a Daily has no verdict to
          colour it. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 -left-px rounded-l-lg transition-[width] duration-300 motion-reduce:transition-none ${expanded ? "w-[4px]" : "w-[3px]"}`}
        style={{ background: "#8a6a2c" }}
      />

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
          <DAILY_TONE.icon className="h-4 w-4" style={{ color: LEAGUECRAFT_INK.brass }} />
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

        {/* Wraps rather than overhanging at 320px with 200% text. */}
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-2 tabular-nums" data-testid="daily-run-basic">
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
          <span aria-hidden="true" className="hidden h-8 w-px [@container(min-width:22rem)]:block" style={{ background: "rgba(96,68,28,0.25)" }} />
          <span ref={ring.ref} className="flex min-w-0 items-center gap-2">
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

      {/* ── The stages, as persisted, on one spine — at every layer ───── */}
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
              record={record}
              stage={stage}
              review={reviewFor(stage.reviewMatchId)}
              selected={selected?.stageId === stage.stageId}
              dimmed={selected !== null && selected.stageId !== stage.stageId}
              onSelect={() => select(stage)}
            />
          ))}
        </ol>
      </div>

      {/* ── The run's own control, where it always was ────────────────── */}
      <div
        className="flex flex-wrap items-center gap-2 border-t pb-2 pl-4 pr-3 pt-1.5"
        style={{ borderColor: "rgba(96,68,28,0.22)" }}
      >
        <FocusToggle
          open={expanded}
          state={record.capability.state}
          buttonRef={toggleRef}
          onToggle={() => onFocus?.(expanded ? null : "overview")}
        />
        {selected && (
          <button
            type="button"
            onClick={() => onFocus?.("overview")}
            data-testid="daily-overview-return"
            className="history-facts-in ml-auto inline-flex min-h-[32px] items-center gap-1.5 rounded-md px-2 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors hover:bg-[rgba(96,68,28,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-[44px]"
            style={{ color: LEAGUECRAFT_INK.brass }}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Daily Overview
          </button>
        )}
        {/* A chart's locked selection, where the lit rails are. */}
        {expanded && (
          <div className="basis-full empty:hidden">
            <HighlightBar />
          </div>
        )}
      </div>

      {/* ── The analytics region, grown out of the entry ──────────────── */}
      {regionMounted && regionHasContent && (
        <CohortProvider>
        <div
          className={`history-region grid ${regionOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
          data-open={regionOpen ? "true" : "false"}
        >
          <div className="min-h-0 overflow-hidden">
            <section
              className="border-t px-4 pb-5 pt-4"
              style={{ borderColor: "rgba(96,68,28,0.22)", background: "rgba(255, 246, 222, 0.22)" }}
              data-testid="daily-analytics-region"
              data-view={selected ? "stage" : "overview"}
              data-stage-kind={selected?.kind}
              aria-label={selected ? `${stageKindLabel(selected.kind)} stage analysis` : "Daily Overview"}
            >
              <div key={focus ?? "closed"} className={`history-canvas-in history-canvas-in--${direction}`}>
                {selected ? (
                  <StageAnalyticsView
                    record={record}
                    stage={selected}
                    review={reviewFor(selected.reviewMatchId)}
                    onRetry={onRetry}
                    runCapabilityState={record.capability.state}
                  />
                ) : (
                  <DailyRunAnalysis record={record} onRetry={onRetry} />
                )}
              </div>
            </section>
          </div>
        </div>
        </CohortProvider>
      )}
    </li>
  );
}
