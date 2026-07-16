/**
 * <AdSlot placement="quiz_results" /> — the single mount point for all
 * advertising surfaces.
 *
 * Provider-neutral preliminary infrastructure:
 *  - resolves eligibility through the pure policy layer (src/lib/ads/policy.ts)
 *  - renders NOTHING (null, no reserved space) when suppressed
 *  - renders a labeled house promotion or a dev-only dashed placeholder
 *  - contains the future third-party provider boundary, which today renders
 *    nothing and loads no scripts — no Google/AdSense code or ids exist here
 *  - never throws: any internal error collapses the slot to null
 */

import { Component, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSitewideTheme } from "@/hooks/useSitewideTheme";
import { cn } from "@/lib/utils";
import { AD_PLACEMENTS, isKnownPlacement, type AdPlacement } from "@/lib/ads/placements";
import { resolveAdPolicy, type AdPolicyDecision } from "@/lib/ads/policy";
import { getAdsConfig } from "@/lib/ads/config";
import { getConsentState } from "@/lib/ads/consent";
import { pickHouseAd } from "@/lib/ads/houseAds";
import { emitAdEvent, emitDecision } from "@/lib/ads/analytics";

export interface AdSlotProps {
  placement: AdPlacement;
  className?: string;
  /** Live product state the URL alone can't express. Pass true to force suppression. */
  isActiveQuizQuestion?: boolean;
  isActiveRankedMatch?: boolean;
  isRankedRecoveryState?: boolean;
}

function AdSlotInner({
  placement,
  className,
  isActiveQuizQuestion,
  isActiveRankedMatch,
  isRankedRecoveryState,
}: AdSlotProps) {
  const location = useLocation();
  // If mounted outside AuthProvider this throws and the error boundary
  // collapses the slot to null — ads never take a page down.
  const { user } = useAuth();
  const isSignedIn = !!user && !(user as { is_anonymous?: boolean }).is_anonymous;
  const { proStatus } = useSitewideTheme();

  const decision: AdPolicyDecision = resolveAdPolicy({
    placement,
    route: location.pathname,
    proStatus,
    isSignedIn,
    isActiveQuizQuestion,
    isActiveRankedMatch,
    isRankedRecoveryState,
    consent: getConsentState(), // "unknown" until a CMP lands — third-party structurally off
    config: getAdsConfig(),
  });

  const meta = isKnownPlacement(placement) ? AD_PLACEMENTS[placement] : null;
  const creative =
    decision.kind === "house" ? pickHouseAd(placement, proStatus === "pro") : null;

  // One lifecycle event per decision change, not per render.
  const decisionKey =
    decision.kind === "suppressed" ? `suppressed:${decision.reason}` : decision.kind;
  useEffect(() => {
    emitDecision(placement, decision);
    if (decision.kind === "house" && creative) {
      emitAdEvent("ad_slot_rendered", { placement, provider: "house", creativeId: creative.id });
    } else if (decision.kind === "placeholder") {
      emitAdEvent("ad_slot_rendered", { placement, provider: "placeholder" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement, decisionKey, creative?.id]);

  if (decision.kind === "suppressed" || !meta) return null;
  const minHeight = meta.minHeight;

  if (decision.kind === "house") {
    if (!creative) return null;
    return (
      <aside
        aria-label={`Mogzy recommendation: ${creative.title}`}
        className={cn("rounded-xl border border-border bg-card/60 p-4", className)}
        style={{ minHeight }}
        data-ad-slot={placement}
      >
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">From Mogzy</p>
        <p className="mt-1 font-semibold text-foreground">{creative.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{creative.body}</p>
        <Link
          to={creative.to}
          className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
          onClick={() =>
            emitAdEvent("house_ad_clicked", {
              placement,
              provider: "house",
              creativeId: creative.id,
            })
          }
        >
          {creative.ctaText}
        </Link>
      </aside>
    );
  }

  if (decision.kind === "placeholder") {
    return (
      <aside
        aria-label={`Ad placeholder: ${meta.label}`}
        className={cn(
          "flex items-center justify-center rounded-xl border border-dashed border-border/60 bg-card/40 p-4 text-center",
          className,
        )}
        style={{ minHeight }}
        data-ad-slot={placement}
      >
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Ad placeholder (dev only)
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{placement}</p>
        </div>
      </aside>
    );
  }

  // decision.kind === "third_party": future provider boundary. Intentionally
  // renders nothing today — a real provider (e.g. AdSense) will mount here
  // behind VITE_THIRD_PARTY_ADS_ENABLED + consent, labeled "Advertisement".
  return null;
}

interface BoundaryState {
  failed: boolean;
}

/** Ads must never take a page down: any render error collapses to null. */
export default class AdSlot extends Component<AdSlotProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch() {
    emitAdEvent("ad_slot_error", { placement: this.props.placement });
  }

  render(): ReactNode {
    if (this.state.failed) return null;
    return <AdSlotInner {...this.props} />;
  }
}
