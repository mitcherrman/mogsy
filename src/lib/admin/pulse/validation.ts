// ---------------------------------------------------------------------------
// PULSE-2B — what may be saved, and what may go live.
//
// Two levels:
//   save     the record is well-formed (a draft may be incomplete, but never
//            unsafe: no script URLs, no hand-claimed Twitch LIVE, no
//            off-site links on editorial content).
//   publish  the scene can actually be drawn (the shared scheduler's own
//            `isRenderable`), sponsor/creator content has an approved,
//            disclosed campaign, and the schedule is coherent.
//
// The server repeats these checks (pulse_admin_* RPCs); this module exists so
// the owner sees the reason before pressing the button.
// ---------------------------------------------------------------------------

import { isRenderable } from "@/features/academy-pulse/model/pulse-cadence";
import { platformUrl } from "@/features/academy-pulse/model/pulse-embed";

import {
  AUTHORABLE_KINDS,
  CADENCE_LIMITS,
  CAMPAIGN_KINDS,
  KIND_CATEGORIES,
  type PulseCampaign,
  type PulseCampaignInput,
  type PulseItemInput,
  type PulseScheduleSettings,
} from "./contract";

export interface PulseIssue {
  field: string;
  message: string;
}

/** A same-site route: "/quiz", never "//evil.example" or "javascript:". */
export function isInternalPath(href: string): boolean {
  return /^\/(?!\/)[A-Za-z0-9\-._~/?#&=%+]*$/.test(href) && !href.includes("\\");
}

/** An absolute https URL with a host (partner destinations, artwork). */
export function isHttpsUrl(href: string): boolean {
  try {
    const u = new URL(href);
    return u.protocol === "https:" && u.hostname.includes(".") && u.username === "" && u.password === "";
  } catch {
    return false;
  }
}

const TEXT_LIMITS = { headline: 90, summary: 220, title: 140, label: 80, body: 1200 } as const;
const DWELL_MS = { min: 6000, max: 30000 } as const;

function tooLong(issues: PulseIssue[], field: string, value: string, max: number) {
  if (value.length > max) issues.push({ field, message: `Keep this under ${max} characters (now ${value.length}).` });
}

function validIso(v: string | null): boolean {
  return v === null || !Number.isNaN(Date.parse(v));
}

/** Well-formedness: blocks Save. */
export function validateItemForSave(input: PulseItemInput): PulseIssue[] {
  const issues: PulseIssue[] = [];
  const p = input.payload;
  if (!input.label.trim()) issues.push({ field: "label", message: "Give it a workspace name." });
  tooLong(issues, "label", input.label, TEXT_LIMITS.label);
  if (!(AUTHORABLE_KINDS as readonly string[]).includes(p.kind)) {
    issues.push({ field: "kind", message: "This kind is provider-generated and can't be written by hand." });
    return issues;
  }
  if (!KIND_CATEGORIES[p.kind].includes(p.category)) {
    issues.push({ field: "category", message: `A ${p.kind} scene can't be filed under ${p.category}.` });
  }
  if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 999) {
    issues.push({ field: "priority", message: "Priority is a whole number from 0 to 999." });
  }
  if (!validIso(input.publishAt)) issues.push({ field: "publishAt", message: "Not a valid date." });
  if (!validIso(input.expiresAt)) issues.push({ field: "expiresAt", message: "Not a valid date." });
  if (input.publishAt && input.expiresAt && Date.parse(input.expiresAt) <= Date.parse(input.publishAt)) {
    issues.push({ field: "expiresAt", message: "Expiry must be after the publish time." });
  }
  if (p.dwellMs !== undefined && (p.dwellMs < DWELL_MS.min || p.dwellMs > DWELL_MS.max)) {
    issues.push({ field: "dwellMs", message: `Time on screen is ${DWELL_MS.min / 1000}–${DWELL_MS.max / 1000} s.` });
  }
  tooLong(issues, "title", p.title, TEXT_LIMITS.title);
  if (CAMPAIGN_KINDS.has(p.kind) && !input.campaignId) {
    issues.push({ field: "campaignId", message: "Link a campaign: sponsor and creator content always carries a disclosure." });
  }
  if (!CAMPAIGN_KINDS.has(p.kind) && input.campaignId) {
    issues.push({ field: "campaignId", message: "Only sponsor and creator content belongs to a campaign." });
  }

  switch (p.kind) {
    case "news":
      tooLong(issues, "headline", p.headline, TEXT_LIMITS.headline);
      tooLong(issues, "summary", p.summary, TEXT_LIMITS.summary);
      tooLong(issues, "body", p.body.join("\n"), TEXT_LIMITS.body);
      if (p.href !== null && !isInternalPath(p.href)) issues.push({ field: "href", message: "Editorial links stay on Mogzy: use a path like /quiz." });
      if (p.variant === "event" && p.category !== "event") issues.push({ field: "category", message: "An event is filed under Event." });
      if (p.variant === "announcement" && p.category !== "news") issues.push({ field: "category", message: "An announcement is filed under News." });
      if (p.startsAt !== undefined && !validIso(p.startsAt)) issues.push({ field: "startsAt", message: "Not a valid date." });
      break;
    case "question":
      if (!isInternalPath(p.practiceHref)) issues.push({ field: "practiceHref", message: "Practice link stays on Mogzy." });
      if (new Set(p.options.map((o) => o.id)).size !== p.options.length) issues.push({ field: "options", message: "Answer ids must be unique." });
      break;
    case "minigame":
      if (!isInternalPath(p.playHref)) issues.push({ field: "playHref", message: "Play link stays on Mogzy." });
      break;
    case "sponsor":
      if (p.href !== null && !isHttpsUrl(p.href)) issues.push({ field: "href", message: "Sponsor destinations must be https." });
      if (p.artUrl !== null && !isHttpsUrl(p.artUrl)) issues.push({ field: "artUrl", message: "Artwork must be an https URL." });
      break;
    case "creator":
      if (p.media.thumbnailUrl !== null && !isHttpsUrl(p.media.thumbnailUrl)) issues.push({ field: "thumbnailUrl", message: "Thumbnail must be an https URL." });
      if (p.media.platform === "twitch" && p.media.live) {
        issues.push({ field: "live", message: "LIVE can't be set by hand; only a verified partner feed may claim it." });
      }
      if (p.challenge?.href && !isInternalPath(p.challenge.href)) issues.push({ field: "challengeHref", message: "Challenge link stays on Mogzy." });
      break;
  }
  return issues;
}

