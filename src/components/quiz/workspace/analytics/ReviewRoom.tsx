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
import { useCallback, useMemo } from "react";
import { ArrowRight, Crosshair, Link2, RotateCcw } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import { instantDateLabel, stageKindLabel } from "@/components/quiz/workspace/historyFormat";
import { stageTone } from "@/components/quiz/workspace/stageTheme";
import { buildStageViewModel, stageCurrentFacts, type QuestionResult } from "@/components/quiz/workspace/historyViewModel";
import { runHighlight, useHistoryHighlight } from "@/components/quiz/workspace/historyHighlight";
import { staggered, useReveal } from "@/lib/motion/useReveal";
import type { DailyHistoryRecord, HistoryStage } from "@/lib/history/contracts";
import { NestedDonut, OutcomeMark, Panel } from "./charts";
import { RESULT_WORD, categoryInk, categoryName } from "./ink";
import { reviewDonut, reviewLinks, type ReviewLink } from "./derive";
import { useDonutHighlight } from "./interact";
import { CategoryDonut } from "./stageShared";

const word = (o: QuestionResult | null) => (o ? RESULT_WORD[o].toLowerCase() : "no result");

// ─────────────────────────────────────────────────────────── Review

export function ReviewRoom({ record, stage }: { record: DailyHistoryRecord; stage: HistoryStage }) {
  const links = useMemo(() => reviewLinks(record, stage), [record, stage]);
  const f = stageCurrentFacts(stage);
  const linked = links.filter((l) => l.source).length;
  const donut = useMemo(() => reviewDonut(record, links), [record, links]);
  return (
    <div className="grid min-w-0 gap-3 [@container(min-width:52rem)]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" data-testid="review-room">
      <ReviewLinks record={record} stage={stage} links={links} summary={`${f.correct} of ${f.questionsPlayed} replays correct`} />
      {/* Cautiously approved: only when it adds something — at least two
          linked replays. */}
      {linked >= 2 && donut.total >= 2 && <ReviewDonut record={record} stage={stage} links={links} />}
    </div>
  );
}

