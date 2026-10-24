/**
 * Academy Pulse — example partner records (PULSE-2C).
 *
 * HONESTY. Every record here is `provenance.source: "fixture"`:
 *   · The creators, channels and the sponsor are INVENTED. The video ids and
 *     the Twitch login are only well-formed: they were not looked up and are
 *     not claimed to exist. The adapter therefore strips them (samples connect
 *     to nothing) and the shell labels the items "Sample".
 *   · The sponsor destination is example.com, the domain reserved for documentation.
 *   · The challenge names the real Daily Challenge source, to show that a real
 *     source that is not reproducible is omitted, not faked.
 * These records exist for tests and the development lab; they are not wired
 * into any provider.
 */
import type { CreatorRecord, SponsorCampaignRecord, TwitchLiveEvidence } from "./partner-contract";

const FIXTURE = { source: "fixture", recordedBy: "fixture", recordedAt: "2026-10-24T00:00:00Z" } as const;
const APPROVAL = { approvedBy: "fixture", approvedAt: "2026-10-24T00:00:00Z" };

export const EXAMPLE_CREATORS: readonly CreatorRecord[] = [
  {
    id: "example-video",
    creatorName: "Sample Creator",
    creatorTag: "Sample creator",
    media: { platform: "youtube", url: "https://www.youtube.com/watch?v=AAAAAAAAAAA", title: "A sample guide video", durationSeconds: 754 },
    status: "approved",
    approval: APPROVAL,
    provenance: { ...FIXTURE, note: "Invented creator; the video id is syntactic only." },
  },
  {
    id: "example-short",
    creatorName: "Sample Shorts",
    creatorTag: "Sample creator",
    media: { platform: "youtube", url: "https://youtube.com/shorts/BBBBBBBBBBB", title: "A sample 30-second tip" },
    status: "approved",
    approval: APPROVAL,
    provenance: { ...FIXTURE, note: "Invented creator; the Short id is syntactic only." },
  },
  {
    id: "example-stream",
    creatorName: "Sample Streamer",
    creatorTag: "Sample streamer",
    media: { platform: "twitch", channelUrl: "https://www.twitch.tv/sample_streamer", title: "Sample Academy study streams", artChampion: "Viktor" },
    challenge: {
      title: "Beat their Daily",
      detail: "Play the Daily the streamer played and compare scores.",
      ref: { source: "daily-challenge", key: "2026-10-24" },
      score: { source: "daily-challenge", attemptId: "sample-attempt", value: 9210, verifiedAt: "2026-10-24T00:00:00Z" },
    },
    status: "approved",
    approval: APPROVAL,
    provenance: { ...FIXTURE, note: "Invented channel. The Daily is not reproducible, so the challenge is omitted." },
  },
  {
    id: "example-draft",
    creatorName: "Draft Creator",
    creatorTag: "Sample creator",
    media: { platform: "youtube", url: "https://youtu.be/CCCCCCCCCCC", title: "Not yet approved" },
    status: "draft",
    approval: null,
    provenance: { ...FIXTURE, note: "Shows that a draft is omitted." },
  },
];

/**
 * Live evidence as a future server-side reader would deliver it. It is
 * `twitch-helix-streams` but the default adapter trusts no source, so it is
 * ignored unless a test opts in.
 */
export const EXAMPLE_LIVE_EVIDENCE: readonly TwitchLiveEvidence[] = [
  { login: "sample_streamer", state: "live", source: "twitch-helix-streams", observedAt: "2026-10-24T12:00:00Z", viewerCount: 1234 },
];

export const EXAMPLE_SPONSORS: readonly SponsorCampaignRecord[] = [
  {
    id: "example-campaign",
    sponsorName: "Sample Brand",
    campaignTitle: "A sample campaign",
    tagline: "How an approved, in-flight campaign looks on Pulse.",
    ctaLabel: "Learn more",
    artwork: { url: "/mogsy-logo.png", alt: "Sample campaign artwork" },
    destinationUrl: "https://example.com/campaign",
    approvedHosts: ["example.com"],
    disclosure: { label: "Sponsored", advertiser: "Sample Brand" },
    window: { startsAt: "2026-10-24T00:00:00Z", endsAt: "2026-11-07T00:00:00Z" },
    placement: { surfaces: ["academy-pulse"] },
    status: "approved",
    approval: APPROVAL,
    provenance: { ...FIXTURE, note: "Invented sponsor; example.com is reserved for documentation." },
  },
  {
    id: "example-paused",
    sponsorName: "Paused Brand",
    campaignTitle: "A paused campaign",
    tagline: "Paused campaigns are omitted.",
    ctaLabel: "Learn more",
    artwork: { url: "/mogsy-logo.png", alt: "Sample campaign artwork" },
    destinationUrl: "https://example.com/paused",
    approvedHosts: ["example.com"],
    disclosure: { label: "Sponsored", advertiser: "Paused Brand" },
    window: { startsAt: "2026-10-24T00:00:00Z", endsAt: "2026-11-07T00:00:00Z" },
    placement: { surfaces: ["academy-pulse"] },
    status: "paused",
    approval: APPROVAL,
    provenance: { ...FIXTURE, note: "Shows that an inactive campaign is omitted." },
  },
];
