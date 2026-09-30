/**
 * RFX1 Phase 2B3 VISUAL IMPLEMENTATION — the stylesheet's half of the beats.
 *
 * THE DEFECT THIS FILE EXISTS FOR.
 *
 * The Meta Reflex sting's three keyframes were a complete in-AND-OUT cycle
 * hardcoded at 720 ms with `animation-fill-mode: both`, which holds the LAST
 * keyframe — and that keyframe was `opacity: 0`. RFX1 2B3 then held the
 * ELEMENT for 1800 ms without touching the CSS, so roughly 1080 ms of every
 * Ranked mode-shift beat was a mounted, fully transparent overlay over a
 * locked card. Every timing test passed throughout: they assert milliseconds,
 * and the element WAS mounted for all of them.
 *
 * A render test cannot catch this either — jsdom computes no animation. So
 * the contract is asserted against the stylesheet text, which is where it
 * actually lives.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

/** The body of one `@keyframes NAME { … }` block. */
function keyframes(name: string): string {
  const start = css.indexOf(`@keyframes ${name} {`);
  expect(start, `@keyframes ${name} must exist`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated @keyframes ${name}`);
}

/** The `100%` (or `to`) stop of a keyframes block. */
function finalStop(name: string): string {
  const body = keyframes(name);
  const match = body.match(/(?:100%|to)\s*\{([^}]*)\}/);
  expect(match, `${name} must declare a final stop`).not.toBeNull();
  return match![1];
}

const STING_KEYFRAMES = ["mr-sting-left", "mr-sting-right", "mr-sting-mark"];

describe("RFX1 2B3 visual — the Meta Reflex beat fills its whole window", () => {
  it("holds the wordmark centred and OPAQUE through the middle of the beat", () => {
    for (const name of STING_KEYFRAMES) {
      const body = keyframes(name);
      // The hold must start early and end late, so the readable middle of the
      // beat is the majority of it however long the caller holds the element.
      const stops = [...body.matchAll(/(\d+)%\s*\{([^}]*)\}/g)]
        .map(([, pct, decls]) => ({ pct: Number(pct), decls }));
      const opaque = stops.filter((s) => /opacity:\s*1/.test(s.decls));
      expect(opaque.length, `${name} must have a hold`).toBeGreaterThanOrEqual(2);
      const enter = Math.min(...opaque.map((s) => s.pct));
      const leave = Math.max(...opaque.map((s) => s.pct));
      expect(enter, `${name} enters too late`).toBeLessThanOrEqual(26);
      expect(leave, `${name} leaves too early`).toBeGreaterThanOrEqual(80);
      // THE REGRESSION GUARD: more than half the beat must be the hold. The
      // old shape held 30%-62%, i.e. 32% of it.
      expect(leave - enter).toBeGreaterThan(50);
    }
  });

  it("drives every sting animation from the coordinator's own window", () => {
    // Hardcoding the duration is what let the CSS and the JS disagree. The
    // variable defaults to the sting's own 720ms, so the Daily is unchanged.
    for (const selector of [
      ".mr-sting__word--left", ".mr-sting__word--right", ".mr-sting__mark",
      ".mr-sting__subline", ".mr-sting__scrim",
    ]) {
      const rule = css.slice(css.indexOf(`${selector} `));
      const decl = rule.slice(0, rule.indexOf("}"));
      expect(decl, `${selector} must read --mr-sting-ms`)
        .toContain("var(--mr-sting-ms, 720ms)");
      // The variable's own FALLBACK is the sting's 720ms and is the point;
      // what must not survive is a duration outside it.
      const withoutVar = decl.replace(/var\(--mr-sting-ms,\s*720ms\)/g, "");
      expect(withoutVar, `${selector} must not hardcode a duration`)
        .not.toMatch(/\b\d{3,4}ms\b/);
    }
  });

  it("keeps the reduced-motion treatment on the same clock, and opaque", () => {
    const fade = keyframes("mr-sting-fade");
    const stops = [...fade.matchAll(/(\d+)%\s*\{([^}]*)\}/g)]
      .map(([, pct, decls]) => ({ pct: Number(pct), decls }));
    const opaque = stops.filter((s) => /opacity:\s*1/.test(s.decls));
    expect(opaque.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...opaque.map((s) => s.pct))
      - Math.min(...opaque.map((s) => s.pct))).toBeGreaterThan(50);
    // Reduced motion changes the ANIMATION, never the pacing.
    expect(css).toContain("animation: mr-sting-fade var(--mr-sting-ms, 720ms) linear both;");
  });
});

describe("RFX1 2B3 visual — the shared beat vocabulary", () => {
  it("gives the major beats a deeper scrim than the medium ones", () => {
    const major = css.slice(css.indexOf(".ranked-beat--major > .ranked-beat__scrim"));
    const medium = css.slice(css.indexOf(".ranked-beat--medium > .ranked-beat__scrim"));
    expect(major.slice(0, major.indexOf("}"))).toContain("rgba(2,5,12,0.86)");
    expect(medium.slice(0, medium.indexOf("}"))).toContain("rgba(2, 5, 12, 0.55)");
  });

  it("scales the major title above the medium title", () => {
    const rule = (selector: string) => {
      const at = css.indexOf(selector);
      expect(at, `${selector} must exist`).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf("}", at));
    };
    // The phone base sizes; the `min-width: 640px` block raises both.
    expect(rule(".ranked-beat--major .ranked-beat__title"))
      .toContain("clamp(1.75rem, 8vw, 2.25rem)");
    expect(rule(".ranked-beat--medium .ranked-beat__title"))
      .toContain("clamp(1.375rem, 5.5vw, 1.75rem)");
  });

  it("protects both boards' centre track from a long display name", () => {
    // `minmax(0, 1fr)` rather than a bare `1fr`: a bare `1fr` floors at the
    // content's min width, so one long unbroken name widens its track and
    // walks the VS — or the score — off the composition's centre line.
    for (const selector of [".ranked-entry-intro__board", ".ranked-match-outro__board"]) {
      const at = css.indexOf(selector);
      expect(at, `${selector} must exist`).toBeGreaterThan(-1);
      const block = css.slice(at, css.indexOf("}", at));
      expect(block).toContain("grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);");
    }
    const nameAt = css.indexOf(".ranked-entry-intro__name {");
    const nameBlock = css.slice(nameAt, css.indexOf("}", nameAt));
    expect(nameBlock).toContain("text-overflow: ellipsis;");
    expect(nameBlock).toContain("white-space: nowrap;");
  });

  it("sizes both major beats against the VIEWPORT so neither can add a scroll", () => {
    // A `min()` against the viewport, never a fixed height: the beat fills the
    // room it is in and can never ask for more than there is. Both beats read
    // it from the one duel-stage property (asserted below).
    const at = css.indexOf("--ranked-duel-stage-h: min(");
    expect(at, "the duel stage must be a viewport min()").toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf(";", at))).toContain("100svh");
    // Declared on `:root`, so a beat hosted outside `.ranked-shell` (the
    // `?beat=outro` preview) still resolves it instead of collapsing.
    expect(css.slice(css.lastIndexOf("{", at) - 8, at)).toContain(":root");
  });

  it("reuses existing art only — no new asset, and never the PLAY seal", () => {
    const at = css.indexOf(".ranked-final-round__plate {");
    const block = css.slice(at, css.indexOf("}", at));
    // The navy banner cloth the arena rails already draw and preload.
    expect(block).toContain('url("/assets/ranked/navy-banner2-768w.webp")');
    // `play-seal.png` has the word PLAY baked into the artwork, so it can
    // never stand in as a generic seal. No beat may reach for it.
    for (const selector of [
      ".ranked-entry-intro__versus {", ".ranked-final-round__plate {",
      ".ranked-match-outro {", ".ranked-beat__rule {",
    ]) {
      const from = css.indexOf(selector);
      expect(from, `${selector} must exist`).toBeGreaterThan(-1);
      expect(css.slice(from, css.indexOf("}", from))).not.toContain("play-seal");
    }
    // The VS medallion is drawn, not an asset: no `url(` at all.
    const versusAt = css.indexOf(".ranked-entry-intro__versus {");
    expect(css.slice(versusAt, css.indexOf("}", versusAt))).not.toContain("url(");
  });

  it("keeps reduced motion on the same duration for both new beats", () => {
    for (const selector of [".ranked-final-round", ".ranked-match-outro", ".ranked-entry-intro"]) {
      const at = css.indexOf(`${selector}[data-reduced-motion="true"],`);
      expect(at, `${selector} must answer the app's own switch`).toBeGreaterThan(-1);
      const block = css.slice(at, css.indexOf("}", at));
      expect(block).toContain("ranked-beat-fade 180ms");
    }
  });
  it("takes the beat overlay OUT of the shell's flow, by specificity", () => {
    // `.ranked-shell > *` is `position: relative; z-index: 1`. A single-class
    // utility on the overlay ties it and loses on source order — which is how
    // the layer collapsed to 0px at the shell's bottom edge.
    const at = css.indexOf(".ranked-shell > .ranked-beat-layer {");
    expect(at, "the overlay needs its own two-class rule").toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf("}", at));
    expect(block).toContain("position: absolute");
    expect(block).toContain("inset: 0");
    expect(block).toContain("z-index: 40");
    expect(at).toBeGreaterThan(css.indexOf(".ranked-shell > * {"));
  });

  it("composes the intro and the outro in ONE duel-stage box", () => {
    const intro = css.slice(css.indexOf(".ranked-entry-intro {"));
    expect(intro.slice(0, intro.indexOf("}"))).toContain("min-height: var(--ranked-duel-stage-h)");
    const at = css.indexOf(".ranked-match-outro > .ranked-beat__inner {");
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf("}", at))).toContain("min-height: var(--ranked-duel-stage-h)");
  });
});
