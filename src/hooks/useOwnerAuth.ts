// OWN1 — React view of the server-side owner check.
//
// OWN1.1: every caller reads ONE shared owner session (lib/admin-auth/
// ownerSession), bound to the stable user id, so token refreshes, background
// rechecks and re-attestation never remount admin UI, and the account menu,
// the bell, AdminRoute and the Railway gate can no longer disagree.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getE2EIdentity } from "@/lib/e2e/identity";
import { NOT_OWNER, type OwnerAuthState } from "@/lib/admin-auth/ownerAuth";
import {
  bindOwnerSessionUser,
  ensureOwnerAuthorized,
  getOwnerSessionSnapshot,
  refreshOwnerSession,
  subscribeOwnerSession,
  type OwnerPhase,
} from "@/lib/admin-auth/ownerSession";

export interface OwnerAuthHookState extends OwnerAuthState {
  /** The real (non-anonymous) account this answer is about. */
  userId: string | null;
  /** True only until the FIRST answer for this user; background refreshes keep it false. */
  loading: boolean;
  phase: OwnerPhase;
  /** The last refresh could not reach Supabase; values are the last proven answer. */
  stale: boolean;
  recheck: () => void;
  /** Re-attest the trusted device and re-read; true when authorized again. */
  ensureAuthorized: () => Promise<boolean>;
}

export function useOwnerAuth(): OwnerAuthHookState {
  const { user, loading: authLoading } = useAuth();
  // Anonymous sessions are never the owner; don't ask the server about them.
  const userId = user && !user.is_anonymous ? user.id : null;
  const snap = useSyncExternalStore(subscribeOwnerSession, getOwnerSessionSnapshot, getOwnerSessionSnapshot);

  useEffect(() => {
    if (!authLoading) bindOwnerSessionUser(userId);
  }, [userId, authLoading]);

  const recheck = useCallback(() => {
    void refreshOwnerSession();
  }, []);

  // Dev/E2E only: statically removed from production bundles (DEV=false).
  // The backend never honours this — it only lets the local harness render.
  if (import.meta.env.DEV) {
    const e2e = getE2EIdentity();
    if (e2e && e2e.admin && userId && e2e.user.id === userId) {
      return {
        userId, isOwner: true, authorized: true, aal: "aal2", trustedDevice: false, freshAal2: true,
        loading: false, phase: "authorized", stale: false, recheck, ensureAuthorized: async () => true,
      };
    }
  }

  // Until the store has caught up with THIS render's user, report nothing:
  // a previous account's answer must never leak into the next one.
  const current = !authLoading && snap.userId === userId && snap.phase !== "loading";
  if (!current) {
    return {
      ...NOT_OWNER, userId, loading: true, phase: "loading", stale: false, recheck, ensureAuthorized: ensureOwnerAuthorized,
    };
  }
  return {
    userId,
    isOwner: snap.isOwner,
    authorized: snap.authorized,
    aal: snap.aal,
    trustedDevice: snap.trustedDevice,
    freshAal2: snap.freshAal2,
    loading: false,
    phase: snap.phase,
    stale: snap.stale,
    recheck,
    ensureAuthorized: ensureOwnerAuthorized,
  };
}
