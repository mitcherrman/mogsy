import { describe, expect, it } from "vitest";
import {
  buildStaticEntries,
  championDocEntries,
  leagueBlogEntries,
  proYearEntries,
  renderSitemap,
} from "./sitemap";
import { isLeagueBlogPost } from "../blog/league-content";

describe("sitemap builders", () => {
  it("static subset is deterministic and canonical to mogzy.lol", () => {
    const entries = buildStaticEntries();
    expect(entries).toEqual(buildStaticEntries());
    const xml = renderSitemap(entries);
    expect(xml).toContain("<loc>https://mogzy.lol/lol</loc>");
    expect(xml).toContain("<loc>https://mogzy.lol/privacy</loc>");
    expect(xml).not.toContain("mogsy.app");
    expect(xml).not.toContain("mogsy.net");
  });

  it("excludes thin/internal routes from the static subset", () => {
    const paths = buildStaticEntries().map((e) => e.path);
    for (const excluded of [
      "/auth",
      "/admin",
      "/settings",
      "/lol/history",
      "/lol/missed-questions",
      "/dev/ranked-duel",
      "/broadcast/live-view",
      "/shop",
      "/reset-password",
    ]) {
      expect(paths).not.toContain(excluded);
    }
    for (const included of ["/lol", "/quiz", "/combat-lab", "/lol/docs", "/lol/docs/pro", "/lol/tier-list", "/blog", "/about", "/privacy", "/terms", "/security", "/contact"]) {
      expect(paths).toContain(included);
    }
  });

  it("champion entries slugify validated names and skip blanks", () => {
    const entries = championDocEntries(["Kai'Sa", "Dr. Mundo", "", "  "]);
    expect(entries.map((e) => e.path)).toEqual([
      "/lol/docs/champions/kaisa",
      "/lol/docs/champions/dr-mundo",
    ]);
  });

  it("pro year entries include only years with imported game rows", () => {
    const entries = proYearEntries([
      { year: 2011, data: { game_rows: 120 } },
      { year: 2013, data: { game_rows: 0 } },
      { year: 2026, data: { game_rows: 5400 } },
      { year: NaN as number, data: { game_rows: 10 } },
      { year: 2014 }, // no data block
    ]);
    expect(entries.map((e) => e.path)).toEqual([
      "/lol/docs/pro/years/2011",
      "/lol/docs/pro/years/2026",
    ]);
  });

  it("blog entries include League posts and exclude legacy off-topic posts", () => {
    const entries = leagueBlogEntries([
      { slug: "best-adc-builds", tags: ["League of Legends"], published_at: "2026-05-20" },
      { slug: "lol-patch-notes", tags: [], category: "League of Legends" },
      { slug: "best-kpop-groups", tags: ["K-pop"], category: "music" },
      { slug: "marvel-tier-list", tags: ["Marvel"], category: null },
      { slug: null, tags: ["League of Legends"] },
    ]);
    expect(entries.map((e) => e.path)).toEqual([
      "/blog/best-adc-builds",
      "/blog/lol-patch-notes",
    ]);
  });
});

describe("isLeagueBlogPost rule", () => {
  it("matches the exact product tag and league category aliases", () => {
    expect(isLeagueBlogPost({ tags: ["League of Legends"] })).toBe(true);
    expect(isLeagueBlogPost({ tags: [], category: "LoL" })).toBe(true);
    expect(isLeagueBlogPost({ tags: [], category: "league" })).toBe(true);
    expect(isLeagueBlogPost({ tags: ["league of legends"] })).toBe(false); // exact tag only
    expect(isLeagueBlogPost({ tags: ["Anime"], category: "pop-culture" })).toBe(false);
    expect(isLeagueBlogPost({})).toBe(false);
  });
});
