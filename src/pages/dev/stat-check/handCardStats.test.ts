import { describe, expect, it } from "vitest";
import { cardCategoryValue, categoryValueAccessibleText, compactCategoryLabel, handCardCategoryValues } from "./handCardStats";
import { STAT_CATEGORIES, compareCategory, generateCategoryBoard, type StatCategory, type StatCheckCard } from "./statCheckEngine";
import { STAT_CHECK_FIXTURE_DECK } from "./fixtureDeck";

const category = (id: string): StatCategory => {
  const found = STAT_CATEGORIES.find((entry) => entry.id === id);
  if (!found) throw new Error(`unknown category ${id}`);
  return found;
};

const card = (name: string): StatCheckCard => {
  const found = STAT_CHECK_FIXTURE_DECK.find((entry) => entry.name === name);
  if (!found) throw new Error(`unknown card ${name}`);
  return found;
};

describe("compactCategoryLabel", () => {
  it("carries the level for level-scaled categories", () => {
    expect(compactCategoryLabel(category("highest-hp-1"))).toBe("HP1");
    expect(compactCategoryLabel(category("highest-hp-18"))).toBe("HP18");
    expect(compactCategoryLabel(category("lowest-ad-1"))).toBe("AD1");
    expect(compactCategoryLabel(category("highest-ad-18"))).toBe("AD18");
    expect(compactCategoryLabel(category("highest-armor-1"))).toBe("AR1");
    expect(compactCategoryLabel(category("lowest-mr-1"))).toBe("MR1");
  });

  it("omits any level for level-independent categories", () => {
    expect(compactCategoryLabel(category("highest-move-speed"))).toBe("MS");
    expect(compactCategoryLabel(category("lowest-attack-range"))).toBe("RNG");
  });

  it("distinguishes level 1 from level 18 in the same family", () => {
    expect(compactCategoryLabel(category("highest-hp-1"))).not.toBe(compactCategoryLabel(category("highest-hp-18")));
  });
});

describe("handCardCategoryValues", () => {
  it("returns exactly one row per board category, in lane order", () => {
    const categories = [category("highest-hp-1"), category("lowest-armor-1"), category("highest-ad-18")];
    const rows = handCardCategoryValues(card("Garen"), categories);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.laneIndex)).toEqual([0, 1, 2]);
    expect(rows.map((row) => row.category.id)).toEqual(categories.map((entry) => entry.id));
  });

  it("resolves level-1 values from the champion's base stats", () => {
    const rows = handCardCategoryValues(card("Garen"), [category("highest-hp-1")]);
    // Garen fixture: 690 base health.
    expect(rows[0].value).toBe("690");
    expect(rows[0].label).toBe("HP1");
  });

  it("resolves level-18 values through the scaling path, not the base value", () => {
    const rows = handCardCategoryValues(card("Garen"), [category("highest-hp-18")]);
    const base = handCardCategoryValues(card("Garen"), [category("highest-hp-1")])[0].value;
    expect(rows[0].value).not.toBe(base);
    // The engine's `whole` formatter groups thousands, so compare on digits.
    expect(Number(rows[0].value.replace(/,/g, ""))).toBeGreaterThan(Number(base.replace(/,/g, "")));
    // Same authoritative resolver the lane comparison uses.
    expect(rows[0].value).toBe(category("highest-hp-18").formatValue(category("highest-hp-18").getValue(card("Garen"))));
  });

  it("resolves level-independent move speed and attack range", () => {
    const rows = handCardCategoryValues(card("Caitlyn"), [category("highest-move-speed"), category("highest-attack-range")]);
    expect(rows[0].value).toBe("325");
    expect(rows[0].label).toBe("MS");
    expect(rows[1].value).toBe("650");
    expect(rows[1].label).toBe("RNG");
  });

  it("keeps duplicate stat families as separate lane rows", () => {
    const categories = [category("highest-hp-1"), category("lowest-hp-18"), category("highest-armor-1")];
    const rows = handCardCategoryValues(card("Ahri"), categories);
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.family === "health")).toHaveLength(2);
    // Both health rows are present with distinguishable labels and values.
    expect(rows[0].label).toBe("HP1");
    expect(rows[1].label).toBe("HP18");
    expect(rows[0].value).not.toBe(rows[1].value);
  });

  it("shows the plain numeric value for lowest-direction categories", () => {
    const highest = handCardCategoryValues(card("Ahri"), [category("highest-hp-1")])[0];
    const lowest = handCardCategoryValues(card("Ahri"), [category("lowest-hp-1")])[0];
    // Direction changes the contest objective, never the number.
    expect(lowest.value).toBe(highest.value);
  });

  it("carries no item bonus when no item applies", () => {
    const rows = handCardCategoryValues(card("Garen"), [category("highest-hp-1")], null);
    expect(rows[0].value).toBe("690");
  });
});

describe("cardCategoryValue item adjustment", () => {
  it("adds a compatible item bonus exactly as the comparison does", () => {
    const hp = category("highest-hp-1");
    const row = cardCategoryValue(card("Garen"), hp, 0, "ruby-crystal");
    const contest = compareCategory(hp, card("Garen"), card("Ahri"), "ruby-crystal", null);
    expect(row.value).toBe(hp.formatValue(contest.playerValue));
    expect(row.value).toBe("840");
  });

  it("leaves an incompatible item out of the value", () => {
    const range = category("highest-attack-range");
    const row = cardCategoryValue(card("Caitlyn"), range, 0, "ruby-crystal");
    const contest = compareCategory(range, card("Caitlyn"), card("Ahri"), "ruby-crystal", null);
    expect(row.value).toBe(range.formatValue(contest.playerValue));
    expect(row.value).toBe("650");
  });

  it("applies a positive bonus in a lowest lane without inverting it", () => {
    const lowHp = category("lowest-hp-1");
    const row = cardCategoryValue(card("Garen"), lowHp, 1, "ruby-crystal");
    expect(row.value).toBe("840");
  });
});

describe("hand values agree with the lane comparison", () => {
  it("matches compareCategory for every generated board category", () => {
    const categories = generateCategoryBoard("hand-rows-agreement", 1);
    const player = card("Garen");
    const opponent = card("Ahri");
    const rows = handCardCategoryValues(player, categories);
    rows.forEach((row) => {
      const contest = compareCategory(row.category, player, opponent);
      expect(row.value).toBe(row.category.formatValue(contest.playerValue));
    });
  });
});

describe("categoryValueAccessibleText", () => {
  it("spells out the full category meaning", () => {
    const row = handCardCategoryValues(card("Garen"), [category("highest-hp-18")])[0];
    expect(categoryValueAccessibleText(row)).toBe(`Highest level-18 health: ${row.value}`);
  });
});
