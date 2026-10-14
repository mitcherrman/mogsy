/**
 * NUM-LAB — STAT DROP. PROTOTYPE ONLY (admin/dev lab; no server authority yet).
 *
 * One subject, one quantity, one number line. The player drops a marker where
 * they think the value sits, adjusts it, and locks. After the caller's
 * authority resolves, the true value lands on the same line with the accepted
 * band shaded behind it, and the player's marker stays where they left it.
 *
 *   OPEN → drop / drag / keys → LOCK → (suspense, caller-owned) → REVEAL
 *
 * NO LEAK BY CONSTRUCTION. `content.scale` is chosen per metric family, never
 * per answer, and the canonical value reaches this component only through
 * `reveal`. It snaps and clamps the PLAYER'S value; it never grades.
 *
 * INPUT. Pointer (mouse, pen, touch) on the track places and drags; only the
 * track sets `touch-action: none`, so the page still scrolls elsewhere. The
 * marker is a WAI slider: arrows step, PageUp/PageDown move a tenth, Home/End
 * jump to the ends, Enter locks. An unplaced marker is placed at the midpoint
 * by the first key, so a keyboard player can always start.
 */
import { useId, useRef, type KeyboardEvent, type PointerEvent, type Ref } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type { InteractionPhase } from "@/lib/interaction-grammar/types";
import {
  formatPlayerValue, fractionOf, sliderKey, valueAtFraction, verdictSentence,
  type NumericResponse, type NumericReveal, type StatDropPublic,
} from "@/lib/interaction-grammar/numericModes";
import { MetricChip, SubjectArt, SuspenseDots } from "./shared";
import { NumericRevealPanel } from "./NumericRevealPanel";

export interface StatDropProps {
  content: StatDropPublic;
  phase: InteractionPhase;
  /** The pending drop, owned by the caller. Null = not placed yet. */
  value: number | null;
  onChange: (value: number) => void;
  onLock: (response: NumericResponse) => void;
  reveal?: NumericReveal | null;
  promptRef?: Ref<HTMLHeadingElement>;
}

const pct = (f: number) => `${(f * 100).toFixed(3)}%`;

