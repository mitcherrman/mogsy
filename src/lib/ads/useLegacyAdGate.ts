/**
 * Compatibility gate between the legacy advertising surfaces (Swipe
 * interstitials, blog adsense blocks) and the new centralized ad policy.
 *
 * The legacy components keep their own UX, creatives, frequency logic, and
 * ad_events analytics; this gate only answers "may an ad be shown here, to
 * this viewer, right now?" using the same pure policy resolver as <AdSlot>.
 * It performs no script injection and no data fetching (Pro status comes
 * from the shared SitewideThemeContext — no second entitlement query).
 */

import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSitewideTheme } from "@/hooks/useSitewideTheme";
import { getAdsConfig, type AdsConfig } from "./config";
import { getConsentState, type ConsentState } from "./consent";
import { resolveAdPolicy, type AdSuppressionReason, type ProStatus } from "./policy";
import type { AdPlacement } from "./placements";

/** Legacy placement keys → typed registry placements. Unknown keys fail closed. */
const LEGACY_PLACEMENT_MAP: Record<string, AdPlacement> = {
  swipe: "swipe_interstitial",
  blog: "blog_inline",
};

export interface LegacyAdGateOverrides {
  /**
   * Explicit staff QA override. Lifts ONLY Pro-entitlement suppression so
   * staff can verify custom creatives; it never grants Google (third-party)
   * eligibility, so it cannot create live production ad traffic — Google
   * units additionally require flags + consent, and render with
   * data-adtest on non-production hosts.
   */
  staffQa?: boolean;
  isActiveQuizQuestion?: boolean;
  isActiveRankedMatch?: boolean;
  isRankedRecoveryState?: boolean;
}

export interface LegacyAdGateDecision {
  /** Google/third-party unit may render (requires flags + granted consent). */
  allowGoogle: boolean;
  /** Custom/house creatives may render. */
  allowCustom: boolean;
  suppressed: boolean;
  reason: AdSuppressionReason | null;
  /** True when the staff QA override is what allowed custom creatives. */
  staffQaActive: boolean;
}

const SUPPRESSED = (reason: AdSuppressionReason): LegacyAdGateDecision => ({
  allowGoogle: false,
  allowCustom: false,
  suppressed: true,
  reason,
  staffQaActive: false,
});

export interface LegacyAdGateInput {
  legacyKey: string;
  route: string;
  proStatus: ProStatus;
  isSignedIn: boolean;
  consent: ConsentState;
  config: AdsConfig;
  overrides?: LegacyAdGateOverrides;
}

/** Pure core — exported for tests. */
export function resolveLegacyAdGate(input: LegacyAdGateInput): LegacyAdGateDecision {
  const placement = LEGACY_PLACEMENT_MAP[input.legacyKey];
  if (!placement) return SUPPRESSED("unknown_placement");

  const overrides = input.overrides ?? {};
  const decision = resolveAdPolicy({
    placement,
    route: input.route,
    proStatus: input.proStatus,
    isSignedIn: input.isSignedIn,
    isActiveQuizQuestion: overrides.isActiveQuizQuestion,
    isActiveRankedMatch: overrides.isActiveRankedMatch,
    isRankedRecoveryState: overrides.isRankedRecoveryState,
    consent: input.consent,
    config: input.config,
  });

  let result: LegacyAdGateDecision;
  switch (decision.kind) {
    case "third_party":
      result = { allowGoogle: true, allowCustom: true, suppressed: false, reason: null, staffQaActive: false };
      break;
    case "house":
      // Legacy creatives are paid-style ads (Sponsored badge, external
      // destinations), NOT ordinary product recommendations — so unlike
      // <AdSlot> house promos, they are fully suppressed for Pro.
      result =
        input.proStatus === "pro"
          ? SUPPRESSED("pro")
          : { allowGoogle: false, allowCustom: true, suppressed: false, reason: null, staffQaActive: false };
      break;
    case "placeholder":
      // Legacy surfaces have their own visuals; a dev placeholder grant is
      // treated as "no ad" here.
      result = SUPPRESSED("nothing_to_render");
      break;
    case "suppressed":
      result = SUPPRESSED(decision.reason);
      break;
  }

  // Explicit staff QA: only the Pro-entitlement block may be lifted, and only
  // for custom creatives. Everything else (routes, gameplay state, kill
  // switch, consent, loading entitlement) still suppresses.
  if (result.suppressed && result.reason === "pro" && overrides.staffQa) {
    return { allowGoogle: false, allowCustom: true, suppressed: false, reason: null, staffQaActive: true };
  }
  return result;
}

export function useLegacyAdGate(
  legacyKey: string,
  overrides: LegacyAdGateOverrides = {},
): LegacyAdGateDecision {
  const location = useLocation();
  const { user } = useAuth();
  const { proStatus } = useSitewideTheme();
  const isSignedIn = !!user && !(user as { is_anonymous?: boolean }).is_anonymous;

  return resolveLegacyAdGate({
    legacyKey,
    route: location.pathname,
    proStatus,
    isSignedIn,
    consent: getConsentState(),
    config: getAdsConfig(),
    overrides,
  });
}
