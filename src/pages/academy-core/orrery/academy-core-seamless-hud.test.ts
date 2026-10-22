/**
 * Seamless top HUD — the stylesheet's contract, read from source.
 *
 * The page lifts into the HUD band and the hero pads back by the same amount,
 * restating the hero's own padding-top / min-height plus the band. These tests
 * pin those restated values to the stylesheets they come from, so a later
 * change to the hero's padding cannot silently move the Orrery by drifting
 * out of step with this file. Real geometry: e2e/academy-seamless-hud.spec.ts (CI).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(path.resolve(__dirname, f), "utf8").replace(/\r\n/g, "\n");
const seamless = read("academy-core-seamless-hud.css");
const v35 = read("academy-core-v35.css");
const masthead = read("academy-core-masthead.css");
const page = read("../AcademyCorePage.tsx");

const rules = (css: string) =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    body: m[2],
  }));
const decl = (body: string, prop: string) =>
  body.match(new RegExp(`(?:^|;|\\s)${prop}:\\s*([^;]+);`))?.[1].trim();
const ruleFor = (css: string, selector: string) => rules(css).find((r) => r.selector === selector)!;

describe("academy-core-seamless-hud.css", () => {
  it("is scoped to the Academy root only (only /lol renders .o35-root)", () => {
    const all = rules(seamless);
    expect(all.length).toBeGreaterThan(0);
    for (const r of all) expect(r.selector.startsWith(".o35-root"), r.selector).toBe(true);
  });

  it("does not change the shell's reserved band or the viewport tokens", () => {
    const body = rules(seamless).map((r) => r.body).join("\n");
    expect(body).not.toMatch(/--app-header-h\s*:/);
    expect(body).not.toMatch(/--app-viewport-h\s*:/);
    expect(body).not.toMatch(/--o35-(above|below)-h\s*:/);
  });

  it("lifts the page by exactly the band the hero pads back", () => {
    const root = ruleFor(seamless, ".o35-root");
    expect(decl(root.body, "--o35-hud-band")).toBe("var(--app-header-h, 0px)");
    expect(decl(root.body, "margin-top")).toBe("calc(-1 * var(--o35-hud-band))");
  });

  it("desktop: restates the V3.5 hero's padding-top and min-height, plus the band", () => {
    const base = ruleFor(v35, ".o35-hero");
    const basePadTop = decl(base.body, "padding")!.match(/^(clamp\([^)]*\)|\S+)/)![1];
    const baseMinH = decl(base.body, "min-height")!;
    const mine = ruleFor(seamless, ".o35-root .o35-hero");
    expect(decl(mine.body, "padding-top")).toBe(`calc(${basePadTop} + var(--o35-hud-band))`);
    expect(decl(mine.body, "min-height")).toBe(`calc(${baseMinH} + var(--o35-hud-band))`);
  });

  it("stacked: restates the masthead's stacked padding-top (also the short-landscape value), plus the band", () => {
    const sel = '.o35-root[data-layout="stacked"] .o35-hero';
    const stackedTop = decl(ruleFor(masthead, sel).body, "padding-top")!;
    const landscapeTop = decl(rules(masthead).filter((r) => r.selector === sel).at(-1)!.body, "padding")!.split(/\s+/)[0];
    expect(landscapeTop).toBe(stackedTop);
    expect(decl(ruleFor(seamless, sel).body, "padding-top")).toBe(`calc(${stackedTop} + var(--o35-hud-band))`);
    // stacked heroes keep min-height 0 (V3.5), so there is nothing to add
    expect(decl(ruleFor(v35, sel).body, "min-height")).toBe("0");
    expect(decl(ruleFor(seamless, sel).body, "min-height")).toBeUndefined();
  });

  it("is imported last by AcademyCorePage, after the phone fit", () => {
    const imports = [...page.matchAll(/^import "(\.\/orrery\/[^"]+\.css)";/gm)].map((m) => m[1]);
    expect(imports.at(-1)).toBe("./orrery/academy-core-seamless-hud.css");
    expect(imports.indexOf("./orrery/academy-core-phone-fit.css")).toBe(imports.length - 2);
  });
});
