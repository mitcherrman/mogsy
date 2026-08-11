/**
 * Flourish export validation — sampling, reconciliation, fidelity,
 * determinism, and digest parity with the backend's totals_digest.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  buildEventsSheet,
  buildWideSheet,
  digestLines,
  EVENTS_HEADER,
  finalTotals,
  finalWins,
  toCsv,
  wideRowOrder,
} from "./flourishExport";
import { makeDataset, type EventSpec } from "./testFixtures";

// Two entities across three months and a year boundary; B overtakes nothing
// but ties A at 2 to exercise the id tiebreak. Mixed wins.
const SPEC: EventSpec[] = [
  ["player:A", "2015-01-05T10:00:00Z", 1,
   { gameId: "G0", team: "T1", opponent: "GEN", league: "LCK",
     region: "Korea", tournament: "LCK 2015 Spring", patch: "5.1" }],
  ["player:B", "2015-01-20T10:00:00Z", 0,
   { gameId: "G1", matchId: "M1", gameNumber: 2, team: "FNC",
     opponent: "G2", league: "LEC", region: "Europe",
     tournament: "LEC 2015 Spring", patch: null }],
  ["player:A", "2015-03-02T10:00:00Z", 1, { gameId: "G2" }],
  ["player:B", "2016-02-14T10:00:00Z", 1,
   { gameId: "G3", rawPlayerName: "b", playerId: "player:B" }],
];

function ds() {
  return makeDataset(SPEC);
}

describe("wide sheet sampling", () => {
  it("emits one column per observed month with end-of-month cumulatives", () => {
    const sheet = buildWideSheet(ds(), "totalGames");
    expect(sheet.header).toEqual([
      "Label", "Entity ID", "Image", "2015-01", "2015-03", "2016-02",
    ]);
    // order: A (2 games) before B (2 games) via id tiebreak
    expect(sheet.rows.map((r) => r[1])).toEqual(["player:A", "player:B"]);
    // A: 1 game in Jan, 2 by Mar, 2 at end; B: 1, 1, 2
    expect(sheet.rows[0].slice(3)).toEqual([1, 2, 2]);
    expect(sheet.rows[1].slice(3)).toEqual([1, 1, 2]);
  });

  it("wins sheet keeps the games-sheet row order and wins values", () => {
    const games = buildWideSheet(ds(), "totalGames");
    const wins = buildWideSheet(ds(), "wins");
    expect(wins.header).toEqual(games.header);
    expect(wins.rows.map((r) => r[1])).toEqual(games.rows.map((r) => r[1]));
    // A wins: 1 (Jan), 2 (Mar), 2; B wins: 0, 0, 1
    expect(wins.rows[0].slice(3)).toEqual([1, 2, 2]);
    expect(wins.rows[1].slice(3)).toEqual([0, 0, 1]);
  });

  it("final column reconciles with the independent reductions", () => {
    const dataset = ds();
    const games = buildWideSheet(dataset, "totalGames");
    const totals = finalTotals(dataset);
    for (const row of games.rows) {
      expect(row[row.length - 1]).toBe(totals.get(row[1] as string));
    }
    const wins = buildWideSheet(dataset, "wins");
    const winTotals = finalWins(dataset);
    for (const row of wins.rows) {
      expect(row[row.length - 1]).toBe(winTotals.get(row[1] as string));
    }
  });

  it("image column carries media src only for image media", () => {
    const dataset = makeDataset(SPEC, {
      "player:A": {
        media: {
          kind: "image",
          src: "https://example.test/a.png",
          fallbackText: "A",
        },
      },
    });
    const sheet = buildWideSheet(dataset, "totalGames");
    expect(sheet.rows[0][2]).toBe("https://example.test/a.png");
    expect(sheet.rows[1][2]).toBe(""); // initials media
  });
});

describe("events sheet fidelity", () => {
  it("preserves ids, exact timestamps, context fields and running cumulatives", () => {
    const sheet = buildEventsSheet(ds());
    expect(sheet.header).toEqual([...EVENTS_HEADER]);
    expect(sheet.rows).toHaveLength(4);

    const first = Object.fromEntries(EVENTS_HEADER.map((h, i) => [h, sheet.rows[0][i]]));
    expect(first).toMatchObject({
      sequence: 0,
      occurred_at: "2015-01-05T10:00:00Z",
      entity_id: "player:A",
      entity_type: "player",
      entity_label: "A",
      identity_status: "canonical",
      delta: 1,
      wins_delta: 1,
      cumulative_games: 1,
      cumulative_wins: 1,
      game_id: "G0",
      team: "T1",
      opponent: "GEN",
      league: "LCK",
      region: "Korea",
      tournament: "LCK 2015 Spring",
      patch: "5.1",
    });

    const second = Object.fromEntries(EVENTS_HEADER.map((h, i) => [h, sheet.rows[1][i]]));
    // null/absent context fields flatten to empty strings; numbers survive
    expect(second).toMatchObject({
      entity_id: "player:B",
      wins_delta: 0,
      cumulative_games: 1,
      cumulative_wins: 0,
      match_id: "M1",
      game_number: 2,
      patch: "",
    });

    const last = Object.fromEntries(EVENTS_HEADER.map((h, i) => [h, sheet.rows[3][i]]));
    expect(last).toMatchObject({
      occurred_at: "2016-02-14T10:00:00Z",
      cumulative_games: 2,
      cumulative_wins: 1,
      raw_player_name: "b",
      player_id: "player:B",
    });
  });

  it("per-entity last cumulative equals the final reductions", () => {
    const dataset = ds();
    const sheet = buildEventsSheet(dataset);
    const lastGames = new Map<string, number>();
    const lastWins = new Map<string, number>();
    for (const row of sheet.rows) {
      lastGames.set(row[2] as string, row[8] as number);
      lastWins.set(row[2] as string, row[9] as number);
    }
    expect(lastGames).toEqual(finalTotals(dataset));
    expect(lastWins).toEqual(finalWins(dataset));
  });
});

describe("csv serialization", () => {
  it("quotes only fields containing commas, quotes or newlines", () => {
    const csv = toCsv(["a", "b"], [
      ["plain", 'say "hi"'],
      ["with,comma", "line\nbreak"],
    ]);
    expect(csv).toBe('a,b\nplain,"say ""hi"""\n"with,comma","line\nbreak"\n');
  });

  it("export bytes are deterministic across runs", () => {
    const a = toCsv(
      buildWideSheet(ds(), "totalGames").header,
      buildWideSheet(ds(), "totalGames").rows,
    );
    const b = toCsv(
      buildWideSheet(ds(), "totalGames").header,
      buildWideSheet(ds(), "totalGames").rows,
    );
    expect(a).toBe(b);
    const e1 = toCsv(buildEventsSheet(ds()).header, buildEventsSheet(ds()).rows);
    const e2 = toCsv(buildEventsSheet(ds()).header, buildEventsSheet(ds()).rows);
    expect(e1).toBe(e2);
  });
});

describe("digest parity with backend totals_digest", () => {
  it("reproduces the python reference digest for a known totals map", () => {
    // hashlib.sha256("player:A\t2\nplayer:B\t1\n").hexdigest()
    const reference =
      "a2ea032bcbeed562eef3847fcc55e784c607a906a6fbc2fc8c532fe1a25f3a6b";
    const lines = digestLines(new Map([["player:B", 1], ["player:A", 2]]));
    expect(lines).toBe("player:A\t2\nplayer:B\t1\n");
    expect(createHash("sha256").update(lines).digest("hex")).toBe(reference);
  });

  it("orders ids lexically regardless of event order", () => {
    const dataset = ds();
    expect(digestLines(finalTotals(dataset))).toBe("player:A\t2\nplayer:B\t2\n");
    expect(digestLines(finalWins(dataset))).toBe("player:A\t2\nplayer:B\t1\n");
  });
});

describe("row ordering", () => {
  it("sorts by final games desc then id asc", () => {
    const spec: EventSpec[] = [
      ["player:C", "2015-01-01T10:00:00Z"],
      ["player:C", "2015-01-02T10:00:00Z"],
      ["player:A", "2015-01-03T10:00:00Z"],
      ["player:B", "2015-01-04T10:00:00Z"],
    ];
    expect(wideRowOrder(makeDataset(spec))).toEqual([
      "player:C", "player:A", "player:B",
    ]);
  });
});
