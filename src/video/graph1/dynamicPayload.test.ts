/**
 * Remotion regression for Phase 3A.
 *
 * Scope is deliberately narrow: prove the ONE generic composition still accepts a
 * dynamic family payload, so no per-entity composition is ever needed. Phase 3A
 * does not extend Remotion (filters and display toggles remain unexportable —
 * a pre-existing gap, tracked separately).
 */
import { describe, expect, it } from "vitest";

import { assertDataset } from "@/graph1/contract";
import { makeDataset, type EventSpec } from "@/graph1/testFixtures";

import { GRAPH1_FPS, raceVideoTimingForDataset } from "./timing";

const SPEC: EventSpec[] = [
  ["champion:Azir", "2020-01-01T10:00:00Z", 1, { gameId: "G0" }],
  ["champion:Orianna", "2021-01-02T10:00:00Z", 0, { gameId: "G1" }],
  ["champion:Azir", "2022-03-04T10:00:00Z", 1, { gameId: "G2" }],
];

/** A payload as the dynamic families now emit it: the id is `<family>:<entity>@<scope>`. */
function dynamicPayload(key: string) {
  const ds = makeDataset(SPEC);
  ds.id = `${key}@all-pro`;
  ds.definition.title = `${key} race`;
  return ds;
}

describe("Remotion accepts dynamic family payloads", () => {
  it.each([
    "player-champions:Faker",
    "player-champions:Hans Sama",
    "champion-players:azir",
    "champion-players:lee-sin",
  ])("computes timing for %s with no per-entity handling", (key) => {
    const dataset = assertDataset(dynamicPayload(key));
    const timing = raceVideoTimingForDataset({ dataset }, GRAPH1_FPS);
    expect(timing.totalFrames).toBeGreaterThan(0);
    expect(Number.isInteger(timing.totalFrames)).toBe(true);
  });

  it("keeps the id parseable as <key>@<scope> so the key survives a round trip", () => {
    for (const key of ["player-champions:Faker", "champion-players:kaisa"]) {
      const dataset = dynamicPayload(key);
      expect(dataset.id.split("@")[0]).toBe(key);
      // exactly one '@' — a second one would break the split
      expect(dataset.id.match(/@/g)).toHaveLength(1);
    }
  });

  it("derives the same output stem for a dynamic id as the render CLI would", () => {
    // scripts/render-graph1-video.ts: graph1-${id.replace(/[^a-zA-Z0-9_-]+/g,"-")}
    const stem = `graph1-${dynamicPayload("champion-players:lee-sin").id.replace(
      /[^a-zA-Z0-9_-]+/g,
      "-",
    )}`;
    expect(stem).toBe("graph1-champion-players-lee-sin-all-pro");
  });

  it("produces identical timing for two builds of the same dynamic payload", () => {
    const build = () =>
      raceVideoTimingForDataset(
        { dataset: assertDataset(dynamicPayload("champion-players:azir")) },
        GRAPH1_FPS,
      );
    const a = build();
    const b = build();
    expect(a).toEqual(b);
  });
});
