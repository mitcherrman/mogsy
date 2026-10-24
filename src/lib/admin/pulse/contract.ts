// ---------------------------------------------------------------------------
// PULSE-2B — the Admin Pulse Workspace persistence contract (v2).
//
// Two kinds of owner content, each with ONE public shape:
//
//   EDITORIAL  news / event / question / mini-game. The scene payload is the
//              shared `PulseItem` (pulse-types.ts, unchanged) inside an
//              editorial envelope (lifecycle, schedule, ordering).
//   PARTNERS   sponsor campaigns and creator spotlights, stored and emitted
//              as PULSE-2C's `SponsorCampaignRecord` / `CreatorRecord`
//              (partnerContract.ts mirrors #153 verbatim). 2C's adapter is
//              the single presentation validator; the database repeats the
//              security-relevant checks. The workspace adds only admin-side
//              fields (revision, note, creator compensation) that are never
//              public.
//
// AUTHORITY. Records are written only through owner RPCs (supabase/
// pulse-p2b-staged). The public Home Hub reads `pulse_public_catalogue()`
// ("pulse-public/2"): editorial PulseItems + approved partner records.
// policy.ts states which owner assurance each action needs; the server
// enforces the same table.
//
// Coordinated through mitcherrman/mogsy#151 with PULSE-2A (consumes the public
// read) and PULSE-2C (#153, owns the partner record contract and adapter).
// ---------------------------------------------------------------------------

import type { PulseCategory, PulseItem, PulseSceneKind } from "@/features/academy-pulse/model/pulse-types";

import type { CreatorRecord, PartnerStatus, SponsorCampaignRecord } from "./partnerContract";

export const PULSE_ADMIN_CONTRACT_VERSION = "pulse-admin/2" as const;
export const PULSE_PUBLIC_CONTRACT_VERSION = "pulse-public/2" as const;

/* ------------------------------------------------------------- editorial */

/** What the owner set. Scheduling is a published record with a future `publishAt`. */
export type PulseEditorialState = "draft" | "published" | "unpublished" | "archived";

/** What the record IS at a given moment (derived; never stored). */
export type PulseEffectiveStatus = "draft" | "scheduled" | "live" | "expired" | "unpublished" | "archived";

/**
 * Kinds the owner authors as editorial items. Sponsor and creator content are
 * partner records (below), not editorial items. Activity, leaderboard,
 * insight and challenge carry real player numbers and are provider-only
 * (PULSE-2A); Premium copy comes only from `src/lib/premium/matrix.ts`.
 */
export const AUTHORABLE_KINDS = ["news", "question", "minigame"] as const satisfies readonly PulseSceneKind[];
export type PulseAuthorableKind = (typeof AUTHORABLE_KINDS)[number];

/** Which categories an authorable kind may be filed under (mirrors the scene registry). */
export const KIND_CATEGORIES: Record<PulseAuthorableKind, readonly PulseCategory[]> = {
  news: ["news", "event"],
  question: ["educational"],
  minigame: ["mini-game"],
};

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
  /** Optimistic concurrency: every write names the revision it read. */
  revision: number;
  createdAt: string;
  updatedAt: string;
  /** When it was last moved to `published`. */
  publishedAt: string | null;
  /** Internal note (why, source link); never shown publicly. */
  note: string;
}

/* -------------------------------------------------------------- partners */

/**
 * Admin-only: the commercial relationship behind a creator spotlight.
 * `paid` / `affiliate` are paid promotion: approving them needs fresh MFA,
 * and they stay off the public Home Hub until a disclosure can be rendered
 * (CreatorRecord has no disclosure field yet — a shared-type PR).
 */
export type PartnerCompensation = "unpaid" | "paid" | "affiliate";

interface PartnerEnvelope {
  revision: number;
  createdAt: string;
  updatedAt: string;
  /** Internal note (contract reference, contact). Never public. */
  note: string;
  /** Why it was last rejected / paused / ended. Never public. */
  decisionNote: string;
}

