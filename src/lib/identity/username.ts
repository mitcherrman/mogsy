// ---------------------------------------------------------------------------
// AUTH3 — the one username policy.
//
// Mogzy has exactly one public identity field, `profiles.display_name`, and
// before this module it had three different ideas of what a legal value was:
//
//   * the Welcome register (lib/welcome/academy-registration.ts) enforced
//     2..24 characters and an allow-list charset, and nothing else;
//   * the profile editor (pages/Profile.tsx) enforced the profanity filter and
//     nothing else — no length, no charset, no uniqueness;
//   * the onboarding profile step (components/onboarding/OnboardingProfile.tsx)
//     did the same, under a field labelled "Display Name" with the placeholder
//     "Choose a username".
//
// A name accepted by one and rejected by another is not one identity, and a
// name accepted everywhere but never checked against anyone else's is not an
// identity at all. This module is the single client-side rule; the database
// holds the identical rule (see supabase/migrations/
// 20260822120000_auth3_canonical_username.sql) and is the authority. The two
// must stay in step — username.contract.test.ts is what pins them.
//
// THE CLIENT CANNOT ENFORCE UNIQUENESS AND DOES NOT TRY. Nothing here knows
// about other accounts. Uniqueness is decided by `set_display_name()` in the
// same statement that writes, and the advisory precheck lives in
// claim-username.ts. What this module owns is shape: length, characters,
// reserved words, normalisation, and the exact sentence the user reads.
//
// BOUNDS ARE 2..24, NOT 2..20. The AUTH3 brief suggested 2..20; the Welcome
// register has been shipping 2..24 since HI1-C5 and names in the 21..24 band
// have already been accepted and written. Narrowing the ceiling now would make
// Mogzy reject names Mogzy itself handed out, which is a worse outcome than
// four characters of extra headroom. The table's own CHECK (<= 50) is
// unchanged and remains the outer bound.
// ---------------------------------------------------------------------------

import { containsProfanity } from "@/lib/profanity-filter";

/** Shortest name worth calling someone by. */
export const USERNAME_MIN = 2;
/** Longest name Mogzy will hold. Long enough for a real Riot ID tag. */
export const USERNAME_MAX = 24;

/**
 * Letters, digits, spaces and a few name-ish punctuation marks.
 *
 * An ALLOW-LIST on purpose. It is what keeps control characters, zero-width
 * joiners and bidirectional overrides out of a name that will be rendered on
 * other people's screens, without a separate blocklist per exploit. `\p{L}` and
 * `\p{N}` mean accented and non-Latin names are first-class, not tolerated.
 *
 * Spaces are allowed, and stay allowed. Mogzy has no username-in-the-URL
 * route — public profiles are addressed by `profiles.id` (`/user/:profileId`)
 * — so there is no routing problem to solve by banning them, and banning them
 * would be a rule that exists only to make a lookup path someone might build
 * one day marginally simpler.
 */
