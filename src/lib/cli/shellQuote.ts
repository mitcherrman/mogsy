/**
 * POSIX-shell argument quoting for the Admin → local-CLI handoff surfaces.
 *
 * Extracted verbatim from `src/lib/video-export/commands.ts`, which still
 * re-exports it so its own API and tests are unchanged. It lives here because
 * CON1 Step 2 added a SECOND command-handoff builder (the Content Factory
 * screenshot command) and two copies of a quoting rule is exactly how one of
 * them eventually gets an escape wrong.
 *
 * Pure: no fetch, no fs, no DOM.
 */

/**
 * Quote a single CLI argument for a POSIX-ish shell only when needed.
 * Values with spaces or shell-special chars get double-quoted; inner double
 * quotes are escaped. Simple tokens (paths, numbers, flags) pass through.
 */
export function quoteArg(value: string): string {
  if (value === "") return '""';
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}
