/**
 * Remembered Catch-Up baseline (owner decision 7, design §13).
 *
 * A browser-local convenience: the patch the reader last PICKED in the
 * "I last knew patch" control. It is never account data, never play history,
 * and never written by merely opening a `?since=` link. Every storage access is
 * guarded; absence or failure simply means "nothing remembered".
 */

export const REMEMBERED_BASELINE_KEY = "mogzy.patchHub.catchUp.since.v1";

/** Patch-version shaped and short; anything else in storage is ignored. */
const VERSION_SHAPE = /^\d{1,3}(\.[0-9A-Za-z]{1,6}){1,3}$/;

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * The remembered baseline when it is well-formed AND still listed by the patch
 * index; otherwise null (an unlisted or malformed value is ignored, not deleted).
 */
export function readRememberedBaseline(listedVersions: readonly string[]): string | null {
  try {
    const value = storage()?.getItem(REMEMBERED_BASELINE_KEY) ?? null;
    if (!value || !VERSION_SHAPE.test(value)) return null;
    return listedVersions.includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeRememberedBaseline(version: string): void {
  if (!VERSION_SHAPE.test(version)) return;
  try {
    storage()?.setItem(REMEMBERED_BASELINE_KEY, version);
  } catch {
    /* storage unavailable: the feature works without memory */
  }
}

export function forgetRememberedBaseline(): void {
  try {
    storage()?.removeItem(REMEMBERED_BASELINE_KEY);
  } catch {
    /* ignore */
  }
}
