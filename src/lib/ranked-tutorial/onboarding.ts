// ---------------------------------------------------------------------------
// Ranked Tutorial onboarding — shared contract (E2)
//
// Pure, dependency-free eligibility logic plus the routing/version constants.
// Kept free of React and Supabase imports so it is trivially unit-testable and
// safe to import from guards, hooks, pages, and tests alike.
// ---------------------------------------------------------------------------

/**
 * Current onboarding contract version. Bump when the tutorial changes enough to
 * warrant re-training. Grandfathered pre-rollout accounts carry version 0.
 */
export const RANKED_TUTORIAL_VERSION = 1;

/** Production route for the mandatory/replayable Ranked Tutorial onboarding. */
export const RANKED_TUTORIAL_ROUTE = "/onboarding/ranked-tutorial";

/** Where the tutorial returns the user on completion or exit. */
export const RANKED_TUTORIAL_RETURN_ROUTE = "/quiz";

/** The subset of profile columns the tutorial gate reads. */
export interface RankedTutorialProfileFields {
  is_anonymous: boolean | null;
  onboarding_completed: boolean | null;
  ranked_tutorial_completed_at: string | null;
  ranked_tutorial_version: number | null;
}

export interface RankedTutorialEligibility {
  /** The account has a durable completion stamp (any version, incl. grandfathered). */
  completed: boolean;
  /** The account must complete the tutorial before using gated routes. */
  required: boolean;
}

/**
 * Decide tutorial eligibility for an account. Pure function — no I/O.
 *
 * Required iff ALL hold:
 *  - there is a durable authenticated user,
 *  - the profile row has loaded,
 *  - the account is NOT anonymous (guests have no durable identity to gate),
 *  - the profile-setup onboarding is already finished (the tutorial follows it),
 *  - the account has no completion stamp yet.
 *
 * Grandfathered rows (version 0) carry a completion timestamp, so `completed` is
 * true and they are never required — exactly the no-lockout guarantee.
 */
export function evaluateRankedTutorial(
  profile: RankedTutorialProfileFields | null,
  opts: { hasUser: boolean },
): RankedTutorialEligibility {
  if (!opts.hasUser || !profile) {
    return { completed: false, required: false };
  }

  const completed = profile.ranked_tutorial_completed_at != null;
  const isAnonymous = profile.is_anonymous === true;
  const profileOnboarded = profile.onboarding_completed === true;

  const required = !completed && !isAnonymous && profileOnboarded;
  return { completed, required };
}

/**
 * Destination immediately after a successful profile-setup onboarding write.
 *
 * Returns the tutorial route only for a real account that now must complete the
 * tutorial; returns null (keep the normal Home load) for exempt guests,
 * grandfathered/completed accounts, and — critically — when the profile read does
 * not yet show `onboarding_completed: true` (i.e. the write did not persist), so a
 * failed write never navigates prematurely.
 */
export function postProfileOnboardingDestination(
  profile: RankedTutorialProfileFields | null,
): string | null {
  return evaluateRankedTutorial(profile, { hasUser: true }).required
    ? RANKED_TUTORIAL_ROUTE
    : null;
}
