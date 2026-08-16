/**
 * Phase 5 — the pure snapshot ranking layer.
 *
 * `buildStatBoard` is the whole reason this family is not a race: it is the
 * only place ordering happens, it does it in BOTH directions, and it is a
 * pure function of (payload, point, order, rowCount). These tests pin the
 * ordering rule, the tie rule, the bar rule and the total-parse guarantees.
 */
import { describe, expect, it } from "vitest";

import {
  ALL_ROWS,
  assertSnapshotDataset,
  buildStatBoard,
  findChampions,
  isAllRows,
  MIN_FIND_QUERY,
  normalizeChampionName,
  isSnapshotOrder,
  resolveSnapshotPoint,
  snapshotPointLabel,
  statBoardTitle,
  type Graph1SnapshotDataset,
} from "./snapshotContract";

/** Three champions, two levels. Bravo and Charlie TIE at level 1. */
function makeLevelDataset(): Graph1SnapshotDataset {
  return {
    schemaVersion: 1,
    id: "champion-stat-snapshot:armor@base-stats",
    visualizationType: "ranked-snapshot",
    definition: {
      title: "Champion Armor — ranked",
      focusEntity: { type: "stat", id: "stat:armor" },
      rankedEntityType: "champion",
      metric: {
        id: "champion_stat_value",
        label: "Armor",
        unit: "Armor",
        accumulation: "none",
        valueDisplay: { scale: 100, decimals: 1 },
      },
      scope: { id: "base-stats", label: "Base stats" },
      snapshots: {
        kind: "level",
        unitLabel: "Level",
        defaultId: "20",
        points: [
          { id: "1", label: "Level 1" },
          { id: "20", label: "Level 20" },
        ],
      },
    },
    entities: {
      "stat:armor": {
        id: "stat:armor",
        type: "stat",
        displayName: "Armor",
        identityStatus: "canonical",
        media: { kind: "neutral", value: "AR" },
      },
      "champion:Alpha": {
        id: "champion:Alpha",
        type: "champion",
        displayName: "Alpha",
        identityStatus: "canonical",
        media: { kind: "initials", value: "AL" },
      },
      "champion:Bravo": {
        id: "champion:Bravo",
        type: "champion",
        displayName: "Bravo",
        identityStatus: "canonical",
        media: { kind: "initials", value: "BR" },
      },
      "champion:Charlie": {
        id: "champion:Charlie",
        type: "champion",
        displayName: "Charlie",
        identityStatus: "canonical",
        media: { kind: "initials", value: "CH" },
      },
    },
    rows: [
      { rankedEntityId: "champion:Alpha", values: { "1": 4000, "20": 9000 } },
      { rankedEntityId: "champion:Bravo", values: { "1": 3000, "20": 12000 } },
      { rankedEntityId: "champion:Charlie", values: { "1": 3000, "20": 6000 } },
    ],
    coverage: {
      source: "champion_stats (sheet intake)",
      generatedAt: null,
      firstEventAt: null,
      lastEventAt: null,
      eligibleEventCount: 0,
      excludedEventCount: 0,
      distinctRankedEntityCount: 3,
      warnings: [],
    },
  };
}

function makeStaticDataset(): Graph1SnapshotDataset {
  const ds = makeLevelDataset();
  ds.definition.metric.label = "Attack Range";
  ds.definition.metric.unit = "range";
  ds.definition.metric.valueDisplay = { scale: 100, decimals: 0 };
  ds.definition.snapshots = {
    kind: "static",
    unitLabel: "Attack Range",
    defaultId: "base",
    points: [{ id: "base", label: "Attack Range" }],
  };
  ds.rows = [
    { rankedEntityId: "champion:Alpha", values: { base: 55000 } },
    { rankedEntityId: "champion:Bravo", values: { base: 12500 } },
    { rankedEntityId: "champion:Charlie", values: { base: 65000 } },
  ];
  return ds;
}

const names = (rows: { entityId: string }[]) =>
  rows.map((r) => r.entityId.replace("champion:", ""));

// ---------------------------------------------------------------------------
// the structural gate

