// ---------------------------------------------------------------------------
// Safe returnTo validation for auth redirects.
//
// Only same-origin absolute paths are allowed. This blocks open-redirect
// vectors: absolute URLs (https://evil.com), protocol-relative URLs
// (//evil.com), backslash tricks (/\evil.com — some browsers treat "\" as "/"),
// and control-character smuggling. The previous `raw.startsWith("/")` check
// alone accepted "//evil.com" and was unsafe.
// ---------------------------------------------------------------------------

/** Default post-auth destination when no safe returnTo is provided. */
export const DEFAULT_RETURN_PATH = "/quiz";

// Control characters and whitespace (<= 0x20). A legitimate path URL-encodes
// these; their presence signals an attempt to smuggle a second target.
// Built from an ASCII-only source string (no literal control chars in file).
const UNSAFE_CHARS = new RegExp("[\\u0000-\\u0020]");

/**
 * Returns `raw` only when it is a safe same-origin relative path; otherwise the
 * fallback. Never returns an absolute or protocol-relative URL.
 */
export function safeReturnPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_RETURN_PATH,
): string {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  // Must be an absolute path within this app.
  if (raw[0] !== "/") return fallback;
  // Reject protocol-relative ("//host") and backslash variants ("/\\host").
  if (raw[1] === "/" || raw[1] === "\\") return fallback;
  if (UNSAFE_CHARS.test(raw)) return fallback;
  return raw;
}
