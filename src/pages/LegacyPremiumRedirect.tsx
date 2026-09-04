// ---------------------------------------------------------------------------
// Legacy-route compatibility for the paid subscription page.
//
// The subscription is now "Mogzy Premium" and lives at /lol/premium. The word
// "Pro" is reserved for Pro Play (/lol/pro-play), the esports feature, so the
// old /lol/pro URL — which is in ads, house-ad CTAs, Stripe return paths and
// user bookmarks — redirects here rather than resolving to anything.
//
// The query string and hash are carried forward untouched: Stripe returns the
// buyer with ?success=true / ?canceled=true, and those must survive the hop.
// ---------------------------------------------------------------------------

import { Navigate, useLocation } from "react-router-dom";
import { PREMIUM_ROUTE } from "@/lib/premium-routes";

export function LegacyPremiumRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={`${PREMIUM_ROUTE}${search}${hash}`} replace />;
}

export default LegacyPremiumRedirect;
