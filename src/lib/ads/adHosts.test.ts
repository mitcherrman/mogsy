import { describe, expect, it } from "vitest";
import { isProductionAdHost } from "./adHosts";

describe("isProductionAdHost", () => {
  it("recognizes the canonical apex and www hosts", () => {
    expect(isProductionAdHost("mogzy.lol")).toBe(true);
    expect(isProductionAdHost("www.mogzy.lol")).toBe(true);
    expect(isProductionAdHost("MOGZY.LOL")).toBe(true);
    expect(isProductionAdHost(" mogzy.lol ")).toBe(true);
  });

  it("treats historical domains as non-production (test-mode ads only)", () => {
    for (const host of ["mogsy.app", "www.mogsy.app", "mogsy.net", "www.mogsy.net", "mogzy.app"]) {
      expect(isProductionAdHost(host)).toBe(false);
    }
  });

  it("treats preview/local hosts as non-production", () => {
    for (const host of ["localhost", "127.0.0.1", "mogsy.lovable.app", "preview.mogzy.lol"]) {
      expect(isProductionAdHost(host)).toBe(false);
    }
  });
});
