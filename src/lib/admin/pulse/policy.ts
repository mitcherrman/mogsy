// ---------------------------------------------------------------------------
// PULSE-2B — which owner assurance each workspace action needs.
//
// Provisional policy (command center, PR #155, 2026-10-24):
//
//   emergency disable                         trusted  (incident containment)
//   restore after emergency disable           FRESH    (re-exposes content)
//   narrowing a disable (managed → partners)  FRESH    (re-exposes editorial)
//   sponsor approve / resume                  FRESH
//   editing an approved or paused sponsor     FRESH    (approval-sensitive)
//   paid/affiliate creator approve / resume   FRESH    (paid promotion)
//   editing an approved/paused paid creator   FRESH
//   adding a sponsor destination host         FRESH    (widens where ads link)
//   editorial / event publication             trusted
//   everything that only REDUCES exposure     trusted  (pause, end, reject,
//     or touches non-public drafts                      unpublish, remove host)
//
// "trusted" = owner at aal2 or with a live trusted-device attestation for
// this session; "fresh" = owner at aal2 with an MFA in the last 10 minutes
// (OWN1 assert_owner 'fresh_aal2'). The staged SQL enforces exactly this
// table; this module only decides what to ask the owner BEFORE the call, so
// a fresh action is never sent first at trusted level and bounced.
// pulseAdminMigration.db.test.ts checks every row against the database.
// ---------------------------------------------------------------------------

import type { OwnerActionLevel } from "@/lib/admin-auth/ownerAction";

import type { PartnerAction, PartnerCompensation, PulseKillInput, PulseKillScope, PulsePartnerRecord } from "./contract";

/** Sponsors are always paid promotion; creators are when compensated. */
export function isPaidPromotion(p: { type: "sponsor" | "creator"; compensation: PartnerCompensation | null }): boolean {
  return p.type === "sponsor" || (p.compensation !== null && p.compensation !== "unpaid");
}

export function killLevel(current: { active: boolean; scope: PulseKillScope }, next: PulseKillInput): OwnerActionLevel {
  if (!next.active) return current.active ? "fresh" : "trusted";
  // Turning on, or widening partners → managed, only removes content.
  if (current.active && current.scope === "managed" && next.scope === "partners") return "fresh";
  return "trusted";
}

export function partnerTransitionLevel(p: Pick<PulsePartnerRecord, "type" | "compensation">, action: PartnerAction): OwnerActionLevel {
  return (action === "approve" || action === "resume") && isPaidPromotion(p) ? "fresh" : "trusted";
}

/**
 * Saving a partner record. Editing paid promotion that is (or was just)
 * public is approval-sensitive; the save also sends it back to
 * pending-review, so it leaves the Home Hub until re-approved.
 */
export function partnerSaveLevel(
  existing: Pick<PulsePartnerRecord, "type" | "compensation" | "record"> | null,
  next: { type: "sponsor" | "creator"; compensation: PartnerCompensation | null },
): OwnerActionLevel {
  if (!existing) return "trusted";
  const exposed = existing.record.status === "approved" || existing.record.status === "paused";
  return exposed && (isPaidPromotion(existing) || isPaidPromotion(next)) ? "fresh" : "trusted";
}

export function hostAllowlistLevel(op: "add" | "remove"): OwnerActionLevel {
  return op === "add" ? "fresh" : "trusted";
}

/** Owner-facing hint shown next to actions that will ask for a fresh code. */
export const FRESH_HINT = "Asks for a fresh authenticator code.";
