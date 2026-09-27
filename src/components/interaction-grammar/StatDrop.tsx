/**
 * MIG1.1 — STAT DROP.
 *
 * A numerical estimate on a bounded scale. The player drags (or keys, or
 * nudges) a marker, locks it, and after a short beat the true value drops onto
 * the same scale beside theirs.
 *
 *   OPEN → adjust → LOCK → (suspense, caller-owned) → REVEAL
 *
 * NO LEAK BY CONSTRUCTION. `content` (StatDropPublic) carries the prompt and
 * the scale — never the value. The scale's bounds are the CALLER's
 * presentation choice and must be chosen without reference to the answer (a
 * scale centred on the answer is a leak; see the MIG1.1 handoff).
 *
 * NO SCORING. After the reveal the absolute difference is drawn, because the
 * value is then public. It is a distance, not a grade: there is no points
 * formula here and no "close enough" band. Current backend numeric grading is
 * pass/fail and is not this component's business.
 *
 * INPUT. A native range input sits over the whole track (a >=44px target for
 * touch and pointer). Keys are handled here rather than left to the browser so
 * every platform steps identically: ←/↓ and →/↑ one step, PageDown/PageUp ten,
 * Home/End the bounds, Enter locks. The −/+ buttons are the precise path on a
 * phone.
 */
