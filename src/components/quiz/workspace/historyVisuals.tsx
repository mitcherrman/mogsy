/**
 * HUB6 — History's few visual marks, drawn in the parchment's own ink.
 *
 * Each one draws a figure the server already sent; none computes one. The
 * shapes follow the History visualization contract:
 *
 *   ring       one bounded part-to-whole (accuracy), always beside its C/A
 *   line       ≥5 compatible runs, drawn oldest → newest
 *   path       a stage's rounds in played order (Stage Focus)
 *   pips       a small bounded count (Survival strikes against the limit)
 *
 * MOTION
 * ──────
 * Every mark takes a `progress` (0 → 1) from `useReveal`, which is 1 from the
 * first render whenever motion is reduced or unavailable. The ring sweeps its
 * circumference, the line draws chronologically and its points land as the
 * stroke reaches them, bars grow from the baseline. Nothing loops, and no
 * value is withheld while it draws: text is always the final figure.
 *
 * DORMANT
 * ───────
 * Where a comparison is not available yet, its structure stays on the page —
 * an unfilled ring, an empty chart frame with its slots — and the server's
 * count says how far along it is. Nothing is drawn that was not measured.
 */
import { useId } from "react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { staggered } from "@/lib/motion/useReveal";

/** The data ink: the Academy charts' brass, so both parchments draw alike. */
export const DATA_INK = LEAGUECRAFT_INK.brass;
/** The track a mark is drawn on. */
export const TRACK_INK = "rgba(96, 68, 28, 0.16)";
/** Frame lines: gridlines, baselines, dormant slots. */
export const FRAME_INK = "rgba(96, 68, 28, 0.28)";

// ------------------------------------------------------------ ring

export function AccuracyRing({
  accuracy,
  progress = 1,
  size = 44,
  stroke = 4,
  children,
  className = "",
}: {
  /** 0–1, or null for a run with nothing answered (the ring stays unfilled). */
  accuracy: number | null;
  progress?: number;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = accuracy === null ? 0 : Math.max(0, Math.min(1, accuracy));
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center ${className}`}
      style={{ width: size, height: size }}
      data-testid="history-ring"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK_INK} strokeWidth={stroke} />
        {share > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={DATA_INK}
            strokeWidth={stroke}
            strokeLinecap={share >= 1 ? "butt" : "round"}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - share * progress)}
          />
        )}
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}

// ------------------------------------------------------------ pips

/** `used` of `max` marked, as a row of pips, filling in order. Decorative:
 *  the count is text. The pips are a count against the limit — they do not
 *  say which occurrence produced a strike. */
export function Pips({
  used,
  max,
  progress = 1,
  ink = DATA_INK,
}: {
  used: number;
  max: number;
  progress?: number;
  ink?: string;
}) {
  const n = Math.max(0, Math.min(12, max));
  return (
    <span className="inline-flex items-center gap-1.5" aria-hidden="true" data-testid="history-pips">
      {Array.from({ length: n }, (_, i) => {
        const on = i < used && (progress >= 1 || staggered(progress, i, Math.max(1, used)) > 0.5);
        return (
          <span
            key={i}
            data-on={on ? "true" : "false"}
            className="grid h-4 w-4 place-items-center rounded-full border-2 transition-transform duration-200 motion-reduce:transition-none"
            style={{ borderColor: on ? ink : FRAME_INK, background: on ? ink : "transparent", transform: on ? "scale(1)" : "scale(0.85)" }}
          />
        );
      })}
    </span>
  );
}

// ------------------------------------------------------------ trajectory

const Y_TICKS = [1, 0.5, 0] as const;

export function ChartFrame({
  children,
  gutter = true,
  height = "h-[6.5rem]",
}: {
  children: React.ReactNode;
  gutter?: boolean;
  height?: string;
}) {
  return (
    <div className={`flex ${height} min-w-0 gap-1.5`}>
      {gutter && (
        <div
          className="relative w-8 shrink-0 text-right text-[10px] tabular-nums"
          style={{ color: LEAGUECRAFT_INK.faint }}
          aria-hidden="true"
        >
          {Y_TICKS.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t) * 100}%` }}>
              {Math.round(t * 100)}%
            </span>
          ))}
        </div>
      )}
      <div className="relative min-w-0 flex-1">
        {Y_TICKS.map((t) => (
          <span
            key={t}
            aria-hidden="true"
            className="absolute inset-x-0 block"
            style={{
              top: `${(1 - t) * 100}%`,
              borderTop: `1px ${t === 0 ? "solid" : "dotted"} ${FRAME_INK}`,
            }}
          />
        ))}
        {children}
      </div>
    </div>
  );
}

const yOf = (v: number) => (1 - Math.max(0, Math.min(1, v))) * 100;

/** The dashed historical-average rule, on the chart's own 0–100% scale. */
function AverageRule({ average, progress }: { average: number; progress: number }) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
      <line
        x1={0}
        x2={100}
        y1={yOf(average)}
        y2={yOf(average)}
        stroke={LEAGUECRAFT_INK.faint}
        strokeWidth={1.25}
        strokeDasharray="5 4"
        vectorEffect="non-scaling-stroke"
        opacity={Math.min(1, progress * 1.6)}
        data-testid="history-trajectory-average"
      />
    </svg>
  );
}

