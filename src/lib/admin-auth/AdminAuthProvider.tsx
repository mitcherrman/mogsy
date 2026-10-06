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

  const gen = useRef(0);
  const realUserId = user && !user.is_anonymous ? user.id : null;
  const accessToken = session?.access_token ?? null;

  useEffect(() => {
    const myGen = ++gen.current;

    const run = async () => {
      if (authLoading) {
        setStatus("loading");
        return;
      }
      if (!realUserId) {
        setPrincipal(null);
        setStatus("signed_out");
        return;
      }
      // A real account with no live token means the Supabase
      // session expired. Supabase already auto-refreshes; a missing token here
      // is a genuine expiry — one recheck cycle, no loop.
      if (realUserId && !accessToken) {
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
          setStatus("authorized");
          break;
        case "forbidden":
          setPrincipal(null);
          setStatus("signed_in_non_admin");
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
  }, [authLoading, realUserId, accessToken, retry]);

  const recheck = useCallback(() => setRetry((r) => r + 1), []);
  const invalidate = useCallback(() => setRetry((r) => r + 1), []);
  const isAuthorized = status === "authorized";

  return (
    <AdminAuthContext.Provider
      value={{
        status,
        principal,
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
