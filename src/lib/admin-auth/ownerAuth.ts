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

/**
 * S1-FIX F3 — a hung owner_auth_state request must not leave Admin blank. After
 * this long the check counts as "could not reach Supabase" ({ ok: false }); the
 * request is aborted and a late reply is ignored (the promise has settled).
 */
export const OWNER_AUTH_STATE_TIMEOUT_MS = 8_000;

type AbortableRpc = PromiseLike<{ data: unknown; error: unknown }> & {
  abortSignal?: (signal: AbortSignal) => PromiseLike<{ data: unknown; error: unknown }>;
};

export async function fetchOwnerAuthStateResult(): Promise<OwnerAuthStateResult> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<OwnerAuthStateResult>((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve({ ok: false });
    }, OWNER_AUTH_STATE_TIMEOUT_MS);
  });
  const request = (async (): Promise<OwnerAuthStateResult> => {
    try {
      const builder = ownerRpc("owner_auth_state") as unknown as AbortableRpc;
      const pending = controller && typeof builder.abortSignal === "function"
        ? builder.abortSignal(controller.signal)
        : builder;
      const { data, error } = await pending;
      if (error) return { ok: false };
      return { ok: true, state: parseOwnerAuthState(data) };
    } catch {
      return { ok: false };
    }
  })();
  try {
    return await Promise.race([request, timedOut]);
  } finally {
    clearTimeout(timer);
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

export type StepUpKind = "trusted" | "fresh" | "unknown";

/**
 * Which assurance the server asked for. `assert_owner` raises with HINT
 * `aal2_or_trusted_device` when only the trusted-session check failed (a lapsed
 * device attestation, recoverable without MFA) and `fresh_aal2` / `aal2` when
 * the action needs MFA. Edge Functions send no hint at all: that is
 * "unknown", and the caller decides from the level the ACTION requires
 * (runOwnerAction) — a routine action tries the trusted device first, a
 * high-risk action still asks for fresh MFA.
 */
export function stepUpKind(err: unknown): StepUpKind {
  const hint = errorField(err, "hint");
  if (hint === "aal2_or_trusted_device") return "trusted";
  if (hint === "fresh_aal2" || hint === "aal2") return "fresh";
  return "unknown";
}
