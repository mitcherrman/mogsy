// ---------------------------------------------------------------------------
// AUTH1 — the ONE post-auth routing precedence.
//
// Product rule: "Authentication should interrupt what the user is doing only as
// long as necessary, then return them to what they were trying to do." Auth is
// an interruption, not a destination.
//
// Before AUTH1 the precedence was implicit and split across three places —
// Auth.tsx navigated to a returnTo that defaulted to the League hub, the
// confirmation callback let the onboarding tutorial override that returnTo
// unconditionally, and half the senders never attached a returnTo at all. The
// visible symptom: start in Ranked, get prompted to sign in, land in the League
// hub. Two of those three are addressed here; the third (senders) is a fix at
// each call site, which now all go through `authHref` below.
//
// PRECEDENCE, highest first:
//   1. an EXPLICIT, safe, internal `returnTo` — the destination the user was
//      actually trying to reach;
//   2. contextual continuation carried in that same returnTo (a Ranked lobby,
//      a Stat Check room, an invite deep link are all just paths);
//   3. a genuinely mandatory account requirement — today there are NONE.
//      Email verification is explicitly NOT one (AUTH1 §3), and the forced
//      Ranked tutorial is enforced by the RequireRankedTutorial ROUTE GUARD,
//      not here: sending the user to their real destination and letting the
//      guard bounce them keeps one authority instead of two;
//   4. the default hub, only when nothing meaningful was preserved.
// ---------------------------------------------------------------------------

import { safeReturnPath } from "@/lib/auth/safe-return";

export interface ResolvedReturnTo {
  /** The validated destination. Always a safe same-origin relative path. */
  path: string;
  /**
   * True when the caller supplied a returnTo that SURVIVED validation — i.e.
   * the user really was heading somewhere. False when `path` is the fallback,
   * either because nothing was supplied or because what was supplied was
   * unsafe (external URL, protocol-relative, control characters).
   *
   * This distinction is the whole point: only a non-explicit destination may be
   * overridden by onboarding or hub defaults.
   */
  explicit: boolean;
}

/**
 * Validate a raw `returnTo` and report whether it was explicit.
 *
 * Open-redirect protection is unchanged — this delegates to `safeReturnPath`,
 * so an external or protocol-relative target is rejected exactly as before and
 * additionally reported as NOT explicit (an attacker-supplied target must never
 * gain the precedence a real intent has).
 */
export function resolveReturnTo(
  raw: string | null | undefined,
  fallback: string,
): ResolvedReturnTo {
  const path = safeReturnPath(raw, fallback);
  return { path, explicit: path !== fallback };
}

export interface PostAuthOptions {
  /** Resolved returnTo for this auth interruption. */
  returnTo: ResolvedReturnTo;
  /**
   * The onboarding route to use when there is no explicit destination and the
   * account still owes onboarding. `null` when nothing is owed.
   */
  onboardingRoute?: string | null;
}

/**
 * The single precedence function. Everything that decides "where does the user
 * go now that auth is done" calls this.
 *
 * An explicit destination beats onboarding — deliberately. The route guard on
 * the destination is still free to redirect into onboarding when the global
 * policy demands it; what must not happen is auth silently deciding the user
 * meant the hub all along.
 */
export function resolvePostAuthDestination({
  returnTo,
  onboardingRoute = null,
}: PostAuthOptions): string {
  if (returnTo.explicit) return returnTo.path;
  if (onboardingRoute) return onboardingRoute;
  return returnTo.path;
}

/**
 * Build the /auth href for an auth interruption that started at `from`.
 *
 * One builder for every sender, so "did this one remember returnTo?" stops
 * being a per-call-site question. `from` is a location-shaped value — pass
 * `pathname + search + hash` when the destination is parameterised (a Stat
 * Check room code, an invite), because dropping the query would return the
 * user to a different page than the one they were on.
 */
export function authHref(
  from: string,
  opts: { mode?: "signin" | "signup" } = {},
): string {
  const params = new URLSearchParams();
  if (opts.mode === "signup") params.set("mode", "signup");
  // Only attach a returnTo that would survive validation on arrival; anything
  // else is noise in the URL bar that the Auth page would discard anyway.
  const safe = safeReturnPath(from, "");
  if (safe) params.set("returnTo", safe);
  const qs = params.toString();
  return qs ? `/auth?${qs}` : "/auth";
}
