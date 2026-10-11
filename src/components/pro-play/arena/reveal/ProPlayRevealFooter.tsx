/**
 * PPQ2-D — the answer footer under a graded Pro Play question.
 *
 * What it says, in reading order:
 *  1. (screen readers) one status sentence with the server's verdict, the
 *     pick and the answer — the tablets' own names stay "A. Label";
 *  2. the metric and the evidence scope, as the server labelled them;
 *  3. the server's explanation, without its internal provenance tail;
 *  4. a "Source" disclosure (black glass) holding the technical authority:
 *     metric definition, form, revisions, definition and policy versions and
 *     the explanation exactly as sent;
 *  5. the caller's action (Next / See results), if one is passed.
 *
 * Every option's statistic is ALSO listed here, in server order. When the
 * tablets carry them (`valuesOnTablets`) the list is screen-reader only —
 * a revealed tablet is a disabled button whose accessible name is its label,
 * so this list is the only way a non-sighted player hears the numbers. When
 * the tablets could not carry them (PPQ2-C's plain fallback) the same list is
 * drawn visibly, compact, so the reveal is never lost.
 *
 * It renders only from a `ProPlayRevealModel`, which exists only after a
 * server grade; there is no "pending" or placeholder state.
 */
import { Check, Info } from "lucide-react";
import type { ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { cn } from "@/lib/utils";
import {
  REVEAL_EMPTY_VALUE,
  verdictSentence,
  type ProPlayRevealModel,
  type RevealCandidate,
} from "./proPlayRevealModel";
import {
  REVEAL_VALUE_DELAY_MS,
  REVEAL_VALUE_DURATION_MS,
  REVEAL_VALUE_STAGGER_MS,
} from "./ProPlayRevealValue";

export interface ProPlayRevealFooterProps {
  model: ProPlayRevealModel;
  /**
   * True when the option tablets are showing the values (PPQ2-C's
   * `proPlayAnswerSlots(...).optionContent !== null` and evidence exists).
   * False draws the per-option list visibly in the footer instead.
   */
  valuesOnTablets: boolean;
  /** The Next / See results control, placed at the footer's trailing edge. */
  action?: ReactNode;
  className?: string;
}

/** One option's statistic as a sentence fragment, for the list. */
function candidateLine(c: RevealCandidate): string {
  if (!c.value) return "no statistic";
  return c.value.support ? `${c.value.display}, ${c.value.support}` : c.value.display;
}

/** The per-option readout. Server order; same row for every option. */
function CandidateReadout({ model, visible }: { model: ProPlayRevealModel; visible: boolean }) {
  return (
    <ol
      aria-label="Statistics by option"
      data-pp-reveal-readout={visible ? "visible" : "sr-only"}
      className={visible ? "mt-2 grid gap-1" : "sr-only"}
    >
      {model.candidates.map((c) => (
        <li
          key={c.optionId}
          data-pp-reveal-row={c.optionId}
          data-correct={c.correct ? "true" : "false"}
          data-picked={c.picked ? "true" : "false"}
          className={visible ? cn(
            "grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-baseline gap-x-2 rounded-md border px-2 py-1.5",
            c.correct ? "border-emerald-300/40 bg-emerald-300/[0.08]" : "border-white/10 bg-white/[0.03]",
          ) : undefined}
        >
          {visible ? (
            <>
              <span aria-hidden className="text-[11px] font-bold text-[#e8c97a]/80">{c.letter}</span>
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate text-[13px] font-semibold" title={c.label}>{c.label}</span>
                {c.correct ? <Check aria-hidden className="h-3.5 w-3.5 shrink-0 self-center text-emerald-300" /> : null}
                {c.picked ? (
                  <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.14em] text-[#f0d78c]/90">Your pick</span>
                ) : null}
              </span>
              <span className="flex min-w-0 items-baseline justify-end gap-1.5 text-right">
                <span className={cn("text-sm font-black tabular-nums", !c.value && "opacity-60")}>
                  {c.value?.display ?? REVEAL_EMPTY_VALUE}
                </span>
                {c.value?.support ? (
                  <span className="hidden truncate text-[10px] uppercase tracking-[0.06em] opacity-75 sm:inline">
                    {c.value.support}
                  </span>
                ) : null}
              </span>
              {/* The words the marks stand for. */}
              <span className="sr-only">
                {`: ${candidateLine(c)}${c.correct ? ". Correct answer" : ""}${c.picked ? ". Your pick" : ""}.`}
              </span>
            </>
          ) : (
            `${c.letter}. ${c.label}: ${candidateLine(c)}${c.correct ? ". Correct answer" : ""}${c.picked ? ". Your pick" : ""}.`
          )}
        </li>
      ))}
    </ol>
  );
}

function formLabel(form: string | null): string | null {
  if (!form) return null;
  if (form === "pairwise") return "Head-to-head";
  if (form === "ranking") return "Ranking";
  return form;
}

/** Technical authority behind a keyboard/touch disclosure. Null when empty. */
function SourceDisclosure({ model }: { model: ProPlayRevealModel }) {
  const rows: { term: string; detail: ReactNode }[] = [];
  if (model.metric) {
    rows.push({
      term: "Metric",
      detail: model.metric.tooltip ? `${model.metric.label} — ${model.metric.tooltip}` : model.metric.label,
    });
  }
  if (model.scopeLabel) rows.push({ term: "Scope", detail: model.scopeLabel });
  const form = formLabel(model.form);
  if (form) rows.push({ term: "Form", detail: form });
  const a = model.authority;
  if (a?.revision !== null && a?.revision !== undefined) rows.push({ term: "Authority revision", detail: String(a.revision) });
  if (a?.revisions.length) {
    rows.push({
      term: "Revisions",
      detail: (
        <span className="flex flex-col">
          {a.revisions.map((r) => <span key={r.label}>{`${r.label}: ${r.revision}`}</span>)}
        </span>
      ),
    });
  }
  if (a?.metricDefinitionVersion) rows.push({ term: "Definition", detail: a.metricDefinitionVersion });
  if (a?.policyVersion) rows.push({ term: "Policy", detail: a.policyVersion });
  if (model.provenanceNote && model.explanationVerbatim) {
    rows.push({ term: "Server note", detail: model.explanationVerbatim });
  }
  if (!rows.length) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-pp-reveal-source
          aria-label="Evidence source and authority"
          className={cn(
            // 36px visible, 44px hit area.
            "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.04] px-2.5",
            "text-[10px] font-bold uppercase tracking-[0.14em] text-[#efe8d6]/80",
            "before:absolute before:-inset-1 before:content-['']",
            "hover:border-[#c9a84c]/50 hover:text-[#f0dcae]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8c97a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#07111f]",
          )}
        >
          <Info aria-hidden className="h-3.5 w-3.5" />
          Source
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        data-pp-reveal-source-panel
        className="w-[min(20rem,calc(100vw-2rem))] border-white/10 bg-black/85 p-3 text-[#efe8d6] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9)] backdrop-blur-md"
      >
        <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.24em] text-[#e8c97a]/90">Evidence authority</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[11px] leading-snug">
          {rows.map((r) => (
            <div key={r.term} className="contents">
              <dt className="text-white/55">{r.term}</dt>
              <dd className="min-w-0 break-words">{r.detail}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

export function ProPlayRevealFooter({ model, valuesOnTablets, action, className }: ProPlayRevealFooterProps) {
  const reduced = useReducedMotionPreference();
  const showReadout = !valuesOnTablets && model.evidenceState !== "absent";
  const count = model.candidates.length;
  // The footer settles after the last tablet value (beat 3).
  const footerDelay = REVEAL_VALUE_DELAY_MS + Math.max(0, count - 1) * REVEAL_VALUE_STAGGER_MS + 80;
  const note = model.evidenceState === "absent"
    ? "No per-option statistics were sent for this question."
    : model.evidenceState === "partial"
      ? "Statistics were not sent for every option."
      : null;
  return (
    <section
      aria-label="Answer evidence"
      data-pp-reveal-footer={model.isCorrect ? "correct" : "incorrect"}
      data-pp-evidence-state={model.evidenceState}
      data-pp-reveal-motion={reduced ? "static" : "staged"}
      className={cn(
        "relative w-full min-w-0 overflow-hidden rounded-lg border border-[#c9a84c]/30 bg-[#07111f]/95 px-3 py-2.5 text-left text-[#efe8d6] sm:px-4 lg:py-1",
        "shadow-[inset_0_1px_0_rgba(240,215,140,0.14),0_10px_24px_-18px_rgba(0,0,0,0.9)]",
        !reduced && "animate-in fade-in-0 fill-mode-both ease-out",
        className,
      )}
      style={reduced ? undefined : { animationDelay: `${footerDelay}ms`, animationDuration: `${REVEAL_VALUE_DURATION_MS}ms` }}
    >
      <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(212,179,90,0.6), transparent)" }} />
      <p role="status" data-pp-reveal-verdict className="sr-only">{verdictSentence(model)}</p>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        {/* From lg the scope and the sentence share one line: the footer
            costs the stage only what the action button already needs. */}
        <div className="min-w-0 flex-1 lg:flex lg:items-baseline lg:gap-3">
          {model.metric || model.scopeLabel ? (
            <p data-pp-reveal-scope className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 lg:max-w-[13rem] lg:shrink-0 lg:flex-nowrap xl:max-w-[40%]">
              {model.metric ? (
                <span className="inline-flex shrink-0 items-center rounded border border-sky-300/35 bg-sky-300/10 px-1.5 py-[3px] text-[9px] font-bold uppercase leading-none tracking-[0.12em] text-sky-100 sm:text-[10px]">
                  {model.metric.label}
                </span>
              ) : null}
              {model.scopeLabel ? (
                <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[#e8c97a]/90" title={model.scopeLabel}>
                  {model.scopeLabel}
                </span>
              ) : null}
            </p>
          ) : null}
          {model.explanation ? (
            <p data-pp-reveal-explanation className="mt-1 text-[13px] leading-snug text-[#efe8d6]/90 sm:text-sm lg:mt-0 lg:min-w-0 lg:flex-1">
              {model.explanation}
            </p>
          ) : null}
          {note ? (
            <p data-pp-reveal-note className="mt-1 text-[11px] italic leading-snug text-white/55 lg:mt-0 lg:shrink-0">{note}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <SourceDisclosure model={model} />
          {action}
        </div>
      </div>
      {model.evidenceState !== "absent" ? <CandidateReadout model={model} visible={showReadout} /> : null}
    </section>
  );
}

export default ProPlayRevealFooter;
