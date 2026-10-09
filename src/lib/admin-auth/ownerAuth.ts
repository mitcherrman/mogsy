// ---------------------------------------------------------------------------
// OWN1 — owner authorization client.
//
// The ONLY admin authority is the server: `owner_auth_state()` (SECURITY
// DEFINER) compares auth.uid() with private.owner_config and reads the JWT
// assurance level / trusted-device attestation. Nothing here is trusted by the
// backend; the frontend only uses the answer to choose what to render.
// Fails CLOSED: errors, missing RPC, and malformed answers are "not authorized".
// ---------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";

export interface OwnerAuthState {
  isOwner: boolean;
  authorized: boolean;
  aal: "aal1" | "aal2" | null;
  trustedDevice: boolean;
  freshAal2: boolean;
}

export const NOT_OWNER: OwnerAuthState = {
  isOwner: false, authorized: false, aal: null, trustedDevice: false, freshAal2: false,
};

/** Strictly parse the RPC payload; anything unexpected → NOT_OWNER. */
export function parseOwnerAuthState(raw: unknown): OwnerAuthState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NOT_OWNER;
  const r = raw as Record<string, unknown>;
  if (r.is_owner !== true) return NOT_OWNER;
  const aal = r.aal === "aal2" ? "aal2" : r.aal === "aal1" ? "aal1" : null;
  return {
    isOwner: true,
    authorized: r.authorized === true,
    aal,
    trustedDevice: r.trusted_device === true,
    freshAal2: r.fresh_aal2 === true && aal === "aal2",
  };
}

// The generated DB types predate OWN1's RPCs; narrow, typed escape hatch.
type LooseRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
export const ownerRpc: LooseRpc = (fn, args) =>
  (supabase.rpc as unknown as LooseRpc)(fn, args);

/**
 * OWN1.1 — one owner_auth_state() read that keeps "the server answered no"
 * apart from "the server could not be reached". An established owner session
 * must not be erased over a network blip; a first check that fails is still
 * not authorized.
 */
export type OwnerAuthStateResult = { ok: true; state: OwnerAuthState } | { ok: false };

export async function fetchOwnerAuthStateResult(): Promise<OwnerAuthStateResult> {
  try {
    const { data, error } = await ownerRpc("owner_auth_state");
    if (error) return { ok: false };
    return { ok: true, state: parseOwnerAuthState(data) };
  } catch {
    return { ok: false };
  }
}

export async function fetchOwnerAuthState(): Promise<OwnerAuthState> {
  const r = await fetchOwnerAuthStateResult();
  return r.ok ? r.state : NOT_OWNER;
}

function errorField(err: unknown, key: "message" | "hint" | "error"): string {
  if (!err || typeof err !== "object" || !(key in err)) return "";
  const v = (err as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

/** True when a backend error is the server asking for MFA step-up. */
export function isStepUpRequired(err: unknown): boolean {
  if (typeof err === "string") return /step_up_required/.test(err);
  return /step_up_required/.test(`${errorField(err, "message")} ${errorField(err, "error")}`);
}

/**
 * Which assurance the server asked for. `assert_owner` raises with HINT
 * `aal2_or_trusted_device` when only the trusted-session check failed (a lapsed
 * device attestation, recoverable without MFA); `fresh_aal2` / `aal2`, or no
 * hint at all (Edge Functions), means the action needs a recent MFA. Unknown
 * reads as "fresh", the stricter answer.
 */
export function stepUpKind(err: unknown): "trusted" | "fresh" {
  return errorField(err, "hint") === "aal2_or_trusted_device" ? "trusted" : "fresh";
}
