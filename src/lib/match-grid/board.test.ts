import { describe, expect, it } from "vitest";
import type { MatchPublic, MatchSeat } from "./contract";
import {
  assertMatchContent, firstFreeSeat, isBoardComplete, membersOf, normalizeValue, seatEntity, settleReveal,
  snapToGroup, toMatchResponse, unseatEntity, unsortedCount,
} from "./board";

const content: MatchPublic = {
  prompt: "Seat each sigil in its discipline.",
  entityNoun: "sigil",
  groupNoun: "discipline",
  membership: "one",
  groups: [{ token: "g-a", label: "Alpha" }, { token: "g-b", label: "Beta" }, { token: "g-c", label: "Gamma" }],
  entities: [
    { token: "e-1", label: "One" }, { token: "e-2", label: "Two" }, { token: "e-3", label: "Three" }, { token: "e-4", label: "Four" },
  ],
};

describe("assertMatchContent", () => {
  it("accepts a well-formed board", () => {
    expect(() => assertMatchContent(content)).not.toThrow();
  });
  it("refuses the reserved many-valued membership rather than falsify it", () => {
    expect(() => assertMatchContent({ ...content, membership: "many" })).toThrow(/reserved/);
  });
  it("refuses duplicate tokens across entities and groups", () => {
    expect(() => assertMatchContent({ ...content, entities: [...content.entities, { token: "g-a", label: "Clash" }] })).toThrow(/duplicate/);
  });
  it("refuses too few groups", () => {
    expect(() => assertMatchContent({ ...content, groups: content.groups.slice(0, 1) })).toThrow(/groups/);
  });
});

describe("seating", () => {
  it("seats into the first free seat and never reflows other members", () => {
    let v: Record<string, MatchSeat> = {};
    v = seatEntity(content, v, "e-1", "g-a").next;
    v = seatEntity(content, v, "e-2", "g-a").next;
    v = seatEntity(content, v, "e-3", "g-a").next;
    expect(membersOf(v, "g-a").map((m) => [m.token, m.seat])).toEqual([["e-1", 0], ["e-2", 1], ["e-3", 2]]);
    v = unseatEntity(v, "e-2").next;
    // e-3 keeps seat 2; the freed seat 1 is what the next arrival takes.
    expect(v["e-3"]).toEqual({ group: "g-a", seat: 2 });
    expect(firstFreeSeat(v, "g-a")).toBe(1);
    v = seatEntity(content, v, "e-4", "g-a").next;
    expect(v["e-4"]).toEqual({ group: "g-a", seat: 1 });
  });

  it("moving between groups frees the old seat and reports the previous group", () => {
    let v = seatEntity(content, {}, "e-1", "g-a").next;
    const out = seatEntity(content, v, "e-1", "g-b");
    expect(out.kind).toBe("moved");
    if (out.kind === "moved") expect(out.previous).toBe("g-a");
    v = out.next;
    expect(membersOf(v, "g-a")).toEqual([]);
    expect(v["e-1"]).toEqual({ group: "g-b", seat: 0 });
  });

  it("re-seating in the same group is a no-op", () => {
    const v = seatEntity(content, {}, "e-1", "g-a").next;
    expect(seatEntity(content, v, "e-1", "g-a").kind).toBe("same");
  });

  it("an entity can never occupy two groups at once", () => {
    let v = seatEntity(content, {}, "e-1", "g-a").next;
    v = seatEntity(content, v, "e-1", "g-c").next;
    const homes = content.groups.filter((g) => membersOf(v, g.token).some((m) => m.token === "e-1"));
    expect(homes.map((g) => g.token)).toEqual(["g-c"]);
  });

  it("rejects unknown entities and groups", () => {
    expect(seatEntity(content, {}, "e-9", "g-a").kind).toBe("invalid");
    expect(seatEntity(content, {}, "e-1", "g-z").kind).toBe("invalid");
  });

  it("normalises a stale value: strangers dropped, stacked seats re-seated", () => {
    const v = normalizeValue(content, {
      "e-1": { group: "g-a", seat: 0 },
      "e-2": { group: "g-a", seat: 0 },
      "e-9": { group: "g-a", seat: 1 },
      "e-3": { group: "g-zzz", seat: 0 },
    });
    expect(v).toEqual({ "e-1": { group: "g-a", seat: 0 }, "e-2": { group: "g-a", seat: 1 } });
  });
});

