/**
 * The painted spread's page geometry, as a contract (HI1-C4).
 *
 * The tome's two page regions are positioned in index.css against numbers
 * measured off the painting itself, and HI1-C4 added one tunable on top of
 * them: `--tome-page-inward`, how far both compositions sit in from the covers
 * toward the spine. The whole point of a tunable is that a person can retune it
 * after looking at it — which is exactly the change most likely to be made by
 * someone who has not read the file.
 *
 * So the invariants are pinned here rather than left to a reviewer's eye:
 *  - there is ONE knob, not a pair of numbers that can drift apart
 *  - it moves the two pages by the same amount in opposite directions, or the
 *    spread stops being symmetrical about its own spine
 *  - the single phone sheet, which has no covers and no gutter, is exempt
 *  - the finale's exits — the one element as wide as the page box — give the
 *    offset back, which is what keeps them off the fold
 *  - the turning sheet's ghost writing carries the same offset, or the outgoing
 *    words jump sideways the instant the page begins to lift
 *
 * jsdom parses no stylesheet the app ships, so this reads the source. That is
 * the same approach startup-shell.test.ts takes to index.html, and for the same
 * reason: the file IS the contract.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../index.css"), "utf8");

/** The declarations of one rule, by exact selector text. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, "m"));
  if (!match) throw new Error(`index.css no longer has a rule for ${selector}`);
  return match[1];
}

describe("the inward page offset is one knob", () => {
  it("is declared once as a default and once as the spread's value", () => {
    const declarations = [...css.matchAll(/--tome-page-inward:\s*([^;]+);/g)].map((m) =>
      m[1].trim(),
    );
    expect(declarations).toEqual(["0px", "2.2cqw"]);
  });

  it("is expressed in container units, so it means the same thing everywhere", () => {
    // `cqw` is a percentage of the tome's own drawn width — the same thing
    // every other number in this section is a percentage of. A px or vw value
    // would mean one offset on a phone-sized spread and another on a desktop.
    expect(ruleBody(".tome-spread")).toMatch(/--tome-page-inward:\s*[\d.]+cqw/);
  });

  it("moves the two pages toward each other by the same amount", () => {
    expect(ruleBody(".tome-page-verso")).toContain("left: calc(8% + var(--tome-page-inward))");
    expect(ruleBody(".tome-page-recto")).toContain("left: calc(54% - var(--tome-page-inward))");
  });

  it("leaves the single phone sheet alone", () => {
    // One flat page: no cover to sit in from, no gutter to sit out of.
    expect(ruleBody(".academy-tome")).toContain("--tome-page-inward: 0px");
    expect(css).not.toMatch(/\.tome-single\s*\{[^}]*--tome-page-inward/);
  });
});

describe("nothing is pushed into the gutter", () => {
  it("gives the finale's exits back exactly the offset they were moved by", () => {
    // The exits are the one element that is the page box's FULL width, so they
    // are the one element the inward move would have put over the fold.
    expect(ruleBody(".academy-welcome .tome-exits")).toContain(
      "max-width: calc(100% - var(--tome-page-inward))",
    );
  });

  it("carries the offset onto the turning sheet's writing", () => {
    expect(ruleBody(".tome-leaf-content")).toContain(
      "translateX(calc(-1 * var(--tome-page-inward)))",
    );
  });
});
