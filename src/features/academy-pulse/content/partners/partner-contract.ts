/**
 * Academy Pulse — partner content contract (PULSE-2C).
 *
 * The owner-editable records for creators, videos, Twitch channels, creator
 * challenges and sponsor campaigns, as an admin workspace (PULSE-2B) would
 * store them. Records are INPUT: nothing here is drawn directly. The adapters
 * in this folder validate each record and turn it into the `CreatorItem` /
 * `SponsorItem` the PULSE-1 scenes already draw, or omit it with a reason.
 *
 * Three rules shape the contract:
 *
 *   1. An owner can say WHAT to feature, never that something is happening.
 *      There is no owner-editable "live" or "viewers" field: a Twitch LIVE
 *      state is accepted only as separate, fresh evidence from a trusted
 *      server-side reader (`TwitchLiveEvidence`), and none exists yet.
 *   2. A score is never typed in. A creator challenge names a reproducible
 *      Mogzy challenge and a server attempt id; the adapter keeps it only when
 *      that challenge source is registered as reproducible and score-authoritative.
 *   3. Nothing is public without an approval. Drafts, paused, ended, rejected
 *      and out-of-window records are omitted, never replaced by something else.
 *
 * Every timestamp is an ISO-8601 string with an explicit offset (`Z` or ±hh:mm).
 */

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

/* ------------------------------------------------------------------ Twitch live evidence */

/**
 * Proof of a channel's live state, produced OUTSIDE the owner records by a
 * server-side reader of Twitch's API (Helix `GET /streams`, or an EventSub
 * `stream.online` / `stream.offline` subscription). The frontend never calls
 * Twitch for this (it would need an app access token).
 */
export interface TwitchLiveEvidence {
  login: string;
  state: "live" | "offline";
  source: "twitch-helix-streams" | "twitch-eventsub";
  /** When the reader observed this state. */
  observedAt: string;
  /** Optional hard expiry set by the reader; otherwise the adapter's max age applies. */
  expiresAt?: string;
  /** Helix `viewer_count` from the same observation, when the reader had it. */
  viewerCount?: number;
}

/* ------------------------------------------------------------------ sponsors */

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

/* ------------------------------------------------------------------ results */

export type OmissionReason =
  | "not-approved"
  | "outside-window"
  | "invalid-text"
  | "invalid-media-url"
  | "invalid-thumbnail"
  | "invalid-artwork"
  | "invalid-destination"
  | "invalid-disclosure"
  | "invalid-window"
  | "not-placed-on-pulse"
  | "placement-limit"
  | "duplicate-id"
  | "challenge-not-reproducible"
  | "challenge-score-unverified"
  | "live-evidence-untrusted"
  | "live-evidence-stale";

/**
 * Something left out, and why. `scope: "item"` means the whole record was
 * omitted; `"field"` means the item is shown without that part (a creator
 * without a challenge, a channel shown offline).
 */
export interface PartnerOmission {
  recordId: string;
  scope: "item" | "field";
  reason: OmissionReason;
  detail: string;
}
