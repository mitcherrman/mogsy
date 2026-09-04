import { afterEach, describe, expect, it, vi } from "vitest";

import { COMBAT_API_BASE_URL } from "@/lib/combat-lab/api";

import {
  MechanicsTablesApiError,
  fetchStudyTable,
  fetchTablesIndex,
  normalizeStudyTable,
  normalizeTablesIndex,
} from "./api";
import { FOUNTAIN, INDEX_FIXTURE, MINION_BASE_STATS } from "./fixtures";

function mockFetchOnce(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mechanics study-table client", () => {
  it("reads the index from the shared Combat API base", async () => {
    const fetchMock = mockFetchOnce(200, INDEX_FIXTURE);
    const index = await fetchTablesIndex();
    expect(fetchMock).toHaveBeenCalledWith(
      `${COMBAT_API_BASE_URL}/api/mechanics/tables`,
      expect.anything(),
    );
    expect(index.patch).toBe("26.15");
    expect(index.categories.map((category) => category.category)).toContain("minion_waves");
  });

  it("requests one study table by id, url-encoded", async () => {
    const fetchMock = mockFetchOnce(200, FOUNTAIN);
    const table = await fetchStudyTable("base_systems.study.fountain");
    expect(fetchMock).toHaveBeenCalledWith(
      `${COMBAT_API_BASE_URL}/api/mechanics/tables/study/base_systems.study.fountain`,
      expect.anything(),
    );
    expect(table.title).toBe("The fountain");
    expect(table.rows.length).toBeGreaterThan(0);
  });

  it("surfaces the backend's not_found message on a 404", async () => {
    mockFetchOnce(404, { detail: { error: "not_found", message: "no study table 'nope'" } });
    await expect(fetchStudyTable("nope")).rejects.toThrowError(MechanicsTablesApiError);
    await expect(fetchStudyTable("nope")).rejects.toThrowError(/no study table 'nope'/);
  });

  it("falls back to a status message when the error body is unreadable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.reject(new Error("not json")),
      }),
    );
    await expect(fetchTablesIndex()).rejects.toThrowError(/Request failed \(502\)/);
  });
});

describe("study-table normalization", () => {
  it("parses the real backend contract without loss", () => {
    const table = normalizeStudyTable(MINION_BASE_STATS);
    expect(table.columns.map((column) => column.key)).toEqual(
      MINION_BASE_STATS.columns.map((column) => column.key),
    );
    expect(table.rows[0].values).toEqual(MINION_BASE_STATS.rows[0].values);
    expect(table.sections.map((section) => section.key)).toEqual(
      MINION_BASE_STATS.sections.map((section) => section.key),
    );
  });

  it("tolerates missing optional metadata", () => {
    const table = normalizeStudyTable({
      table_id: "x.study.y",
      category: "x",
      title: "Bare table",
      columns: [{ key: "value" }],
      rows: [{ row_id: "r1", label: "Only row", values: { value: 3 } }],
    });
    expect(table.subtitle).toBe("");
    expect(table.verified_through).toBe("");
    expect(table.sections).toEqual([]);
    expect(table.notes).toEqual([]);
    expect(table.source_table_ids).toEqual([]);
    // A column with no label falls back to its key rather than rendering blank.
    expect(table.columns[0]).toEqual({ key: "value", label: "value", unit: "", kind: "text" });
    expect(table.rows[0].fact_ids).toEqual([]);
  });

  it("survives a payload that is not a table at all", () => {
    const table = normalizeStudyTable(null);
    expect(table.rows).toEqual([]);
    expect(table.columns).toEqual([]);
    expect(table.title).toBe("");
  });

  it("drops cells whose value is outside the scalar contract", () => {
    const table = normalizeStudyTable({
      columns: [{ key: "a" }, { key: "b" }],
      rows: [{ row_id: "r", label: "L", values: { a: 1, b: { nested: true } } }],
    });
    expect(table.rows[0].values).toEqual({ a: 1 });
  });

  it("keeps a category the frontend has no presentation entry for", () => {
    const index = normalizeTablesIndex({
      patch: "26.99",
      categories: [
        {
          category: "brand_new_category",
          study_tables: [{ table_id: "brand_new_category.study.thing", title: "Thing", row_count: 2 }],
        },
      ],
    });
    expect(index.categories).toHaveLength(1);
    expect(index.categories[0].category).toBe("brand_new_category");
  });

  it("hides a category that publishes no study table", () => {
    const index = normalizeTablesIndex({
      patch: "26.15",
      categories: [
        { category: "review_only", study_tables: [] },
        {
          category: "real",
          study_tables: [{ table_id: "real.study.a", title: "A", row_count: 1 }],
        },
      ],
    });
    expect(index.categories.map((category) => category.category)).toEqual(["real"]);
  });
});
