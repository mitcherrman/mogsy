/**
 * PLAY1 — the mode card's stylesheet contract.
 *
 * The card's ornament is deliberately NOT in the component: the double rule,
 * the corner ticks, the vignette that marries a full-bleed painting to the
 * parchment, the three accents and every interaction state are `index.css`.
 * That is what makes a retune one stylesheet edit — and it is also what makes
 * those rules invisible to every render test in this directory, which can
 * only see class names.
 *
 * So the guarantees that live in CSS are checked in CSS. Three of them are
 * worth a test rather than a comment:
 *
 *   MOTION      everything this pass added that MOVES must stop under
 *               `prefers-reduced-motion`. There is no way to assert that from
 *               jsdom, which never matches the query.
 *   FOCUS       a control that clears its own focus ring owns the
 *               replacement. `.play-invite-search` clears the UA outline, and
 *               once `/dev/play-scroll` began rendering the roster outside a
 *               `.play-scroll`, an ancestor-scoped replacement left it with
 *               no indicator at all.
 *   CONTRAST    the three eyebrow inks are the only per-mode ACCENT that is
 *               ever set as text. Each is measured here against the parchment
 *               at its darkest point under text.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../../../index.css"), "utf8");

/** WCAG relative luminance. */
function relativeLuminance(hex: string): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

/**
 * The sheet at its DARKEST point under text — the inner edge where the
 * parchment's own shading still bites. Every ink in `ink.ts` is derived
 * against this, and every per-mode accent and tier metal must be too. It caps
 * ink luminance at 0.0747 for 4.5:1.
 */
const SHEET_L = relativeLuminance("#d1bb9e");

/** See `RankedPlayGem.test.tsx` — found by what it CONTAINS, never by position. */
function reducedMotionBlockFor(needle: string): string {
  const block = css
    .split("@media (prefers-reduced-motion: reduce)")
    .slice(1)
    .map((chunk) => chunk.split("@media")[0])
    .find((chunk) => chunk.includes(needle));
  if (block === undefined) {
    throw new Error(`no reduced-motion block mentions ${needle}`);
  }
  return block;
}

describe("reduced motion", () => {
  const block = reducedMotionBlockFor(".play-mode-card");

  it("stops every transition the card and its parts animate", () => {
    for (const selector of [
      ".play-mode-card",
      ".play-mode-card::after",
      ".play-mode-card__seal",
      ".play-plate",
      ".play-scroll-stamp",
      ".play-scroll-control",
      ".play-scroll-back",
    ]) {
      expect(block).toContain(selector);
    }
    expect(block).toMatch(/transition:\s*none/);
  });

  it("removes every transform, so nothing lifts, nudges or depresses", () => {
    expect(block).toMatch(/transform:\s*none/);
    expect(block).toContain(".play-mode-card:enabled:active");
    expect(block).toContain(".play-scroll-stamp:active");
  });

  it("holds the live plate at its brightest rim instead of breathing it", () => {
    // Not merely `animation: none` — that would leave the head of the
    // matchmaking view sitting at the keyframe's dim end, and the state
    // would stop reading as live at all.
    expect(block).toMatch(/\.play-plate\.is-live\s*\{[^}]*animation:\s*none/);
    expect(block).toMatch(/\.play-plate\.is-live\s*\{[^}]*box-shadow:/);
  });

  it("keeps the LIGHT, which is not motion", () => {
    // The standing glow on Ranked and the lit rim on hover are properties of
    // the object, not animations. Removing them would leave a pointer user
    // with no feedback at all, which is not what the preference asks for.
    expect(block).not.toContain("box-shadow: none");
  });
});

