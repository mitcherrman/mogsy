// ---------------------------------------------------------------------------
// OWN1.1 — run one owner action with the right amount of re-verification.
//
//   level "trusted"  routine, reversible admin work. A trusted owner session
//                    is enough. If the server refuses because the device
//                    attestation lapsed, re-attest once and retry once; MFA is
//                    asked only when the trusted device cannot restore access.
//   level "fresh"    high-risk work. Before the call, if the server does not
//                    report a fresh MFA (≤10 min), ask for MFA for THIS action
//                    only; the admin app stays mounted.
//
// Replay rule: a server step-up refusal is raised before the action has any
// effect, but an action is still re-sent after an MFA prompt ONLY when the
// caller marks it idempotent. Otherwise the outcome is "verify_then_retry" and
// the owner clicks again. There is never more than one automatic retry.
//
// The server remains the authority: this decides what to ask the owner, never
// whether the action is allowed.
// ---------------------------------------------------------------------------

import { isStepUpRequired, stepUpKind } from "./ownerAuth";
import { ensureOwnerAuthorized, refreshOwnerSession } from "./ownerSession";
import { requestOwnerStepUp } from "./ownerStepUpRequest";

export type OwnerActionLevel = "trusted" | "fresh";
export type StepUpNeed = "trusted" | "fresh" | null;

export type OwnerActionOutcome<T> =
  | { status: "done"; result: T }
  | { status: "cancelled" } // the owner closed the MFA prompt
  | { status: "verify_then_retry" }; // MFA done; a non-idempotent action was not re-sent

/**
 * Did this Supabase result ({ data, error }) come back as a step-up refusal?
 * Covers RPC errors (message `step_up_required`, HINT names the level) and
 * Edge Function refusals (`{ error: "step_up_required" }` in the HTTP body,
 * which supabase-js surfaces only on `error.context`).
 */
export async function stepUpNeedOf(result: unknown): Promise<StepUpNeed> {
  if (!result || typeof result !== "object") return null;
  const { data, error } = result as { data?: unknown; error?: unknown };
  if (isStepUpRequired(error)) return stepUpKind(error);
  if (isStepUpRequired(data)) return "fresh";
  const ctx = error && typeof error === "object" ? (error as { context?: unknown }).context : null;
  if (ctx && typeof (ctx as Response).clone === "function") {
    try {
      if (isStepUpRequired(await (ctx as Response).clone().json())) return "fresh";
    } catch {
      /* not JSON — not a step-up refusal */
    }
  }
  return null;
}

export interface OwnerActionOptions {
  level: OwnerActionLevel;
  /** Shown in the MFA prompt, e.g. "Ban this account". */
  reason: string;
  /** Safe to send twice (same result either way). Enables a re-send after MFA. */
  idempotent?: boolean;
}

export async function runOwnerAction<T>(
  opts: OwnerActionOptions,
  fn: () => Promise<T>,
  needOf: (result: T) => StepUpNeed | Promise<StepUpNeed> = stepUpNeedOf,
): Promise<OwnerActionOutcome<T>> {
  if (opts.level === "fresh") {
    const s = await refreshOwnerSession();
    if (!s.freshAal2) {
      if (!(await requestOwnerStepUp(opts.reason))) return { status: "cancelled" };
    }
  }

  let result = await fn();
  let need = await needOf(result);
  if (!need) return { status: "done", result };

  // Routine work refused for a lapsed attestation: restore it once, retry once.
  if (opts.level === "trusted" && need === "trusted" && (await ensureOwnerAuthorized())) {
    result = await fn();
    need = await needOf(result);
    if (!need) return { status: "done", result };
  }

  if (!(await requestOwnerStepUp(opts.reason))) return { status: "cancelled" };
  if (!opts.idempotent) return { status: "verify_then_retry" };
  result = await fn();
  return { status: "done", result };
}

/** Owner-facing copy for an outcome that did not run the action. */
export function ownerActionNotice(outcome: OwnerActionOutcome<unknown>): string | null {
  if (outcome.status === "cancelled") return "Verification cancelled — nothing was changed.";
  if (outcome.status === "verify_then_retry") return "Verified. Nothing was changed yet — run the action again to apply it.";
  return null;
}
