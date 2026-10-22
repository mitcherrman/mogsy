import { describe, expect, it } from "vitest";

import type { ArenaNode } from "../contracts";
import { bracketSize, CARD_COMPACT, CARD_FULL, fitScale, generateBracket, layoutBracket, nextSlotOf, seedOrder } from "./layout";

const asNodes = (gen: ReturnType<typeof generateBracket>): ArenaNode[] =>
  gen.nodes.map((g) => ({
    node_id: g.node_id, round: g.round, position: g.position, section: "main", best_of: 1, status: "pending",
    slots: [{ source: g.slots[0], profile_id: null, wins: 0 }, { source: g.slots[1], profile_id: null, wins: 0 }],
    winner_profile_id: null, current_match_id: null, ready_deadline: null, games: [],
  }));

describe("bracket generation", () => {
  it("rounds up to the next power of two", () => {
    expect(bracketSize(2)).toBe(2);
    expect(bracketSize(5)).toBe(8);
    expect(bracketSize(16)).toBe(16);
    expect(bracketSize(17)).toBe(32);
  });

  it("keeps the top seeds apart until the final", () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
  });

  it.each([2, 4, 6, 8, 12, 16, 32])("builds a complete single-elimination tree for %i entrants", (n) => {
    const gen = generateBracket(n);
    const size = bracketSize(n);
    expect(gen.rounds).toBe(Math.log2(size));
    expect(gen.nodes).toHaveLength(size - 1);
    // Every node past round 1 is fed by exactly two winners of the round before.
    for (const node of gen.nodes.filter((x) => x.round > 1)) {
      for (const s of node.slots) {
        expect(s.kind).toBe("winner_of");
        const src = gen.nodes.find((x) => x.node_id === (s as { node_id: string }).node_id);
        expect(src?.round).toBe(node.round - 1);
      }
    }
    // Byes fill exactly the seats beyond the entrant count, against top seeds.
    const byes = gen.nodes.flatMap((x) => x.slots).filter((s) => s.kind === "bye");
    expect(byes).toHaveLength(size - n);
    const seeds = gen.nodes.flatMap((x) => x.slots).filter((s) => s.kind === "seed").map((s) => (s as { seed: number }).seed).sort((a, b) => a - b);
    expect(seeds).toEqual(Array.from({ length: n }, (_, i) => i + 1));
  });

  it("gives byes to the top seeds for a 6-player field", () => {
    const gen = generateBracket(6);
    const r1 = gen.nodes.filter((x) => x.round === 1);
    const seedWithBye = r1.filter((x) => x.slots.some((s) => s.kind === "bye")).map((x) => x.slots.find((s) => s.kind === "seed") as { seed: number });
    expect(seedWithBye.map((s) => s.seed).sort()).toEqual([1, 2]);
  });
});

describe("pure layout", () => {
  it("places every round in its own column and centres cards on the pair they follow", () => {
    const gen = generateBracket(8);
    const plane = layoutBracket({ rounds: gen.rounds, nodes: asNodes(gen) }, CARD_FULL);
    const unit = CARD_FULL.height + CARD_FULL.rowGap;
    expect(plane.rounds).toBe(3);
    expect(plane.width).toBe(3 * CARD_FULL.width + 2 * CARD_FULL.columnGap);
    expect(plane.height).toBe(4 * unit - CARD_FULL.rowGap);
    const sf1 = plane.byId.get("r2n1")!;
    const qf1 = plane.byId.get("r1n1")!;
    const qf2 = plane.byId.get("r1n2")!;
    expect(sf1.x).toBe(CARD_FULL.width + CARD_FULL.columnGap);
    expect(sf1.y + sf1.height / 2).toBeCloseTo((qf1.y + qf2.y + qf2.height) / 2, 5);
  });

  it("derives one connector per winner_of slot, from the source's right edge to the target slot row", () => {
    const gen = generateBracket(4);
    const nodes = asNodes(gen);
    const plane = layoutBracket({ rounds: gen.rounds, nodes }, CARD_COMPACT);
    expect(plane.edges).toHaveLength(2);
    const e = plane.edges.find((x) => x.from === "r1n1")!;
    const from = plane.byId.get("r1n1")!;
    const to = plane.byId.get("r2n1")!;
    expect(e.to).toBe("r2n1");
    expect(e.slot).toBe(0);
    expect(e.d.startsWith(`M${from.x + from.width} ${from.y + from.height / 2}`)).toBe(true);
    expect(e.d.endsWith(`H${to.x}`)).toBe(true);
    expect(e.d).toContain(`V${to.y + to.height * CARD_COMPACT.slotCentres[0]}`);
    expect(e.length).toBeGreaterThan(0);
  });

  it("is deterministic: the same bracket lays out to the same paths", () => {
    const gen = generateBracket(16);
    const bracket = { rounds: gen.rounds, nodes: asNodes(gen) };
    expect(layoutBracket(bracket, CARD_FULL).edges.map((e) => e.d)).toEqual(layoutBracket(bracket, CARD_FULL).edges.map((e) => e.d));
  });

  it("finds the slot a winner advances into", () => {
    const nodes = asNodes(generateBracket(8));
    expect(nextSlotOf("r1n4", nodes)).toMatchObject({ slot: 1 });
    expect(nextSlotOf("r1n4", nodes)?.node.node_id).toBe("r2n2");
    expect(nextSlotOf("r3n1", nodes)).toBeNull();
  });

  it("fits a plane into a box, capped at 1 and floored at the minimum", () => {
    const plane = { width: 1000, height: 500 };
    expect(fitScale(plane, 2000, 2000)).toBe(1);
    expect(fitScale(plane, 500, 500)).toBe(0.5);
    expect(fitScale(plane, 100, 100, 0.4)).toBe(0.4);
    expect(fitScale(plane, 0, 0)).toBe(1);
  });
});
