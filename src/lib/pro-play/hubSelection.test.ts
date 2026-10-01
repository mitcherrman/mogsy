/**
 * The hub's selection and lane rules. Pure, so pinned here without a page.
 */
import { describe, expect, it } from "vitest";

import type { LiveGameSummary, LivePlayer } from "@/lib/live-esports/api";
import {
  laneMatchups,
  lanePlayerKey,
  lanePlayerName,
  nextHubAutoGame,
  pickHubGame,
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
