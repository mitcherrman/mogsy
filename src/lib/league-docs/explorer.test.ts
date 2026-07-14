import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  defaultFilters,
  defaultSortForMode,
  filtersFromSearch,
  filtersToRequestParams,
  writeFiltersToSearch,
  type ExplorerFilters,
} from "./explorer";

describe("filtersFromSearch", () => {
  it("returns defaults for an empty query string", () => {
    const f = filtersFromSearch(new URLSearchParams(""));
    expect(f).toEqual(defaultFilters());
    expect(f.sort).toBe("presence");
    expect(f.competition_preset).toBeNull();
    expect(f.league_groups).toEqual([]);
    expect(f.page).toBe(1);
  });

  it("parses a fully specified query string", () => {
    const sp = new URLSearchParams(
      "mode=raw&year=2026&competition_preset=tier1&champion=ahri&event_type=ban&result=win&side=Blue&sort=tournament&order=asc&page=3&page_size=50",
    );
    const f = filtersFromSearch(sp);
    expect(f.mode).toBe("raw");
    expect(f.year).toBe(2026);
    expect(f.competition_preset).toBe("tier1");
    expect(f.champion).toBe("ahri");
    expect(f.event_type).toBe("ban");
    expect(f.sort).toBe("tournament");
    expect(f.page).toBe(3);
    expect(f.page_size).toBe(50);
  });

  it("parses repeated array params (groups, splits, stages)", () => {
    const sp = new URLSearchParams(
      "league_groups=tier1&league_groups=erl&splits=spring&stages=playoffs&stages=regular_season&leagues=lck",
    );
    const f = filtersFromSearch(sp);
    expect(f.league_groups).toEqual(["tier1", "erl"]);
    expect(f.splits).toEqual(["spring"]);
    expect(f.stages).toEqual(["playoffs", "regular_season"]);
    expect(f.leagues).toEqual(["lck"]);
  });

  it("honors a legacy scope= URL as a competition_preset alias", () => {
    expect(filtersFromSearch(new URLSearchParams("scope=major")).competition_preset).toBe("major");
    expect(filtersFromSearch(new URLSearchParams("scope=international")).competition_preset).toBe("international");
    // explicit competition_preset wins over legacy scope
    expect(filtersFromSearch(new URLSearchParams("scope=major&competition_preset=erls")).competition_preset).toBe("erls");
  });

  it("drops out-of-allowlist array values but keeps valid ones", () => {
    const f = filtersFromSearch(new URLSearchParams("league_groups=tier1&league_groups=bogus&splits=autumn&splits=spring"));
    expect(f.league_groups).toEqual(["tier1"]);
    expect(f.splits).toEqual(["spring"]);
  });

  it("falls back to safe values for invalid params", () => {
    const sp = new URLSearchParams("mode=hack&sort=drop_table&page_size=7&page=-4&year=99&side=Green");
    const f = filtersFromSearch(sp);
    expect(f.mode).toBe("aggregate");
    expect(f.sort).toBe("presence");
    expect(f.page_size).toBe(defaultFilters().page_size);
    expect(f.page).toBe(1);
    expect(f.year).toBeNull();
    expect(f.side).toBeNull();
  });
});

describe("writeFiltersToSearch", () => {
  it("omits default-valued filters and preserves foreign params", () => {
    const existing = new URLSearchParams("view=explorer");
    const sp = writeFiltersToSearch(defaultFilters(), existing);
    expect(sp.get("view")).toBe("explorer");
    expect(sp.get("competition_preset")).toBeNull();
    expect(sp.get("sort")).toBeNull();
    expect(sp.get("page")).toBeNull();
  });

  it("round-trips a complex filter set (arrays + preset) through the URL", () => {
    const f: ExplorerFilters = {
      ...defaultFilters(),
      mode: "raw",
      year: 2026,
      competition_preset: "custom",
      league_groups: ["tier1", "erl"],
      leagues: ["lck"],
      tournament_families: ["msi"],
      splits: ["spring"],
      stages: ["playoffs"],
      regions: ["korea"],
      team: "T1",
      event_type: "pick",
      sort: "team",
      order: "asc",
      page: 2,
      page_size: 100,
    };
    const sp = writeFiltersToSearch(f, new URLSearchParams());
    const restored = filtersFromSearch(sp);
    expect(restored).toEqual(f);
  });

  it("writes competition_preset (not legacy scope) on serialize", () => {
    const sp = writeFiltersToSearch({ ...defaultFilters(), competition_preset: "tier1" }, new URLSearchParams());
    expect(sp.get("competition_preset")).toBe("tier1");
    expect(sp.get("scope")).toBeNull();
  });
});

describe("filtersToRequestParams", () => {
  it("always sends mode/sort/order/page/page_size and omits empty filters", () => {
    const p = filtersToRequestParams(defaultFilters());
    expect(p.get("mode")).toBe("aggregate");
    expect(p.get("page")).toBe("1");
    expect(p.get("competition_preset")).toBeNull();
    expect(p.get("event_type")).toBeNull();
    expect(p.get("champion")).toBeNull();
  });

  it("appends repeated array params", () => {
    const p = filtersToRequestParams({ ...defaultFilters(), league_groups: ["tier1", "erl"], splits: ["spring"] });
    expect(p.getAll("league_groups")).toEqual(["tier1", "erl"]);
    expect(p.getAll("splits")).toEqual(["spring"]);
  });
});

describe("activeFilterCount", () => {
  it("counts each array member and each set single filter", () => {
    expect(activeFilterCount(defaultFilters())).toBe(0);
    const f = { ...defaultFilters(), year: 2026, league_groups: ["tier1", "erl"], splits: ["spring"], champion: "ahri" };
    expect(activeFilterCount(f)).toBe(5); // year + 2 groups + 1 split + champion
  });
});

describe("defaultSortForMode", () => {
  it("maps each mode to its default sort", () => {
    expect(defaultSortForMode("aggregate")).toBe("presence");
    expect(defaultSortForMode("raw")).toBe("match_date");
  });
});
