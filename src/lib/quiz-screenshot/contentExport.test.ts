import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { runContentExport } from "./contentExport";
import { buildDailyPackagePlan, buildExportPlan } from "./exportPlan";
import type { RenderQuestion } from "./types";

const QUESTIONS = [11, 12, 13, 14].map((id) => ({
  id,
  question_text: `Q${id}?`,
  choices: [{ label: "A" }, { label: "B" }],
  correct_index: 0,
})) as unknown as RenderQuestion[];

// The unsupported path runs the whole pipeline (runner → report → archive)
// without mounting anything, which is what jsdom can exercise honestly.
const UNSUPPORTED = { engine: "unknown" as const, status: "unsupported" as const, missing: ["fetch"], notes: ["lacks fetch"] };

describe("runContentExport", () => {
  it("refuses a plan with errors rather than running part of it", async () => {
    const plan = buildExportPlan({ selection: [], formats: ["square"], states: ["question"], post: null });
    await expect(
      runContentExport({ request: { kind: "run", plan }, questions: QUESTIONS, styleBundle: { css: "", unresolved: [] } }),
    ).rejects.toThrow(/not runnable/);
  });

  it("a daily package becomes three reported runs and one archive with the package manifest", async () => {
    const plan = buildDailyPackagePlan({
      prefix: "pkg",
      featuredQuestionId: "11",
      challengeQuestionIds: ["12", "13"],
      reuseFeaturedAsOpener: true,
      formats: ["square"],
      questions: QUESTIONS,
    });
    const progress: number[] = [];
    const result = await runContentExport({
      request: { kind: "daily", plan },
      questions: QUESTIONS,
      styleBundle: { css: "", unresolved: [] },
      support: UNSUPPORTED,
      onProgress: (p) => progress.push(p.done),
    });
    expect(result.runs.map((r) => r.report.runId)).toEqual([
      "pkg-post-1-single-question",
      "pkg-post-2-answer-reveal",
      "pkg-post-3-multi-question",
    ]);
    // Nothing captured on an unsupported browser: every run is failed, none is "succeeded".
    expect(result.status).toBe("failed");
    expect(result.runs.every((r) => r.report.status === "failed")).toBe(true);
    expect(result.packageManifest?.posts.map((p) => p.capture_count)).toEqual([0, 0, 0]);
    expect(result.archive.fileName).toBe("pkg-package.zip");
    const zip = await JSZip.loadAsync(result.archive.blob);
    expect(Object.keys(zip.files).filter((n) => n.endsWith(".json") && !n.includes("/question_")).sort()).toEqual([
      "pkg-package.json",
      "pkg-post-1-single-question/failures.json",
      "pkg-post-1-single-question/manifest.json",
      "pkg-post-1-single-question/summary.json",
      "pkg-post-2-answer-reveal/failures.json",
      "pkg-post-2-answer-reveal/manifest.json",
      "pkg-post-2-answer-reveal/summary.json",
      "pkg-post-3-multi-question/failures.json",
      "pkg-post-3-multi-question/manifest.json",
      "pkg-post-3-multi-question/summary.json",
    ]);
    const failures = JSON.parse(await zip.file("pkg-post-3-multi-question/failures.json")!.async("string"));
    expect(failures.length).toBe(plan.posts[2].plan.cards.length);
    expect(failures.every((f: { classification: string }) => f.classification === "browser-unsupported")).toBe(true);
  });
});
