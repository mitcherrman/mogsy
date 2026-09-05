/**
 * PT1.7B — contract tests over the Builder's boundaries.
 *
 * These assert the shape of authority that no runtime test can reach: that the
 * Builder is a consumer surface, that it never became a second Practice engine,
 * and that PT1.7A's Free loop was not disturbed on the way past.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const BUILDER_FILES = [
  "src/lib/quiz/builderApi.ts",
  "src/components/quiz/builder/PracticeBuilderPanel.tsx",
  "src/components/quiz/builder/usePracticeBuilder.ts",
];

describe("the Builder is a consumer surface", () => {
  it("imports no admin credential helper and calls no admin route", () => {
    for (const file of BUILDER_FILES) {
      const source = read(file);
      for (const forbidden of [
        "adminCredentials", "buildAdminHeaders", "ADMIN_API_BASE_URL",
        "getAdminKey", "X-Admin-Key", "/api/ranked/admin", "/api/quiz/admin",
      ]) {
        expect(source, `${file} references ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("talks only to /api/quiz/builder/*", () => {
    const source = read("src/lib/quiz/builderApi.ts");
    const paths = [...source.matchAll(/"(\/api\/[^"`]*)"/g)].map((m) => m[1]);
    const templated = [...source.matchAll(/`(\/api\/[^`]*)`/g)].map((m) => m[1]);
    expect(paths.length + templated.length).toBeGreaterThan(0);
    for (const path of [...paths, ...templated]) {
      expect(path.startsWith("/api/quiz/builder/")).toBe(true);
    }
  });

  it("holds no entitlement rule of its own — the server is the authority", () => {
    for (const file of BUILDER_FILES) {
      const source = read(file);
      // The client may READ capability fields; it must never compute one.
      expect(source).not.toMatch(/is_pro\s*[=?]/);
      expect(source).not.toMatch(/isPro\s*=/);
    }
  });
});

describe("the Builder did not become a second Practice engine", () => {
  it("never fetches or grades a question itself", () => {
    for (const file of BUILDER_FILES) {
      const source = read(file);
      for (const forbidden of [
        "/api/quiz/questions", "/api/quiz/attempts", "/api/quiz/playlist",
        "submitAnswer", "correct_answer",
      ]) {
        expect(source, `${file} references ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("hands its list to the host runner through one prop", () => {
    const panel = read("src/components/quiz/builder/PracticeBuilderPanel.tsx");
    expect(panel).toContain("onStartSession");
    const page = read("src/pages/Quiz.tsx");
    // The same explicit-list entry PT1.7A introduced, not a new phase.
    expect(page).toContain("handleBuiltSession");
    expect(page).toContain('startHistorySession("practice_builder"');
  });
});

describe("PT1.7A's Free surfaces are untouched", () => {
  const page = read("src/pages/Quiz.tsx");

  it("keeps the session-bounded missed replay Free and unchanged", () => {
    expect(page).toContain("handlePracticeMissed");
    expect(page).toContain('startHistorySession("practice_missed"');
    expect(page).toContain("practice-missed-cta");
    // It still replays from memory: no endpoint, no bank.
    const handler = page.slice(page.indexOf("const handlePracticeMissed"),
                              page.indexOf("const handlePlayAgain"));
    expect(handler).not.toContain("await");
    expect(handler).not.toContain("missed-questions");
  });

  it("keeps the curated Packs, the subject rail and Time Trial visible", () => {
    expect(page).toMatch(/practicePanel:\s*true/);
    expect(page).toMatch(/timeTrial:\s*true/);
    expect(page).toMatch(/knowledgeBreakdown:\s*true/);
    expect(page).toMatch(/legacyPracticeGrid:\s*false/);
  });

  it("leaves the persistent MISSED bank's own gate alone", () => {
    const pane = read("src/components/quiz/workspace/MissedQuestionsReview.tsx");
    expect(pane).toContain("data?.locked");
    // The Builder's `missed` POOL is a different thing from this bank, and
    // must not have loosened it.
    expect(pane).not.toContain("builder");
  });
});
