/**
 * RFB — exactly ONE user-facing question-report path, on every mode.
 *
 * Practice was the exception: it carried a second "Report issue" button that
 * posted to `POST /api/quiz/reports`. Two buttons a few pixels apart, filing
 * into two different stores, with only one of them reaching the owner's
 * Feedback inbox. This asserts the removal, and — more importantly — asserts
 * the two things the removal deliberately did NOT do.
 *
 * A grep test, because the property is "no product surface calls this", which
 * is exactly the shape of claim that rots silently when someone adds a caller
 * back in a different file.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

/** Source with comments stripped. The files that document this boundary do so
 *  at length, so a bare substring scan would match the prose explaining the
 *  removal rather than a caller. Code is what these assertions are about. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * `/admin/about` is the project's own API documentation page. It names
 * `quizApi.reportQuestion()` inside a <Tag> on purpose — describing an
 * endpoint is not calling it — so it is excluded by name rather than by a
 * cleverer pattern that would also stop catching real callers.
 */
const DOCUMENTATION_PAGES = ["pages/AdminAbout.tsx"];

/** Product files naming `needle`, excluding the module that defines it. */
function callersOf(needle: string, definedIn: string): string[] {
  return sourceFiles(ROOT)
    .filter(file => !file.endsWith(definedIn))
    .filter(file => code(file).includes(needle))
    .map(file => file.slice(ROOT.length + 1))
    .filter(file => !DOCUMENTATION_PAGES.includes(file));
}

describe("one user-facing question reporter", () => {
  it("no product surface posts to the legacy quiz-reports endpoint", () => {
    expect(callersOf("quizApi.reportQuestion", "lib/quiz/api.ts")).toEqual([]);
  });

  it("Practice keeps no second report dialog of its own", () => {
    const quiz = code(join(ROOT, "pages", "Quiz.tsx"));
    expect(quiz).not.toContain("openReportDialog");
    expect(quiz).not.toContain("reportOpen");
    expect(quiz).not.toContain("Report issue");
  });

  it("Practice still publishes to the shared reporter", () => {
    // The removal must not have taken the replacement with it.
    const quiz = readFileSync(join(ROOT, "pages", "Quiz.tsx"), "utf8");
    expect(quiz).toContain("usePublishReportableQuestion");
    // Practice is the one mode holding BOTH identities; both must be sent.
    expect(quiz).toContain("questionKey: currentQuestion.question_key");
    expect(quiz).toContain("staticQuestionId: currentQuestion.id");
  });
});

describe("what the removal deliberately preserved", () => {
  it("keeps the override client, which is the load-bearing capability", () => {
    // `question_overrides` patches the live correct answer at serve AND grade
    // time (routes/quiz.py LEFT JOINs it in five endpoints). It is written by
    // this call, keyed on question_id or question_key, with no link to a
    // report row — so closing the report door cannot have removed it.
    const api = readFileSync(join(ROOT, "lib", "quiz", "api.ts"), "utf8");
    expect(api).toContain("overrideQuestion");
    expect(api).toContain("/api/quiz/admin/override-question");
  });

  it("keeps the legacy report client and its admin inbox reachable", () => {
    const api = readFileSync(join(ROOT, "lib", "quiz", "api.ts"), "utf8");
    // Retained, not deleted: the endpoint, the table and the rows still exist,
    // and re-opening the door must not require re-deriving the contract.
    expect(api).toContain("reportQuestion");
    expect(api).toContain("/api/quiz/reports");
    expect(api).toContain("/api/quiz/admin/reports");
  });
});
