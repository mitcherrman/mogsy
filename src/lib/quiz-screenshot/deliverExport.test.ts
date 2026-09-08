import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliverExportedFiles } from "./deliverExport";
import type { ExportedFile } from "./runBrowserExport";

const png = (name: string) => new Blob([`fake-png-${name}`], { type: "image/png" });

const file = (path: string, fileName: string): ExportedFile => ({
  path,
  fileName,
  blob: png(fileName),
});

/** What the browser was actually asked to save. */
let downloads: { name: string; blob: Blob }[] = [];
let objectUrls: Blob[] = [];

beforeEach(() => {
  downloads = [];
  objectUrls = [];
  // jsdom has neither of these; the anchor is the only observable side effect.
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: (blob: Blob) => {
      objectUrls.push(blob);
      return `blob:mock/${objectUrls.length}`;
    },
    revokeObjectURL: () => {},
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function mockClick(
    this: HTMLAnchorElement,
  ) {
    downloads.push({ name: this.download, blob: objectUrls[objectUrls.length - 1] });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("deliverExportedFiles", () => {
  it("saves a single card as a plain PNG under its own name", async () => {
    const result = await deliverExportedFiles(
      [file("run/question_000123/mobile-social_question.png", "question_000123_mobile-social_question.png")],
      "run.zip",
    );
    expect(result).toEqual({
      kind: "png",
      fileName: "question_000123_mobile-social_question.png",
      fileCount: 1,
    });
    expect(downloads.map((d) => d.name)).toEqual([
      "question_000123_mobile-social_question.png",
    ]);
  });

  it("zips several cards under the run-directory layout a local run writes", async () => {
    const files = [
      file("run/question_000123/mobile-social_question.png", "a.png"),
      file("run/question_000123/mobile-social_correct.png", "b.png"),
      file("run/question_000456/mobile-social_question.png", "c.png"),
    ];
    const result = await deliverExportedFiles(files, "run.zip");
    expect(result).toEqual({ kind: "zip", fileName: "run.zip", fileCount: 3 });
    expect(downloads.map((d) => d.name)).toEqual(["run.zip"]);

    // The archive is inspected, not assumed: an export that names the right
    // file and packs the wrong path is a package nobody can use.
    const archive = await JSZip.loadAsync(downloads[0].blob);
    expect(Object.keys(archive.files).filter((n) => !archive.files[n].dir).sort()).toEqual([
      "run/question_000123/mobile-social_correct.png",
      "run/question_000123/mobile-social_question.png",
      "run/question_000456/mobile-social_question.png",
    ]);
    expect(await archive.file("run/question_000456/mobile-social_question.png")!.async("string"))
      .toBe("fake-png-c.png");
  });

  it("saves nothing, and says so, when every card was blocked", async () => {
    expect(await deliverExportedFiles([], "run.zip")).toBeNull();
    expect(downloads).toEqual([]);
  });
});
