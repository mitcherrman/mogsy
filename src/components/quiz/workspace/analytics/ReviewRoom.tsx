/**
 * HUB6.3E — the Review and Weak Areas rooms.
 *
 * REVIEW is remediation: each served replay re-asks one EXACT earlier miss
 * (HUB2.4 / HUB6.3B `review_sources`). Drawn as
 *
 *   ORIGINAL MISS  ──▶  REVIEW REPLAY  ──▶  REVIEW RESULT
 *
 * with the source stage, its question position and result, and "Light both",
 * which lights the replay on the Review rail AND the miss on its own rail. A
 * replay whose link the server did not store says "source not recorded" —
 * nothing is matched by content or order. Never "recovered", "mastered" or a
 * recovery rate.
 *
 * WEAK AREAS is simpler on purpose. The backend keeps which public
 * categories were chosen (slots), the evidence cutoff and the policy — not
 * which earlier question led to a slot, how often it was missed, or when. So
 * this room shows the current questions and results, the slots, and the
 * cutoff, and says plainly what is not recorded.
 */
import { useMemo } from "react";
import { ArrowRight, Crosshair, Link2, RotateCcw } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import { dateBoundaryLabel, stageKindLabel } from "@/components/quiz/workspace/historyFormat";
import { IconFace } from "@/components/quiz/workspace/questionTimelineParts";
import ModuleSigil, { hasModuleSigil } from "@/components/quiz/workspace/ModuleSigil";
import { resolveQuestionIcon } from "@/components/quiz/workspace/questionIcons";
import { stageTone } from "@/components/quiz/workspace/stageTheme";
import { buildStageViewModel, stageCurrentFacts, type QuestionResult } from "@/components/quiz/workspace/historyViewModel";
import { runHighlight, useHighlightControls } from "@/components/quiz/workspace/historyHighlight";
import { staggered, useReveal } from "@/lib/motion/useReveal";
import type { DailyHistoryRecord, HistoryStage } from "@/lib/history/contracts";
import type { MatchReviewView, ReviewRound } from "@/lib/ranked-public/contracts";
import { OutcomeMark, Panel } from "./charts";
import { RESULT_WORD, categoryInk, categoryName } from "./ink";
import { artRound, reviewLinks, type ReviewLink } from "./derive";

const word = (o: QuestionResult | null) => (o ? RESULT_WORD[o].toLowerCase() : "no result");

// ─────────────────────────────────────────────────────────── Review

export function ReviewRoom({
  record,
  stage,
  review = null,
  reviewFor,
}: {
  record: DailyHistoryRecord;
  stage: HistoryStage;
  /** The Review stage's own frozen review: each replay's art. */
  review?: MatchReviewView | null;
  /** Any stage's frozen review: the original miss's art. */
  reviewFor?: (matchId: string | null) => MatchReviewView | null;
}) {
  const links = useMemo(() => reviewLinks(record, stage), [record, stage]);
  const f = stageCurrentFacts(stage);
  // HUB6.3G owner decision: no Review donut. The three-step link below is the
  // whole story (original miss -> replay -> result); a result x source-stage
  // donut of two or three replays added nothing to it.
  return (
    <div className="grid min-w-0 gap-3" data-testid="review-room">
      <ReviewLinks
        record={record}
        stage={stage}
        links={links}
        review={review}
        reviewFor={reviewFor}
        summary={`${f.correct} of ${f.questionsPlayed} replays correct`}
      />
    </div>
  );
}

/** A question's face in a Review step, in the HUB6.2 art priority: its
 *  proven art, else its module's sigil (a Journey child, a Meta Reflex
 *  card), else the stage's mark. */
