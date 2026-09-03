/**
 * The "Wins" race — a pure, client-side view of an existing race payload.
 *
 * The backend declares BOTH count metrics on every race it serves
 * (`controls.metrics` = cumulative_games + cumulative_wins) and ships one
 * payload for the pair, because the wins race is already fully determined by
 * the games race: every event carries `winsDelta`, so cumulative wins is the
 * count of the events where it is 1. Switching metric is therefore a filter,
 * not a request.
 *
 * This reuses the SAME path a scope filter used to: events in, events out,
 * then buildRaceIndex / the engine / RaceRenderer / Remotion, all untouched.
 * There is still one engine and one renderer.
 *
 * Pure: no clock, no mutation. Equal input always yields an identical dataset,
 * so a frame is still reproducible from a URL.
 */
import type { Graph1MetricSpec, VisualizationDataset } from "./contract";

/** The wins metric this payload declares, if it declares one. */
export function declaredWinsMetric(
  dataset: VisualizationDataset,
): Graph1MetricSpec | undefined {
  return dataset.definition.controls?.metrics?.find(
    (m) => m.id === "cumulative_wins",
  );
}

/**
 * True when a wins race can honestly be drawn from this payload.
 *
 * Both halves matter. A payload that declares no wins metric predates the
 * control (or is a ban race, where a win is undefined), and a payload whose
 * events carry no `winsDelta` predates schema 1.1 — in either case the right
 * answer is to not offer the metric, never to render zeroes.
 */
export function supportsWinsRace(dataset: VisualizationDataset): boolean {
  return (
    declaredWinsMetric(dataset) !== undefined &&
    dataset.events.some((e) => e.winsDelta !== undefined)
  );
}

/**
 * The same race ranked by cumulative wins.
 *
 * Keeps every event whose `winsDelta` is 1 and relabels the metric with the
 * spec the backend declared — so the axis says "Professional wins" because the
 * backend called it that, not because this file guessed.
 *
 * Filtered events keep their ORIGINAL `sequence` values, which become
 * non-contiguous. That is the established convention here: `buildRaceIndex`
 * walks array order and never reads `sequence`, and the original value keeps
 * provenance back to the full race.
 */
export function winsRaceDataset(
  dataset: VisualizationDataset,
): VisualizationDataset {
  const metric = declaredWinsMetric(dataset);
  if (!metric) return dataset;
  const events = dataset.events.filter((e) => e.winsDelta === 1);
  const rankedEntityIds = new Set(events.map((e) => e.rankedEntityId));
  return {
    ...dataset,
    // A distinct id so React Query keys, `key=` remounts and the Remotion
    // export all treat the two metrics as the two datasets they are.
    id: `${dataset.id}#wins`,
    definition: {
      ...dataset.definition,
      metric: {
        id: metric.id,
        label: metric.label,
        unit: metric.unit,
        accumulation: "sum",
      },
    },
    events,
    coverage: {
      ...dataset.coverage,
      eligibleEventCount: events.length,
      distinctRankedEntityCount: rankedEntityIds.size,
      firstEventAt: events.length ? events[0].occurredAt : dataset.coverage.firstEventAt,
      lastEventAt: events.length
        ? events[events.length - 1].occurredAt
        : dataset.coverage.lastEventAt,
    },
  };
}
