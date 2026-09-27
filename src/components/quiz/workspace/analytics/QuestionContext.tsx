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
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { instantDateLabel, stageKindLabel } from "@/components/quiz/workspace/historyFormat";
import type { RoundVM, StageViewModel } from "@/components/quiz/workspace/historyViewModel";
import type { DailyHistoryRecord, HistoryStage } from "@/lib/history/contracts";
import { OutcomeMark } from "./charts";
import { RESULT_WORD, categoryInk } from "./ink";
import { questionContext, UNIT_NAME, type QuestionContextVM } from "./derive";

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
        {ctx.prior && (
          <Line testId="question-context-prior">
            {ctx.prior.exposures === 0
              ? "First time this question appeared in your Dailies"
              : <>
                  Seen {ctx.prior.exposures} {ctx.prior.exposures === 1 ? "time" : "times"} before · {ctx.prior.correct} correct
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
  const multi = round.occurrences.length > 1;
  return (
    <section
      aria-label="In your History"
      className="mt-3 border-t pt-2.5"
      style={{ borderColor: LEAGUECRAFT_INK.rule }}
      data-testid="question-context"
    >
      <div className="mb-1.5 text-[9.5px] font-black uppercase tracking-[0.16em]" style={{ color: LEAGUECRAFT_INK.faint }}>
        In your History{multi && round.unit ? ` · ${UNIT_NAME[round.unit] ?? "Module"}, ${round.occurrences.length} questions` : ""}
      </div>
      <div className="grid gap-2">
        {round.occurrences.map((o, i) => (
          <OneQuestion
            key={o.occurrenceId}
            ctx={questionContext(record, stage, o, stageVms)}
            stage={stage}
            heading={multi ? `${i + 1}.` : undefined}
          />
        ))}
      </div>
    </section>
  );
}
