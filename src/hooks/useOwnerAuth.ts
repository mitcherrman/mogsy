// OWN1 — React state for the server-side owner check. Gate on the stable user
// id (not the user object) so benign token refreshes don't remount admin UI.
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getE2EIdentity } from "@/lib/e2e/identity";
import { fetchOwnerAuthState, NOT_OWNER, type OwnerAuthState } from "@/lib/admin-auth/ownerAuth";
import { attestStoredDevice } from "@/lib/admin-auth/ownerDevice";

export interface OwnerAuthHookState extends OwnerAuthState {
  loading: boolean;
  recheck: () => void;
}

export function useOwnerAuth(): OwnerAuthHookState {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<OwnerAuthState>(NOT_OWNER);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const recheck = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!userId) {
      setState(NOT_OWNER);
      setLoading(false);
      return;
    }
    // Dev/E2E only: statically removed from production bundles (DEV=false).
    // The backend never honours this — it only lets the local harness render.
    if (import.meta.env.DEV) {
      const e2e = getE2EIdentity();
      if (e2e && e2e.admin && e2e.user.id === userId) {
        setState({ isOwner: true, authorized: true, aal: "aal2", trustedDevice: false, freshAal2: true });
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    void (async () => {
      let s = await fetchOwnerAuthState();
      if (s.isOwner && !s.authorized && (await attestStoredDevice())) {
        s = await fetchOwnerAuthState();
      }
      if (cancelled) return;
      setState(s);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, authLoading, nonce]);

  return { ...state, loading: loading || authLoading, recheck };
}