import { useId, type KeyboardEvent } from "react";
import { Lock, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type {
  InteractionPhase, StatDropPublic, StatDropResponse, StatDropReveal, StatDropScale,
} from "@/lib/interaction-grammar/types";
import { EvidencePlate, MetricChip, SubjectArt, SuspenseDots } from "./shared";

export interface StatDropProps {
  content: StatDropPublic;
  phase: InteractionPhase;
  /** The pending estimate, owned by the caller. Null = untouched (drawn at mid-scale). */
  value: number | null;
  onChange: (value: number) => void;
  /** Commit. Emits the production `SegmentChoice` scalar shape. */
  onLock: (response: StatDropResponse) => void;
  reveal?: StatDropReveal | null;
}

/** Snap to the scale's step grid and bounds, free of float dust. */
export function snapToScale(raw: number, s: StatDropScale): number {
  const steps = Math.round((raw - s.min) / s.step);
  const v = Math.min(s.max, Math.max(s.min, s.min + steps * s.step));
  return Number(v.toFixed(Math.max(0, s.decimals)));
}

/** The untouched estimate: mid-scale, snapped. Independent of any answer. */
export function initialEstimate(s: StatDropScale): number {
  return snapToScale((s.min + s.max) / 2, s);
}

const pct = (v: number, s: StatDropScale) =>
  Math.min(100, Math.max(0, ((v - s.min) / (s.max - s.min)) * 100));

const fmt = (v: number, decimals: number) => v.toFixed(Math.max(0, decimals));

function withUnit(text: string, unit: string) {
  return unit ? `${text} ${unit}` : text;
}

export function StatDrop({ content, phase, value, onChange, onLock, reveal = null }: StatDropProps) {
  const reduced = useReducedMotionPreference();
  const animate = !reduced;
  const promptId = useId();
  const { scale, unit } = content;
  const open = phase === "open";
  const estimate = value ?? initialEstimate(scale);
  const set = (next: number) => { if (open) onChange(snapToScale(next, scale)); };
  const lock = () => { if (open) onLock({ selected: estimate }); };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    const big = scale.step * 10;
    const moves: Record<string, number> = {
      ArrowRight: estimate + scale.step, ArrowUp: estimate + scale.step,
      ArrowLeft: estimate - scale.step, ArrowDown: estimate - scale.step,
      PageUp: estimate + big, PageDown: estimate - big, Home: scale.min, End: scale.max,
    };
    if (e.key in moves) { e.preventDefault(); set(moves[e.key]); }
    else if (e.key === "Enter") { e.preventDefault(); lock(); }
  };

  const estimatePct = pct(estimate, scale);
  const truePct = reveal ? pct(reveal.canonicalValue, scale) : null;
  const outOfScale = reveal !== null
    && (reveal.canonicalValue < scale.min || reveal.canonicalValue > scale.max);
  const delta = reveal ? Math.abs(estimate - reveal.canonicalValue) : null;
  // The delta at the ESTIMATE's precision, or the authority's if finer.
  const deltaDecimals = reveal
    ? Math.max(scale.decimals, (reveal.canonicalDisplay.split(".")[1] ?? "").length) : scale.decimals;
  const deltaText = delta !== null ? withUnit(fmt(delta, deltaDecimals), unit) : null;
  const exactHit = delta !== null && Number(fmt(delta, deltaDecimals)) === 0;
  const estimateText = withUnit(fmt(estimate, scale.decimals), unit);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => scale.min + f * (scale.max - scale.min));

  const announcement = phase === "revealed" && reveal
    ? `Revealed. True value ${withUnit(reveal.canonicalDisplay, unit)}. Your estimate ${estimateText}. Off by ${deltaText}.`
    : phase === "locked" ? `Locked at ${estimateText}. Revealing.` : "";

  return (
    <div data-testid="mig-stat-drop" data-mig-primitive="stat-drop" data-phase={phase}
      className="flex w-full flex-col gap-3 sm:gap-4">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <MetricChip>{content.metricLabel}</MetricChip>
          {content.context && <MetricChip>{content.context}</MetricChip>}
        </div>
        <div className="flex items-center gap-3">
          {content.subject && (
            <SubjectArt media={content.subject.media} monogram={content.subject.label}
              className="h-12 w-12 shrink-0 rounded-full border border-[#b9934c]/70 sm:h-14 sm:w-14" />
          )}
          <h2 id={promptId} data-testid="drop-prompt"
            className="max-w-[36rem] text-left font-serif text-[1.05rem] font-bold leading-snug text-[var(--ranked-ink,#2c2417)] sm:text-xl">
            {content.prompt}
          </h2>
        </div>
      </header>

      {/* THE PLATE. A carved tablet (dark stone on the vellum) holding the
          readout and the scale, so the numbers read at arena contrast. */}
      <div className="rounded-xl border border-[#b9934c]/45 bg-gradient-to-b from-[#192c45] via-[#0c192a] to-[#070f1c] px-3 pb-3 pt-3 text-[#efe8d6] shadow-[inset_0_1px_0_rgba(213,182,111,0.18),0_10px_24px_-16px_rgba(0,0,0,0.9)] sm:px-5 sm:pb-4">
        {/* Readouts. Fixed height in every phase so the reveal moves nothing. */}
        <div className="flex h-[4.25rem] items-center justify-center gap-2 sm:h-[4.75rem] sm:gap-4">
          {phase !== "revealed" ? (
            <>
              <Button type="button" variant="ghost" aria-label={`Decrease by ${fmt(scale.step, scale.decimals)}`}
                data-testid="drop-nudge-down" disabled={!open || estimate <= scale.min}
                onClick={() => set(estimate - scale.step)}
                className="h-11 w-11 rounded-full border border-[#b9934c]/45 text-[#f0d78c] hover:bg-white/5 hover:text-[#f6e6bb]">
                <Minus aria-hidden />
              </Button>
              <div className="flex min-w-[8.5rem] flex-col items-center">
                <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#d5b66f]/80">
                  {phase === "locked" ? "Locked estimate" : "Your estimate"}
                </span>
                <span data-testid="drop-estimate" className="font-serif text-[2.1rem] font-black leading-none tabular-nums sm:text-[2.6rem]">
                  {fmt(estimate, scale.decimals)}
                  {unit && <span className="ml-1 font-sans text-sm font-semibold text-[#a9b3c1]">{unit}</span>}
                </span>
              </div>
              <Button type="button" variant="ghost" aria-label={`Increase by ${fmt(scale.step, scale.decimals)}`}
                data-testid="drop-nudge-up" disabled={!open || estimate >= scale.max}
                onClick={() => set(estimate + scale.step)}
                className="h-11 w-11 rounded-full border border-[#b9934c]/45 text-[#f0d78c] hover:bg-white/5 hover:text-[#f6e6bb]">
                <Plus aria-hidden />
              </Button>
            </>
          ) : reveal && (
            <div data-testid="drop-readout-revealed" className="grid w-full max-w-[26rem] grid-cols-3 items-end text-center">
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d5b66f]/80">You</span>
                <span data-testid="drop-estimate" className="font-serif text-2xl font-black tabular-nums leading-none text-[#f0d78c] sm:text-3xl">
                  {fmt(estimate, scale.decimals)}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8fd0f5]">Actual</span>
                <span data-testid="drop-true-value"
                  className={`font-serif text-[2.1rem] font-black tabular-nums leading-none text-[#dcefff] sm:text-[2.6rem] ${
                    animate ? "animate-in fade-in zoom-in-50 slide-in-from-top-3 duration-500 fill-mode-both" : ""}`}>
                  {reveal.canonicalDisplay}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a9b3c1]">{exactHit ? "Exact" : "Off by"}</span>
                <span data-testid="drop-delta"
                  className={`font-serif text-2xl font-black tabular-nums leading-none text-[#efe8d6] sm:text-3xl ${
                    animate ? "animate-in fade-in duration-300 fill-mode-both [animation-delay:450ms]" : ""}`}>
                  {exactHit ? "✓" : fmt(delta!, deltaDecimals)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* THE SCALE. Markers sit ABOVE the rail (You) and BELOW it (Actual),
            so the two can never cover each other even when they coincide. */}
        <div className="relative mx-1 mt-1 h-16 sm:mx-2">
          {/* Rail */}
          <div aria-hidden className="absolute inset-x-0 top-7 h-2 rounded-full bg-black/60 shadow-[inset_0_1px_2px_rgba(0,0,0,0.8)] ring-1 ring-[#b9934c]/30" />
          {/* Fill to the estimate */}
          <div aria-hidden className="absolute left-0 top-7 h-2 rounded-full bg-gradient-to-r from-[#7a6236] to-[#d5b66f]"
            style={{ width: `${estimatePct}%` }} />
          {/* The gap, once the truth is known */}
          {truePct !== null && (
            <div aria-hidden data-testid="drop-gap"
              className={`absolute top-[26px] h-3 rounded-sm bg-[#8fd0f5]/25 ring-1 ring-[#8fd0f5]/50 ${
                animate ? "animate-in fade-in duration-500 fill-mode-both [animation-delay:250ms]" : ""}`}
              style={{ left: `${Math.min(estimatePct, truePct)}%`, width: `${Math.abs(estimatePct - truePct)}%` }} />
          )}
          {/* The native control, over the whole track: pointer, touch, and the
              focus ring's anchor. Visually it is the thumb below. */}
          <input type="range" data-testid="drop-range"
            min={scale.min} max={scale.max} step={scale.step} value={estimate}
            disabled={!open}
            aria-labelledby={promptId}
            aria-valuetext={estimateText}
            onChange={(e) => set(Number(e.currentTarget.value))}
            onKeyDown={onKeyDown}
            className="peer absolute inset-x-0 top-2 z-20 h-12 w-full cursor-pointer appearance-none bg-transparent opacity-0 disabled:cursor-default" />
          {/* YOUR thumb */}
          <div aria-hidden data-testid="drop-thumb"
            className={`pointer-events-none absolute top-[18px] z-10 -ml-[13px] flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-[#f6e6bb] bg-[#2a2110] shadow-[0_0_14px_-2px_rgba(213,182,111,0.8)] ring-offset-2 ring-offset-[#0c192a] peer-focus-visible:ring-2 peer-focus-visible:ring-[#d5b66f] ${
              open ? "" : "border-[#d5b66f]"} ${animate && phase === "locked" ? "animate-pulse" : ""}`}
            style={{ left: `${estimatePct}%` }}>
            {phase !== "open" && <Lock className="h-3 w-3 text-[#f0d78c]" />}
          </div>
          {/* The TRUE marker drops in below the rail */}
          {truePct !== null && reveal && (
            <div data-testid="drop-true-marker" aria-hidden
              className={`pointer-events-none absolute top-[34px] z-10 flex -translate-x-1/2 flex-col items-center ${
                animate ? "animate-in fade-in slide-in-from-top-4 duration-500 fill-mode-both" : ""}`}
              style={{ left: `${truePct}%` }}>
              <span className="h-0 w-0 border-x-[7px] border-b-[9px] border-x-transparent border-b-[#8fd0f5]" />
              <span className="mt-0.5 whitespace-nowrap rounded-sm bg-[#0d2740] px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#bfe4ff]">
                {outOfScale ? (reveal.canonicalValue > scale.max ? "Actual ▶" : "◀ Actual") : "Actual"}
              </span>
            </div>
          )}
        </div>
        {/* Tick labels */}
        <div aria-hidden className="mx-1 mt-1 flex justify-between text-[10px] font-semibold tabular-nums text-[#a9b3c1]/80 sm:mx-2">
          {ticks.map((t, i) => <span key={i}>{fmt(t, scale.decimals > 0 && t % 1 !== 0 ? scale.decimals : 0)}</span>)}
        </div>
      </div>

      <footer className="flex min-h-[2.75rem] flex-col items-center gap-2">
        {phase === "open" && (
          <Button type="button" data-testid="drop-lock" onClick={lock}
            className="min-h-[44px] min-w-[10rem] border border-[#d5b66f]/80 bg-[#2a2110] uppercase tracking-[0.2em] text-[#f6e6bb] hover:bg-[#3a2d14]">
            <Lock aria-hidden /> Lock estimate
          </Button>
        )}
        {phase === "locked" && (
          <p data-testid="drop-suspense"
            className="inline-flex min-h-[44px] items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--ranked-ink-muted,#5a4a2e)]">
            Locked at {estimateText} · Revealing <SuspenseDots animate={animate} />
          </p>
        )}
        {phase === "revealed" && reveal && (
          <div className="w-full max-w-[40rem]">
            <EvidencePlate evidence={reveal.evidence} source={reveal.source} animate={animate} />
          </div>
        )}
      </footer>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  );
}