function StepArt({ round, fallback: Fallback, ink }: { round: ReviewRound | null; fallback: React.ElementType; ink: string }) {
  const proven = round ? resolveQuestionIcon(round.iconHint) : null;
  return (
    <span
      className="grid h-[32px] w-[32px] shrink-0 place-items-center overflow-hidden rounded-md border p-[2px]"
      style={{ borderColor: "rgba(96,68,28,0.3)", background: LEAGUECRAFT_INK.inset }}
      aria-hidden="true"
      data-testid="review-step-art"
      data-art={round && proven?.src ? "proven" : "sigil"}
    >
      {round && proven?.src
        ? <IconFace round={round} />
        : hasModuleSigil(round)
          ? <ModuleSigil kind={round!.kind} className="h-4 w-4" ink={ink} />
          : <Fallback className="h-4 w-4" style={{ color: ink }} />}
    </span>
  );
}

function ReviewLinks({ record, stage, links, review, reviewFor, summary }: {
  record: DailyHistoryRecord;
  stage: HistoryStage;
  links: ReviewLink[];
  review: MatchReviewView | null;
  reviewFor?: (matchId: string | null) => MatchReviewView | null;
  summary: string;
}) {
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1300, delayMs: 100 });
  const coarse = useCoarsePointer();
  const { preview, toggleLock, locked } = useHighlightControls();
  const reviewTone = stageTone("review");
  const hl = (l: ReviewLink) => runHighlight(
    [l.replayId, ...(l.source ? [l.source.questionResultId] : [])],
    {
      key: `${stage.stageId}:link:${l.replayId}`,
      stageIds: [stage.stageId, ...(l.source ? [l.source.stageId] : [])],
      label: `Replay ${l.replayPosition}${l.source ? ` and its ${stageKindLabel(l.source.stageKind)} question` : ""}`,
    },
  );
  const card = (children: React.ReactNode, tone: { edge: string; tint: string }, testId: string) => (
    <div className="min-w-0 rounded-md border px-2 py-1.5" style={{ borderColor: tone.edge, background: tone.tint }} data-testid={testId}>
      {children}
    </div>
  );
  return (
    <Panel title="Misses, replayed" eyebrow={summary} testId="review-links">
      <div ref={reveal.ref}>
        <ol className="grid gap-2.5">
          {links.map((l, i) => {
            const p = reveal.progress >= 1 ? 1 : staggered(reveal.progress, i, links.length, 0.55);
            const k = `${stage.stageId}:link:${l.replayId}`;
            const on = locked?.key === k;
            const srcTone = l.source ? stageTone(l.source.stageKind) : { edge: "rgba(96,68,28,0.3)", tint: "transparent" };
            const SrcIcon = l.source ? stageTone(l.source.stageKind).icon : RotateCcw;
            // The EXACT questions' art: the miss from its own stage's frozen
            // review, the replay from the Review stage's - by round number.
            const sourceStage = l.source ? record.stages.find((x) => x.stageId === l.source!.stageId) ?? null : null;
            const sourceArt = l.source?.round && sourceStage ? artRound(reviewFor?.(sourceStage.reviewMatchId) ?? null, l.source.round.roundNumber) : null;
            const replayArt = l.replayRound ? artRound(review, l.replayRound.roundNumber) : null;
            return (
              <li
                key={l.replayId}
                className="grid min-w-0 items-center gap-x-1.5 gap-y-1.5 rounded-lg border p-2 [@container(min-width:30rem)]:grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)_1.5rem_auto]"
                style={{ borderColor: on ? LEAGUECRAFT_INK.strong : "rgba(96,68,28,0.2)", background: on ? "rgba(96,68,28,0.08)" : "rgba(255,249,233,0.25)" }}
                data-testid="review-link"
                data-linked={l.source ? "true" : "false"}
                data-source-stage={l.source?.stageKind}
                data-source-position={l.source?.position ?? undefined}
                data-replay-outcome={l.replayOutcome ?? "unknown"}
              >
                {card(l.source ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <StepArt round={sourceArt} fallback={SrcIcon} ink={stageTone(l.source.stageKind).ink} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-[9.5px] font-black uppercase tracking-[0.12em]" style={{ color: stageTone(l.source.stageKind).ink }}>
                        <SrcIcon className="h-3 w-3" aria-hidden="true" />
                        Original · {stageKindLabel(l.source.stageKind)}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[12px] font-bold" style={{ color: LEAGUECRAFT_INK.strong }}>
                        {l.source.outcome && <OutcomeMark result={l.source.outcome} size={13} />}
                        Question {l.source.position ?? "?"}{l.source.total ? <span className="font-normal" style={{ color: LEAGUECRAFT_INK.faint }}> of {l.source.total}</span> : null}
                      </div>
                      <div className="text-[10.5px]" style={{ color: LEAGUECRAFT_INK.faint }}>{word(l.source.outcome)}</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] italic" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="review-source-missing">
                    Source not recorded for this replay.
                  </div>
                ), srcTone, "review-link-source")}
                <Connector shown={p} />
                {card(
                  <div className="flex min-w-0 items-center gap-2">
                    <StepArt round={replayArt} fallback={RotateCcw} ink={reviewTone.ink} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-[9.5px] font-black uppercase tracking-[0.12em]" style={{ color: reviewTone.ink }}>
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        Review replay {l.replayPosition}
                      </div>
                      <div className="mt-0.5 text-[12px] font-bold" style={{ color: LEAGUECRAFT_INK.strong }}>
                        {l.replayRound?.occurrences[0]?.publicCategory
                          ? categoryName(l.replayRound.occurrences[0].publicCategory.key, l.replayRound.occurrences[0].publicCategory.label)
                          : "The same question"}
                      </div>
                    </div>
                  </div>,
                  reviewTone, "review-link-replay",
                )}
                <Connector shown={p > 0.5 ? p : 0} />
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold"
                    style={{ borderColor: "rgba(96,68,28,0.35)", color: LEAGUECRAFT_INK.strong, opacity: p > 0.7 ? 1 : 0, transition: "opacity 200ms" }}
                    data-testid="review-link-result"
                  >
                    {l.replayOutcome && <OutcomeMark result={l.replayOutcome} size={12} />}
                    {l.replayOutcome ? RESULT_WORD[l.replayOutcome] : "—"}
                  </span>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`Light replay ${l.replayPosition}${l.source ? ` and the ${stageKindLabel(l.source.stageKind)} question it replays` : ""}`}
                    data-testid="review-link-light"
                    onPointerEnter={(e) => e.pointerType !== "touch" && preview(hl(l))}
                    onPointerLeave={(e) => e.pointerType !== "touch" && preview(null)}
                    onFocus={() => preview(hl(l))}
                    onBlur={() => preview(null)}
                    onClick={() => toggleLock(hl(l))}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 text-[10.5px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${coarse ? "min-h-[44px]" : "min-h-[26px]"}`}
                    style={{ borderColor: on ? LEAGUECRAFT_INK.strong : "rgba(96,68,28,0.35)", color: LEAGUECRAFT_INK.brass }}
                  >
                    <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {l.source ? "Light both" : "Light"}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-[10.5px] leading-snug" style={{ color: LEAGUECRAFT_INK.faint }}>
          Review replays one question you missed earlier in this Daily. Only the replays the Daily served are shown.
        </p>
      </div>
    </Panel>
  );
}

/** A connector arrow that draws left to right (down, when stacked). */
function Connector({ shown }: { shown: number }) {
  return (
    <span aria-hidden="true" className="flex items-center justify-center" style={{ opacity: shown > 0 ? 1 : 0 }}>
      <span className="relative hidden h-[2px] w-full [@container(min-width:30rem)]:block" style={{ background: "rgba(96,68,28,0.25)" }}>
        <span className="absolute inset-y-0 left-0 block origin-left" style={{ width: "100%", background: LEAGUECRAFT_INK.brass, transform: `scaleX(${Math.min(1, shown)})` }} />
      </span>
      <ArrowRight className="h-3.5 w-3.5 rotate-90 [@container(min-width:30rem)]:hidden" style={{ color: LEAGUECRAFT_INK.brass }} />
    </span>
  );
}

// ─────────────────────────────────────────────────────────── Weak Areas

/**
 * HUB6.3G: one panel, no donut. A Weak Areas serves three or four questions;
 * a result x category donut of four slices only repeated the slot rows, which
 * already carry each question's art, its selected public category and its
 * result. The rows are the served questions — never the historical miss that
 * led to a slot, which the record does not keep.
 */
export function WeakAreasRoom({ stage, review = null }: { stage: HistoryStage; review?: MatchReviewView | null }) {
  const vm = useMemo(() => buildStageViewModel(stage), [stage]);
  const selection = stage.analytics?.personalFacts.selection ?? null;
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1000, delayMs: 100 });
  const coarse = useCoarsePointer();
  const { preview, toggleLock, locked } = useHighlightControls();
  const f = stageCurrentFacts(stage);
  const byId = vm.byOccurrence;
  const slots = selection?.slots ?? [];
  // A date boundary (midnight UTC): its own calendar day, never the day before.
  const cutoff = selection?.evidenceCutoff ? dateBoundaryLabel(selection.evidenceCutoff) : null;
  // One row per slot; without recorded slots, one per served question.
  const rows = slots.length > 0
    ? slots.map((slot) => {
        const ids = slot.questionResultIds;
        return {
          key: `slot:${slot.slotIndex}`, index: slot.slotIndex, ids, selected: slot.slotPublicCategory, isSlot: true,
          occ: ids.map((id) => byId.get(id)).filter((o): o is NonNullable<typeof o> => !!o),
          round: vm.rounds.find((r) => r.occurrences.some((o) => ids.includes(o.occurrenceId))) ?? null,
        };
      })
    : vm.rounds.map((r) => ({
        key: `q:${r.roundNumber}`, index: r.position, ids: r.occurrences.map((o) => o.occurrenceId), selected: null, isSlot: false,
        occ: r.occurrences, round: r,
      }));
  const tally = (["correct", "incorrect", "timeout"] as const).map((o) => [o, o === "correct" ? f.correct : o === "incorrect" ? f.incorrect : f.timeout] as const).filter(([, n]) => n > 0);
  return (
    <div className="grid min-w-0 gap-3" data-testid="weak-areas-room">
      <Panel
        title="What was selected"
        eyebrow={slots.length > 0 ? `Weak Areas · ${slots.length} slots` : "Weak Areas"}
        testId="weak-areas-slots"
        action={
          <span className="flex flex-wrap items-center gap-2 text-[11px] font-bold tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }} data-testid="weak-areas-tally">
            {tally.map(([o, n]) => (
              <span key={o} className="inline-flex items-center gap-1"><OutcomeMark result={o} size={13} />{n} {word(o)}</span>
            ))}
          </span>
        }
      >
        <div ref={reveal.ref}>
          {rows.length > 0 ? (
            <ol className="grid gap-1.5 [@container(min-width:40rem)]:grid-cols-2">
              {rows.map((row, i) => {
                const k = `${stage.stageId}:${row.key}`;
                const on = locked?.key === k;
                const cat = row.selected;
                const served = row.occ[0]?.publicCategory ?? null;
                const art = row.round ? artRound(review, row.round.roundNumber) : null;
                const proven = art ? resolveQuestionIcon(art.iconHint) : null;
                const h = runHighlight(row.ids, { key: k, stageIds: [stage.stageId], label: row.isSlot ? `Slot ${row.index}` : `Question ${row.index}` });
                const p = reveal.progress >= 1 ? 1 : staggered(reveal.progress, i, rows.length, 0.5);
                return (
                  <li key={row.key} style={{ opacity: p > 0.05 ? 1 : 0, transition: "opacity 200ms" }}>
                    <button
                      type="button"
                      aria-pressed={on}
                      data-testid={row.isSlot ? "weak-areas-slot" : "weak-areas-question"}
                      data-slot={row.isSlot ? row.index : undefined}
                      onPointerEnter={(e) => e.pointerType !== "touch" && preview(h)}
                      onPointerLeave={(e) => e.pointerType !== "touch" && preview(null)}
                      onFocus={() => preview(h)}
                      onBlur={() => preview(null)}
                      onClick={() => toggleLock(h)}
                      className={`grid w-full min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-[6px] rounded-md border px-[6px] py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${coarse ? "min-h-[48px]" : "min-h-[40px]"}`}
                      style={{ borderColor: on ? LEAGUECRAFT_INK.strong : "rgba(90,58,142,0.3)", background: on ? "rgba(90,58,142,0.12)" : "rgba(255,249,233,0.3)" }}
                    >
                      <span className="grid h-[22px] w-[22px] place-items-center rounded-full border text-[10.5px] font-black tabular-nums" style={{ borderColor: "rgba(90,58,142,0.5)", color: "rgb(90,58,142)" }}>
                        {row.index}
                      </span>
                      {/* The SERVED question's own art (its frozen review). */}
                      <span
                        aria-hidden="true"
                        className="grid h-[32px] w-[32px] place-items-center overflow-hidden rounded-md border p-[2px]"
                        style={{ borderColor: "rgba(96,68,28,0.3)", background: LEAGUECRAFT_INK.inset }}
                        data-testid="weak-areas-art"
                        data-art={art && proven?.src ? "proven" : "sigil"}
                      >
                        {art && proven?.src
                          ? <IconFace round={art} />
                          : hasModuleSigil(art)
                            ? <ModuleSigil kind={art!.kind} className="h-4 w-4" ink="rgb(90,58,142)" />
                            : <Crosshair className="h-4 w-4" style={{ color: "rgb(90,58,142)" }} />}
                      </span>
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-bold" style={{ color: LEAGUECRAFT_INK.strong }}>
                          {(cat ?? served) && <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: categoryInk((cat ?? served)!.key) }} />}
                          <span className="truncate">
                            {cat ? categoryName(cat.key, cat.label) : served ? categoryName(served.key, served.label) : row.isSlot ? "Category not recorded" : "Question"}
                          </span>
                        </span>
                        <span className="block text-[10.5px]" style={{ color: LEAGUECRAFT_INK.faint }}>
                          Question {row.round?.position ?? "?"} on the row
                          {cat && served && served.key !== cat.key ? ` · asked as ${categoryName(served.key, served.label)}` : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: LEAGUECRAFT_INK.strong }}>
                        {row.occ.map((o) => o.outcome && <OutcomeMark key={o.occurrenceId} result={o.outcome} size={13} />)}
                        <span className="sr-only">{row.occ.map((o) => word(o.outcome)).join(", ")}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-[11px]" style={{ color: LEAGUECRAFT_INK.faint }}>The questions for this Weak Areas were not recorded.</p>
          )}
          {slots.length === 0 && rows.length > 0 && (
            <p className="mt-2 text-[10.5px]" style={{ color: LEAGUECRAFT_INK.faint }}>The slots for this Weak Areas were not recorded; these are the questions it served.</p>
          )}
          <div className="mt-2.5 flex items-start gap-2 rounded-md border border-dashed px-2.5 py-2 text-[10.5px] leading-snug" style={{ borderColor: "rgba(96,68,28,0.3)", color: LEAGUECRAFT_INK.faint }} data-testid="weak-areas-provenance">
            <Crosshair className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "rgb(90,58,142)" }} aria-hidden="true" />
            <span>
              {cutoff ? <>Chosen from your results before <strong style={{ color: LEAGUECRAFT_INK.body }} data-testid="weak-areas-cutoff">{cutoff}</strong>. </> : null}
              The record keeps which categories were chosen — not which earlier question led to each one. Each row is the question this Weak Areas served.
            </span>
          </div>
        </div>
      </Panel>
    </div>
  );
}
