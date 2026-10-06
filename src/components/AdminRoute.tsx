import { Navigate } from "react-router-dom";
import { useOwnerAuth } from "@/hooks/useOwnerAuth";
import { OwnerStepUp } from "@/components/admin/OwnerStepUp";

interface AdminRouteProps {
  children: React.ReactNode;
}

/**
 * OWN1 — owner-only gate. There is exactly one privileged account; the server
 * (`owner_auth_state`) decides. Non-owners are redirected; the owner on an
 * unknown device is asked for MFA before anything mounts. This gate is UX —
 * every admin RPC/RLS/Edge Function enforces the same rule server-side.
 */
export default function AdminRoute({ children }: AdminRouteProps) {
  const owner = useOwnerAuth();

  if (owner.loading) {
    return <div aria-hidden className="min-h-[50vh]" />;
  }
  if (!owner.isOwner) {
    return <Navigate to="/" replace />;
  }
  if (!owner.authorized) {
    return <OwnerStepUp onVerified={owner.recheck} />;
  }
  return <>{children}</>;
}
