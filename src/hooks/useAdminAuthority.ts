// ---------------------------------------------------------------------------
// useAdminAuthority — "is the current viewer a staff admin?", answered by the
// server.
//
// THE SAME CALL `AdminRoute` MAKES. `has_role` is a SECURITY DEFINER RPC in
// Supabase: the answer is computed server-side from `user_roles` and cannot be
// produced by a client that simply asks nicely, which is why it — and not a
// local flag, a query parameter, or a profile column — is what an
// admin-restricted BEHAVIOUR must be gated on.
//
// This hook grants nothing. It reports. It exists because there is one thing
// in the product that is admin-only without being a whole admin ROUTE (the
// Ranked Tutorial's admin replay), and gating that on anything weaker than the
// gate every admin page already uses would be inventing a second, softer
// notion of "admin".
//
// It fails CLOSED: a loading state, a signed-out viewer, an RPC error and a
// negative answer all read `isAdmin: false`.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getE2EIdentity } from "@/lib/e2e/identity";

/** The roles that count as staff admin, in the order AdminRoute checks them. */
const ADMIN_ROLES = ["admin", "master_admin"] as const;

export interface AdminAuthorityState {
  /** True until the server has answered. Never treat as authorized. */
  loading: boolean;
  /** Server-confirmed staff admin. */
  isAdmin: boolean;
}

export function useAdminAuthority(): AdminAuthorityState {
  const { user, loading: authLoading } = useAuth();
  // Gate on the STABLE user id, not the user object: Supabase emits a fresh
  // user object on window focus and token refresh, and depending on its
  // identity would re-run this check on every one of them.
  const userId = user?.id ?? null;
  const [state, setState] = useState<AdminAuthorityState>({
    loading: true, isAdmin: false,
  });

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!userId) {
      setState({ loading: false, isAdmin: false });
      return;
    }
    // E2E acceptance override (dev-only, VITE_E2E_AUTH gated) — the same one
    // AdminRoute honours, so an acceptance run sees one consistent answer.
    const e2e = getE2EIdentity();
    if (e2e && e2e.admin && e2e.user.id === userId) {
      setState({ loading: false, isAdmin: true });
      return;
    }
    setState({ loading: true, isAdmin: false });
    void (async () => {
      for (const role of ADMIN_ROLES) {
        const { data, error } = await supabase.rpc("has_role", {
          _user_id: userId,
          _role: role,
        });
        if (cancelled) return;
        if (!error && data === true) {
          setState({ loading: false, isAdmin: true });
          return;
        }
      }
      if (!cancelled) setState({ loading: false, isAdmin: false });
    })();
    return () => { cancelled = true; };
  }, [userId, authLoading]);

  return state;
}
