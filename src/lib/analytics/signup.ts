/**
 * FUNNEL1B2 — what counts as a signup, and the one place that decides.
 *
 * The audit's finding (§8) was that Mogzy's signup number is wrong today
 * because `handle_new_user` inserts a `profiles` row for every anonymous
 * session, so the count includes every guest who ever loaded the Hub. B1 froze
 * the contract; this file implements it.
 *
 * A signup is an AUTH IDENTITY BECOMING REGISTERED. It is not a profile row, it
 * is not an anonymous session, and it is not a page load.
 *
 *
 * THERE ARE EXACTLY TWO WAYS TO BECOME REGISTERED IN THIS APP
 *
 * 1. A guest is upgraded IN PLACE. `useAccountUpgrade` → `upgradeAnonymousEmail`
 *    never signs out and never calls `signUp()`, so the uid survives and
 *    `is_anonymous` flips from true to false on the SAME account.
 *
 * 2. A visitor with no guest session fills in the ordinary signup form and
 *    `signUp()` creates a registered account outright (Auth.tsx, the branch
 *    that is unreachable while an anonymous session exists).
 *
 * There is no OAuth path in this codebase — `signInWithOAuth` appears nowhere —
 * so the audit's "OAuth signup is untracked" is currently moot. If one is added,
 * case 1 already covers it when the user was a guest, and case 2's explicit call
 * must be added beside it.
 *
 *
 * WHY CASE 1 IS OBSERVED CENTRALLY AND CASE 2 IS CALLED EXPLICITLY
 *
 * Case 1 is a fact about auth state, visible from one place and true no matter
 * which UI produced it. Observing it centrally also catches the path no UI
 * callback can see: a guest who chooses email confirmation leaves the site in
 * `verification_pending` — still anonymous — and becomes registered later, when
 * they click the link and come back. A `submit()` callback has long since
 * unmounted. The observer sees it on the next auth state change.
 *
 * Case 2 is NOT observable, and this is the trap worth naming: from auth state
 * alone, "a registered user appeared where there was none" is indistinguishable
 * from an ordinary sign-in on a new device. Counting that transition would turn
 * every returning user into a signup — a subtler version of the very defect
 * this replaces. So case 2 is reported by the only code that knows a signup
 * form was submitted.
 *
 * The two are mutually exclusive by construction: Auth.tsx returns the upgrade
 * panel early whenever the user is anonymous, so the `signUp()` branch cannot
 * run for a guest. Exactly one canonical `signup_completed` row per signup.
 *
 *
 * DEDUPE ACROSS RELOADS
 *
 * The observer compares against the last identity state it persisted, so a page
 * load that merely finds an already-registered user is not a transition. The
 * uid of every account it has already reported is also retained, so a reload
 * mid-flight, a second tab, or a token refresh cannot produce a second row.
 */

import { track } from "./track";
import { readJson, safeStorage, writeJson } from "./runtime";
import type { SignupMethod } from "./contract";

export const AUTH_IDENTITY_KEY = "mogzy.analytics.authIdentity.v1";
export const SIGNUP_REPORTED_KEY = "mogzy.analytics.signupReported.v1";

type IdentitySnapshot = { uid: string; anonymous: boolean } | null;

export type ObservableUser = {
  id: string;
  is_anonymous?: boolean | null;
} | null;

function readSnapshot(): IdentitySnapshot {
  const stored = readJson<IdentitySnapshot>(AUTH_IDENTITY_KEY);
  if (stored && typeof stored.uid === "string" && typeof stored.anonymous === "boolean") {
    return stored;
  }
  return null;
}

function writeSnapshot(snapshot: IdentitySnapshot): void {
  if (snapshot === null) {
    safeStorage.remove(AUTH_IDENTITY_KEY);
    return;
  }
  writeJson(AUTH_IDENTITY_KEY, snapshot);
}

function alreadyReported(uid: string): boolean {
  const reported = readJson<string[]>(SIGNUP_REPORTED_KEY);
  return Array.isArray(reported) && reported.includes(uid);
}

function markReported(uid: string): void {
  const reported = readJson<string[]>(SIGNUP_REPORTED_KEY);
  const next = Array.isArray(reported) ? reported : [];
  if (next.includes(uid)) return;
  // Bounded: a browser that upgrades more than a handful of guest accounts is
  // a tester, not a funnel.
  writeJson(SIGNUP_REPORTED_KEY, [...next, uid].slice(-10));
}

/**
 * Feed every observed auth identity through here.
 *
 * Returns true when it recognised a real guest → registered upgrade and emitted
 * `signup_completed`. Safe to call on every auth state change and on every
 * render pass; only a genuine transition produces an event.
 */
export function observeAuthIdentity(user: ObservableUser): boolean {
  const current: IdentitySnapshot = user
    ? { uid: user.id, anonymous: user.is_anonymous === true }
    : null;

  const previous = readSnapshot();
  writeSnapshot(current);

  if (!current || current.anonymous) return false;
  // The transition, and only the transition: the SAME account was anonymous a
  // moment ago and is not any more. A first sighting of a registered user is a
  // sign-in, not a signup — see the note above.
  if (!previous || previous.uid !== current.uid || !previous.anonymous) return false;
  if (alreadyReported(current.uid)) return false;

  markReported(current.uid);
  track("signup_completed", {
    metadata: {
      method: "email",
      upgraded_from_guest: true,
      detected_by: "auth_identity_transition",
    },
  });
  return true;
}

/**
 * Report case 2 — a registered account created outright, with no guest session
 * to upgrade. Called by the signup form, because nothing else can tell this
 * apart from a sign-in.
 */
export function reportDirectSignupCompleted(params: {
  userId?: string | null;
  method?: SignupMethod;
  entrySurface?: string;
  returnTo?: string | null;
}): boolean {
  const uid = params.userId ?? null;
  if (uid) {
    if (alreadyReported(uid)) return false;
    markReported(uid);
    // The observer must not also see this account's first sighting as
    // something to report; recording the snapshot now keeps the two paths from
    // racing on a slow auth state change.
    writeSnapshot({ uid, anonymous: false });
  }

  track("signup_completed", {
    metadata: {
      method: params.method ?? "email",
      upgraded_from_guest: false,
      entry_surface: params.entrySurface ?? null,
      return_to: params.returnTo ?? null,
      detected_by: "signup_form",
    },
  });
  return true;
}

/**
 * The submit of a signup or upgrade form — the denominator that makes
 * `signup_viewed` → `signup_completed` readable as two separate problems
 * (a bad offer versus a bad form).
 */
export function trackSignupStarted(params: {
  method?: SignupMethod;
  entrySurface: string;
  fromGuest: boolean;
  returnTo?: string | null;
}): void {
  track("signup_started", {
    metadata: {
      method: params.method ?? "email",
      entry_surface: params.entrySurface,
      from_guest: params.fromGuest,
      return_to: params.returnTo ?? null,
    },
  });
}

/** Test-only. */
export function resetSignupObserverForTests(): void {
  safeStorage.remove(AUTH_IDENTITY_KEY);
  safeStorage.remove(SIGNUP_REPORTED_KEY);
}
