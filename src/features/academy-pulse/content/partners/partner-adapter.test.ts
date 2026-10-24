import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { buildPulseCycle, DEFAULT_PULSE_CADENCE, isRenderable } from "../../model/pulse-cadence";
import { embedUrl, platformUrl } from "../../model/pulse-embed";
import type { PulseCatalogue } from "../../model/pulse-types";
import { CHALLENGE_SOURCES, type ChallengeSource, validateCreatorChallenge } from "./creator-challenge";
import { validateCreator } from "./creator";
import { PARTNER_CAPABILITIES, PARTNER_CONTENT_ENABLED, adaptPartnerContent, partnerCatalogue } from "./partner-adapter";
import type { CreatorRecord, SponsorCampaignRecord } from "./partner-contract";
import { EXAMPLE_CREATORS, EXAMPLE_LIVE_EVIDENCE, EXAMPLE_SPONSORS } from "./partner-examples";
import { validateSponsorCampaign } from "./sponsor";

const NOW = Date.parse("2026-10-24T12:00:30Z");
const OWNER = { source: "owner-entry" as const, recordedBy: "owner-uuid", recordedAt: "2026-10-24T00:00:00Z" };
const APPROVAL = { approvedBy: "owner-uuid", approvedAt: "2026-10-24T00:00:00Z" };
const ID = "dQw4w9WgXcQ";

const video = (over: Partial<CreatorRecord> = {}): CreatorRecord => ({
  id: "c1",
  creatorName: "Real Creator",
  creatorTag: "Creator",
  media: { platform: "youtube", url: `https://www.youtube.com/watch?v=${ID}`, title: "A real guide", durationSeconds: 600 },
  status: "approved",
  approval: APPROVAL,
  provenance: OWNER,
  ...over,
});

const channel = (over: Partial<CreatorRecord> = {}): CreatorRecord => ({
  ...video(),
  id: "c2",
  media: { platform: "twitch", channelUrl: "https://www.twitch.tv/real_streamer", title: "Study streams" },
  ...over,
});

const campaign = (over: Partial<SponsorCampaignRecord> = {}): SponsorCampaignRecord => ({
  id: "s1",
  sponsorName: "Brand",
  campaignTitle: "Campaign",
  tagline: "A tagline.",
  ctaLabel: "Learn more",
  artwork: { url: "/mogsy-logo.png", alt: "Brand artwork" },
  destinationUrl: "https://brand.example/landing",
  approvedHosts: ["brand.example"],
  disclosure: { label: "Sponsored", advertiser: "Brand" },
  window: { startsAt: "2026-10-24T00:00:00Z", endsAt: "2026-10-31T00:00:00Z" },
  placement: { surfaces: ["academy-pulse"] },
  status: "approved",
  approval: APPROVAL,
  provenance: OWNER,
  ...over,
});

