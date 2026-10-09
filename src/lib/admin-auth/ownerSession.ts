// ---------------------------------------------------------------------------
// OWN1.1 — the one owner-session state the whole frontend reads.
//
// Before OWN1.1 every AdminRoute, the account menu, the bell and each inline
// role check ran its own owner (or legacy role) lookup, and they disagreed.
// This module-level store holds a single answer per signed-in user:
//
//   loading     first check for this user still in flight
//   signed_out  no real (non-anonymous) account
//   non_owner   the server says this account is not the owner
//   needs_mfa   the owner, but this session is neither aal2 nor attested
//   authorized  the owner on an aal2 or trusted-device session
//   unavailable the first check could not reach Supabase
//
// It is UX state only. Every RPC, RLS policy, Edge Function and Railway route
// re-checks the owner server-side; nothing here is sent to or trusted by them.
//
// Stability rules (the brittleness OWN1.1 removes):
//   - a background refresh never drops a proven answer while it runs;
//   - a refresh that cannot reach Supabase keeps the last proven answer
//     (`stale`), it does not demote the owner;
//   - a user change (sign-out, account switch) resets immediately, so an
//     authorization is never carried across accounts;
//   - an owner authorized through a trusted-device attestation (aal1) is
//     re-attested before the server's 15-minute attestation expires, so
//     routine admin use does not fall back to an MFA prompt.
// ---------------------------------------------------------------------------

import { fetchOwnerAuthStateResult, NOT_OWNER, type OwnerAuthState } from "./ownerAuth";
import { attestStoredDevice } from "./ownerDevice";

export type OwnerPhase = "loading" | "signed_out" | "non_owner" | "needs_mfa" | "authorized" | "unavailable";

export interface OwnerSessionSnapshot extends OwnerAuthState {
  userId: string | null;
  phase: OwnerPhase;
  /** A refresh is in flight; `phase` is still the last proven answer. */
  refreshing: boolean;
  /** The last refresh could not reach Supabase; fields are the last proven answer. */
  stale: boolean;
}

/** Server attestations last 15 minutes; renew comfortably before that. */
export const REATTEST_INTERVAL_MS = 10 * 60_000;
const TICK_MS = 60_000;

function base(userId: string | null, phase: OwnerPhase): OwnerSessionSnapshot {
  return { ...NOT_OWNER, userId, phase, refreshing: false, stale: false };
}

function phaseOf(s: OwnerAuthState): OwnerPhase {
  if (!s.isOwner) return "non_owner";
  return s.authorized ? "authorized" : "needs_mfa";
}

let snapshot: OwnerSessionSnapshot = base(null, "loading");
let boundUserId: string | null | undefined = undefined;
let generation = 0;
let inflight: Promise<OwnerSessionSnapshot> | null = null;
let ensureInflight: Promise<boolean> | null = null;
let lastAttestAt = 0;
const listeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;

function set(patch: Partial<OwnerSessionSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const l of listeners) l();
}

export function getOwnerSessionSnapshot(): OwnerSessionSnapshot {
  return snapshot;
}

async function attest(): Promise<boolean> {
  lastAttestAt = Date.now();
  try {
    return await attestStoredDevice();
  } catch {
    return false;
  }
}

/**
 * Re-read owner_auth_state for the bound user. Single-flight: concurrent
 * callers share one request. An owner session that is not authorized tries
 * its stored trusted-device token once before settling on needs_mfa.
 */
export function refreshOwnerSession(): Promise<OwnerSessionSnapshot> {
  if (!snapshot.userId) return Promise.resolve(snapshot);
  if (inflight) return inflight;
  const gen = generation;
  set({ refreshing: true });
  const run = (async () => {
    let r = await fetchOwnerAuthStateResult();
    if (gen === generation && r.ok && r.state.isOwner && !r.state.authorized && (await attest())) {
      r = await fetchOwnerAuthStateResult();
    }
    if (gen !== generation) return snapshot; // superseded by a user change
    if (!r.ok) {
      // Keep the last proven answer; only a first check fails closed.
      set(snapshot.phase === "loading"
        ? { phase: "unavailable", refreshing: false, stale: true }
        : { refreshing: false, stale: true });
    } else {
      set({ ...r.state, phase: phaseOf(r.state), refreshing: false, stale: false });
    }
    return snapshot;
  })();
  inflight = run;
  void run.finally(() => {
    if (inflight === run) inflight = null;
  });
  return run;
}

/**
 * Recover a trusted owner session without MFA: re-present the stored device
 * token, then re-read the server state. Used when a routine admin call is
 * refused because an attestation lapsed. Resolves true only if the server now
 * says authorized. Single-flight, never loops: callers retry at most once.
 */
export function ensureOwnerAuthorized(): Promise<boolean> {
  if (!snapshot.userId) return Promise.resolve(false);
  if (ensureInflight) return ensureInflight;
  const gen = generation;
  const run = (async () => {
    if (inflight) await inflight;
    if (gen !== generation) return false;
    await attest();
    if (gen !== generation) return false;
    const s = await refreshOwnerSession();
    return gen === generation && s.phase === "authorized";
  })();
  ensureInflight = run;
  void run.finally(() => {
    if (ensureInflight === run) ensureInflight = null;
  });
  return run;
}

/** Keep an attestation-backed (aal1) owner session from lapsing. */
function keepAlive() {
  if (snapshot.phase !== "authorized" || snapshot.aal === "aal2") return;
  if (Date.now() - lastAttestAt < REATTEST_INTERVAL_MS) return;
  void ensureOwnerAuthorized();
}

function onVisible() {
  if (typeof document === "undefined" || document.visibilityState === "visible") keepAlive();
}

/**
 * Point the store at the current Supabase user (null when signed out or
 * anonymous). A different user resets the state before anything else can
 * read it; the same user is a no-op, so token refreshes cost nothing.
 */
export function bindOwnerSessionUser(userId: string | null) {
  if (userId === boundUserId) return;
  boundUserId = userId;
  generation += 1;
  inflight = null;
  ensureInflight = null;
  lastAttestAt = 0;
  snapshot = userId ? base(userId, "loading") : base(null, "signed_out");
  for (const l of listeners) l();
  if (userId) void refreshOwnerSession();
}

export function subscribeOwnerSession(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    tickTimer = setInterval(keepAlive, TICK_MS);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    if (typeof window !== "undefined") window.addEventListener("focus", onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (tickTimer) clearInterval(tickTimer);
      tickTimer = null;
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
      if (typeof window !== "undefined") window.removeEventListener("focus", onVisible);
      // Nobody is reading: forget the answer rather than keep an unwatched
      // authorization around. In the app AdminAuthProvider (mounted around
      // the whole router) keeps one subscriber for the life of the page.
      reset();
    }
  };
}

function reset() {
  boundUserId = undefined;
  generation += 1;
  inflight = null;
  ensureInflight = null;
  lastAttestAt = 0;
  snapshot = base(null, "loading");
}

/** Test seam: forget everything (module state survives between tests). */
export function __resetOwnerSessionForTests() {
  reset();
}

/** Test seam: run the keep-alive check now. */
export function __ownerKeepAliveForTests() {
  keepAlive();
}
