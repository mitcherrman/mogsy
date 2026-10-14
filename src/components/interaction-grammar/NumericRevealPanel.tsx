/**
 * NUM-LAB — the reveal both numeric prototypes share. Presentation only: every
 * number and verdict it prints is a string the authority handed it.
 */
import { Check, X } from "lucide-react";
import { VERDICT_LABEL, type NumericReveal } from "@/lib/interaction-grammar/numericModes";
import { EvidencePlate } from "./shared";

export function NumericRevealPanel({ reveal, animate }: { reveal: NumericReveal; animate: boolean }) {
  const good = reveal.isCorrect === true;
  return (
    <div data-testid="num-reveal" data-verdict={reveal.verdict}
      className={`flex w-full max-w-[40rem] flex-col gap-2 ${animate ? "animate-in fade-in duration-300" : ""}`}>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-md border border-[#7a6236]/40 bg-[#2c2417]/[0.06] px-2 py-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ranked-ink-muted,#5a4a2e)]">Answer</p>
          <p data-testid="num-canonical" className="font-serif text-lg font-bold text-[var(--ranked-ink,#2c2417)]">{reveal.canonicalDisplay}</p>
        </div>
        <div className="rounded-md border border-[#7a6236]/40 bg-[#2c2417]/[0.06] px-2 py-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ranked-ink-muted,#5a4a2e)]">You said</p>
          <p data-testid="num-submitted" className="font-serif text-lg font-bold text-[var(--ranked-ink,#2c2417)]">{reveal.submittedDisplay}</p>
        </div>
      </div>
      <p data-testid="num-verdict"
        className={`inline-flex items-center justify-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.16em] ${
          good ? "text-emerald-700" : reveal.isCorrect === false ? "text-red-700" : "text-[var(--ranked-ink-muted,#5a4a2e)]"}`}>
        {good ? <Check aria-hidden className="size-4" /> : reveal.isCorrect === false ? <X aria-hidden className="size-4" /> : null}
        {VERDICT_LABEL[reveal.verdict]}
        {reveal.deltaDisplay ? <span className="font-mono normal-case tracking-normal opacity-80">({reveal.deltaDisplay})</span> : null}
      </p>
      {reveal.band && (
        <p data-testid="num-band" className="text-center text-[11px] text-[var(--ranked-ink-muted,#5a4a2e)]">
          Accepted: {reveal.band.display}
        </p>
      )}
      <EvidencePlate evidence={reveal.evidence} source={reveal.source} animate={animate} />
    </div>
  );
}
