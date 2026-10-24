// ---------------------------------------------------------------------------
// PULSE-2B — workspace → what the public Home Hub would get.
//
// The same rules the server's `pulse_public_catalogue()` applies, in the
// browser, so the owner's preview shows exactly what would play and why
// anything is held back. Output is the shared scheduler's own input
// (`PulseCatalogue` + `PulseCadence`), so ordering, promotion caps and
// separation are decided by `buildPulseCycle` — never re-implemented here.
//
// Eligibility, in order (first failure is the reason reported):
//   1. Emergency disable: "managed" drops everything; "partners" drops
//      sponsor + creator.
//   2. Status is live (published, publish time reached, not expired).
//   3. Category enabled and not past its expiry.
//   4. Sponsor / creator: campaign approved and inside its flight.
//   5. Passes publish validation (renderable, safe links, disclosure).
// ---------------------------------------------------------------------------

import { DEFAULT_PULSE_CADENCE } from "@/features/academy-pulse/model/pulse-cadence";
import type { PulseCadence, PulseCatalogue, PulseCategory, PulseItem } from "@/features/academy-pulse/model/pulse-types";

import {
  CAMPAIGN_KINDS,
  type PulseCampaign,
  type PulseCategorySetting,
  type PulseContentRecord,
  type PulseScheduleSettings,
  type PulseWorkspaceSnapshot,
} from "./contract";
import { effectiveStatus } from "./lifecycle";
import { validateItemForPublish } from "./validation";

export type PulseExclusionReason =
  | "kill-managed"
  | "kill-partners"
  | "not-live"
  | "category-disabled"
  | "category-expired"
  | "campaign-missing"
  | "campaign-not-approved"
  | "campaign-outside-flight"
  | "invalid";

export const EXCLUSION_LABEL: Record<PulseExclusionReason, string> = {
  "kill-managed": "Emergency disable: all managed content",
  "kill-partners": "Emergency disable: sponsor and creator content",
  "not-live": "Not live",
  "category-disabled": "Category disabled",
  "category-expired": "Category expired",
  "campaign-missing": "No campaign linked",
  "campaign-not-approved": "Campaign not approved",
  "campaign-outside-flight": "Outside campaign flight",
  invalid: "Fails publish checks",
};

export interface PulsePublicProjection {
  catalogue: PulseCatalogue;
  cadence: PulseCadence;
  /** Records that exist but would not play, with the first reason. */
  excluded: { id: string; reason: PulseExclusionReason }[];
  /** True when the managed catalogue is switched off and Pulse must fall back to the shipped editorial set. */
  fallbackToStatic: boolean;
}

function categoryOff(setting: PulseCategorySetting | undefined, now: number): "category-disabled" | "category-expired" | null {
  if (!setting) return null;
  if (!setting.enabled || setting.maxPerCycle === 0) return "category-disabled";
  if (setting.expiresAt && Date.parse(setting.expiresAt) <= now) return "category-expired";
  return null;
}

function campaignOff(c: PulseCampaign | undefined, now: number): PulseExclusionReason | null {
  if (!c) return "campaign-missing";
  if (c.approval !== "approved") return "campaign-not-approved";
  if (c.flightStart && Date.parse(c.flightStart) > now) return "campaign-outside-flight";
  if (c.flightEnd && Date.parse(c.flightEnd) <= now) return "campaign-outside-flight";
  return null;
}

/** Rotation order inside a category: featured first, then priority, then newest publish. */
export function compareRecords(a: PulseContentRecord, b: PulseContentRecord): number {
  if (a.featured !== b.featured) return a.featured ? -1 : 1;
  if (a.priority !== b.priority) return a.priority - b.priority;
  const pa = a.publishedAt ? Date.parse(a.publishedAt) : 0;
  const pb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
  if (pa !== pb) return pb - pa;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The record's scene as the scheduler sees it. */
export function toPulseItem(record: PulseContentRecord, provenance: PulseItem["provenance"] = "live"): PulseItem {
  return { ...record.payload, id: record.id, provenance } as PulseItem;
}

/** The cadence the scheduler gets: disabled categories dropped, frequency caps applied. */
export function effectiveCadence(
  schedule: Pick<PulseScheduleSettings, "slots" | "maxPromotionsPerCycle" | "minPromotionGap">,
  categories: readonly PulseCategorySetting[],
  now: Date,
): PulseCadence {
  const t = now.getTime();
  const byCat = new Map(categories.map((c) => [c.category, c]));
  const used = new Map<PulseCategory, number>();
  const slots = schedule.slots.filter((slot) => {
    const s = byCat.get(slot);
    if (categoryOff(s, t)) return false;
    const n = (used.get(slot) ?? 0) + 1;
    used.set(slot, n);
    return s?.maxPerCycle == null || n <= s.maxPerCycle;
  });
  return {
    slots: slots.length > 0 ? slots : DEFAULT_PULSE_CADENCE.slots,
    maxPromotionsPerCycle: schedule.maxPromotionsPerCycle,
    minPromotionGap: schedule.minPromotionGap,
  };
}

export interface ProjectionOptions {
  /**
   * Preview only: also include these records whatever their status, labelled
   * as samples (provenance "fixture" → the frame shows "Sample"). Never used
   * for the public projection.
   */
  previewIds?: ReadonlySet<string>;
}

export function projectPublicPulse(
  snapshot: Pick<PulseWorkspaceSnapshot, "items" | "categories" | "schedule" | "campaigns">,
  now: Date,
  options: ProjectionOptions = {},
): PulsePublicProjection {
  const t = now.getTime();
  const { kill } = snapshot.schedule;
  const cats = new Map(snapshot.categories.map((c) => [c.category, c]));
  const campaigns = new Map(snapshot.campaigns.map((c) => [c.id, c]));
  const excluded: PulsePublicProjection["excluded"] = [];
  const eligible: { record: PulseContentRecord; preview: boolean }[] = [];

  for (const record of snapshot.items) {
    const preview = options.previewIds?.has(record.id) ?? false;
    const partner = CAMPAIGN_KINDS.has(record.payload.kind);
    const campaign = record.campaignId ? campaigns.get(record.campaignId) : undefined;
    let reason: PulseExclusionReason | null = null;
    if (kill.active && kill.scope === "managed") reason = "kill-managed";
    else if (kill.active && kill.scope === "partners" && partner) reason = "kill-partners";
    else if (effectiveStatus(record, now) !== "live") reason = "not-live";
    else reason = categoryOff(cats.get(record.payload.category), t);
    if (!reason && partner) reason = campaignOff(campaign, t);
    if (!reason && validateItemForPublish(record, campaign ?? null, now).length > 0) reason = "invalid";

    if (reason) {
      excluded.push({ id: record.id, reason });
      if (preview) eligible.push({ record, preview: true });
    } else {
      eligible.push({ record, preview });
    }
  }

  const grouped = new Map<PulseCategory, { record: PulseContentRecord; preview: boolean }[]>();
  for (const e of eligible) {
    const cat = e.record.payload.category;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(e);
  }
  const catalogue: PulseCatalogue = {};
  for (const [cat, list] of grouped) {
    list.sort((a, b) => compareRecords(a.record, b.record));
    catalogue[cat] = list.map((e) => toPulseItem(e.record, e.preview ? "fixture" : "live"));
  }

  return {
    catalogue,
    cadence: effectiveCadence(snapshot.schedule, snapshot.categories, now),
    excluded,
    fallbackToStatic: kill.active && kill.scope === "managed",
  };
}
