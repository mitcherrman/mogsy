/**
 * Filtering and facet tests.
 *
 * The properties that matter: no filter is a true identity, filtering is
 * deterministic, clearing reproduces the original frames exactly, and an
 * empty result never crashes the engine.
 */
import { describe, expect, it } from "vitest";

import { stateAt } from "./engine";
import {
  EMPTY_FILTERS,
  applyFilters,
  deriveFacets,
  eventYear,
  filteredDataset,
  isFilterActive,
  partitionFilterSpecs,
  reconcileFilters,
  type Graph1FilterState,
} from "./filters";
import { buildRaceIndex } from "./raceIndex";
import { makeDataset } from "./testFixtures";
import type { VisualizationDataset } from "./contract";

const KR = { region: "Korea", league: "LCK" };
const EU = { region: "EMEA", league: "LEC" };
const CN = { region: "China", league: "LPL" };

function race(): VisualizationDataset {
  return makeDataset([
    ["player:A", "2020-01-01T10:00:00Z", 1, { gameId: "g1", ...KR }],
    ["player:B", "2020-06-01T10:00:00Z", 0, { gameId: "g2", ...EU }],
    ["player:A", "2021-01-01T10:00:00Z", 1, { gameId: "g3", ...KR }],
    ["player:C", "2021-06-01T10:00:00Z", 1, { gameId: "g4", ...CN }],
    ["player:B", "2022-01-01T10:00:00Z", 0, { gameId: "g5", ...EU }],
    ["player:A", "2023-01-01T10:00:00Z", 1, { gameId: "g6", ...KR }],
  ]);
}

const filters = (o: Partial<Graph1FilterState> = {}): Graph1FilterState => ({
  ...EMPTY_FILTERS,
  ...o,
});

describe("identity", () => {
  it("no filter state returns the original event array by reference", () => {
    const ds = race();
    expect(applyFilters(ds, EMPTY_FILTERS)).toBe(ds.events);
  });

  it("no filter state returns the original dataset by reference", () => {
    const ds = race();
    expect(filteredDataset(ds, EMPTY_FILTERS)).toBe(ds);
  });

  it("isFilterActive is false only for the empty state", () => {
    expect(isFilterActive(EMPTY_FILTERS)).toBe(false);
    expect(isFilterActive(filters({ yearFrom: 2020 }))).toBe(true);
    expect(isFilterActive(filters({ yearTo: 2020 }))).toBe(true);
    expect(isFilterActive(filters({ regions: ["Korea"] }))).toBe(true);
    expect(isFilterActive(filters({ leagues: ["LCK"] }))).toBe(true);
  });

  it("does not mutate the source dataset", () => {
    const ds = race();
    const snapshot = JSON.parse(JSON.stringify(ds));
    filteredDataset(ds, filters({ regions: ["Korea"] }));
    expect(ds).toEqual(snapshot);
  });
});

describe("individual dimensions", () => {
  it("filters by year range inclusively", () => {
    const events = applyFilters(race(), filters({ yearFrom: 2021, yearTo: 2022 }));
    expect(events.map((e) => e.context.gameId)).toEqual(["g3", "g4", "g5"]);
  });

  it("treats an open bound as unbounded", () => {
    expect(
      applyFilters(race(), filters({ yearFrom: 2022 })).map((e) => e.context.gameId),
    ).toEqual(["g5", "g6"]);
    expect(
      applyFilters(race(), filters({ yearTo: 2020 })).map((e) => e.context.gameId),
    ).toEqual(["g1", "g2"]);
  });

  it("filters by region", () => {
    const events = applyFilters(race(), filters({ regions: ["Korea"] }));
    expect(events.map((e) => e.context.gameId)).toEqual(["g1", "g3", "g6"]);
  });

  it("treats multiple region selections as OR", () => {
    const events = applyFilters(race(), filters({ regions: ["Korea", "China"] }));
    expect(events.map((e) => e.context.gameId)).toEqual(["g1", "g3", "g4", "g6"]);
  });

  it("filters by league", () => {
    const events = applyFilters(race(), filters({ leagues: ["LEC"] }));
    expect(events.map((e) => e.context.gameId)).toEqual(["g2", "g5"]);
  });
});

