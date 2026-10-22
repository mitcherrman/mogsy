import { describe, expect, it } from "vitest";

import { isArenaEvent, isArenaNode, isArenaSlotSource, nodeLabel, roundName, slotSourceLabel } from "./contracts";
import { lockEvent } from "./engine/advance";
import { draftEvent } from "./fixtures/scenarios";
import { fixtureArenaGateway } from "./gateway/fixtureArenaGateway";
import { httpArenaGateway } from "./gateway/httpArenaGateway";

describe("arena_event.v1 contract", () => {
  it("accepts every fixture event", () => {
    expect(isArenaEvent(draftEvent({ event_id: "a", title: "a", kind: "duel", entrants: 2, best_of: 1 }))).toBe(true);
    expect(isArenaEvent(lockEvent(draftEvent({ event_id: "a", title: "a", kind: "tournament", entrants: 8, best_of: 3 })))).toBe(true);
  });

  it("refuses an auth user id anywhere on the wire", () => {
    const ev = draftEvent({ event_id: "a", title: "a", kind: "duel", entrants: 2, best_of: 1 });
    expect(isArenaEvent({ ...ev, user_id: "x" })).toBe(false);
    expect(isArenaEvent({ ...ev, entrants: [{ ...ev.entrants[0], user_id: "x" }] })).toBe(false);
  });

  it("refuses the wrong version, kind, status or series length", () => {
    const ev = draftEvent({ event_id: "a", title: "a", kind: "duel", entrants: 2, best_of: 1 });
    expect(isArenaEvent({ ...ev, contract_version: "arena_event.v2" })).toBe(false);
    expect(isArenaEvent({ ...ev, kind: "team" })).toBe(false);
    expect(isArenaEvent({ ...ev, status: "paused" })).toBe(false);
    expect(isArenaEvent({ ...ev, best_of: 7 })).toBe(false);
    expect(isArenaEvent(null)).toBe(false);
  });

  it("validates slot sources and nodes", () => {
    expect(isArenaSlotSource({ kind: "seed", seed: 3 })).toBe(true);
    expect(isArenaSlotSource({ kind: "winner_of", node_id: "r1n1" })).toBe(true);
    expect(isArenaSlotSource({ kind: "bye" })).toBe(true);
    expect(isArenaSlotSource({ kind: "winner_of" })).toBe(false);
    expect(isArenaSlotSource({ kind: "projected", name: "Faker" })).toBe(false);
    const ev = lockEvent(draftEvent({ event_id: "a", title: "a", kind: "tournament", entrants: 4, best_of: 1 }));
    expect(isArenaNode(ev.bracket!.nodes[0])).toBe(true);
    expect(isArenaNode({ ...ev.bracket!.nodes[0], status: "cancelled" })).toBe(false);
  });

  it("names rounds and nodes from the count, never from a fixed list", () => {
    expect(roundName(1, 1)).toBe("Final");
    expect(roundName(1, 2)).toBe("Semifinals");
    expect(roundName(1, 3)).toBe("Quarterfinals");
    expect(roundName(1, 4)).toBe("Round of 16");
    expect(roundName(1, 5)).toBe("Round of 32");
    expect(nodeLabel({ round: 1, position: 2 }, 3)).toBe("QF3");
    expect(nodeLabel({ round: 2, position: 0 }, 3)).toBe("SF1");
    expect(nodeLabel({ round: 3, position: 0 }, 3)).toBe("Final");
    expect(nodeLabel({ round: 1, position: 7 }, 4)).toBe("R16-8");
  });

  it("describes an unfilled slot by where its player comes from", () => {
    const ev = lockEvent(draftEvent({ event_id: "a", title: "a", kind: "tournament", entrants: 8, best_of: 1 }));
    const nodes = ev.bracket!.nodes;
    const final = nodes.find((n) => n.round === 3)!;
    expect(slotSourceLabel(final.slots[0].source, nodes, 3)).toBe("Winner of SF1");
    expect(slotSourceLabel({ kind: "seed", seed: 2 }, nodes, 3)).toBe("Seed 2");
    expect(slotSourceLabel({ kind: "bye" }, nodes, 3)).toBe("Bye");
    expect(slotSourceLabel({ kind: "winner_of", node_id: "nope" }, nodes, 3)).toBe("TBD");
  });
});

describe("gateways", () => {
  it("the HTTP gateway reports itself unavailable with finished copy and never pretends", () => {
    const a = httpArenaGateway.availability();
    expect(a.available).toBe(false);
    expect(a.reason).toMatch(/not open yet/);
    expect(httpArenaGateway.getEvent("x")).toBeNull();
    expect(httpArenaGateway.listEvents()).toEqual([]);
    expect(() => httpArenaGateway.createEvent({ event_id: "x", title: "x", kind: "duel", entrants: 2, best_of: 1 })).toThrow();
  });

  it("the fixture gateway labels itself and drives a created event through lock, start and play", () => {
    expect(fixtureArenaGateway.availability()).toMatchObject({ available: true, source: "fixture" });
    const ev = fixtureArenaGateway.createEvent({ event_id: "aev_host_test", title: "Test Cup", kind: "tournament", entrants: 4, best_of: 1, invitees: ["fx_kindred"] });
    expect(ev.status).toBe("open");
    expect(ev.entrants.some((e) => e.profile_id === "fx_kindred")).toBe(true);
    const seen: number[] = [];
    const off = fixtureArenaGateway.subscribe(ev.event_id, (e) => seen.push(e.revision));
    const locked = fixtureArenaGateway.lock(ev.event_id, ev.entrants.map((e) => e.profile_id))!;
    expect(locked.bracket?.nodes).toHaveLength(3);
    const started = fixtureArenaGateway.start(ev.event_id)!;
    expect(started.status).toBe("running");
    const stepped = fixtureArenaGateway.stepResult(ev.event_id)!;
    expect(stepped.bracket!.nodes[0].games).toHaveLength(1);
    const committed = fixtureArenaGateway.commitGame(ev.event_id, "r1n2", { winner: 1, score_a: 3, score_b: 9 })!;
    expect(committed.bracket!.nodes[1].winner_profile_id).toBe(committed.bracket!.nodes[1].slots[1].profile_id);
    off();
    expect(seen.length).toBeGreaterThanOrEqual(4);
    expect(seen).toEqual([...seen].sort((x, y) => x - y));
    fixtureArenaGateway.reset(ev.event_id);
  });
});
