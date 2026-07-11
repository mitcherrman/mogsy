import { describe, expect, it } from "vitest";
import {
  buildProChampionUrl,
  buildProYearUrl,
  isProChampionSection,
  normalizeScopeName,
  proScopeLabel,
} from "./pro-data-links";

describe("buildProChampionUrl", () => {
  it("builds a bare champion URL", () => {
    expect(buildProChampionUrl({ slug: "akali" })).toBe("/lol/docs/pro/champions/akali");
  });

  it("URL-encodes unsafe slug characters", () => {
    expect(buildProChampionUrl({ slug: "bad slug/x?y" })).toBe(
      "/lol/docs/pro/champions/bad%20slug%2Fx%3Fy",
    );
  });

  it("keeps a stable year-then-scope parameter order", () => {
    expect(buildProChampionUrl({ slug: "akali", scope: "major", year: 2011 })).toBe(
      "/lol/docs/pro/champions/akali?year=2011&scope=major",
    );
  });

  it("omits empty parameters", () => {
    expect(buildProChampionUrl({ slug: "akali", year: null, scope: "" })).toBe(
      "/lol/docs/pro/champions/akali",
    );
  });

  it("normalizes the backend 'all' scope alias", () => {
    expect(buildProChampionUrl({ slug: "akali", scope: "all" })).toBe(
      "/lol/docs/pro/champions/akali?scope=all-imported",
    );
  });

  it("appends only valid section hashes", () => {
    expect(buildProChampionUrl({ slug: "akali", year: 2011, section: "yearly-stats" })).toBe(
      "/lol/docs/pro/champions/akali?year=2011#yearly-stats",
    );
    expect(
      buildProChampionUrl({ slug: "akali", section: "nope" as never }),
    ).toBe("/lol/docs/pro/champions/akali");
  });
});

describe("scope helpers", () => {
  it("normalizes aliases and case", () => {
    expect(normalizeScopeName("all")).toBe("all-imported");
    expect(normalizeScopeName(" MAJOR ")).toBe("major");
    expect(normalizeScopeName("")).toBeNull();
    expect(normalizeScopeName(null)).toBeNull();
  });

  it("labels known scopes and passes unknown through", () => {
    expect(proScopeLabel("all")).toBe("All imported");
    expect(proScopeLabel("major")).toBe("Major leagues");
    expect(proScopeLabel("something-new")).toBe("something-new");
  });
});

describe("sections and year URLs", () => {
  it("validates section anchors", () => {
    expect(isProChampionSection("recent-games")).toBe(true);
    expect(isProChampionSection("hack")).toBe(false);
  });

  it("builds year URLs", () => {
    expect(buildProYearUrl(2011)).toBe("/lol/docs/pro/years/2011");
  });
});
