/**
 * The recharts canvas for the Patch Impact level graph (PH4-B). Loaded lazily
 * by `PatchImpactGraph`; keep every `recharts` import in this file so the report
 * bundle never pulls it in.
 *
 * It draws a prepared `ImpactChartModel` and nothing else: no stat math, no
 * fetching, no crossover detection. Every plotted dot carries the exact PH2
 * value as `data-value`, so what is on screen can be checked against the data.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { formatDelta, formatStatValue } from "../format";
import type { ImpactChartModel, ImpactChartPoint } from "./chart-model";

const AFTER_COLOR = "#c9a84c";
const BEFORE_COLOR = "hsl(var(--muted-foreground))";
const SURFACE_COLOR = "hsl(var(--background))";

const COMPACT_HEIGHT = 176;
const ROOMY_HEIGHT = 208;
const ROOMY_FROM_WIDTH = 480;

/** The plot's own width, tracked so the SVG never exceeds its container (no page-level horizontal scroll). */
function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const read = () => setWidth(Math.floor(element.getBoundingClientRect().width));
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

type DotProps = {
  cx?: number;
  cy?: number;
  payload?: ImpactChartPoint;
  series: "before" | "after";
  selectedLevel: number;
};

/** After: filled gold. Before: hollow grey. The selected level is larger on both lines. */
const LevelDot = ({ cx, cy, payload, series, selectedLevel }: DotProps) => {
  if (cx === undefined || cy === undefined || !payload) return null;
  const selected = payload.level === selectedLevel;
  const after = series === "after";
  return (
    <circle
      data-testid="impact-chart-point"
      data-series={series}
      data-level={payload.level}
      data-value={String(payload[series])}
      data-selected={selected ? "true" : undefined}
      cx={cx}
      cy={cy}
      r={selected ? 5 : 2}
      fill={after ? AFTER_COLOR : SURFACE_COLOR}
      stroke={after ? SURFACE_COLOR : BEFORE_COLOR}
      strokeWidth={selected ? 2 : 1.25}
    />
  );
};

type TooltipProps = { active?: boolean; payload?: ReadonlyArray<{ payload?: ImpactChartPoint }> };

/** Hover / tap readout. Values are PH2's, formatted with the same helpers as the Explore readout. */
export const ImpactChartTooltip = ({ active, payload }: TooltipProps) => {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div
      data-testid="impact-chart-tooltip"
      className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-md"
    >
      <p className="font-medium text-foreground">Level {point.level}</p>
      <p className="font-mono tabular-nums text-muted-foreground">Before: {formatStatValue(point.before)}</p>
      <p className="font-mono tabular-nums text-muted-foreground">After: {formatStatValue(point.after)}</p>
      <p className="font-mono tabular-nums text-muted-foreground">
        Delta: {formatDelta(point.absDelta, "flat", "projected")}
      </p>
    </div>
  );
};

export type PatchImpactLevelChartProps = {
  model: ImpactChartModel;
  /** The Explore scrubber's level; this chart only draws it. */
  level: number;
  /** A click or tap on the plot. The parent (Explore) clamps and owns the state. */
  onLevelChange: (level: number) => void;
};

export default function PatchImpactLevelChart({ model, level, onLevelChange }: PatchImpactLevelChartProps) {
  const [ref, width] = useElementWidth();
  const height = width >= ROOMY_FROM_WIDTH ? ROOMY_HEIGHT : COMPACT_HEIGHT;
  const firstLevel = model.points[0].level;
  const lastLevel = model.points[model.points.length - 1].level;
  const crossoverSide = model.crossoverLevel !== null && model.crossoverLevel > (firstLevel + lastLevel) / 2;

  return (
    <div
      ref={ref}
      data-testid="patch-impact-graph-canvas"
      style={{ height }}
      className="w-full min-w-0 max-w-full overflow-hidden text-[10px] [&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none"
    >
      {width > 0 && (
        <LineChart
          width={width}
          height={height}
          data={model.points as ImpactChartPoint[]}
          margin={{ top: 14, right: 8, bottom: 2, left: 0 }}
          onClick={(state) => {
            const picked = state?.activePayload?.[0]?.payload as ImpactChartPoint | undefined;
            if (picked) onLevelChange(picked.level);
          }}
        >
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.25} />
          <XAxis
            dataKey="level"
            type="number"
            domain={[firstLevel, lastLevel]}
            ticks={[...model.xTicks]}
            allowDecimals={false}
            padding={{ left: 8, right: 8 }}
            tickLine={false}
            stroke="hsl(var(--border))"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis
            type="number"
            domain={[...model.y.domain]}
            ticks={[...model.y.ticks]}
            width={36}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatStatValue}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          />
          <Tooltip
            content={<ImpactChartTooltip />}
            isAnimationActive={false}
            cursor={{ stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.4, strokeDasharray: "2 3" }}
          />
          {model.crossoverLevel !== null && (
            <ReferenceLine
              className="impact-chart-crossover"
              x={model.crossoverLevel}
              stroke="hsl(var(--muted-foreground))"
              strokeOpacity={0.7}
              strokeDasharray="1 3"
              label={{
                value: `crosses at ${model.crossoverLevel}`,
                position: crossoverSide ? "insideTopLeft" : "insideTopRight",
                fontSize: 10,
                fill: "hsl(var(--muted-foreground))",
              }}
            />
          )}
          <ReferenceLine
            className="impact-chart-selected"
            x={level}
            stroke={AFTER_COLOR}
            strokeOpacity={0.55}
            strokeWidth={1.5}
          />
          <Line
            dataKey="before"
            name="Before"
            type="linear"
            stroke={BEFORE_COLOR}
            strokeWidth={2}
            strokeDasharray="5 3"
            isAnimationActive={false}
            activeDot={false}
            dot={(props: { key?: string; cx?: number; cy?: number; payload?: ImpactChartPoint }) => (
              <LevelDot
                key={`before-${props.payload?.level}`}
                cx={props.cx}
                cy={props.cy}
                payload={props.payload}
                series="before"
                selectedLevel={level}
              />
            )}
          />
          <Line
            dataKey="after"
            name="After"
            type="linear"
            stroke={AFTER_COLOR}
            strokeWidth={2.5}
            isAnimationActive={false}
            activeDot={false}
            dot={(props: { key?: string; cx?: number; cy?: number; payload?: ImpactChartPoint }) => (
              <LevelDot
                key={`after-${props.payload?.level}`}
                cx={props.cx}
                cy={props.cy}
                payload={props.payload}
                series="after"
                selectedLevel={level}
              />
            )}
          />
        </LineChart>
      )}
    </div>
  );
}
