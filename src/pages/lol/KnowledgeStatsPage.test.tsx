import { describe, expect, it } from "vitest";
import { entityHref } from "@/lib/public-knowledge-stats/entity-links";

describe("KnowledgeStatsPage archive links", () => {
  it("links supported entities into the existing Archives", () => {
    expect(entityHref({ entity_type: "champion", entity_key: "Dr. Mundo" }))
      .toBe("/lol/docs/champions/dr-mundo");
    expect(entityHref({ entity_type: "item", entity_key: "Rabadon's Deathcap" }))
      .toBe("/items/rabadons-deathcap");
  });

  it("does not invent archive destinations for unsupported entity pages", () => {
    expect(entityHref({ entity_type: "rune", entity_key: "Conqueror" })).toBeNull();
    expect(entityHref({ entity_type: "summoner_spell", entity_key: "Flash" })).toBeNull();
  });
});
