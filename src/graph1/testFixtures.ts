/** Synthetic VisualizationDataset factories for GRAPH1 tests (test-only). */
import type {
  Graph1EntityPresentation,
  VisualizationDataset,
} from "./contract";

export function makeEntity(
  id: string,
  overrides: Partial<Graph1EntityPresentation> = {},
): Graph1EntityPresentation {
  return {
    id,
    type: "player",
    displayName: id.split(":").pop() || id,
    identityStatus: "canonical",
    media: { kind: "initials", value: id.slice(-2).toUpperCase() },
    ...overrides,
  };
}

/**
 * Build a dataset from a compact spec: each item is
 * [rankedEntityId, occurredAt] applied in order with delta 1.
 */
export function makeDataset(
  spec: Array<[string, string]>,
  entityOverrides: Record<string, Partial<Graph1EntityPresentation>> = {},
): VisualizationDataset {
  const entities: Record<string, Graph1EntityPresentation> = {};
  for (const [id] of spec) {
    if (!entities[id]) entities[id] = makeEntity(id, entityOverrides[id]);
  }
  const events = spec.map(([rankedEntityId, occurredAt], sequence) => ({
    sequence,
    occurredAt,
    rankedEntityId,
    delta: 1,
    context: { gameId: `G_${sequence}_1` },
  }));
  return {
    schemaVersion: 1,
    id: "test@all-pro",
    visualizationType: "ranked-race",
    definition: {
      title: "Test race",
      focusEntity: { type: "player", id: spec[0][0] },
      rankedEntityType: "player",
      metric: {
        id: "cumulative_games",
        label: "games",
        unit: "games",
        accumulation: "sum",
      },
      scope: { id: "all-pro", label: "all" },
    },
    entities,
    events,
    coverage: {
      source: "test",
      generatedAt: spec[spec.length - 1][1],
      firstEventAt: spec[0][1],
      lastEventAt: spec[spec.length - 1][1],
      eligibleEventCount: events.length,
      excludedEventCount: 0,
      distinctRankedEntityCount: Object.keys(entities).length,
      warnings: [],
    },
  };
}

/** n events across two years for cadence tests: A,B,A,B,… */
export function alternatingDataset(n: number): VisualizationDataset {
  const spec: Array<[string, string]> = [];
  for (let i = 0; i < n; i++) {
    const year = i < n / 2 ? 2015 : 2016;
    spec.push([
      i % 2 === 0 ? "player:A" : "player:B",
      `${year}-01-0${(i % 9) + 1}T10:00:00Z`,
    ]);
  }
  return makeDataset(spec);
}
