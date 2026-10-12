/**
 * The hub's selection and lane rules. Pure, so pinned here without a page.
 */
import { describe, expect, it } from "vitest";

import type { LiveGameSummary, LivePlayer, UpcomingMatch } from "@/lib/live-esports/api";
import {
  laneGoldDiff,
  laneMatchups,
  lanePlayerKey,
  lanePlayerName,
  laneRowName,
  nextHubAutoGame,
  nextHubAutoPick,
  pickHubGame,
  pickHubSelection,
  samePick,
  signedKGold,
} from "./hubSelection";

function game(id: string, label: LiveGameSummary["freshness"]["label"]): LiveGameSummary {
  return {
    game_id: id,
    freshness: { label },
  } as unknown as LiveGameSummary;
}

function player(
  side: "blue" | "red",
  role: string | null,
  over: Partial<LivePlayer> = {},
): LivePlayer {
  return {
    participant_id: Math.random(),
    side,
    role,
    summoner_name: `${side}-${role}`,
    resolved_player_name: `${side}-${role}`,
    resolved_player_page: `${side}-${role}-page`,
    resolution_method: "exact",
    resolved_champion_name: "Azir",
    champion_id: "Azir",
    ...over,
  } as LivePlayer;
}

describe("pickHubGame", () => {
  it("leads with the first live game", () => {
    expect(pickHubGame([game("L1", "live_fresh"), game("L2", "delayed")], [game("R1", "final")])).toBe("L1");
  });

  it("prefers a finished recent game over a stale one when nothing is live", () => {
    // A stale row is a game whose telemetry stopped — not a result.
    expect(pickHubGame([], [game("S", "stale"), game("F", "final")])).toBe("F");
  });

  it("falls back to the first recent game when none is final", () => {
    expect(pickHubGame([], [game("S1", "stale"), game("S2", "no_data")])).toBe("S1");
  });

  it("is null for an empty feed", () => {
    expect(pickHubGame([], [])).toBeNull();
  });
});

describe("nextHubAutoGame", () => {
  const L1 = game("L1", "live_fresh");
  const L2 = game("L2", "live_fresh");
  const R1 = game("R1", "final");
  const R2 = game("R2", "final");

  it("keeps a live pick when the feed reorders live games", () => {
    expect(nextHubAutoGame("L2", [L1, L2], [])).toBe("L2");
  });

  it("keeps a recent pick while nothing is live", () => {
    expect(nextHubAutoGame("R2", [], [R1, R2])).toBe("R2");
  });

  it("moves to live play as soon as a game goes live", () => {
    expect(nextHubAutoGame("R1", [L1], [R1])).toBe("L1");
  });

  it("re-picks when the current game leaves the feed", () => {
    expect(nextHubAutoGame("gone", [], [R1])).toBe("R1");
  });

  it("picks from scratch with no current game", () => {
    expect(nextHubAutoGame(null, [], [R1, R2])).toBe("R1");
  });
});

describe("laneMatchups", () => {
  it("pairs one blue and one red player per lane, in lane order", () => {
    const players = [
      player("red", "mid"),
      player("blue", "support"),
      player("blue", "top"),
      player("red", "top"),
      player("blue", "mid"),
      player("red", "support"),
    ];
    expect(laneMatchups(players).map((l) => l.lane)).toEqual(["top", "mid", "support"]);
    const top = laneMatchups(players)[0];
    expect(top.blue.side).toBe("blue");
    expect(top.red.side).toBe("red");
  });

  it("offers no lane missing a side, duplicated, or without a role", () => {
    const players = [
      player("blue", "top"),
      player("blue", "jungle"),
      player("red", "jungle"),
      player("red", "jungle"),
      player("blue", null),
      player("red", null),
    ];
    expect(laneMatchups(players)).toEqual([]);
  });

  it("is empty for no players", () => {
    expect(laneMatchups(undefined)).toEqual([]);
    expect(laneMatchups([])).toEqual([]);
  });
});

describe("lane player identity", () => {
  it("uses the resolved Pro Play page as the profile key", () => {
    expect(lanePlayerKey(player("blue", "top"))).toBe("blue-top-page");
  });

  it("never offers a key for an unresolved identity", () => {
    expect(
      lanePlayerKey(player("blue", "top", { resolution_method: "unresolved:no_match", resolved_player_page: "x" })),
    ).toBeNull();
    expect(lanePlayerKey(player("blue", "top", { resolved_player_page: null }))).toBeNull();
  });

  it("names a player by resolved name, else in-game name", () => {
    expect(lanePlayerName(player("blue", "top", { resolved_player_name: null, summoner_name: "ESB X" }))).toBe("ESB X");
    expect(lanePlayerName(player("blue", "top", { resolved_player_name: null, summoner_name: null }))).toBe("Unknown player");
  });
});

