// ---------------------------------------------------------------------------
// PULSE-2B — partner records: what may be saved, approved and made public.
//
// The checks are PULSE-2C's (partner-validate.ts, sponsor.ts, creator.ts),
// repeated here so the owner sees the reason before pressing a button, and
// repeated again in SQL so the database refuses what the form missed. 2C's
// adapter remains the one that turns approved records into scenes.
//
// Two workspace-only rules sit on top of 2C's:
//   * a sponsor destination host must ALSO be on the global allowlist the
//     owner maintains (fresh MFA to add) — the campaign's own approvedHosts
//     alone is not enough for the first public sponsor;
//   * release gates (migration-set) keep sponsors and paid creators off the
//     public read until their disclosure can actually be rendered.
// ---------------------------------------------------------------------------

import type { CreatorItem, SponsorItem } from "@/features/academy-pulse/model/pulse-types";

import type { PulsePartnerInput, PulsePartnerRecord, PulseReleaseGates } from "./contract";
import { MAX_FLIGHT_MS, PARTNER_IMAGE_HOSTS, PARTNER_TEXT_LIMITS as L } from "./partnerContract";
import { isPaidPromotion } from "./policy";
import type { PulseIssue } from "./validation";

const MAX_URL = 2048;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/;
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const TWITCH_LOGIN = /^[A-Za-z0-9_]{4,25}$/;

/** 2C parseInstant: ISO-8601 with an explicit offset, else null. */
export function parseInstant(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/** 2C cleanText as a predicate: trimmed, non-empty, bounded, no control / bidi characters. */
export function okText(raw: unknown, max: number): boolean {
  if (typeof raw !== "string") return false;
  const t = raw.trim().replace(/\s+/g, " ");
  return t !== "" && t.length <= max && !CONTROL.test(raw);
}

export function isHostname(h: string): boolean {
  return HOSTNAME.test(h) && !IPV4.test(h);
}

/** 2C safeHttpsUrl: https, no credentials / port / IP literal, exact host match. */
export function httpsOnHosts(raw: unknown, hosts: readonly string[]): URL | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_URL || raw.trim() !== raw) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (IPV4.test(host) || host.startsWith("[")) return null;
  return hosts.some((h) => h.toLowerCase() === host) ? url : null;
}

/** 2C safeImageSrc. */
export function imageSrc(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") && !raw.includes("..") && raw.length <= MAX_URL) return raw;
  return httpsOnHosts(raw, PARTNER_IMAGE_HOSTS)?.href ?? null;
}

