/**
 * Run-directory access for the Content Studio server: listing prior runs,
 * reading run detail, and SAFE file resolution (the only way the server ever
 * serves files — everything is rooted under <outRoot>/runs and validated
 * segment-by-segment; traversal is structurally impossible).
 *
 * Backward compatible: runs predating manifest.json fall back to summary.json,
 * and bare directories of PNGs still list with inferred info.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { parseRunManifest, type RunManifest } from "../../src/lib/quiz-screenshot/manifest";
import { RUN_ID_RE } from "../../src/lib/quiz-screenshot/studio-request";

/** Allowed file names inside a run dir (defense in depth beyond rooting). */
const FILE_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SERVABLE_EXT = new Set([".png", ".html", ".json"]);

export type RunListEntry = {
  run_id: string;
  modified_at: string;
  mode: string | null;
  package_type: string | null;
  question_count: number | null;
  capture_count: number | null;
  failure_count: number | null;
  warning_count: number | null;
  has_manifest: boolean;
  has_contact_sheet: boolean;
  image_count: number;
};

export type RunDetail = {
  run_id: string;
  manifest: RunManifest | null;
  summary: unknown | null;
  failures: unknown | null;
  /** Every servable PNG, run-relative with forward slashes, sorted. */
  images: string[];
  has_contact_sheet: boolean;
};

function readJson(path: string): unknown | null {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** List PNGs one level deep (run root plus question/challenge subdirs). */
function listRunImages(runDir: string): string[] {
  const images: string[] = [];
  for (const entry of readdirSync(runDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) {
      images.push(entry.name);
    } else if (entry.isDirectory() && FILE_SEGMENT_RE.test(entry.name)) {
      try {
        for (const f of readdirSync(join(runDir, entry.name))) {
          if (f.toLowerCase().endsWith(".png") && FILE_SEGMENT_RE.test(f)) {
            images.push(`${entry.name}/${f}`);
          }
        }
      } catch {
        /* unreadable subdir — skip */
      }
    }
  }
  return images.sort();
}

export function isValidRunId(runId: string): boolean {
  return RUN_ID_RE.test(runId);
}

/**
 * Resolve a run-relative file path to an absolute path, or null when ANY
 * check fails: run id shape, per-segment shape, extension allowlist, or the
 * resolved path escaping the run directory.
 */
export function safeRunFilePath(
  runsRoot: string,
  runId: string,
  relPath: string,
): string | null {
  if (!isValidRunId(runId)) return null;
  const segments = relPath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (!segments.length || segments.length > 3) return null;
  for (const seg of segments) {
    if (!FILE_SEGMENT_RE.test(seg) || seg === "." || seg === "..") return null;
  }
  const last = segments[segments.length - 1];
  const dot = last.lastIndexOf(".");
  if (dot < 0 || !SERVABLE_EXT.has(last.slice(dot).toLowerCase())) return null;
  const runDir = resolve(runsRoot, runId);
  const abs = resolve(runDir, segments.join("/"));
  if (abs !== runDir && !abs.startsWith(runDir + sep)) return null;
  return abs;
}

/** List runs, newest first. Tolerates legacy/incomplete run directories. */
export function listRuns(runsRoot: string, limit = 50): RunListEntry[] {
  if (!existsSync(runsRoot)) return [];
  const entries: RunListEntry[] = [];
  for (const entry of readdirSync(runsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isValidRunId(entry.name)) continue;
    const runDir = join(runsRoot, entry.name);
    let mtime = "";
    try {
      mtime = statSync(runDir).mtime.toISOString();
    } catch {
      /* stat race */
    }
    const manifest = parseRunManifest(readJson(join(runDir, "manifest.json")));
    const summary = readJson(join(runDir, "summary.json")) as Record<string, unknown> | null;
    const images = listRunImages(runDir);
    entries.push({
      run_id: entry.name,
      modified_at: mtime,
      mode: manifest?.mode ?? (typeof summary?.post === "string" ? summary.post : summary ? "classic" : null),
      package_type: manifest?.package_type ?? null,
      question_count:
        manifest?.question_ids.length ??
        (typeof summary?.question_count === "number" ? summary.question_count : null),
      capture_count:
        manifest?.capture_count ??
        (typeof summary?.capture_count === "number" ? summary.capture_count : images.length),
      failure_count:
        manifest?.failure_count ??
        (typeof summary?.failure_count === "number" ? summary.failure_count : null),
      warning_count:
        manifest?.warning_count ??
        (typeof summary?.warning_count === "number" ? summary.warning_count : null),
      has_manifest: !!manifest,
      has_contact_sheet: existsSync(join(runDir, "index.html")),
      image_count: images.length,
    });
  }
  return entries
    .sort((a, b) => (a.modified_at < b.modified_at ? 1 : -1))
    .slice(0, limit);
}

/** Full detail for one run; null when the run doesn't exist. */
export function getRunDetail(runsRoot: string, runId: string): RunDetail | null {
  if (!isValidRunId(runId)) return null;
  const runDir = join(runsRoot, runId);
  let isDir = false;
  try {
    isDir = statSync(runDir).isDirectory();
  } catch {
    return null;
  }
  if (!isDir) return null;
  return {
    run_id: runId,
    manifest: parseRunManifest(readJson(join(runDir, "manifest.json"))),
    summary: readJson(join(runDir, "summary.json")),
    failures: readJson(join(runDir, "failures.json")),
    images: listRunImages(runDir),
    has_contact_sheet: existsSync(join(runDir, "index.html")),
  };
}

/** Daily-package manifests living beside run dirs (<prefix>-package.json). */
export function listPackages(runsRoot: string): unknown[] {
  if (!existsSync(runsRoot)) return [];
  const out: unknown[] = [];
  for (const entry of readdirSync(runsRoot, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith("-package.json") && FILE_SEGMENT_RE.test(entry.name)) {
      const parsed = readJson(join(runsRoot, entry.name));
      if (parsed) out.push(parsed);
    }
  }
  return out;
}
