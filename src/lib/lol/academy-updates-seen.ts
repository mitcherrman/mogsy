/**
 * "Newest update this browser has already seen", for the Academy Updates mark.
 *
 * One localStorage key holding one id. No account sync, no Supabase, no read
 * receipts per entry — the only question the Hall asks is "is the newest thing
 * newer than what this browser last looked at", and one id answers it.
 *
 * Storage may be absent or throw (private mode, disabled site data, SSR), so
 * every access is wrapped and every failure degrades to "nothing seen": the
 * mark stays in its quiet state rather than shouting on every page load. That
 * is the safe direction to fail — see the reasoning on the write path.
 */

const SEEN_KEY = "lol:academy-updates:seen_id";

/** The newest update id this browser has opened the panel on, if any. */
export function readSeenUpdateId(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(SEEN_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Records the newest published id as seen. Called when the panel opens, not
 * when it closes: opening it IS the act of reading, and a user who opens the
 * panel and navigates away should not be re-nudged.
 */
export function markUpdatesSeen(newestId: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SEEN_KEY, newestId);
  } catch {
    // Storage unavailable: the mark simply stays "new" for this browser. It is
    // a subtle dot on a small button, so over-showing it is a far cheaper
    // mistake than suppressing a genuine announcement.
  }
}

/**
 * Whether the mark should carry its "new" treatment. A browser that has never
 * stored anything counts as unseen, so a first-time visitor is nudged once.
 */
export function hasUnseenUpdate(newestId: string | null): boolean {
  if (!newestId) return false;
  return readSeenUpdateId() !== newestId;
}
