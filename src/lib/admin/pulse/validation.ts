// ---------------------------------------------------------------------------
// PULSE-2B — editorial items: what may be saved, and what may go live.
//
// Two levels:
//   save     the record is well-formed (a draft may be incomplete, but never
//            unsafe: no script URLs, no off-site links on editorial content).
//   publish  the scene can actually be drawn (the shared scheduler's own
//            `isRenderable`) and the schedule is coherent.
//
// Partner records (sponsor / creator) follow PULSE-2C's rules: partnerRules.ts.
// The server repeats these checks (pulse_admin_* RPCs); this module exists so
// the owner sees the reason before pressing the button.
// ---------------------------------------------------------------------------

import { isRenderable } from "@/features/academy-pulse/model/pulse-cadence";

import { AUTHORABLE_KINDS, CADENCE_LIMITS, KIND_CATEGORIES, type PulseItemInput, type PulseScheduleSettings } from "./contract";

export interface PulseIssue {
  field: string;
  message: string;
}

/** A same-site route: "/quiz", never "//evil.example" or "javascript:". */
export function isInternalPath(href: string): boolean {
  return /^\/(?!\/)[A-Za-z0-9\-._~/?#&=%+]*$/.test(href) && !href.includes("\\");
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
    issues.push({ field: "kind", message: "This kind is not editorial: providers or partner records supply it." });
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
  }
  return issues;
}

/** Everything Save checks, plus what going live needs. */
export function validateItemForPublish(input: PulseItemInput, now: Date): PulseIssue[] {
  const issues = validateItemForSave(input);
  const p = input.payload;
  if (!isRenderable(p)) issues.push({ field: "payload", message: "The scene is incomplete and would be skipped by the scheduler." });
  if (input.expiresAt && Date.parse(input.expiresAt) <= now.getTime()) {
    issues.push({ field: "expiresAt", message: "This expiry has already passed." });
  }
  if (p.kind === "news" && p.variant === "event" && !p.startsAt) {
    issues.push({ field: "startsAt", message: "An event needs a start time for its countdown." });
  }
  return issues;
}

export function validateSchedule(s: Pick<PulseScheduleSettings, "slots" | "maxPromotionsPerCycle" | "minPromotionGap">): PulseIssue[] {
  const issues: PulseIssue[] = [];
  const C = CADENCE_LIMITS;
  if (s.slots.length < C.minSlots || s.slots.length > C.maxSlots) {
    issues.push({ field: "slots", message: `A cycle has ${C.minSlots}–${C.maxSlots} slots.` });
  }
  if (!Number.isInteger(s.maxPromotionsPerCycle) || s.maxPromotionsPerCycle < 0 || s.maxPromotionsPerCycle > C.maxPromotionsPerCycle) {
    issues.push({ field: "maxPromotionsPerCycle", message: `Promotions per cycle: 0–${C.maxPromotionsPerCycle}.` });
  }
  if (!Number.isInteger(s.minPromotionGap) || s.minPromotionGap < C.minPromotionGap || s.minPromotionGap > C.maxPromotionGap) {
    issues.push({ field: "minPromotionGap", message: `Promotion spacing: ${C.minPromotionGap}–${C.maxPromotionGap} positions.` });
  }
  return issues;
}
