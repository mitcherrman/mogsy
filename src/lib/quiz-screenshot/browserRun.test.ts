import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildBrowserRunReport, buildDailyPackageManifest, buildRunArchive, BROWSER_GENERATOR_VERSION } from "./browserRun";
import type { BrowserExportSupport } from "./browserSupport";
import { EMPTY_LAYOUT } from "./domQa";
import { buildExportPlan, type ExportCard } from "./exportPlan";
import { parseRunManifest } from "./manifest";
import type { ExportCardOutcome, ExportRunResult } from "./runBrowserExport";
import type { RenderQuestion } from "./types";

/** A real PNG header (IHDR) of the given size; the body is irrelevant here. */
function pngBlob(width: number, height: number): Blob {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return new Blob([bytes], { type: "image/png" });
}

const Q: RenderQuestion[] = [101, 102, 103].map((id, i) => ({
  id,
  question_text: `Question ${id}?`,
  choices: [{ label: "Alpha" }, { label: "Beta" }, { label: "Gamma" }],
  correct_index: i % 3,
})) as unknown as RenderQuestion[];

const SUPPORT: BrowserExportSupport = { engine: "chromium", status: "verified", missing: [], notes: [] };

function captured(card: ExportCard, width = 1080, height = 1350): ExportCardOutcome {
  return {
    card,
    status: "captured",
    file: { path: card.zipPath, fileName: card.flatFileName, blob: pngBlob(width, height) },
    warnings: [],
    usedScale: 2,
    findings: [],
    overflow: [],
    missingAssets: [],
    layout: EMPTY_LAYOUT,
  };
}

function run(outcomes: ExportCardOutcome[], aborted: string | null = null): ExportRunResult {
  return {
    outcomes,
    files: outcomes.flatMap((o) => (o.status === "captured" ? [o.file] : [])),
    styleWarnings: [],
    aborted,
    support: SUPPORT,
    startedAt: new Date("2026-10-22T10:00:00Z"),
    finishedAt: new Date("2026-10-22T10:01:00Z"),
  };
}

const plan = buildExportPlan({
  selection: Q.slice(0, 2).map((q) => ({ id: String(q.id), label: `#${q.id}` })),
  formats: ["mobile-social"],
  states: [],
  post: null,
  mode: "single-question",
  runId: "run-a",
  questions: Q,
});