export type PulsePartnerRecord =
  | (PartnerEnvelope & { type: "sponsor"; record: SponsorCampaignRecord; compensation: null })
  | (PartnerEnvelope & { type: "creator"; record: CreatorRecord; compensation: PartnerCompensation });

/** What the owner edits. Status, approval and provenance are set by the server, never by the form. */
export type EditableSponsorRecord = Omit<SponsorCampaignRecord, "status" | "approval" | "provenance">;
export type EditableCreatorRecord = Omit<CreatorRecord, "status" | "approval" | "provenance" | "challenge">;

export type PulsePartnerInput =
  | { type: "sponsor"; record: EditableSponsorRecord; compensation: null; note: string }
  | { type: "creator"; record: EditableCreatorRecord; compensation: PartnerCompensation; note: string };

/**
 * Partner lifecycle on PULSE-2C's statuses:
 *
 *   draft ─submit─► pending-review ─approve─► approved ─pause─► paused
 *     ▲                  │  reject               │  ▲   resume   │
 *     │                  ▼                       │  └────────────┘
 *     └──revise── rejected / ended ◄──── end ────┴───────────────┘
 */
export type PartnerAction = "submit" | "approve" | "reject" | "pause" | "resume" | "end" | "revise";

export const PARTNER_TRANSITIONS: Record<PartnerAction, { from: readonly PartnerStatus[]; to: PartnerStatus }> = {
  submit: { from: ["draft"], to: "pending-review" },
  approve: { from: ["pending-review"], to: "approved" },
  reject: { from: ["pending-review"], to: "rejected" },
  pause: { from: ["approved"], to: "paused" },
  resume: { from: ["paused"], to: "approved" },
  end: { from: ["approved", "paused"], to: "ended" },
  revise: { from: ["rejected", "ended"], to: "draft" },
};

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

/**
 * Release gates, set ONLY by a reviewed migration (no RPC can change them).
 * While false, the matching partner content never leaves the database.
 */
export interface PulseReleaseGates {
  /** The shared-type PR that renders sponsor disclosure has shipped. */
  sponsorDisclosureRendered: boolean;
  /** CreatorRecord can carry and render a paid-relationship disclosure. */
  paidCreatorDisclosureRendered: boolean;
}

/* -------------------------------------------------------------- snapshot */

export interface PulseWorkspaceSnapshot {
  contractVersion: typeof PULSE_ADMIN_CONTRACT_VERSION;
  items: PulseContentRecord[];
  categories: PulseCategorySetting[];
  schedule: PulseScheduleSettings;
  partners: PulsePartnerRecord[];
  /** Global sponsor destination allowlist: a destination host must be here AND in the campaign's approvedHosts. */
  sponsorHostAllowlist: string[];
  gates: PulseReleaseGates;
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
  note: string;
}

export type PulseItemTransition =
  | { action: "publish" }
  | { action: "schedule"; publishAt: string }
  | { action: "unpublish" }
  | { action: "archive" }
  | { action: "revert-to-draft" };

export interface PulseKillInput {
  active: boolean;
  scope: PulseKillScope;
  reason: string;
}

/* ------------------------------------------------------- public (read) */

/** `pulse_public_catalogue()` — the ONE public shape PULSE-2A consumes. */
export interface PulsePublicCatalogue {
  contractVersion: typeof PULSE_PUBLIC_CONTRACT_VERSION;
  generatedAt: string;
  /** Emergency disable "managed": serve the shipped static editorial set instead. */
  fallbackToStatic: boolean;
  /** Empty slots = keep DEFAULT_PULSE_CADENCE. */
  cadence: { slots: PulseCategory[]; maxPromotionsPerCycle: number; minPromotionGap: number };
  /** Eligible editorial PulseItems, rotation order. */
  items: AuthorablePulseItem[];
  /** Approved, in-window partner records in PULSE-2C's shape; feed to adaptPartnerContent(). */
  partners: { creators: CreatorRecord[]; sponsors: SponsorCampaignRecord[] };
}
