/**
 * Academy Pulse — sponsor campaigns.
 *
 * A campaign reaches the Sponsor scene only when every one of these holds,
 * and is otherwise omitted (never swapped for another campaign or a placeholder):
 *
 *   · status `approved` with a recorded approval no later than now;
 *   · now inside its flight window (start inclusive, end exclusive);
 *   · placed on the Pulse surface;
 *   · an https destination on one of its own approved hosts;
 *   · artwork from an allowed image source, with alt text;
 *   · the disclosure the scene can show ("Sponsored") naming the sponsor shown;
 *   · display text within the scene's limits.
 *
 * Frequency: the cadence already allows at most 2 promotions per cycle, 3
 * apart (`model/pulse-cadence.ts`). On top of that this adapter lets at most
 * `maxConcurrentCampaigns` (default 1) campaigns into the catalogue at once,
 * earliest approval first. Impression caps per viewer would need impression
 * storage, which Pulse does not have; they are not offered.
 */
import type { SponsorItem } from "../../model/pulse-types";
import type { PartnerOmission, SponsorCampaignRecord } from "./partner-contract";
import { DEFAULT_PARTNER_IMAGE_HOSTS, TEXT_LIMITS, cleanText, parseInstant, safeHttpsUrl, safeImageSrc } from "./partner-validate";

/** A flight longer than this is almost certainly a data-entry mistake. */
export const MAX_FLIGHT_MS = 92 * 24 * 3600 * 1000;

export interface SponsorOptions {
  now: number;
  imageHosts?: readonly string[];
  maxConcurrentCampaigns?: number;
}

export type SponsorDecision =
  | { ok: true; item: SponsorItem; validUntil: number; approvedAt: number }
  | { ok: false; omission: PartnerOmission };

function omit(rec: SponsorCampaignRecord, reason: PartnerOmission["reason"], detail: string): SponsorDecision {
  return { ok: false, omission: { recordId: String(rec.id), scope: "item", reason, detail } };
}

export function validateSponsorCampaign(rec: SponsorCampaignRecord, opts: SponsorOptions): SponsorDecision {
  const { now } = opts;

  const approvedAt = rec.approval ? parseInstant(rec.approval.approvedAt) : null;
  if (rec.status !== "approved" || !rec.approval || !cleanText(rec.approval.approvedBy, 200) || approvedAt === null || approvedAt > now) {
    return omit(rec, "not-approved", `Campaign status is "${rec.status}"${rec.approval ? "" : " with no approval"}.`);
  }

  const start = parseInstant(rec.window?.startsAt);
  const end = parseInstant(rec.window?.endsAt);
  if (start === null || end === null || end <= start || end - start > MAX_FLIGHT_MS) {
    return omit(rec, "invalid-window", "Flight window is missing, inverted or longer than 92 days.");
  }
  if (now < start || now >= end) return omit(rec, "outside-window", now < start ? "Flight has not started." : "Flight has ended.");

  if (!rec.placement?.surfaces?.includes("academy-pulse")) return omit(rec, "not-placed-on-pulse", "Campaign is not placed on Academy Pulse.");

  const sponsorName = cleanText(rec.sponsorName, TEXT_LIMITS.name);
  const campaignTitle = cleanText(rec.campaignTitle, TEXT_LIMITS.title);
  const tagline = cleanText(rec.tagline, TEXT_LIMITS.tagline);
  const ctaLabel = cleanText(rec.ctaLabel, TEXT_LIMITS.cta);
  const id = cleanText(rec.id, 80);
  if (!sponsorName || !campaignTitle || !tagline || !ctaLabel || !id) return omit(rec, "invalid-text", "A display field is empty, too long or contains control characters.");

  if (rec.disclosure?.label !== "Sponsored" || cleanText(rec.disclosure.advertiser, TEXT_LIMITS.name) !== sponsorName) {
    return omit(rec, "invalid-disclosure", "Disclosure must be \"Sponsored\" and name the sponsor shown.");
  }

  const hosts = Array.isArray(rec.approvedHosts) ? rec.approvedHosts.filter((h) => typeof h === "string" && h.trim() !== "") : [];
  const destination = hosts.length > 0 ? safeHttpsUrl(rec.destinationUrl, hosts) : null;
  if (!destination) return omit(rec, "invalid-destination", "Destination is not https on an approved host.");

  const art = rec.artwork ? safeImageSrc(rec.artwork.url, opts.imageHosts ?? DEFAULT_PARTNER_IMAGE_HOSTS) : null;
  if (!art || !cleanText(rec.artwork.alt, TEXT_LIMITS.alt)) return omit(rec, "invalid-artwork", "Artwork is missing, has no alt text, or is not from an allowed image source.");

  const fixture = rec.provenance?.source !== "owner-entry";
  const item: SponsorItem = {
    id: `partner-sponsor-${id}`,
    kind: "sponsor",
    category: "sponsor",
    provenance: fixture ? "fixture" : "live",
    title: `Sponsored by ${sponsorName}: ${campaignTitle}`,
    sponsorName,
    campaignTitle,
    tagline,
    artUrl: art,
    ctaLabel,
    // samples link nowhere (the PULSE-1 fixture rule); the scene then shows the action inert
    href: fixture ? null : destination.href,
  };
  return { ok: true, item, validUntil: end, approvedAt };
}

/** Validate every campaign and keep at most `maxConcurrentCampaigns`, earliest approval first. */
export function adaptSponsorCampaigns(records: readonly SponsorCampaignRecord[], opts: SponsorOptions) {
  const limit = Math.max(0, Math.floor(opts.maxConcurrentCampaigns ?? 1));
  const omitted: PartnerOmission[] = [];
  const accepted: Extract<SponsorDecision, { ok: true }>[] = [];
  for (const rec of records) {
    const d = validateSponsorCampaign(rec, opts);
    if (d.ok === true) accepted.push(d);
    else if (d.ok === false) omitted.push(d.omission);
  }
  accepted.sort((a, b) => a.approvedAt - b.approvedAt || a.item.id.localeCompare(b.item.id));
  for (const d of accepted.slice(limit)) {
    omitted.push({ recordId: d.item.id.replace(/^partner-sponsor-/, ""), scope: "item", reason: "placement-limit", detail: `Only ${limit} concurrent campaign(s) may run on Pulse.` });
  }
  return { items: accepted.slice(0, limit).map(({ item, validUntil }) => ({ item, validUntil })), omitted };
}
