/**
 * Tiny synthetic race for Remotion Studio's default preview of the
 * Graph1Race composition. Real renders always pass a backend-built
 * VisualizationDataset via --props (scripts/render-graph1-video.ts);
 * this exists only so the studio opens to something meaningful without
 * a payload on disk. Initials media only — no asset fetches.
 */
import type {
  Graph1Event,
  Graph1EntityPresentation,
  VisualizationDataset,
} from "../../graph1/contract";

const PLAYERS = ["Alpha", "Blaze", "Cosmo", "Drift", "Ember"] as const;

// Fixed literal schedule (entity index, year, month, day, win) — data, not
// generated at module load, so the sample is byte-stable.
const SCHEDULE: Array<[number, number, number, number, 0 | 1]> = [
  [0, 2020, 1, 4, 1], [1, 2020, 1, 9, 0], [0, 2020, 2, 2, 1],
  [2, 2020, 2, 20, 1], [1, 2020, 3, 5, 1], [0, 2020, 4, 11, 0],
  [3, 2020, 5, 3, 1], [2, 2020, 6, 14, 0], [1, 2020, 7, 21, 1],
  [0, 2020, 9, 8, 1], [4, 2021, 1, 16, 1], [2, 2021, 2, 6, 1],
  [3, 2021, 3, 12, 0], [1, 2021, 4, 2, 1], [4, 2021, 5, 27, 1],
  [2, 2021, 6, 18, 1], [0, 2021, 8, 9, 0], [4, 2021, 9, 25, 1],
  [3, 2022, 1, 7, 1], [4, 2022, 2, 11, 1], [2, 2022, 3, 3, 0],
  [4, 2022, 4, 19, 1], [1, 2022, 5, 30, 0], [4, 2022, 7, 6, 1],
];

const entities: Record<string, Graph1EntityPresentation> = {};
for (const name of PLAYERS) {
  const id = `player:${name}`;
  entities[id] = {
    id,
    type: "player",
    displayName: name,
    identityStatus: "canonical",
    media: { kind: "initials", value: name.slice(0, 2).toUpperCase() },
  };
}

const events: Graph1Event[] = SCHEDULE.map(([p, y, m, d, win], sequence) => ({
  sequence,
  occurredAt: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T12:00:00Z`,
  rankedEntityId: `player:${PLAYERS[p]}`,
  delta: 1,
  winsDelta: win,
  context: {
    gameId: `SAMPLE_${sequence}`,
    team: "Team A",
    opponent: "Team B",
    tournament: "Sample Cup",
    region: "Sample",
  },
}));

export const SAMPLE_RACE_DATASET: VisualizationDataset = {
  schemaVersion: 1,
  id: "sample@all-pro",
  visualizationType: "ranked-race",
  definition: {
    title: "Sample — players by games",
    focusEntity: { type: "player", id: "player:Alpha" },
    rankedEntityType: "player",
    metric: {
      id: "cumulative_games",
      label: "Games",
      unit: "games",
      accumulation: "sum",
    },
    scope: { id: "all-pro", label: "All professional play" },
    display: { contextMode: "event-header", showSecondaryEntityLabel: false },
  },
  entities,
  events,
  coverage: {
    source: "sample",
    generatedAt: events[events.length - 1].occurredAt,
    firstEventAt: events[0].occurredAt,
    lastEventAt: events[events.length - 1].occurredAt,
    eligibleEventCount: events.length,
    excludedEventCount: 0,
    distinctRankedEntityCount: PLAYERS.length,
    warnings: [],
  },
};
