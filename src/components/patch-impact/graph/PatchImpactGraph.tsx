/**
 * The Patch Impact level graph (PH4-B): a before/after picture of PH2's
 * projection, inside Explore.
 *
 * This component is the eager shell. It maps the projection to a chart model,
 * draws the key and the text equivalent, and loads the recharts canvas lazily
 * so the Patch Report bundle does not grow. It renders nothing when the
 * projection cannot be plotted; there is no empty placeholder.
 *
 * Authority: it receives PH2's `StatProjection`. It does no stat math and
 * fetches nothing (a source-scan test and a network test enforce both).
 */
import { Component, Suspense, lazy, useMemo, type ReactNode } from "react";
import type { StatProjection } from "@/lib/patch-impact/types";
import { formatDelta, formatStatValue } from "../format";
import { buildImpactChartModel } from "./chart-model";

const PatchImpactLevelChart = lazy(() => import("./PatchImpactLevelChart"));

/** The graph is an annotation: if the chunk fails to load or the chart throws, Explore's text stays. */
class GraphBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Space reserved while the chart chunk loads, so opening Explore does not shift the page. */
const CanvasFallback = () => (
  <div aria-hidden data-testid="patch-impact-graph-loading" className="h-[176px] w-full rounded-md bg-muted/20 sm:h-[208px]" />
);

const KeySwatch = ({ series }: { series: "before" | "after" }) => (
  <svg aria-hidden width="26" height="10" viewBox="0 0 26 10" className="shrink-0">
    {series === "before" ? (
      <>
        <line x1="1" y1="5" x2="25" y2="5" stroke="hsl(var(--muted-foreground))" strokeWidth="2" strokeDasharray="5 3" />
        <circle cx="13" cy="5" r="3" fill="hsl(var(--background))" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" />
      </>
    ) : (
      <>
        <line x1="1" y1="5" x2="25" y2="5" stroke="#c9a84c" strokeWidth="2.5" />
        <circle cx="13" cy="5" r="3" fill="#c9a84c" stroke="hsl(var(--background))" strokeWidth="1.5" />
      </>
    )}
  </svg>
);

export const PatchImpactGraph = ({
  projection,
  level,
  onLevelChange,
}: {
  projection: StatProjection;
  /** The Explore scrubber's level (the single source of truth). */
  level: number;
  onLevelChange: (level: number) => void;
}) => {
  // Keyed on the projection only: moving the scrubber never rebuilds the chart data.
  const model = useMemo(() => buildImpactChartModel(projection), [projection]);
  if (!model) return null;

  const crossover = model.crossoverLevel;
  const title = `${model.statLabel.replace(/^./, (c) => c.toUpperCase())} by champion level, before and after`;

  return (
    <GraphBoundary>
      <figure data-testid="patch-impact-graph" data-level={level} className="m-0 min-w-0 max-w-[44rem] space-y-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <figcaption className="text-[11px] font-medium text-muted-foreground">{title}</figcaption>
          <ul aria-hidden data-testid="patch-impact-graph-key" className="flex gap-3 text-[11px] text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <KeySwatch series="before" />
              Before
            </li>
            <li className="flex items-center gap-1.5">
              <KeySwatch series="after" />
              After
            </li>
          </ul>
        </div>

        {/* The picture is decorative: the table below, the scrubber and the readout carry the same numbers. */}
        <div aria-hidden>
          <Suspense fallback={<CanvasFallback />}>
            <PatchImpactLevelChart model={model} level={level} onLevelChange={onLevelChange} />
          </Suspense>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Click or tap a level to select it.
          {!model.y.fromZero && (
            <span data-testid="patch-impact-graph-axis-note"> The vertical axis starts at {formatStatValue(model.y.domain[0])}, not 0.</span>
          )}
        </p>

        <table data-testid="patch-impact-graph-table" className="sr-only">
          <caption>{title}, levels 1 to 18</caption>
          <thead>
            <tr>
              <th scope="col">Level</th>
              <th scope="col">Before</th>
              <th scope="col">After</th>
              <th scope="col">Difference</th>
            </tr>
          </thead>
          <tbody>
            {model.points.map((point) => (
              <tr key={point.level} data-level={point.level} data-crossover={point.level === crossover ? "true" : undefined}>
                <th scope="row">
                  {point.level}
                  {point.level === crossover ? ", the difference changes sign here" : ""}
                </th>
                <td>{formatStatValue(point.before)}</td>
                <td>{formatStatValue(point.after)}</td>
                <td>{formatDelta(point.absDelta, "flat", "projected")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    </GraphBoundary>
  );
};
