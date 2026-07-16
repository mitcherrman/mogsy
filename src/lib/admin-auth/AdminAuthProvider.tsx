// ---------------------------------------------------------------------------
// AdminAuthProvider — the single source of account-bound admin authorization
// state for the whole admin surface. One provider, one shared check; tabs and
// pages read it instead of each prompting for a key.
//
// It never infers admin status from frontend attributes (is_pro, metadata,
// role flags, user id comparisons). The backend GET /api/admin/session is the
// only authority. It rechecks on Supabase auth changes (sign-in/out, account
// switch, token refresh), on explicit fallback set/clear, and on explicit
// retry/invalidate — with a generation guard so stale results never win and no
// uncontrolled loop can form.
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
import { useAuth } from "@/hooks/useAuth";
import { fetchAdminSession } from "./adminSessionClient";
import {
  activateFallbackKey,
  clearFallbackKey,
  isFallbackActive,
  subscribeAdminCredential,
} from "./adminCredentials";
import type {
  AdminAuthContextValue,
  AdminAuthStatus,
  AdminPrincipal,
} from "./types";

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const { user, session, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<AdminAuthStatus>("loading");
  const [principal, setPrincipal] = useState<AdminPrincipal | null>(null);

  // Bump to force a controlled recheck (retry / invalidate).
  const [retry, setRetry] = useState(0);
  // Bump when the explicit fallback key is set or cleared (any tab).
  const [fallbackVersion, setFallbackVersion] = useState(0);
  useEffect(
    () => subscribeAdminCredential(() => setFallbackVersion((v) => v + 1)),
    [],
  );

  const gen = useRef(0);
  const realUserId = user && !user.is_anonymous ? user.id : null;
  const accessToken = session?.access_token ?? null;

  useEffect(() => {
    const myGen = ++gen.current;
    const fallback = isFallbackActive();

    const run = async () => {
      if (authLoading) {
        setStatus("loading");
        return;
      }
      if (!realUserId && !fallback) {
        setPrincipal(null);
        setStatus("signed_out");
        return;
      }
      // A real account with no live token (and no fallback) means the Supabase
      // session expired. Supabase already auto-refreshes; a missing token here
      // is a genuine expiry — one recheck cycle, no loop.
      if (realUserId && !accessToken && !fallback) {
        setPrincipal(null);
        setStatus("expired_session");
        return;
      }

      setStatus("checking");
      const outcome = await fetchAdminSession().catch(() => ({ kind: "unavailable" as const }));
      if (myGen !== gen.current) return; // superseded

      switch (outcome.kind) {
        case "authorized":
          setPrincipal(outcome.principal);
          setStatus(
            outcome.principal.authMethod === "admin_key"
              ? "authorized_via_fallback"
              : "authorized",
          );
          break;
        case "forbidden":
          setPrincipal(null);
          // A fallback key that was rejected is a distinct state; otherwise a
          // real signed-in account simply isn't allowlisted.
          setStatus(fallback ? "fallback_rejected" : "signed_in_non_admin");
          break;
        case "unavailable":
          setStatus("backend_unavailable");
          break;
        case "malformed":
          setStatus("malformed_response");
          break;
      }
    };

    void run();
    // realUserId / accessToken change on sign-in/out, account switch, refresh.
  }, [authLoading, realUserId, accessToken, fallbackVersion, retry]);

  const recheck = useCallback(() => setRetry((r) => r + 1), []);
  const invalidate = useCallback(() => setRetry((r) => r + 1), []);
  const applyFallbackKey = useCallback((key: string) => {
    activateFallbackKey(key); // fires the credential event → fallbackVersion bump
  }, []);
  const clearFallback = useCallback(() => {
    clearFallbackKey();
  }, []);

  const isAuthorized = status === "authorized" || status === "authorized_via_fallback";

  return (
    <AdminAuthContext.Provider
      value={{
        status,
        principal,
        isAuthorized,
        fallbackActive: status === "authorized_via_fallback",
        recheck,
        applyFallbackKey,
        clearFallback,
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