describe("focus is never removed, and never inherited", () => {
  it("gives every control that clears its own outline a replacement of its own", () => {
    // Ancestor-scoped only would leave the control bare wherever it is
    // rendered outside a `.play-scroll` — which `/dev/play-scroll` does.
    const owned = css.slice(
      css.indexOf(".play-scroll-stamp:focus-visible"),
    );
    const rule = owned.slice(0, owned.indexOf("}") + 1);
    for (const selector of [
      ".play-scroll-stamp:focus-visible",
      ".play-scroll-control:focus-visible",
      ".play-scroll-back:focus-visible",
      ".play-invite-search:focus-visible",
    ]) {
      expect(rule).toContain(selector);
    }
    expect(rule).toMatch(/outline:\s*2px solid/);
  });

  it("uses the sheet's rubric red, never the theme's bright blue ring", () => {
    // `--ring` in this theme is `210 80% 65%` — a dev-console blue rectangle
    // on a parchment sheet. Nothing in the record may reach for it.
    const scoped = css.slice(css.indexOf(".play-scroll :is(button"));
    const rule = scoped.slice(0, scoped.indexOf("}") + 1);
    expect(rule).toMatch(/outline:\s*2px solid rgba\(122, 40, 32/);
    // And the roster's search must not carry Tailwind's ring utility, whose
    // colour IS `--ring`. Comments are stripped first — this file's own
    // explanation of why the utility was removed names it, and an assertion
    // that a source file never mentions a string cannot survive being
    // documented.
    const view = readFileSync(resolve(__dirname, "InvitePlayView.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(view).not.toContain("focus-visible:ring");
  });
});

describe("the streak's glint", () => {
  it("moves nothing but light, so it can never shift the layout", () => {
    const kf = css.slice(css.indexOf("@keyframes play-streak-glint"));
    const block = kf.slice(0, kf.indexOf("}\n}") + 3);
    expect(block).toContain("filter:");
    // No geometry at any point in the cycle — no bounce, no reflow.
    expect(block).not.toMatch(/transform|translate|scale|width|height|margin/);
  });

  it("dwells far longer than it glints", () => {
    // The project's existing light language: the Ranked emblem catches the
    // light about every eleven seconds. A streak that pulsed on a short loop
    // would be the busiest thing on a page of written text.
    const rule = css.slice(css.indexOf(".play-mode-card__flame"));
    const decl = rule.slice(0, rule.indexOf("}"));
    const seconds = Number(/animation:[^;]*?([\d.]+)s/.exec(decl)?.[1] ?? 0);
    expect(seconds).toBeGreaterThanOrEqual(4);
    // At rest for the great majority of it.
    const kf = css.slice(css.indexOf("@keyframes play-streak-glint"));
    expect(kf.slice(0, 400)).toMatch(/0%,\s*7[0-9]%/);
  });

  it("stops under reduced motion and keeps the flame red", () => {
    const block = reducedMotionBlockFor(".play-mode-card__flame");
    expect(block).toMatch(/\.play-mode-card__flame\s*\{[^}]*animation:\s*none/);
    // `color` is untouched: red is colour, not motion.
    expect(block).not.toMatch(/\.play-mode-card__flame\s*\{[^}]*color:/);
  });
});

describe("the mark is written text, not chips", () => {
  it("carries no border or pill background on any of its parts", () => {
    for (const selector of [
      ".play-mode-card__meta-label",
      ".play-mode-card__meta-figure",
      ".play-mode-card__meta-tier",
      ".play-mode-card__streak",
    ]) {
      const rule = css.slice(css.indexOf(`${selector} {`));
      const decl = rule.slice(0, rule.indexOf("}"));
      expect(decl, selector).not.toMatch(/border:|border-radius|background/);
    }
  });
});

describe("the five tier metals clear 4.5:1 on the parchment", () => {
  // A literally bright silver — a light grey — lands near 3:1 on beige and is
  // the least readable thing on the page. A tier reads as its metal by HUE
  // instead: cool steel for silver, warm brass for gold, and so on, each dark
  // enough to be read and lifted by a hairline of parchment-coloured light.
  const TIER_INK: Record<string, string> = {
    bronze: "#5c3512",
    silver: "#414d5b",
    gold: "#5f4708",
    diamond: "#1b4c5e",
    challenger: "#6a2540",
  };

  it.each(Object.entries(TIER_INK))("%s", (tier, ink) => {
    const ratio = (SHEET_L + 0.05) / (relativeLuminance(ink) + 0.05);
    expect(ratio, `${tier} ${ink} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    expect(css).toContain(`.play-mode-card__meta-tier[data-tier="${tier}"] { color: ${ink}; }`);
  });

  it("gives silver the lightest ink of the five — it is the lightest metal", () => {
    const silver = relativeLuminance(TIER_INK.silver);
    for (const [tier, ink] of Object.entries(TIER_INK)) {
      if (tier === "silver") continue;
      expect(relativeLuminance(ink), tier).toBeLessThan(silver);
    }
  });
});

describe("the three eyebrow inks clear 4.5:1 on the parchment", () => {
  it.each([
    ["ranked", "#5c3d08"],
    ["daily", "#173d4d"],
    ["invite", "#4a2a55"],
  ])("%s", (mode, ink) => {
    const ratio = (SHEET_L + 0.05) / (relativeLuminance(ink) + 0.05);
    expect(ratio, `${mode} ${ink} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    // And the value is actually the one the stylesheet sets.
    expect(css).toContain(`--pm-ink: ${ink}`);
  });
});

describe("CHOOSE MODE holds one line", () => {
  /**
   * A title broken across two lines reads as a paragraph rather than a
   * heading, and on a phone it pushed the stepper down far enough to cost the
   * Practice footer its place below the fold. The size and the tracking are
   * what give; the single line is not negotiable.
   */
  const rule = (selector: string) => {
    const at = css.indexOf(selector);
    expect(at, `${selector} not found`).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf("}", at));
  };

  it("can never wrap", () => {
    const base = rule(".play-scroll-heading {");
    expect(base).toMatch(/white-space:\s*nowrap/);
    // And it degrades by ellipsis rather than by spilling off the sheet.
    expect(base).toMatch(/text-overflow:\s*ellipsis/);
  });

  it("steps DOWN on the narrowest sheet rather than wrapping", () => {
    // The container the head measures against is the SHEET, which shrinks to
    // fit 95vh independently of viewport width — see the head block.
    const narrow = css.slice(css.indexOf("@container play-record-sheet (max-width: 232px)"));
    const block = narrow.slice(0, narrow.indexOf("}\n}") + 3);
    expect(block).toContain(".play-scroll-heading");
    expect(block).toMatch(/font-size:\s*16px/);
    // Tracking gives before the glyphs do.
    expect(block).toMatch(/letter-spacing:\s*0\.05em/);
  });

  it("is still the sheet's dominant line, not an eyebrow", () => {
    const base = rule(".play-scroll-heading {");
    expect(base).toMatch(/font-weight:\s*900/);
    expect(base).toMatch(/text-transform:\s*uppercase/);
    // Larger than the clause titles it sits above (16px / 18px).
    const size = Number(/font-size:\s*(\d+)px/.exec(base)?.[1] ?? 0);
    expect(size).toBeGreaterThanOrEqual(19);
  });
});