describe("creator spotlights", () => {
  it("an approved owner video becomes a live CreatorItem the PULSE-1 viewer can play", () => {
    const d = validateCreator(video(), { now: NOW });
    expect(d.ok).toBe(true);
    if (d.ok === false) return;
    expect(d.item).toMatchObject({
      id: "partner-creator-c1",
      kind: "creator",
      category: "creator-spotlight",
      provenance: "live",
      media: { platform: "youtube", videoId: ID, durationLabel: "10:00", thumbnailUrl: `https://i.ytimg.com/vi/${ID}/hqdefault.jpg` },
      challenge: null,
    });
    expect(isRenderable(d.item)).toBe(true);
    expect(embedUrl(d.item.media, "mogzy.lol")).toContain(`youtube-nocookie.com/embed/${ID}`);
    expect(platformUrl(d.item.media)).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });

  it("a Twitch channel is shown without LIVE unless trusted fresh evidence says so", () => {
    const evidence = [{ login: "real_streamer", state: "live" as const, source: "twitch-helix-streams" as const, observedAt: "2026-10-24T12:00:00Z", viewerCount: 50 }];
    const plain = validateCreator(channel(), { now: NOW, liveEvidence: evidence });
    expect(plain.ok === true && plain.item.media).toMatchObject({ platform: "twitch", channel: "real_streamer", live: false, viewersLabel: "" });
    expect(plain.ok === true && plain.notes.map((n) => n.reason)).toEqual(["live-evidence-untrusted"]);

    const trusted = validateCreator(channel(), { now: NOW, liveEvidence: evidence, trustedLiveSources: new Set(["twitch-helix-streams"]) });
    expect(trusted.ok === true && trusted.item.media).toMatchObject({ live: true, viewersLabel: "50 watching" });
    expect(trusted.ok === true && trusted.validUntil).toBe(Date.parse("2026-10-24T12:01:30Z"));
    expect(trusted.ok === true && embedUrl(trusted.item.media, "mogzy.lol")).toContain("channel=real_streamer&parent=mogzy.lol");
  });

  it.each<[string, Partial<CreatorRecord>, string]>([
    ["draft", { status: "draft", approval: null }, "not-approved"],
    ["paused", { status: "paused" }, "not-approved"],
    ["approved later than now", { approval: { approvedBy: "o", approvedAt: "2026-10-25T00:00:00Z" } }, "not-approved"],
    ["not started", { activeFrom: "2026-10-25T00:00:00Z" }, "outside-window"],
    ["ended", { activeUntil: "2026-10-24T12:00:00Z" }, "outside-window"],
    ["inverted window", { activeFrom: "2026-10-25T00:00:00Z", activeUntil: "2026-10-24T00:00:00Z" }, "invalid-window"],
    ["empty name", { creatorName: "  " }, "invalid-text"],
    ["playlist URL", { media: { platform: "youtube", url: "https://www.youtube.com/playlist?list=PL1", title: "x" } }, "invalid-media-url"],
    ["foreign thumbnail", { media: { platform: "youtube", url: `https://youtu.be/${ID}`, title: "x", thumbnailUrl: "https://evil.net/t.jpg" } }, "invalid-thumbnail"],
    ["bad channel", { media: { platform: "twitch", channelUrl: "https://www.twitch.tv/directory", title: "x" } }, "invalid-media-url"],
  ])("omits a creator that is %s", (_label, over, reason) => {
    const d = validateCreator(video(over), { now: NOW });
    expect(d.ok).toBe(false);
    if (d.ok === false) expect(d.omission).toMatchObject({ recordId: "c1", scope: "item", reason });
  });
});

describe("creator challenges", () => {
  const challenge = {
    title: "Beat their run",
    detail: "Play the same set and compare.",
    ref: { source: "daily-challenge" as const, key: "2026-10-24" },
    score: { source: "daily-challenge" as const, attemptId: "att-1", value: 9000, verifiedAt: "2026-10-24T10:00:00Z" },
  };

  it("no source is verified today, so every challenge is omitted and the creator stays", () => {
    for (const [id, src] of Object.entries(CHALLENGE_SOURCES)) {
      expect(src.reproducible && src.scoreAuthority, id).toBe(false);
    }
    const d = validateCreator(video({ challenge }), { now: NOW });
    expect(d.ok === true && d.item.challenge).toBeNull();
    expect(d.ok === true && d.notes).toEqual([expect.objectContaining({ scope: "field", reason: "challenge-not-reproducible" })]);
  });

  it("a verified source still needs a score attempt on that same source", () => {
    const verified: Record<string, ChallengeSource> = {
      "daily-challenge": { reproducible: true, scoreAuthority: true, evidence: "test", key: /^\d{4}-\d{2}-\d{2}$/, href: (k) => `/quiz/daily-challenge?set=${k}` },
    };
    expect(validateCreatorChallenge(challenge, verified)).toEqual({ ok: true, challenge: { title: "Beat their run", detail: "Play the same set and compare.", href: "/quiz/daily-challenge?set=2026-10-24" } });
    expect(validateCreatorChallenge({ ...challenge, score: { ...challenge.score, source: "more-challenges" } }, verified)).toMatchObject({ ok: false, reason: "challenge-score-unverified" });
    expect(validateCreatorChallenge({ ...challenge, score: { ...challenge.score, attemptId: " " } }, verified)).toMatchObject({ ok: false, reason: "challenge-score-unverified" });
    expect(validateCreatorChallenge({ ...challenge, ref: { ...challenge.ref, key: "../x" } }, verified)).toMatchObject({ ok: false, reason: "challenge-not-reproducible" });
    expect(validateCreatorChallenge(challenge, { "daily-challenge": { ...verified["daily-challenge"], scoreAuthority: false } })).toMatchObject({ ok: false, reason: "challenge-score-unverified" });
  });
});

