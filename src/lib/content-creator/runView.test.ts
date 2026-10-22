import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { openRunHistory } from "./history";
import { linkedContactSheet, viewFromArchive } from "./runView";

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

async function archive(opts: { failures?: unknown[]; aborted?: string | null; pkg?: boolean }) {
  const zip = new JSZip();
  const slides = [
    { index: 1, slide_kind: "quiz", slug: "question", state: "question", format: "square", file: "question_000001/square_slide-01_question.png", question_id: 1, width: 1080, height: 1080 },
    { index: 2, slide_kind: "app-cta", slug: "app-cta", state: "question", format: "square", file: "question_000001/square_slide-02_app-cta.png", width: 1080, height: 1080 },
  ];
  const manifest = {
    schema_version: 1, run_id: "r1", created_at: "2026-10-23T00:00:00Z", mode: "single-question",
    package_type: null, package_prefix: null, formats: ["square"], question_ids: [1], sources: [],
    questions: [{ id: 1, prompt_preview: "Q", correct_label: "A" }], states: null, difficulty_default: null,
    difficulty_overrides: {}, slides, capture_count: 2, failure_count: 0, warning_count: 0, challenge: null,
    copy_variants: {}, allow_incomplete_presentation: false, allow_missing_assets: false, platform: "generic",
    generator: { version: "browser-export-1", commit: null }, completed: true,
  };
  zip.file("r1/manifest.json", JSON.stringify(manifest));
  zip.file("r1/failures.json", JSON.stringify(opts.failures ?? []));
  zip.file("r1/summary.json", JSON.stringify({ aborted: opts.aborted ?? null }));
  zip.file("r1/index.html", '<img src="question_000001/square_slide-01_question.png">');
  zip.file("r1/question_000001/metadata.json", JSON.stringify({ stable_slug: "question_000001", states_skipped: [] }));
  for (const s of slides) zip.file(`r1/${s.file}`, png(1080, 1080));
  if (opts.pkg) zip.file("day-package.json", "{}");
  return zip.generateAsync({ type: "blob" });
}

describe("viewFromArchive", () => {
  it("rebuilds previews from the archive's own manifest, in slide order", async () => {
    const view = await viewFromArchive(await archive({}), "r1.zip");
    expect(view.kind).toBe("run");
    expect(view.status).toBe("succeeded");
    expect(view.runs).toHaveLength(1);
    expect(view.runs[0].images.map((i) => i.path)).toEqual([
      "question_000001/square_slide-01_question.png",
      "question_000001/square_slide-02_app-cta.png",
    ]);
    expect(view.runs[0].images[0].slide?.question_id).toBe(1);
  });

  it("a stored failure or abort reopens as failed, never as complete", async () => {
    const failed = await viewFromArchive(
      await archive({ failures: [{ question_id: 1, format: "square", state: "question", classification: "leakage", message: "x" }] }),
      "r1.zip",
    );
    expect(failed.status).toBe("failed");
    const aborted = await viewFromArchive(await archive({ aborted: "cancelled by the operator", pkg: true }), "day-package.zip");
    expect(aborted.status).toBe("failed");
    expect(aborted.aborted).toBe("cancelled by the operator");
    expect(aborted.kind).toBe("daily");
  });
});

describe("linkedContactSheet", () => {
  it("points the sheet's relative image links at the given URLs", () => {
    const html = '<a href="q/a.png"><img src="q/a.png"></a><img src="q/missing.png">';
    expect(linkedContactSheet(html, new Map([["q/a.png", "blob:1"]]))).toBe(
      '<a href="blob:1"><img src="blob:1"></a><img src="q/missing.png">',
    );
  });
});

describe("run history", () => {
  it("degrades to an inert store when IndexedDB is unavailable", async () => {
    const history = await openRunHistory(undefined as unknown as IDBFactory);
    // jsdom has no IndexedDB; the store must still answer every call.
    if (!globalThis.indexedDB) {
      expect(history.available).toBe(false);
      expect(await history.list()).toEqual([]);
      expect(await history.save({} as never, new Blob([]))).toBe(false);
      expect(await history.archive("x")).toBeNull();
    }
  });
});
