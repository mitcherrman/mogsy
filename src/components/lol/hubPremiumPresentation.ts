import { PREMIUM_ROUTE } from "@/lib/premium-routes";

export type HubPremiumStatus = "unknown" | "pro" | "free";

/** Shared copy and entitlement branch for both responsive Premium surfaces. */
export function getHubPremiumPresentation(proStatus: HubPremiumStatus) {
  const isMember = proStatus === "pro";
  return {
    isMember,
    eyebrow: isMember ? "Member in good standing" : "Academy Membership",
    title: "Mogzy Premium",
    body: isMember
      ? "Your membership is active. Your full quiz history and every question you’ve missed are unlocked."
      : "Keep your full quiz history, review every question you’ve missed, and read how your results are moving over time.",
    ctaLabel: isMember ? "View Premium" : "Explore Premium",
    ctaTo: PREMIUM_ROUTE,
  };
}
