/**
 * Academy Pulse — Twitch channels and their live state.
 *
 * A channel is owner-entered metadata (who to feature). Whether it is LIVE,
 * and how many people watch, is live data the owner cannot attest to, so it
 * is only ever taken from `TwitchLiveEvidence` that is:
 *
 *   · from a source the caller explicitly trusts (a Mogzy server-side reader
 *     of Twitch Helix / EventSub; NONE exists today, so the default trusts nothing),
 *   · for exactly this channel,
 *   · observed recently (default 90 s) and not past its own expiry.
 *
 * Anything else, including no evidence at all, shows the channel without a
 * LIVE pill and without an audience. The adapter never says "offline" either:
 * it simply makes no claim.
 */
import type { TwitchLiveEvidence } from "./partner-contract";
import { parseInstant } from "./partner-validate";

/** Twitch logins: 4–25 letters, digits or underscores (the PULSE-1 embed rule, 3–25, accepts all of these). */
export const TWITCH_LOGIN = /^[A-Za-z0-9_]{4,25}$/;

const CHANNEL_HOSTS = new Set(["twitch.tv", "www.twitch.tv", "m.twitch.tv"]);
/** Twitch paths that are not channels. */
const RESERVED = new Set(["directory", "videos", "settings", "subscriptions", "inventory", "wallet", "drops", "search", "downloads", "jobs", "p", "turbo", "store"]);

/** Default freshness for live evidence. A Helix poll every 60 s fits inside it. */
export const DEFAULT_LIVE_MAX_AGE_MS = 90_000;
/** Allowed clock skew between the reader and this browser. */
const FUTURE_SKEW_MS = 30_000;

/** The lowercase login from a channel URL, or null. */
export function parseTwitchChannelUrl(raw: string): string | null {
  if (typeof raw !== "string" || raw.length > 2048 || raw.trim() !== raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (!CHANNEL_HOSTS.has(url.hostname.toLowerCase())) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 1) return null;
  const login = segments[0].toLowerCase();
  return TWITCH_LOGIN.test(login) && !RESERVED.has(login) ? login : null;
}

export type LiveDecision =
  | { live: true; viewersLabel: string; validUntil: number }
  | { live: false; reason: "no-evidence" | "offline" | "untrusted" | "stale" | "malformed"; validUntil: number | null };

export interface LiveOptions {
  now: number;
  /** Evidence sources the caller trusts. Default: none. */
  trustedSources?: ReadonlySet<TwitchLiveEvidence["source"]>;
  maxAgeMs?: number;
}

/** Decide whether `login` may be shown LIVE right now, from the evidence on hand. */
export function decideLive(login: string, evidence: readonly TwitchLiveEvidence[], opts: LiveOptions): LiveDecision {
  const trusted = opts.trustedSources ?? new Set();
  const maxAge = opts.maxAgeMs ?? DEFAULT_LIVE_MAX_AGE_MS;
  const mine = evidence.filter((e) => typeof e.login === "string" && e.login.toLowerCase() === login);
  if (mine.length === 0) return { live: false, reason: "no-evidence", validUntil: null };

  // the newest well-formed observation wins
  let best: { e: TwitchLiveEvidence; at: number } | null = null;
  for (const e of mine) {
    const at = parseInstant(e.observedAt);
    if (at === null) continue;
    if (!best || at > best.at) best = { e, at };
  }
  if (!best) return { live: false, reason: "malformed", validUntil: null };
  const { e, at } = best;
  if (!trusted.has(e.source)) return { live: false, reason: "untrusted", validUntil: null };
  if (at > opts.now + FUTURE_SKEW_MS) return { live: false, reason: "malformed", validUntil: null };

  let until = at + maxAge;
  if (e.expiresAt !== undefined) {
    const exp = parseInstant(e.expiresAt);
    if (exp === null) return { live: false, reason: "malformed", validUntil: null };
    until = Math.min(until, exp);
  }
  if (opts.now >= until) return { live: false, reason: "stale", validUntil: null };
  if (e.state !== "live") return { live: false, reason: "offline", validUntil: until };

  const viewers = e.viewerCount;
  const viewersLabel = typeof viewers === "number" && Number.isInteger(viewers) && viewers >= 0 ? `${formatViewers(viewers)} watching` : "now";
  return { live: true, viewersLabel, validUntil: until };
}

/** "842", "1.2K", "12K", "1.4M" — rounded down, so a count is never overstated. */
export function formatViewers(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${Math.floor(n / 100) / 10}K`.replace(".0K", "K");
  if (n < 1_000_000) return `${Math.floor(n / 1000)}K`;
  return `${Math.floor(n / 100_000) / 10}M`.replace(".0M", "M");
}
