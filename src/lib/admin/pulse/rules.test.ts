import { describe, expect, it } from "vitest";

import { buildPulseCycle, promotionPositions } from "@/features/academy-pulse/model/pulse-cadence";

import type { PulseContentRecord, PulseItemInput, PulsePartnerRecord } from "./contract";
import { allowedTransitions, canTransition, effectiveStatus } from "./lifecycle";
import { gateIssue, httpsOnHosts, imageSrc, parseInstant, partnerPreviewItem, toPartnerInput, twitchLogin, validatePartnerForApproval, validatePartnerSave, youtubeId } from "./partnerRules";
import { hostAllowlistLevel, isPaidPromotion, killLevel, partnerSaveLevel, partnerTransitionLevel } from "./policy";
import { effectiveCadence, projectPublicPulse } from "./projection";
import { PROTOTYPE_SPONSOR_ID, prototypeSeed } from "./prototypeSeed";
import { isInternalPath, validateItemForPublish, validateItemForSave, validateSchedule } from "./validation";

const NOW = new Date("2026-10-24T12:00:00Z");
const iso = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();
const seed = () => prototypeSeed(NOW);
const byId = (s: ReturnType<typeof seed>, id: string) => s.items.find((i) => i.id === id)!;
const sponsor = (s: ReturnType<typeof seed>) => s.partners.find((p) => p.record.id === PROTOTYPE_SPONSOR_ID)! as Extract<PulsePartnerRecord, { type: "sponsor" }>;

function approve(p: PulsePartnerRecord) {
  p.record = { ...p.record, status: "approved", approval: { approvedBy: "owner", approvedAt: iso(-1) } } as typeof p.record;
}

describe("lifecycle", () => {
  const base = { state: "published" as const, publishAt: null, expiresAt: null };
  it("splits published by the clock", () => {
    expect(effectiveStatus(base, NOW)).toBe("live");
    expect(effectiveStatus({ ...base, publishAt: iso(1) }, NOW)).toBe("scheduled");
    expect(effectiveStatus({ ...base, expiresAt: iso(-1) }, NOW)).toBe("expired");
    expect(effectiveStatus({ ...base, state: "draft" }, NOW)).toBe("draft");
  });
  it("never archives live content directly", () => {
    expect(canTransition("published", "archive")).toBe(false);
    expect(canTransition("unpublished", "archive")).toBe(true);
    expect(allowedTransitions("archived")).toEqual(["revert-to-draft"]);
  });
});

describe("assurance policy (provisional, PR #155 command center)", () => {
  const sp = { type: "sponsor" as const, compensation: null };
  const unpaid = { type: "creator" as const, compensation: "unpaid" as const };
  const paid = { type: "creator" as const, compensation: "paid" as const };
  it("emergency disable trusted; restore and narrowing FRESH; widening trusted", () => {
    expect(killLevel({ active: false, scope: "partners" }, { active: true, scope: "managed", reason: "x" })).toBe("trusted");
    expect(killLevel({ active: true, scope: "partners" }, { active: true, scope: "managed", reason: "x" })).toBe("trusted");
    expect(killLevel({ active: true, scope: "managed" }, { active: true, scope: "partners", reason: "x" })).toBe("fresh");
    expect(killLevel({ active: true, scope: "partners" }, { active: false, scope: "partners", reason: "" })).toBe("fresh");
    expect(killLevel({ active: false, scope: "partners" }, { active: false, scope: "partners", reason: "" })).toBe("trusted");
  });
  it("paid promotion approval/resume FRESH; unpaid creator and every exposure-reducing action trusted", () => {
    expect(isPaidPromotion(sp)).toBe(true);
    expect(isPaidPromotion(unpaid)).toBe(false);
    for (const a of ["approve", "resume"] as const) {
      expect(partnerTransitionLevel(sp, a)).toBe("fresh");
      expect(partnerTransitionLevel(paid, a)).toBe("fresh");
      expect(partnerTransitionLevel(unpaid, a)).toBe("trusted");
    }
    for (const a of ["submit", "reject", "pause", "end", "revise"] as const) expect(partnerTransitionLevel(sp, a)).toBe("trusted");
  });
  it("editing approved/paused paid promotion FRESH; drafts and unpaid creators trusted", () => {
    const rec = (status: string, p = sp) => ({ ...p, record: { status } as never });
    expect(partnerSaveLevel(null, sp)).toBe("trusted");
    expect(partnerSaveLevel(rec("draft"), sp)).toBe("trusted");
    expect(partnerSaveLevel(rec("approved"), sp)).toBe("fresh");
    expect(partnerSaveLevel(rec("paused"), sp)).toBe("fresh");
    expect(partnerSaveLevel(rec("approved", unpaid), unpaid)).toBe("trusted");
    expect(partnerSaveLevel(rec("approved", unpaid), paid)).toBe("fresh");
  });
  it("adding a sponsor host FRESH, removing trusted", () => {
    expect(hostAllowlistLevel("add")).toBe("fresh");
    expect(hostAllowlistLevel("remove")).toBe("trusted");
  });
});

