// ---------------------------------------------------------------------------
// AdminAuthGate — the shared account-bound authorization gate for backend
// admin workspaces. Renders children ONLY when the centralized AdminAuth state
// is authorized; otherwise it shows the correct, distinct affordance
// (sign-in / non-admin / expired / backend-unavailable / malformed / fallback)
// instead of a raw admin-key prompt. Protected children never mount before
// authorization.
// ---------------------------------------------------------------------------

import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Loader2, AlertTriangle, LogIn, ShieldAlert, ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAdminAuth } from "@/lib/admin-auth/AdminAuthProvider";
import { useAuth } from "@/hooks/useAuth";

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6" data-testid="admin-auth-gate">
      <div className="w-full max-w-sm space-y-3 rounded-lg border border-border bg-muted/20 p-5">
        {children}
      </div>
    </div>
  );
}

function FallbackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="w-full gap-1 text-xs"
      data-testid="admin-auth-open-fallback"
      onClick={onClick}
    >
      <KeyRound className="h-3.5 w-3.5" aria-hidden /> Use admin key fallback
    </Button>
  );
}

export function AdminAuthGate({ children }: { children: ReactNode }) {
  const { status, fallbackActive, recheck, applyFallbackKey, clearFallback } = useAdminAuth();
  const { signOut } = useAuth();
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [keyValue, setKeyValue] = useState("");

  const submitFallback = () => {
    const v = keyValue.trim();
    if (!v) return;
    applyFallbackKey(v);
    setKeyValue("");
    setFallbackOpen(false);
  };

  const fallbackDialog = (
    <Dialog open={fallbackOpen} onOpenChange={(o) => !o && setFallbackOpen(false)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Use admin key fallback</DialogTitle>
          <DialogDescription className="text-xs">
            For bootstrap, emergency, or development access. The account sign-in above is the normal
            path — this key is session-scoped and never stored in localStorage.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="admin-fallback-key" className="text-xs">
            X-Admin-Key
          </Label>
          <Input
            id="admin-fallback-key"
            data-testid="admin-auth-fallback-input"
            type="password"
            autoComplete="off"
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitFallback()}
            placeholder="admin key"
          />
        </div>
        <DialogFooter>
          <Button size="sm" variant="ghost" className="text-xs" onClick={() => setFallbackOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="text-xs"
            data-testid="admin-auth-fallback-submit"
            disabled={!keyValue.trim()}
            onClick={submitFallback}
          >
            Use key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Authorized: render the workspace. A fallback banner appears only when the
  // active authorization is the explicit key (never shows the key itself).
  if (status === "authorized" || status === "authorized_via_fallback") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {fallbackActive && (
          <div
            className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-400/30 bg-amber-400/5 px-4 py-1.5 text-[11px] text-amber-300"
            data-testid="admin-auth-fallback-banner"
          >
            <span>Admin-key fallback access is active.</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px]"
              data-testid="admin-auth-clear-fallback"
              onClick={clearFallback}
            >
              Clear fallback
            </Button>
          </div>
        )}
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
            <Link to="/auth">Sign in</Link>
          </Button>
          <FallbackButton onClick={() => setFallbackOpen(true)} />
        </Centered>
        {fallbackDialog}
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
            Your password is fine — this account simply isn&apos;t on the admin allowlist.
          </p>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline" className="flex-1">
              <Link to="/auth">Switch account</Link>
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
          <FallbackButton onClick={() => setFallbackOpen(true)} />
        </Centered>
        {fallbackDialog}
      </>
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
          <Link to="/auth">Sign in again</Link>
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

  // fallback_rejected
  return (
    <>
      <Centered>
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-destructive" aria-hidden />
          <h2 className="text-sm font-semibold">Admin key rejected</h2>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          The admin key you entered wasn&apos;t accepted. Enter a different key, or clear it and sign
          in with an authorized account.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => setFallbackOpen(true)}>
            Re-enter key
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            data-testid="admin-auth-clear-fallback"
            onClick={clearFallback}
          >
            Clear key
          </Button>
        </div>
      </Centered>
      {fallbackDialog}
    </>
  );
}
