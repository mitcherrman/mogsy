/**
 * PT1.7B — the Builder's state, as one hook.
 *
 * It holds the configuration the reader is assembling, the backend's catalog
 * (which is the only source of what may be offered), the live preview count,
 * and the saved sets. It decides nothing about entitlement: `catalog.capability`
 * arrives from the server and every gate is re-enforced there, so a reader who
 * defeats the UI reaches a 403 rather than a session.
 *
 * The preview is debounced rather than fired per keystroke: it exists to tell
 * the reader whether their filters have anything behind them, and a count that
 * lands a moment later is better than four requests for one decision.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  builderApi,
  DEFAULT_CONFIG,
  isPremiumRefusal,
  type BuildResult,
  type BuilderCapability,
  type BuilderCatalog,
  type BuilderConfig,
  type SavedSet,
  type WeaknessReport,
} from "@/lib/quiz/builderApi";
import { trackFunnelEvent } from "@/lib/funnel-analytics";

const PREVIEW_DEBOUNCE_MS = 350;

export type BuilderState = {
  catalog: BuilderCatalog | null;
  capability: BuilderCapability | null;
  config: BuilderConfig;
  preview: BuildResult | null;
  previewing: boolean;
  sets: SavedSet[];
  weakness: WeaknessReport | null;
  error: string | null;
  /** A refusal, as distinct from a failure. Drives the paywall, never a retry. */
  refused: boolean;
  loading: boolean;
  setConfig: (patch: Partial<BuilderConfig>) => void;
  reload: () => void;
  loadWeakness: () => Promise<void>;
};

export function usePracticeBuilder(enabled: boolean): BuilderState {
  const [catalog, setCatalog] = useState<BuilderCatalog | null>(null);
  const [config, setConfigState] = useState<BuilderConfig>(DEFAULT_CONFIG);
  const [preview, setPreview] = useState<BuildResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sets, setSets] = useState<SavedSet[]>([]);
  const [weakness, setWeakness] = useState<WeaknessReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Mounted only while the panel is open: the catalog read is account-bound
  // and a reader who never opens the Builder should not spend a request on it.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const next = await builderApi.catalog();
        if (cancelled) return;
        setCatalog(next);
        // Never offer a length the server would refuse.
        if (next.capability.allowed_lengths.length > 0 &&
            !next.capability.allowed_lengths.includes(config.length)) {
          setConfigState((c) => ({ ...c, length: next.capability.allowed_lengths[0] }));
        }
        if (next.capability.can_save) {
          const listing = await builderApi.listSets();
          if (!cancelled) setSets(listing.sets);
        } else {
          // A lapsed account still owns its sets, and the listing is not gated.
          try {
            const listing = await builderApi.listSets();
            if (!cancelled) setSets(listing.sets);
          } catch {
            if (!cancelled) setSets([]);
          }
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Builder unavailable.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, reloadKey]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!enabled || !catalog?.capability.can_build) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setPreviewing(true);
      try {
        const next = await builderApi.preview(config);
        setPreview(next);
        setRefused(false);
        if (next.status === "insufficient_pool") {
          trackFunnelEvent("practice_builder_insufficient_pool", {
            pool: next.config.pool,
            requested: next.requested,
            available: next.available,
          });
        }
      } catch (err) {
        if (isPremiumRefusal(err)) {
          setRefused(true);
          trackFunnelEvent("practice_builder_entitlement_refused", {
            pool: config.pool,
          });
        } else {
          setError(err instanceof Error ? err.message : "Preview failed.");
        }
      } finally {
        setPreviewing(false);
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, config, catalog?.capability.can_build]);

  const setConfig = useCallback((patch: Partial<BuilderConfig>) => {
    setConfigState((current) => {
      const next = { ...current, ...patch };
      // Naming the Pro Play category IS the opt-in, mirrored from the server so
      // the preview the reader sees matches the session they would get.
      if (patch.category !== undefined) {
        next.include_pro_play = patch.category === catalog?.pro_play_category;
      }
      return next;
    });
    if (patch.pool) {
      trackFunnelEvent("practice_builder_pool_selected", { pool: patch.pool });
    } else {
      trackFunnelEvent("practice_builder_filters_changed", {
        field: Object.keys(patch)[0] ?? "unknown",
      });
    }
  }, [catalog?.pro_play_category]);

  const loadWeakness = useCallback(async () => {
    try {
      setWeakness(await builderApi.weakness());
    } catch (err) {
      if (isPremiumRefusal(err)) setRefused(true);
    }
  }, []);

  return {
    catalog,
    capability: catalog?.capability ?? null,
    config,
    preview,
    previewing,
    sets,
    weakness,
    error,
    refused,
    loading,
    setConfig,
    reload: () => setReloadKey((k) => k + 1),
    loadWeakness,
  };
}
