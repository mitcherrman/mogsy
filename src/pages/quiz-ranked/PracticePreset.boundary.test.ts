import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("LH2.1 Practice preset execution boundary", () => {
  it("uses the generic queue preset request and canonical Ranked route", () => {
    const client = read("src/lib/ranked-public/client.ts");
    const page = read("src/pages/quiz-ranked/QuizRankedPage.tsx");

    expect(client).toContain('"/api/ranked/queue"');
    expect(client).toContain("options?.preset");
    expect(page).toContain("<QuizRankedMatch");
  });

  it("does not add a Practice renderer, endpoint, or active-session state", () => {
    const rankedPage = read("src/pages/quiz-ranked/QuizRankedPage.tsx");
    const rankedMatch = read("src/pages/quiz-ranked/QuizRankedMatch.tsx");

    expect(rankedPage).not.toContain("QuizPhase");
    expect(rankedMatch).not.toContain("QuizPhase");
    expect(rankedMatch).not.toContain("/api/quiz/questions");
    expect(rankedMatch).not.toContain("/api/quiz/attempts");
  });
});
