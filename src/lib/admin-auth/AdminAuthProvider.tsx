// ---------------------------------------------------------------------------
// AdminAuthProvider — admin authorization state for Railway-backed admin
// workspaces (AdminAuthGate).
//
// OWN1.1: layered on the ONE shared owner session (useOwnerAuth) instead of
// running a competing check of its own:
//   - signed out / not the owner / owner needing MFA come straight from the
//     owner session; Railway is not called for anyone but the authorized owner;
//   - for the authorized owner, GET /api/admin/session confirms Railway agrees
//     (and pins the response contract). It runs once per user, on retry /
//     invalidate, and when the owner (re)becomes authorized — NOT on every
//     access-token refresh;
//   - an established authorization is never flipped to "checking" by a
//     background recheck, and a temporary Railway failure keeps it (Railway
//     still authorizes every real API call server-side);
//   - a 403 for the authorized owner re-attests the trusted device and retries
//     ONCE before reporting a denial — no loop;
//   - a malformed success body always fails closed.
// It never infers admin status from frontend attributes; the server decides.
// ---------------------------------------------------------------------------

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useOwnerAuth } from "@/hooks/useOwnerAuth";
import { fetchAdminSession } from "./adminSessionClient";
import type {
  AdminAuthContextValue,
  AdminAuthStatus,
  AdminPrincipal,
  AdminSessionOutcome,
} from "./types";

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const owner = useOwnerAuth();
  const [railway, setRailway] = useState<{ status: AdminAuthStatus; principal: AdminPrincipal | null }>({
    status: "checking",
    principal: null,
  });

  // Bump to force a controlled recheck (retry / invalidate).
  const [retry, setRetry] = useState(0);
  const gen = useRef(0);
  // The user Railway last authorized; keeps that answer through rechecks.
  const establishedFor = useRef<string | null>(null);

  const ownerReady = !owner.loading && owner.phase === "authorized";
  const ownerKey = ownerReady ? owner.userId : null;
  const { ensureAuthorized } = owner;

  useEffect(() => {
    if (!ownerReady) {
      gen.current += 1; // drop any in-flight Railway answer
      establishedFor.current = null;
      setRailway({ status: "checking", principal: null });
      return;
    }
    const myGen = ++gen.current;
    const established = establishedFor.current === ownerKey;
    if (!established) setRailway({ status: "checking", principal: null });

    const ask = (): Promise<AdminSessionOutcome> =>
      fetchAdminSession().catch(() => ({ kind: "unavailable" as const }));

    void (async () => {
      let outcome = await ask();
      if (outcome.kind === "forbidden" && (await ensureAuthorized())) {
        outcome = await ask(); // one retry after re-attesting; never a loop
      }
      if (myGen !== gen.current) return; // superseded

      switch (outcome.kind) {
        case "authorized":
          establishedFor.current = ownerKey;
          setRailway({ status: "authorized", principal: outcome.principal });
          break;
        case "forbidden":
          establishedFor.current = null;
          setRailway({ status: "owner_denied", principal: null });
          break;
        case "unavailable":
          // A blip must not tear down an established owner workspace.
          if (!established) setRailway({ status: "backend_unavailable", principal: null });
          break;
        case "malformed":
          establishedFor.current = null;
          setRailway({ status: "malformed_response", principal: null });
          break;
      }
    })();
  }, [ownerReady, ownerKey, retry, ensureAuthorized]);

  const { recheck: recheckOwner } = owner;
  const recheck = useCallback(() => {
    recheckOwner();
    setRetry((r) => r + 1);
  }, [recheckOwner]);
  const invalidate = recheck;

  let status: AdminAuthStatus;
  if (owner.loading) status = "loading";
  else if (owner.phase === "signed_out") status = "signed_out";
  else if (owner.phase === "non_owner") status = "signed_in_non_admin";
  else if (owner.phase === "needs_mfa") status = "needs_step_up";
  else if (owner.phase === "unavailable") status = "backend_unavailable";
  else status = railway.status;

  const isAuthorized = status === "authorized";

  return (
    <AdminAuthContext.Provider
      value={{
        status,
        principal: isAuthorized ? railway.principal : null,
        isAuthorized,
        recheck,
        invalidate,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
