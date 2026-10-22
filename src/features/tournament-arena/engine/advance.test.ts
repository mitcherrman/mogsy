import { describe, expect, it } from "vitest";

import { draftEvent, playGames, playToEnd, SCENARIOS } from "../fixtures/scenarios";
import { goLive, lockEvent, nextPlayableNode, recordGame, roundComplete, scriptedResult, startEvent, walkover, winsNeeded } from "./advance";

const settled = (s: string) => s === "complete" || s === "walkover" || s === "bye";

describe("fixture advancement engine", () => {
  it("needs a majority of games to take a series", () => {
    expect(winsNeeded(1)).toBe(1);
    expect(winsNeeded(3)).toBe(2);
    expect(winsNeeded(5)).toBe(3);
  });

  it("locks a field into seeded nodes and resolves byes at once", () => {
    const ev = lockEvent(draftEvent({ event_id: "t", title: "t", kind: "tournament", entrants: 6, best_of: 1 }));
    expect(ev.status).toBe("locked");
    expect(ev.bracket?.rounds).toBe(3);
    expect(ev.entrants.map((e) => e.seed)).toEqual([1, 2, 3, 4, 5, 6]);
    const byes = ev.bracket!.nodes.filter((n) => n.status === "bye");
    expect(byes).toHaveLength(2);
    // The seeded side walked over into the semifinal.
    for (const b of byes) {
      expect(b.winner_profile_id).not.toBeNull();
      const next = ev.bracket!.nodes.find((n) => n.slots.some((s) => s.source.kind === "winner_of" && s.source.node_id === b.node_id))!;
      expect(next.slots.some((s) => s.profile_id === b.winner_profile_id)).toBe(true);
    }
    // Round 1 nodes with two real players are ready; a later node fed by one bye and one pending match is not.
    expect(ev.bracket!.nodes.filter((n) => n.round === 1 && n.status === "ready")).toHaveLength(2);
    expect(ev.bracket!.nodes.filter((n) => n.round === 2).every((n) => n.status === "pending")).toBe(true);
  });

  it("does not mutate its input", () => {
    const draft = draftEvent({ event_id: "t", title: "t", kind: "tournament", entrants: 4, best_of: 1 });
    const before = JSON.stringify(draft);
    lockEvent(draft);
    expect(JSON.stringify(draft)).toBe(before);
  });

  it("advances a Bo3 winner into the next slot only once the series is decided", () => {
    let ev = startEvent(lockEvent(draftEvent({ event_id: "t", title: "t", kind: "tournament", entrants: 4, best_of: 3 })));
    ev = goLive(ev, "r1n1");
    const [a, b] = ev.bracket!.nodes[0].slots.map((s) => s.profile_id);
    ev = recordGame(ev, "r1n1", { winner: 0, score_a: 20, score_b: 15 });
    expect(ev.bracket!.nodes[0].status).toBe("live");
    expect(ev.bracket!.nodes[0].slots[0].wins).toBe(1);
    ev = recordGame(ev, "r1n1", { winner: 1, score_a: 15, score_b: 20 });
    expect(ev.bracket!.nodes[0].winner_profile_id).toBeNull();
    ev = recordGame(ev, "r1n1", { winner: 0, score_a: 22, score_b: 19 });
    const node = ev.bracket!.nodes[0];
    expect(node.status).toBe("complete");
    expect(node.winner_profile_id).toBe(a);
    expect(node.games).toHaveLength(3);
    const final = ev.bracket!.nodes.find((n) => n.node_id === "r2n1")!;
    expect(final.slots[0].profile_id).toBe(a);
    expect(ev.entrants.find((e) => e.profile_id === b)?.status).toBe("eliminated");
  });

  it("replays a draw instead of counting it", () => {
    let ev = startEvent(lockEvent(draftEvent({ event_id: "t", title: "t", kind: "tournament", entrants: 2, best_of: 1 })));
    ev = goLive(ev, "r1n1");
    ev = recordGame(ev, "r1n1", { winner: null, score_a: 18, score_b: 18 });
    const node = ev.bracket!.nodes[0];
    expect(node.status).toBe("live");
    expect(node.games[0].outcome).toBe("draw");
    expect(node.slots.map((s) => s.wins)).toEqual([0, 0]);
    expect(ev.status).toBe("running");
  });

  it("crowns a champion when the final is decided", () => {
    let ev = startEvent(lockEvent(draftEvent({ event_id: "t", title: "t", kind: "duel", entrants: 2, best_of: 1 })));
    ev = goLive(ev, "r1n1");
    ev = recordGame(ev, "r1n1", { winner: 1, score_a: 10, score_b: 12 });
    expect(ev.status).toBe("complete");
    expect(ev.champion_profile_id).toBe(ev.bracket!.nodes[0].slots[1].profile_id);
    expect(ev.entrants.find((e) => e.profile_id === ev.champion_profile_id)?.status).toBe("champion");
  });

  it("walks a side over and refuses to touch a settled node", () => {
    let ev = startEvent(lockEvent(draftEvent({ event_id: "t", title: "t", kind: "tournament", entrants: 4, best_of: 1 })));
    const winner = ev.bracket!.nodes[0].slots[1].profile_id;
    ev = walkover(ev, "r1n1", 1);
    expect(ev.bracket!.nodes[0].status).toBe("walkover");
    expect(ev.bracket!.nodes[0].winner_profile_id).toBe(winner);
    expect(ev.bracket!.nodes.find((n) => n.node_id === "r2n1")!.slots[0].profile_id).toBe(winner);
    const again = walkover(ev, "r1n1", 0);
    expect(again).toBe(ev);
  });

  it("ignores a game recorded on a node that is not live or ready", () => {
    const ev = startEvent(lockEvent(draftEvent({ event_id: "t", title: "t", kind: "tournament", entrants: 4, best_of: 1 })));
    expect(recordGame(ev, "r2n1", { winner: 0, score_a: 1, score_b: 0 })).toBe(ev);
  });

  it("plays every field to a single champion with scripted results", () => {
    for (const n of [2, 4, 6, 8, 12, 16, 32]) {
      const ev = playToEnd(startEvent(lockEvent(draftEvent({ event_id: `t${n}`, title: "t", kind: "tournament", entrants: n, best_of: n > 8 ? 1 : 3 }))));
      expect(ev.status).toBe("complete");
      expect(ev.champion_profile_id).not.toBeNull();
      expect(ev.bracket!.nodes.every((x) => settled(x.status))).toBe(true);
      expect(ev.entrants.filter((e) => e.status === "champion")).toHaveLength(1);
      expect(ev.entrants.filter((e) => e.status === "eliminated")).toHaveLength(n - 1);
      for (let r = 1; r <= ev.bracket!.rounds; r++) expect(roundComplete(ev, r)).toBe(true);
    }
  });

  it("scripts results deterministically and favours the better seed", () => {
    expect(scriptedResult("r1n1", 1, 1, 8)).toEqual(scriptedResult("r1n1", 1, 1, 8));
    let topWins = 0;
    for (let i = 0; i < 200; i++) if (scriptedResult(`n${i}`, 1, 1, 16).winner === 0) topWins++;
    expect(topWins).toBeGreaterThan(120);
  });

  it("builds every scenario into a valid state and never projects a future name", () => {
    for (const s of SCENARIOS) {
      const ev = s.build();
      expect(ev.contract_version).toBe("arena_event.v1");
      if (!ev.bracket) continue;
      for (const n of ev.bracket.nodes) {
        if (n.status === "pending") expect(n.slots.some((sl) => sl.profile_id === null)).toBe(true);
        if (n.winner_profile_id) expect(n.slots.map((sl) => sl.profile_id)).toContain(n.winner_profile_id);
      }
    }
    const mid = SCENARIOS.find((s) => s.id === "mid-8")!.build();
    const qf3 = mid.bracket!.nodes.find((n) => n.node_id === "r1n3")!;
    expect(qf3.status).toBe("live");
    expect(qf3.slots.map((s) => s.wins)).toEqual([1, 1]);
    expect(nextPlayableNode(mid)?.node_id).toBe("r1n3");
    expect(playGames(mid, 1).bracket!.nodes.find((n) => n.node_id === "r1n3")!.status).toBe("complete");
  });
});
