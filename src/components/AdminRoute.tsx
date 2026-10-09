import { Navigate } from "react-router-dom";
import { ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/button";
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
 *
 * OWN1.1: reads the one shared owner session, so nested AdminRoutes cost no
 * extra checks, and a background refresh / token refresh / re-attestation
 * never unmounts an authorized admin page. Only a proven change (sign-out,
 * account switch, the server saying "not authorized") changes what renders.
 */
export default function AdminRoute({ children }: AdminRouteProps) {
  const owner = useOwnerAuth();

  if (owner.loading) {
    return <div aria-hidden className="min-h-[50vh]" />;
  }
  if (owner.phase === "unavailable") {
    // Supabase could not be reached on the first check: neither "not the
    // owner" (no redirect) nor authorized (nothing mounts).
    return (
      <div className="flex flex-1 items-center justify-center p-6" data-testid="owner-unavailable">
        <div className="w-full max-w-sm space-y-3 rounded-lg border border-border bg-muted/20 p-5">
          <div className="flex items-center gap-2">
            <ServerCrash className="h-4 w-4 text-amber-400" aria-hidden />
            <h2 className="text-sm font-semibold">Couldn&apos;t check admin access</h2>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            The account service didn&apos;t respond. This isn&apos;t a permissions answer — try again in a moment.
          </p>
          <Button size="sm" className="w-full" onClick={owner.recheck}>Retry</Button>
        </div>
      </div>
    );
  }
  if (!owner.isOwner) {
    return <Navigate to="/" replace />;
  }
  if (!owner.authorized) {
    return <OwnerStepUp onVerified={owner.recheck} />;
  }
  return <>{children}</>;
}
