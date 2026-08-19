import { describe, expect, it } from "vitest";
import { resolveCrownArt } from "./crowns";

describe("resolveCrownArt", () => {
  it("resolves Bronze", () => {
    expect(resolveCrownArt("Bronze")).toBe("/images/ranked/crowns/bronze.png");
  });

  it("resolves mixed-case Gold", () => {
    expect(resolveCrownArt("gOlD")).toBe("/images/ranked/crowns/gold.png");
  });

  it("resolves whitespace-padded Diamond", () => {
    expect(resolveCrownArt("  Diamond  ")).toBe("/images/ranked/crowns/diamond.png");
  });

  it("resolves Challenger", () => {
    expect(resolveCrownArt("Challenger")).toBe("/images/ranked/crowns/challenger.png");
  });

  it("returns null for Iron", () => {
    expect(resolveCrownArt("Iron")).toBeNull();
  });

  it("returns null for Platinum", () => {
    expect(resolveCrownArt("Platinum")).toBeNull();
  });

  it("returns null for Master", () => {
    expect(resolveCrownArt("Master")).toBeNull();
  });

  it("returns null for Unranked", () => {
    expect(resolveCrownArt("Unranked")).toBeNull();
  });

  it("returns null for an unknown string", () => {
    expect(resolveCrownArt("Mythic")).toBeNull();
  });

  it("returns null for null", () => {
    expect(resolveCrownArt(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(resolveCrownArt(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(resolveCrownArt("")).toBeNull();
  });
});