/** This run's point: ringed in the accent, labelled with its value and
 *  "this run", and landed last. */
function CurrentPoint({ value, x, shown, labelBelow }: { value: number; x: number; shown: boolean; labelBelow: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        data-testid="history-trajectory-current"
        className="absolute block h-3.5 w-3.5 rounded-full border-[2.5px] transition-transform duration-300 motion-reduce:transition-none"
        style={{
          left: `${x}%`,
          top: `${yOf(value)}%`,
          background: "#f3e6c4",
          borderColor: LEAGUECRAFT_INK.accent,
          transform: `translate(-50%, -50%) scale(${shown ? 1 : 0})`,
        }}
      />
      <span
        aria-hidden="true"
        className="absolute whitespace-nowrap text-right leading-tight tabular-nums"
        style={{
          right: `${100 - x}%`,
          top: `${yOf(value)}%`,
          transform: labelBelow ? "translate(-10px, 6px)" : "translate(-10px, calc(-100% - 6px))",
          color: LEAGUECRAFT_INK.accent,
          opacity: shown ? 1 : 0,
          transition: "opacity 200ms",
        }}
      >
        <span className="block text-[12px] font-extrabold">{Math.round(value * 100)}%</span>
        <span className="block text-[9px] font-bold uppercase tracking-[0.14em]">this run</span>
      </span>
    </>
  );
}

/**
 * The run-accuracy history the server fitted: its values oldest first, the
 * last one being this run. Drawn on the full 0–100% axis. The dashed rule is
 * the historical average, when the server sent one — the "Average accuracy"
 * figure beside the chart carries the same dash as its key.
 */
export function TrajectoryChart({
  values,
  average,
  progress = 1,
  height,
}: {
  values: number[];
  average: number | null;
  progress?: number;
  height?: string;
}) {
  const clipId = useId().replace(/:/g, "");
  const n = values.length;
  if (n < 2) return null;
  const x = (i: number) => (i / (n - 1)) * 100;
  const points = values.map((v, i) => `${x(i).toFixed(2)},${yOf(v).toFixed(2)}`).join(" ");
  const last = values[n - 1];
  // The newest value is labelled on the side its incoming segment is not.
  const labelBelow = values[n - 2] >= last;
  return (
    <ChartFrame height={height}>
      {average !== null && <AverageRule average={average} progress={progress} />}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {/* Revealed left to right — oldest run first — by a clip that widens
            with the reveal. A dash offset is not used: with a non-scaling
            stroke on a stretched chart it breaks into dashes. */}
        <defs>
          <clipPath id={clipId}>
            <rect x={-2} y={-10} width={104 * progress} height={120} />
          </clipPath>
        </defs>
        <polyline
          points={points}
          fill="none"
          stroke={DATA_INK}
          strokeWidth={2.25}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          clipPath={`url(#${clipId})`}
        />
      </svg>
      {/* Points are HTML so they stay round on a stretched chart. Each lands
          when the line reaches it; this run's lands last. */}
      {values.slice(0, -1).map((v, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="absolute block h-2.5 w-2.5 rounded-full transition-transform duration-200 motion-reduce:transition-none"
          style={{
            left: `${x(i)}%`,
            top: `${yOf(v)}%`,
            background: DATA_INK,
            transform: `translate(-50%, -50%) scale(${progress >= i / (n - 1) - 0.001 ? 1 : 0})`,
          }}
        />
      ))}
      <CurrentPoint value={last} x={100} shown={progress >= 1} labelBelow={labelBelow} />
    </ChartFrame>
  );
}

/**
 * The same chart before the trend exists. It plots only what is known — this
 * run's own accuracy, at the newest end, and the historical average when the
 * server sent one — and beneath the plot one slot per run the trend needs,
 * filled from the newest end for the runs already on record. The slots are a
 * count, kept off the plot so they can never be read as values on it.
 */
export function DormantTrajectory({
  observed,
  required,
  current = null,
  average = null,
  progress = 1,
  height,
}: {
  observed: number;
  required: number;
  current?: number | null;
  average?: number | null;
  progress?: number;
  height?: string;
}) {
  const slots = Math.max(2, Math.min(12, required));
  const filled = Math.max(0, Math.min(slots, observed));
  const plotted = current !== null || average !== null;
  return (
    <div className="min-w-0">
      <ChartFrame gutter={plotted} height={height ?? (plotted ? "h-[6.5rem]" : "h-[4.5rem]")}>
        {average !== null && <AverageRule average={average} progress={progress} />}
        {current !== null && <CurrentPoint value={current} x={100} shown={progress >= 1} labelBelow={false} />}
      </ChartFrame>
      <div className={`relative mt-2 h-2.5 ${plotted ? "ml-[2.375rem]" : ""}`} aria-hidden="true">
        {Array.from({ length: slots }, (_, i) => {
          const on = i >= slots - filled;
          return (
            <span
              key={i}
              data-testid="history-trajectory-slot"
              data-filled={on ? "true" : "false"}
              className="absolute top-0 block h-2.5 w-2.5 rounded-full border"
              style={{
                left: `${(i / (slots - 1)) * 100}%`,
                transform: "translateX(-50%)",
                borderColor: on ? DATA_INK : FRAME_INK,
                background: on ? DATA_INK : "transparent",
                borderStyle: on ? "solid" : "dashed",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