describe("assertSnapshotDataset", () => {
  it("accepts a well-formed snapshot payload", () => {
    expect(assertSnapshotDataset(makeLevelDataset()).rows).toHaveLength(3);
  });

  it("rejects a RACE payload outright", () => {
    const race = { ...makeLevelDataset(), visualizationType: "ranked-race" };
    expect(() => assertSnapshotDataset(race)).toThrow(/unsupported/);
  });

  it("rejects an empty row list", () => {
    // unlike a race, zero rows is never a legitimate answer: the universe is
    // the whole roster
    expect(() =>
      assertSnapshotDataset({ ...makeLevelDataset(), rows: [] }),
    ).toThrow(/no rows/);
  });

  it("rejects a payload declaring no snapshot points", () => {
    const ds = makeLevelDataset();
    ds.definition.snapshots.points = [];
    expect(() => assertSnapshotDataset(ds)).toThrow(/snapshot points/);
  });

  it("rejects null and the wrong schema version", () => {
    expect(() => assertSnapshotDataset(null)).toThrow();
    expect(() =>
      assertSnapshotDataset({ ...makeLevelDataset(), schemaVersion: 2 }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// point resolution — total, never throws

describe("resolveSnapshotPoint", () => {
  it("honours a declared point", () => {
    expect(resolveSnapshotPoint(makeLevelDataset(), "1")).toBe("1");
  });

  it("falls back to the declared default when the request is unknown", () => {
    // e.g. ?lvl=20 carried onto a static stat by a shared link
    expect(resolveSnapshotPoint(makeStaticDataset(), "20")).toBe("base");
    expect(resolveSnapshotPoint(makeLevelDataset(), undefined)).toBe("20");
    expect(resolveSnapshotPoint(makeLevelDataset(), "99")).toBe("20");
  });

  it("falls back to the first point when even the default is bogus", () => {
    const ds = makeLevelDataset();
    ds.definition.snapshots.defaultId = "nope";
    expect(resolveSnapshotPoint(ds, undefined)).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// the ordering rule — the reason snapshots are not races

describe("buildStatBoard ordering", () => {
  it("ranks highest first", () => {
    const rows = buildStatBoard(makeLevelDataset(), {
      pointId: "20",
      order: "highest",
      rowCount: 10,
    });
    expect(names(rows)).toEqual(["Bravo", "Alpha", "Charlie"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("ranks LOWEST first — the case a race engine cannot express", () => {
    const rows = buildStatBoard(makeLevelDataset(), {
      pointId: "20",
      order: "lowest",
      rowCount: 10,
    });
    expect(names(rows)).toEqual(["Charlie", "Alpha", "Bravo"]);
    expect(rows[0].rank).toBe(1);
  });

  it("ranks a different point independently", () => {
    // at level 1 Alpha leads; at level 20 Bravo does
    expect(
      names(
        buildStatBoard(makeLevelDataset(), {
          pointId: "1",
          order: "highest",
          rowCount: 10,
        }),
      )[0],
    ).toBe("Alpha");
  });

  it("breaks ties alphabetically in BOTH directions", () => {
    const ds = makeLevelDataset(); // Bravo and Charlie both 3000 at level 1
    const highest = names(
      buildStatBoard(ds, { pointId: "1", order: "highest", rowCount: 10 }),
    );
    const lowest = names(
      buildStatBoard(ds, { pointId: "1", order: "lowest", rowCount: 10 }),
    );
    expect(highest).toEqual(["Alpha", "Bravo", "Charlie"]);
    // the tied pair keeps alphabetical order even when the sort is reversed
    expect(lowest.indexOf("Bravo")).toBeLessThan(lowest.indexOf("Charlie"));
  });

  it("caps at a numeric rowCount and always yields at least one row", () => {
    const ds = makeLevelDataset();
    expect(
      buildStatBoard(ds, { pointId: "20", order: "highest", rowCount: 2 }),
    ).toHaveLength(2);
    expect(
      buildStatBoard(ds, { pointId: "20", order: "highest", rowCount: 0 }),
    ).toHaveLength(1);
  });

  it("skips rows that do not carry the requested point", () => {
    const ds = makeLevelDataset();
    delete (ds.rows[0].values as Record<string, number>)["20"];
    const rows = buildStatBoard(ds, {
      pointId: "20",
      order: "highest",
      rowCount: 10,
    });
    expect(names(rows)).toEqual(["Bravo", "Charlie"]);
  });
});

describe("buildStatBoard values and bars", () => {
  it("prints units through valueDisplay", () => {
    const rows = buildStatBoard(makeLevelDataset(), {
      pointId: "20",
      order: "highest",
      rowCount: 10,
    });
    expect(rows[0].units).toBe(12000);
    expect(rows[0].value).toBe(120);
    expect(rows[0].label).toBe("120.0"); // scale 100, 1 decimal
  });

  it("thousands-separates a large whole-number stat", () => {
    const ds = makeLevelDataset();
    ds.definition.metric.valueDisplay = { scale: 100, decimals: 0 };
    ds.rows = [
      { rankedEntityId: "champion:Alpha", values: { "1": 261300, "20": 1 } },
    ];
    const rows = buildStatBoard(ds, {
      pointId: "1",
      order: "highest",
      rowCount: 5,
    });
    expect(rows[0].label).toBe("2,613");
  });

  it("scales bars to the widest DISPLAYED row", () => {
    const rows = buildStatBoard(makeLevelDataset(), {
      pointId: "20",
      order: "highest",
      rowCount: 10,
    });
    expect(rows[0].barFraction).toBe(1);
    expect(rows[1].barFraction).toBeCloseTo(9000 / 12000);
  });

  it("gives a lowest board a rising staircase — rank 1 is the shortest bar", () => {
    const rows = buildStatBoard(makeLevelDataset(), {
      pointId: "20",
      order: "lowest",
      rowCount: 10,
    });
    expect(rows[0].barFraction).toBeLessThan(rows[2].barFraction);
    expect(rows[2].barFraction).toBe(1);
  });

  it("does not divide by zero when every displayed value is zero", () => {
    const ds = makeLevelDataset();
    ds.rows = ds.rows.map((r) => ({ ...r, values: { "1": 0, "20": 0 } }));
    const rows = buildStatBoard(ds, {
      pointId: "20",
      order: "highest",
      rowCount: 10,
    });
    expect(rows.every((r) => r.barFraction === 0)).toBe(true);
  });

  it("treats a payload with no valueDisplay as raw integers", () => {
    const ds = makeLevelDataset();
    delete ds.definition.metric.valueDisplay;
    const rows = buildStatBoard(ds, {
      pointId: "20",
      order: "highest",
      rowCount: 1,
    });
    expect(rows[0].label).toBe("12,000");
  });
});

// ---------------------------------------------------------------------------
// headline

describe("statBoardTitle", () => {
  it("names the level for a level-scaled stat", () => {
    expect(
      statBoardTitle(makeLevelDataset(), {
        pointId: "20",
        order: "highest",
        rowCount: 20,
      }),
    ).toBe("Top 20 Highest Armor at Level 20");
    expect(
      statBoardTitle(makeLevelDataset(), {
        pointId: "1",
        order: "lowest",
        rowCount: 10,
      }),
    ).toBe("Top 10 Lowest Armor at Level 1");
  });

  it("omits the level clause for a stat that has no levels", () => {
    expect(
      statBoardTitle(makeStaticDataset(), {
        pointId: "base",
        order: "highest",
        rowCount: 10,
      }),
    ).toBe("Top 10 Highest Attack Range");
  });
});

describe("misc guards", () => {
  it("isSnapshotOrder accepts only the two orders", () => {
    expect(isSnapshotOrder("highest")).toBe(true);
    expect(isSnapshotOrder("lowest")).toBe(true);
    expect(isSnapshotOrder("Highest")).toBe(false);
    expect(isSnapshotOrder(undefined)).toBe(false);
  });

  it("snapshotPointLabel degrades to the raw id", () => {
    expect(snapshotPointLabel(makeLevelDataset(), "20")).toBe("Level 20");
    expect(snapshotPointLabel(makeLevelDataset(), "77")).toBe("77");
  });
});

// ---------------------------------------------------------------------------
// ALL_ROWS — every eligible champion, with no numeric ceiling anywhere

/** A roster of a deliberately ODD size, so nothing can pass by matching a
 * constant. The production roster is 173 today and must never be assumed. */
function makeRosterDataset(size: number): Graph1SnapshotDataset {
  const ds = makeStaticDataset();
  const names = Array.from({ length: size }, (_, i) =>
    `Champ${String(i).padStart(3, "0")}`,
  );
  ds.entities = {
    "stat:attack-range": ds.entities["stat:armor"],
  } as Graph1SnapshotDataset["entities"];
  for (const name of names) {
    ds.entities[`champion:${name}`] = {
      id: `champion:${name}`,
      type: "champion",
      displayName: name,
      identityStatus: "canonical",
      media: { kind: "initials", value: name.slice(0, 2) },
    };
  }
  ds.rows = names.map((name, i) => ({
    rankedEntityId: `champion:${name}`,
    // strictly increasing so ordering is unambiguous
    values: { base: (i + 1) * 100 },
  }));
  return ds;
}

describe("ALL_ROWS", () => {
  it("is not a number, so it can never be a magic Top-N", () => {
    expect(typeof ALL_ROWS).toBe("string");
    expect(isAllRows(ALL_ROWS)).toBe(true);
    expect(isAllRows(20)).toBe(false);
  });

  it.each([3, 7, 41, 173, 174, 260])(
    "renders every eligible row for a roster of %i",
    (size) => {
      const rows = buildStatBoard(makeRosterDataset(size), {
        pointId: "base",
        order: "highest",
        rowCount: ALL_ROWS,
      });
      expect(rows).toHaveLength(size);
      // ranks are contiguous 1..N with no gap and no repeat
      expect(rows.map((r) => r.rank)).toEqual(
        Array.from({ length: size }, (_, i) => i + 1),
      );
    },
  );

  it("preserves highest ordering across the whole roster", () => {
    const rows = buildStatBoard(makeRosterDataset(40), {
      pointId: "base",
      order: "highest",
      rowCount: ALL_ROWS,
    });
    expect(rows[0].units).toBe(4000);
    expect(rows[39].units).toBe(100);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].units).toBeLessThanOrEqual(rows[i - 1].units);
    }
  });

  it("preserves lowest ordering across the whole roster", () => {
    const rows = buildStatBoard(makeRosterDataset(40), {
      pointId: "base",
      order: "lowest",
      rowCount: ALL_ROWS,
    });
    expect(rows[0].units).toBe(100);
    expect(rows[39].units).toBe(4000);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].units).toBeGreaterThanOrEqual(rows[i - 1].units);
    }
  });

  it("keeps the alphabetical tie rule when showing everything", () => {
    const ds = makeLevelDataset(); // Bravo and Charlie tie at level 1
    const all = buildStatBoard(ds, {
      pointId: "1",
      order: "lowest",
      rowCount: ALL_ROWS,
    });
    expect(all).toHaveLength(3);
    const ids = all.map((r) => r.entityId);
    expect(ids.indexOf("champion:Bravo")).toBeLessThan(
      ids.indexOf("champion:Charlie"),
    );
  });

  it("still excludes rows that lack the requested point", () => {
    const ds = makeLevelDataset();
    delete (ds.rows[0].values as Record<string, number>)["20"];
    const rows = buildStatBoard(ds, {
      pointId: "20",
      order: "highest",
      rowCount: ALL_ROWS,
    });
    // "all" means all ELIGIBLE, not all rows in the payload
    expect(rows).toHaveLength(2);
  });

  it("scales bars against the true roster leader", () => {
    const rows = buildStatBoard(makeRosterDataset(10), {
      pointId: "base",
      order: "highest",
      rowCount: ALL_ROWS,
    });
    expect(rows[0].barFraction).toBe(1);
    expect(rows[9].barFraction).toBeCloseTo(100 / 1000);
  });

  it("titles the board with the real rendered count, not a constant", () => {
    const ds = makeRosterDataset(41);
    const rows = buildStatBoard(ds, {
      pointId: "base",
      order: "highest",
      rowCount: ALL_ROWS,
    });
    expect(
      statBoardTitle(
        ds,
        { pointId: "base", order: "highest", rowCount: ALL_ROWS },
        rows.length,
      ),
    ).toBe("All 41 Champions — Highest Attack Range");
  });

  it("names the level in an all-rows title for a level stat", () => {
    expect(
      statBoardTitle(
        makeLevelDataset(),
        { pointId: "1", order: "lowest", rowCount: ALL_ROWS },
        3,
      ),
    ).toBe("All 3 Champions — Lowest Armor at Level 1");
  });

  it("leaves numeric Top-N titles exactly as they were", () => {
    expect(
      statBoardTitle(makeLevelDataset(), {
        pointId: "20",
        order: "highest",
        rowCount: 20,
      }),
    ).toBe("Top 20 Highest Armor at Level 20");
  });
});

// ---------------------------------------------------------------------------
// champion finder — highlight, never filter

function makeNamedDataset(names: string[]): Graph1SnapshotDataset {
  const ds = makeStaticDataset();
  ds.entities = {} as Graph1SnapshotDataset["entities"];
  for (const name of names) {
    ds.entities[`champion:${name}`] = {
      id: `champion:${name}`,
      type: "champion",
      displayName: name,
      identityStatus: "canonical",
      media: { kind: "initials", value: "XX" },
    };
  }
  ds.rows = names.map((name, i) => ({
    rankedEntityId: `champion:${name}`,
    values: { base: (names.length - i) * 100 },
  }));
  return ds;
}

const PUNCTUATED = [
  "Kha'Zix",
  "Kai'Sa",
  "K'Sante",
  "Dr. Mundo",
  "Nunu & Willump",
  "Master Yi",
  "Aurelion Sol",
  "Bard",
];

function findIn(names: string[], query: string) {
  const ds = makeNamedDataset(names);
  const rows = buildStatBoard(ds, {
    pointId: "base",
    order: "highest",
    rowCount: ALL_ROWS,
  });
  return { rows, result: findChampions(rows, ds.entities, query), ds };
}

describe("normalizeChampionName", () => {
  it("strips case and punctuation", () => {
    expect(normalizeChampionName("Kha'Zix")).toBe("khazix");
    expect(normalizeChampionName("Dr. Mundo")).toBe("drmundo");
    expect(normalizeChampionName("Nunu & Willump")).toBe("nunuwillump");
    expect(normalizeChampionName("  Master Yi  ")).toBe("masteryi");
  });
});

describe("findChampions", () => {
  it("matches case-insensitively", () => {
    for (const q of ["bard", "BARD", "BaRd"]) {
      expect(findIn(PUNCTUATED, q).result.best).toBe("champion:Bard");
    }
  });

  it.each([
    ["khazix", "Kha'Zix"],
    ["kha'zix", "Kha'Zix"],
    ["KhaZix", "Kha'Zix"],
    ["ksante", "K'Sante"],
    ["dr mundo", "Dr. Mundo"],
    ["dr. mundo", "Dr. Mundo"],
    ["drmundo", "Dr. Mundo"],
    ["nunu", "Nunu & Willump"],
    ["nunu & willump", "Nunu & Willump"],
    ["master yi", "Master Yi"],
    ["aurelion", "Aurelion Sol"],
  ])("is punctuation-safe: %s finds %s", (query, expected) => {
    expect(findIn(PUNCTUATED, query).result.best).toBe(`champion:${expected}`);
  });

  it("highlights every match, not just one", () => {
    const { result } = findIn(PUNCTUATED, "sa");
    // "kaisa" and "ksante" both contain "sa" once normalized
    expect(result.matches.size).toBeGreaterThan(1);
    expect(result.matches.has("champion:K'Sante")).toBe(true);
    expect(result.matches.has("champion:K'Sante")).toBe(true);
  });

  it("prefers an EXACT name for the scroll target over a better-ranked prefix", () => {
    // "Nunu" ranks first but "Nunu & Willump" is the exact typed name
    const { result } = findIn(["Nunu", "Nunu & Willump"], "nunu & willump");
    expect(result.best).toBe("champion:Nunu & Willump");
    expect(result.matches.size).toBe(1);
  });

  it("picks the better-ranked row when no match is exact", () => {
    const { rows, result } = findIn(PUNCTUATED, "sa");
    const bestRank = rows.find((r) => r.entityId === result.best)!.rank;
    for (const id of result.matches) {
      expect(rows.find((r) => r.entityId === id)!.rank).toBeGreaterThanOrEqual(
        bestRank,
      );
    }
  });

  it("reports a miss without throwing", () => {
    const { result } = findIn(PUNCTUATED, "zzzzz");
    expect(result.missed).toBe(true);
    expect(result.best).toBeNull();
    expect(result.matches.size).toBe(0);
  });

  it("does nothing below the minimum query length", () => {
    expect(MIN_FIND_QUERY).toBe(2);
    for (const q of ["", " ", "b", "'"]) {
      const { result } = findIn(PUNCTUATED, q);
      expect(result.matches.size).toBe(0);
      expect(result.best).toBeNull();
      // an under-length query is not a MISS — nothing was searched for
      expect(result.missed).toBe(false);
    }
  });

  it("never changes the ranking or the rows it was given", () => {
    const ds = makeNamedDataset(PUNCTUATED);
    const rows = buildStatBoard(ds, {
      pointId: "base",
      order: "highest",
      rowCount: ALL_ROWS,
    });
    const before = rows.map((r) => `${r.rank}:${r.entityId}:${r.label}`);
    findChampions(rows, ds.entities, "bard");
    expect(rows.map((r) => `${r.rank}:${r.entityId}:${r.label}`)).toEqual(
      before,
    );
    expect(rows).toHaveLength(PUNCTUATED.length);
  });

  it("tolerates a row whose entity is missing from the registry", () => {
    const ds = makeNamedDataset(PUNCTUATED);
    const rows = buildStatBoard(ds, {
      pointId: "base",
      order: "highest",
      rowCount: ALL_ROWS,
    });
    delete ds.entities["champion:Bard"];
    expect(() => findChampions(rows, ds.entities, "bard")).not.toThrow();
    expect(findChampions(rows, ds.entities, "bard").missed).toBe(true);
  });
});
