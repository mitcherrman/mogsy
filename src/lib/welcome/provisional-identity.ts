// ---------------------------------------------------------------------------
// Seeding a real profile from the provisional Academy registration (HI1-C5).
//
// The registration itself is device-local (see academy-registration.ts). This
// module is the one place it is allowed to touch the backend, and it does
// exactly one thing: if there IS already an auth user, and that user's profile
// has no display name yet, the name they just chose becomes it.
//
// EVERY WORD OF THAT IS A GUARD.
//
//   "if there IS already an auth user" — at /welcome there usually is not.
//   AuthProvider signs in anonymously only when the `require_auth` app_settings
//   row is disabled; under the default a first-time visitor is a pure guest.
//   No session means no write, silently — this is not an error state.
//
//   "has no display name yet" — the introduction is replayable forever at
//   /welcome, and a returning visitor with a real account replaying it must
//   never have their display name overwritten by an intro form. Blank-only is
//   the difference between seeding an identity and clobbering one.
//
//   "the name they just chose" — display_name is the column the whole product
//   already treats as the account's display identity (useProfileIdentity,
//   OnboardingProfile). Nothing new is invented, nothing is migrated.
//
// WHAT IS DELIBERATELY NOT HERE. No profile row is INSERTED: rows are created
// by the backend for real accounts, and manufacturing one from an introduction
// screen would be this phase inventing account lifecycle it has no authority
// over. No password is set: an account with no email or linked identity has
// nothing to authenticate against, so `updateUser({ password })` here would
// store a secret that can never be used. No rank is written: `profiles` has no
// rank column, and the self-report stays local until one exists.
//
// FIRE AND FORGET, ALWAYS. The caller is a submit handler that turns a page
// immediately afterwards. Nothing below may throw, and nothing may be awaited
// in a way that delays the page turn — a cold backend must cost the visitor
// nothing at all.
// ---------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";

export interface SeedResult {
  /** True when a display name was actually written. */
  seeded: boolean;
  /** Why not, when it wasn't. Diagnostic only — never surfaced to a visitor. */
  reason?: "no-session" | "no-profile" | "already-named" | "error";
}

/**
 * Seed `profiles.display_name` from a provisional registration, if and only if
 * every guard above is satisfied. Resolves rather than rejects, in every case.
 */
export async function seedProfileDisplayName(username: string): Promise<SeedResult> {
  const name = username.trim();
  if (!name) return { seeded: false, reason: "error" };

  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return { seeded: false, reason: "no-session" };

    const { data: profile, error: readErr } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) return { seeded: false, reason: "error" };
    // No row is a legitimate state for a brand-new anonymous user whose profile
    // has not been provisioned yet. It is NOT an invitation to create one.
    if (!profile) return { seeded: false, reason: "no-profile" };
    if (typeof profile.display_name === "string" && profile.display_name.trim()) {
      return { seeded: false, reason: "already-named" };
    }

    const { error: writeErr } = await supabase
      .from("profiles")
      .update({ display_name: name })
      .eq("user_id", userId);
    if (writeErr) return { seeded: false, reason: "error" };
    return { seeded: true };
  } catch {
    return { seeded: false, reason: "error" };
  }
}
