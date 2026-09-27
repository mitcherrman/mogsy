/**
 * HUB6.3E — a question's factual History context, under its review card in
 * the Popover (fine pointer) and the Sheet (touch), so it never depends on
 * hover. The review card above it is unchanged.
 *
 *   Free      its public category and result; the category's C / played in
 *             this stage; the Survival strike it produced
 *   Premium   this exact question's earlier attempts (count, correct, the
 *             last one's date and result); the category's totals in earlier
 *             matching stages; the Review link (the miss a replay re-asked,
 *             or the replay of a miss)
 *
 * Facts only — no weakness, strength, mastery or recovery wording.
 */
import { useRef } from "react";
import { ChevronDown } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import { instantDateLabel, stageKindLabel } from "@/components/quiz/workspace/historyFormat";
import type { RoundVM, StageViewModel } from "@/components/quiz/workspace/historyViewModel";
import type { DailyHistoryRecord, HistoryStage } from "@/lib/history/contracts";
import { OutcomeMark } from "./charts";
import { RESULT_WORD, categoryInk } from "./ink";
import { questionContext, unitName, type QuestionContextVM } from "./derive";

const OUTCOME_WORD: Record<string, string> = { correct: "correct", incorrect: "incorrect", timeout: "timed out" };

function Line({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <li className="text-[11px] leading-snug" style={{ color: LEAGUECRAFT_INK.body }} data-testid={testId}>
      {children}
    </li>
  );
}

function OneQuestion({ ctx, stage, heading }: { ctx: QuestionContextVM; stage: HistoryStage; heading?: string }) {
  const kind = stageKindLabel(stage.kind);
  return (
    <div className="min-w-0" data-testid="question-context-item">
      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-bold" style={{ color: LEAGUECRAFT_INK.strong }}>
        {ctx.outcome && <OutcomeMark result={ctx.outcome} size={13} />}
        {heading && <span style={{ color: LEAGUECRAFT_INK.faint }}>{heading}</span>}
        {ctx.category && (
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="h-2 w-2 rounded-[2px]" style={{ background: categoryInk(ctx.category.key) }} />
            {ctx.category.label}
          </span>
        )}
        {ctx.outcome && <span style={{ color: LEAGUECRAFT_INK.faint }}>· {RESULT_WORD[ctx.outcome]}</span>}
      </div>
      <ul className="mt-0.5 space-y-0.5 pl-[19px]">
        {ctx.strikeIndex !== null && (
          <Line testId="question-context-strike">
            <strong style={{ color: "#7a2820" }}>Strike {ctx.strikeIndex}</strong>
            {ctx.maxStrikes !== null ? ` of ${ctx.maxStrikes}` : ""}
          </Line>
        )}
        {ctx.category && ctx.stageCategory && (
          <Line testId="question-context-stage-category">
            {ctx.category.label} in this {kind}: {ctx.stageCategory.correct} / {ctx.stageCategory.played} correct
          </Line>
        )}
        {ctx.prior && ctx.prior.exposures !== null && (
          <Line testId="question-context-prior">
            {ctx.prior.exposures === 0
              ? "First time this question appeared in your Dailies"
              : <>
                  Seen {ctx.prior.exposures} {ctx.prior.exposures === 1 ? "time" : "times"} before
                  {ctx.prior.correct !== null ? ` · ${ctx.prior.correct} correct` : ""}
                  {ctx.prior.last && ctx.prior.last.completedAt
                    ? ` · last ${instantDateLabel(ctx.prior.last.completedAt)}: ${OUTCOME_WORD[ctx.prior.last.outcome] ?? ctx.prior.last.outcome}`
                    : ""}
                </>}
          </Line>
        )}
        {ctx.category && ctx.categoryHistory && ctx.categoryHistory.played > 0 && (
          <Line testId="question-context-category-history">
            Earlier {kind} stages, {ctx.category.label}: {ctx.categoryHistory.correct} / {ctx.categoryHistory.played} correct
            {ctx.categoryHistory.accuracy !== null ? ` · ${Math.round(ctx.categoryHistory.accuracy * 100)}%` : ""}
          </Line>
        )}
        {ctx.replays && (
          <Line testId="question-context-replays">
            Replays your {stageKindLabel(ctx.replays.stageKind)} question{ctx.replays.position !== null ? ` ${ctx.replays.position}` : ""}
            {ctx.replays.outcome ? ` (${OUTCOME_WORD[ctx.replays.outcome]})` : ""}
          </Line>
        )}
        {ctx.replayedAs && (
          <Line testId="question-context-replayed">Replayed in Review: {OUTCOME_WORD[ctx.replayedAs]}</Line>
        )}
      </ul>
    </div>
  );
}

