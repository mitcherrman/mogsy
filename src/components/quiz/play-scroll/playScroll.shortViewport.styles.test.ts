/**
 * MISC W3B (F06) — the Play selector's short-screen stylesheet contract.
 *
 * jsdom has no layout, so the guarantees that make the record usable on a
 * 320x568 phone cannot be asserted by a render test. The real measurement
 * lives in `e2e/play-scroll-short-phone.spec.ts`; this file pins the few
 * declarations that measurement depends on, so a later edit cannot quietly put
 * back the defect:
 *
 *   · the sheet is bounded by its frame. It used to be `95vh` / `97vh`, and a
 *     short-viewport rule then lifted the cap altogether (`max-height: none`),
 *     so on any screen 620px tall or less the sheet outgrew a fixed,
 *     non-scrolling frame and its foot was cut off with nothing to scroll.
 *   · the close stamp and the role arrows carry a 44px hit area.
 *   · the compact short-screen head removes exactly one thing from the
 *     layout, the decorative mascot, and nothing a player can act on.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../../../index.css"), "utf8").replace(/\r\n/g, "\n");

/** The declaration block of the FIRST rule whose selector is exactly `selector`. */
function ruleBody(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(source);
  if (!match) throw new Error(`rule not found: ${selector}`);
  return match[1];
}

/** The text of the `@media (max-height: 620px)` block that holds `needle`. */
function shortBlockWith(needle: string): string {
  const starts = [...css.matchAll(/@media \(max-height: 620px\) \{/g)].map((m) => m.index!);
  for (const start of starts) {
    let depth = 0;
    for (let i = start; i < css.length; i++) {
      if (css[i] === "{") depth++;
      if (css[i] === "}" && --depth === 0) {
        const block = css.slice(start, i + 1);
        if (block.includes(needle)) return block;
        break;
      }
    }
  }
  throw new Error(`no max-height: 620px block contains ${needle}`);
}

describe("the sheet is bounded by its frame", () => {
  it("caps the sizer at 100% of the frame, not at a viewport unit", () => {
    const body = ruleBody(css, ".play-scroll-sizer");
    expect(body).toMatch(/max-height:\s*100%\s*;/);
    expect(body).not.toMatch(/max-height:\s*\d+(\.\d+)?vh/);
  });

  it("never lifts the cap on a short viewport", () => {
    const shortFrame = shortBlockWith(".play-scroll-frame");
    expect(shortFrame).not.toMatch(/max-height:\s*none/);
    expect(shortFrame).not.toMatch(/\.play-scroll-sizer/);
  });

  it("does not re-add a narrow-screen viewport-unit cap", () => {
    const start = css.indexOf("@media (max-width: 639px) {\n  .play-scroll-frame");
    const end = css.indexOf("/* ── Short viewports");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(css.slice(start, end)).not.toMatch(/\.play-scroll-sizer/);
  });

  it("keeps the writing area as the one scroll region", () => {
    const body = ruleBody(css, ".play-scroll__body");
    expect(body).toMatch(/min-height:\s*0/);
    expect(body).toMatch(/overflow-y:\s*auto/);
    expect(body).toMatch(/overscroll-behavior:\s*contain/);
  });
});

describe("touch targets", () => {
  it("gives the close stamp a 44px hit area around its 32px ink", () => {
    expect(ruleBody(css, ".play-scroll-stamp")).toMatch(/width:\s*32px/);
    expect(ruleBody(css, ".play-scroll-stamp::after")).toMatch(/inset:\s*-7px/);
  });

  it("gives the role arrows a 44px hit area around their 40px ink", () => {
    expect(ruleBody(css, ".play-scroll-arrow")).toMatch(/width:\s*40px/);
    expect(ruleBody(css, ".play-scroll-arrow::after")).toMatch(/inset:\s*-3px/);
  });
});

describe("the compact head on a short screen", () => {
  const block = shortBlockWith(".play-scroll-stepper__figure");

  it("removes only the decorative mascot from the layout", () => {
    const hidden = [...block.matchAll(/([^{}]+)\{[^}]*display:\s*none[^}]*\}/g)].map((m) => m[1].trim());
    expect(hidden).toEqual([".play-scroll .play-scroll-stepper__figure"]);
  });

  it("keeps the arrows 44px columns so the targets do not shrink with the sheet", () => {
    expect(block).toMatch(/grid-template-columns:\s*44px minmax\(0, 1fr\) 44px/);
  });

  it("never hides, clips or un-focuses an action", () => {
    expect(block).not.toMatch(/visibility:\s*hidden/);
    expect(block).not.toMatch(/pointer-events:\s*none/);
    expect(block).not.toMatch(/overflow:\s*hidden/);
  });
});
