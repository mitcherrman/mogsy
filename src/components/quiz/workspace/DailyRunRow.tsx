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
 * touch, and need no expansion at all.
 *
 * HUB6.1 — THIS IS LAYER 0; DAILY FOCUS IS LAYER 1
 * ────────────────────────────────────────────────
 * The collapsed record below is History's list entry. Its "Run analysis"
 * footer, or any stage's entry, opens the run into Daily Focus (`DailyFocus`)
 * — at the Overview, or straight at that stage. Which run is in Focus is the
 * History section's to decide: only one at a time.
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
import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import QuestionTimeline from "@/components/quiz/workspace/QuestionTimeline";
import { useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import { relativeMatchAge } from "@/components/quiz/workspace/RankedMatchRow";
import DailyFocus, { FocusToggle, type FocusView } from "@/components/quiz/workspace/DailyFocus";
import { AccuracyRing } from "@/components/quiz/workspace/historyVisuals";
import { DAILY_TONE, stageTone } from "@/components/quiz/workspace/stageTheme";
import {
  endedByNote,
  percent,
  planDateLabel,
  stageKindLabel,
} from "@/components/quiz/workspace/historyFormat";
import { useReveal } from "@/lib/motion/useReveal";
import type { MatchReviewView } from "@/lib/ranked-public/contracts";
import type { DailyHistoryRecord, HistoryStage } from "@/lib/history/contracts";

export type { FocusView } from "@/components/quiz/workspace/DailyFocus";

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
 * Wide: one ruled line — kind, result, questions, entry. Stacked: the kind
 * and its entry share the first line — the kind keeps its whole name and the
 * entry wraps before the name would break — the result takes the next line
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
  },
  coarse: {
    line: "flex flex-wrap items-center gap-x-2.5 gap-y-1 [@container(min-width:44rem)]:flex-nowrap",
    kind: "order-1 max-w-full shrink-0 [@container(min-width:44rem)]:w-[9rem] [@container(min-width:44rem)]:flex-none",
    toggle: "order-2 ml-auto [@container(min-width:44rem)]:order-4",
    result:
      "order-3 basis-full pl-0 [@container(min-width:16rem)]:pl-[30px] [@container(min-width:44rem)]:order-2 [@container(min-width:44rem)]:basis-auto [@container(min-width:44rem)]:w-[8rem] [@container(min-width:44rem)]:pl-0",
    timeline:
      "order-4 basis-full justify-start pl-0 [@container(min-width:16rem)]:pl-[30px] [@container(min-width:44rem)]:order-3 [@container(min-width:44rem)]:basis-0 [@container(min-width:44rem)]:flex-1 [@container(min-width:44rem)]:pl-0",
  },
} as const;

/** A stage's way into Stage Focus: its glyph and a chevron, named for the
 *  stage. Every stage has one — Stage Focus shows the basic record to every
 *  reader, and Premium analytics where the server grants them. */
function StageEntry({ stage, onOpen, className }: { stage: HistoryStage; onOpen: () => void; className: string }) {
  const coarse = useCoarsePointer();
  const tone = stageTone(stage.kind);
  const Icon = tone.icon;
  const label = `${stageKindLabel(stage.kind)} stage analysis`;
  return (
    <button
      type="button"
      aria-expanded={false}
      data-testid="stage-analysis-toggle"
      data-state={stage.capability.state}
      onClick={onOpen}
      title={label}
      className={`${className} inline-flex shrink-0 items-center justify-center gap-0.5 rounded-md border border-transparent transition-colors hover:bg-[rgba(96,68,28,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        coarse ? "min-h-[44px] min-w-[44px] px-2" : "h-7 px-1.5"
      }`}
      style={{ color: tone.ink }}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <ChevronRight className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}

function StageRow({
  stage,
  review,
  onOpen,
}: {
  stage: HistoryStage;
  review: MatchReviewView | null;
  onOpen: () => void;
}) {
  const layout = STAGE_LAYOUT[useCoarsePointer() ? "coarse" : "fine"];
  const kind = stageKindLabel(stage.kind);
  const tone = stageTone(stage.kind);
  const Icon = tone.icon;
  const note = endedByNote(stage.basic.endedBy);
  const played = stage.basic.answered > 0;

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
          {/* The spine's node: the stage's persisted order, rimmed in the
              stage's own ink. */}
          <span
            aria-hidden="true"
            className="relative z-[1] inline-grid shrink-0 place-items-center rounded-full border-2 text-[10.5px] font-bold tabular-nums"
            style={{ width: NODE, height: NODE, borderColor: tone.edge, background: "#ecdcb4", color: tone.ink }}
          >
            {stage.order + 1}
          </span>
          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: tone.ink }} aria-hidden="true" />
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

        <StageEntry stage={stage} onOpen={onOpen} className={layout.toggle} />
      </div>
    </li>
  );
}