/**
 * HUB6.3G — the one line the Popover keeps in sight: the most specific fact
 * this question has (its earlier attempts, then its category's history, then
 * this stage's count, then its strike). Only what the context lists below.
 */
export function contextSummary(ctx: QuestionContextVM, kind: string): string | null {
  if (ctx.prior && ctx.prior.exposures !== null) {
    if (ctx.prior.exposures === 0) return "First time in your Dailies";
    return `Seen ${ctx.prior.exposures} ${ctx.prior.exposures === 1 ? "time" : "times"} before${ctx.prior.correct !== null ? ` · ${ctx.prior.correct} correct` : ""}`;
  }
  if (ctx.category && ctx.categoryHistory && ctx.categoryHistory.played > 0) {
    return `Earlier ${kind} stages: ${ctx.categoryHistory.correct} / ${ctx.categoryHistory.played} ${ctx.category.label}`;
  }
  if (ctx.category && ctx.stageCategory) return `${ctx.category.label} in this ${kind}: ${ctx.stageCategory.correct} / ${ctx.stageCategory.played}`;
  if (ctx.strikeIndex !== null) return `Strike ${ctx.strikeIndex}`;
  return null;
}

export default function QuestionContext({
  record,
  stage,
  round,
  stageVms,
}: {
  record: DailyHistoryRecord;
  stage: HistoryStage;
  round: RoundVM;
  stageVms?: Map<string, StageViewModel>;
}) {
  const coarse = useCoarsePointer();
  const listRef = useRef<HTMLDivElement>(null);
  const multi = round.occurrences.length > 1;
  const ctxs = round.occurrences.map((o) => questionContext(record, stage, o, stageVms));
  const kind = stageKindLabel(stage.kind);
  const heading = `In your History${multi && round.unit ? ` · ${unitName(round.unit)}, ${round.occurrences.length} questions` : ""}`;
  const summary = multi ? null : contextSummary(ctxs[0], kind);
  const list = (
    <div ref={listRef} className="grid gap-2">
      {round.occurrences.map((o, i) => (
        <OneQuestion
          key={o.occurrenceId}
          ctx={ctxs[i]}
          stage={stage}
          heading={multi ? `${i + 1}.` : undefined}
        />
      ))}
    </div>
  );
  if (coarse) {
    // Touch: the Sheet shows the whole context in place (unchanged).
    return (
      <section aria-label="In your History" className="mt-3 border-t pt-2.5" style={{ borderColor: LEAGUECRAFT_INK.rule }} data-testid="question-context">
        <div className="mb-1.5 text-[9.5px] font-black uppercase tracking-[0.16em]" style={{ color: LEAGUECRAFT_INK.faint }}>
          {heading}
        </div>
        {list}
      </section>
    );
  }
  /* Fine pointer: the Popover is capped at 24rem, so a long question pushes
     the context below its fold. Its heading is a DIRECT child of the
     Popover's scroll box (a sticky element cannot leave its parent), sticky
     to the box's BOTTOM edge: in sight — with the question's key fact —
     while the section is below, and back in place above it once the reader
     scrolls there. Selecting it scrolls the section in. */
  return (
    <>
      <button
        type="button"
        onClick={() => listRef.current?.scrollIntoView?.({ block: "nearest" })}
        className="sticky bottom-[-0.875rem] z-[1] -mx-3.5 mt-3 flex w-[calc(100%+1.75rem)] min-w-0 items-center gap-2 border-t px-3.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        style={{ borderColor: LEAGUECRAFT_INK.rule, background: "rgb(241,229,200)", boxShadow: "0 -6px 10px -8px rgba(58,39,8,0.45)" }}
        aria-label={`${heading}${summary ? `: ${summary}` : ""}. Show the details.`}
        data-testid="question-context-summary"
      >
        <span className="shrink-0 text-[9.5px] font-black uppercase tracking-[0.16em]" style={{ color: LEAGUECRAFT_INK.faint }}>
          {heading}
        </span>
        {summary && (
          <span className="min-w-0 truncate text-[11px] font-semibold" style={{ color: LEAGUECRAFT_INK.body }} aria-hidden="true">
            · {summary}
          </span>
        )}
        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0" style={{ color: LEAGUECRAFT_INK.brass }} aria-hidden="true" />
      </button>
      <section aria-label="In your History" className="pt-1.5" data-testid="question-context">
        {list}
      </section>
    </>
  );
}