describe("lane gold difference", () => {
  it("is blue minus red, from the two players' own gold", () => {
    const [top] = laneMatchups([
      player("blue", "top", { total_gold: 14598 }),
      player("red", "top", { total_gold: 7933 }),
    ]);
    expect(laneGoldDiff(top)).toBe(6665);
    expect(signedKGold(6665)).toBe("+6.7k");
    expect(signedKGold(-698)).toBe("−698");
    expect(signedKGold(-1698)).toBe("−1.7k");
    expect(signedKGold(0)).toBe("±0");
  });

  it("is unknown, never zero, when either side's gold is missing", () => {
    const [top] = laneMatchups([
      player("blue", "top", { total_gold: 14598 }),
      player("red", "top", { total_gold: null }),
    ]);
    expect(laneGoldDiff(top)).toBeNull();
  });
});

describe("lane row name", () => {
  it("drops this team's broadcast tag from an unresolved in-game name", () => {
    const p = player("blue", "top", { resolved_player_name: null, summoner_name: "LOS Zest" });
    expect(laneRowName(p, "LOS")).toBe("Zest");
    expect(laneRowName(p, "KBM")).toBe("LOS Zest");
    expect(laneRowName(p, null)).toBe("LOS Zest");
  });

  it("prints a resolved name as is", () => {
    expect(laneRowName(player("blue", "top", { resolved_player_name: "LOS Zest" }), "LOS")).toBe("LOS Zest");
  });
});

describe("laneRowShortName", () => {
  const base = { summoner_name: "T1A Guti", resolved_player_name: "Guti (Moon Jeong-hwan)" } as never;
  it("drops a resolved name's disambiguation qualifier inside a row only", async () => {
    const { laneRowShortName, lanePlayerName } = await import("./hubSelection");
    expect(laneRowShortName(base, "T1A")).toBe("Guti");
    expect(lanePlayerName(base)).toBe("Guti (Moon Jeong-hwan)");
  });
  it("leaves an unresolved in-game name alone apart from the team tag", async () => {
    const { laneRowShortName } = await import("./hubSelection");
    expect(laneRowShortName({ summoner_name: "LOS Zest (sub)", resolved_player_name: null } as never, "LOS")).toBe("Zest (sub)");
  });
});

/* ── PW1: Worlds leads the automatic pick ───────────────────────────────── */

const NOW = Date.parse("2026-10-12T01:15:00Z");

function worldsGame(id: string, label: LiveGameSummary["freshness"]["label"]): LiveGameSummary {
  return {
    game_id: id,
    league: { slug: "worlds", name: "Worlds" },
    competition: null,
    freshness: { label },
  } as unknown as LiveGameSummary;
}

function otherGame(id: string, label: LiveGameSummary["freshness"]["label"]): LiveGameSummary {
  return {
    game_id: id,
    league: { slug: "vcs", name: "VCS" },
    competition: null,
    freshness: { label },
  } as unknown as LiveGameSummary;
}

function fixture(id: string, slug: string, start: string): UpcomingMatch {
  return {
    match_id: id,
    scheduled_start: start,
    league: { slug, name: slug, region: null, scope: null },
    block_name: null,
    best_of: 5,
    teams: {
      a: { name: "A", code: "A", resolved_page: null, tbd: false },
      b: { name: "B", code: "B", resolved_page: null, tbd: false },
    },
  } as unknown as UpcomingMatch;
}

const W_NEXT = fixture("w-next", "worlds", "2026-10-15T18:00:00Z");
const W_LATER = fixture("w-later", "worlds", "2026-10-15T23:00:00Z");
const DCGI = fixture("dcgi", "demacia_cup", "2026-10-12T06:00:00Z");

