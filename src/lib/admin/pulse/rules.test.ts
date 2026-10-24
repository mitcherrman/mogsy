import { describe, expect, it } from "vitest";

import { buildPulseCycle, promotionPositions } from "@/features/academy-pulse/model/pulse-cadence";

import type { PulseContentRecord, PulseItemInput } from "./contract";
import { allowedTransitions, canTransition, effectiveStatus } from "./lifecycle";
import { effectiveCadence, projectPublicPulse } from "./projection";
import { PROTOTYPE_CAMPAIGN_ID, prototypeSeed } from "./prototypeSeed";
import { isHttpsUrl, isInternalPath, validateCampaign, validateItemForPublish, validateItemForSave, validateSchedule } from "./validation";

const NOW = new Date("2026-10-24T12:00:00Z");
const iso = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();
const seed = () => prototypeSeed(NOW);
const byId = (s: ReturnType<typeof seed>, id: string) => s.items.find((i) => i.id === id)!;

describe("lifecycle", () => {
  const base = { state: "published" as const, publishAt: null, expiresAt: null };
  it("splits published by the clock", () => {
    expect(effectiveStatus(base, NOW)).toBe("live");
    expect(effectiveStatus({ ...base, publishAt: iso(1) }, NOW)).toBe("scheduled");
    expect(effectiveStatus({ ...base, expiresAt: iso(-1) }, NOW)).toBe("expired");
    expect(effectiveStatus({ ...base, expiresAt: NOW.toISOString() }, NOW)).toBe("expired");
    expect(effectiveStatus({ ...base, state: "draft" }, NOW)).toBe("draft");
  });
  it("never archives live content directly", () => {
    expect(canTransition("published", "archive")).toBe(false);
    expect(canTransition("unpublished", "archive")).toBe(true);
    expect(allowedTransitions("archived")).toEqual(["revert-to-draft"]);
  });
});

describe("validation", () => {
  it("keeps editorial links on Mogzy and partner links on https", () => {
    expect(isInternalPath("/quiz")).toBe(true);
    expect(isInternalPath("//evil.example")).toBe(false);
    expect(isInternalPath("javascript:alert(1)")).toBe(false);
    expect(isInternalPath("/a\\b")).toBe(false);
    expect(isHttpsUrl("https://example.com/x")).toBe(true);
    expect(isHttpsUrl("http://example.com")).toBe(false);
    expect(isHttpsUrl("https://user:pw@example.com")).toBe(false);
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false);
  });

  it("refuses off-site editorial links and hand-claimed Twitch LIVE", () => {
    const s = seed();
    const news = byId(s, "pc-news-hover");
    const bad: PulseItemInput = { ...news, payload: { ...news.payload, kind: "news", href: "https://evil.example" } as PulseContentRecord["payload"] };
    expect(validateItemForSave(bad).map((i) => i.field)).toContain("href");

    const creator: PulseItemInput = {
      ...news,
      campaignId: "c1",
      payload: {
        id: "x", kind: "creator", category: "creator-spotlight", provenance: "live", title: "t",
        creatorName: "C", creatorTag: "t", challenge: null,
        media: { platform: "twitch", channel: "realchan", title: "Stream", live: true, viewersLabel: "", thumbnailUrl: null },
      },
    };
    expect(validateItemForSave(creator).map((i) => i.field)).toContain("live");
  });

  it("refuses provider-only kinds and mis-filed categories", () => {
    const s = seed();
    const q = byId(s, "pc-question-fox");
    expect(validateItemForSave({ ...q, payload: { ...q.payload, category: "news" } as PulseContentRecord["payload"] })
      .map((i) => i.field)).toContain("category");
    expect(validateItemForSave({ ...q, payload: { ...q.payload, kind: "leaderboard" } as unknown as PulseContentRecord["payload"] })
      .map((i) => i.field)).toEqual(["kind"]);
  });

  it("sponsor content needs an approved campaign to publish", () => {
    const s = seed();
    const sp = byId(s, "pc-sponsor-placeholder");
    const campaign = s.campaigns[0];
    expect(validateItemForSave(sp)).toEqual([]);
    expect(validateItemForPublish(sp, campaign, NOW).some((i) => i.message.includes("pending"))).toBe(true);
    expect(validateItemForPublish(sp, { ...campaign, approval: "approved" }, NOW)).toEqual([]);
    expect(validateItemForSave({ ...sp, campaignId: null }).map((i) => i.field)).toContain("campaignId");
  });

  it("campaign disclosure rules", () => {
    const c = { ...seed().campaigns[0], id: null };
    expect(validateCampaign(c)).toEqual([]);
    expect(validateCampaign({ ...c, disclosure: "unpaid-spotlight" }).map((i) => i.field)).toContain("disclosure");
    expect(validateCampaign({ ...c, disclosureText: " " }).map((i) => i.field)).toContain("disclosureText");
    expect(validateCampaign({ ...c, type: "creator", disclosure: "unpaid-spotlight", disclosureText: "" })).toEqual([]);
  });

  it("cadence bounds", () => {
    expect(validateSchedule({ slots: ["news"], maxPromotionsPerCycle: 2, minPromotionGap: 3 })).toEqual([]);
    expect(validateSchedule({ slots: [], maxPromotionsPerCycle: 9, minPromotionGap: 0 }).map((i) => i.field))
      .toEqual(["slots", "maxPromotionsPerCycle", "minPromotionGap"]);
  });
});

