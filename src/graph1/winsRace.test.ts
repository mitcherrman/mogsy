/**
 * The wins race is a pure view over the games race — same payload, same
 * engine, no request. These pin that it stays honest about what it can draw.
 */
import { describe, expect, it } from "vitest";

import { makeDataset, type EventSpec } from "./testFixtures";
import { supportsWinsRace, winsRaceDataset } from "./winsRace";

const WINS_METRIC = {
  id: "cumulative_wins" as const,
  label: "Professional wins",
  unit: "games",
  accumulation: "sum" as const,
};

const SPEC: EventSpec[] = [
  ["champion:azir", "2020-01-01T10:00:00Z", 1],
  ["champion:azir", "2020-01-02T10:00:00Z", 0],
  ["champion:ryze", "2020-01-03T10:00:00Z", 1],
  ["champion:ryze", "2020-01-04T10:00:00Z", 1],
];

function raceWithWinsControl() {
  const ds = makeDataset(SPEC);
  ds.definition.controls = {
    metrics: [
      { id: "cumulative_games", label: "Professional games", unit: "games",
        accumulation: "sum", default: true },
      WINS_METRIC,
    ],
    filters: [],
    topN: { default: 10, options: [5, 10] },
    speed: { default: 1, options: [1] },
  };
  return ds;
}

describe("supportsWinsRace", () => {
  it("accepts a payload that declares the metric and carries the deltas", () => {
    expect(supportsWinsRace(raceWithWinsControl())).toBe(true);
  });

  it("refuses a payload that declares no wins metric", () => {
    // A ban race is exactly this: a win with a banned champion is undefined,
    // so the backend declares no wins metric and none must be offered.
    const ds = makeDataset(SPEC);
    ds.definition.controls = {
      metrics: [
        { id: "cumulative_bans", label: "Professional bans", unit: "bans",
          accumulation: "sum", default: true },
      ],
      filters: [],
      topN: { default: 10, options: [5, 10] },
      speed: { default: 1, options: [1] },
    };
    expect(supportsWinsRace(ds)).toBe(false);
  });
});

describe("winsRaceDataset", () => {
  it("keeps only the won games, so the totals ARE cumulative wins", () => {
    const wins = winsRaceDataset(raceWithWinsControl());
    expect(wins.events).toHaveLength(3);
    expect(wins.events.every((e) => e.winsDelta === 1)).toBe(true);
    expect(wins.coverage.eligibleEventCount).toBe(3);
    expect(wins.coverage.distinctRankedEntityCount).toBe(2);
  });

  it("labels the axis with the backend's OWN wins metric, never a guess", () => {
    expect(winsRaceDataset(raceWithWinsControl()).definition.metric).toEqual(
      WINS_METRIC,
    );
  });

  it("takes a distinct id so the two metrics are two datasets", () => {
    const games = raceWithWinsControl();
    expect(winsRaceDataset(games).id).toBe(`${games.id}#wins`);
  });

  it("does not mutate the source race", () => {
    const games = raceWithWinsControl();
    const before = games.events.length;
    winsRaceDataset(games);
    expect(games.events).toHaveLength(before);
    expect(games.definition.metric.id).toBe("cumulative_games");
  });

  it("is a fixed point: equal input yields an identical dataset", () => {
    expect(winsRaceDataset(raceWithWinsControl())).toEqual(
      winsRaceDataset(raceWithWinsControl()),
    );
  });
});