/** Everything Save checks, plus what going live needs. */
export function validateItemForPublish(
  input: PulseItemInput,
  campaign: PulseCampaign | null,
  now: Date,
): PulseIssue[] {
  const issues = validateItemForSave(input);
  const p = input.payload;
  if (!isRenderable(p)) issues.push({ field: "payload", message: "The scene is incomplete and would be skipped by the scheduler." });
  if (input.expiresAt && Date.parse(input.expiresAt) <= now.getTime()) {
    issues.push({ field: "expiresAt", message: "This expiry has already passed." });
  }
  if (p.kind === "news" && p.variant === "event" && !p.startsAt) {
    issues.push({ field: "startsAt", message: "An event needs a start time for its countdown." });
  }
  if (p.kind === "creator" && platformUrl(p.media) === null) {
    issues.push({ field: "media", message: "Connect a real video or channel id before going live." });
  }
  if (CAMPAIGN_KINDS.has(p.kind)) {
    if (!campaign) {
      if (input.campaignId) issues.push({ field: "campaignId", message: "The linked campaign no longer exists." });
    } else {
      if (campaign.type !== p.kind) issues.push({ field: "campaignId", message: `This is a ${campaign.type} campaign.` });
      if (campaign.approval !== "approved") issues.push({ field: "campaignId", message: `Campaign is ${campaign.approval}; it must be approved first.` });
      if (campaign.flightEnd && Date.parse(campaign.flightEnd) <= now.getTime()) issues.push({ field: "campaignId", message: "The campaign's flight has ended." });
    }
  }
  return issues;
}

export function validateCampaign(input: PulseCampaignInput): PulseIssue[] {
  const issues: PulseIssue[] = [];
  if (!input.partnerName.trim()) issues.push({ field: "partnerName", message: "Name the partner." });
  if (!input.title.trim()) issues.push({ field: "title", message: "Give the campaign a title." });
  if (input.type === "sponsor" && input.disclosure !== "sponsored") {
    issues.push({ field: "disclosure", message: "Sponsor campaigns are always disclosed as Sponsored." });
  }
  if (input.type === "creator" && input.disclosure === "sponsored") {
    issues.push({ field: "disclosure", message: "Use Paid partnership, Affiliate, or Not paid for creators." });
  }
  if (input.disclosure !== "unpaid-spotlight" && !input.disclosureText.trim()) {
    issues.push({ field: "disclosureText", message: "Paid relationships need disclosure wording (who paid)." });
  }
  if (!validIso(input.flightStart) || !validIso(input.flightEnd)) issues.push({ field: "flight", message: "Not a valid date." });
  if (input.flightStart && input.flightEnd && Date.parse(input.flightEnd) <= Date.parse(input.flightStart)) {
    issues.push({ field: "flight", message: "The flight must end after it starts." });
  }
  return issues;
}

export function validateSchedule(s: Pick<PulseScheduleSettings, "slots" | "maxPromotionsPerCycle" | "minPromotionGap">): PulseIssue[] {
  const issues: PulseIssue[] = [];
  const L = CADENCE_LIMITS;
  if (s.slots.length < L.minSlots || s.slots.length > L.maxSlots) {
    issues.push({ field: "slots", message: `A cycle has ${L.minSlots}–${L.maxSlots} slots.` });
  }
  if (!Number.isInteger(s.maxPromotionsPerCycle) || s.maxPromotionsPerCycle < 0 || s.maxPromotionsPerCycle > L.maxPromotionsPerCycle) {
    issues.push({ field: "maxPromotionsPerCycle", message: `Promotions per cycle: 0–${L.maxPromotionsPerCycle}.` });
  }
  if (!Number.isInteger(s.minPromotionGap) || s.minPromotionGap < L.minPromotionGap || s.minPromotionGap > L.maxPromotionGap) {
    issues.push({ field: "minPromotionGap", message: `Promotion spacing: ${L.minPromotionGap}–${L.maxPromotionGap} positions.` });
  }
  return issues;
}
