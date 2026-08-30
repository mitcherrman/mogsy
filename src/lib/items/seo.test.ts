import { describe, expect, it } from "vitest";
import { itemEntries } from "@/lib/seo/sitemap";
import { buildItemSeo } from "./seo";
import type { CanonicalItem } from "./types";

const mandate: CanonicalItem = {
  id: 4005, slug: "imperial-mandate", name: "Imperial Mandate",
  icon_path: "assets/items_wiki/4005.png", is_current_sr: true, tier: "3",
  types: ["Legendary"], modes: ["classic sr 5v5"], acquisition: "shop",
  acquisition_requirement: null, purchasable: true, shop_price: 2400,
  total_cost: 2400, base_cost: 1700, combine_cost: 700, price_source: null,
  sell_gold: null, builds_into: [],
  stats: [
    { key: "ap", label: "Ability Power", value: 60, unit: "flat", display: "60" },
    { key: "ah", label: "Ability Haste", value: 15, unit: "flat", display: "15" },
    { key: "mp5", label: "Base Mana Regen", value: 150, unit: "percent", display: "150%" },
  ],
  components: [
    { name: "Amplifying Tome", slug: "amplifying-tome", item_id: 1052, quantity: 2, icon_path: null },
    { name: "Bandleglass Mirror", slug: "bandleglass-mirror", item_id: 4642, quantity: 1, icon_path: null },
  ],
  effects: [],
  provenance: { source: "league-wiki", source_url: null, source_revision: 4051358,
    fetched_at: null, parser_version: "item_canonical_lua_v1", validation_status: "validated_current" },
};

describe("item SEO", () => {
  it("uses canonical facts and host", () => {
    const seo = buildItemSeo(mandate, "https://api.example/assets/items_wiki/4005.png");
    expect(seo.title).toBe("Imperial Mandate — Stats, Cost, Recipe & Effects | Mogzy");
    expect(seo.description).toContain("2,400 gold");
    expect(seo.description).toContain("60 Ability Power");
    expect(seo.canonical).toBe("https://mogzy.lol/items/imperial-mandate");
  });

  it("publishes every slug the backend's public /api/items roster returns — no separate manifest gate", () => {
    expect(itemEntries(["imperial-mandate", "amplifying-tome"]).map((entry) => entry.path))
      .toEqual(["/items/imperial-mandate", "/items/amplifying-tome"]);
    expect(itemEntries([])).toEqual([]);
  });
});
