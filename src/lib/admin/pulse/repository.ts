// ---------------------------------------------------------------------------
// PULSE-2B — the workspace's one door to storage.
//
// The UI talks only to `PulseAdminRepository`. Two implementations:
//
//   memory    prototype: in-browser, seeded, enforces the same rules as the
//             server so the workflow can be reviewed before any migration is
//             applied. Labelled "Prototype — not saved" in the UI.
//   supabase  owner RPCs from supabase/pulse-p2b-staged (NOT applied). Every
//             write goes through runOwnerAction, so a lapsed device
//             attestation or a missing MFA is handled the OWN1.1 way; the
//             server's assert_owner() is the authority.
//
// Every write names the revision it read; a stale revision is a conflict,
// never a silent overwrite.
// ---------------------------------------------------------------------------

import type {
  PulseCampaign,
  PulseCampaignDecision,
  PulseCampaignInput,
  PulseCategorySetting,
  PulseContentRecord,
  PulseItemInput,
  PulseItemTransition,
  PulseKillInput,
  PulseScheduleSettings,
  PulseWorkspaceSnapshot,
} from "./contract";
import type { PulseIssue } from "./validation";

export type PulseRepositoryErrorCode =
  | "invalid" // the server (or prototype) refused the content; `issues` says why
  | "conflict" // someone else changed it; reload
  | "forbidden" // not the owner
  | "step_up" // verification cancelled or needs a retry
  | "not_found"
  | "unavailable"; // network / server

export class PulseRepositoryError extends Error {
  constructor(
    readonly code: PulseRepositoryErrorCode,
    message: string,
    readonly issues: PulseIssue[] = [],
  ) {
    super(message);
    this.name = "PulseRepositoryError";
  }
}

export interface PulseAdminRepository {
  readonly mode: "prototype" | "server";
  load(): Promise<PulseWorkspaceSnapshot>;
  saveItem(input: PulseItemInput, expectedRevision: number | null): Promise<PulseContentRecord>;
  transitionItem(id: string, transition: PulseItemTransition, expectedRevision: number): Promise<PulseContentRecord>;
  saveCategory(setting: Omit<PulseCategorySetting, "revision">, expectedRevision: number): Promise<PulseCategorySetting>;
  saveSchedule(
    schedule: Pick<PulseScheduleSettings, "slots" | "maxPromotionsPerCycle" | "minPromotionGap">,
    expectedRevision: number,
  ): Promise<PulseScheduleSettings>;
  saveCampaign(input: PulseCampaignInput, expectedRevision: number | null): Promise<PulseCampaign>;
  decideCampaign(id: string, decision: PulseCampaignDecision, note: string, expectedRevision: number): Promise<PulseCampaign>;
  /** Emergency editorial disable. Deliberately needs no revision: it must always win. */
  setEditorialKill(input: PulseKillInput): Promise<PulseScheduleSettings>;
}

/** Owner-facing message for any repository failure. */
export function repositoryErrorMessage(err: unknown): string {
  if (err instanceof PulseRepositoryError) return err.message;
  return "Something went wrong. Nothing was changed.";
}
