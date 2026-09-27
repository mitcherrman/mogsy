/**
 * HUB6.3E — the Premium analytics room's shared marks, printed in the
 * parchment's ink.
 *
 *   Panel          a room section: small-caps heading, optional control
 *   Segmented      a metric / cohort toggle (a pressed-button group)
 *   Scrubber       one focusable surface per chart: arrow keys, hover or a
 *                  tap anywhere pick the nearest point/bin, and a live
 *                  tooltip (kept inside the chart) says what it is — so a
 *                  touch target is the whole chart, never a 10px dot
 *   LineHistory    a chronological series on ONE axis, drawn oldest →
 *                  newest, the current run ringed, a dashed personal
 *                  average and a dotted record rule
 *   NestedDonut    outcome (inner) × group (outer), inner ring first, outer
 *                  second; slices and legend rows preview on hover/focus and
 *                  lock on click/tap
 *   Distribution   a population histogram: bins rise, then the player's
 *                  "You" marker enters; the median is ruled; a table view
 *                  lists every bin
 *   PercentileDial a radial gauge for one percentile (or its dashed empty
 *                  frame with the reason when there is none)
 *
 * Every mark takes a `progress` (0 → 1) from `useReveal`, which is exactly 1
 * whenever motion is reduced. Text is always the final figure.
 */
import { useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import { clamp01 } from "@/lib/motion/easing";
import type { PopulationHistogram } from "@/lib/history/contracts";
import { CHART, RESULT_INK, RESULT_WORD } from "./ink";
import { binLabel, ordinal, percentileNumber } from "./copy";
import type { InnerSlice, NestedDonutData, OuterSlice } from "./derive";
import type { QuestionResult } from "@/components/quiz/workspace/historyViewModel";

// ─────────────────────────────────────────────────────────── layout pieces

export function Caption({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`text-[9.5px] font-bold uppercase tracking-[0.16em] ${className}`} style={{ color: LEAGUECRAFT_INK.faint }}>
      {children}
    </div>
  );
}

