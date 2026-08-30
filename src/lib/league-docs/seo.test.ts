import { describe, expect, it } from "vitest";
import { buildChampionJsonLd, buildChampionSeo, championDocPath } from "./seo";
import type { ChampionDoc } from "./api";

const doc: ChampionDoc = {
  ok: true,
  champion: { name: "Ahri", slug: "ahri", id: 103, title: "the Nine-Tailed Fox", resource_type: "Mana", release_date: "2011-12-14" },
  stats: null,
  abilities: [],
  meta: { patch: "26.17", source: "wiki.leagueoflegends.com", last_updated: "2026-08-20", last_verified: "2026-08-20", verification_status: "verified" },
};

describe("champion doc SEO", () => {
  it("builds a unique title, description, and canonical per champion", () => {
    const seo = buildChampionSeo(doc);
    expect(seo.title).toContain("Ahri");
    expect(seo.description).toContain("Nine-Tailed Fox");
    expect(seo.description.length).toBeLessThanOrEqual(158);
    expect(seo.canonical).toBe("https://mogzy.lol/lol/docs/champions/ahri");
    expect(seo.path).toBe(championDocPath("ahri"));
  });

  it("builds structured data referencing the champion and canonical URL", () => {
    const seo = buildChampionSeo(doc);
    const jsonLd = buildChampionJsonLd(doc, seo);
    expect(jsonLd[0]["@type"]).toBe("Article");
    expect(jsonLd[0].url).toBe(seo.canonical);
    expect(jsonLd[0].about).toEqual({ "@type": "Thing", name: "Ahri" });
  });
});