describe("buildBrowserRunReport", () => {
  it("a fully captured run succeeds, in canonical order, with a parseable manifest", async () => {
    const report = await buildBrowserRunReport({ plan, run: run(plan.cards.map((c) => captured(c))), questions: Q });
    expect(report.status).toBe("succeeded");
    expect(report.failures).toEqual([]);
    expect(report.images.map((i) => i.path)).toEqual([
      "question_000101/mobile-social_slide-01_question.png",
      "question_000101/mobile-social_slide-02_app-cta.png",
      "question_000102/mobile-social_slide-01_question.png",
      "question_000102/mobile-social_slide-02_app-cta.png",
    ]);
    const manifest = parseRunManifest(JSON.parse(JSON.stringify(report.manifest)))!;
    expect(manifest.mode).toBe("single-question");
    expect(manifest.slides.map((s) => [s.slug, s.question_id ?? null])).toEqual([
      ["question", 101], ["app-cta", null], ["question", 102], ["app-cta", null],
    ]);
    expect(manifest.questions.map((q) => q.correct_label)).toEqual(["Alpha", "Beta"]);
    expect(manifest.generator).toEqual({ version: BROWSER_GENERATOR_VERSION, commit: null });
    expect(manifest.completed).toBe(true);
    expect(manifest.capture_count).toBe(4);
    expect(report.contactSheetHtml).toContain("question_000101/mobile-social_slide-01_question.png");
    expect(report.metadata.map((m) => m.stable_slug)).toEqual(["question_000101", "question_000102"]);
  });

  it("never reports a failed capture as successful", async () => {
    const [first, ...rest] = plan.cards;
    const outcomes: ExportCardOutcome[] = [
      {
        card: first,
        status: "failed",
        classification: "leakage",
        reason: "Unanswered state shows non-idle choice styling",
        findings: [
          { severity: "failure", code: "leakage", message: "leak A" },
          { severity: "failure", code: "cta-missing", message: "no cta" },
          { severity: "warning", code: "degraded-asset", message: "warn" },
        ],
      },
      ...rest.map((c) => captured(c)),
    ];
    const report = await buildBrowserRunReport({ plan, run: run(outcomes), questions: Q });
    expect(report.status).toBe("failed");
    expect(report.failures.map((f) => [f.question_id, f.state, f.classification])).toEqual([
      [101, "question", "leakage"],
      [101, "question", "cta-missing"],
    ]);
    expect(report.manifest.slides.some((s) => s.file.endsWith("slide-01_question.png") && s.question_id === 101)).toBe(false);
    expect(report.manifest.failure_count).toBe(2);
    expect(report.counts).toMatchObject({ planned: 4, captured: 3, failed: 1 });
  });

  it("fails a PNG whose real size is not its format's, and an unreadable one", async () => {
    const outcomes = plan.cards.map((c, i) => (i === 0 ? captured(c, 1080, 1080) : captured(c)));
    (outcomes[1] as Extract<ExportCardOutcome, { status: "captured" }>).file.blob = new Blob(["nope"]);
    const report = await buildBrowserRunReport({ plan, run: run(outcomes), questions: Q });
    expect(report.failures.map((f) => f.classification)).toEqual(["dimension-mismatch", "invalid-png"]);
    expect(report.images).toHaveLength(2);
    expect(report.status).toBe("failed");
  });

  it("an aborted run is incomplete and failed even if every attempted card captured", async () => {
    const report = await buildBrowserRunReport({
      plan,
      run: run([captured(plan.cards[0])], "cancelled by the operator"),
      questions: Q,
    });
    expect(report.status).toBe("failed");
    expect(report.manifest.completed).toBe(false);
    expect(report.summary.aborted).toBe("cancelled by the operator");
  });

  it("a skipped card is reported as skipped, not as output and not as a failure", async () => {
    const outcomes: ExportCardOutcome[] = plan.cards.map((c, i) =>
      i === 0 ? { card: c, status: "skipped", reason: "no explanation" } : captured(c),
    );
    const report = await buildBrowserRunReport({ plan, run: run(outcomes), questions: Q });
    expect(report.status).toBe("succeeded");
    expect(report.metadata[0].states_skipped).toEqual([{ state: "question", reason: "no explanation" }]);
    expect(report.counts.skipped).toBe(1);
  });

  it("runs the generator's layout-stability gate across a post's slides", async () => {
    const outcomes = plan.cards.map((c, i) => {
      const o = captured(c) as Extract<ExportCardOutcome, { status: "captured" }>;
      o.layout = { ...EMPTY_LAYOUT, ground: { x: 0, y: i === 1 ? 9 : 0, w: 1080, h: 1350 } };
      return o;
    });
    const report = await buildBrowserRunReport({ plan, run: run(outcomes), questions: Q });
    expect(report.failures.map((f) => [f.classification, f.state])).toEqual([["layout-shift", "frame:app-cta"]]);
    expect(report.status).toBe("failed");
  });
});

describe("buildRunArchive", () => {
  it("writes the CLI's runs/ layout: PNGs, metadata, reports, package manifest", async () => {
    const report = await buildBrowserRunReport({ plan, run: run(plan.cards.map((c) => captured(c))), questions: Q });
    const pkg = buildDailyPackageManifest({
      prefix: "day",
      featuredQuestionId: "101",
      reuseFeaturedAsOpener: true,
      createdAt: new Date("2026-10-22T00:00:00Z"),
      posts: [{ key: "post-1-single-question", report }],
    });
    const archive = await buildRunArchive({ runs: [report], fileName: "day-package.zip", packageManifest: pkg });
    const zip = await JSZip.loadAsync(archive.blob);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
    expect(names).toEqual([
      "day-package.json",
      "run-a/failures.json",
      "run-a/index.html",
      "run-a/manifest.json",
      "run-a/question_000101/metadata.json",
      "run-a/question_000101/mobile-social_slide-01_question.png",
      "run-a/question_000101/mobile-social_slide-02_app-cta.png",
      "run-a/question_000102/metadata.json",
      "run-a/question_000102/mobile-social_slide-01_question.png",
      "run-a/question_000102/mobile-social_slide-02_app-cta.png",
      "run-a/summary.json",
    ]);
    const manifest = JSON.parse(await zip.file("run-a/manifest.json")!.async("string"));
    expect(manifest.slides).toHaveLength(4);
    const packageJson = JSON.parse(await zip.file("day-package.json")!.async("string"));
    expect(packageJson.posts).toEqual([
      { key: "post-1-single-question", run_id: "run-a", capture_count: 4, failure_count: 0, warning_count: 0 },
    ]);
  });
});