describe("editorial validation", () => {
  it("keeps editorial links on Mogzy", () => {
    expect(isInternalPath("/quiz")).toBe(true);
    expect(isInternalPath("//evil.example")).toBe(false);
    expect(isInternalPath("javascript:alert(1)")).toBe(false);
    const news = byId(seed(), "pc-news-hover");
    const bad: PulseItemInput = { ...news, payload: { ...news.payload, kind: "news", href: "https://evil.example" } as PulseContentRecord["payload"] };
    expect(validateItemForSave(bad).map((i) => i.field)).toContain("href");
  });
  it("sponsor and creator are not editorial kinds", () => {
    const q = byId(seed(), "pc-question-fox");
    expect(validateItemForSave({ ...q, payload: { ...q.payload, kind: "sponsor" } as unknown as PulseContentRecord["payload"] }).map((i) => i.field)).toEqual(["kind"]);
  });
  it("publish needs a drawable scene", () => {
    const d = byId(seed(), "pc-draft-announcement");
    expect(validateItemForPublish({ ...d, payload: { ...d.payload, headline: "" } as PulseContentRecord["payload"] }, NOW).length).toBeGreaterThan(0);
  });
  it("cadence bounds", () => {
    expect(validateSchedule({ slots: ["news"], maxPromotionsPerCycle: 2, minPromotionGap: 3 })).toEqual([]);
    expect(validateSchedule({ slots: [], maxPromotionsPerCycle: 9, minPromotionGap: 0 }).map((i) => i.field)).toEqual(["slots", "maxPromotionsPerCycle", "minPromotionGap"]);
  });
});

describe("partner rules (PULSE-2C checks + workspace allowlist)", () => {
  it("URL, image, instant and media parsing match 2C's rules", () => {
    expect(httpsOnHosts("https://example.com/x", ["example.com"])?.hostname).toBe("example.com");
    for (const bad of ["http://example.com/x", "https://evil-example.com/x", "https://example.com.evil.net/x", "https://u:p@example.com/x", "https://example.com:8443/x", "https://1.2.3.4/x", " https://example.com"]) {
      expect(httpsOnHosts(bad, ["example.com"]), bad).toBeNull();
    }
    expect(imageSrc("/placeholder.svg")).toBe("/placeholder.svg");
    expect(imageSrc("//evil.example/a.png")).toBeNull();
    expect(imageSrc("/a/../b.png")).toBeNull();
    expect(imageSrc("https://i.ytimg.com/vi/x/hqdefault.jpg")).not.toBeNull();
    expect(imageSrc("https://evil.example/a.png")).toBeNull();
    expect(parseInstant("2026-10-24T12:00:00Z")).not.toBeNull();
    expect(parseInstant("2026-10-24T12:00:00")).toBeNull();
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(twitchLogin("https://www.twitch.tv/RealChan")).toBe("realchan");
    expect(twitchLogin("https://www.twitch.tv/realchan/videos")).toBeNull();
  });

  it("the placeholder sponsor saves, but approval needs its host on the allowlist", () => {
    const input = toPartnerInput(sponsor(seed()));
    expect(validatePartnerSave(input)).toEqual([]);
    expect(validatePartnerForApproval(input, [], NOW).map((i) => i.message).join()).toMatch(/not on the sponsor host allowlist/);
    expect(validatePartnerForApproval(input, ["example.com"], NOW)).toEqual([]);
  });

  it("disclosure must name the sponsor shown; flights cap at 92 days", () => {
    const input = toPartnerInput(sponsor(seed()));
    if (input.type !== "sponsor") throw new Error("seed");
    const named = { ...input, record: { ...input.record, disclosure: { label: "Sponsored" as const, advertiser: "Someone Else" } } };
    expect(validatePartnerForApproval(named, ["example.com"], NOW).map((i) => i.field)).toContain("disclosure");
    const long = { ...input, record: { ...input.record, window: { startsAt: iso(0), endsAt: iso(24 * 93) } } };
    expect(validatePartnerForApproval(long, ["example.com"], NOW).map((i) => i.field)).toContain("window");
  });

  it("release gates hold sponsors and paid creators; unpaid creators pass", () => {
    const closed = { sponsorDisclosureRendered: false, paidCreatorDisclosureRendered: false };
    expect(gateIssue({ type: "sponsor", compensation: null }, closed)).toMatch(/Sponsor disclosure/);
    expect(gateIssue({ type: "creator", compensation: "affiliate" }, closed)).toMatch(/Paid creator/);
    expect(gateIssue({ type: "creator", compensation: "unpaid" }, closed)).toBeNull();
  });

  it("preview scenes are always labelled Sample and link nowhere", () => {
    const item = partnerPreviewItem(toPartnerInput(sponsor(seed())));
    expect(item).toMatchObject({ kind: "sponsor", provenance: "fixture", href: null, sponsorName: "Placeholder Co" });
  });
});

