/**
 * Academy Pulse — the partner adapter (PULSE-2C).
 *
 * One pure entry point: owner records (+ optional live evidence) in, the
 * creator-spotlight and sponsor parts of a `PulseCatalogue` out, with every
 * omission explained. It does not fetch, schedule or draw: a provider calls
 * it, the existing cadence orders what it returns, and the PULSE-1 scenes draw it.
 *
 * DISABLED. `PARTNER_CONTENT_ENABLED` is false and nothing imports this
 * module from the shell or the public provider. Wiring it into
 * `content/pulse-provider.ts` is PULSE-2A's integration step, after the owner
 * approves real records through PULSE-2B's workspace.
 */
import type { CreatorItem, PulseCatalogue, SponsorItem } from "../../model/pulse-types";
import type { CreatorRecord, PartnerOmission, SponsorCampaignRecord } from "./partner-contract";
import { type CreatorOptions, validateCreator } from "./creator";
import { type SponsorOptions, adaptSponsorCampaigns } from "./sponsor";

/** Off until the owner approves real partner content and PULSE-2A integrates it. */
export const PARTNER_CONTENT_ENABLED = false;

export type PartnerCapabilityStatus = "verified" | "owner-entered" | "disabled" | "absent";

/** What each integration can honestly do today, in this frontend, without secrets. */
export const PARTNER_CAPABILITIES: Readonly<Record<string, { status: PartnerCapabilityStatus; note: string }>> = {
  "youtube.url": { status: "verified", note: "Watch, Shorts, embed, live and youtu.be URLs reduce to a checked 11-character id (offline)." },
  "youtube.thumbnail": { status: "verified", note: "i.ytimg.com/vi/<id>/hqdefault.jpg, which exists for every video id; existence of the video itself is not checked." },
  "youtube.player": { status: "verified", note: "Privacy-enhanced youtube-nocookie embed, loaded only on Play (PULSE-1 viewer)." },
  "youtube.metadata": { status: "owner-entered", note: "Title and duration are owner-entered; reading them needs the Data API v3 (an API key, server-side)." },
  "youtube.availability": { status: "absent", note: "Private, deleted or non-embeddable videos are not detected; the embedded player shows YouTube's own error." },
  "twitch.channel": { status: "verified", note: "twitch.tv/<login> reduces to a checked login; the PULSE-1 viewer embeds the player with parent=<host>." },
  "twitch.live": { status: "disabled", note: "Accepted only as fresh evidence from a trusted server-side Helix/EventSub reader. No such reader exists, so no channel is ever shown LIVE." },
  "twitch.viewers": { status: "disabled", note: "Only from the same trusted live evidence; never owner-entered." },
  "creator.challenge": { status: "absent", note: "No public Mogzy challenge is both reproducible and score-authoritative; challenges are omitted." },
  "sponsor.campaign": { status: "owner-entered", note: "Approval, flight window, approved hosts, disclosure and artwork validated; publication requires an owner-approved record." },
  "sponsor.impression-cap": { status: "absent", note: "No impression storage; frequency is the cadence's promotion cap plus one concurrent campaign." },
};

export interface PartnerInput {
  creators?: readonly CreatorRecord[];
  sponsors?: readonly SponsorCampaignRecord[];
}

export type PartnerAdapterOptions = CreatorOptions & SponsorOptions;

export interface PartnerResult {
  creators: CreatorItem[];
  sponsors: SponsorItem[];
  /** Earliest moment anything above stops being valid (a flight ends, live evidence expires); re-adapt by then. */
  validUntil: number | null;
  omitted: PartnerOmission[];
}

export function adaptPartnerContent(input: PartnerInput, opts: PartnerAdapterOptions): PartnerResult {
  const omitted: PartnerOmission[] = [];
  let validUntil: number | null = null;
  const bound = (t: number | null) => {
    if (t !== null) validUntil = validUntil === null ? t : Math.min(validUntil, t);
  };

  const seen = new Set<string>();
  const creators: CreatorItem[] = [];
  for (const rec of input.creators ?? []) {
    const d = validateCreator(rec, opts);
    // Decisions are compared to their literal discriminant (`=== false`), never
    // `!d.ok`: tsconfig.app.json is not strict, and without strictNullChecks a
    // truthiness test does not narrow these unions.
    if (d.ok === false) {
      omitted.push(d.omission);
      continue;
    }
    if (seen.has(d.item.id)) {
      omitted.push({ recordId: String(rec.id), scope: "item", reason: "duplicate-id", detail: "Another creator record has the same id." });
      continue;
    }
    seen.add(d.item.id);
    creators.push(d.item);
    omitted.push(...d.notes);
    bound(d.validUntil);
  }

  const uniqueSponsors = (input.sponsors ?? []).filter((rec) => {
    const key = `sponsor:${String(rec.id).trim()}`;
    if (!seen.has(key)) {
      seen.add(key);
      return true;
    }
    omitted.push({ recordId: String(rec.id), scope: "item", reason: "duplicate-id", detail: "Another campaign has the same id." });
    return false;
  });
  const s = adaptSponsorCampaigns(uniqueSponsors, opts);
  omitted.push(...s.omitted);
  for (const { validUntil: t } of s.items) bound(t);

  return { creators, sponsors: s.items.map((x) => x.item), validUntil, omitted };
}

/** The catalogue slice a provider merges in. Empty categories are left out, so the cadence skips them. */
export function partnerCatalogue(result: PartnerResult): PulseCatalogue {
  const out: PulseCatalogue = {};
  if (result.creators.length > 0) out["creator-spotlight"] = result.creators;
  if (result.sponsors.length > 0) out.sponsor = result.sponsors;
  return out;
}
