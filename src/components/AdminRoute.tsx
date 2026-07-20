import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getE2EIdentity } from "@/lib/e2e/identity";

type Role = "admin" | "master_admin" | "moderator";

interface AdminRouteProps {
  children: React.ReactNode;
  /** Allowed roles. Defaults to admin + master_admin. */
  roles?: Role[];
}

/**
 * Gate that blocks rendering until the server confirms the current user holds
 * one of the allowed roles via the `has_role` security-definer RPC. This
 * prevents the admin UI from briefly mounting for non-privileged users who
 * might tamper with client-side checks.
 */
export default function AdminRoute({ children, roles = ["admin", "master_admin"] }: AdminRouteProps) {
  const { user, loading: authLoading } = useAuth();
  // Gate on the STABLE user id, not the user object. Supabase emits
  // onAuthStateChange with a fresh user object on window focus / token refresh;
  // depending on the object identity re-ran this effect, flashed the "checking"
  // fallback, and remounted the admin subtree — wiping unsaved admin state
  // (selected event, form inputs). Keying the check on the id means a benign
  // same-user refresh is a no-op and children stay mounted.
  const userId = user?.id ?? null;
  const roleKey = roles.join(",");
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!userId) {
      setStatus("denied");
      return;
    }
    // E2E acceptance override (dev-only, VITE_E2E_AUTH gated): the designated
    // admin persona is authorized without the has_role RPC (no real Supabase).
    const e2e = getE2EIdentity();
    if (e2e && e2e.admin && e2e.user.id === userId) {
      setStatus("allowed");
      return;
    }
    setStatus("checking");
    (async () => {
      for (const role of roles) {
        const { data, error } = await supabase.rpc("has_role", {
          _user_id: userId,
          _role: role,
        });
        if (cancelled) return;
        if (!error && data === true) {
          setStatus("allowed");
          return;
        }
      }
      if (!cancelled) setStatus("denied");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, authLoading, roleKey]);

  if (authLoading || status === "checking") {
    // Layout chrome (navbar/background) is already mounted around us — keep
    // the fallback minimal so we don't repaint the whole viewport and cause a
    // flash between navigations.
    return <div aria-hidden className="min-h-[50vh]" />;
  }
  if (status === "denied") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