const USERNAME_ALLOWED = /^[\p{L}\p{N} ._'-]+$/u;

/**
 * The system's own generated placeholder: the literal 'Anonymous' followed by
 * digits, and nothing else.
 *
 * Anchored and digits-only on purpose. Someone who genuinely wants to be called
 * "Anonymous", or "Anonymous Wizard", has chosen a name and keeps it.
 */
const GENERATED_ANON_NAME = /^anonymous\d+$/;

/**
 * The whole reserved list. Two categories, each with a concrete reason:
 * impersonating Mogzy itself, or impersonating a moderator — the one kind of
 * impersonation that can be used to extract something from another player.
 *
 * It is meant to stay this short. AUTH3 is not building name moderation.
 */
const RESERVED = new Set([
  "admin",
  "administrator",
  "moderator",
  "system",
  "support",
  "mogzy",
  "mogsy",
]);

/** Every way a name can be refused, client-side or server-side. */
export type UsernameProblem =
  | "too_short"
  | "too_long"
  | "invalid_characters"
  | "reserved"
  | "profanity"
  /* server-only: decided by set_display_name(), never by this module */
  | "taken"
  | "unauthenticated"
  | "no_profile"
  | "unavailable";

/**
 * The sentence the user reads. Product-facing, complete, and actionable —
 * never a Postgres constraint name, never a raw Supabase string, never
 * "Invalid input".
 */
export const USERNAME_MESSAGES: Record<UsernameProblem, string> = {
  too_short: `Choose a username between ${USERNAME_MIN} and ${USERNAME_MAX} characters.`,
  too_long: `Choose a username between ${USERNAME_MIN} and ${USERNAME_MAX} characters.`,
  invalid_characters: "That username contains a character Mogzy can't use.",
  reserved: "That username is reserved. Please choose another.",
  profanity: "Please choose a different username.",
  taken: "That username is already taken.",
  unauthenticated: "Sign in to choose your username.",
  no_profile: "Your profile isn't ready yet. Try again in a moment.",
  unavailable: "Couldn't save that username. Please try again.",
};

/** The user-facing sentence for a problem code, mapped safely. */
export function usernameMessage(problem: string | null | undefined): string {
  if (!problem) return USERNAME_MESSAGES.unavailable;
  return USERNAME_MESSAGES[problem as UsernameProblem] ?? USERNAME_MESSAGES.unavailable;
}

/**
 * The DISPLAY form of a typed name: trimmed, with runs of whitespace collapsed.
 *
 * Normalisation is part of validation on purpose. This is the string that gets
 * stored and printed back, so it is the one that gets measured — otherwise
 * `"  a  "` passes a length check it has no business passing.
 */
export function cleanUsername(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

/**
 * The COMPARISON form. `MogzyKing` and `mogzyking` are the same name; so are
 * `Mogzy  King` and `Mogzy King`. Display keeps the user's capitalisation,
 * uniqueness does not.
 */
export function normalizeUsername(raw: string | null | undefined): string {
  return cleanUsername(raw).toLowerCase();
}

/** Whether a name is one nobody is allowed to claim. */
export function isReservedUsername(raw: string | null | undefined): boolean {
  const key = normalizeUsername(raw);
  return GENERATED_ANON_NAME.test(key) || RESERVED.has(key);
}

/**
 * What is wrong with this name, or null when nothing is.
 *
 * Order matters only in that the user sees one sentence: shape first (it is
 * what they can act on immediately), then reserved, then the profanity filter.
 */
export function usernameProblem(raw: string | null | undefined): UsernameProblem | null {
  const value = cleanUsername(raw);
  if (value.length < USERNAME_MIN) return "too_short";
  if (value.length > USERNAME_MAX) return "too_long";
  if (!USERNAME_ALLOWED.test(value)) return "invalid_characters";
  if (isReservedUsername(value)) return "reserved";
  // Pre-existing moderation, applied here so all three writing surfaces agree.
  // AUTH3 neither widens nor replaces it — see lib/profanity-filter.ts.
  if (containsProfanity(value)) return "profanity";
  return null;
}

export interface UsernameCheck {
  ok: boolean;
  /** The normalised name to store, when ok. */
  value?: string;
  /** A complete, user-facing sentence, when not. */
  error?: string;
  /** The machine-readable reason, when not. */
  problem?: UsernameProblem;
}

/** Validate and normalise a typed name. Never throws. */
export function validateUsername(raw: string): UsernameCheck {
  const value = cleanUsername(raw);
  const problem = usernameProblem(value);
  if (problem) return { ok: false, error: USERNAME_MESSAGES[problem], problem };
  return { ok: true, value };
}

/**
 * Whether this profile's name is a placeholder rather than a choice.
 *
 * Blank is the obvious case — what `handle_new_user()` writes for a signup that
 * carried no name. The second is the trigger's generated 'Anonymous<n>', and it
 * counts as a placeholder only while the row still says the account is
 * anonymous: once an account has converted, whatever its name says is the name
 * it kept, and Mogzy must not quietly decide otherwise.
 *
 * This is the client half of `is_claimed_display_name()` in the migration, and
 * the two are pinned together by test.
 */
export function isPlaceholderUsername(
  displayName: string | null | undefined,
  isAnonymous: boolean | null | undefined,
): boolean {
  const key = normalizeUsername(displayName);
  if (!key) return true;
  return isAnonymous === true && GENERATED_ANON_NAME.test(key);
}
