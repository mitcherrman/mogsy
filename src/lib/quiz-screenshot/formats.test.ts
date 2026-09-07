import { describe, expect, it } from "vitest";
import { FORMAT_KEYS, RENDER_FORMATS, getFormat, parseFormats } from "./formats";

describe("format registry", () => {
  it("contains the required formats with exact dimensions", () => {
    const dims = Object.fromEntries(RENDER_FORMATS.map((f) => [f.key, [f.width, f.height]]));
    expect(dims).toEqual({
      "mobile-social": [1080, 1350],
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
    expect(getFormat("mobile-social")?.kind).toBe("social");
    expect(getFormat("vertical")?.kind).toBe("social");
    expect(getFormat("broadcast")?.kind).toBe("social");
    expect(getFormat("mobile-audit")?.kind).toBe("audit");
    expect(getFormat("desktop-audit")?.kind).toBe("audit");
  });

  it("gives content formats a CTA and upscale; audit formats neither", () => {
    for (const f of RENDER_FORMATS) {
      if (f.kind === "audit") {
        expect(f.cta).toBe("none");
        expect(f.contentScale).toBe(1);
      } else {
        expect(f.cta).not.toBe("none");
        expect(f.contentScale).toBeGreaterThan(1);
      }
    }
  });

  // ── CON1 Step 4 — composition metadata ────────────────────────────────
  //
  // The registry is the ONE preset authority: the render shell, the capture
  // gates and Admin's picker all branch on what it says here, so these are the
  // fields a second registry would have been invented to hold.

  it("declares a layout family and a CTA placement for every format", () => {
    for (const f of RENDER_FORMATS) {
      expect(["portrait", "square", "landscape"]).toContain(f.layoutFamily);
      expect(["stacked", "rail", "none"]).toContain(f.ctaPlacement);
    }
  });

  it("routes each format to the composition its ASPECT calls for", () => {
    // The point of the field: a wider-than-tall frame must not be composed as
    // a portrait column. This is the assertion that would have failed before
    // Step 4, when every social format shared one portrait device shell.
    for (const f of RENDER_FORMATS) {
      if (f.kind !== "social") continue;
      if (f.width > f.height) expect(f.layoutFamily).toBe("landscape");
      else if (f.width === f.height) expect(f.layoutFamily).toBe("square");
      else expect(f.layoutFamily).toBe("portrait");
    }
  });

  it("pairs the rail placement with the landscape family, and only it", () => {
    for (const f of RENDER_FORMATS) {
      if (f.kind === "audit") {
        expect(f.ctaPlacement).toBe("none");
      } else {
        expect(f.ctaPlacement).toBe(f.layoutFamily === "landscape" ? "rail" : "stacked");
      }
    }
  });

  it("leaves a landscape format room for both the folio column and its rail", () => {
    // `contentMaxWidth` is what the folio column may take; the rail is what is
    // left. A preset that gave the folio the whole frame would render the rail
    // at zero width and silently drop the brand from the post.
    for (const f of RENDER_FORMATS) {
      if (f.ctaPlacement !== "rail") continue;
      const usable = f.width - f.safeAreaPadding * 2;
      expect(usable - f.contentMaxWidth).toBeGreaterThanOrEqual(220);
    }
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
