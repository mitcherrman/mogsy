/**
 * Run-directory access safety: file resolution can never escape the runs
 * root, and run listing tolerates legacy runs without manifests.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getRunDetail, listRuns, safeRunFilePath } from "./runs";

const root = mkdtempSync(join(tmpdir(), "studio-runs-"));

afterAll(() => rmSync(root, { recursive: true, force: true }));

function makeRun(runId: string, opts: { manifest?: object; summary?: object; pngs?: string[] }) {
  const dir = join(root, runId);
  mkdirSync(dir, { recursive: true });
  if (opts.manifest) writeFileSync(join(dir, "manifest.json"), JSON.stringify(opts.manifest));
  if (opts.summary) writeFileSync(join(dir, "summary.json"), JSON.stringify(opts.summary));
  for (const p of opts.pngs ?? []) {
    const abs = join(dir, p);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  }
}

describe("safeRunFilePath", () => {
  makeRun("safe-run", { pngs: ["question_000001/mobile-social_question.png"] });

  it("resolves a valid nested png", () => {
    const abs = safeRunFilePath(root, "safe-run", "question_000001/mobile-social_question.png");
    expect(abs).not.toBeNull();
    expect(abs!.startsWith(join(root, "safe-run"))).toBe(true);
  });

  it("rejects traversal, bad run ids, bad segments, and bad extensions", () => {
    expect(safeRunFilePath(root, "safe-run", "../safe-run/x.png")).toBeNull();
    expect(safeRunFilePath(root, "safe-run", "..\\..\\etc\\passwd.png")).toBeNull();
    expect(safeRunFilePath(root, "safe-run", "a/../../x.png")).toBeNull();
    expect(safeRunFilePath(root, "../evil", "x.png")).toBeNull();
    expect(safeRunFilePath(root, "safe-run", "metadata.exe")).toBeNull();
    expect(safeRunFilePath(root, "safe-run", "sub/dir/deep/too/x.png")).toBeNull();
    expect(safeRunFilePath(root, "safe-run", "")).toBeNull();
    expect(safeRunFilePath(root, "safe-run", ".hidden.png")).toBeNull();
  });

  it("allows the contact sheet and json reports", () => {
    expect(safeRunFilePath(root, "safe-run", "index.html")).not.toBeNull();
    expect(safeRunFilePath(root, "safe-run", "manifest.json")).not.toBeNull();
  });
});

describe("listRuns / getRunDetail", () => {
  it("lists manifest runs, summary-only runs, and bare legacy dirs", () => {
    makeRun("with-manifest", {
      manifest: {
        schema_version: 1,
        run_id: "with-manifest",
        mode: "multi-question",
        question_ids: ["1", "2"],
        capture_count: 8,
        failure_count: 0,
        warning_count: 0,
        slides: [],
      },
      pngs: ["question_challenge/mobile-social_slide-01_opening.png"],
    });
    makeRun("summary-only", {
      summary: { post: "single-question", question_count: 1, capture_count: 2, failure_count: 1, warning_count: 0 },
      pngs: ["question_000001/a.png", "question_000001/b.png"],
    });
    makeRun("bare-legacy", { pngs: ["question_000002/x.png"] });

    const runs = listRuns(root);
    const byId = Object.fromEntries(runs.map((r) => [r.run_id, r]));
    expect(byId["with-manifest"].mode).toBe("multi-question");
    expect(byId["with-manifest"].has_manifest).toBe(true);
    expect(byId["with-manifest"].question_count).toBe(2);
    expect(byId["summary-only"].mode).toBe("single-question");
    expect(byId["summary-only"].failure_count).toBe(1);
    expect(byId["summary-only"].has_manifest).toBe(false);
    expect(byId["bare-legacy"].mode).toBeNull();
    expect(byId["bare-legacy"].image_count).toBe(1);
  });

  it("returns detail with images and null manifest for legacy runs", () => {
    const detail = getRunDetail(root, "bare-legacy");
    expect(detail).not.toBeNull();
    expect(detail!.manifest).toBeNull();
    expect(detail!.images).toEqual(["question_000002/x.png"]);
  });

  it("returns null for unknown or invalid run ids", () => {
    expect(getRunDetail(root, "nope-does-not-exist")).toBeNull();
    expect(getRunDetail(root, "../evil")).toBeNull();
  });
});
