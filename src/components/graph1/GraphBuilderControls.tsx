/**
 * The graph builder's control surface.
 *
 * A reader chooses a FOCUS, what to COMPARE it against, and a METRIC. Family
 * ids never appear: "Champion → Teams that play it" is the wording, and
 * `champion-teams:kaisa:bans` is the key it happens to produce.
 *
 * Only valid combinations are offered — the counterpart menu is rebuilt from
 * the focus, and the metric menu from the combination and mode — so the UI
 * cannot compose a selection the backend has no family for. That is a
 * convenience, not an authority: the backend still refuses anything it will
 * not serve, and its refusal is the final word.
 */
import { useId } from "react";

import { Button } from "@/components/ui/button";
import {
  combinationsFor,
  metricsFor,
  type Graph1Combination,
  type Graph1CompareKind,
  type Graph1FocusKind,
  type Graph1MetricChoice,
  type Graph1Mode,
} from "@/graph1/builder";

const FOCUS_OPTIONS: { id: Graph1FocusKind; label: string }[] = [
  { id: "player", label: "Player" },
  { id: "team", label: "Team" },
  { id: "champion", label: "Champion" },
];

const SELECT =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface GraphBuilderControlsProps {
  focus: Graph1FocusKind;
  combination: Graph1Combination;
  mode: Graph1Mode;
  metric: Graph1MetricChoice;
  onFocus: (next: Graph1FocusKind) => void;
  onCompare: (next: Graph1CompareKind) => void;
  onMode: (next: Graph1Mode) => void;
  onMetric: (next: Graph1MetricChoice) => void;
}

export default function GraphBuilderControls({
  focus,
  combination,
  mode,
  metric,
  onFocus,
  onCompare,
  onMode,
  onMetric,
}: GraphBuilderControlsProps) {
  const compareId = useId();
  const compares = combinationsFor(focus);
  const metrics = metricsFor(combination, mode);
  const active = metrics.find((m) => m.id === metric) ?? metrics[0];

  return (
    <section aria-label="Graph" className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <span id="graph1-focus-label" className="block text-xs text-muted-foreground">
            Focus
          </span>
          <div
            role="group"
            aria-labelledby="graph1-focus-label"
            className="flex rounded-md border border-border p-0.5"
          >
            {FOCUS_OPTIONS.map((option) => (
              <Button
                key={option.id}
                type="button"
                size="sm"
                className="flex-1"
                variant={option.id === focus ? "secondary" : "ghost"}
                aria-pressed={option.id === focus}
                onClick={() => onFocus(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor={compareId} className="block text-xs text-muted-foreground">
            Compare
          </label>
          {/* Rebuilt from the focus, so an invalid pairing is never offered —
              there is no "Player → Teams" family and no way to ask for one. */}
          <select
            id={compareId}
            className={SELECT}
            value={combination.compare}
            onChange={(e) => onCompare(e.target.value as Graph1CompareKind)}
          >
            {compares.map((c) => (
              <option key={c.compare} value={c.compare}>
                {c.compareOption}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {combination.modes && (
          <div
            role="group"
            aria-label="Draft action"
            className="flex rounded-md border border-border p-0.5"
          >
            {combination.modes.map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={m === mode ? "secondary" : "ghost"}
                aria-pressed={m === mode}
                onClick={() => onMode(m)}
              >
                {m === "bans" ? "Bans" : "Picks"}
              </Button>
            ))}
          </div>
        )}

        <div role="group" aria-label="Metric" className="flex flex-wrap gap-1.5">
          {metrics.map((option) => (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant={option.id === metric ? "secondary" : "outline"}
              aria-pressed={option.id === metric}
              title={option.hint}
              onClick={() => onMetric(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {active.hint}
        {active.viz === "board" &&
          " A ratio rises and falls, so it is ranked rather than animated."}
      </p>
    </section>
  );
}
