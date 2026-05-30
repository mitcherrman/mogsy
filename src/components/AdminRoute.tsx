import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!user) {
      setStatus("denied");
      return;
    }
    setStatus("checking");
    (async () => {
      for (const role of roles) {
        const { data, error } = await supabase.rpc("has_role", {
          _user_id: user.id,
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
  }, [user, authLoading, roles.join(",")]);

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
