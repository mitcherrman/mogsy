import { describe, expect, it } from "vitest";

import { buildEventsFromCounts } from "./api";

describe("buildEventsFromCounts", () => {
  it("expands counts into ordered events melee -> caster -> cannon -> super", () => {
    const events = buildEventsFromCounts(
      { melee: 2, caster: 1, cannon: 1, super: 0 },
      1,
    );
    expect(events.map((event) => event.minion_type)).toEqual([
      "melee",
      "melee",
      "caster",
      "cannon",
    ]);
    expect(events.map((event) => event.event_id)).toEqual([
      "melee-1",
      "melee-2",
      "caster-1",
      "cannon-1",
    ]);
    expect(events.every((event) => event.recipient_count === 1)).toBe(true);
  });

  it("applies the recipient count to every event", () => {
    const events = buildEventsFromCounts(
      { melee: 1, caster: 1, cannon: 0, super: 0 },
      3,
    );
    expect(events.every((event) => event.recipient_count === 3)).toBe(true);
  });

  it("ignores negative and fractional counts", () => {
    const events = buildEventsFromCounts(
      { melee: -2, caster: 1.9, cannon: 0, super: 0 },
      1,
    );
    expect(events.map((event) => event.minion_type)).toEqual(["caster"]);
  });
});

import { buildBreakpointsBody } from "./api";

describe("buildBreakpointsBody", () => {
  const base = {
    patch: "26.15",
    startingLevel: 1,
    startingCumulativeXp: " 100 ",
    startWave: 1,
    waveCount: 3,
    recipientCount: 2,
    orderingStrategy: "melee_first",
    roundingStrategy: "exact",
    missedMinions: [{ wave_number: 2, minion_type: "melee" as const, count: 1 }],
    targetLevels: [3, 2, 3],
    superMinionsPerWave: 0,
  };

  it("serializes the API body with snake_case keys and trimmed XP string", () => {
    const body = buildBreakpointsBody(base);
    expect(body).toEqual({
      patch: "26.15",
      starting_level: 1,
      starting_cumulative_xp: "100",
      start_wave: 1,
      wave_count: 3,
      recipient_count: 2,
      ordering_strategy: "melee_first",
      rounding_strategy: "exact",
      missed_minions: [{ wave_number: 2, minion_type: "melee", count: 1 }],
      target_levels: [2, 3],
      super_minions_per_wave: 0,
    });
  });

  it("dedupes and sorts target levels and floors numeric inputs", () => {
    const body = buildBreakpointsBody({
      ...base,
      targetLevels: [5, 2.9, 5, 3],
      waveCount: 4.7,
      recipientCount: 2.2,
    });
    expect(body.target_levels).toEqual([2, 3, 5]);
    expect(body.wave_count).toBe(4);
    expect(body.recipient_count).toBe(2);
  });

  it("passes the decimal XP string through without float conversion", () => {
    const body = buildBreakpointsBody({
      ...base,
      startingCumulativeXp: "181.35",
    });
    expect(body.starting_cumulative_xp).toBe("181.35");
  });
});
