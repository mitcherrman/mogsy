/**
 * QRT2 Phase 2A — the stylesheet half of the contract, pinned.
 *
 * jsdom cannot lay anything out, so the sizes and inks that make the verdict
 * dominant and the evidence legible are held here as source assertions and then
 * measured for real by `e2e/qrt2-verdict-clarity.spec.ts`. Each rule below is
 * one a later "cleanup" could quietly undo.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../index.css"), "utf8").replace(/\r\n/g, "\n");

/** The declaration block of the FIRST rule whose selector line matches. */
function block(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
}

describe("verdict stamp", () => {
  it("is at least 1.5rem on a phone and no taller than the card's reserve allows", () => {
    const rule = block(".ranked-result-stamp");
    const size = /font-size:\s*clamp\(\s*([\d.]+)rem,\s*([\d.]+)vw,\s*([\d.]+)rem\)/.exec(rule);
    expect(size, "stamp font-size must be a clamp()").not.toBeNull();
    expect(Number(size![1])).toBeGreaterThanOrEqual(1.5);
    expect(Number(size![3])).toBeGreaterThanOrEqual(2);
    expect(Number(size![3])).toBeLessThanOrEqual(2.25);
    expect(rule).toMatch(/white-space:\s*nowrap/);
  });
});

describe("timed-out stamp", () => {
  it("is as loud as the other verdicts, not the old 1.2rem", () => {
    const rule = block('.ranked-result-stamp[data-timeout="true"]');
    const size = /font-size:\s*clamp\(\s*([\d.]+)rem,\s*([\d.]+)vw,\s*([\d.]+)rem\)/.exec(rule);
    expect(size, "timeout stamp font-size must be a clamp()").not.toBeNull();
    expect(Number(size![1])).toBeGreaterThanOrEqual(1.4);
    expect(Number(size![3])).toBeGreaterThanOrEqual(1.85);
  });
});

describe("revealed answer tablets", () => {
  const scope = ".ranked-academy [data-answers-state] [data-verdict-tabs]";
  const correct = `${scope} [data-quiz-choice][data-choice-state="correct"]`;
  const wrong = `${scope} [data-quiz-choice][data-choice-state="incorrect-selected"]`;

  it("the new skin is opt-in: the original blue/rose rules are still there for everyone else", () => {
    const old = '.ranked-academy [data-answers-state] [data-quiz-choice][data-choice-state="correct"]';
    expect(block(old)).toMatch(/rgba\(47,143,202/);
    const oldWrong = '.ranked-academy [data-answers-state] [data-quiz-choice][data-choice-state="incorrect-selected"]';
    expect(block(oldWrong)).toMatch(/rgba\(184,73,79/);
  });

  it("the correct tablet is fully opaque and emerald, ringed without changing its box", () => {
    const rule = block(correct);
    expect(rule).toMatch(/opacity:\s*1\b/);
    expect(rule).toMatch(/rgba\(74,\s*222,\s*128/);
    expect(rule).toMatch(/inset 0 0 0 2px/);
    // Geometry locks (RA1 1.5): no state may change a border width or padding.
    expect(rule).not.toMatch(/border-width|padding|margin|\bwidth\b|\bheight\b/);
  });

  it("the picked wrong tablet is fully opaque and ringed, not dimmed", () => {
    const rule = block(wrong);
    expect(rule).toMatch(/opacity:\s*1\b/);
    expect(rule).toMatch(/inset 0 0 0 2px/);
    expect(rule).not.toMatch(/border-width|padding|margin|\bwidth\b|\bheight\b/);
  });
});

describe("evidence on the parchment card", () => {
  it("a statement is dark ink, not the gold it was drawn in on a dark ground", () => {
    const rule = block('.ranked-question-stage [data-testid="answer-evidence"][data-evidence-kind="statement"]');
    expect(rule).toMatch(/color:\s*#2a1a04/);
    // Colour only: this rule must not move the reserved slot.
    expect(rule).not.toMatch(/font-size|line-height|padding|margin|height/);
  });
});

describe("reduced motion", () => {
  it("the overlay still strips every animation under the app's and the OS's switch", () => {
    expect(css).toMatch(/\.ranked-result-overlay--still \*/);
    expect(css).toMatch(/html\.reduce-motion \.ranked-result-overlay \*/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\n\s*\.ranked-result-overlay \*/);
  });
});
