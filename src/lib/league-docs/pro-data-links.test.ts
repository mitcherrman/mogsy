import { describe, expect, it } from "vitest";
import {
  buildProChampionUrl,
  buildProYearUrl,
  isProChampionSection,
  normalizeScopeName,
  parseProDataSource,
  proDataSourceUrl,
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

describe("parseProDataSource", () => {
  it("accepts champion-only metadata", () => {
    expect(parseProDataSource({ champion_slug: "akali" })).toEqual({ championSlug: "akali" });
  });

  it("accepts champion + year", () => {
    expect(parseProDataSource({ champion_slug: "akali", year: 2011 })).toEqual({
      championSlug: "akali",
      year: 2011,
    });
  });

  it("accepts champion + year + scope + section, normalizing scope + all alias", () => {
    expect(
      parseProDataSource({ champion_slug: "akali", year: 2026, scope: "Major", section: "scoped-stats" }),
    ).toEqual({ championSlug: "akali", year: 2026, scope: "major", section: "scoped-stats" });
    // "all" normalizes to the recognized "all-imported" scope.
    expect(parseProDataSource({ champion_slug: "akali", scope: "all" })).toEqual({
      championSlug: "akali",
      scope: "all-imported",
    });
  });

  it("returns null for missing/empty/non-object metadata or malformed slug", () => {
    expect(parseProDataSource(undefined)).toBeNull();
    expect(parseProDataSource(null)).toBeNull();
    expect(parseProDataSource("akali")).toBeNull();
    expect(parseProDataSource({})).toBeNull();
    expect(parseProDataSource({ champion_slug: "" })).toBeNull();
    expect(parseProDataSource({ champion_slug: "not a slug!" })).toBeNull();
  });

  it("fails closed when a supplied optional field is invalid (no widening)", () => {
    // Invalid year → whole reference rejected, not silently dropped.
    expect(parseProDataSource({ champion_slug: "akali", year: 1998 })).toBeNull();
    expect(parseProDataSource({ champion_slug: "akali", year: 2101 })).toBeNull();
    expect(parseProDataSource({ champion_slug: "akali", year: 2011.5 })).toBeNull();
    expect(parseProDataSource({ champion_slug: "akali", year: "nope" })).toBeNull();
    // Invalid section → null even though champion + year are fine.
    expect(parseProDataSource({ champion_slug: "akali", year: 2011, section: "hack" })).toBeNull();
    // Unrecognized / empty / non-string scope → null.
    expect(parseProDataSource({ champion_slug: "akali", scope: "challenger" })).toBeNull();
    expect(parseProDataSource({ champion_slug: "akali", scope: "" })).toBeNull();
    expect(parseProDataSource({ champion_slug: "akali", scope: 5 })).toBeNull();
  });

  it("derives the same URL as buildProChampionUrl", () => {
    const source = parseProDataSource({
      champion_slug: "akali",
      year: 2026,
      scope: "major",
      section: "scoped-stats",
    });
    expect(source).not.toBeNull();
    expect(proDataSourceUrl(source!)).toBe(
      buildProChampionUrl({ slug: "akali", year: 2026, scope: "major", section: "scoped-stats" }),
    );
    expect(proDataSourceUrl(source!)).toBe(
      "/lol/docs/pro/champions/akali?year=2026&scope=major#scoped-stats",
    );
  });
});
