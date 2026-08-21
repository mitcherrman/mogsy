// ---------------------------------------------------------------------------
// Post-conversion routing. Reuses the EXISTING tutorial eligibility helper so
// a converted account is never sent through a tutorial it already finished.
// ---------------------------------------------------------------------------

import {
  resolvePostAuthDestination,
  type ResolvedReturnTo,
} from "@/lib/auth/auth-destination";
import {
  evaluateRankedTutorial,
  RANKED_TUTORIAL_ROUTE,
  type RankedTutorialProfileFields,
} from "@/lib/ranked-tutorial/onboarding";

/**
 * Where to send a freshly-converted permanent account.
 *
 * AUTH1 precedence (see lib/auth/auth-destination.ts):
 *  - an EXPLICIT returnTo always wins. The user was trying to reach a specific
 *    place and auth was only an interruption. Onboarding does not get to
 *    quietly reinterpret that as "you meant the tutorial" — and it does not
 *    need to, because RequireRankedTutorial guards the destination itself and
 *    will redirect on arrival if the global policy still demands it. One
 *    authority for forced onboarding, not two;
 *  - with NO explicit destination, an owed tutorial is the most useful place
 *    to land, so it beats the bare hub default;
 *  - otherwise the fallback.
 *
 * `returnTo.path` MUST already be a validated safe relative path.
 */
export function computePostConversionDestination(
  profile: RankedTutorialProfileFields | null,
  returnTo: ResolvedReturnTo,
): string {
  const { required } = evaluateRankedTutorial(profile, { hasUser: true });
  return resolvePostAuthDestination({
    returnTo,
    onboardingRoute: required ? RANKED_TUTORIAL_ROUTE : null,
  });
}
