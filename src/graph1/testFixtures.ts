/** Synthetic VisualizationDataset factories for GRAPH1 tests (test-only). */
import type {
  Graph1EntityPresentation,
  Graph1EventContext,
  VisualizationDataset,
} from "./contract";

export type EventSpec =
  | [string, string]
  | [string, string, 0 | 1]
  | [string, string, 0 | 1, Graph1EventContext];

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
 * [rankedEntityId, occurredAt, winsDelta?, context?] applied in order with
 * delta 1. winsDelta defaults to 1.
 */
export function makeDataset(
  spec: EventSpec[],
  entityOverrides: Record<string, Partial<Graph1EntityPresentation>> = {},
): VisualizationDataset {
  const entities: Record<string, Graph1EntityPresentation> = {};
  for (const [id] of spec) {
    if (!entities[id]) entities[id] = makeEntity(id, entityOverrides[id]);
  }
  const events = spec.map((item, sequence) => {
    const [rankedEntityId, occurredAt, winsDelta, context] = item;
    return {
      sequence,
      occurredAt,
      rankedEntityId,
      delta: 1,
      winsDelta: (winsDelta ?? 1) as 0 | 1,
      context: context ?? { gameId: `G_${sequence}_1` },
    };
  });
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

/**
 * A stat-growth (level progression) dataset in the exact shape the Phase 4A
 * backend builder emits: per (level, champion) events ordered level-ascending
 * then entity-id lexical, integer display-unit deltas
 * (round(value*scale) diffs), no winsDelta, a `level` context key, and a
 * `definition.progression` step map.
 *
 * `championUnits[championName]` is the champion's display-unit value at each
 * level, index 0 == level 1.
 */
export function makeStatGrowthDataset(
  championUnits: Record<string, number[]>,
  options: { msPerStep?: number; scale?: number; decimals?: number } = {},
): VisualizationDataset {
  const names = Object.keys(championUnits).sort();
  const levelCount = championUnits[names[0]].length;
  const scale = options.scale ?? 100;
  const entities: Record<string, Graph1EntityPresentation> = {
    "stat:attack-damage": makeEntity("stat:attack-damage", {
      type: "stat",
      displayName: "Attack Damage",
      media: { kind: "neutral", value: "AD" },
    }),
  };
  for (const name of names) {
    entities[`champion:${name}`] = makeEntity(`champion:${name}`, {
      type: "champion",
      displayName: name,
    });
  }
  const events = [];
  let sequence = 0;
  for (let level = 1; level <= levelCount; level++) {
    for (const name of names) {
      const units = championUnits[name];
      const delta = units[level - 1] - (level > 1 ? units[level - 2] : 0);
      events.push({
        sequence,
        occurredAt: `${String(level).padStart(4, "0")}-01-01T00:00:00Z`,
        rankedEntityId: `champion:${name}`,
        delta,
        context: { level },
      });
      sequence += 1;
    }
  }
  return {
    schemaVersion: 1,
    id: "champion-stat-growth:attack-damage@base-stats",
    visualizationType: "ranked-race",
    definition: {
      title: "Champion stat growth — Attack Damage by level",
      focusEntity: { type: "stat", id: "stat:attack-damage" },
      rankedEntityType: "champion",
      metric: {
        id: "champion_stat_value",
        label: "Attack Damage",
        unit: "AD",
        accumulation: "sum",
        valueDisplay: { scale, decimals: options.decimals ?? 1 },
      },
      scope: { id: "base-stats", label: "Base stats" },
      progression: {
        kind: "level",
        unitLabel: "Level",
        stepLabels: Array.from(
          { length: levelCount },
          (_, i) => `Level ${i + 1}`,
        ),
        stepEventCounts: Array.from({ length: levelCount }, () => names.length),
        ...(options.msPerStep !== undefined
          ? { msPerStep: options.msPerStep }
          : {}),
      },
      display: {
        contextMode: "event-header",
        showSecondaryEntityLabel: false,
        defaultToggles: {
          winOverlay: false,
          contextLine: false,
          dateLabel: false,
          secondaryLabel: false,
        },
      },
    },
    entities,
    events,
    coverage: {
      source: "test champion_stats",
      generatedAt: "2026-01-01T00:00:00Z",
      firstEventAt: events[0]?.occurredAt ?? null,
      lastEventAt: events[events.length - 1]?.occurredAt ?? null,
      eligibleEventCount: events.length,
      excludedEventCount: 0,
      distinctRankedEntityCount: names.length,
      warnings: [],
    },
  };
}
