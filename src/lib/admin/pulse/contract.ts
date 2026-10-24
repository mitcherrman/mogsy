// ---------------------------------------------------------------------------
// PULSE-2B — the Admin Pulse Workspace persistence contract.
//
// What the owner manages, as plain data. The SCENE payload is the shared
// `PulseItem` (pulse-types.ts, unchanged); everything here is the editorial
// envelope around it: lifecycle, schedule, ordering, campaign linkage, and the
// per-category / cadence / emergency settings the public catalogue obeys.
//
// AUTHORITY. These records are written only through owner RPCs (see
// supabase/pulse-p2b-staged). The public Home Hub never reads these tables:
// it reads `pulse_public_catalogue()`, which applies `projectPublicPulse`'s
// rules server-side. The browser projection (projection.ts) mirrors those
// rules for the owner's preview and is not itself a gate.
//
// Coordinated through mitcherrman/mogsy#151 with PULSE-2A (live provider,
// consumes the public projection) and PULSE-2C (partner adapters, supply the
// campaign + disclosure metadata modelled here).
// ---------------------------------------------------------------------------

import type { PulseCategory, PulseItem, PulseSceneKind } from "@/features/academy-pulse/model/pulse-types";

export const PULSE_ADMIN_CONTRACT_VERSION = "pulse-admin/1" as const;

/* --------------------------------------------------------------- content */

/** What the owner set. Scheduling is a published record with a future `publishAt`. */
export type PulseEditorialState = "draft" | "published" | "unpublished" | "archived";

/** What the record IS at a given moment (derived; never stored). */
export type PulseEffectiveStatus = "draft" | "scheduled" | "live" | "expired" | "unpublished" | "archived";

/**
 * Kinds the owner may author by hand. The rest are provider-generated
 * (PULSE-2A): activity, leaderboard, insight and challenge carry real player
 * numbers that must come from an authoritative source, and Premium copy comes
 * only from `src/lib/premium/matrix.ts`. The owner steers those through
 * category and cadence settings, never by typing scores.
 */
export const AUTHORABLE_KINDS = ["news", "question", "minigame", "sponsor", "creator"] as const satisfies readonly PulseSceneKind[];
export type PulseAuthorableKind = (typeof AUTHORABLE_KINDS)[number];

/** Which categories an authorable kind may be filed under (mirrors the scene registry). */
export const KIND_CATEGORIES: Record<PulseAuthorableKind, readonly PulseCategory[]> = {
  news: ["news", "event"],
  question: ["educational"],
  minigame: ["mini-game"],
  sponsor: ["sponsor"],
  creator: ["creator-spotlight"],
};

/** Kinds that must be linked to an approved, disclosed campaign before they can go live. */
export const CAMPAIGN_KINDS: ReadonlySet<PulseSceneKind> = new Set<PulseSceneKind>(["sponsor", "creator"]);

export type AuthorablePulseItem = Extract<PulseItem, { kind: PulseAuthorableKind }>;

export interface PulseContentRecord {
  id: string;
  /** Owner-facing name in the workspace list; never shown publicly. */
  label: string;
  payload: AuthorablePulseItem;
  state: PulseEditorialState;
  /** ISO. Null = live as soon as published. */
  publishAt: string | null;
  /** ISO. Null = no expiry. */
  expiresAt: string | null;
  /** Rotation order inside its category: lower first. */
  priority: number;
  /** Featured items lead their category regardless of priority. */
  featured: boolean;
  /** Required for sponsor / creator kinds. */
  campaignId: string | null;
  /** Optimistic concurrency: every write names the revision it read. */
  revision: number;
  createdAt: string;
  updatedAt: string;
  /** When it was last moved to `published`. */
  publishedAt: string | null;
  /** Internal note (why, source link); never shown publicly. */
  note: string;
}

/* ------------------------------------------------------------ categories */

