// ---------------------------------------------------------------------------
// PULSE-2B — the partner record contract, MIRRORED from PULSE-2C.
//
// Source of truth: src/features/academy-pulse/content/partners/partner-contract.ts
// (mitcherrman/mogsy#153, head bde8e29e). These declarations are copied
// VERBATIM so the workspace stores, and pulse_public_catalogue() emits,
// exactly the records 2C's adapter validates and draws: one public partner
// schema, not two. partnerContract.sync.test.ts compares them textually as
// soon as #153's file exists in the tree; at integration this file becomes
//   export type { … } from "@/features/academy-pulse/content/partners/partner-contract";
//
// Only the owner-editable records are mirrored. TwitchLiveEvidence and the
// omission types belong to the adapter, not to anything an owner writes.
// ---------------------------------------------------------------------------

/* mirror:begin */
/** Where a record came from. `fixture` is development sample data and is always labelled as such. */
export interface PartnerProvenance {
  source: "owner-entry" | "fixture";
  /** The owner account (admin user id) that wrote the record, or "fixture". */
  recordedBy: string;
  recordedAt: string;
  note?: string;
}

/** Publication state shared by creator and sponsor records. Only `approved` can be shown. */
export type PartnerStatus = "draft" | "pending-review" | "approved" | "paused" | "ended" | "rejected";

export interface PartnerApproval {
  approvedBy: string;
  approvedAt: string;
}

/* ------------------------------------------------------------------ creators */

export interface YouTubeMediaRecord {
  platform: "youtube";
  /** Any youtube.com watch / Shorts / embed / live URL, or a youtu.be link. */
  url: string;
  title: string;
  /** Owner-entered running time. YouTube's duration needs the Data API (a key), so it is optional. */
  durationSeconds?: number;
  /** Optional custom still (same-origin path or an allowlisted image host). Defaults to YouTube's own still. */
  thumbnailUrl?: string;
}

export interface TwitchChannelRecord {
  platform: "twitch";
  /** https://www.twitch.tv/<login> */
  channelUrl: string;
  /** What the spotlight says about the channel (not the current stream title: that is live data). */
  title: string;
  /** Optional custom still (same-origin path or an allowlisted image host). */
  thumbnailUrl?: string;
  /** Champion splash from the asset manifest, used when there is no still (no third-party request). */
  artChampion?: string;
}

/** A challenge source Mogzy could offer as "play what the creator played". See `creator-challenge.ts`. */
export type ChallengeSourceId = "daily-challenge" | "more-challenges" | "tournament-arena" | "card-duel-room";

export interface CreatorChallengeRecord {
  title: string;
  detail: string;
  /** The exact challenge: a source and its key (a seed, a room code, a fixed set id). */
  ref: { source: ChallengeSourceId; key: string };
  /** The creator's result, by reference only: the server attempt that produced it. */
  score: { source: ChallengeSourceId; attemptId: string; value: number; verifiedAt: string };
}

export interface CreatorRecord {
  id: string;
  creatorName: string;
  /** Short label above the name, e.g. "Creator" or "Partner streamer". */
  creatorTag: string;
  media: YouTubeMediaRecord | TwitchChannelRecord;
  challenge?: CreatorChallengeRecord;
  status: PartnerStatus;
  approval: PartnerApproval | null;
  /** Optional feature window. */
  activeFrom?: string;
  activeUntil?: string;
  provenance: PartnerProvenance;
}
/* mirror:end */

/* mirror:begin */
/** The surfaces a campaign may be placed on. Pulse is the only one today. */
export type SponsorSurface = "academy-pulse";

export interface SponsorCampaignRecord {
  id: string;
  sponsorName: string;
  campaignTitle: string;
  tagline: string;
  ctaLabel: string;
  /** Campaign artwork. Required: a real campaign never falls back to the placeholder plate. */
  artwork: { url: string; alt: string };
  destinationUrl: string;
  /** Exact hostnames the destination may use, approved with the campaign. */
  approvedHosts: string[];
  /**
   * The disclosure the scene shows. The Sponsor scene prints a fixed SPONSORED
   * band and the sponsor's name, so only that label is supported, and the
   * advertiser must be the name shown.
   */
  disclosure: { label: "Sponsored"; advertiser: string };
  window: { startsAt: string; endsAt: string };
  placement: { surfaces: SponsorSurface[] };
  status: PartnerStatus;
  approval: PartnerApproval | null;
  provenance: PartnerProvenance;
}
/* mirror:end */

/** PULSE-2C's text limits (partner-validate.ts TEXT_LIMITS), repeated server-side. */
export const PARTNER_TEXT_LIMITS = {
  name: 40,
  tag: 32,
  title: 100,
  detail: 200,
  tagline: 140,
  cta: 24,
  alt: 140,
} as const;

/** PULSE-2C's DEFAULT_PARTNER_IMAGE_HOSTS. */
export const PARTNER_IMAGE_HOSTS: readonly string[] = ["i.ytimg.com"];

/** PULSE-2C's MAX_FLIGHT_MS (sponsor.ts). */
export const MAX_FLIGHT_MS = 92 * 24 * 3600 * 1000;
