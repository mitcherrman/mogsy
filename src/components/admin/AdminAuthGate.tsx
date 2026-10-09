// ---------------------------------------------------------------------------
// AdminAuthGate — the shared account-bound authorization gate for backend
// admin workspaces. Renders children ONLY when the centralized AdminAuth state
// is authorized; otherwise it shows the correct, distinct affordance
// (sign-in / non-admin / expired / backend-unavailable / malformed)
// instead of a raw admin-key prompt. Protected children never mount before
// authorization.
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import { authHref } from "@/lib/auth/auth-destination";
import { Link, useLocation } from "react-router-dom";
import { Loader2, AlertTriangle, LogIn, ShieldAlert, ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/lib/admin-auth/AdminAuthProvider";
import { useAuth } from "@/hooks/useAuth";
import { OwnerStepUp } from "@/components/admin/OwnerStepUp";

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6" data-testid="admin-auth-gate">
      <div className="w-full max-w-sm space-y-3 rounded-lg border border-border bg-muted/20 p-5">
        {children}
      </div>
    </div>
  );
}

export function AdminAuthGate({ children }: { children: ReactNode }) {
  const { status, recheck } = useAdminAuth();
  const { signOut } = useAuth();
  const location = useLocation();
  // AUTH1: every "sign in" out of this gate returns to the admin page that was
  // blocked, rather than dropping the operator on the public hub.
  const signInHref = authHref(`${location.pathname}${location.search}`);

  // OWN1: authorized only via the account bearer. There is no admin-key path.
  if (status === "authorized") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    );
  }

  if (status === "loading" || status === "checking") {
    return (
      <Centered>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-label="Checking admin access" />
          Checking admin access…
        </div>
      </Centered>
    );
  }

  if (status === "signed_out") {
    return (
      <>
        <Centered>
          <div className="flex items-center gap-2">
            <LogIn className="h-4 w-4 text-primary" aria-hidden />
            <h2 className="text-sm font-semibold">Sign in required</h2>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Sign in to your Mogsy account to access the admin workspace. Your account session
            authorizes admin pages automatically — no admin key needed.
          </p>
          <Button asChild size="sm" className="w-full">
            <Link to={signInHref}>Sign in</Link>
          </Button>
        </Centered>
      </>
    );
  }

  if (status === "signed_in_non_admin") {
    return (
      <>
        <Centered>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-400" aria-hidden />
            <h2 className="text-sm font-semibold">No admin access</h2>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            You&apos;re signed in, but this account isn&apos;t authorized for the admin workspace.
            Your password is fine — admin access belongs to the owner account only.
          </p>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline" className="flex-1">
              <Link to={signInHref}>Switch account</Link>
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </Centered>
      </>
    );
  }

  // OWN1.1: the owner on a session that needs MFA or device trust gets the
  // step-up right here instead of a dead end.
  if (status === "needs_step_up") {
    return <OwnerStepUp onVerified={recheck} />;
  }

  if (status === "owner_denied") {
    return (
      <Centered>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-400" aria-hidden />
          <h2 className="text-sm font-semibold">Admin backend refused this session</h2>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Your owner session is verified, but the admin backend did not accept it, even after
          refreshing this device&apos;s trust. Retry; if it persists, the backend&apos;s owner
          configuration needs checking.
        </p>
        <Button size="sm" className="w-full" data-testid="admin-auth-retry" onClick={recheck}>
          Retry
        </Button>
      </Centered>
    );
  }

  if (status === "expired_session") {
    return (
      <Centered>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" aria-hidden />
          <h2 className="text-sm font-semibold">Session expired</h2>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Your session expired. Sign in again to continue.
        </p>
        <Button asChild size="sm" className="w-full">
          <Link to={signInHref}>Sign in again</Link>
        </Button>
        <Button size="sm" variant="ghost" className="w-full text-xs" onClick={recheck}>
          Retry
        </Button>
      </Centered>
    );
  }

  if (status === "backend_unavailable") {
    return (
      <Centered>
        <div className="flex items-center gap-2">
          <ServerCrash className="h-4 w-4 text-amber-400" aria-hidden />
          <h2 className="text-sm font-semibold">Admin backend unavailable</h2>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Couldn&apos;t reach the admin backend. You&apos;re still signed in — this isn&apos;t a
          permissions problem. Try again in a moment.
        </p>
        <Button size="sm" className="w-full" data-testid="admin-auth-retry" onClick={recheck}>
          Retry
        </Button>
      </Centered>
    );
  }

  if (status === "malformed_response") {
    return (
      <Centered>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
          <h2 className="text-sm font-semibold">Unexpected response</h2>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          The admin backend returned something this page couldn&apos;t read. Access is blocked until
          it responds correctly.
        </p>
        <Button size="sm" className="w-full" onClick={recheck}>
          Retry
        </Button>
      </Centered>
    );
  }

  // Unknown status: fail closed.
  return (
    <Centered>
      <p className="text-xs text-muted-foreground">Admin access unavailable.</p>
      <Button size="sm" className="w-full" onClick={recheck}>Retry</Button>
    </Centered>
  );
}
