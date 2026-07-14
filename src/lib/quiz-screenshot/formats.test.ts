import { describe, expect, it } from "vitest";
import { FORMAT_KEYS, RENDER_FORMATS, getFormat, parseFormats } from "./formats";

describe("format registry", () => {
  it("contains the required formats with exact dimensions", () => {
    const dims = Object.fromEntries(RENDER_FORMATS.map((f) => [f.key, [f.width, f.height]]));
    expect(dims).toEqual({
      vertical: [1080, 1920],
      portrait: [1080, 1350],
      square: [1080, 1080],
      landscape: [1200, 675],
      broadcast: [1920, 1080],
      "mobile-audit": [390, 844],
      "desktop-audit": [1440, 900],
    });
  });

  it("classifies social vs audit", () => {
    expect(getFormat("vertical")?.kind).toBe("social");
    expect(getFormat("broadcast")?.kind).toBe("social");
    expect(getFormat("mobile-audit")?.kind).toBe("audit");
    expect(getFormat("desktop-audit")?.kind).toBe("audit");
  });
});

describe("parseFormats", () => {
  it("accepts every supported format", () => {
    expect(parseFormats(FORMAT_KEYS.join(",")).map((f) => f.key)).toEqual(FORMAT_KEYS);
  });
  it("rejects unknown, duplicate, and empty", () => {
    expect(() => parseFormats("vertical,nope")).toThrow(/Unknown format "nope"/);
    expect(() => parseFormats("square,square")).toThrow(/Duplicate/);
    expect(() => parseFormats(" ")).toThrow(/No formats/);
  });
});
