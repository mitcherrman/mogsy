import { describe, expect, it } from "vitest";
import {
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
    expect(f.scope).toBe("all-imported");
    expect(f.page).toBe(1);
  });

  it("parses a fully specified query string", () => {
    const sp = new URLSearchParams(
      "mode=raw&year=2026&scope=major&champion=ahri&event_type=ban&result=win&side=Blue&sort=tournament&order=asc&page=3&page_size=50",
    );
    const f = filtersFromSearch(sp);
    expect(f.mode).toBe("raw");
    expect(f.year).toBe(2026);
    expect(f.scope).toBe("major");
    expect(f.champion).toBe("ahri");
    expect(f.event_type).toBe("ban");
    expect(f.result).toBe("win");
    expect(f.side).toBe("Blue");
    expect(f.sort).toBe("tournament");
    expect(f.order).toBe("asc");
    expect(f.page).toBe(3);
    expect(f.page_size).toBe(50);
  });

  it("falls back to safe values for invalid params", () => {
    const sp = new URLSearchParams("mode=hack&sort=drop_table&page_size=7&page=-4&year=99&side=Green");
    const f = filtersFromSearch(sp);
    expect(f.mode).toBe("aggregate");
    expect(f.sort).toBe("presence"); // invalid sort -> default for mode
    expect(f.page_size).toBe(defaultFilters().page_size);
    expect(f.page).toBe(1);
    expect(f.year).toBeNull();
    expect(f.side).toBeNull();
  });

  it("uses the raw-mode default sort when sort is invalid for raw", () => {
    const f = filtersFromSearch(new URLSearchParams("mode=raw&sort=win_rate"));
    // win_rate is an aggregate-only sort key
    expect(f.sort).toBe("match_date");
  });
});

describe("writeFiltersToSearch", () => {
  it("omits default-valued filters and preserves foreign params", () => {
    const existing = new URLSearchParams("view=explorer");
    const sp = writeFiltersToSearch(defaultFilters(), existing);
    expect(sp.get("view")).toBe("explorer");
    expect(sp.get("scope")).toBeNull();
    expect(sp.get("sort")).toBeNull();
    expect(sp.get("page")).toBeNull();
  });

  it("round-trips a non-default filter set through the URL", () => {
    const f: ExplorerFilters = {
      ...defaultFilters(),
      mode: "raw",
      year: 2015,
      scope: "international",
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
});

describe("filtersToRequestParams", () => {
  it("always sends mode/scope/sort/order/page/page_size and omits empty filters", () => {
    const p = filtersToRequestParams(defaultFilters());
    expect(p.get("mode")).toBe("aggregate");
    expect(p.get("scope")).toBe("all-imported");
    expect(p.get("page")).toBe("1");
    expect(p.get("event_type")).toBeNull(); // "all" omitted
    expect(p.get("champion")).toBeNull();
  });
});

describe("defaultSortForMode", () => {
  it("maps each mode to its default sort", () => {
    expect(defaultSortForMode("aggregate")).toBe("presence");
    expect(defaultSortForMode("raw")).toBe("match_date");
  });
});
