/**
 * Phase 5 — the pure snapshot ranking layer.
 *
 * `buildStatBoard` is the whole reason this family is not a race: it is the
 * only place ordering happens, it does it in BOTH directions, and it is a
 * pure function of (payload, point, order, topN). These tests pin the
 * ordering rule, the tie rule, the bar rule and the total-parse guarantees.
 */
import { describe, expect, it } from "vitest";

import {
  assertSnapshotDataset,
  buildStatBoard,
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
      topN: 10,
    });
    expect(names(rows)).toEqual(["Bravo", "Alpha", "Charlie"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("ranks LOWEST first — the case a race engine cannot express", () => {
    const rows = buildStatBoard(makeLevelDataset(), {
      pointId: "20",
      order: "lowest",
      topN: 10,
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
          topN: 10,
        }),
      )[0],
    ).toBe("Alpha");
  });

  it("breaks ties alphabetically in BOTH directions", () => {
    const ds = makeLevelDataset(); // Bravo and Charlie both 3000 at level 1
    const highest = names(
      buildStatBoard(ds, { pointId: "1", order: "highest", topN: 10 }),
    );
    const lowest = names(
      buildStatBoard(ds, { pointId: "1", order: "lowest", topN: 10 }),
    );
    expect(highest).toEqual(["Alpha", "Bravo", "Charlie"]);
    // the tied pair keeps alphabetical order even when the sort is reversed
    expect(lowest.indexOf("Bravo")).toBeLessThan(lowest.indexOf("Charlie"));
  });

  it("caps at topN and always yields at least one row", () => {
    const ds = makeLevelDataset();
    expect(
      buildStatBoard(ds, { pointId: "20", order: "highest", topN: 2 }),
    ).toHaveLength(2);
    expect(
      buildStatBoard(ds, { pointId: "20", order: "highest", topN: 0 }),
    ).toHaveLength(1);
  });

  it("skips rows that do not carry the requested point", () => {
    const ds = makeLevelDataset();
    delete (ds.rows[0].values as Record<string, number>)["20"];
    const rows = buildStatBoard(ds, {
      pointId: "20",
      order: "highest",
      topN: 10,
    });
    expect(names(rows)).toEqual(["Bravo", "Charlie"]);
  });
});

describe("buildStatBoard values and bars", () => {
  it("prints units through valueDisplay", () => {
    const rows = buildStatBoard(makeLevelDataset(), {
      pointId: "20",
      order: "highest",
      topN: 10,
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
      topN: 5,
    });
    expect(rows[0].label).toBe("2,613");
  });

  it("scales bars to the widest DISPLAYED row", () => {
    const rows = buildStatBoard(makeLevelDataset(), {
      pointId: "20",
      order: "highest",
      topN: 10,
    });
    expect(rows[0].barFraction).toBe(1);
    expect(rows[1].barFraction).toBeCloseTo(9000 / 12000);
  });

  it("gives a lowest board a rising staircase — rank 1 is the shortest bar", () => {
    const rows = buildStatBoard(makeLevelDataset(), {
      pointId: "20",
      order: "lowest",
      topN: 10,
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
      topN: 10,
    });
    expect(rows.every((r) => r.barFraction === 0)).toBe(true);
  });

  it("treats a payload with no valueDisplay as raw integers", () => {
    const ds = makeLevelDataset();
    delete ds.definition.metric.valueDisplay;
    const rows = buildStatBoard(ds, {
      pointId: "20",
      order: "highest",
      topN: 1,
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
        topN: 20,
      }),
    ).toBe("Top 20 Highest Armor at Level 20");
    expect(
      statBoardTitle(makeLevelDataset(), {
        pointId: "1",
        order: "lowest",
        topN: 10,
      }),
    ).toBe("Top 10 Lowest Armor at Level 1");
  });

  it("omits the level clause for a stat that has no levels", () => {
    expect(
      statBoardTitle(makeStaticDataset(), {
        pointId: "base",
        order: "highest",
        topN: 10,
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