describe("public projection", () => {
  it("the prototype seed projects to the shipped editorial set only", () => {
    const p = projectPublicPulse(seed(), NOW);
    const ids = Object.values(p.catalogue).flat().map((i) => i!.id).sort();
    expect(ids).toEqual(["pc-minigame-dial", "pc-news-hover", "pc-news-patch-deck", "pc-question-fox"]);
    expect(Object.values(p.catalogue).flat().every((i) => i!.provenance === "live")).toBe(true);
    expect(p.excluded).toEqual(expect.arrayContaining([
      { id: "pc-draft-announcement", reason: "not-live" },
      { id: "pc-sponsor-placeholder", reason: "not-live" },
    ]));
  });

  it("featured leads its category, then priority", () => {
    const p = projectPublicPulse(seed(), NOW);
    expect(p.catalogue.news!.map((i) => i.id)).toEqual(["pc-news-patch-deck", "pc-news-hover"]);
  });

  it("schedule and expiry are evaluated on the given clock", () => {
    const s = seed();
    byId(s, "pc-news-hover").publishAt = iso(2);
    byId(s, "pc-question-fox").expiresAt = iso(-1);
    const p = projectPublicPulse(s, NOW);
    expect(p.catalogue.news!.map((i) => i.id)).toEqual(["pc-news-patch-deck"]);
    expect(p.catalogue.educational).toBeUndefined();
    expect(projectPublicPulse(s, new Date(NOW.getTime() + 3 * 3_600_000)).catalogue.news).toHaveLength(2);
  });

  it("disabled or expired categories drop their items and their cadence slots", () => {
    const s = seed();
    s.categories.find((c) => c.category === "news")!.enabled = false;
    s.categories.find((c) => c.category === "educational")!.expiresAt = iso(-1);
    const p = projectPublicPulse(s, NOW);
    expect(p.catalogue.news).toBeUndefined();
    expect(p.catalogue.educational).toBeUndefined();
    expect(p.cadence.slots).not.toContain("news");
    expect(p.cadence.slots).not.toContain("educational");
  });

  it("frequency caps trim repeated cadence slots", () => {
    const s = seed();
    s.categories.find((c) => c.category === "player-activity")!.enabled = true;
    s.categories.find((c) => c.category === "player-activity")!.maxPerCycle = 1;
    const c = effectiveCadence(s.schedule, s.categories, NOW);
    expect(c.slots.filter((x) => x === "player-activity")).toHaveLength(1);
  });

  it("emergency disable: partners drops sponsor/creator only, managed drops everything and asks for the static fallback", () => {
    const s = seed();
    const sp = byId(s, "pc-sponsor-placeholder");
    sp.state = "published";
    s.campaigns[0].approval = "approved";
    expect(projectPublicPulse(s, NOW).catalogue.sponsor?.map((i) => i.id)).toEqual(["pc-sponsor-placeholder"]);

    s.schedule.kill = { active: true, scope: "partners", reason: "incident", changedAt: null };
    let p = projectPublicPulse(s, NOW);
    expect(p.catalogue.sponsor).toBeUndefined();
    expect(p.catalogue.news).toHaveLength(2);
    expect(p.fallbackToStatic).toBe(false);

    s.schedule.kill = { active: true, scope: "managed", reason: "incident", changedAt: null };
    p = projectPublicPulse(s, NOW);
    expect(Object.keys(p.catalogue)).toEqual([]);
    expect(p.fallbackToStatic).toBe(true);
  });

  it("campaign outside its flight is held back", () => {
    const s = seed();
    byId(s, "pc-sponsor-placeholder").state = "published";
    Object.assign(s.campaigns[0], { approval: "approved", flightStart: iso(5) });
    expect(projectPublicPulse(s, NOW).excluded).toContainEqual({ id: "pc-sponsor-placeholder", reason: "campaign-outside-flight" });
    expect(s.campaigns[0].id).toBe(PROTOTYPE_CAMPAIGN_ID);
  });

  it("preview ids are included but labelled as samples", () => {
    const p = projectPublicPulse(seed(), NOW, { previewIds: new Set(["pc-draft-announcement"]) });
    const draft = p.catalogue.news!.find((i) => i.id === "pc-draft-announcement");
    expect(draft?.provenance).toBe("fixture");
  });

  it("output feeds the shared scheduler unchanged: promotion caps and gaps hold", () => {
    const s = seed();
    byId(s, "pc-sponsor-placeholder").state = "published";
    s.campaigns[0].approval = "approved";
    s.schedule.maxPromotionsPerCycle = 1;
    const p = projectPublicPulse(s, NOW);
    for (let c = 0; c < 4; c++) {
      const cycle = buildPulseCycle(p.catalogue, p.cadence, c);
      expect(cycle.length).toBeGreaterThan(0);
      expect(promotionPositions(cycle).length).toBeLessThanOrEqual(1);
    }
  });
});