describe("pickHubSelection (PW1)", () => {
  it("pre-event: the next scheduled Worlds match replaces an unrelated recent game", () => {
    // Production on 2026-10-12: VCS and LCS Promotion finals in `recent`,
    // DCGI fixtures ahead of the Worlds Play-Ins in `/upcoming`.
    expect(pickHubSelection([], [otherGame("VCS", "final")], [DCGI, W_NEXT, W_LATER], NOW)).toEqual({
      kind: "upcoming",
      id: "w-next",
    });
  });

  it("pre-event: an unrelated LIVE game does not outrank the next Worlds match", () => {
    expect(pickHubSelection([otherGame("L", "live_fresh")], [], [DCGI, W_NEXT], NOW)).toEqual({
      kind: "upcoming",
      id: "w-next",
    });
  });

  it("during Worlds: a live Worlds game leads everything", () => {
    const pick = pickHubSelection(
      [otherGame("L", "live_fresh"), worldsGame("WL", "live_fresh")],
      [worldsGame("WR", "final")],
      [W_NEXT],
      NOW,
    );
    expect(pick).toEqual({ kind: "game", id: "WL" });
  });

  it("during Worlds, none live: the most recently completed Worlds game, even over an unrelated live one", () => {
    const pick = pickHubSelection(
      [otherGame("L", "live_fresh")],
      [worldsGame("WR1", "final"), worldsGame("WR0", "final"), otherGame("O", "final")],
      [W_NEXT],
      NOW,
    );
    expect(pick).toEqual({ kind: "game", id: "WR1" });
  });

  it("a stale Worlds row is not a result: the next fixture, else the ordinary rule", () => {
    const stale = worldsGame("WS", "stale");
    expect(pickHubSelection([], [stale, otherGame("O", "final")], [W_NEXT], NOW)).toEqual({
      kind: "upcoming",
      id: "w-next",
    });
    expect(pickHubSelection([], [stale, otherGame("O", "final")], [], NOW)).toEqual({ kind: "game", id: "O" });
  });

  it("without any Worlds game or fixture it is exactly the pre-PW1 rule", () => {
    const live = [otherGame("L", "live_fresh")];
    const recent = [otherGame("S", "stale"), otherGame("F", "final")];
    expect(pickHubSelection(live, recent, [DCGI], NOW)).toEqual({ kind: "game", id: pickHubGame(live, recent) });
    expect(pickHubSelection([], recent, [], NOW)).toEqual({ kind: "game", id: "F" });
    expect(pickHubSelection([], [], [], NOW)).toBeNull();
  });

  it("ignores a Worlds fixture whose schedule entry is stale", () => {
    const stale = fixture("old", "worlds", new Date(NOW - 3 * 3600_000).toISOString());
    expect(pickHubSelection([], [otherGame("F", "final")], [stale], NOW)).toEqual({ kind: "game", id: "F" });
  });
});

describe("nextHubAutoPick (PW1)", () => {
  it("gives way to Worlds when the schedule lands after the feed", () => {
    const held = { kind: "game", id: "VCS" } as const;
    const next = nextHubAutoPick(held, [], [otherGame("VCS", "final")], [W_NEXT], NOW);
    expect(next).toEqual({ kind: "upcoming", id: "w-next" });
  });

  it("is not held on an expired fixture: it moves on when the match leaves the schedule", () => {
    const held = { kind: "upcoming", id: "w-next" } as const;
    expect(nextHubAutoPick(held, [], [otherGame("F", "final")], [W_LATER], NOW)).toEqual({
      kind: "upcoming",
      id: "w-later",
    });
    expect(nextHubAutoPick(held, [], [otherGame("F", "final")], [], NOW)).toEqual({ kind: "game", id: "F" });
  });

  it("upcoming → live: a Worlds game that starts takes over from its fixture", () => {
    const held = { kind: "upcoming", id: "w-next" } as const;
    expect(nextHubAutoPick(held, [worldsGame("WL", "live_fresh")], [], [W_LATER], NOW)).toEqual({
      kind: "game",
      id: "WL",
    });
  });

  it("live → completed: stays on the game as it finishes, and a newer completed one does not yank it", () => {
    const held = { kind: "game", id: "WL" } as const;
    expect(nextHubAutoPick(held, [], [worldsGame("WL", "final")], [W_NEXT], NOW)).toEqual(held);
    expect(
      nextHubAutoPick(held, [], [worldsGame("WN", "final"), worldsGame("WL", "final")], [W_NEXT], NOW),
    ).toEqual(held);
  });

  it("keeps a live Worlds pick when the feed reorders two live Worlds games", () => {
    const held = { kind: "game", id: "W2" } as const;
    const live = [worldsGame("W1", "live_fresh"), worldsGame("W2", "live_fresh")];
    expect(nextHubAutoPick(held, live, [], [], NOW)).toEqual(held);
  });

  it("a live Worlds game replaces a held completed one", () => {
    const held = { kind: "game", id: "WR" } as const;
    expect(
      nextHubAutoPick(held, [worldsGame("WL", "live_fresh")], [worldsGame("WR", "final")], [], NOW),
    ).toEqual({ kind: "game", id: "WL" });
  });

  it("keeps the ordinary pick's legacy stickiness when Worlds is not in play", () => {
    const held = { kind: "game", id: "R2" } as const;
    const recent = [otherGame("R1", "final"), otherGame("R2", "final")];
    expect(nextHubAutoPick(held, [], recent, [DCGI], NOW)).toEqual(held);
    expect(nextHubAutoPick({ kind: "game", id: "gone" }, [], recent, [], NOW)).toEqual({ kind: "game", id: "R1" });
  });

  it("samePick compares kind and id", () => {
    expect(samePick({ kind: "game", id: "a" }, { kind: "game", id: "a" })).toBe(true);
    expect(samePick({ kind: "game", id: "a" }, { kind: "upcoming", id: "a" })).toBe(false);
    expect(samePick(null, null)).toBe(true);
    expect(samePick(null, { kind: "game", id: "a" })).toBe(false);
  });
});