describe("combined filters", () => {
  it("intersects dimensions", () => {
    const events = applyFilters(
      race(),
      filters({ yearFrom: 2021, regions: ["Korea", "China"] }),
    );
    expect(events.map((e) => e.context.gameId)).toEqual(["g3", "g4", "g6"]);
  });

  it("is deterministic across repeated evaluation", () => {
    const ds = race();
    const state = filters({ yearFrom: 2020, yearTo: 2022, leagues: ["LCK", "LPL"] });
    expect(applyFilters(ds, state)).toEqual(applyFilters(ds, state));
  });

  it("is independent of the order values were selected in", () => {
    const ds = race();
    const a = applyFilters(ds, filters({ regions: ["Korea", "China"] }));
    const b = applyFilters(ds, filters({ regions: ["China", "Korea"] }));
    expect(a).toEqual(b);
  });

  it("preserves source order and original sequence values", () => {
    const events = applyFilters(race(), filters({ regions: ["Korea"] }));
    expect(events.map((e) => e.sequence)).toEqual([0, 2, 5]);
  });
});

describe("clearing reproduces the original race", () => {
  it("filter then clear yields frames identical to never filtering", () => {
    const ds = race();
    const before = buildRaceIndex(ds);
    const filtered = filteredDataset(ds, filters({ regions: ["Korea"] }));
    void buildRaceIndex(filtered);
    const after = buildRaceIndex(filteredDataset(ds, EMPTY_FILTERS));

    for (let p = 0; p <= ds.events.length; p += 0.5) {
      expect(stateAt(after, p, { topN: 10 })).toEqual(
        stateAt(before, p, { topN: 10 }),
      );
    }
  });
});

describe("filtered stream drives the engine correctly", () => {
  it("indexes a non-contiguous sequence without gaps in the race", () => {
    const filtered = filteredDataset(race(), filters({ regions: ["Korea"] }));
    const index = buildRaceIndex(filtered);
    expect(index.eventCount).toBe(3);
    const final = stateAt(index, 3, { topN: 10 });
    expect(final.rows).toHaveLength(1);
    expect(final.rows[0]).toMatchObject({
      entityId: "player:A",
      displayValue: 3,
      displayWins: 3,
    });
  });

  it("recomputes coverage for the filtered race", () => {
    const filtered = filteredDataset(race(), filters({ regions: ["EMEA"] }));
    expect(filtered.coverage.eligibleEventCount).toBe(2);
    expect(filtered.coverage.distinctRankedEntityCount).toBe(1);
    expect(filtered.coverage.firstEventAt).toBe("2020-06-01T10:00:00Z");
    expect(filtered.coverage.lastEventAt).toBe("2022-01-01T10:00:00Z");
  });

  it("keeps entities addressable after filtering", () => {
    const filtered = filteredDataset(race(), filters({ regions: ["Korea"] }));
    for (const event of filtered.events) {
      expect(filtered.entities[event.rankedEntityId]).toBeDefined();
    }
  });
});

describe("empty results", () => {
  it("produces an empty event stream rather than throwing", () => {
    const filtered = filteredDataset(race(), filters({ regions: ["Oceania"] }));
    expect(filtered.events).toHaveLength(0);
    expect(filtered.coverage.eligibleEventCount).toBe(0);
    expect(filtered.coverage.distinctRankedEntityCount).toBe(0);
  });

  it("keeps the original date bounds so the header stays sane", () => {
    const ds = race();
    const filtered = filteredDataset(ds, filters({ yearFrom: 2030 }));
    expect(filtered.coverage.firstEventAt).toBe(ds.coverage.firstEventAt);
  });

  it("an impossible year window yields nothing without crashing", () => {
    const filtered = filteredDataset(
      race(),
      filters({ yearFrom: 2023, yearTo: 2020 }),
    );
    expect(filtered.events).toHaveLength(0);
  });

  it("deriveFacets on an empty stream returns empty domains", () => {
    const facets = deriveFacets(filteredDataset(race(), filters({ yearFrom: 2030 })));
    expect(facets).toEqual({
      years: [],
      minYear: null,
      maxYear: null,
      regions: [],
      leagues: [],
    });
  });
});

