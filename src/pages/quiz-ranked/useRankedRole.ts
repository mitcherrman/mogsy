/**
 * Ranked League role controller (R1).
 *
 * Owns exactly one piece of state — the account's own role preference — read
 * from and written through the backend, which stays the authority on when a
 * change is legal. Nothing here caches a role locally across sessions, infers
 * one from a class, or decides eligibility itself.
 *
 * Availability is a first-class outcome. A backend that predates R1 has no
 * `/api/ranked/role` at all, and this hook reports `available: false` for that
 * case rather than failing the page: the caller then falls back to the legacy
 * class path, which is the only behaviour that still lets those players queue.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "@/lib/ranked-public/client";
import { RankedApiError } from "@/lib/ranked-public/client";
import type { RankedRole } from "@/lib/ranked-public/roles";

export type RoleLoadState = "loading" | "ready" | "unavailable";

export interface RoleController {
  loadState: RoleLoadState;
  /** The account's current role; null means "never chosen" (a normal state). */
  role: RankedRole | null;
  saving: boolean;
  error: string | null;
  /** Persist a role. Resolves true only when the SERVER accepted it. */
  selectRole: (role: RankedRole) => Promise<boolean>;
  clearError: () => void;
}

/** Player-facing copy for the conflicts the backend can reject a change with.
 * Unknown codes fall through to the backend's own message. */
const SET_ERRORS: Record<string, string> = {
  RANKED_ACTIVE_MATCH_EXISTS: "Finish your active match before changing your role.",
  RANKED_ALREADY_QUEUED: "Leave the queue before changing your role.",
  RANKED_INVALID_ROLE: "That isn't a role this client knows. Reload and try again.",
};

/**
 * A failed READ that means "no role identity here", as opposed to a
 * transient failure worth telling the player about.
 *
 *  - 404/405 — the shape an older deployment answers with;
 *  - 401/403 and the auth/eligibility codes — a guest or a not-yet-eligible
 *    account, which is an ordinary state on a hub page, not a fault.
 *
 * Everything else (network, 5xx, rate limit) keeps its message so the caller
 * can surface it.
 */
function readMeansUnavailable(e: unknown): boolean {
  if (!(e instanceof RankedApiError)) return false;
  if (e.status === 404 || e.status === 405 || e.status === 401 || e.status === 403) return true;
  return e.code === "FEATURE_DISABLED" || e.code === "AUTH_REQUIRED"
    || e.code === "ACCOUNT_REQUIRED" || e.code === "RANKED_QUEUE_NOT_ELIGIBLE";
}

export function useRankedRole(): RoleController {
  const [loadState, setLoadState] = useState<RoleLoadState>("loading");
  const [role, setRole] = useState<RankedRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const snapshot = await api.getRankedRole(controller.signal);
        if (cancelled) return;
        setRole(snapshot.role);
        setLoadState("ready");
      } catch (e) {
        if (cancelled || api.isAborted(e)) return;
        // Unavailable and merely-failed both land the caller on the legacy
        // path; only the message differs, and a read failure is not worth
        // blocking the queue over.
        setLoadState("unavailable");
        if (!readMeansUnavailable(e)) {
          setError(e instanceof Error ? e.message : "could not read your role");
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const selectRole = useCallback(async (next: RankedRole): Promise<boolean> => {
    if (savingRef.current) return false;   // double-activation safe
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const snapshot = await api.setRankedRole(next);
      // The SERVER's answer is what we adopt — never the optimistic value.
      setRole(snapshot.role);
      return true;
    } catch (e) {
      if (api.isAborted(e)) return false;
      const message = e instanceof RankedApiError && e.code
        ? SET_ERRORS[e.code] ?? e.message
        : e instanceof Error ? e.message : "could not save your role";
      setError(message);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { loadState, role, saving, error, selectRole, clearError };
}
