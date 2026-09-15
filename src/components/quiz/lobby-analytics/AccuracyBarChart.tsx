/**
 * RL2 — slide 1: accuracy across the chosen dimension, on an axis.
 *
 * HORIZONTAL BARS, because the labels are category names and the box is a
 * third of the lobby wide: vertical bars would have to rotate or truncate
 * every label, and the comparison this slide exists for is between LABELS.
 *
 * Accuracy is the only thing drawn against a scale anywhere in this pass, and
 * it is drawn here, with a 0-100 axis that is always the full range. A bar
 * chart whose axis starts at the lowest value exaggerates every difference on
 * it; on a 4-row chart that is the whole reading.
 *
 * It draws in the parchment's own ink rather than a chart library's palette —
 * `recharts` is used for the geometry, `LEAGUECRAFT_INK` for every colour.
 */
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LEAGUECRAFT_INK as INK } from "@/components/quiz/leaguecraft-ink";
import type { AccuracyBar } from "./analyticsSlices";

/** At most this many rows fit the reserved box legibly. The rest are the
 *  weakest and are cut, never squeezed — a 2px bar is not a reading. */
const MAX_ROWS = 6;

export default function AccuracyBarChart({ bars }: { bars: readonly AccuracyBar[] }) {
  const rows = bars.slice(0, MAX_ROWS).map((b) => ({
    key: b.key,
    label: b.label.length > 14 ? `${b.label.slice(0, 13)}…` : b.label,
    accuracy: Math.round(b.accuracy),
    attempts: b.attempts,
    selected: b.selected,
    lowSample: b.lowSample,
  }));

  return (
    <ChartContainer
      config={{ accuracy: { label: "Accuracy" } }}
      className="aspect-auto h-full w-full"
      data-testid="lobby-accuracy-bars"
    >
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 2, right: 30, bottom: 2, left: 2 }}
        barCategoryGap="22%"
      >
        {/* Always 0-100. See the header. */}
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis
          type="category"
          dataKey="label"
          /* EVERY row keeps its name. Recharts thins category ticks when the
             axis is short, and in the 210px mobile box that silently dropped
             three of six labels while all six value labels stayed — six
             anonymous bars with percentages on them. */
          interval={0}
          width={78}
          tickLine={false}
          axisLine={false}
          tick={{ fill: INK.body, fontSize: 10, fontWeight: 600 }}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(value, _name, item) => (
                <span className="tabular-nums">
                  {value}% of {(item?.payload as { attempts?: number })?.attempts ?? 0} answers
                </span>
              )}
            />
          }
        />
        <Bar dataKey="accuracy" radius={[2, 2, 2, 2]} isAnimationActive={false}>
          {rows.map((row) => (
            <Cell
              key={row.key}
              /* A low-sample row keeps its TRUE score and is drawn lighter, so
                 the eye weighs it less without the figure being altered. */
              fill={row.selected ? INK.accent : row.lowSample ? INK.faint : INK.brass}
              fillOpacity={row.lowSample ? 0.55 : 1}
            />
          ))}
          <LabelList
            dataKey="accuracy"
            position="right"
            offset={5}
            formatter={(v: number) => `${v}%`}
            style={{ fill: INK.strong, fontSize: 10, fontWeight: 700 }}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