describe("facets", () => {
  it("derives every domain in one pass", () => {
    const facets = deriveFacets(race());
    expect(facets.years).toEqual([2020, 2021, 2022, 2023]);
    expect(facets.minYear).toBe(2020);
    expect(facets.maxYear).toBe(2023);
    expect(facets.regions).toEqual([
      { value: "Korea", count: 3 },
      { value: "EMEA", count: 2 },
      { value: "China", count: 1 },
    ]);
    expect(facets.leagues.map((l) => l.value)).toEqual(["LCK", "LEC", "LPL"]);
  });

  it("matches a naive scan", () => {
    const ds = race();
    const naive = new Map<string, number>();
    for (const e of ds.events) {
      const r = e.context.region!;
      naive.set(r, (naive.get(r) ?? 0) + 1);
    }
    const facets = deriveFacets(ds);
    expect(facets.regions).toHaveLength(naive.size);
    for (const { value, count } of facets.regions) {
      expect(count).toBe(naive.get(value));
    }
  });

  it("orders ties alphabetically so output is deterministic", () => {
    const ds = makeDataset([
      ["player:A", "2020-01-01T10:00:00Z", 1, { gameId: "g1", region: "Zeta" }],
      ["player:B", "2020-01-02T10:00:00Z", 1, { gameId: "g2", region: "Alpha" }],
    ]);
    expect(deriveFacets(ds).regions.map((r) => r.value)).toEqual([
      "Alpha",
      "Zeta",
    ]);
  });

  it("ignores events missing a dimension instead of inventing a value", () => {
    const ds = makeDataset([
      ["player:A", "2020-01-01T10:00:00Z", 1, { gameId: "g1", region: "Korea" }],
      ["player:B", "2020-01-02T10:00:00Z", 1, { gameId: "g2" }],
    ]);
    expect(deriveFacets(ds).regions).toEqual([{ value: "Korea", count: 1 }]);
  });

  it("eventYear reads the UTC year without timezone drift", () => {
    expect(eventYear({ occurredAt: "2020-01-01T00:00:00Z" } as never)).toBe(2020);
    expect(eventYear({ occurredAt: "2020-12-31T23:59:59Z" } as never)).toBe(2020);
  });
});

describe("reconcileFilters", () => {
  it("drops selections the dataset cannot satisfy", () => {
    const facets = deriveFacets(race());
    const reconciled = reconcileFilters(
      filters({ regions: ["Korea", "Oceania"], leagues: ["LCS"] }),
      facets,
    );
    expect(reconciled.regions).toEqual(["Korea"]);
    expect(reconciled.leagues).toEqual([]);
  });

  it("clamps a year window into range", () => {
    const facets = deriveFacets(race());
    const reconciled = reconcileFilters(
      filters({ yearFrom: 1999, yearTo: 2099 }),
      facets,
    );
    expect(reconciled.yearFrom).toBe(2020);
    expect(reconciled.yearTo).toBe(2023);
  });

  it("repairs an inverted window instead of yielding nothing", () => {
    const facets = deriveFacets(race());
    const reconciled = reconcileFilters(
      filters({ yearFrom: 2023, yearTo: 2021 }),
      facets,
    );
    expect(reconciled.yearFrom).toBeLessThanOrEqual(reconciled.yearTo!);
  });

  it("leaves a satisfiable state untouched", () => {
    const facets = deriveFacets(race());
    const state = filters({ yearFrom: 2021, yearTo: 2022, regions: ["EMEA"] });
    expect(reconcileFilters(state, facets)).toEqual(state);
  });
});

describe("partitionFilterSpecs", () => {
  it("splits primary from advanced and tolerates an absent schema", () => {
    const specs = [
      { id: "year", advanced: false },
      { id: "league", advanced: true },
    ] as never;
    const { primary, advanced } = partitionFilterSpecs(specs);
    expect(primary.map((s) => s.id)).toEqual(["year"]);
    expect(advanced.map((s) => s.id)).toEqual(["league"]);
    expect(partitionFilterSpecs(undefined)).toEqual({
      primary: [],
      advanced: [],
    });
  });
});
