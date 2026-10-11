import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("private route indexing policy", () => {
  it("keeps current protected utility routes out of robots crawl", () => {
    const directives = read("public/robots.txt")
      .split(/\r?\n/)
      .filter((line) => line.startsWith("Disallow:"));

    for (const directive of [
      "Disallow: /admin",
      "Disallow: /feedback",
      "Disallow: /quiz/playtest",
      "Disallow: /playtest/",
      "Disallow: /quiz/admin",
    ]) {
      expect(directives).toContain(directive);
    }
    expect(new Set(directives).size).toBe(directives.length);
  });

  it("applies noindex at the Quiz Admin and Ranked match hosts", () => {
    expect(read("src/pages/QuizAdmin.tsx")).toMatch(
      /path="\/quiz\/admin"[\s\S]*?noindex[\s\S]*?\/>/,
    );
    expect(read("src/pages/quiz-ranked/QuizRankedPage.tsx")).toMatch(
      /path="\/quiz\/ranked"[\s\S]*?noindex[\s\S]*?\/>/,
    );
  });
});
