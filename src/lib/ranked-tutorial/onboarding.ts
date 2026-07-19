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
 * The Ranked Tutorial is now the first-visit onboarding experience, shown BEFORE
 * account creation, so anonymous guests are gated by it too. Required iff ALL hold:
 *  - there is an authenticated user (anonymous sessions included),
 *  - the profile row has loaded,
 *  - the account has no completion stamp yet.
 *
 * Deliberately independent of `is_anonymous` and `onboarding_completed`:
 *  - anonymous incomplete users MUST complete the tutorial (they can, and their
 *    completion stamps their own profile row, carried forward on later upgrade);
 *  - the tutorial no longer follows profile-setup onboarding, so that flag is not
 *    a precondition here (the profile-setup handoff keeps its own guard in
 *    `postProfileOnboardingDestination`).
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
  const required = !completed;
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
  // The profile-setup handoff must only fire once the setup write persisted:
  // a failed write leaves `onboarding_completed` false, and we must not navigate
  // prematurely. This guard is local to the handoff — general tutorial
  // eligibility (evaluateRankedTutorial) no longer depends on this flag.
  if (!profile || profile.onboarding_completed !== true) return null;
  return evaluateRankedTutorial(profile, { hasUser: true }).required
    ? RANKED_TUTORIAL_ROUTE
    : null;
}
