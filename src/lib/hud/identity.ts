/**
 * Shared guest predicate + signup destination for the global HUD identity
 * cluster.
 *
 * Both HUD surfaces need the same answer to "is this visitor a guest?" — the
 * signup chip in GlobalHud and the identity menu's guest panel. They used to
 * derive it independently (`!user || user.is_anonymous === true` in the HUD,
 * `Boolean(user && !user.is_anonymous)` in the bell), which is the same
 * predicate written twice and free to drift. One definition, one place.
 */

/** The only shape either caller reads off the Supabase user. */
export type IdentityUser = { is_anonymous?: boolean } | null | undefined;

/**
 * A missing session counts as a guest: most surfaces sign visitors in
 * anonymously on arrival, and anyone they miss is equally a visitor whose
 * progress is device-local.
 */
export function isGuestUser(user: IdentityUser): boolean {
  return !user || user.is_anonymous === true;
}

/**
 * The anonymous-upgrade flow, returning to wherever signup started. The Auth
 * page validates this with safeReturnPath, so encoding the current path is the
 * whole sender-side contract.
 */
export function signupHrefFor(pathname: string): string {
  return `/auth?mode=signup&returnTo=${encodeURIComponent(pathname)}`;
}