describe("sponsor campaigns", () => {
  it("an approved in-flight campaign becomes a disclosed SponsorItem on its approved host", () => {
    const d = validateSponsorCampaign(campaign(), { now: NOW });
    expect(d.ok).toBe(true);
    if (d.ok === false) return;
    expect(d.item).toMatchObject({ id: "partner-sponsor-s1", provenance: "live", sponsorName: "Brand", artUrl: "/mogsy-logo.png", href: "https://brand.example/landing" });
    expect(d.validUntil).toBe(Date.parse("2026-10-31T00:00:00Z"));
    expect(isRenderable(d.item)).toBe(true);
  });

  it.each<[string, Partial<SponsorCampaignRecord>, string]>([
    ["a draft", { status: "draft", approval: null }, "not-approved"],
    ["pending review", { status: "pending-review" }, "not-approved"],
    ["paused", { status: "paused" }, "not-approved"],
    ["ended", { status: "ended" }, "not-approved"],
    ["rejected", { status: "rejected" }, "not-approved"],
    ["approved with no approval record", { approval: null }, "not-approved"],
    ["not yet started", { window: { startsAt: "2026-10-25T00:00:00Z", endsAt: "2026-10-31T00:00:00Z" } }, "outside-window"],
    ["over (end is exclusive)", { window: { startsAt: "2026-10-20T00:00:00Z", endsAt: "2026-10-24T12:00:30Z" } }, "outside-window"],
    ["an inverted window", { window: { startsAt: "2026-10-31T00:00:00Z", endsAt: "2026-10-24T00:00:00Z" } }, "invalid-window"],
    ["a flight longer than 92 days", { window: { startsAt: "2026-10-01T00:00:00Z", endsAt: "2027-02-01T00:00:00Z" } }, "invalid-window"],
    ["a window without offsets", { window: { startsAt: "2026-10-24T00:00:00", endsAt: "2026-10-31T00:00:00" } }, "invalid-window"],
    ["not placed on Pulse", { placement: { surfaces: [] } }, "not-placed-on-pulse"],
    ["a destination off its approved hosts", { destinationUrl: "https://other.example/x" }, "invalid-destination"],
    ["a lookalike subdomain", { destinationUrl: "https://brand.example.evil.net/x" }, "invalid-destination"],
    ["http", { destinationUrl: "http://brand.example/landing" }, "invalid-destination"],
    ["no approved hosts", { approvedHosts: [] }, "invalid-destination"],
    ["a javascript: link", { destinationUrl: "javascript:alert(1)" }, "invalid-destination"],
    ["a different disclosure label", { disclosure: { label: "Partner" as "Sponsored", advertiser: "Brand" } }, "invalid-disclosure"],
    ["a disclosure naming someone else", { disclosure: { label: "Sponsored", advertiser: "Other" } }, "invalid-disclosure"],
    ["artwork from a foreign host", { artwork: { url: "https://cdn.evil.net/a.png", alt: "x" } }, "invalid-artwork"],
    ["artwork without alt text", { artwork: { url: "/mogsy-logo.png", alt: " " } }, "invalid-artwork"],
    ["a too-long CTA", { ctaLabel: "x".repeat(30) }, "invalid-text"],
  ])("omits a campaign that is %s", (_label, over, reason) => {
    const d = validateSponsorCampaign(campaign(over), { now: NOW });
    expect(d.ok).toBe(false);
    if (d.ok === false) expect(d.omission).toMatchObject({ recordId: "s1", scope: "item", reason });
  });

  it("lets one campaign run at a time, earliest approval first", () => {
    const later = campaign({ id: "s2", approval: { approvedBy: "o", approvedAt: "2026-10-24T06:00:00Z" } });
    const r = adaptPartnerContent({ sponsors: [later, campaign()] }, { now: NOW });
    expect(r.sponsors.map((s) => s.id)).toEqual(["partner-sponsor-s1"]);
    expect(r.omitted).toEqual([expect.objectContaining({ recordId: "s2", reason: "placement-limit" })]);
  });
});

