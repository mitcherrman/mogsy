// ---------------------------------------------------------------------------
// PULSE-2B — workspace → what the public Home Hub would get.
//
// The same rules the server's `pulse_public_catalogue()` applies, in the
// browser, so the owner's preview shows exactly what would play and why
// anything is held back.
//
// Editorial eligibility, in order (first failure is the reason reported):
//   1. Emergency disable "managed".
//   2. Status is live (published, publish time reached, not expired).
//   3. Category enabled and not past its expiry.
//   4. Passes publish validation.
// Partner eligibility (records emitted in PULSE-2C's shape):
//   1. Emergency disable ("managed" or "partners").
//   2. Status approved, with an approval.
//   3. Category (sponsor / creator-spotlight) enabled.
//   4. Inside its flight / feature window.
//   5. Passes 2C's rules + the sponsor host allowlist.
//   6. Release gate open (disclosure renderable).
//
// The catalogue output is the shared scheduler's own input, so ordering,
// promotion caps and separation are decided by `buildPulseCycle`.
// ---------------------------------------------------------------------------

import { DEFAULT_PULSE_CADENCE } from "@/features/academy-pulse/model/pulse-cadence";
import type { PulseCadence, PulseCatalogue, PulseCategory, PulseItem } from "@/features/academy-pulse/model/pulse-types";

import type {
  PulseCategorySetting,
  PulseContentRecord,
  PulsePartnerRecord,
  PulseScheduleSettings,
  PulseWorkspaceSnapshot,
} from "./contract";
import type { CreatorRecord, SponsorCampaignRecord } from "./partnerContract";
import { effectiveStatus } from "./lifecycle";
import { gateIssue, parseInstant, partnerPreviewItem, toPartnerInput, validatePartnerForApproval } from "./partnerRules";
import { validateItemForPublish } from "./validation";

export type PulseExclusionReason =
  | "kill-managed"
  | "kill-partners"
  | "not-live"
  | "category-disabled"
  | "category-expired"
  | "partner-not-approved"
  | "partner-outside-window"
  | "release-gate"
  | "invalid";

export const EXCLUSION_LABEL: Record<PulseExclusionReason, string> = {
  "kill-managed": "Emergency disable: all managed content",
  "kill-partners": "Emergency disable: sponsor and creator content",
  "not-live": "Not live",
  "category-disabled": "Category disabled",
  "category-expired": "Category expired",
  "partner-not-approved": "Not approved",
  "partner-outside-window": "Outside its flight / feature window",
  "release-gate": "Waiting on rendered disclosure (release gate)",
  invalid: "Fails publish checks",
};

export interface PulsePublicProjection {
  /** Editorial items (+ partner preview scenes, labelled Sample) for the scheduler. */
  catalogue: PulseCatalogue;
  cadence: PulseCadence;
  /** Exactly the partner records pulse_public_catalogue() would emit. */
  partners: { creators: CreatorRecord[]; sponsors: SponsorCampaignRecord[] };
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

export const PARTNER_CATEGORY: Record<PulsePartnerRecord["type"], PulseCategory> = { sponsor: "sponsor", creator: "creator-spotlight" };

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

function partnerWindowOpen(p: PulsePartnerRecord, t: number): boolean {
  const [from, until] = p.type === "sponsor"
    ? [parseInstant(p.record.window.startsAt), parseInstant(p.record.window.endsAt)]
    : [p.record.activeFrom === undefined ? -Infinity : parseInstant(p.record.activeFrom),
       p.record.activeUntil === undefined ? Infinity : parseInstant(p.record.activeUntil)];
  return from !== null && until !== null && from <= t && t < until;
}

/** First reason a partner record would not leave the database, or null. */
export function partnerExclusion(
  p: PulsePartnerRecord,
  snapshot: Pick<PulseWorkspaceSnapshot, "categories" | "schedule" | "sponsorHostAllowlist" | "gates">,
  now: Date,
): PulseExclusionReason | null {
  const t = now.getTime();
  const { kill } = snapshot.schedule;
  if (kill.active) return kill.scope === "managed" ? "kill-managed" : "kill-partners";
  if (p.record.status !== "approved" || !p.record.approval) return "partner-not-approved";
  const cat = categoryOff(snapshot.categories.find((c) => c.category === PARTNER_CATEGORY[p.type]), t);
  if (cat) return cat;
  if (!partnerWindowOpen(p, t)) return "partner-outside-window";
  if (validatePartnerForApproval(toPartnerInput(p), snapshot.sponsorHostAllowlist, now).length > 0) return "invalid";
  if (gateIssue(p, snapshot.gates)) return "release-gate";
  return null;
}

export interface ProjectionOptions {
  /**
   * Preview only: also include these editorial records whatever their status,
   * labelled as samples (provenance "fixture" → the frame shows "Sample").
   * Never used for the public projection.
   */
  previewIds?: ReadonlySet<string>;
}

export function projectPublicPulse(
  snapshot: Pick<PulseWorkspaceSnapshot, "items" | "categories" | "schedule" | "partners" | "sponsorHostAllowlist" | "gates">,
  now: Date,
  options: ProjectionOptions = {},
): PulsePublicProjection {
  const t = now.getTime();
  const { kill } = snapshot.schedule;
  const cats = new Map(snapshot.categories.map((c) => [c.category, c]));
  const excluded: PulsePublicProjection["excluded"] = [];
  const eligible: { record: PulseContentRecord; preview: boolean }[] = [];

  for (const record of snapshot.items) {
    const preview = options.previewIds?.has(record.id) ?? false;
    let reason: PulseExclusionReason | null = null;
    if (kill.active && kill.scope === "managed") reason = "kill-managed";
    else if (effectiveStatus(record, now) !== "live") reason = "not-live";
    else reason = categoryOff(cats.get(record.payload.category), t);
    if (!reason && validateItemForPublish(record, now).length > 0) reason = "invalid";

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

  const partners: PulsePublicProjection["partners"] = { creators: [], sponsors: [] };
  for (const p of snapshot.partners) {
    const reason = partnerExclusion(p, snapshot, now);
    if (reason) { excluded.push({ id: p.record.id, reason }); continue; }
    if (p.type === "sponsor") partners.sponsors.push(p.record);
    else partners.creators.push(p.record);
    // The scene the owner previews: an approximation of 2C's adapter, labelled Sample.
    const item = partnerPreviewItem(toPartnerInput(p));
    catalogue[item.category] = [...(catalogue[item.category] ?? []), item];
  }

  return {
    catalogue,
    cadence: effectiveCadence(snapshot.schedule, snapshot.categories, now),
    partners,
    excluded,
    fallbackToStatic: kill.active && kill.scope === "managed",
  };
}
