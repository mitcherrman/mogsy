import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AdCreative } from "@/components/SwipeAdCard";

type AdMode = "popup" | "in_swipe" | "both" | "off";

interface AdSystemState {
  adMode: AdMode;
  creatives: AdCreative[];
  frequency: number;
  shouldShowAd: (matchCount: number, isPro: boolean) => false | "popup" | "in_swipe";
  getRandomCreative: () => AdCreative | null;
}

export function useAdSystem(placement: string = "swipe"): AdSystemState {
  const [adMode, setAdMode] = useState<AdMode>("popup");
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
      .then(({ data }) => {
        if (data) {
          const val = data.value as any;
          const globalEnabled = val?.global_enabled ?? val?.enabled ?? true;
          if (!globalEnabled) {
            setAdMode("off");
            return;
          }
          const placementConfig = val?.placements?.[placement];
          if (placementConfig) {
            setAdMode(placementConfig.ad_mode || "popup");
            setFrequency(placementConfig.frequency || 10);
            if (!placementConfig.enabled) setAdMode("off");
          }
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
        if (creatives.length === 0) return "popup"; // fallback
        return "in_swipe";
      }
      if (adMode === "both") {
        // Alternate
        const next = lastAdType.current === "popup" ? "in_swipe" : "popup";
        if (next === "in_swipe" && creatives.length === 0) return "popup";
        lastAdType.current = next;
        return next;
      }
      return false;
    },
    [adMode, frequency, creatives.length]
  );

  const getRandomCreative = useCallback((): AdCreative | null => {
    if (creatives.length === 0) return null;
    return creatives[Math.floor(Math.random() * creatives.length)];
  }, [creatives]);

  return { adMode, creatives, frequency, shouldShowAd, getRandomCreative };
}
