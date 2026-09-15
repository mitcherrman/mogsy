/**
 * RL2 — slide 2: where the answers went. A true part-to-whole.
 *
 * EVERY SLICE IS A COUNT. The arcs are attempt counts and they sum to the
 * figure printed in the hole, so the geometry and the number agree by
 * construction. Accuracy percentages are deliberately impossible to pass here:
 * the input type carries `attempts` and nothing else, because a ring of
 * unrelated rates is the exact misuse this slide was scoped away from.
 *
 * The ring is drawn in one ink at descending strength rather than in a
 * categorical palette: five arbitrary hues on parchment read as a different
 * product, and the ORDER (largest first) is the information.
 */
import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LEAGUECRAFT_INK as INK } from "@/components/quiz/leaguecraft-ink";
import { sliceTotal, type DistributionSlice } from "./analyticsSlices";

/** Beyond this the arcs are thinner than their own stroke. The remainder is
 *  folded into one honest "Other" slice — dropped slices would break the
 *  part-to-whole the centre figure asserts. */
const MAX_ARCS = 5;

/** Descending strength of the same brass, then the accent for "Other". */
const SHADES = [1, 0.78, 0.58, 0.42, 0.3];

export default function DistributionDonut({ slices }: { slices: readonly DistributionSlice[] }) {
  const total = sliceTotal(slices);
  const head = slices.slice(0, MAX_ARCS);
  const tail = slices.slice(MAX_ARCS);
  const rows = tail.length
    ? [...head, { key: "__other", label: "Other", attempts: sliceTotal(tail), selected: false }]
    : [...head];

  return (
    <div className="relative h-full w-full" data-testid="lobby-distribution-donut">
      <ChartContainer
        config={{ attempts: { label: "Answers" } }}
        className="aspect-auto h-full w-full"
      >
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideIndicator
                formatter={(value, name) => (
                  <span className="tabular-nums">
                    {name}: {value} answer{value === 1 ? "" : "s"}
                  </span>
                )}
              />
            }
          />
          <Pie
            data={rows as { key: string; label: string; attempts: number }[]}
            dataKey="attempts"
            nameKey="label"
            innerRadius="58%"
            outerRadius="88%"
            paddingAngle={1.5}
            stroke="none"
            isAnimationActive={false}
          >
            {rows.map((row, i) => (
              <Cell
                key={row.key}
                fill={row.key === "__other" ? INK.faint : row.selected ? INK.accent : INK.brass}
                fillOpacity={row.key === "__other" ? 0.5 : SHADES[i] ?? 0.3}
              />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>

      {/* The whole, in the hole. Summed from the arcs actually drawn. */}
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        aria-hidden="true"
      >
        <div
          className="text-lg font-extrabold leading-none tabular-nums"
          style={{ color: INK.strong, textShadow: INK.press }}
          data-testid="lobby-distribution-total"
        >
          {total}
        </div>
        <div className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: INK.brass }}>
          answers
        </div>
      </div>
    </div>
  );
}
