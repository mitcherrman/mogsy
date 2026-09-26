/**
 * HUB6 — History's few visual marks, drawn in the parchment's own ink.
 *
 * Each one draws a figure the server already sent; none computes one. The
 * shapes follow the History visualization contract:
 *
 *   ring       one bounded part-to-whole (accuracy), always beside its C/A
 *   line       ≥5 compatible runs, drawn oldest → newest
 *   bars       categorical results on a common zero baseline
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

// ------------------------------------------------------------ bars

/** One categorical bar on a common zero baseline, its counts as text. */
export function RatioBar({
  label,
  correct,
  answered,
  accuracy,
  hint,
  progress = 1,
}: {
  label: string;
  correct: number;
  answered: number;
  accuracy: number;
  hint?: string;
  progress?: number;
}) {
  const width = Math.max(0, Math.min(100, accuracy * 100));
  return (
    <li className="min-w-0 text-[11px]" data-testid="history-bar">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate" style={{ color: LEAGUECRAFT_INK.body }} title={label}>
          {label}
          {hint && <span style={{ color: LEAGUECRAFT_INK.faint }}> · {hint}</span>}
        </span>
        <span className="shrink-0 tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }}>
          <span style={{ color: LEAGUECRAFT_INK.faint }}>{correct}/{answered} · </span>
          <span className="font-semibold">{Math.round(accuracy * 100)}%</span>
        </span>
      </div>
      <span aria-hidden="true" className="mt-0.5 block h-[7px] w-full overflow-hidden rounded-full" style={{ background: TRACK_INK }}>
        <span
          className="block h-full rounded-full"
          style={{ width: `${width * progress}%`, background: DATA_INK }}
        />
      </span>
    </li>
  );
}

// ------------------------------------------------------------ pips

/** `used` of `max` marked, as a row of pips. Decorative: the count is text. */
export function Pips({ used, max, progress = 1 }: { used: number; max: number; progress?: number }) {
  const n = Math.max(0, Math.min(12, max));
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true" data-testid="history-pips">
      {Array.from({ length: n }, (_, i) => {
        const on = i < used && staggered(progress, i, Math.max(1, used)) > 0.5;
        return (
          <span
            key={i}
            className="block h-2.5 w-2.5 rounded-full border transition-colors duration-200 motion-reduce:transition-none"
            style={{ borderColor: on ? DATA_INK : FRAME_INK, background: on ? DATA_INK : "transparent" }}
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
          className="relative w-7 shrink-0 text-right text-[9.5px] tabular-nums"
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

/**
 * The run-accuracy trajectory the server fitted: its values oldest first, the
 * last one being this run. Drawn on the full 0–100% axis. The dashed rule is
 * the historical average, when the server sent one — the "Average accuracy"
 * figure beside the chart carries the same dash as its key.
 */
export function TrajectoryChart({
  values,
  average,
  progress = 1,
}: {
  values: number[];
  average: number | null;
  progress?: number;
}) {
  const clipId = useId().replace(/:/g, "");
  const n = values.length;
  if (n < 2) return null;
  const x = (i: number) => (i / (n - 1)) * 100;
  const y = (v: number) => (1 - Math.max(0, Math.min(1, v))) * 100;
  const points = values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const last = values[n - 1];
  // The newest value is labelled on the side its incoming segment is not.
  const labelBelow = values[n - 2] < last ? false : true;
  return (
    <ChartFrame>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {/* The line is revealed left to right — oldest run first — by a clip
            that widens with the reveal. A dash offset is not used: with a
            non-scaling stroke on a stretched chart it breaks into dashes. */}
        <defs>
          <clipPath id={clipId}>
            <rect x={-2} y={-10} width={104 * progress} height={120} />
          </clipPath>
        </defs>
        {average !== null && (
          <line
            x1={0}
            x2={100}
            y1={y(average)}
            y2={y(average)}
            stroke={LEAGUECRAFT_INK.faint}
            strokeWidth={1.25}
            strokeDasharray="5 4"
            vectorEffect="non-scaling-stroke"
            opacity={Math.min(1, progress * 1.6)}
            data-testid="history-trajectory-average"
          />
        )}
        <polyline
          points={points}
          fill="none"
          stroke={DATA_INK}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          clipPath={`url(#${clipId})`}
        />
      </svg>
      {/* Points are HTML so they stay round on a stretched chart. Each lands
          when the line reaches it. */}
      {values.map((v, i) => {
        const isLast = i === n - 1;
        const shown = progress >= i / (n - 1) - 0.001;
        return (
          <span
            key={i}
            aria-hidden="true"
            className={`absolute block rounded-full transition-transform duration-200 motion-reduce:transition-none ${
              isLast ? "h-3 w-3 border-2" : "h-2 w-2"
            }`}
            style={{
              left: `${x(i)}%`,
              top: `${y(v)}%`,
              background: isLast ? "#f3e6c4" : DATA_INK,
              borderColor: isLast ? LEAGUECRAFT_INK.accent : undefined,
              transform: `translate(-50%, -50%) scale(${shown ? 1 : 0})`,
            }}
          />
        );
      })}
      <span
        aria-hidden="true"
        className="absolute whitespace-nowrap text-[10.5px] font-bold tabular-nums"
        style={{
          right: 10,
          top: `${y(last)}%`,
          transform: labelBelow ? "translateY(4px)" : "translateY(calc(-100% - 4px))",
          color: LEAGUECRAFT_INK.accent,
          opacity: progress >= 1 ? 1 : 0,
          transition: "opacity 200ms",
        }}
      >
        {Math.round(last * 100)}%
      </span>
    </ChartFrame>
  );
}

/**
 * The same frame before the trend exists: an empty plot with no axis values
 * (there is nothing on it to read), and beneath it one slot per run the trend
 * needs, the ones already played filled. The slots are a count, kept off the
 * plot so they can never be read as values on it.
 */
export function DormantTrajectory({ observed, required }: { observed: number; required: number }) {
  const slots = Math.max(2, Math.min(12, required));
  const filled = Math.max(0, Math.min(slots, observed));
  return (
    <div className="min-w-0">
      <ChartFrame gutter={false} height="h-[4.5rem]">
        {null}
      </ChartFrame>
      <div className="relative mt-2 h-2.5" aria-hidden="true">
        {Array.from({ length: slots }, (_, i) => (
          <span
            key={i}
            data-testid="history-trajectory-slot"
            data-filled={i < filled ? "true" : "false"}
            className="absolute top-0 block h-2.5 w-2.5 rounded-full border"
            style={{
              left: `${(i / (slots - 1)) * 100}%`,
              transform: "translateX(-50%)",
              borderColor: i < filled ? DATA_INK : FRAME_INK,
              background: i < filled ? DATA_INK : "transparent",
              borderStyle: i < filled ? "solid" : "dashed",
            }}
          />
        ))}
      </div>
    </div>
  );
}