describe("lock", () => {
  it("is complete only when every entity is seated, and strips seats from the response", () => {
    let v: Record<string, MatchSeat> = {};
    expect(isBoardComplete(content, v)).toBe(false);
    expect(unsortedCount(content, v)).toBe(4);
    expect(() => toMatchResponse(content, v)).toThrow(/every entity/);
    v = seatEntity(content, v, "e-1", "g-a").next;
    v = seatEntity(content, v, "e-2", "g-b").next;
    v = seatEntity(content, v, "e-3", "g-b").next;
    v = seatEntity(content, v, "e-4", "g-c").next;
    expect(isBoardComplete(content, v)).toBe(true);
    expect(toMatchResponse(content, v)).toEqual({
      assignments: [
        { entity: "e-1", group: "g-a" }, { entity: "e-2", group: "g-b" }, { entity: "e-3", group: "g-b" }, { entity: "e-4", group: "g-c" },
      ],
    });
  });
});

describe("snapToGroup", () => {
  const zones = [
    { left: 0, top: 0, right: 100, bottom: 100 },
    { left: 200, top: 0, right: 300, bottom: 100 },
  ];
  it("resolves a near miss to the nearest zone and a far drop to nothing", () => {
    expect(snapToGroup({ x: 150, y: 50 }, zones, { x: 40, y: 40 })).toBe(0);
    expect(snapToGroup({ x: 160, y: 50 }, zones, { x: 40, y: 40 })).toBe(1);
    expect(snapToGroup({ x: 330, y: 50 }, zones, { x: 40, y: 40 })).toBe(1);
    expect(snapToGroup({ x: 400, y: 50 }, zones, { x: 40, y: 40 })).toBeNull();
    expect(snapToGroup({ x: 50, y: 170 }, zones, { x: 40, y: 40 })).toBeNull();
  });
});

describe("settleReveal", () => {
  it("keeps correct seats, travels the wrong ones home, and never grades", () => {
    const locked: Record<string, MatchSeat> = {
      "e-1": { group: "g-a", seat: 0 },
      "e-2": { group: "g-a", seat: 1 },
      "e-3": { group: "g-b", seat: 0 },
      "e-4": { group: "g-c", seat: 0 },
    };
    // The authority says e-2 belongs to g-b and e-4 to g-b too; e-1 and e-3 are right.
    const { settled, travel } = settleReveal(content, locked, {
      entityCorrect: { "e-1": true, "e-2": false, "e-3": true, "e-4": false },
      canonical: { "e-1": ["g-a"], "e-2": ["g-b"], "e-3": ["g-b"], "e-4": ["g-b"] },
    });
    expect(settled["e-1"]).toEqual({ group: "g-a", seat: 0 });
    expect(settled["e-3"]).toEqual({ group: "g-b", seat: 0 });
    expect(settled["e-2"]).toEqual({ group: "g-b", seat: 1 });
    expect(settled["e-4"]).toEqual({ group: "g-b", seat: 2 });
    expect(travel).toEqual([
      { entity: "e-2", from: { group: "g-a", seat: 1 }, to: { group: "g-b", seat: 1 } },
      { entity: "e-4", from: { group: "g-c", seat: 0 }, to: { group: "g-b", seat: 2 } },
    ]);
  });

  it("trusts the grader's marks even when they disagree with canonical (display, never recomputation)", () => {
    const locked: Record<string, MatchSeat> = { "e-1": { group: "g-a", seat: 0 }, "e-2": { group: "g-a", seat: 1 } };
    const { settled, travel } = settleReveal({ ...content, entities: content.entities.slice(0, 2) }, locked, {
      entityCorrect: { "e-1": true, "e-2": true },
      canonical: { "e-1": ["g-b"], "e-2": ["g-b"] },
    });
    expect(travel).toEqual([]);
    expect(settled["e-1"].group).toBe("g-a");
  });
});
