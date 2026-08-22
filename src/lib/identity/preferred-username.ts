// ---------------------------------------------------------------------------
// AUTH3 — what the username field should already say.
//
// The rule the brief asks for, in one function: a person who has already told
// Mogzy what to call them is never asked again. Signup prefills; it does not
// interrogate.
//
// THE ORDER, AND WHY IT IS THIS ORDER.
//
//   1. The account's own chosen name. If the profile already carries a real
//      name — a guest who registered at /welcome and had it adopted, or anyone
//      who has renamed themselves since — that IS what Mogzy calls them today,
//      and it outranks anything a browser is holding.
//
//   2. The Academy registration on this device. The visitor answered "what
//      should we call you?" on page two of the introduction and has no account
//      yet, so there is nothing above it to prefer. This is the carry-forward
//      that stops signup from asking a second time.
//
//   3. Nothing. The field is empty and the form invites a choice — which is the
//      right state for a guest still called 'Anonymous5472', because a
//      generated placeholder is not an answer to prefill.
//
// EMAIL IS NEVER A SOURCE, AT ANY POSITION. Deriving `john.smith` from
// `john.smith@gmail.com` would publish a real name, and the local part of an
// address is private data the person gave us for one purpose. There is no
// branch here that reads an email, and there must never be one.
// ---------------------------------------------------------------------------

import { readAcademyRegistration } from "@/lib/welcome/academy-registration";

import { cleanUsername, isPlaceholderUsername } from "./username";

export interface PreferredUsernameInput {
  /** The signed-in account's current profiles.display_name, if any. */
  profileName?: string | null;
  /** Whether that account is still an anonymous guest. */
  isAnonymous?: boolean | null;
}

/** Where a prefilled name came from. Surfaces use it to word the field. */
export type PreferredUsernameSource = "profile" | "academy" | "none";

export interface PreferredUsername {
  value: string;
  source: PreferredUsernameSource;
}

export function readPreferredUsername(
  input: PreferredUsernameInput = {},
): PreferredUsername {
  const profileName = cleanUsername(input.profileName);
  if (profileName && !isPlaceholderUsername(profileName, input.isAnonymous)) {
    return { value: profileName, source: "profile" };
  }

  // Never throws and never inserts: a missing, malformed or already-adopted
  // record all read as "no local answer" (see lib/welcome/academy-registration).
  const registration = readAcademyRegistration();
  const academyName = cleanUsername(registration?.username);
  if (academyName) return { value: academyName, source: "academy" };

  return { value: "", source: "none" };
}
