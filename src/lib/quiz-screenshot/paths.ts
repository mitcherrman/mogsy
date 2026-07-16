/**
 * Deterministic, filesystem-safe naming for screenshot output.
 * Pure module — no fs access; the runner applies these to real paths.
 */

export const DEFAULT_EXPORT_ROOT = "quiz_content_exports";

/** Sanitize an arbitrary identifier into a safe path segment. */
export function safeSegment(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
  if (!cleaned) throw new Error(`Cannot derive a safe path segment from "${raw}"`);
  return cleaned;
}

/** Stable per-question directory name, e.g. question_000123. */
export function questionSlug(id: number | string): string {
  if (typeof id === "number" && Number.isFinite(id) && Number.isInteger(id) && id >= 0) {
    return `question_${String(id).padStart(6, "0")}`;
  }
  return `question_${safeSegment(String(id))}`;
}

/** Screenshot filename: <format>_<state>.png */
export function screenshotFileName(formatKey: string, state: string): string {
  return `${safeSegment(formatKey)}_${safeSegment(state)}.png`;
}

/** Carousel slide filename: <format>_slide-NN_<slug>.png */
export function slideFileName(formatKey: string, index: number, slug: string): string {
  const nn = String(index).padStart(2, "0");
  return `${safeSegment(formatKey)}_slide-${nn}_${safeSegment(slug)}.png`;
}

/** Run directory name from an explicit run id (validated) or a timestamp. */
export function runDirName(runId: string | undefined, now: Date): string {
  if (runId !== undefined) {
    if (!/^[A-Za-z0-9][A-Za-z0-9-_]{0,63}$/.test(runId)) {
      throw new Error(
        `Invalid run id "${runId}" — use 1-64 letters, digits, hyphens, or underscores`,
      );
    }
    return runId;
  }
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

/**
 * Guard for the export root: must be a plain relative path with no traversal
 * segments and no drive/UNC prefix, so clean/overwrite operations can never
 * escape the project directory.
 */
export function assertSafeExportRoot(root: string): void {
  if (!root || !root.trim()) throw new Error("Output root must not be empty");
  const normalized = root.replace(/\\/g, "/");
  if (/^([a-zA-Z]:|\/|\\)/.test(root) || normalized.startsWith("//")) {
    throw new Error(`Output root must be a relative path (got "${root}")`);
  }
  const segments = normalized.split("/").filter(Boolean);
  if (!segments.length) throw new Error("Output root must not be empty");
  for (const seg of segments) {
    if (seg === "." || seg === "..") {
      throw new Error(`Output root must not contain traversal segments (got "${root}")`);
    }
  }
  if (segments[0] === "public") {
    throw new Error("Output root must not be under public/ (generated captures would be served)");
  }
  if (segments[0] === "src") {
    throw new Error("Output root must not be under src/ (keep generated output out of source)");
  }
}
