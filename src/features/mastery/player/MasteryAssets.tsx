/**
 * Mastery champion-art context (J1) — PURE (no network/env).
 *
 * Presentational Mastery components read champion portraits through this context.
 * The default resolver returns null, so components render a graceful text fallback
 * and unit tests need no provider. The live player supplies a real resolver via
 * `MasteryAssetsProvider` (in the live package, which is allowed to do network).
 */
import { createContext, useContext } from "react";

export interface MasteryAssets {
  /** Square champion icon URL, or null when unavailable (caller shows a fallback). */
  championIconUrl: (championId: string, displayName?: string | null) => string | null;
}

export const MasteryAssetsContext = createContext<MasteryAssets>({ championIconUrl: () => null });

export const useMasteryAssets = (): MasteryAssets => useContext(MasteryAssetsContext);
