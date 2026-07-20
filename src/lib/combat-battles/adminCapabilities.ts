// Single source of truth for which admin lifecycle actions are available for a
// battle, derived from the AUTHORITATIVE backend contract (not from button
// labels or status names). The frontend is advisory only — the backend remains
// the authority and will reject a stale/racing action; this just avoids
// offering actions the backend will certainly refuse (e.g. Reproduce before a
// frozen result exists — the defect this addresses).
//
// Backend rules mirrored here (services/combat_battle_lifecycle.py,
// services/combat_battle_settlement.py):
//   • Edit (update_draft): stored status ∈ {draft, validated}.
//   • Validate: stored status ∈ {draft, validated} (rejects scheduled/void).
//   • Publish: not void, not already published; a passing validate() sets
//     status → "validated", so "validated" is the validation-passed signal.
//     Backend also requires open_at ≤ lock_at ≤ reveal_at.
//   • Reproduce: requires a frozen result (only exists after publish).
//   • Settle: effective status "revealed" (normal) OR stored "void" (void path).
//   • Void: not already void AND settlement not completed (no clawback).
import type { AdminBattle, BattleStatus, SettlementSummary } from "./types";

export type AdminAction = "edit" | "validate" | "publish" | "reproduce" | "settle" | "void";
export type Capability = { available: boolean; reason: string | null };
export type BattleAdminCapabilities = Record<AdminAction, Capability>;

export type CapabilityContext = {
  /** datetime-local strings from the publish form, if the user has entered them. */
  openAt?: string;
  lockAt?: string;
  revealAt?: string;
  /** Authoritative settlement status if known (from the settlement summary). */
  settlementStatus?: SettlementSummary["status"] | null;
};

const EDITABLE: BattleStatus[] = ["draft", "validated"];

const ok: Capability = { available: true, reason: null };
const no = (reason: string): Capability => ({ available: false, reason });

function publishTimes(open?: string, lock?: string, reveal?: string) {
  const present = Boolean(open && lock && reveal);
  if (!present) return { present: false, ordered: false };
  const [o, l, r] = [open, lock, reveal].map((s) => new Date(s as string).getTime());
  const finite = [o, l, r].every((n) => Number.isFinite(n));
  return { present: true, ordered: finite && o <= l && l <= r };
}

export function getBattleAdminCapabilities(
  battle: AdminBattle,
  ctx: CapabilityContext = {},
): BattleAdminCapabilities {
  const stored = battle.stored_status;
  const effective = battle.effective_status;
  const isVoid = stored === "void";
  const isPublished = stored === "scheduled" || Boolean(battle.published_at);
  const hasFrozenResult = Boolean(battle.result_checksum) || battle.frozen_result != null;
  const settlementCompleted = ctx.settlementStatus === "completed";
  const editable = EDITABLE.includes(stored);

  // Edit / Validate — only pre-publication editable states.
  const edit = editable
    ? ok
    : no(isVoid ? "This event is void" : "Published battles cannot be edited");
  const validate = editable
    ? ok
    : no(isVoid ? "This event is void" : "Already published — cannot re-validate");

  // Publish — validated, not already published/terminal, with ordered times.
  let publish: Capability;
  if (isVoid) publish = no("Voided battle cannot be published");
  else if (isPublished) publish = no("Already published");
  else if (stored !== "validated") publish = no("Validate the draft first");
  else {
    const t = publishTimes(ctx.openAt, ctx.lockAt, ctx.revealAt);
    if (!t.present) publish = no("Add valid publication times");
    else if (!t.ordered) publish = no("Times must be ordered: open ≤ lock ≤ reveal");
    else publish = ok;
  }

  // Reproduce — a frozen result must exist (publish freezes it).
  const reproduce = hasFrozenResult
    ? ok
    : no("Publish to freeze a result before reproducing");

  // Settle — revealed (normal) or void (void path). Idempotent server-side.
  const settle = effective === "revealed" || isVoid
    ? ok
    : no("Result has not been revealed");

  // Void — not already void, and not after a completed settlement.
  let voidCap: Capability;
  if (isVoid) voidCap = no("This event is already void");
  else if (settlementCompleted) voidCap = no("This event has already been settled");
  else voidCap = ok;

  return { edit, validate, publish, reproduce, settle, void: voidCap };
}
