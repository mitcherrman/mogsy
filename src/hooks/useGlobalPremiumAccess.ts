import { useEffect, useState } from "react";
import { fetchGlobalPremiumAccess } from "@/lib/pro/entitlement";
import { DEFAULT_PLATFORM_POLICY } from "@/lib/platform-policy/policy";

/**
 * The admin-controlled global Premium ACCESS override, for surfaces that gate
 * during RENDER rather than inside an async loader.
 *
 * Starts at the fail-closed default (false) and only ever moves to true once
 * the row has actually been read, so the first paint can never flash a Premium
 * surface at someone who is not entitled to it. A loader that is already doing
 * async work should call `fetchGlobalPremiumAccess()` directly and fold the
 * answer into its single state write instead of adding a second render pass.
 */
export function useGlobalPremiumAccess(): boolean {
  const [globalAccess, setGlobalAccess] = useState(
    DEFAULT_PLATFORM_POLICY.premium.globalAccess,
  );

  useEffect(() => {
    let cancelled = false;
    fetchGlobalPremiumAccess().then((enabled) => {
      if (!cancelled) setGlobalAccess(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return globalAccess;
}
