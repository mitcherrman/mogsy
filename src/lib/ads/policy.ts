/**
 * Pure ad-eligibility policy resolver.
 *
 * No React, no Supabase, no I/O — every decision is a function of the
 * explicit context passed in, so the whole commercial rule set is unit
 * testable. `AdSlot` builds the context from real product state and route.
 *
 * Commercial rules (see docs/advertising.md):
 *  - Pro users never see third-party ads (fail-closed while entitlement is
 *    unresolved for a signed-in user).
 *  - Active quiz questions and active Ranked gameplay are always ad-free.
 *  - Auth, checkout/billing, admin, developer, policy, and broadcast-studio
 *    routes are always ad-free.
 *  - Third-party additionally requires explicit consent — which no CMP
 *    collects yet, so it is structurally impossible to serve third-party
 *    ads until a consent integration lands.
 */

import { AD_PLACEMENTS, isKnownPlacement, type AdPlacement } from "./placements";
import type { AdsConfig } from "./config";

/** Pro entitlement as exposed by SitewideThemeContext.proStatus. */
export type ProStatus = "unknown" | "pro" | "free";

export interface AdPolicyContext {
  placement: AdPlacement;
  route: string;
  /** "unknown" while a signed-in user's profile query is unresolved. Guests are "free". */
  proStatus: ProStatus;
  isSignedIn: boolean;
  isActiveQuizQuestion?: boolean;
  isActiveRankedMatch?: boolean;
  isRankedRecoveryState?: boolean;
  /** No CMP exists yet; callers must pass "unknown" until one does. */
  consent: "granted" | "denied" | "unknown";
  config: AdsConfig;
}

export type AdSuppressionReason =
  | "global_disabled"
  | "unknown_placement"
  | "placement_disabled"
  | "pro"
  | "entitlement_loading"
  | "active_quiz"
  | "active_ranked_match"
  | "ranked_recovery"
  | "admin"
  | "developer_route"
  | "auth_or_checkout"
  | "policy_route"
  | "consent"
  | "nothing_to_render";

export type AdPolicyDecision =
  | { kind: "third_party" }
  | { kind: "house" }
  | { kind: "placeholder" }
  | { kind: "suppressed"; reason: AdSuppressionReason };

type RouteCategory =
  | "admin"
  | "developer_route"
  | "auth_or_checkout"
  | "policy_route"
  | null;

/** Routes that must never carry any advertising, whatever the placement. */
export function classifyBlockedRoute(route: string): RouteCategory {
  const path = route.split("?")[0].replace(/\/+$/, "") || "/";
  const starts = (prefix: string) => path === prefix || path.startsWith(prefix + "/");

  if (starts("/admin") || starts("/moderator") || starts("/quiz/admin") || starts("/secret-room")) {
    return "admin";
  }
  if (
    starts("/dev") ||
    starts("/combat-lab/diagnostics") ||
    starts("/quiz/diagnostics") ||
    starts("/broadcast") // OBS/broadcast rendering — never inject layout into it
  ) {
    return "developer_route";
  }
  if (
    starts("/auth") ||
    starts("/reset-password") ||
    starts("/shop") ||
    starts("/lol/pro") || // Pro checkout/upsell
    starts("/settings") // account management
  ) {
    return "auth_or_checkout";
  }
  if (
    starts("/privacy") ||
    starts("/terms") ||
    starts("/security") ||
    starts("/contact") ||
    starts("/feedback")
  ) {
    return "policy_route";
  }
  return null;
}

export function resolveAdPolicy(ctx: AdPolicyContext): AdPolicyDecision {
  const { config } = ctx;

  if (!config.adsGloballyEnabled) return { kind: "suppressed", reason: "global_disabled" };
  if (!isKnownPlacement(ctx.placement)) return { kind: "suppressed", reason: "unknown_placement" };

  const meta = AD_PLACEMENTS[ctx.placement];

  // Live-gameplay states are ad-free regardless of everything else.
  if (ctx.isActiveQuizQuestion) return { kind: "suppressed", reason: "active_quiz" };
  if (ctx.isActiveRankedMatch) return { kind: "suppressed", reason: "active_ranked_match" };
  if (ctx.isRankedRecoveryState) return { kind: "suppressed", reason: "ranked_recovery" };

  const blocked = classifyBlockedRoute(ctx.route);
  if (blocked) return { kind: "suppressed", reason: blocked };

  // Fail-closed entitlement: a signed-in user with unresolved Pro status
  // sees nothing, so Pro users never get an ad flash while loading.
  if (ctx.isSignedIn && ctx.proStatus === "unknown") {
    return { kind: "suppressed", reason: "entitlement_loading" };
  }

  const isPro = ctx.proStatus === "pro";

  // Third-party: never for Pro, requires flag + placement + explicit consent.
  if (
    !isPro &&
    config.thirdPartyAdsEnabled &&
    meta.allowThirdParty &&
    ctx.consent === "granted"
  ) {
    return { kind: "third_party" };
  }

  // House promotions: internal product recommendations only. Suppressed for
  // Pro by default (per-creative overrides are decided at render time via
  // `showToPro`; the policy layer only grants house *eligibility*).
  if (config.houseAdsEnabled && meta.allowHouse) {
    return { kind: "house" };
  }

  // Dev placeholders (config already guarantees non-production).
  if (config.placeholdersEnabled && meta.devPlaceholder) {
    return { kind: "placeholder" };
  }

  // Explain third-party-specific denials for analytics when nothing rendered.
  if (isPro) return { kind: "suppressed", reason: "pro" };
  if (config.thirdPartyAdsEnabled && meta.allowThirdParty && ctx.consent !== "granted") {
    return { kind: "suppressed", reason: "consent" };
  }
  return { kind: "suppressed", reason: "nothing_to_render" };
}
