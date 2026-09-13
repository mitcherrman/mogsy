// ---------------------------------------------------------------------------
// Post-conversion routing.
//
// TUT1: the scripted Ranked tutorial is retired, so there is no longer any
// onboarding destination that can outrank what the user was doing. A converted
// account goes exactly where AUTH1 says it should — the explicit returnTo it
// carried, or the fallback hub — and nothing else gets a vote.
// ---------------------------------------------------------------------------

import {
  resolvePostAuthDestination,
  type ResolvedReturnTo,
} from "@/lib/auth/auth-destination";

/**
 * Where to send a freshly-converted permanent account.
 *
 * `returnTo.path` MUST already be a validated safe relative path.
 */
export function computePostConversionDestination(
  returnTo: ResolvedReturnTo,
): string {
  return resolvePostAuthDestination({ returnTo, onboardingRoute: null });
}
