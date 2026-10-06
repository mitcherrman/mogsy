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

export async function fetchOwnerAuthState(): Promise<OwnerAuthState> {
  try {
    const { data, error } = await ownerRpc("owner_auth_state");
    if (error) return NOT_OWNER;
    return parseOwnerAuthState(data);
  } catch {
    return NOT_OWNER;
  }
}

/** True when a backend error is the server asking for MFA step-up. */
export function isStepUpRequired(err: unknown): boolean {
  const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err ?? "");
  return /step_up_required/.test(msg);
}