describe("public projection", () => {
  it("the prototype seed projects to the shipped editorial set only", () => {
    const p = projectPublicPulse(seed(), NOW);
    const ids = Object.values(p.catalogue).flat().map((i) => i!.id).sort();
    expect(ids).toEqual(["pc-minigame-dial", "pc-news-hover", "pc-news-patch-deck", "pc-question-fox"]);
    expect(p.partners).toEqual({ creators: [], sponsors: [] });
    expect(p.excluded).toEqual(expect.arrayContaining([
      { id: "pc-draft-announcement", reason: "not-live" },
      { id: PROTOTYPE_SPONSOR_ID, reason: "partner-not-approved" },
    ]));
  });

  it("featured leads its category, then priority; schedule and expiry follow the clock", () => {
    const s = seed();
    expect(projectPublicPulse(s, NOW).catalogue.news!.map((i) => i.id)).toEqual(["pc-news-patch-deck", "pc-news-hover"]);
    byId(s, "pc-news-hover").publishAt = iso(2);
    byId(s, "pc-question-fox").expiresAt = iso(-1);
    const p = projectPublicPulse(s, NOW);
    expect(p.catalogue.news!.map((i) => i.id)).toEqual(["pc-news-patch-deck"]);
    expect(p.catalogue.educational).toBeUndefined();
  });

  it("disabled categories drop their items and cadence slots; frequency caps trim", () => {
    const s = seed();
    s.categories.find((c) => c.category === "news")!.enabled = false;
    const pa = s.categories.find((c) => c.category === "player-activity")!;
    pa.enabled = true;
    pa.maxPerCycle = 1;
    const p = projectPublicPulse(s, NOW);
    expect(p.catalogue.news).toBeUndefined();
    expect(p.cadence.slots).not.toContain("news");
    expect(effectiveCadence(s.schedule, s.categories, NOW).slots.filter((x) => x === "player-activity")).toHaveLength(1);
  });

  it("an approved sponsor needs the allowlist AND an open release gate to be emitted, in 2C's record shape", () => {
    const s = seed();
    approve(sponsor(s));
    expect(projectPublicPulse(s, NOW).excluded).toContainEqual({ id: PROTOTYPE_SPONSOR_ID, reason: "invalid" });
    s.sponsorHostAllowlist = ["example.com"];
    expect(projectPublicPulse(s, NOW).excluded).toContainEqual({ id: PROTOTYPE_SPONSOR_ID, reason: "release-gate" });
    s.gates.sponsorDisclosureRendered = true;
    const p = projectPublicPulse(s, NOW);
    expect(p.partners.sponsors.map((x) => x.id)).toEqual([PROTOTYPE_SPONSOR_ID]);
    expect(p.partners.sponsors[0].status).toBe("approved");
    expect(p.catalogue.sponsor?.[0]).toMatchObject({ provenance: "fixture" });
  });

  it("emergency disable: partners holds partner records only; managed drops everything and asks for the fallback", () => {
    const s = seed();
    approve(sponsor(s));
    s.sponsorHostAllowlist = ["example.com"];
    s.gates.sponsorDisclosureRendered = true;
    s.schedule.kill = { active: true, scope: "partners", reason: "incident", changedAt: null };
    let p = projectPublicPulse(s, NOW);
    expect(p.partners.sponsors).toEqual([]);
    expect(p.catalogue.news).toHaveLength(2);
    s.schedule.kill = { active: true, scope: "managed", reason: "incident", changedAt: null };
    p = projectPublicPulse(s, NOW);
    expect(Object.keys(p.catalogue)).toEqual([]);
    expect(p.fallbackToStatic).toBe(true);
  });

  it("a sponsor outside its flight is held back", () => {
    const s = seed();
    approve(sponsor(s));
    s.sponsorHostAllowlist = ["example.com"];
    s.gates.sponsorDisclosureRendered = true;
    sponsor(s).record.window.startsAt = iso(5);
    expect(projectPublicPulse(s, NOW).excluded).toContainEqual({ id: PROTOTYPE_SPONSOR_ID, reason: "partner-outside-window" });
  });

  it("preview ids are included but labelled as samples", () => {
    const p = projectPublicPulse(seed(), NOW, { previewIds: new Set(["pc-draft-announcement"]) });
    expect(p.catalogue.news!.find((i) => i.id === "pc-draft-announcement")?.provenance).toBe("fixture");
  });

  it("output feeds the shared scheduler unchanged: promotion caps and gaps hold", () => {
    const s = seed();
    approve(sponsor(s));
    s.sponsorHostAllowlist = ["example.com"];
    s.gates.sponsorDisclosureRendered = true;
    s.schedule.maxPromotionsPerCycle = 1;
    const p = projectPublicPulse(s, NOW);
    for (let c = 0; c < 4; c++) {
      const cycle = buildPulseCycle(p.catalogue, p.cadence, c);
      expect(cycle.length).toBeGreaterThan(0);
      expect(promotionPositions(cycle).length).toBeLessThanOrEqual(1);
    }
  });
});