function ReviewLinks({ record, stage, links, summary }: { record: DailyHistoryRecord; stage: HistoryStage; links: ReviewLink[]; summary: string }) {
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1300, delayMs: 100 });
  const coarse = useCoarsePointer();
  const { preview, toggleLock, locked } = useHistoryHighlight();
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
                  <>
                    <div className="flex items-center gap-1 text-[9.5px] font-black uppercase tracking-[0.12em]" style={{ color: l.source ? stageTone(l.source.stageKind).ink : LEAGUECRAFT_INK.faint }}>
                      <SrcIcon className="h-3 w-3" aria-hidden="true" />
                      Original · {stageKindLabel(l.source.stageKind)}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[12px] font-bold" style={{ color: LEAGUECRAFT_INK.strong }}>
                      {l.source.outcome && <OutcomeMark result={l.source.outcome} size={13} />}
                      Question {l.source.position ?? "?"}{l.source.total ? <span className="font-normal" style={{ color: LEAGUECRAFT_INK.faint }}> of {l.source.total}</span> : null}
                    </div>
                    <div className="text-[10.5px]" style={{ color: LEAGUECRAFT_INK.faint }}>{word(l.source.outcome)}</div>
                  </>
                ) : (
                  <div className="text-[11px] italic" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="review-source-missing">
                    Source not recorded for this replay.
                  </div>
                ), srcTone, "review-link-source")}
                <Connector shown={p} />
                {card(
                  <>
                    <div className="flex items-center gap-1 text-[9.5px] font-black uppercase tracking-[0.12em]" style={{ color: reviewTone.ink }}>
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      Review replay {l.replayPosition}
                    </div>
                    <div className="mt-0.5 text-[12px] font-bold" style={{ color: LEAGUECRAFT_INK.strong }}>
                      {l.replayRound?.occurrences[0]?.publicCategory
                        ? categoryName(l.replayRound.occurrences[0].publicCategory.key, l.replayRound.occurrences[0].publicCategory.label)
                        : "The same question"}
                    </div>
                  </>,
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

function ReviewDonut({ record, stage, links }: { record: DailyHistoryRecord; stage: HistoryStage; links: ReviewLink[] }) {
  const data = useMemo(() => reviewDonut(record, links), [record, links]);
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1200, delayMs: 150 });
  const sourceOf = useMemo(() => new Map(links.filter((l) => l.source).map((l) => [l.replayId, l.source!])), [links]);
  // A slice lights its replays AND the misses they replay, on both rails.
  const expand = useCallback((ids: string[]) => {
    const src = ids.map((id) => sourceOf.get(id)).filter((s): s is NonNullable<typeof s> => !!s);
    return { ids: src.map((s) => s.questionResultId), stageIds: [stage.stageId, ...src.map((s) => s.stageId)] };
  }, [sourceOf, stage.stageId]);
  const wiring = useDonutHighlight(data, `${stage.stageId}-review-donut`, null, expand);
  return (
    <Panel title="Replays by source stage" eyebrow="Replay result × where the miss was" testId="review-donut">
      <div ref={reveal.ref}>
        <NestedDonut data={data} progress={reveal.progress} groupNoun="source stage"
          title="Review replays by result and source stage" testId="review-donut-chart" {...wiring} />
      </div>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────── Weak Areas

export function WeakAreasRoom({ stage }: { stage: HistoryStage }) {
  const vm = useMemo(() => buildStageViewModel(stage), [stage]);
  const selection = stage.analytics?.personalFacts.selection ?? null;
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1000, delayMs: 100 });
  const coarse = useCoarsePointer();
  const { preview, toggleLock, locked } = useHistoryHighlight();
  const byId = vm.byOccurrence;
  const slots = selection?.slots ?? [];
  const cutoff = selection?.evidenceCutoff ? instantDateLabel(selection.evidenceCutoff) : null;
  return (
    <div className="grid min-w-0 gap-3 [@container(min-width:52rem)]:grid-cols-2" data-testid="weak-areas-room">
      <CategoryDonut stage={stage} title="This Weak Areas, by result and category" />
      <Panel title="What was selected" eyebrow="Weak Areas slots" testId="weak-areas-slots">
        <div ref={reveal.ref}>
          {slots.length > 0 ? (
            <ol className="grid gap-1.5">
              {slots.map((slot, i) => {
                const ids = slot.questionResultIds;
                const occ = ids.map((id) => byId.get(id)).filter((o): o is NonNullable<typeof o> => !!o);
                const round = vm.rounds.find((r) => r.occurrences.some((o) => ids.includes(o.occurrenceId)));
                const k = `${stage.stageId}:slot:${slot.slotIndex}`;
                const on = locked?.key === k;
                const cat = slot.slotPublicCategory;
                const h = runHighlight(ids, { key: k, stageIds: [stage.stageId], label: `Slot ${slot.slotIndex}` });
                const p = reveal.progress >= 1 ? 1 : staggered(reveal.progress, i, slots.length, 0.5);
                return (
                  <li key={slot.slotIndex} style={{ opacity: p > 0.05 ? 1 : 0, transition: "opacity 200ms" }}>
                    <button
                      type="button"
                      aria-pressed={on}
                      data-testid="weak-areas-slot"
                      data-slot={slot.slotIndex}
                      onPointerEnter={(e) => e.pointerType !== "touch" && preview(h)}
                      onPointerLeave={(e) => e.pointerType !== "touch" && preview(null)}
                      onFocus={() => preview(h)}
                      onBlur={() => preview(null)}
                      onClick={() => toggleLock(h)}
                      className={`grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${coarse ? "min-h-[44px]" : "min-h-[34px]"}`}
                      style={{ borderColor: on ? LEAGUECRAFT_INK.strong : "rgba(90,58,142,0.3)", background: on ? "rgba(90,58,142,0.12)" : "rgba(255,249,233,0.3)" }}
                    >
                      <span className="grid h-6 w-6 place-items-center rounded-full border text-[10.5px] font-black tabular-nums" style={{ borderColor: "rgba(90,58,142,0.5)", color: "rgb(90,58,142)" }}>
                        {slot.slotIndex}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 truncate text-[12px] font-bold" style={{ color: LEAGUECRAFT_INK.strong }}>
                          {cat && <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: categoryInk(cat.key) }} />}
                          {cat ? categoryName(cat.key, cat.label) : "Category not recorded"}
                        </span>
                        <span className="block text-[10.5px]" style={{ color: LEAGUECRAFT_INK.faint }}>
                          Question {round?.position ?? "?"} on the row
                          {occ[0]?.publicCategory && occ[0].publicCategory.key !== cat?.key
                            ? ` · asked as ${categoryName(occ[0].publicCategory.key, occ[0].publicCategory.label)}` : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: LEAGUECRAFT_INK.strong }}>
                        {occ.map((o) => o.outcome && <OutcomeMark key={o.occurrenceId} result={o.outcome} size={13} />)}
                        <span className="sr-only">{occ.map((o) => word(o.outcome)).join(", ")}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-[11px]" style={{ color: LEAGUECRAFT_INK.faint }}>The slots for this Weak Areas were not recorded.</p>
          )}
          <div className="mt-2.5 flex items-start gap-2 rounded-md border border-dashed px-2.5 py-2 text-[10.5px] leading-snug" style={{ borderColor: "rgba(96,68,28,0.3)", color: LEAGUECRAFT_INK.faint }} data-testid="weak-areas-provenance">
            <Crosshair className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "rgb(90,58,142)" }} aria-hidden="true" />
            <span>
              {cutoff ? <>Chosen from your results before <strong style={{ color: LEAGUECRAFT_INK.body }}>{cutoff}</strong>. </> : null}
              The record keeps which categories were chosen — not which earlier question led to each one.
            </span>
          </div>
        </div>
      </Panel>
    </div>
  );
}
