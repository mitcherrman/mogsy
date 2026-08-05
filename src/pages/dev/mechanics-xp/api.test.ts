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
