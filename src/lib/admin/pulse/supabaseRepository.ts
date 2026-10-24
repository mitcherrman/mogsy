// ---------------------------------------------------------------------------
// PULSE-2B — server repository over the owner RPCs proposed in
// supabase/pulse-p2b-staged/migrations/01_pulse_admin_workspace.sql.
//
// NOT LIVE until that migration is reviewed and applied (an L3 release gate).
// The RPCs are not in the generated Supabase types yet, so calls go through a
// narrow `PulseRpc` seam, which also makes the auth behaviour testable.
//
// Levels (OWN1.1 runOwnerAction):
//   trusted  content saves, lifecycle, categories, cadence, emergency disable
//   fresh    campaign decisions (approve / reject / end): a sponsor or paid
//            creator going live is the highest-trust editorial act here
// ---------------------------------------------------------------------------

import { runOwnerAction, ownerActionNotice, type OwnerActionLevel } from "@/lib/admin-auth/ownerAction";

import {
  PULSE_ADMIN_CONTRACT_VERSION,
  type PulseCampaign,
  type PulseCategorySetting,
  type PulseContentRecord,
  type PulseScheduleSettings,
  type PulseWorkspaceSnapshot,
} from "./contract";
import { PulseRepositoryError, type PulseAdminRepository } from "./repository";
import type { PulseIssue } from "./validation";

export interface RpcResult {
  data: unknown;
  error: { message?: string; code?: string; details?: string; hint?: string } | null;
}
export type PulseRpc = (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;
export type OwnerActionRunner = typeof runOwnerAction;

/** Every RPC this repository calls (the migration defines exactly these). */
export const PULSE_ADMIN_RPCS = {
  snapshot: "pulse_admin_snapshot",
  saveItem: "pulse_admin_save_item",
  transitionItem: "pulse_admin_transition_item",
  saveCategory: "pulse_admin_save_category",
  saveSchedule: "pulse_admin_save_schedule",
  saveCampaign: "pulse_admin_save_campaign",
  decideCampaign: "pulse_admin_decide_campaign",
  setKill: "pulse_admin_set_kill",
} as const;

/** The level each write asks the owner for. */
export const PULSE_ACTION_LEVEL: Record<Exclude<keyof typeof PULSE_ADMIN_RPCS, "snapshot">, OwnerActionLevel> = {
  saveItem: "trusted",
  transitionItem: "trusted",
  saveCategory: "trusted",
  saveSchedule: "trusted",
  saveCampaign: "trusted",
  decideCampaign: "fresh",
  setKill: "trusted",
};

function parseIssues(details: string | undefined): PulseIssue[] {
  if (!details) return [];
  try {
    const v = JSON.parse(details) as unknown;
    return Array.isArray(v) ? v.filter((x): x is PulseIssue => !!x && typeof x === "object" && "field" in x && "message" in x) : [];
  } catch {
    return [];
  }
}

/** Map a PostgREST/RPC error onto the repository's error codes. */
export function toRepositoryError(error: NonNullable<RpcResult["error"]>): PulseRepositoryError {
  const msg = error.message ?? "";
  if (msg.includes("pulse_conflict")) return new PulseRepositoryError("conflict", "This changed since you opened it. Reload to see the latest.");
  if (msg.includes("pulse_invalid")) return new PulseRepositoryError("invalid", "The server refused this change:", parseIssues(error.details));
  if (msg.includes("pulse_not_found")) return new PulseRepositoryError("not_found", "That no longer exists.");
  if (msg.includes("step_up_required")) return new PulseRepositoryError("step_up", "Verification is needed. Nothing was changed.");
  if (error.code === "42501" || msg.includes("not_authorized") || msg.includes("permission denied")) {
    return new PulseRepositoryError("forbidden", "Only the owner can change Academy Pulse.");
  }
  if (error.code === "PGRST202" || error.code === "42883") {
    return new PulseRepositoryError("unavailable", "The Pulse workspace isn't installed on the server yet.");
  }
  return new PulseRepositoryError("unavailable", "The server didn't answer. Nothing was changed.");
}

export function parseSnapshot(data: unknown): PulseWorkspaceSnapshot {
  const s = data as Partial<PulseWorkspaceSnapshot> | null;
  if (!s || s.contractVersion !== PULSE_ADMIN_CONTRACT_VERSION || !Array.isArray(s.items) || !Array.isArray(s.categories)
    || !Array.isArray(s.campaigns) || !s.schedule || typeof s.serverNow !== "string") {
    throw new PulseRepositoryError("unavailable", "The server returned a workspace this version can't read.");
  }
  return s as PulseWorkspaceSnapshot;
}

export interface SupabaseRepositoryDeps {
  rpc: PulseRpc;
  runAction?: OwnerActionRunner;
}

export function createSupabasePulseRepository({ rpc, runAction = runOwnerAction }: SupabaseRepositoryDeps): PulseAdminRepository {
  async function write<T>(op: keyof typeof PULSE_ACTION_LEVEL, reason: string, args: Record<string, unknown>): Promise<T> {
    const outcome = await runAction({ level: PULSE_ACTION_LEVEL[op], reason, idempotent: false }, () => rpc(PULSE_ADMIN_RPCS[op], args));
    if (outcome.status !== "done") {
      throw new PulseRepositoryError("step_up", ownerActionNotice(outcome) ?? "Verification is needed. Nothing was changed.");
    }
    const { data, error } = outcome.result;
    if (error) throw toRepositoryError(error);
    return data as T;
  }

  return {
    mode: "server",

    async load() {
      const { data, error } = await rpc(PULSE_ADMIN_RPCS.snapshot);
      if (error) throw toRepositoryError(error);
      return parseSnapshot(data);
    },

    saveItem: (input, expectedRevision) =>
      write<PulseContentRecord>("saveItem", "Save Pulse content", { _item: input, _expected_revision: expectedRevision }),

    transitionItem: (id, t, expectedRevision) =>
      write<PulseContentRecord>("transitionItem", `${t.action[0].toUpperCase()}${t.action.slice(1)} Pulse content`, {
        _id: id,
        _action: t.action,
        _publish_at: t.action === "schedule" ? t.publishAt : null,
        _expected_revision: expectedRevision,
      }),

    saveCategory: (s, expectedRevision) =>
      write<PulseCategorySetting>("saveCategory", "Change a Pulse category", {
        _category: s.category,
        _enabled: s.enabled,
        _max_per_cycle: s.maxPerCycle,
        _expires_at: s.expiresAt,
        _expected_revision: expectedRevision,
      }),

    saveSchedule: (s, expectedRevision) =>
      write<PulseScheduleSettings>("saveSchedule", "Change the Pulse cadence", {
        _slots: s.slots,
        _max_promotions: s.maxPromotionsPerCycle,
        _min_gap: s.minPromotionGap,
        _expected_revision: expectedRevision,
      }),

    saveCampaign: (input, expectedRevision) =>
      write<PulseCampaign>("saveCampaign", "Save a Pulse campaign", { _campaign: input, _expected_revision: expectedRevision }),

    decideCampaign: (id, decision, note, expectedRevision) =>
      write<PulseCampaign>("decideCampaign", `${decision[0].toUpperCase()}${decision.slice(1)} a Pulse campaign`, {
        _id: id,
        _decision: decision,
        _note: note,
        _expected_revision: expectedRevision,
      }),

    setEditorialKill: (input) =>
      write<PulseScheduleSettings>("setKill", input.active ? "Disable Pulse editorial content" : "Restore Pulse editorial content", {
        _active: input.active,
        _scope: input.scope,
        _reason: input.reason,
      }),
  };
}
