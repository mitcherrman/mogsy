/**
 * A guard on the harness's screenshot-only stylesheet.
 *
 * The stage's overrides live in a `<style>{`…`}</style>` template literal
 * inside QuizRenderPage. A stray backtick anywhere in it — including inside a
 * CSS comment, which is where they are most tempting, quoting a class name —
 * terminates the template early. The page then fails to compile, never stamps
 * `data-quiz-render-ready`, and the runner reports `ready-timeout` on EVERY
 * capture of the run: 90 identical failures whose message says nothing about
 * the cause, twenty minutes after the edit that caused it.
 *
 * This is a source-text assertion, and deliberately so. There is no cheaper
 * place to catch it: TypeScript reports it as a cascade of JSX brace errors
 * elsewhere in the file, and the render harness is only exercised by Playwright.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(
  resolve("src/pages/dev/quiz-render/QuizRenderPage.tsx"),
  "utf8",
);

function harnessStyleBlock(): string {
  const open = SOURCE.indexOf("<style>{`");
  const close = SOURCE.indexOf("`}</style>");
  expect(open, "the harness style block moved or was removed").toBeGreaterThan(-1);
  expect(close).toBeGreaterThan(open);
  return SOURCE.slice(open + "<style>{`".length, close);
}

describe("harness stylesheet", () => {
  it("contains no backtick, which would terminate the template literal", () => {
    expect(harnessStyleBlock()).not.toContain("`");
  });

  it("contains no ${, which would be read as an interpolation", () => {
    expect(harnessStyleBlock()).not.toContain("${");
  });

  it("is scoped to the harness stage, so it cannot reach live quiz UI", () => {
    // Every rule must be qualified by a harness-only hook. `data-render-layout`
    // is the composition attribute the stage stamps on itself; both it and
    // `data-quiz-render-stage` exist nowhere else in the app.
    const selectors = harnessStyleBlock()
      .replace(/\/\*[\s\S]*?\*\//g, "") // strip comments
      .split("}")
      .map((chunk) => chunk.split("{")[0].trim())
      .filter(Boolean);
    expect(selectors.length).toBeGreaterThan(10);
    for (const selector of selectors) {
      for (const part of selector.split(",")) {
        expect(
          /\[data-quiz-render-stage\]|\[data-render-layout/.test(part),
          `unscoped harness rule: ${part.trim()}`,
        ).toBe(true);
      }
    }
  });
});
