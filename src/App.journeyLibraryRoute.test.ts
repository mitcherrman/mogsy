/**
 * JLIB-FE — `/quiz/journeys` is a new, public route, and the legacy
 * standalone Mastery system at `/quiz/mastery` is untouched beside it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

function routeLine(path: string): string | null {
  const line = appSource.split("\n").find((l) => l.includes(`path="${path}"`));
  return line ?? null;
}

describe("Journey Library route", () => {
  it("serves /quiz/journeys publicly with the Journey Library page", () => {
    const line = routeLine("/quiz/journeys");
    expect(line).not.toBeNull();
    expect(line).toContain("<JourneyLibraryPage />");
    expect(line).not.toContain("ProtectedRoute");
    expect(appSource).toContain('import("./pages/quiz-journeys/JourneyLibraryPage")');
  });

  it("keeps the legacy /quiz/mastery system exactly where it was", () => {
    expect(routeLine("/quiz/mastery")).toContain("<MasteryJourneysPage />");
    expect(routeLine("/quiz/mastery/:masterySetId")).toContain("<MasteryJourneyPlayerPage />");
    expect(appSource).toContain('import("./pages/quiz-mastery/MasteryJourneysPage")');
    expect(routeLine("/quiz/mastery")).not.toContain("JourneyLibrary");
  });
});
