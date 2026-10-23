/**
 * Content Creator — one view model for a finished export, whether it was just
 * generated or reopened from local history.
 *
 * A live run is read from the CC2 reports; a history entry is read back out of
 * the ZIP the run produced. Both paths yield the SAME `CreatorRunView`, built
 * from the same files the operator downloads (`manifest.json`, `failures.json`,
 * `index.html`, the PNGs), so a preview can never show something the archive
 * does not contain.
 */
import JSZip from "jszip";
import type { BrowserRunStatus } from "@/lib/quiz-screenshot/browserRun";
import type { ContentExportResult } from "@/lib/quiz-screenshot/contentExport";
import type { RunFailure } from "@/lib/quiz-screenshot/finalize";
import { parseRunManifest, type ManifestSlide, type RunManifest } from "@/lib/quiz-screenshot/manifest";

export type CreatorImage = {
  /** Run-relative path, e.g. `question_000123/mobile-social_slide-01_question.png`. */
  path: string;
  blob: Blob;
  width: number;
  height: number;
  slide: ManifestSlide | null;
};

export type CreatorRunPart = {
  runId: string;
  status: BrowserRunStatus;
  manifest: RunManifest | null;
  failures: RunFailure[];
  skipped: Array<{ state: string; reason: string; group: string }>;
  images: CreatorImage[];
  contactSheetHtml: string;
  counts: { planned: number | null; captured: number; failed: number; warnings: number };
};

export type CreatorRunView = {
  kind: "run" | "daily";
  status: BrowserRunStatus;
  aborted: string | null;
  runs: CreatorRunPart[];
  archive: { blob: Blob; fileName: string };
};

function overallStatus(parts: CreatorRunPart[]): BrowserRunStatus {
  const statuses = parts.map((p) => p.status);
  if (statuses.includes("failed") || parts.length === 0) return "failed";
  if (statuses.includes("succeeded-with-warnings")) return "succeeded-with-warnings";
  return "succeeded";
}

export function viewFromResult(result: ContentExportResult): CreatorRunView {
  const runs: CreatorRunPart[] = result.runs.map(({ report }) => {
    const slidesByFile = new Map(report.manifest.slides.map((s) => [s.file, s]));
    return {
      runId: report.runId,
      status: report.status,
      manifest: report.manifest,
      failures: report.failures,
      skipped: report.metadata.flatMap((m) =>
        m.states_skipped.map((s) => ({ ...s, group: m.stable_slug })),
      ),
      images: report.images.map((i) => ({ ...i, slide: slidesByFile.get(i.path) ?? null })),
      contactSheetHtml: report.contactSheetHtml,
      counts: {
        planned: report.counts.planned,
        captured: report.counts.captured,
        failed: report.counts.failed,
        warnings: report.counts.warnings,
      },
    };
  });
  const aborted = result.runs.map((r) => r.result.aborted).find((a) => a) ?? null;
  return {
    kind: result.kind,
    status: result.status,
    aborted,
    runs,
    archive: { blob: result.archive.blob, fileName: result.archive.fileName },
  };
}

/**
 * Rebuild a view from an archive the Content Creator produced. Tolerant: a
 * missing or unreadable report degrades that run, it never throws.
 */
export async function viewFromArchive(blob: Blob, fileName: string): Promise<CreatorRunView> {
  const zip = await JSZip.loadAsync(blob);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const runIds = [...new Set(names.filter((n) => n.endsWith("/manifest.json")).map((n) => n.split("/")[0]))];
  const readJson = async (name: string): Promise<unknown> => {
    const file = zip.file(name);
    if (!file) return null;
    try {
      return JSON.parse(await file.async("string"));
    } catch {
      return null;
    }
  };

  const runs: CreatorRunPart[] = [];
  for (const runId of runIds.sort()) {
    const manifest = parseRunManifest(await readJson(`${runId}/manifest.json`));
    const failures = ((await readJson(`${runId}/failures.json`)) as RunFailure[] | null) ?? [];
    const summary = (await readJson(`${runId}/summary.json`)) as { aborted?: string | null } | null;
    const slides = manifest?.slides ?? [];
    const images: CreatorImage[] = [];
    for (const slide of slides) {
      const file = zip.file(`${runId}/${slide.file}`);
      if (!file) continue;
      images.push({
        path: slide.file,
        blob: new Blob([await file.async("arraybuffer")], { type: "image/png" }),
        width: slide.width ?? 0,
        height: slide.height ?? 0,
        slide,
      });
    }
    const metaFiles = names.filter((n) => n.startsWith(`${runId}/`) && n.endsWith("/metadata.json"));
    const skipped: CreatorRunPart["skipped"] = [];
    for (const name of metaFiles) {
      const meta = (await readJson(name)) as { stable_slug?: string; states_skipped?: Array<{ state: string; reason: string }> } | null;
      for (const s of meta?.states_skipped ?? []) skipped.push({ ...s, group: meta?.stable_slug ?? "" });
    }
    const warnings = manifest?.warning_count ?? 0;
    const aborted = summary?.aborted ?? null;
    runs.push({
      runId,
      status:
        aborted || failures.length > 0 || images.length === 0
          ? "failed"
          : warnings > 0
            ? "succeeded-with-warnings"
            : "succeeded",
      manifest,
      failures,
      skipped,
      images,
      contactSheetHtml: (await zip.file(`${runId}/index.html`)?.async("string")) ?? "",
      counts: { planned: null, captured: images.length, failed: failures.length, warnings },
    });
  }

  const summaries = await Promise.all(runIds.map((id) => readJson(`${id}/summary.json`)));
  const aborted =
    (summaries as Array<{ aborted?: string | null } | null>).map((s) => s?.aborted ?? null).find((a) => a) ?? null;
  return {
    kind: names.some((n) => !n.includes("/") && n.endsWith("-package.json")) ? "daily" : "run",
    status: overallStatus(runs),
    aborted,
    runs,
    archive: { blob, fileName },
  };
}

/**
 * The contact sheet with its relative image links pointed at the given object
 * URLs, so it can be opened on its own (the archived copy keeps relative links
 * for use after unzipping).
 */
export function linkedContactSheet(html: string, urlsByPath: ReadonlyMap<string, string>): string {
  return html.replace(/(src|href)="([^"]+\.png)"/g, (match, attr: string, path: string) => {
    const url = urlsByPath.get(path.replace(/&amp;/g, "&"));
    return url ? `${attr}="${url}"` : match;
  });
}