export default function DailyRunRow({
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
  /** This run's Focus view, or null when it is a collapsed list entry. */
  focus?: FocusView | null;
  /** Open this run in Focus at a view, or (null) collapse it. */
  onFocus?: (view: FocusView | null) => void;
  /** A changing value focuses and reveals this run's Focus — the legacy
   *  `#trends` arrival, which the section has already opened. */
  openAnalysisSignal?: number | null;
}) {
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const rowRef = useRef<HTMLLIElement | null>(null);
  const accuracy = percent(record.basic.accuracy);
  const focused = focus !== null;
  // The ring draws its share the first time the run is seen.
  const ring = useReveal<HTMLSpanElement>({ durationMs: 750 });

  useEffect(() => {
    if (openAnalysisSignal === null || !focused) return;
    toggleRef.current?.focus({ preventScroll: true });
    // The run may sit below an open Owned & Missed section, or arrive after
    // the hub already scrolled to History — so it brings itself into view.
    rowRef.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
  }, [openAnalysisSignal, focused]);

  // Opening Focus (or collapsing a run above this one) can move this run's
  // top out of view; bring it back so the reader lands on what they opened.
  const wasFocused = useRef(focused);
  useEffect(() => {
    if (focused && !wasFocused.current) {
      const top = rowRef.current?.getBoundingClientRect().top;
      if (top !== undefined && (top < 0 || top > window.innerHeight * 0.6)) {
        rowRef.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
      }
    }
    wasFocused.current = focused;
  }, [focused]);

  const open = (view: FocusView) => onFocus?.(view);

  return (
    <li
      ref={rowRef}
      data-testid="daily-run-row"
      data-run-stages={record.stages.length}
      data-focused={focused ? "true" : "false"}
      className={`relative scroll-mt-4 rounded-lg border [container-type:inline-size] first:mt-0 last:mb-0 ${
        focused ? "my-5" : "my-3"
      }`}
      style={{
        borderColor: focused ? DAILY_TONE.edge : "rgba(96,68,28,0.36)",
        background: focused ? "rgba(112, 82, 36, 0.1)" : LEAGUECRAFT_INK.inset,
        boxShadow: focused
          ? "inset 0 1px 0 rgba(255,249,233,0.4), 0 10px 28px -18px rgba(58,39,8,0.55), 0 0 0 1px rgba(138,106,44,0.18)"
          : "inset 0 1px 0 rgba(255,249,233,0.35), 0 1px 0 rgba(255,249,233,0.4)",
      }}
    >
      {/* The marginal rule, in the Daily's brass: a Daily has no verdict to
          colour it. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 -left-px rounded-l-lg ${focused ? "w-[4px]" : "w-[3px]"}`}
        style={{ background: "#8a6a2c" }}
      />

      {focused ? (
        <DailyFocus
          record={record}
          view={focus}
          onView={open}
          reviewFor={reviewFor}
          onRetry={onRetry}
          collapse={
            <FocusToggle
              open
              state={record.capability.state}
              buttonRef={toggleRef}
              onToggle={() => onFocus?.(null)}
              className="w-full [@container(min-width:40rem)]:w-auto"
            />
          }
        />
      ) : (
        <>
          {/* ── When it was, and how it went ─────────────────────────── */}
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

          {/* ── The stages, as persisted, on one spine ─────────────────── */}
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
                  review={reviewFor(stage.reviewMatchId)}
                  onOpen={() => open(stage.stageId)}
                />
              ))}
            </ol>
          </div>

          <div className="border-t pb-2 pl-4 pr-3 pt-1.5" style={{ borderColor: "rgba(96,68,28,0.22)" }}>
            <FocusToggle open={false} state={record.capability.state} buttonRef={toggleRef} onToggle={() => open("overview")} className="-ml-1" />
          </div>
        </>
      )}
    </li>
  );
}
