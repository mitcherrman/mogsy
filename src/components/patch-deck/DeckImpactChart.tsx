import { useId, useMemo } from "react";
import type { StatProjection } from "@/lib/patch-impact/types";
import { buildImpactChartModel } from "@/components/patch-impact/graph/chart-model";
import { formatDelta, formatStatValue } from "@/components/patch-impact/format";

/**
 * The deck's level chart: PH2's projection drawn large, in the deck's own
 * ink. Every number comes from `buildImpactChartModel` (PH4-B's pure model
 * over `projection.levels`): points, axis bounds, ticks and the crossover
 * level are copied, never recomputed. This file does no stat math.
 *
 * Interaction: clicking or tapping a level column selects it; the selected
 * level draws a cursor and a before/after bubble. Keyboard users move the
 * level with the scrubber beside the chart (the chart itself is `role="img"`
 * with a text summary, plus a visually hidden level table).
 */
const W = 560;
const H = 300;
/** Room above the highest point for the value bubble, so it is never clipped. */
const PAD = { top: 56, right: 20, bottom: 34, left: 48 };

export const DeckImpactChart = ({
  projection,
  level,
  onLevelChange,
}: {
  projection: StatProjection;
  level: number;
  onLevelChange: (level: number) => void;
}) => {
  const id = useId().replace(/:/g, "");
  const model = useMemo(() => buildImpactChartModel(projection), [projection]);
  if (!model) return null;

  const [y0, y1] = model.y.domain;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (lvl: number) => PAD.left + ((lvl - 1) / 17) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - y0) / (y1 - y0 || 1)) * innerH;
  const path = (key: "before" | "after") => model.points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.level).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const area = `${path("after")} L${x(18).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${x(1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;
  const selected = model.points[level - 1] ?? model.points[model.points.length - 1];
  const sx = x(selected.level);
  const bubbleW = 150;
  const bubbleX = Math.min(Math.max(sx - bubbleW / 2, PAD.left), W - PAD.right - bubbleW);
  const statCap = model.statLabel.replace(/^./, (c) => c.toUpperCase());
  const summary = `${statCap} by champion level, before and after the patch. Level ${selected.level}: ${formatStatValue(selected.before)} before, ${formatStatValue(selected.after)} after${model.crossoverLevel ? `; the difference changes sign at level ${model.crossoverLevel}` : ""}.`;

  return (
    <figure className="dk-chart m-0 space-y-2" data-testid="deck-impact-chart" data-level={level}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <figcaption className="text-[0.8125rem] font-medium" style={{ color: "var(--dk-ink-2)" }}>
          {statCap} by champion level
        </figcaption>
        <p className="dk-chart__key" aria-hidden>
          <span>
            <i style={{ borderColor: "rgba(239,233,218,0.5)", borderStyle: "dashed" }} />
            Before
          </span>
          <span>
            <i style={{ borderColor: "var(--dk-gold)" }} />
            After
          </span>
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        <defs>
          <linearGradient id={`dk-chart-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(201,168,76,0.22)" />
            <stop offset="100%" stopColor="rgba(201,168,76,0)" />
          </linearGradient>
        </defs>
        {model.y.ticks.map((t) => (
          <g key={t}>
            <line className="dk-chart__grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="dk-chart__axis" x={PAD.left - 8} y={y(t) + 4} textAnchor="end">
              {formatStatValue(t)}
            </text>
          </g>
        ))}
        {model.xTicks.map((t) => (
          <text key={t} className="dk-chart__axis" x={x(t)} y={H - 10} textAnchor="middle">
            {t}
          </text>
        ))}
        <path d={area} fill={`url(#dk-chart-fill-${id})`} />
        <path className="dk-chart__before" d={path("before")} />
        <path className="dk-chart__after" d={path("after")} />
        {model.crossoverLevel !== null && (
          <g>
            <line x1={x(model.crossoverLevel)} x2={x(model.crossoverLevel)} y1={PAD.top} y2={PAD.top + innerH} stroke="rgba(239,233,218,0.25)" strokeDasharray="2 4" />
            <path className="dk-chart__cross" d={`M${x(model.crossoverLevel)},${PAD.top - 10} l6,6 l-6,6 l-6,-6 z`} />
          </g>
        )}
        <line className="dk-chart__cursor" x1={sx} x2={sx} y1={PAD.top} y2={PAD.top + innerH} />
        {model.points.map((p) => (
          <g key={p.level}>
            <circle cx={x(p.level)} cy={y(p.before)} r={p.level === level ? 5 : 2.5} fill="var(--dk-panel)" stroke="rgba(239,233,218,0.55)" strokeWidth={1.5} />
            <circle cx={x(p.level)} cy={y(p.after)} r={p.level === level ? 6 : 3} fill="var(--dk-gold-2)" stroke="var(--dk-panel)" strokeWidth={1.5} />
            <rect
              className="dk-chart__hit"
              x={x(p.level) - innerW / 34}
              y={PAD.top}
              width={innerW / 17}
              height={innerH}
              onClick={() => onLevelChange(p.level)}
              data-testid="deck-chart-hit"
              data-level={p.level}
            />
          </g>
        ))}
        <g transform={`translate(${bubbleX}, ${Math.max(y(Math.max(selected.before, selected.after)) - 52, 4)})`}>
          <rect className="dk-chart__bubble" width={bubbleW} height={40} rx={8} />
          <text className="dk-chart__bubble-text" x={10} y={17} fill="var(--dk-ink-3)">
            L{selected.level} · {formatStatValue(selected.before)}
          </text>
          <text className="dk-chart__bubble-text" x={10} y={33} fill="var(--dk-gold-2)">
            → {formatStatValue(selected.after)} ({formatDelta(selected.absDelta, "flat", "projected")})
          </text>
        </g>
      </svg>
      <table className="sr-only">
        <caption>{statCap} before and after the patch, levels 1 to 18</caption>
        <thead>
          <tr>
            <th scope="col">Level</th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
            <th scope="col">Difference</th>
          </tr>
        </thead>
        <tbody>
          {model.points.map((p) => (
            <tr key={p.level}>
              <th scope="row">{p.level}</th>
              <td>{formatStatValue(p.before)}</td>
              <td>{formatStatValue(p.after)}</td>
              <td>{formatDelta(p.absDelta, "flat", "projected")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!model.y.fromZero && (
        <p className="text-[0.75rem]" style={{ color: "var(--dk-ink-4)" }}>
          Click or tap a level to select it. The vertical axis starts at {formatStatValue(y0)}, not 0.
        </p>
      )}
    </figure>
  );
};
