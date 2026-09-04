import { describe, expect, it } from "vitest";

import { normalizeTablesIndex } from "./api";
import { INDEX_FIXTURE } from "./fixtures";
import {
  buildCategoryViews,
  categoryPath,
  findCategoryBySlug,
  findTableBySlug,
  groupByShelf,
  humanizeToken,
  tablePath,
  tableSlug,
} from "./presentation";

const VIEWS = buildCategoryViews(normalizeTablesIndex(INDEX_FIXTURE).categories);

describe("category presentation", () => {
  it("covers every category the live backend publishes", () => {
    // Every published category reaches the navigation. A category with no
    // presentation entry would still appear, with a derived label — this
    // asserts none of the current eight fell back.
    expect(VIEWS).toHaveLength(INDEX_FIXTURE.categories.length);
    for (const view of VIEWS) {
      expect(view.label).not.toContain("_");
      expect(view.blurb).not.toBe("");
      expect(view.tables.length).toBeGreaterThan(0);
    }
  });

  it("gives every published table a unique slug within its category", () => {
    for (const view of VIEWS) {
      const slugs = view.tables.map((table) => table.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const slug of slugs) {
        expect(slug).toMatch(/^[a-z0-9-]+$/);
      }
    }
  });

  it("derives a table slug from its id rather than a hardcoded map", () => {
    expect(tableSlug("minion_waves.study.wave_times", "minion_waves")).toBe("wave-times");
    expect(tableSlug("takedown_economy.study.kill_gold", "takedown_economy")).toBe("kill-gold");
    // A table id that does not follow the convention still yields a slug.
    expect(tableSlug("odd_id_without_study", "minion_waves")).toBe("odd-id-without-study");
  });

  it("falls back to a derived label and slug for an unmapped category", () => {
    const views = buildCategoryViews([
      {
        category: "brand_new_thing",
        study_tables: [
          { table_id: "brand_new_thing.study.first", title: "First", subtitle: "", row_count: 3 },
        ],
      },
    ]);
    expect(views).toHaveLength(1);
    expect(views[0].slug).toBe("brand-new-thing");
    expect(views[0].label).toBe("Brand new thing");
    expect(views[0].tables[0].slug).toBe("first");
  });

  it("humanizes a snake_case token into a sentence", () => {
    expect(humanizeToken("takedown_economy")).toBe("Takedown economy");
    expect(humanizeToken("")).toBe("");
  });

  it("sorts categories into shelves without losing any", () => {
    const shelves = groupByShelf(VIEWS);
    const shelved = shelves.flatMap((shelf) => shelf.categories);
    expect(shelved).toHaveLength(VIEWS.length);
    expect(shelves.map((shelf) => shelf.shelf)).toEqual(["minions", "map", "economy"]);
  });

  it("builds the URLs the router registers", () => {
    const category = findCategoryBySlug(VIEWS, "minion-waves");
    expect(category).toBeDefined();
    expect(categoryPath(category!)).toBe("/lol/docs/mechanics/minion-waves");
    const table = findTableBySlug(category!, "wave-times");
    expect(table).toBeDefined();
    expect(tablePath(table!)).toBe("/lol/docs/mechanics/minion-waves/wave-times");
  });

  it("returns undefined for a slug nothing publishes", () => {
    expect(findCategoryBySlug(VIEWS, "not-a-subject")).toBeUndefined();
    const category = findCategoryBySlug(VIEWS, "structures")!;
    expect(findTableBySlug(category, "not-a-table")).toBeUndefined();
  });
});