export function StatDrop({ content, phase, value, onChange, onLock, reveal = null, promptRef }: StatDropProps) {
  const reduce = useReducedMotionPreference();
  const animate = !reduce;
  const promptId = useId();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const open = phase === "open";
  const { scale } = content;

  const fromPointer = (clientX: number) => {
    const el = trackRef.current;
    if (!el || !Number.isFinite(clientX)) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    onChange(valueAtFraction((clientX - r.left) / r.width, scale));
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!open) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    fromPointer(e.clientX);
    (e.currentTarget.querySelector("[role=slider]") as HTMLElement | null)?.focus();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (open && dragging.current) fromPointer(e.clientX);
  };
  const endDrag = () => { dragging.current = false; };

  const lock = () => { if (open && value !== null) onLock({ selected: value }); };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (e.key === "Enter") { if (value !== null) { e.preventDefault(); lock(); } return; }
    const next = sliderKey(e.key, value, scale);
    if (next !== null) { e.preventDefault(); onChange(next); }
  };

  const shown = reveal ? reveal.submitted : value;
  const readout = shown === null ? "Drop a marker on the line" : formatPlayerValue(shown, scale);
  const announcement = phase === "revealed" && reveal ? `Revealed. ${verdictSentence(reveal)}`
    : phase === "locked" && value !== null ? `Locked in ${formatPlayerValue(value, scale)}. Revealing.` : "";

  return (
    <div data-testid="mig-stat-drop" data-mig-primitive="stat-drop" data-phase={phase}
      className="flex w-full flex-col gap-3 sm:gap-4">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <MetricChip>{content.metricLabel}</MetricChip>
          {content.context && <MetricChip>{content.context}</MetricChip>}
        </div>
        <h2 id={promptId} ref={promptRef} tabIndex={-1} data-testid="statdrop-prompt"
          className="max-w-[40rem] font-serif text-[1.05rem] font-bold leading-snug text-[var(--ranked-ink,#2c2417)] outline-none sm:text-xl">
          {content.prompt}
        </h2>
      </header>

      <div className="flex items-center justify-center gap-3">
        <SubjectArt media={content.subject.media} monogram={content.subject.monogram ?? content.subject.label}
          className="h-14 w-14 shrink-0 rounded-md border border-[#7a6236]/50 sm:h-16 sm:w-16" />
        <div className="min-w-0 text-left">
          <p className="truncate font-serif text-base font-bold text-[var(--ranked-ink,#2c2417)]">{content.subject.label}</p>
          {content.subject.sublabel && <p className="truncate text-[12px] text-[var(--ranked-ink-muted,#5a4a2e)]">{content.subject.sublabel}</p>}
        </div>
      </div>

      {/* Fixed one-line box: the placeholder and the value must occupy the same height. */}
      <p data-testid="statdrop-readout" aria-hidden
        className={`flex h-9 items-center justify-center whitespace-nowrap text-center font-serif tabular-nums text-[var(--ranked-ink,#2c2417)] ${
          shown === null ? "text-sm italic text-[var(--ranked-ink-muted,#5a4a2e)]" : "text-2xl font-black"}`}>
        {readout}
      </p>

      {/* THE LINE. Fixed height in every phase, so the reveal never moves it. */}
      <div className="px-4 sm:px-6">
        <div ref={trackRef} data-part="track"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
          className={`relative h-14 select-none ${open ? "cursor-pointer touch-none" : "cursor-default"}`}>
          <div aria-hidden className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#7a6236]/35" />
          {reveal?.band && (
            <div aria-hidden data-testid="statdrop-band"
              className={`absolute top-1/2 h-4 -translate-y-1/2 rounded-sm bg-emerald-500/30 ${animate ? "animate-in fade-in duration-500" : ""}`}
              style={{ left: pct(fractionOf(reveal.band.low, scale)), width: pct(fractionOf(reveal.band.high, scale) - fractionOf(reveal.band.low, scale)) }} />
          )}
          {reveal && (
            <div aria-hidden data-testid="statdrop-canonical"
              className={`absolute top-0 flex h-full -translate-x-1/2 flex-col items-center ${animate ? "animate-in fade-in zoom-in-75 duration-300 fill-mode-both [animation-delay:250ms]" : ""}`}
              style={{ left: pct(fractionOf(reveal.canonicalValue, scale)) }}>
              <span className="h-full w-1 rounded-full bg-[#0d2740]" />
            </div>
          )}
          <div role="slider" tabIndex={open ? 0 : -1}
            aria-labelledby={promptId}
            aria-valuemin={scale.min} aria-valuemax={scale.max}
            aria-valuenow={shown ?? undefined}
            aria-valuetext={shown === null ? "Not placed" : formatPlayerValue(shown, scale)}
            aria-disabled={!open || undefined}
            onKeyDown={onKeyDown}
            data-testid="statdrop-thumb" data-placed={shown !== null ? "" : undefined}
            className="absolute top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#d5b66f] focus-visible:ring-offset-2"
            style={{ left: shown === null ? "50%" : pct(fractionOf(shown, scale)) }}>
            <span aria-hidden className={`absolute inset-2 rounded-full border-2 ${
              shown === null ? "border-dashed border-[#7a6236]/60 bg-transparent"
                : open ? "border-[#2a2110] bg-[#e8c97a]" : "border-[#2a2110] bg-[#c9a24f]"}`} />
          </div>
        </div>
        <div aria-hidden className="mt-1 flex justify-between text-[11px] tabular-nums text-[var(--ranked-ink-muted,#5a4a2e)]">
          <span>{formatPlayerValue(scale.min, scale)}</span>
          <span>{formatPlayerValue(scale.max, scale)}</span>
        </div>
      </div>

      <footer className="flex min-h-[2.75rem] flex-col items-center gap-2.5">
        {open && (
          <Button type="button" data-testid="statdrop-lock" onClick={lock} disabled={value === null}
            className="min-h-[44px] min-w-[10rem] border border-[#d5b66f]/80 bg-[#2a2110] uppercase tracking-[0.2em] text-[#f6e6bb] hover:bg-[#3a2d14]">
            <Lock aria-hidden /> {value === null ? "Drop a value" : "Lock in"}
          </Button>
        )}
        {phase === "locked" && (
          <p data-testid="statdrop-suspense"
            className="inline-flex min-h-[44px] items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--ranked-ink-muted,#5a4a2e)]">
            Locked · Revealing <SuspenseDots animate={animate} />
          </p>
        )}
        {phase === "revealed" && reveal && <NumericRevealPanel reveal={reveal} animate={animate} />}
      </footer>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  );
}