export interface PulseCategorySetting {
  category: PulseCategory;
  enabled: boolean;
  /**
   * Frequency: at most this many cadence slots of this category per cycle.
   * Null = as many as the cadence lists. 0 is the same as disabled.
   */
  maxPerCycle: number | null;
  /** ISO. After this moment the category behaves as disabled. */
  expiresAt: string | null;
  revision: number;
}

/* -------------------------------------------------------- cadence/safety */

/** Emergency editorial disable. Separate from VITE_ACADEMY_PULSE=off (the whole Home Hub device). */
export type PulseKillScope = "partners" | "managed";

export interface PulseEditorialKill {
  active: boolean;
  /**
   * partners  sponsor + creator content off (brand-safety incident).
   * managed   every owner-managed record off; Pulse falls back to the shipped
   *           static editorial catalogue (PULSE-2A integration point).
   */
  scope: PulseKillScope;
  reason: string;
  /** ISO, set by the server. */
  changedAt: string | null;
}

export interface PulseScheduleSettings {
  /** The cadence, as the shared scheduler reads it. */
  slots: PulseCategory[];
  maxPromotionsPerCycle: number;
  minPromotionGap: number;
  kill: PulseEditorialKill;
  revision: number;
}

/** Scheduler-compatible bounds (pulse-cadence.ts treats these as plain numbers). */
export const CADENCE_LIMITS = {
  minSlots: 1,
  maxSlots: 24,
  maxPromotionsPerCycle: 4,
  minPromotionGap: 1,
  maxPromotionGap: 12,
} as const;

/* ------------------------------------------------------------- campaigns */

export type PulseCampaignType = "sponsor" | "creator";
export type PulseCampaignApproval = "pending" | "approved" | "rejected" | "ended";

/**
 * How the scene discloses the relationship. Sponsor scenes always carry the
 * permanent SPONSORED band; this adds the owner-reviewed wording.
 */
export type PulseDisclosureKind = "sponsored" | "paid-partnership" | "affiliate" | "unpaid-spotlight";

export const DISCLOSURE_LABEL: Record<PulseDisclosureKind, string> = {
  sponsored: "Sponsored",
  "paid-partnership": "Paid partnership",
  affiliate: "Affiliate link",
  "unpaid-spotlight": "Creator spotlight · not paid",
};

export interface PulseCampaign {
  id: string;
  type: PulseCampaignType;
  partnerName: string;
  title: string;
  disclosure: PulseDisclosureKind;
  /** Extra disclosure wording shown in the expanded view, e.g. "Paid by Example Co." */
  disclosureText: string;
  approval: PulseCampaignApproval;
  /** Set by the server on approve / reject / end. */
  decidedAt: string | null;
  decisionNote: string;
  /** Flight window (ISO). Content of this campaign is only eligible inside it. */
  flightStart: string | null;
  flightEnd: string | null;
  /** Internal contract / brief reference; never public. */
  contractRef: string;
  revision: number;
}

/* -------------------------------------------------------------- snapshot */

export interface PulseWorkspaceSnapshot {
  contractVersion: typeof PULSE_ADMIN_CONTRACT_VERSION;
  items: PulseContentRecord[];
  categories: PulseCategorySetting[];
  schedule: PulseScheduleSettings;
  campaigns: PulseCampaign[];
  /** Server time at load, so previews evaluate schedules on the server's clock. */
  serverNow: string;
}

/* ------------------------------------------------------------ write ops */

export interface PulseItemInput {
  id: string | null;
  label: string;
  payload: AuthorablePulseItem;
  publishAt: string | null;
  expiresAt: string | null;
  priority: number;
  featured: boolean;
  campaignId: string | null;
  note: string;
}

export type PulseItemTransition =
  | { action: "publish" }
  | { action: "schedule"; publishAt: string }
  | { action: "unpublish" }
  | { action: "archive" }
  | { action: "revert-to-draft" };

export type PulseCampaignInput = Omit<PulseCampaign, "approval" | "decidedAt" | "decisionNote" | "revision"> & { id: string | null };

export type PulseCampaignDecision = "approve" | "reject" | "end";

export interface PulseKillInput {
  active: boolean;
  scope: PulseKillScope;
  reason: string;
}
