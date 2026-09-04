/**
 * The builder model: valid combinations, metric validity, key grammar,
 * visualization routing and reader-facing titles.
 *
 * These are the guarantees the UI relies on to never compose a dead key, and
 * the ones that keep internal vocabulary off the screen.
 */
import { describe, expect, it } from "vitest";

import {
  COMBINATIONS,
  combinationsFor,
  datasetKeyFor,
  defaultCompare,
  defaultMetric,
  findCombination,
  graphTitle,
  metricsFor,
  selectionFromDatasetKey,
  type Graph1Combination,
} from "./builder";

const player = findCombination("player", "champions")!;
const team = findCombination("team", "champions")!;
const championPlayers = findCombination("champion", "players")!;
const championTeams = findCombination("champion", "teams")!;

describe("combinations", () => {
  it("offers exactly the four canonical entity pairings", () => {
    expect(
      COMBINATIONS.map((c) => `${c.focus}->${c.compare}`).sort(),
    ).toEqual([
      "champion->players",
      "champion->teams",
      "player->champions",
      "team->champions",
    ]);
  });

  it("never offers a pairing the backend has no family for", () => {
    // "Player -> Teams" and "Team -> Players" are the tempting inventions.
    expect(findCombination("player", "teams")).toBeUndefined();
    expect(findCombination("team", "players")).toBeUndefined();
    expect(combinationsFor("player")).toHaveLength(1);
    expect(combinationsFor("champion")).toHaveLength(2);
  });

  it("lands every focus on a combination that exists", () => {
    for (const focus of ["player", "team", "champion"] as const) {
      expect(findCombination(focus, defaultCompare(focus))).toBeDefined();
    }
  });

  it("gives bans only to Champion -> Teams", () => {
    expect(championTeams.modes).toEqual(["picks", "bans"]);
    for (const c of [player, team, championPlayers]) {
      expect(c.modes).toBeUndefined();
    }
  });
});

describe("metric validity", () => {
  const ids = (c: Graph1Combination, mode?: "picks" | "bans") =>
    metricsFor(c, mode).map((m) => m.id);

  it("offers count + ratio metrics on every pick graph", () => {
    expect(ids(player)).toEqual(["games", "wins", "winrate", "share"]);
    expect(ids(championPlayers)).toEqual(["games", "wins", "winrate", "share"]);
    expect(ids(team)).toEqual(["games", "wins", "winrate", "share"]);
    expect(ids(championTeams, "picks")).toEqual([
      "games",
      "wins",
      "winrate",
      "share",
    ]);
  });

  it("offers only ban metrics on a ban graph", () => {
    // A banned champion was never played, so wins and win rate are not merely
    // absent here — they are undefined, and the backend 409s on both.
    expect(ids(championTeams, "bans")).toEqual(["bans", "banrate"]);
  });

  it("never offers ban rate on a pick graph", () => {
    for (const c of COMBINATIONS) {
      expect(ids(c, "picks")).not.toContain("banrate");
    }
  });

  it("routes monotonic totals to the race and ratios to the board", () => {
    const byId = Object.fromEntries(
      metricsFor(championTeams, "picks").map((m) => [m.id, m]),
    );
    expect(byId.games.viz).toBe("race");
    expect(byId.wins.viz).toBe("race");
    expect(byId.winrate.viz).toBe("board");
    expect(byId.share.viz).toBe("board");
    expect(metricsFor(championTeams, "bans")[0].viz).toBe("race");
    expect(metricsFor(championTeams, "bans")[1].viz).toBe("board");
  });

  it("sends the backend's own metric id for every ratio, and none for a race", () => {
    const all = COMBINATIONS.flatMap((c) => [
      ...metricsFor(c, "picks"),
      ...(c.modes ? metricsFor(c, "bans") : []),
    ]);
    for (const m of all) {
      if (m.viz === "board") {
        expect(["win_rate", "share", "ban_rate"]).toContain(m.apiMetric);
      } else {
        // A race metric rides in the payload and must send no parameter, or
        // the request stops being byte-identical to the pre-Phase-E one.
        expect(m.apiMetric).toBeUndefined();
      }
    }
  });

  it("defaults to the leading count metric", () => {
    expect(defaultMetric(player)).toBe("games");
    expect(defaultMetric(championTeams, "bans")).toBe("bans");
  });
});

describe("dataset keys", () => {
  it("builds the family key the backend routes on", () => {
    expect(datasetKeyFor(player, "Faker")).toBe("player-champions:Faker");
    expect(datasetKeyFor(team, "T1")).toBe("team-champions:T1");
    expect(datasetKeyFor(championPlayers, "azir")).toBe("champion-players:azir");
    expect(datasetKeyFor(championTeams, "kaisa", "picks")).toBe(
      "champion-teams:kaisa",
    );
    expect(datasetKeyFor(championTeams, "kaisa", "bans")).toBe(
      "champion-teams:kaisa:bans",
    );
  });

  it("round-trips a selection through its key", () => {
    for (const [c, entity, mode] of [
      [player, "Faker", "picks"],
      [team, "SK Telecom T1", "picks"],
      [championTeams, "kaisa", "bans"],
    ] as const) {
      const back = selectionFromDatasetKey(datasetKeyFor(c, entity, mode));
      expect(back).toEqual({ combination: c, entityId: entity, mode });
    }
  });

  it("splits the bans mode off the LAST separator, not the first", () => {
    // `parseFamilyDatasetKey` splits on the first `:`, so the mode arrives
    // glued to the entity id. Getting this wrong graphs "kaisa:bans" as a
    // champion slug and 404s.
    expect(selectionFromDatasetKey("champion-teams:kaisa:bans")).toMatchObject({
      entityId: "kaisa",
      mode: "bans",
    });
  });

  it("ignores keys the builder does not model", () => {
    // Legacy fixed races and the stat families belong to the operator page.
    expect(selectionFromDatasetKey("faker-champions")).toBeNull();
    expect(selectionFromDatasetKey("champion-stat-growth:attack-damage")).toBeNull();
    expect(selectionFromDatasetKey(undefined)).toBeNull();
  });
});

describe("titles", () => {
  it("reads as a question a person would ask", () => {
    expect(graphTitle(player, "Faker", "games")).toBe(
      "Faker's Most-Played Champions",
    );
    expect(graphTitle(championPlayers, "Azir", "games")).toBe(
      "Azir's Most-Played Pro Players",
    );
    expect(graphTitle(team, "T1", "games")).toBe("T1's Champion Pool");
    expect(graphTitle(championTeams, "Kai'Sa", "games")).toBe(
      "Teams Picking Kai'Sa",
    );
    expect(graphTitle(championTeams, "Nautilus", "bans", "bans")).toBe(
      "Teams Banning Nautilus",
    );
    expect(graphTitle(championTeams, "Kai'Sa", "winrate")).toBe(
      "Teams With the Highest Kai'Sa Win Rate",
    );
    expect(graphTitle(championPlayers, "Azir", "winrate")).toBe(
      "Highest Azir Win Rate",
    );
  });

  it("never leaks a family id or an internal policy name", () => {
    const titles = COMBINATIONS.flatMap((c) =>
      [...metricsFor(c, "picks"), ...(c.modes ? metricsFor(c, "bans") : [])].map(
        (m) => graphTitle(c, "Example", m.id, m.id === "bans" || m.id === "banrate" ? "bans" : "picks"),
      ),
    );
    for (const title of titles) {
      expect(title).not.toMatch(
        /player-champions|champion-players|team-champions|champion-teams|MAJOR_PRO|PRO_TEAM|pro_broad/,
      );
    }
  });
});
