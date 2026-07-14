import { describe, expect, it } from "vitest";
import { finalizeRun, type ScannedQuestionDir } from "./finalize";
import { buildQuestionMetadata } from "./metadata";
import type { RenderQuestion } from "./types";

const question = (id: number): RenderQuestion => ({
  id,
  question_text: `Question ${id}?`,
  choices: [{ label: "A" }, { label: "B" }],
  correct_index: 0,
  category: "items",
});

const completeDir = (id: number): ScannedQuestionDir => {
  const files = [`mobile-social_question.png`, `mobile-social_correct.png`];
  return {
    dirName: `question_${String(id).padStart(6, "0")}`,
    metadata: buildQuestionMetadata({
      question: question(id),
      sourceMode: "question-id",
      statesRequested: ["question", "correct"],
      formatsRequested: ["mobile-social"],
      screenshots: files.map((file, i) => ({
        format: "mobile-social",
        state: i === 0 ? ("question" as const) : ("correct" as const),
        file,
        width: 1080,
        height: 1350,
      })),
      statesSkipped: [],
      warnings: [],
      consoleErrors: [],
      pageErrors: [],
      failedRequests: [],
      missingAssets: [],
      overflowFindings: [],
      generatedAt: "2026-07-14T00:00:00.000Z",
    }),
    pngFiles: files,
  };
};

const AT = "2026-07-14T01:00:00.000Z";

describe("finalizeRun — successful synthetic batch", () => {
  const reports = finalizeRun({
    runId: "test-run",
    outputDir: "X:/out",
    scanned: [completeDir(2), completeDir(1)],
    generatedAt: AT,
  });

  it("counts all captures and no failures", () => {
    expect(reports.summary).toMatchObject({
      run_id: "test-run",
      question_count: 2,
      complete_question_count: 2,
      partial_question_count: 0,
      capture_count: 4,
      failure_count: 0,
    });
    expect(reports.failures).toEqual([]);
  });

  it("builds a contact sheet listing every question with relative links", () => {
    expect(reports.contactSheetHtml).toContain("question_000001");
    expect(reports.contactSheetHtml).toContain("question_000002");
    expect(reports.contactSheetHtml).toContain('src="question_000001/mobile-social_question.png"');
  });

  it("is idempotent and order-independent", () => {
    const again = finalizeRun({
      runId: "test-run",
      outputDir: "X:/out",
      scanned: [completeDir(1), completeDir(2)],
      generatedAt: AT,
    });
    expect(again).toEqual(reports);
  });
});

describe("finalizeRun — partial runs are honest", () => {
  it("directory without metadata becomes a partial failure, never a success", () => {
    const r = finalizeRun({
      runId: "r",
      outputDir: "X:/out",
      scanned: [
        completeDir(1),
        { dirName: "question_000009", metadata: null, pngFiles: ["mobile-social_question.png"] },
      ],
      generatedAt: AT,
    });
    expect(r.summary).toMatchObject({
      question_count: 2,
      complete_question_count: 1,
      partial_question_count: 1,
      capture_count: 2, // only the complete dir's captures
    });
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toMatchObject({ classification: "partial-question" });
    expect(r.contactSheetHtml).toContain("metadata missing");
  });

  it("metadata-listed screenshots missing on disk become failures", () => {
    const dir = completeDir(1);
    dir.pngFiles = ["mobile-social_question.png"]; // correct.png vanished
    const r = finalizeRun({ runId: "r", outputDir: "X:/out", scanned: [dir], generatedAt: AT });
    expect(r.summary).toMatchObject({ capture_count: 1, partial_question_count: 1 });
    expect(r.failures[0]).toMatchObject({
      classification: "missing-screenshot",
      state: "correct",
    });
  });

  it("re-surfaces failure-severity findings recorded in metadata", () => {
    const dir = completeDir(1);
    dir.metadata!.warnings = [
      { severity: "failure", code: "leakage", message: "bad", format: "mobile-social", state: "question" },
      { severity: "warning", code: "text-clipping", message: "meh" },
    ];
    const r = finalizeRun({ runId: "r", outputDir: "X:/out", scanned: [dir], generatedAt: AT });
    expect(r.failures.map((f) => f.classification)).toEqual(["leakage"]);
    expect(r.summary).toMatchObject({ warning_count: 1 });
  });
});
