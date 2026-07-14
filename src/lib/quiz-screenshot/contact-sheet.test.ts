import { describe, expect, it } from "vitest";
import { buildContactSheet, escapeHtml } from "./contact-sheet";
import { buildQuestionMetadata } from "./metadata";
import type { RenderQuestion } from "./types";

const question: RenderQuestion = {
  id: 7,
  question_text: `Which <script>alert("xss")</script> & "item"?`,
  choices: [{ label: "A" }, { label: "B" }],
  correct_index: 0,
  category: "items",
};

const meta = buildQuestionMetadata({
  question,
  sourceMode: "fixture",
  statesRequested: ["question"],
  formatsRequested: ["square"],
  screenshots: [
    { format: "square", state: "question", file: "square_question.png", width: 1080, height: 1080 },
  ],
  statesSkipped: [{ state: "explanation", reason: "no explanation on this question" }],
  warnings: [{ severity: "warning", code: "w", message: "<b>warn</b>" }],
  consoleErrors: ["console <err>"],
  pageErrors: [],
  failedRequests: [],
  missingAssets: [],
  overflowFindings: [],
  generatedAt: "2026-07-13T00:00:00.000Z",
});

const summary = {
  runId: "test-run",
  generatedAt: "2026-07-13T00:00:00.000Z",
  sourceDescription: "fixture <x>",
  statesRequested: ["question"],
  formatsRequested: ["square"],
  totalQuestions: 1,
  captureCount: 1,
  failureCount: 0,
  warningCount: 1,
};

describe("escapeHtml", () => {
  it("escapes all HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });
});

describe("buildContactSheet", () => {
  const html = buildContactSheet(summary, [meta]);

  it("escapes question text, findings, and source description", () => {
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<b>warn</b>");
    expect(html).not.toContain("console <err>");
    expect(html).toContain("fixture &lt;x&gt;");
  });

  it("uses relative links only", () => {
    expect(html).toContain('src="question_000007/square_question.png"');
    expect(html).toContain('href="question_000007/square_question.png"');
    expect(html).not.toMatch(/(src|href)="(https?:|\/|[a-zA-Z]:)/);
  });

  it("renders question sections with warnings, skips, and counts", () => {
    expect(html).toContain("question_000007");
    expect(html).toContain("Warnings (1)");
    expect(html).toContain("Skipped states");
    expect(html).toContain("Captures: 1");
  });
});