/** A YouTube video id from the URL forms 2C accepts, else null. */
export function youtubeId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  const seg = url.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  if (host === "youtu.be") id = seg[0] ?? null;
  else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
    id = seg[0] === "watch" ? url.searchParams.get("v") : ["shorts", "embed", "live"].includes(seg[0]) ? seg[1] ?? null : null;
  } else if (["youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) id = seg[0] === "embed" ? seg[1] ?? null : null;
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** A Twitch login from https://www.twitch.tv/<login>, else null. */
export function twitchLogin(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" || !["twitch.tv", "www.twitch.tv", "m.twitch.tv"].includes(url.hostname.toLowerCase())) return null;
  const seg = url.pathname.split("/").filter(Boolean);
  return seg.length === 1 && TWITCH_LOGIN.test(seg[0]) ? seg[0].toLowerCase() : null;
}

const issue = (field: string, message: string): PulseIssue => ({ field, message });

/**
 * Save: a draft may be incomplete, but nothing present may be unsafe, and
 * nothing may exceed the scene's limits.
 */
export function validatePartnerSave(input: PulsePartnerInput): PulseIssue[] {
  const out: PulseIssue[] = [];
  const tooLong = (field: string, v: unknown, max: number) => {
    if (typeof v === "string" && v.trim() !== "" && !okText(v, max)) out.push(issue(field, `Up to ${max} characters, no control characters.`));
  };
  const r = input.record;
  if (!okText(r.id, 80) || !/^[A-Za-z0-9_-]+$/.test(r.id)) out.push(issue("id", "A short id: letters, digits, - and _."));

  if (input.type === "sponsor") {
    const s = input.record;
    tooLong("sponsorName", s.sponsorName, L.name);
    tooLong("campaignTitle", s.campaignTitle, L.title);
    tooLong("tagline", s.tagline, L.tagline);
    tooLong("ctaLabel", s.ctaLabel, L.cta);
    tooLong("artworkAlt", s.artwork.alt, L.alt);
    if (s.artwork.url && !imageSrc(s.artwork.url)) out.push(issue("artworkUrl", "A same-origin path or an https image on an allowed image host."));
    const badHost = s.approvedHosts.find((h) => !isHostname(h.toLowerCase()));
    if (badHost !== undefined) out.push(issue("approvedHosts", `“${badHost}” is not a hostname.`));
    if (s.destinationUrl && !httpsOnHosts(s.destinationUrl, s.approvedHosts)) out.push(issue("destinationUrl", "https, on one of this campaign's approved hosts."));
    if (s.disclosure.label !== "Sponsored") out.push(issue("disclosure", "Sponsors are disclosed as Sponsored."));
    if (s.window.startsAt && parseInstant(s.window.startsAt) === null) out.push(issue("window", "Start needs a full date and time."));
    if (s.window.endsAt && parseInstant(s.window.endsAt) === null) out.push(issue("window", "End needs a full date and time."));
    if (!s.placement.surfaces.every((x) => x === "academy-pulse")) out.push(issue("placement", "Academy Pulse is the only surface."));
  } else {
    const c = input.record;
    tooLong("creatorName", c.creatorName, L.name);
    tooLong("creatorTag", c.creatorTag, L.tag);
    tooLong("mediaTitle", c.media.title, L.title);
    if (c.media.platform === "youtube" && c.media.url && !youtubeId(c.media.url)) out.push(issue("mediaUrl", "Not a YouTube video or Short URL."));
    if (c.media.platform === "twitch" && c.media.channelUrl && !twitchLogin(c.media.channelUrl)) out.push(issue("mediaUrl", "Not a Twitch channel URL."));
    if (c.media.thumbnailUrl !== undefined && !imageSrc(c.media.thumbnailUrl)) out.push(issue("thumbnailUrl", "A same-origin path or an https image on an allowed image host."));
    if ((c.activeFrom !== undefined && parseInstant(c.activeFrom) === null) || (c.activeUntil !== undefined && parseInstant(c.activeUntil) === null)) {
      out.push(issue("window", "Feature window needs full dates and times."));
    }
  }
  return out;
}

/** Everything Save checks, plus what approval needs (2C's full rules + the global host allowlist). */
export function validatePartnerForApproval(input: PulsePartnerInput, sponsorHostAllowlist: readonly string[], now: Date): PulseIssue[] {
  const out = validatePartnerSave(input);
  const t = now.getTime();
  if (input.type === "sponsor") {
    const s = input.record;
    if (!okText(s.sponsorName, L.name) || !okText(s.campaignTitle, L.title) || !okText(s.tagline, L.tagline) || !okText(s.ctaLabel, L.cta)) {
      out.push(issue("text", "Sponsor name, campaign title, tagline and button label are all required."));
    }
    if (!imageSrc(s.artwork.url) || !okText(s.artwork.alt, L.alt)) out.push(issue("artworkUrl", "Artwork with alt text is required."));
    if (s.disclosure.advertiser.trim() !== s.sponsorName.trim()) out.push(issue("disclosure", "The disclosure must name the sponsor shown."));
    const dest = httpsOnHosts(s.destinationUrl, s.approvedHosts);
    if (!dest) out.push(issue("destinationUrl", "https, on one of this campaign's approved hosts."));
    else if (!sponsorHostAllowlist.includes(dest.hostname.toLowerCase())) out.push(issue("destinationUrl", `${dest.hostname} is not on the sponsor host allowlist.`));
    const a = parseInstant(s.window.startsAt);
    const b = parseInstant(s.window.endsAt);
    if (a === null || b === null || b <= a || b - a > MAX_FLIGHT_MS) out.push(issue("window", "Flight needs a start and end, at most 92 days apart."));
    else if (b <= t) out.push(issue("window", "This flight has already ended."));
    if (!s.placement.surfaces.includes("academy-pulse")) out.push(issue("placement", "Place it on Academy Pulse."));
  } else {
    const c = input.record;
    if (!okText(c.creatorName, L.name) || !okText(c.creatorTag, L.tag) || !okText(c.media.title, L.title)) {
      out.push(issue("text", "Creator name, tag and media title are required."));
    }
    if (c.media.platform === "youtube" ? !youtubeId(c.media.url) : !twitchLogin(c.media.channelUrl)) out.push(issue("mediaUrl", "Connect a real video or channel."));
    const until = c.activeUntil === undefined ? null : parseInstant(c.activeUntil);
    if (until !== null && until <= t) out.push(issue("window", "This feature window has already ended."));
  }
  return out;
}

/** Why an APPROVED record still would not leave the database (release gates). */
export function gateIssue(p: Pick<PulsePartnerRecord, "type" | "compensation">, gates: PulseReleaseGates): string | null {
  if (p.type === "sponsor" && !gates.sponsorDisclosureRendered) return "Sponsor disclosure is not rendered yet (shared-type PR pending).";
  if (p.type === "creator" && isPaidPromotion(p) && !gates.paidCreatorDisclosureRendered) {
    return "Paid creator disclosure is not rendered yet (shared-type PR pending).";
  }
  return null;
}

export function toPartnerInput(p: PulsePartnerRecord): PulsePartnerInput {
  if (p.type === "sponsor") {
    const { status: _s, approval: _a, provenance: _p, ...record } = p.record;
    return { type: "sponsor", record, compensation: null, note: p.note };
  }
  const { status: _s, approval: _a, provenance: _p, challenge: _c, ...record } = p.record;
  return { type: "creator", record, compensation: p.compensation, note: p.note };
}

/**
 * PREVIEW ONLY: an approximation of what PULSE-2C's adapter would draw, so
 * the owner can see the scene before #153 is integrated. Always labelled
 * "Sample" (provenance fixture) and never used for the public read; at
 * integration this becomes adaptPartnerContent().
 */
export function partnerPreviewItem(input: PulsePartnerInput): SponsorItem | CreatorItem {
  if (input.type === "sponsor") {
    const s = input.record;
    return {
      id: `preview-sponsor-${s.id}`, kind: "sponsor", category: "sponsor", provenance: "fixture",
      title: `Sponsored by ${s.sponsorName}: ${s.campaignTitle}`,
      sponsorName: s.sponsorName, campaignTitle: s.campaignTitle, tagline: s.tagline,
      artUrl: imageSrc(s.artwork.url), ctaLabel: s.ctaLabel, href: null,
    };
  }
  const c = input.record;
  const media: CreatorItem["media"] = c.media.platform === "youtube"
    ? { platform: "youtube", videoId: null, title: c.media.title, durationLabel: "Video",
        thumbnailUrl: c.media.thumbnailUrl ? imageSrc(c.media.thumbnailUrl) : (youtubeId(c.media.url) ? `https://i.ytimg.com/vi/${youtubeId(c.media.url)}/hqdefault.jpg` : null) }
    : { platform: "twitch", channel: null, title: c.media.title, live: false, viewersLabel: "",
        thumbnailUrl: c.media.thumbnailUrl ? imageSrc(c.media.thumbnailUrl) : null, thumbnailChampion: c.media.artChampion };
  return {
    id: `preview-creator-${c.id}`, kind: "creator", category: "creator-spotlight", provenance: "fixture",
    title: `${c.creatorName}: ${c.media.title}`, creatorName: c.creatorName, creatorTag: c.creatorTag, media, challenge: null,
  };
}