describe("the partner adapter", () => {
  it("is disabled and imported by nothing outside its folder", () => {
    expect(PARTNER_CONTENT_ENABLED).toBe(false);
    const root = path.resolve(__dirname, "../..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== "partners") walk(p);
        } else if (/\.(ts|tsx)$/.test(name) && /content\/partners|\.\/partners/.test(readFileSync(p, "utf8"))) {
          offenders.push(p);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });

  it("states a capability for every integration, with LIVE and challenges off", () => {
    expect(PARTNER_CAPABILITIES["twitch.live"].status).toBe("disabled");
    expect(PARTNER_CAPABILITIES["twitch.viewers"].status).toBe("disabled");
    expect(PARTNER_CAPABILITIES["creator.challenge"].status).toBe("absent");
  });

  it("adapts the examples honestly: samples connect to nothing and inactive records drop out", () => {
    const r = adaptPartnerContent({ creators: EXAMPLE_CREATORS, sponsors: EXAMPLE_SPONSORS }, { now: NOW, liveEvidence: EXAMPLE_LIVE_EVIDENCE });
    expect(r.creators.map((c) => c.id)).toEqual(["partner-creator-example-video", "partner-creator-example-short", "partner-creator-example-stream"]);
    expect(r.sponsors.map((s) => s.id)).toEqual(["partner-sponsor-example-campaign"]);
    for (const item of [...r.creators, ...r.sponsors]) {
      expect(item.provenance).toBe("fixture");
      expect(isRenderable(item)).toBe(true);
      expect(JSON.stringify(item)).not.toMatch(/https?:/);
    }
    for (const c of r.creators) {
      expect(embedUrl(c.media, "mogzy.lol")).toBeNull();
      expect(platformUrl(c.media)).toBeNull();
      if (c.media.platform === "twitch") expect(c.media.live).toBe(false);
    }
    expect(r.creators[1].media).toMatchObject({ durationLabel: "Short" });
    expect(r.sponsors[0].href).toBeNull();
    expect(r.omitted.map((o) => [o.recordId, o.reason])).toEqual([
      ["example-stream", "live-evidence-untrusted"],
      ["example-stream", "challenge-not-reproducible"],
      ["example-draft", "not-approved"],
      ["example-paused", "not-approved"],
    ]);
    expect(r.validUntil).toBe(Date.parse("2026-11-07T00:00:00Z"));
  });

  it("feeds the existing cadence unchanged", () => {
    const r = adaptPartnerContent({ creators: [video()], sponsors: [campaign()] }, { now: NOW });
    const cat: PulseCatalogue = partnerCatalogue(r);
    expect(Object.keys(cat).sort()).toEqual(["creator-spotlight", "sponsor"]);
    const cycle = buildPulseCycle(cat, DEFAULT_PULSE_CADENCE, 0);
    expect(cycle.map((i) => i.id)).toEqual(["partner-sponsor-s1", "partner-creator-c1"]);
  });

  it("returns empty categories for nothing valid, so the cadence skips them", () => {
    const r = adaptPartnerContent({ creators: [video({ status: "draft" })], sponsors: [campaign({ status: "paused" })] }, { now: NOW });
    expect(partnerCatalogue(r)).toEqual({});
    expect(r.validUntil).toBeNull();
  });

  it("drops duplicate ids", () => {
    const r = adaptPartnerContent({ creators: [video(), video()] }, { now: NOW });
    expect(r.creators).toHaveLength(1);
    expect(r.omitted).toEqual([expect.objectContaining({ reason: "duplicate-id" })]);
  });
});
