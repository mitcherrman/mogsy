import { describe, expect, it } from "vitest";
import { SITE_DOMAIN, SITE_NAME, SITE_URL } from "./site-config";

describe("site-config canonical identity", () => {
  it("uses the canonical mogzy.lol origin", () => {
    expect(SITE_DOMAIN).toBe("mogzy.lol");
    expect(SITE_URL).toBe("https://mogzy.lol");
  });

  it("does not fall back to historical domains", () => {
    expect(SITE_URL).not.toContain("mogsy.app");
    expect(SITE_URL).not.toContain("mogsy.net");
  });

  it("brands the current public product as Mogzy", () => {
    expect(SITE_NAME).toBe("Mogzy");
  });
});
