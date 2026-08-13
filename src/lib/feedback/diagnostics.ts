import {
  FEEDBACK_CLIENT_META_KEYS,
  FEEDBACK_LIMITS,
  type FeedbackClientMeta,
} from "./contract";

/**
 * FB1 — automatic diagnostics.
 *
 * Everything here is collected without asking, so the rule is that it must be
 * boring: facts about the browser and the build, never about the person. The
 * allow-list in contract.ts is the enforcement point, and captureClientMeta
 * runs its output through it so a future edit cannot widen collection by
 * accident.
 *
 * Deliberately NOT collected: IP address, geolocation, anything from
 * localStorage or the session, referrer, screen recording, cookies, timezone,
 * language, or any identifier that would let two reports be linked to one
 * person beyond the profile they are already attributed to.
 */

/** Trim to a bounded length so a hostile UA string cannot bloat a row. */
const MAX_UA = 400;

/**
 * The build identifier, when one is configured. Falls back to the Vite mode
 * ("production" / "development"), which is a build fact rather than a user
 * fact and is still enough to tell a dev-only report apart from a live one.
 */
function appVersion(): string {
  const configured = import.meta.env.VITE_APP_VERSION;
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  return String(import.meta.env.MODE ?? "unknown");
}

/**
 * Capture the diagnostics attached to a submission.
 *
 * Safe to call in any environment: every field is optional and a missing
 * browser API is simply omitted rather than throwing, so this never blocks a
 * submission.
 */
export function captureClientMeta(): FeedbackClientMeta {
  const meta: FeedbackClientMeta = {};

  if (typeof navigator !== "undefined" && typeof navigator.userAgent === "string") {
    meta.ua = navigator.userAgent.slice(0, MAX_UA);
  }

  if (typeof window !== "undefined" && window.innerWidth && window.innerHeight) {
    // Viewport, not screen size: it is what actually determines the layout the
    // reporter saw, and it does not fingerprint the physical display.
    meta.viewport = `${Math.round(window.innerWidth)}x${Math.round(window.innerHeight)}`;
  }

  meta.app_version = appVersion();

  return pickAllowedKeys(meta);
}

/**
 * Drop anything not on the allow-list. The last line of defence: even if a
 * caller hands us an object with extra keys, only the three sanctioned fields
 * reach the database.
 */
export function pickAllowedKeys(input: Record<string, unknown>): FeedbackClientMeta {
  const out: FeedbackClientMeta = {};
  for (const key of FEEDBACK_CLIENT_META_KEYS) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) out[key] = value;
  }
  return out;
}

/**
 * The route a report was filed from, as a bare path.
 *
 * Query string and hash are stripped, not escaped: Stat Check room codes and
 * friend-invite codes live in query strings, and a diagnostics field is no
 * place to retain a credential. Truncated to the column's CHECK limit, which
 * also rejects '?' and '#' server-side if this is ever bypassed.
 */
export function capturePageUrl(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] || "/";
  return path.slice(0, FEEDBACK_LIMITS.pageUrl);
}