export function Panel({
  title,
  eyebrow,
  action,
  children,
  testId,
  className = "",
  headingId,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
  className?: string;
  headingId?: string;
}) {
  const autoId = useId();
  const hid = headingId ?? `panel-${autoId.replace(/:/g, "")}`;
  return (
    <section
      aria-labelledby={hid}
      data-testid={testId}
      className={`min-w-0 rounded-lg border px-3 pb-3.5 pt-2.5 [container-type:inline-size] [@container(min-width:30rem)]:px-4 ${className}`}
      style={{
        borderColor: "rgba(96,68,28,0.26)",
        background: "linear-gradient(180deg, rgba(255,249,233,0.42), rgba(255,246,222,0.16))",
        boxShadow: "inset 0 1px 0 rgba(255,249,233,0.5)",
      }}
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          {eyebrow && <Caption>{eyebrow}</Caption>}
          <h4
            id={hid}
            className="text-[12px] font-extrabold uppercase tracking-[0.12em]"
            style={{ color: LEAGUECRAFT_INK.heading, textShadow: LEAGUECRAFT_INK.press }}
          >
            {title}
          </h4>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export interface SegmentOption {
  id: string;
  label: string;
  disabled?: boolean;
}

/** A metric / cohort toggle: one pressed button of a small group. */
export function Segmented({
  label,
  options,
  value,
  onChange,
  testId,
}: {
  label: string;
  options: SegmentOption[];
  value: string;
  onChange: (id: string) => void;
  testId?: string;
}) {
  const coarse = useCoarsePointer();
  return (
    <div
      role="group"
      aria-label={label}
      data-testid={testId}
      className="inline-flex max-w-full flex-wrap rounded-md border p-0.5"
      style={{ borderColor: "rgba(96,68,28,0.3)", background: "rgba(255,246,222,0.4)" }}
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            disabled={o.disabled}
            data-option={o.id}
            onClick={() => onChange(o.id)}
            className={`rounded-[4px] px-2 text-[10.5px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 ${
              coarse ? "min-h-[44px]" : "min-h-[26px]"
            }`}
            style={{
              color: on ? "#f6ecd2" : LEAGUECRAFT_INK.body,
              background: on ? LEAGUECRAFT_INK.brass : "transparent",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * HUB6.3G — whether an element's content box is narrower than `rem` root
 * ems (so the threshold follows the reader's text size, like the room's
 * container queries). For a switch CSS cannot make — a different structure,
 * not a restyle. Measured before paint and on every resize; false (wide)
 * wherever there is no ResizeObserver.
 */
export function useNarrow(ref: RefObject<HTMLElement>, rem: number): boolean {
  const { width, root } = useElementWidth(ref);
  return width > 0 && width < rem * root;
}

/** An element's width (px) and the root font size, kept current. Zero
 *  wherever there is no ResizeObserver. */
export function useElementWidth(ref: RefObject<HTMLElement>): { width: number; root: number } {
  const [state, setState] = useState({ width: 0, root: 16 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const width = el.clientWidth;
      setState((s) => (s.width === width && s.root === root ? s : { width, root }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return state;
}

/**
 * HUB6.3G — which of a histogram's equal-width bins get an axis label, so no
 * two labels overlap: the player's own bin first, then the two ends, then the
 * rest, each kept only if its (estimated) box clears every label already
 * placed. The ends are anchored inward. Every range stays in the tooltip and
 * the table.
 */
export function axisLabelIndexes(labels: string[], subject: number | null, width: number, charPx = 6.2, gap = 6): number[] {
  const n = labels.length;
  if (n === 0) return [];
  if (width <= 0) return [...new Set([0, n - 1, ...(subject !== null ? [subject] : [])])].sort((a, b) => a - b);
  const col = width / n;
  const box = (i: number): [number, number] => {
    const w = labels[i].length * charPx + 4;
    if (i === 0) return [0, w];
    if (i === n - 1) return [width - w, width];
    const c = (i + 0.5) * col;
    return [c - w / 2, c + w / 2];
  };
  const order = [...(subject !== null ? [subject] : []), 0, n - 1, ...labels.map((_, i) => i)];
  const kept: Array<[number, number, number]> = [];
  for (const i of order) {
    if (kept.some((k) => k[2] === i)) continue;
    const [a, b] = box(i);
    if (kept.every(([x, y]) => b + gap <= x || a >= y + gap)) kept.push([a, b, i]);
  }
  return kept.map((k) => k[2]).sort((a, b) => a - b);
}

/** A number counted into place with its reveal; the final value whenever
 *  there is no motion. */
export function Counted({ value, progress, format = (v) => String(Math.round(v)) }: {
  value: number;
  progress: number;
  format?: (v: number) => string;
}) {
  return <>{format(progress >= 1 ? value : value * progress)}</>;
}

/** A change, with its direction as a glyph (never colour alone). */
export function DeltaChip({ text, direction, testId }: { text: string; direction: "up" | "down" | "same"; testId?: string }) {
  const glyph = direction === "up" ? "▲" : direction === "down" ? "▼" : "=";
  return (
    <span
      data-testid={testId}
      data-direction={direction}
      className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold leading-tight tabular-nums"
      style={{
        borderColor: direction === "same" ? "rgba(96,68,28,0.3)" : direction === "up" ? "rgba(44,122,75,0.45)" : "rgba(163,55,42,0.4)",
        color: LEAGUECRAFT_INK.strong,
        background: "rgba(255,249,233,0.45)",
      }}
    >
      <span aria-hidden="true" className="text-[8px]" style={{ color: direction === "up" ? RESULT_INK.correct : direction === "down" ? RESULT_INK.incorrect : LEAGUECRAFT_INK.faint }}>
        {glyph}
      </span>
      <span className="min-w-0">{text}</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────── tooltip + scrubber

/** A tooltip positioned at `x` (0–100% of its chart), held inside the
 *  chart's box so it never escapes the region (or the viewport). */
export function ChartTip({ x, children, testId, placement = "top" }: {
  x: number;
  children: React.ReactNode;
  testId?: string;
  placement?: "top" | "bottom";
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={testId}
      className="pointer-events-none absolute z-10 w-max max-w-[min(13rem,100%)] rounded-md border px-2.5 py-1.5 text-[11px] leading-snug shadow-md"
      style={{
        left: `clamp(0px, calc(${x}% - 6.5rem), calc(100% - min(13rem, 100%)))`,
        ...(placement === "top" ? { top: 0 } : { bottom: 0 }),
        borderColor: "rgba(96,68,28,0.45)",
        background: "rgba(246,236,210,0.97)",
        color: LEAGUECRAFT_INK.body,
      }}
    >
      {children}
    </div>
  );
}

/**
 * The one interactive surface of a line chart or a histogram. It is a single
 * tab stop: ← / → (and Home / End) step through the items, a mouse hover or
 * a tap picks the nearest item by x, and Escape clears it. The index lives
 * here; the chart draws from it.
 */
function useScrubber(count: number) {
  const [index, setIndex] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const pick = (clientX: number) => {
    const el = ref.current;
    if (!el || count === 0) return;
    const box = el.getBoundingClientRect();
    const t = box.width > 0 ? (clientX - box.left) / box.width : 0;
    setIndex(Math.max(0, Math.min(count - 1, Math.round(t * (count - 1)))));
  };
  const pickBin = (clientX: number) => {
    const el = ref.current;
    if (!el || count === 0) return;
    const box = el.getBoundingClientRect();
    const t = box.width > 0 ? (clientX - box.left) / box.width : 0;
    setIndex(Math.max(0, Math.min(count - 1, Math.floor(t * count))));
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (count === 0) return;
    const cur = index ?? -1;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(count - 1, cur + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(0, cur < 0 ? count - 1 : cur - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = count - 1;
    else if (e.key === "Escape" && index !== null) {
      e.stopPropagation();
      setIndex(null);
      return;
    }
    if (next !== null) {
      e.preventDefault();
      setIndex(next);
    }
  };
  return { index, setIndex, ref, pick, pickBin, onKeyDown };
}

// ─────────────────────────────────────────────────────────── line history

export interface LinePoint {
  key: string;
  value: number | null;
  isCurrent: boolean;
  /** "Sep 14". */
  label: string;
}

/**
 * A chronological personal series on ONE y-axis (the caller never mixes
 * scales: a metric toggle swaps the whole series). Accuracy is drawn on a
 * fixed 0–100% axis; counts from zero. The line draws oldest → newest; the
 * current run is ringed; `average` is a dashed rule and `record` a dotted
 * one.
 *
 * HUB6.3G: NO text inside the plot. The current run's value and the two
 * rules are named in the readout above it (`LineKey`), so a label can never
 * collide with a rule, a point or another label — at any width or text size.
 */
export function LineHistory({
  points,
  fraction,
  average = null,
  record = null,
  progress,
  describe,
  format,
  title,
  testId,
  height = "h-[10.5rem]",
}: {
  points: LinePoint[];
  fraction: boolean;
  average?: number | null;
  record?: number | null;
  progress: number;
  /** Tooltip lines for a point. */
  describe: (p: LinePoint, i: number) => React.ReactNode;
  format: (v: number) => string;
  title: string;
  testId?: string;
  height?: string;
}) {
  const clipId = useId().replace(/:/g, "");
  const s = useScrubber(points.length);
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  const top = fraction ? 1 : niceCeil(Math.max(1, ...values, average ?? 0, record ?? 0));
  const ticks = fraction ? [1, 0.5, 0] : [top, Math.round(top / 2), 0];
  const n = points.length;
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => (1 - Math.max(0, Math.min(1, v / top))) * 100;
  const path = points
    .map((p, i) => (p.value === null ? null : `${x(i).toFixed(2)},${y(p.value).toFixed(2)}`))
    .filter(Boolean)
    .join(" ");
  const sel = s.index;
  const summary = points.filter((p) => p.value !== null).map((p) => `${p.label}: ${format(p.value!)}`).join("; ");

  return (
    <div className="min-w-0" data-testid={testId}>
      <div className={`relative flex ${height} min-w-0 gap-1.5 pt-1`}>
        <div className="relative w-8 shrink-0 text-right text-[10px] tabular-nums" style={{ color: LEAGUECRAFT_INK.faint }} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${y(t)}%` }}>
              {fraction ? `${Math.round(t * 100)}%` : t}
            </span>
          ))}
        </div>
        <div
          ref={s.ref}
          role="group"
          tabIndex={0}
          aria-label={`${title}. ${points.length} Dailies, oldest first. Use the arrow keys to read each one.`}
          aria-describedby={`${clipId}-sr`}
          onKeyDown={s.onKeyDown}
          onPointerMove={(e) => e.pointerType !== "touch" && s.pick(e.clientX)}
          onPointerLeave={(e) => e.pointerType !== "touch" && s.setIndex(null)}
          onPointerDown={(e) => e.pointerType === "touch" && s.pick(e.clientX)}
          onBlur={() => s.setIndex(null)}
          data-testid={testId ? `${testId}-scrubber` : undefined}
          data-selected={sel ?? undefined}
          className="relative min-w-0 flex-1 cursor-crosshair touch-pan-y rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {ticks.map((t) => (
            <span
              key={t}
              aria-hidden="true"
              className="absolute inset-x-0 block"
              style={{ top: `${y(t)}%`, borderTop: `1px ${t === 0 ? "solid" : "dotted"} ${CHART.frame}` }}
            />
          ))}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            <defs>
              <clipPath id={clipId}>
                <rect x={-2} y={-10} width={104 * progress} height={120} />
              </clipPath>
            </defs>
            {average !== null && (
              <line x1={0} x2={100} y1={y(average)} y2={y(average)} stroke={LEAGUECRAFT_INK.faint} strokeWidth={1.25}
                strokeDasharray="5 4" vectorEffect="non-scaling-stroke" opacity={Math.min(1, progress * 1.5)} data-testid="line-average" />
            )}
            {record !== null && (
              <line x1={0} x2={100} y1={y(record)} y2={y(record)} stroke={CHART.gold} strokeWidth={1.5}
                strokeDasharray="1.5 3.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={Math.min(1, progress * 1.5)} data-testid="line-record" />
            )}
            {sel !== null && (
              <line x1={x(sel)} x2={x(sel)} y1={0} y2={100} stroke={CHART.frame} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            )}
            <polyline points={path} fill="none" stroke={CHART.ink} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round"
              vectorEffect="non-scaling-stroke" clipPath={`url(#${clipId})`} />
          </svg>
          {points.map((p, i) => {
            if (p.value === null) return null;
            const shown = progress >= (n <= 1 ? 0 : i / (n - 1)) - 0.001;
            const on = sel === i;
            return (
              <span
                key={p.key}
                aria-hidden="true"
                data-testid={p.isCurrent ? "line-current" : "line-point"}
                className="absolute block rounded-full transition-transform duration-200 motion-reduce:transition-none"
                style={{
                  left: `${x(i)}%`, top: `${y(p.value)}%`,
                  width: p.isCurrent ? 14 : on ? 11 : 8, height: p.isCurrent ? 14 : on ? 11 : 8,
                  background: p.isCurrent ? "#f3e6c4" : CHART.ink,
                  border: p.isCurrent ? `2.5px solid ${CHART.current}` : on ? "2px solid #f3e6c4" : undefined,
                  boxShadow: on ? `0 0 0 2px ${CHART.ink}` : undefined,
                  transform: `translate(-50%, -50%) scale(${shown ? 1 : 0})`,
                }}
              />
            );
          })}
          {sel !== null && points[sel] && (
            <ChartTip x={x(sel)} testId={testId ? `${testId}-tip` : undefined} placement={points[sel].value !== null && y(points[sel].value!) < 45 ? "bottom" : "top"}>
              {describe(points[sel], sel)}
            </ChartTip>
          )}
        </div>
      </div>
      <div className="ml-[2.375rem] mt-1 flex justify-between text-[9.5px] tabular-nums" style={{ color: LEAGUECRAFT_INK.faint }} aria-hidden="true">
        <span>{points[0]?.label}</span>
        {n > 2 && <span>{points[Math.floor((n - 1) / 2)]?.label}</span>}
        <span>{points[n - 1]?.label}</span>
      </div>
      <p id={`${clipId}-sr`} className="sr-only">{summary}</p>
    </div>
  );
}

function niceCeil(v: number): number {
  if (v <= 5) return 5;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * mag >= v) return m * mag;
  return 10 * mag;
}

/**
 * The readout over a line chart (HUB6.3G): this Daily's value, then what the
 * dashed and dotted rules are, each with its figure. It sits OUTSIDE the plot
 * and wraps as the width needs, so nothing in it can overlap the chart's
 * marks or another label.
 */
export function LineKey({ current, average, record, testId }: {
  current?: string | null;
  average?: string | null;
  record?: string | null;
  testId?: string;
}) {
  return (
    <div className="mb-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[10.5px]" style={{ color: LEAGUECRAFT_INK.faint }} data-testid={testId}>
      <span className="inline-flex items-center gap-1.5" data-testid="line-key-current">
        <span aria-hidden="true" className="inline-block h-2.5 w-2.5 self-center rounded-full" style={{ border: `2px solid ${CHART.current}`, background: "#f3e6c4" }} />
        <span className="font-extrabold uppercase tracking-[0.1em]" style={{ color: CHART.current }}>This Daily</span>
        {current && <span className="text-[13px] font-black tabular-nums" style={{ color: CHART.current }}>{current}</span>}
      </span>
      {average && (
        <span className="inline-flex items-center gap-1.5" data-testid="line-key-average">
          <span aria-hidden="true" className="inline-block w-4 self-center" style={{ borderTop: `1.5px dashed ${LEAGUECRAFT_INK.faint}` }} />
          {average}
        </span>
      )}
      {record && (
        <span className="inline-flex items-center gap-1.5" data-testid="line-key-record">
          <span aria-hidden="true" className="inline-block w-4 self-center" style={{ borderTop: `2px dotted ${CHART.gold}` }} />
          {record}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── nested donut

export type DonutTarget =
  | { kind: "outcome"; slice: InnerSlice }
  | { kind: "slice"; slice: OuterSlice }
  | { kind: "group"; group: string };

export function targetKey(t: DonutTarget): string {
  return t.kind === "group" ? `group:${t.group}` : `${t.kind}:${t.slice.id}`;
}

const TAU = Math.PI * 2;

function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  // Angles in turns (0..1), starting at 12 o'clock, clockwise.
  const p = (r: number, a: number) => [cx + r * Math.sin(a * TAU), cy - r * Math.cos(a * TAU)];
  const large = a1 - a0 > 0.5 ? 1 : 0;
  if (a1 - a0 >= 0.9999) {
    // A full ring: two halves.
    return `${arc(cx, cy, r0, r1, a0, a0 + 0.5)} ${arc(cx, cy, r0, r1, a0 + 0.5, a0 + 0.99995)}`;
  }
  const [x0, y0] = p(r1, a0);
  const [x1, y1] = p(r1, a1);
  const [x2, y2] = p(r0, a1);
  const [x3, y3] = p(r0, a0);
  return `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`;
}

/** Outcome textures: incorrect is hatched, a timeout dotted — so the inner
 *  ring never relies on colour alone. */
export function OutcomePatterns({ prefix }: { prefix: string }) {
  return (
    <defs>
      <pattern id={`${prefix}-incorrect`} patternUnits="userSpaceOnUse" width={5} height={5} patternTransform="rotate(45)">
        <rect width={5} height={5} fill={RESULT_INK.incorrect} />
        <line x1={0} y1={0} x2={0} y2={5} stroke="rgba(255,240,220,0.55)" strokeWidth={1.8} />
      </pattern>
      <pattern id={`${prefix}-timeout`} patternUnits="userSpaceOnUse" width={5} height={5}>
        <rect width={5} height={5} fill={RESULT_INK.timeout} />
        <circle cx={2.5} cy={2.5} r={1.05} fill="rgba(255,240,220,0.65)" />
      </pattern>
    </defs>
  );
}

export function outcomePaint(result: QuestionResult, prefix: string): string {
  return result === "correct" ? RESULT_INK.correct : `url(#${prefix}-${result})`;
}

/** The small legend mark for an outcome: its texture and its glyph. */
export function OutcomeMark({ result, size = 14 }: { result: QuestionResult; size?: number }) {
  const glyph = result === "correct" ? "✓" : result === "incorrect" ? "×" : "◷";
  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 place-items-center rounded-[3px] text-[9px] font-black leading-none"
      style={{
        width: size, height: size, color: "#fffaf0",
        background: result === "incorrect"
          ? `repeating-linear-gradient(45deg, ${RESULT_INK.incorrect} 0 3px, #c46a5c 3px 4.5px)`
          : result === "timeout"
            ? `radial-gradient(circle, rgba(255,240,220,0.6) 1px, transparent 1.3px) 0 0/4px 4px, ${RESULT_INK.timeout}`
            : RESULT_INK.correct,
      }}
    >
      {glyph}
    </span>
  );
}

/**
 * Outcome (inner ring) × group (outer ring). The outer ring is aligned to
 * the inner: each outcome's arc is divided among the groups within it. Slices
 * preview their questions on hover/focus (`onPreview`) and lock them on
 * click/tap (`onLock`); the legend is the keyboard and touch path to every
 * slice, and the centre reads the active slice.
 */
export function NestedDonut({
  data,
  progress,
  onPreview,
  onLock,
  lockedKey,
  groupNoun,
  describeGroup,
  title,
  testId,
}: {
  data: NestedDonutData;
  progress: number;
  onPreview: (t: DonutTarget | null) => void;
  onLock: (t: DonutTarget) => void;
  lockedKey: string | null;
  /** "category" / "stage" — for accessible names. */
  groupNoun: string;
  /** Extra detail lines for a group (this-stage and personal history). */
  describeGroup?: (group: string) => React.ReactNode;
  title: string;
  testId?: string;
}) {
  const prefix = useId().replace(/:/g, "");
  const coarse = useCoarsePointer();
  const [active, setActive] = useState<DonutTarget | null>(null);
  const shown = active ?? (lockedKey ? findTarget(data, lockedKey) : null);
  const total = data.total;
  const pIn = clamp01(progress / 0.55);
  const pOut = clamp01((progress - 0.45) / 0.55);

  // Angular layout: inner slices end-to-end; outer slices subdivide them.
  const layout = useMemo(() => {
    let a = 0;
    const inner = data.inner.map((s) => {
      const a0 = a;
      a += total ? s.count / total : 0;
      return { s, a0, a1: a };
    });
    let b = 0;
    const outer = data.outer.map((s) => {
      const a0 = b;
      b += total ? s.count / total : 0;
      return { s, a0, a1: b };
    });
    return { inner, outer };
  }, [data, total]);

  const enter = (t: DonutTarget) => {
    setActive(t);
    onPreview(t);
  };
  const leave = () => {
    setActive(null);
    onPreview(null);
  };
  const isOn = (t: DonutTarget) => {
    if (!shown) return true;
    const k = targetKey(shown);
    if (k === targetKey(t)) return true;
    if (shown.kind === "outcome" && t.kind === "slice") return t.slice.outcome === shown.slice.outcome;
    if (shown.kind === "group" && t.kind === "slice") return t.slice.group === shown.group;
    if (shown.kind === "slice" && t.kind === "outcome") return t.slice.outcome === shown.slice.outcome;
    return false;
  };

  const center = centerText(data, shown, groupNoun);
  const G = 0.004; // angular gap between slices, in turns

  return (
    <div className="grid min-w-0 items-start gap-x-5 gap-y-3 [@container(min-width:27rem)]:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)]" data-testid={testId}>
      <div className="relative mx-auto w-full max-w-[12.5rem] [@container(min-width:27rem)]:max-w-[15rem]">
        <svg
          viewBox="0 0 200 200"
          className="block h-auto w-full"
          role="img"
          aria-label={`${title}: ${data.inner.map((s) => `${s.count} ${RESULT_WORD[s.outcome].toLowerCase()}`).join(", ")} of ${total}`}
        >
          <OutcomePatterns prefix={prefix} />
          {layout.inner.map(({ s, a0, a1 }) => {
            const end = Math.min(a1, pIn);
            if (end <= a0) return null;
            const t: DonutTarget = { kind: "outcome", slice: s };
            return (
              <path
                key={s.id}
                d={arc(100, 100, 44, 66, a0 + G / 2, Math.max(a0 + G / 2, end - G / 2))}
                fill={outcomePaint(s.outcome, prefix)}
                stroke={CHART.paper}
                strokeWidth={1.5}
                opacity={isOn(t) ? 1 : 0.28}
                data-testid="donut-inner"
                data-outcome={s.outcome}
                className="cursor-pointer transition-opacity duration-150 motion-reduce:transition-none"
                onPointerEnter={(e) => e.pointerType !== "touch" && enter(t)}
                onPointerLeave={(e) => e.pointerType !== "touch" && leave()}
                onClick={() => onLock(t)}
              />
            );
          })}
          {layout.outer.map(({ s, a0, a1 }) => {
            const end = a0 + (a1 - a0) * pOut;
            if (pOut <= 0 || end <= a0) return null;
            const t: DonutTarget = { kind: "slice", slice: s };
            return (
              <path
                key={s.id}
                d={arc(100, 100, 70, 96, a0 + G / 2, Math.max(a0 + G / 2, end - G / 2))}
                fill={s.color}
                stroke={CHART.paper}
                strokeWidth={1.5}
                opacity={isOn(t) ? 1 : 0.24}
                data-testid="donut-outer"
                data-outcome={s.outcome}
                data-group={s.group}
                className="cursor-pointer transition-opacity duration-150 motion-reduce:transition-none"
                onPointerEnter={(e) => e.pointerType !== "touch" && enter(t)}
                onPointerLeave={(e) => e.pointerType !== "touch" && leave()}
                onClick={() => onLock(t)}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
          <div className="max-w-[5.6rem] text-center leading-tight" data-testid="donut-center">
            <div className="text-[22px] font-black tabular-nums" style={{ color: LEAGUECRAFT_INK.strong, textShadow: LEAGUECRAFT_INK.press }}>
              {center.big}
            </div>
            <div className="text-[9.5px] font-bold uppercase tracking-[0.1em]" style={{ color: LEAGUECRAFT_INK.faint }}>
              {center.small}
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-2.5">
        {/* Outcomes: the inner ring's legend. */}
        <ul className="flex flex-wrap gap-1.5" aria-label="Results">
          {layout.inner.map(({ s }) => {
            const t: DonutTarget = { kind: "outcome", slice: s };
            const key = targetKey(t);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  aria-pressed={lockedKey === key}
                  aria-label={`${RESULT_WORD[s.outcome]}: ${s.count} of ${total} questions. ${lockedKey === key ? "Selected." : "Select to light them."}`}
                  data-testid="donut-legend-outcome"
                  data-outcome={s.outcome}
                  onPointerEnter={(e) => e.pointerType !== "touch" && enter(t)}
                  onPointerLeave={(e) => e.pointerType !== "touch" && leave()}
                  onFocus={() => enter(t)}
                  onBlur={leave}
                  onClick={() => onLock(t)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 text-[11px] font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${coarse ? "min-h-[44px]" : "min-h-[28px]"}`}
                  style={{
                    borderColor: lockedKey === key ? LEAGUECRAFT_INK.strong : "rgba(96,68,28,0.3)",
                    background: lockedKey === key ? "rgba(96,68,28,0.12)" : "rgba(255,249,233,0.35)",
                    color: LEAGUECRAFT_INK.strong,
                  }}
                >
                  <OutcomeMark result={s.outcome} />
                  {RESULT_WORD[s.outcome]} <span style={{ color: LEAGUECRAFT_INK.faint }}>{s.count}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Groups: the outer ring's legend, each with its within-outcome
            split — the keyboard and touch path to every outer slice. */}
        <ul className="grid gap-1 [@container(min-width:46rem)]:grid-cols-2" aria-label={`By ${groupNoun}`}>
          {data.groups.map((g) => {
            const t: DonutTarget = { kind: "group", group: g.group };
            const key = targetKey(t);
            const slices = data.outer.filter((s) => s.group === g.group);
            const locked = lockedKey === key || slices.some((s) => lockedKey === `slice:${s.id}`);
            return (
              <li
                key={g.group}
                className="grid min-w-0 grid-cols-1 items-center gap-x-2 rounded-md border px-1.5 py-0.5 [@container(min-width:16rem)]:grid-cols-[minmax(0,1fr)_auto]"
                style={{
                  borderColor: locked ? LEAGUECRAFT_INK.strong : "rgba(96,68,28,0.18)",
                  background: locked ? "rgba(96,68,28,0.1)" : isOn(t) ? "rgba(255,249,233,0.3)" : "transparent",
                  opacity: isOn(t) || slices.some((s) => isOn({ kind: "slice", slice: s })) ? 1 : 0.55,
                }}
                data-testid="donut-legend-group"
                data-group={g.group}
              >
                <button
                  type="button"
                  aria-pressed={lockedKey === key}
                  aria-label={`${g.label}: ${g.correct} of ${g.played} correct. ${lockedKey === key ? "Selected." : "Select to light these questions."}`}
                  onPointerEnter={(e) => e.pointerType !== "touch" && enter(t)}
                  onPointerLeave={(e) => e.pointerType !== "touch" && leave()}
                  onFocus={() => enter(t)}
                  onBlur={leave}
                  onClick={() => onLock(t)}
                  className={`flex min-w-0 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${coarse ? "min-h-[44px]" : "min-h-[26px]"}`}
                >
                  <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: g.color }} />
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-bold" style={{ color: LEAGUECRAFT_INK.strong }}>{g.label}</span>
                    <span className="block text-[10.5px] tabular-nums [@container(min-width:16rem)]:whitespace-nowrap" style={{ color: LEAGUECRAFT_INK.faint }}>
                      {g.correct}/{g.played} correct · {Math.round((g.correct / Math.max(1, g.played)) * 100)}%
                    </span>
                  </span>
                </button>
                <span className="flex flex-wrap items-center gap-0.5" role="group" aria-label={`${g.label} by result`}>
                  {slices.map((s) => {
                    const st: DonutTarget = { kind: "slice", slice: s };
                    const sk = targetKey(st);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={lockedKey === sk}
                        aria-label={`${g.label}, ${RESULT_WORD[s.outcome].toLowerCase()}: ${s.count}`}
                        data-testid="donut-legend-slice"
                        data-outcome={s.outcome}
                        onPointerEnter={(e) => e.pointerType !== "touch" && enter(st)}
                        onPointerLeave={(e) => e.pointerType !== "touch" && leave()}
                        onFocus={() => enter(st)}
                        onBlur={leave}
                        onClick={() => onLock(st)}
                        className={`inline-flex items-center gap-0.5 rounded px-1 text-[10.5px] font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${coarse ? "min-h-[44px] min-w-[44px] justify-center" : "min-h-[24px]"}`}
                        style={{
                          color: LEAGUECRAFT_INK.strong,
                          background: lockedKey === sk ? "rgba(96,68,28,0.16)" : undefined,
                          outline: lockedKey === sk ? `1.5px solid ${LEAGUECRAFT_INK.strong}` : undefined,
                        }}
                      >
                        <OutcomeMark result={s.outcome} size={12} />
                        {s.count}
                      </button>
                    );
                  })}
                </span>
                {describeGroup && (shown?.kind === "group" && shown.group === g.group || shown?.kind === "slice" && shown.slice.group === g.group) && (
                  <div className="pb-0.5 pl-5 text-[10.5px] leading-snug [@container(min-width:16rem)]:col-span-2" style={{ color: LEAGUECRAFT_INK.body }} data-testid="donut-group-detail">
                    {describeGroup(g.group)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function findTarget(data: NestedDonutData, key: string): DonutTarget | null {
  if (key.startsWith("group:")) {
    const group = key.slice("group:".length);
    return data.groups.some((g) => g.group === group) ? { kind: "group", group } : null;
  }
  if (key.startsWith("outcome:")) {
    const s = data.inner.find((x) => `outcome:${x.id}` === key);
    return s ? { kind: "outcome", slice: s } : null;
  }
  const s = data.outer.find((x) => `slice:${x.id}` === key);
  return s ? { kind: "slice", slice: s } : null;
}

function centerText(data: NestedDonutData, t: DonutTarget | null, groupNoun: string): { big: string; small: string } {
  if (!t) {
    const correct = data.inner.find((s) => s.outcome === "correct")?.count ?? 0;
    return { big: `${correct}/${data.total}`, small: "correct" };
  }
  if (t.kind === "outcome") return { big: String(t.slice.count), small: RESULT_WORD[t.slice.outcome] };
  if (t.kind === "slice") return { big: String(t.slice.count), small: `${t.slice.label} · ${RESULT_WORD[t.slice.outcome].toLowerCase()}` };
  const g = data.groups.find((x) => x.group === t.group);
  return g ? { big: `${g.correct}/${g.played}`, small: g.label } : { big: "", small: groupNoun };
}

// ─────────────────────────────────────────────────────────── distribution

/**
 * A population histogram exactly as HUB6.3C sent it: privacy-merged bins
 * (each ≥ 5 players; open-ended under/overflow bins), drawn as equal-width
 * columns labelled with their own ranges, so a merged bin is never passed off
 * as a narrower one. The player's bin is inked brass and a "You" marker drops
 * onto it after the bins rise; the median is ruled. No leaderboard, no other
 * player's value, no rank.
 */
export function Distribution({
  histogram,
  value,
  median,
  percentile,
  format,
  progress,
  title,
  testId,
}: {
  histogram: PopulationHistogram;
  value: number | null;
  median: number | null;
  percentile: number | null;
  format: (v: number) => string;
  progress: number;
  title: string;
  testId?: string;
}) {
  const bins = histogram.bins;
  const fraction = histogram.scale === "fraction";
  const n = bins.length;
  const s = useScrubber(n);
  const max = Math.max(1, ...bins.map((b) => b.count));
  const users = bins.reduce((a, b) => a + b.count, 0);
  const sub = histogram.subjectBin;
  const pBars = clamp01(progress / 0.7);
  const pYou = clamp01((progress - 0.65) / 0.35);
  const colW = 100 / n;
  // The median's place: its bin, interpolated inside the bin's bounds.
  const medianX = median === null ? null : positionIn(bins, median, fraction);
  const youX = value === null || sub === null ? null : positionIn(bins, value, fraction, sub);
  const label = (i: number) => binLabel(bins[i], fraction);
  const tableId = useId().replace(/:/g, "");
  const axisRef = useRef<HTMLDivElement>(null);
  const { width: axisWidth } = useElementWidth(axisRef);
  const shownLabels = useMemo(
    () => axisLabelIndexes(bins.map((b) => binLabel(b, fraction)), sub, axisWidth),
    [bins, fraction, sub, axisWidth],
  );

  return (
    <div className="min-w-0" data-testid={testId}>
      <div
        ref={s.ref}
        role="group"
        tabIndex={0}
        aria-label={`${title}. ${n} ranges. Use the arrow keys to read each range.`}
        onKeyDown={s.onKeyDown}
        onPointerMove={(e) => e.pointerType !== "touch" && s.pickBin(e.clientX)}
        onPointerLeave={(e) => e.pointerType !== "touch" && s.setIndex(null)}
        onPointerDown={(e) => e.pointerType === "touch" && s.pickBin(e.clientX)}
        onBlur={() => s.setIndex(null)}
        data-testid={testId ? `${testId}-scrubber` : undefined}
        data-selected={s.index ?? undefined}
        className="relative h-[8rem] min-w-0 touch-pan-y rounded-sm pt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative h-full">
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 block" style={{ borderTop: `1px solid ${CHART.frame}` }} />
          {bins.map((b, i) => {
            const h = (b.count / max) * 100 * pBars;
            const mine = i === sub;
            const on = s.index === i;
            return (
              <span
                key={i}
                aria-hidden="true"
                data-testid="dist-bin"
                data-subject={mine ? "true" : undefined}
                className="absolute bottom-0 block rounded-t-[3px]"
                style={{
                  left: `calc(${i * colW}% + 1px)`, width: `calc(${colW}% - 2px)`, height: `${h}%`,
                  background: mine ? CHART.gold : on ? "rgba(83,56,8,0.55)" : "rgba(83,56,8,0.3)",
                  boxShadow: mine ? `inset 0 0 0 1.5px ${LEAGUECRAFT_INK.brass}` : undefined,
                }}
              />
            );
          })}
          {medianX !== null && (
            <span
              aria-hidden="true"
              data-testid="dist-median"
              className="absolute bottom-0 top-0 block"
              style={{ left: `${medianX}%`, borderLeft: `1.5px dashed ${LEAGUECRAFT_INK.faint}`, opacity: pBars }}
            >
            </span>
          )}
          {youX !== null && (
            <span
              aria-hidden="true"
              data-testid="dist-you"
              className="absolute bottom-0 top-[-1.5rem] block transition-transform duration-300 motion-reduce:transition-none"
              style={{ left: `${youX}%`, opacity: pYou, transform: `translateY(${(1 - pYou) * -10}px)` }}
            >
              <span className="absolute bottom-0 top-4 block w-[2px] -translate-x-1/2" style={{ background: CHART.current }} />
              <span
                className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-[1px] text-[9.5px] font-black uppercase tracking-[0.08em]"
                style={{ background: CHART.current, color: "#f6ecd2", left: youX > 88 ? "-0.9rem" : youX < 12 ? "0.9rem" : 0 }}
              >
                You
              </span>
            </span>
          )}
        </div>
        {s.index !== null && (
          <ChartTip x={(s.index + 0.5) * colW} testId={testId ? `${testId}-tip` : undefined}>
            <span className="block font-bold" style={{ color: LEAGUECRAFT_INK.strong }}>{label(s.index)}</span>
            <span className="block tabular-nums">
              {bins[s.index].count.toLocaleString("en-US")} players · {Math.round((bins[s.index].count / Math.max(1, users)) * 100)}%
            </span>
            {s.index === sub && <span className="block font-bold" style={{ color: CHART.current }}>Your result is in this range</span>}
          </ChartTip>
        )}
      </div>
      <div ref={axisRef} className="relative mt-1 h-3.5 text-[9.5px] tabular-nums" style={{ color: LEAGUECRAFT_INK.faint }} aria-hidden="true" data-testid="dist-axis">
        {bins.map((b, i) => shownLabels.includes(i) && (
          <span
            key={i}
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{
              left: `${(i + 0.5) * colW}%`,
              fontWeight: i === sub ? 800 : 400,
              color: i === sub ? LEAGUECRAFT_INK.strong : undefined,
              ...(i === 0 ? { transform: "none", left: 0 } : i === n - 1 ? { transform: "none", left: "auto", right: 0 } : {}),
            }}
          >
            {label(i)}
          </span>
        ))}
      </div>
      {/* HUB6.3G: the "You" marker is the plot's only text; the median rule
          is named here, so the two can never collide in one bin. */}
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px]" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="dist-key">
        {value !== null && sub !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: CHART.gold, boxShadow: `inset 0 0 0 1.5px ${LEAGUECRAFT_INK.brass}` }} />
            Your range
          </span>
        )}
        {median !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-3 self-center" style={{ borderLeft: `1.5px dashed ${LEAGUECRAFT_INK.faint}` }} />
            Median {format(median)}
          </span>
        )}
      </div>
      <details className="mt-1.5 text-[10.5px]" style={{ color: LEAGUECRAFT_INK.faint }}>
        <summary className="flex min-h-[24px] cursor-pointer select-none items-center rounded font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-[44px]">
          Every range as a table
        </summary>
        <table className="mt-1.5 w-full max-w-[18rem] tabular-nums" aria-describedby={tableId}>
          <caption id={tableId} className="sr-only">
            {title}. {percentile !== null ? `You: ${value === null ? "—" : format(value)}, ${ordinal(percentileNumber(percentile))} percentile.` : ""}
            {median !== null ? ` Median ${format(median)}.` : ""} {users.toLocaleString("en-US")} players.
          </caption>
          <thead>
            <tr><th className="text-left font-bold">Range</th><th className="text-right font-bold">Players</th></tr>
          </thead>
          <tbody>
            {bins.map((b, i) => (
              <tr key={i} style={{ color: i === sub ? LEAGUECRAFT_INK.strong : undefined, fontWeight: i === sub ? 800 : 400 }}>
                <td>{label(i)}{i === sub ? " (you)" : ""}</td>
                <td className="text-right">{b.count.toLocaleString("en-US")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Where a value sits along equal-width bin columns (0–100%). */
function positionIn(bins: PopulationHistogram["bins"], v: number, fraction: boolean, known?: number): number {
  const n = bins.length;
  let i = known ?? bins.findIndex((b) =>
    (b.lower === null || v >= b.lower) && (b.upper === null || v < b.upper || (b.upperInclusive && v <= b.upper)));
  if (i < 0) i = v < (bins[0].upper ?? 0) ? 0 : n - 1;
  const b = bins[i];
  let t = 0.5;
  if (b.lower !== null && b.upper !== null && b.upper > b.lower) {
    const span = fraction ? b.upper - b.lower : b.upper - b.lower;
    t = Math.max(0.12, Math.min(0.88, (v - b.lower + (fraction ? 0 : 0.5)) / span));
  }
  return ((i + t) / n) * 100;
}

// ─────────────────────────────────────────────────────────── percentile dial

/**
 * One percentile as a 240° dial: the arc fills to the player's standing, a
 * needle marks it, the centre reads the ordinal. With no percentile the
 * frame stays, dashed and empty, and the reason is printed beneath — never a
 * zero.
 */
export function PercentileDial({
  percentile,
  label,
  sublabel,
  color = CHART.ink,
  progress,
  size = 112,
  reason,
  testId,
  emphasis = false,
  fluid = false,
  className = "",
}: {
  percentile: number | null;
  label: string;
  sublabel?: React.ReactNode;
  color?: string;
  progress: number;
  size?: number;
  reason?: string;
  testId?: string;
  emphasis?: boolean;
  /** HUB6.3G: fill the cell (up to `size`) — three dials in one row on a
   *  phone rather than three stacked cards. */
  fluid?: boolean;
  className?: string;
}) {
  const r = 40;
  const start = -120;
  const sweep = 240;
  const polar = (deg: number, rad = r) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [50 + rad * Math.cos(a), 54 + rad * Math.sin(a)];
  };
  const arcPath = (d0: number, d1: number) => {
    const [x0, y0] = polar(d0);
    const [x1, y1] = polar(d1);
    return `M${x0},${y0} A${r},${r} 0 ${d1 - d0 > 180 ? 1 : 0} 1 ${x1},${y1}`;
  };
  const has = percentile !== null;
  const p = has ? percentile! * progress : 0;
  const deg = start + sweep * p;
  const [nx, ny] = polar(deg, r - 12);
  const num = has ? percentileNumber(percentile!) : null;
  return (
    <figure
      className={`flex min-w-0 flex-col items-center text-center ${className}`}
      data-testid={testId}
      data-percentile={has ? num! : undefined}
      data-state={has ? "available" : "none"}
    >
      <svg
        viewBox="0 0 100 92"
        width={fluid ? undefined : size}
        height={fluid ? undefined : size * 0.92}
        style={fluid ? { width: "100%", maxWidth: size, height: "auto" } : undefined}
        role="img"
        aria-label={has ? `${label}: ${ordinal(num!)} percentile` : `${label}: no percentile. ${reason ?? ""}`}
        className="max-w-full"
      >
        <path d={arcPath(start, start + sweep)} fill="none" stroke={CHART.track} strokeWidth={9} strokeLinecap="round"
          strokeDasharray={has ? undefined : "2 4"} />
        {[0.25, 0.5, 0.75].map((t) => {
          const [a, b] = polar(start + sweep * t, r + 7);
          const [c, d] = polar(start + sweep * t, r + 3);
          return <line key={t} x1={a} y1={b} x2={c} y2={d} stroke={CHART.frame} strokeWidth={1.2} />;
        })}
        {has && p > 0.002 && (
          <path d={arcPath(start, deg)} fill="none" stroke={color} strokeWidth={9} strokeLinecap="round" />
        )}
        {has && (
          <>
            <line x1={50} y1={54} x2={nx} y2={ny} stroke={LEAGUECRAFT_INK.strong} strokeWidth={2} strokeLinecap="round" />
            <circle cx={50} cy={54} r={3.2} fill={LEAGUECRAFT_INK.strong} />
          </>
        )}
        <text x={50} y={86} textAnchor="middle" fontSize={emphasis ? 15 : 13} fontWeight={900} fill={has ? LEAGUECRAFT_INK.strong : LEAGUECRAFT_INK.faint}>
          {has ? ordinal(num!) : "—"}
        </text>
      </svg>
      <figcaption className="min-w-0 max-w-full">
        <span className="block text-[11px] font-extrabold" style={{ color: LEAGUECRAFT_INK.strong }}>{label}</span>
        {sublabel && <span className="block text-[10.5px] leading-snug" style={{ color: LEAGUECRAFT_INK.faint }}>{sublabel}</span>}
        {!has && reason && <span className="mt-0.5 block text-[10px] italic leading-snug" style={{ color: LEAGUECRAFT_INK.faint }}>{reason}</span>}
      </figcaption>
    </figure>
  );
}
