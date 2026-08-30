/**
 * The collapsed builder row's one line.
 *
 * The property under test is that it is CATALOG-DRIVEN: the same function
 * produces the right line for a quiz, a card block and a Mastery slice without
 * knowing any of their ids, and degrades safely for a module this build has
 * never heard of.
 */
import { describe, expect, it } from "vitest";
import { summarizeSegment } from "@/lib/admin/rankedSegmentSummary";
import type { CatalogModule, SegmentSpecJson } from "@/lib/admin/rankedFormatApi";

const QUIZ: CatalogModule = {
  module_id: "quiz", module_version: 1, label: "Quiz",
  description: "One question.", defaults: { module_id: "quiz", module_version: 1 },
  fields: [
    { key: "module_config.pool", label: "Question pool", type: "enum", required: true,
      options: [{ value: "easy_item_cost", label: "easy_item_cost" }] },
    { key: "timer_seconds", label: "Timer (seconds)", type: "number", required: true },
  ],
};

const META_REFLEX: CatalogModule = {
  module_id: "item_cost_duel", module_version: 4, label: "Meta Reflex",
  description: "Five cards.", defaults: { module_id: "item_cost_duel", module_version: 4 },
  fields: [
    { key: "module_config.families", label: "Card families", type: "multi_enum",
      required: true, options: [{ value: "item_cost", label: "item_cost" }] },
    { key: "card_timer_seconds", label: "Seconds per card", type: "number", required: true },
  ],
  fixed: { challenge_count: 5, scoring: "additive" },
};

const MASTERY: CatalogModule = {
  module_id: "mastery_slice", module_version: 1, label: "Mastery",
  description: "A slice.", defaults: { module_id: "mastery_slice", module_version: 1 },
  fields: [
    { key: "module_config.mastery_set_id", label: "Set", type: "enum", required: true,
      options: [{ value: "playtest.matchup.ahri.syndra", label: "Ahri vs Syndra" }] },
    { key: "challenge_count", label: "Questions", type: "integer", required: true },
  ],
};

const segment = (over: Partial<SegmentSpecJson>): SegmentSpecJson =>
  ({ module_id: "x", module_version: 1, ...over });

describe("summarizeSegment", () => {
  it("summarises a quiz by its pool and timer", () => {
    expect(summarizeSegment(
      segment({ timer_seconds: 20, challenge_count: 1,
                module_config: { pool: "easy_item_cost" } }), QUIZ),
    ).toBe("Quiz — easy_item_cost — 20s");
  });

  it("summarises a card block by its fixed count and per-card timer", () => {
    // The count comes from the catalog's `fixed` block: it is what the module
    // IS, and no segment field carries it.
    expect(summarizeSegment(
      segment({ card_timer_seconds: 6, module_config: { families: ["item_cost"] } }),
      META_REFLEX)).toBe("Meta Reflex — 5 cards — 6s/card");
  });

  it("summarises a Mastery slice by its SET and question count", () => {
    expect(summarizeSegment(
      segment({ challenge_count: 5,
                module_config: { mastery_set_id: "playtest.matchup.ahri.syndra" } }),
      MASTERY)).toBe("Mastery — Ahri vs Syndra — 5 questions");
  });

  it("says `1 question` where one question is a CHOSEN setting", () => {
    expect(summarizeSegment(
      segment({ challenge_count: 1,
                module_config: { mastery_set_id: "playtest.matchup.ahri.syndra" } }),
      MASTERY)).toBe("Mastery — Ahri vs Syndra — 1 question");
  });

  it("omits the structural count every one-question module carries", () => {
    // A Quiz is one question by construction. Printing it on every row would
    // be noise in the one line that has to earn its space.
    expect(summarizeSegment(segment({ challenge_count: 1 }), QUIZ)).toBe("Quiz");
  });

  it("falls back to the raw value when an option has no label", () => {
    expect(summarizeSegment(
      segment({ module_config: { pool: "pool_added_after_this_build" } }), QUIZ),
    ).toBe("Quiz — pool_added_after_this_build");
  });

  it("names a module the catalog does not describe, and invents nothing", () => {
    expect(summarizeSegment(
      segment({ module_id: "future_module", module_version: 7, challenge_count: 3 }),
      undefined)).toBe("future_module.v7");
  });

  it("leaves out what a segment has not set", () => {
    expect(summarizeSegment(segment({}), QUIZ)).toBe("Quiz");
  });
});
