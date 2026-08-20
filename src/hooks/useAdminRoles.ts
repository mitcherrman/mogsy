// ---------------------------------------------------------------------------
// useAdminRoles — the viewer's Supabase roles, read exactly the way the legacy
// admin pages already read them.
//
// AUTHORIZATION: this hook grants nothing and checks nothing. It performs the
// SAME `user_roles` select that src/pages/Admin.tsx and src/pages/Moderator.tsx
// already perform, so navigation can avoid advertising a destination the
// viewer cannot use. Route access stays with <AdminRoute>, backend access with
// require_admin, and data access with RLS — none of which this touches.
//
// It deliberately does NOT redirect on failure: <AdminRoute> already decided
// whether the page may render. A failed read here degrades to "not master",
// which hides master-only panels — the conservative direction.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface AdminRoleState {
  loading: boolean;
  roles: string[];
  isAdmin: boolean;
  isMasterAdmin: boolean;
  isModerator: boolean;
}

const EMPTY: AdminRoleState = {
  loading: true,
  roles: [],
  isAdmin: false,
  isMasterAdmin: false,
  isModerator: false,
};

export function useAdminRoles(): AdminRoleState {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<AdminRoleState>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!userId) {
      setState({ ...EMPTY, loading: false });
      return;
    }
    void (async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (cancelled) return;
      if (error || !data) {
        // Fail closed on the master tier: hide master-only panels rather than
        // guess. The route gate has already run, so this cannot grant access.
        setState({ ...EMPTY, loading: false });
        return;
      }
      const roles = data.map((r) => String((r as { role: unknown }).role));
      setState({
        loading: false,
        roles,
        isAdmin: roles.includes("admin") || roles.includes("master_admin"),
        isMasterAdmin: roles.includes("master_admin"),
        isModerator: roles.includes("moderator"),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, authLoading]);

  return state;
}
