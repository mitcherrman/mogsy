// ---------------------------------------------------------------------------
// Post-conversion routing. Reuses the EXISTING tutorial eligibility helper so
// a converted account is never sent through a tutorial it already finished.
// ---------------------------------------------------------------------------

import {
  evaluateRankedTutorial,
  RANKED_TUTORIAL_ROUTE,
  type RankedTutorialProfileFields,
} from "@/lib/ranked-tutorial/onboarding";

/**
 * Where to send a freshly-converted permanent account.
 *
 * - tutorial required (permanent, incomplete, not grandfathered) -> tutorial
 * - otherwise (already completed as guest, grandfathered v0, etc.) -> returnTo
 *
 * `returnTo` MUST already be a validated safe relative path.
 */
export function computePostConversionDestination(
  profile: RankedTutorialProfileFields | null,
  returnTo: string,
): string {
  const { required } = evaluateRankedTutorial(profile, { hasUser: true });
  return required ? RANKED_TUTORIAL_ROUTE : returnTo;
}
