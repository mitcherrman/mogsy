/**
 * "Which version of the Ranked scoring rules has this browser been shown?"
 *
 * WHY A VERSION AND NOT A BOOLEAN
 * ───────────────────────────────
 * A boolean answers "has this player ever seen a rules scroll", which is the
 * wrong question the first time the scoring model changes: every existing
 * player would keep the acknowledgement they gave to rules that no longer
 * apply. A stored version answers "has this player seen THESE rules", so
 * bumping `RANKED_RULES_VERSION` re-opens the scroll once, for everyone, and
 * then goes quiet again.
 *
 * WHERE IT LIVES, AND WHY HERE
 * ────────────────────────────
 * One localStorage key, written through the same guarded shape
 * `lib/lol/academy-updates-seen` already uses for the Academy Updates mark —
 * the established client-side "seen" mechanism in this frontend. It is not an
 * account preference because there is no account preference store to join:
 * `profiles` carries named columns only (no preferences/metadata JSON), so
 * account-level persistence would mean a schema migration for a dismissal
 * flag, which is more infrastructure than the fact is worth. The cost of
 * getting it wrong is one extra showing of a scroll on a second device.
 *
 * Storage may be absent or throw (private mode, disabled site data, SSR), so
 * every access is wrapped. A failure degrades to "nothing seen" — the scroll
 * opens. Over-showing a dismissable explanation is far cheaper than leaving a
 * new player with no explanation at all.
 *
 * NOTHING HERE IS SCORING. This module stores a UI acknowledgement. The
 * scoring rules themselves are the backend's, and this file does not encode,
 * derive or validate a single point value.
 */

const SEEN_KEY = "lol:ranked-rules:seen_version";

/**
 * The version of the Ranked rules explanation currently shipped.
 *
 * Bump this ONLY when the scoring model materially changes — a new award, a
 * changed value, a changed bonus condition, a changed match length. Bumping it
 * for a typo or a visual pass would re-interrupt every player for nothing.
 */
export const RANKED_RULES_VERSION = 1;

/** The rules version this browser has acknowledged, or 0 if it never has. */
export function readSeenRankedRulesVersion(): number {
  try {
    if (typeof localStorage === "undefined") return 0;
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return 0;
    const parsed = Number.parseInt(raw, 10);
    // A corrupt or hand-edited value is treated as unseen, not as "some
    // version": NaN must never compare its way into suppressing the scroll.
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

/**
 * Records the current rules version as acknowledged.
 *
 * Called when the player DISMISSES the scroll, not when it opens: opening is
 * automatic on a first visit, so treating that as the acknowledgement would
 * mark the rules read by a player who never looked at them.
 */
export function markRankedRulesSeen(version: number = RANKED_RULES_VERSION): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SEEN_KEY, String(version));
  } catch {
    // Storage unavailable: the scroll simply opens again next time. See the
    // note above about which direction is the safe one to fail in.
  }
}

/**
 * Whether the scroll should open by itself.
 *
 *   seen version <  current  ->  auto-open (first visit, or rules changed)
 *   seen version >= current  ->  start collapsed
 *
 * `>=` rather than `===` so a client rolled BACK to an older bundle does not
 * re-interrupt a player who has already acknowledged newer rules.
 */
export function shouldAutoOpenRankedRules(
  version: number = RANKED_RULES_VERSION,
): boolean {
  return readSeenRankedRulesVersion() < version;
}

/**
 * Whether the scroll can open BESIDE the arena rather than over it.
 *
 * This is the whole of the desktop/mobile difference, and it is a question
 * about LAYOUT, not about a device. From `sm` up the scroll is a column in the
 * corner: it covers no question, no timer, neither score and no answer tablet,
 * so opening it by itself on a first visit costs the player nothing. Below
 * `sm` the same panel is a full-width sheet, and auto-opening it would lay it
 * over the lower half of a round that is already on the server's clock.
 *
 * So a narrow layout is never auto-opened into. It gets a deliberately
 * noticeable collapsed tab instead, and the player opens the rules when they
 * choose to — which also means a narrow-layout player is NOT marked as having
 * seen the rules merely because a tab was drawn.
 *
 * 640px is `sm`, read straight off the panel's own `sm:w-[21rem]`: the
 * breakpoint where it stops being a sheet is exactly the breakpoint where
 * auto-opening becomes harmless, so the two must not be able to drift apart.
 *
 * Read once, synchronously, at the moment the decision is taken — a state
 * initializer. A hook that reports `false` on its first render (as
 * `useIsMobile` does) would auto-open on a phone before correcting itself,
 * which is the exact behaviour this exists to prevent. A later resize does not
 * re-open anything, deliberately: rotating a phone is not a request to be
 * interrupted.
 */
export function rulesCanOpenBesideArena(): boolean {
  try {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(min-width: 640px)").matches;
  } catch {
    // No matchMedia (older jsdom, exotic embedders): fail to the quiet side.
    // A missed auto-open leaves a visible tab; a wrong one covers a live round.
    return false;
  }
}
