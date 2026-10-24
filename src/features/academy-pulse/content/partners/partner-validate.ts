/**
 * Academy Pulse — shared checks for partner records: URLs, image sources,
 * display text and timestamps. Pure functions, no network.
 */

/** Image hosts a partner still may come from. YouTube's own still host is the only third party. */
export const DEFAULT_PARTNER_IMAGE_HOSTS: readonly string[] = ["i.ytimg.com"];

const MAX_URL_LENGTH = 2048;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/;

/**
 * An https URL on one of `hosts` (exact hostname match), or null. Rejects
 * credentials in the URL, explicit ports, IP literals and anything that is
 * not https. Exact matching is deliberate: `evil-example.com` and
 * `example.com.evil.net` never pass for `example.com`.
 */
export function safeHttpsUrl(raw: string, hosts: readonly string[]): URL | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_URL_LENGTH || raw.trim() !== raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (IPV4.test(host) || host.startsWith("[")) return null;
  return hosts.some((h) => h.toLowerCase() === host) ? url : null;
}

/**
 * A still for a partner scene: a same-origin absolute path ("/assets/…") or
 * an https URL on an allowlisted image host. Returns the string to draw, or null.
 */
export function safeImageSrc(raw: string, hosts: readonly string[] = DEFAULT_PARTNER_IMAGE_HOSTS): string | null {
  if (typeof raw !== "string") return null;
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") && !raw.includes("..") && raw.length <= MAX_URL_LENGTH) {
    return raw;
  }
  return safeHttpsUrl(raw, hosts)?.href ?? null;
}

/** Display text: trimmed, non-empty, bounded, and free of control / bidi-override characters. */
export function cleanText(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().replace(/\s+/g, " ");
  if (t === "" || t.length > max || CONTROL.test(raw)) return null;
  return t;
}

/** Text limits that keep the PULSE-1 scenes inside their glass. */
export const TEXT_LIMITS = {
  name: 40,
  tag: 32,
  title: 100,
  detail: 200,
  tagline: 140,
  cta: 24,
  alt: 140,
} as const;

/** Epoch ms for an ISO timestamp WITH an explicit offset, or null. */
export function parseInstant(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}
