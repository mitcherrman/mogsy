/**
 * Policy-gated wrapper around the legacy AdBanner Google unit.
 *
 * This is the ONLY way blog content may render a Google ad unit. It routes
 * through the centralized ad policy (Pro/entitlement-loading/consent/route/
 * flag suppression), validates the author-configured slot, loads the Google
 * script through the consent-aware loader, and renders nothing at all —
 * no label, no reserved space — when suppressed. Development builds may show
 * a dashed diagnostic instead (never in production).
 */

import { useEffect, type CSSProperties } from "react";
import AdBanner from "@/components/AdBanner";
import { cn } from "@/lib/utils";
import { useLegacyAdGate } from "@/lib/ads/useLegacyAdGate";
import { getAdsConfig } from "@/lib/ads/config";
import { getConsentState } from "@/lib/ads/consent";
import { ensureGoogleAdsScript, getAdsensePublisherId } from "@/lib/ads/googleLoader";

interface GatedAdBannerProps {
  slot: string;
  format?: "auto" | "rectangle" | "horizontal";
  minHeight?: number;
  className?: string;
  style?: CSSProperties;
}

export default function GatedAdBanner({
  slot,
  format = "rectangle",
  minHeight = 100,
  className,
  style,
}: GatedAdBannerProps) {
  const gate = useLegacyAdGate("blog");
  const config = getAdsConfig();

  // AdSense slots are numeric; anything else is author misconfiguration.
  const slotValid = /^\d+$/.test(slot);
  const canRenderGoogle = gate.allowGoogle && slotValid;

  useEffect(() => {
    if (!canRenderGoogle) return;
    void ensureGoogleAdsScript({
      config,
      consent: getConsentState(),
      policyEligible: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRenderGoogle, slot]);

  if (canRenderGoogle) {
    const publisherId = getAdsensePublisherId();
    if (!publisherId) return null; // fail closed — never fabricate an ID
    return (
      <div className={cn("my-6", className)} style={style}>
        <p className="text-[10px] uppercase tracking-widest blog-muted text-center mb-1.5">
          Advertisement
        </p>
        <div style={{ minHeight }} className="rounded-xl overflow-hidden">
          <AdBanner slot={slot} format={format} clientId={publisherId} className="w-full" />
        </div>
      </div>
    );
  }

  // Dev-only diagnostic (config.placeholdersEnabled is hard-false in prod builds).
  if (config.placeholdersEnabled) {
    return (
      <div
        className={cn(
          "my-6 flex items-center justify-center rounded-xl border border-dashed border-border/60 bg-card/40 p-4 text-center",
          className,
        )}
        style={{ minHeight, ...style }}
      >
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Blog ad suppressed (dev): {gate.reason ?? (slotValid ? "unknown" : "invalid_slot")}
        </p>
      </div>
    );
  }

  return null;
}
