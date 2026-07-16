import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AdCreative } from "@/components/SwipeAdCard";

type AdMode = "popup" | "in_swipe" | "both" | "off";
type AdSource = "custom" | "adsense" | "hybrid";

interface AdSystemState {
  adMode: AdMode;
  adSource: AdSource;
  adsenseClientId: string;
  adsenseSlot: string;
  creatives: AdCreative[];
  frequency: number;
  shouldShowAd: (matchCount: number, isPro: boolean) => false | "popup" | "in_swipe";
  getRandomCreative: () => AdCreative | null;
}

export function useAdSystem(placement: string = "swipe"): AdSystemState {
  // Fail closed: ads are OFF until an explicit, valid, enabled settings row
  // loads. Missing row, malformed value, query error, or loading state all
  // leave ads disabled.
  const [adMode, setAdMode] = useState<AdMode>("off");
  const [adSource, setAdSource] = useState<AdSource>("custom");
  const [adsenseClientId, setAdsenseClientId] = useState("");
  const [adsenseSlot, setAdsenseSlot] = useState("");
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [frequency, setFrequency] = useState(10);
  const lastAdType = useRef<"popup" | "in_swipe">("popup");

  useEffect(() => {
    // Load ad settings
    supabase
      .from("app_settings")
      .select("key, value")
      .eq("key", "global_ads_enabled")
      .single()
      .then(({ data, error }) => {
        // Missing row, query error, or malformed value: stay off (fail closed).
        if (error || !data) return;
        const val = data.value as any;
        if (!val || typeof val !== "object") return;
        const globalEnabled = val.global_enabled ?? val.enabled ?? false;
        if (!globalEnabled) return;
        // Global AdSense client ID
        if (val.adsense_client_id) setAdsenseClientId(val.adsense_client_id);

        const placementConfig = val.placements?.[placement];
        if (placementConfig) {
          setAdSource(placementConfig.ad_source || "custom");
          setFrequency(placementConfig.frequency || 10);
          if (placementConfig.adsense_slot) setAdsenseSlot(placementConfig.adsense_slot);
          setAdMode(placementConfig.enabled ? placementConfig.ad_mode || "popup" : "off");
        } else {
          // Globally enabled with no per-placement config: legacy default.
          setAdMode("popup");
        }
      });

    // Load creatives
    supabase
      .from("ad_creatives")
      .select("*")
      .eq("is_enabled", true)
      .eq("placement", placement)
      .then(({ data }) => {
        if (data) {
          setCreatives(
            data.map((c: any) => ({
              id: c.id,
              title: c.title,
              image_url: c.image_url,
              brand_name: c.brand_name,
              cta_text: c.cta_text,
              destination_url: c.destination_url,
              view_duration_seconds: c.view_duration_seconds ?? 5,
            }))
          );
        }
      });
  }, [placement]);

  const shouldShowAd = useCallback(
    (matchCount: number, isPro: boolean): false | "popup" | "in_swipe" => {
      if (isPro || adMode === "off") return false;
      if (matchCount === 0 || matchCount % frequency !== 0) return false;

      if (adMode === "popup") return "popup";
      if (adMode === "in_swipe") {
        // For adsense source, we don't need creatives
        if (adSource === "adsense" || adSource === "hybrid") return "in_swipe";
        if (creatives.length === 0) return "popup"; // fallback
        return "in_swipe";
      }
      if (adMode === "both") {
        const next = lastAdType.current === "popup" ? "in_swipe" : "popup";
        if (next === "in_swipe" && adSource === "custom" && creatives.length === 0) return "popup";
        lastAdType.current = next;
        return next;
      }
      return false;
    },
    [adMode, adSource, frequency, creatives.length]
  );

  const getRandomCreative = useCallback((): AdCreative | null => {
    if (creatives.length === 0) return null;
    return creatives[Math.floor(Math.random() * creatives.length)];
  }, [creatives]);

  return { adMode, adSource, adsenseClientId, adsenseSlot, creatives, frequency, shouldShowAd, getRandomCreative };
}
