import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { safeReturnPath } from "@/lib/auth/safe-return";
import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";

type RouterHistoryState = {
  idx?: unknown;
};

/**
 * React Router's browser history writes an integer `idx` to every entry it
 * owns. The first entry in a direct/new-tab/external arrival is index 0;
 * router PUSH navigation increments it. Unlike `history.length`, this does not
 * mistake an unrelated page earlier in the tab for a usable Mogzy entry.
 *
 * A refresh preserves the current entry's state. That is intentional: when a
 * refreshed entry has idx > 0, the earlier router-owned Mogzy entry still
 * exists and remains a valid temporal destination.
 */
export function hasUsableMogzyHistory(
  state: RouterHistoryState | null | undefined =
    typeof window === "undefined" ? null : window.history.state,
): boolean {
  return typeof state?.idx === "number"
    && Number.isInteger(state.idx)
    && state.idx > 0;
}

/**
 * A genuine temporal Back action with a deterministic internal fallback.
 *
 * Callers name their own semantic fallback. Unsafe/invalid fallback values
 * fail closed to product Home; this reuses auth's path validator without
 * sharing auth's returnTo state or destination rules.
 */
export function useSafeTemporalBack(fallback: string): () => void {
  const navigate = useNavigate();
  const safeFallback = useMemo(
    () => safeReturnPath(fallback, LEAGUE_HOME_ROUTE),
    [fallback],
  );

  return useCallback(() => {
    if (hasUsableMogzyHistory()) {
      navigate(-1);
      return;
    }

    // Replace the direct entry so fallback cannot trap the user in a B ↔
    // fallback loop. Internal navigation above remains a real POP.
    navigate(safeFallback, { replace: true });
  }, [navigate, safeFallback]);
}

