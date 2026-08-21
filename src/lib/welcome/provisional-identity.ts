// ---------------------------------------------------------------------------
// Adopting the Academy registration into a real profile (HI1-C5B).
//
// The registration itself is device-local (see academy-registration.ts). This
// module is the one place it becomes durable user data, and it is the whole of
// the provisional -> account migration path.
//
// TWO FIELDS, TWO HOMES, ONE RULE.
//
//   username -> profiles.display_name          (the existing identity model)
//   rank     -> profiles.league_rank           (+ league_rank_reported_at)
//
// The rule for both is FIRST-WRITE-WINS, evaluated per field:
//
//   display_name is written only if the profile does not already have a chosen
//   one. league_rank is written only if it is still NULL. Neither field can be
//   overwritten by this path, ever, so replaying /welcome on an established
//   account changes the local record and leaves the account exactly as it was.
//   Filling a NULL rank on an account that has none is additive, not
//   destructive, and is the one thing a replay is allowed to contribute.
//
// "A CHOSEN NAME" IS NOT THE SAME AS "A NON-EMPTY NAME". This is the trap that
// the first pass fell into. `handle_new_user()` does not leave an anonymous
// account's display_name blank — it writes 'Anonymous' || <count>. A blank
// check therefore never fires for exactly the visitors who DO have a session at
// /welcome, which was the entire case the write existed to serve. See
// isPlaceholderDisplayName below: blank, or the trigger's own generated
// placeholder on a row still marked anonymous.
//
// NO ROW IS EVER INSERTED. Profile rows are created by handle_new_user() on the
// auth trigger. An introduction screen manufacturing account lifecycle would be
// this phase claiming authority it does not have — and it would be the source
// of exactly the duplicate identities the C5B brief rules out. A missing row is
// a "not yet", not a "make one": the record stays unadopted and the bridge
// tries again on the next auth event or mount.
//
// ADOPTION IS ONCE, AND ONLY ONCE. `markAcademyRegistrationAdopted` is called
// on both terminal outcomes — written, and deliberately-not-written — so a
// settled record stops asking. Only recoverable states (no session, no row yet,
// a failed write) leave it unmarked.
//
// NOTHING HERE MAY THROW OR BLOCK. Callers are a submit handler that turns a
// page on the next line and an effect in an app-wide bridge. Every path
// resolves.
// ---------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";

import {
  markAcademyRegistrationAdopted,
  readAcademyRegistration,
  type AcademyRegistration,
} from "./academy-registration";

/**
 * The display name `handle_new_user()` generates for an anonymous account:
 * the literal 'Anonymous' followed by a count, and nothing else.
 *
 * Anchored and digits-only on purpose. A person who genuinely chooses to be
 * called "Anonymous", or "Anonymous Wizard", has chosen a name and keeps it.
 */
const GENERATED_ANON_NAME = /^Anonymous\d+$/;

/**
 * Whether this profile's display name is a placeholder rather than a choice.
 *
 * Blank is the obvious case (a real signup whose metadata carried no name).
 * The second case is the trigger's generated 'Anonymous<n>', and it is only
 * treated as a placeholder while the row still says the account is anonymous —
 * once an account has converted, whatever its name says is the name it kept.
 */
export function isPlaceholderDisplayName(
  displayName: string | null | undefined,
  isAnonymous: boolean | null | undefined,
): boolean {
  const name = (displayName ?? "").trim();
  if (!name) return true;
  return isAnonymous === true && GENERATED_ANON_NAME.test(name);
}

export type AdoptionReason =
  /** No auth user yet. The record waits; this is the ordinary state. */
  | "no-session"
  /** The auth user has no profile row yet. Retryable, never an insert. */
  | "no-profile"
  /** This record has already been written through to an account. */
  | "already-adopted"
  /** There is no local record to adopt. */
  | "nothing-to-adopt"
  /** The account already had both a chosen name and a rank. */
  | "profile-established"
  /** A read or a write failed. Retryable. */
  | "error";

export interface AdoptionResult {
  /** Fields actually written. Empty when nothing needed writing. */
  written: Array<"display_name" | "league_rank">;
  /** True when the record is settled and will not be retried. */
  settled: boolean;
  reason?: AdoptionReason;
  /**
   * True when the database did not yet have the rank column — the frontend is
   * live and the migration is not. See readProfile.
   */
  rankColumnMissing?: boolean;
}

const NOTHING = (reason: AdoptionReason, settled = false): AdoptionResult => ({
  written: [],
  settled,
  reason,
});

interface ProfileShape {
  display_name: string | null;
  is_anonymous: boolean | null;
  league_rank: string | null;
}

interface ProfileRead {
  ok: boolean;
  /** Null with ok: true means "no row yet" — a retryable "not yet". */
  profile: ProfileShape | null;
  /** The deployment does not have profiles.league_rank yet. */
  rankColumnMissing: boolean;
}

/**
 * Read the two fields, surviving a deployment where the migration has not run.
 *
 * WHY THIS FALLBACK EXISTS. The frontend and the SQL in this change ship
 * together but are APPLIED separately, and master auto-deploys. For however
 * long the bundle is live and 20260821120000_academy_self_reported_rank.sql is
 * not, selecting league_rank makes PostgREST reject the whole request — which
 * would take the NAME down with the rank, on the first screen a new visitor
 * ever sees, for every registration in that window.
 *
 * So a failed read is retried without the new column. If that succeeds we are
 * demonstrably in the gap: the name is still written (it is the more important
 * of the two, and its column has existed for years), and the record is left
 * UNADOPTED so the rank lands by itself on the first page load after the
 * migration is applied. Nothing has to be re-driven by hand.
 */
async function readProfile(userId: string): Promise<ProfileRead> {
  const full = await supabase
    .from("profiles")
    .select("display_name, is_anonymous, league_rank")
    .eq("user_id", userId)
    .maybeSingle();
  if (!full.error) {
    return { ok: true, profile: (full.data as ProfileShape) ?? null, rankColumnMissing: false };
  }

  const legacy = await supabase
    .from("profiles")
    .select("display_name, is_anonymous")
    .eq("user_id", userId)
    .maybeSingle();
  // Still failing without the new column: this is a real read failure (RLS, a
  // dead connection) rather than a missing migration. Report it as one.
  if (legacy.error) return { ok: false, profile: null, rankColumnMissing: false };

  const row = legacy.data as Omit<ProfileShape, "league_rank"> | null;
  return {
    ok: true,
    profile: row ? { ...row, league_rank: null } : null,
    rankColumnMissing: true,
  };
}

/**
 * Write a registration through to the signed-in account's profile.
 *
 * Exported separately from `adoptAcademyIdentity` so the register can adopt the
 * answer it has just taken without a round-trip through storage, and so the
 * rules above are testable without a bridge.
 */
export async function adoptRegistrationForUser(
  registration: AcademyRegistration,
  userId: string,
): Promise<AdoptionResult> {
  if (!userId) return NOTHING("no-session");
  const username = registration.username.trim();
  if (!username) return NOTHING("error");

  try {
    const { ok, profile, rankColumnMissing } = await readProfile(userId);
    if (!ok) return NOTHING("error");
    // A row that does not exist yet is a "not yet" — handle_new_user() owns
    // creating it. Leaving the record unadopted is what makes the retry real.
    if (!profile) return NOTHING("no-profile");

    const patch: Record<string, string> = {};
    if (isPlaceholderDisplayName(profile.display_name, profile.is_anonymous)) {
      patch.display_name = username;
    }
    // Skipped entirely while the column does not exist — writing it would fail
    // the whole update and take the name with it.
    if (!rankColumnMissing && profile.league_rank == null) {
      patch.league_rank = registration.rank;
      patch.league_rank_reported_at = registration.at || new Date().toISOString();
    }

    if (Object.keys(patch).length === 0) {
      // Nothing left to contribute. Settled — unless the only reason there is
      // nothing to write is that the rank column has not shipped yet, in which
      // case this record still owes the account a rank.
      if (!rankColumnMissing) markAcademyRegistrationAdopted(userId);
      return {
        written: [],
        settled: !rankColumnMissing,
        reason: "profile-established",
        rankColumnMissing,
      };
    }

    const { error: writeErr } = await supabase
      .from("profiles")
      .update(patch)
      .eq("user_id", userId);
    if (writeErr) return NOTHING("error");

    // Only a write that got BOTH halves is finished with this record.
    if (!rankColumnMissing) markAcademyRegistrationAdopted(userId);
    return {
      written: (["display_name", "league_rank"] as const).filter((k) => k in patch),
      settled: !rankColumnMissing,
      rankColumnMissing,
    };
  } catch {
    return NOTHING("error");
  }
}

/**
 * Adopt whatever this device is holding, for whoever is signed in now.
 *
 * The entry point the identity bridge calls on every auth change and the
 * register calls immediately after saving. Cheap and silent when there is
 * nothing to do, which is the overwhelmingly common case.
 */
export async function adoptAcademyIdentity(userId?: string | null): Promise<AdoptionResult> {
  const registration = readAcademyRegistration();
  if (!registration) return NOTHING("nothing-to-adopt", true);
  if (registration.adoptedBy) return NOTHING("already-adopted", true);

  let id = userId ?? null;
  if (!id) {
    try {
      // getSession, NOT getUser. getUser makes a network call to /auth/v1/user
      // that a signed-out visitor answers with a 400 — which is the ordinary
      // state on this route, so it would mean a failed request and a console
      // error on the first screen a new visitor ever sees. getSession reads the
      // stored token locally. A stale one costs nothing: the write then fails
      // against RLS and the record stays retryable, which is the same path any
      // other failure takes.
      const { data } = await supabase.auth.getSession();
      id = data?.session?.user?.id ?? null;
    } catch {
      return NOTHING("error");
    }
  }
  if (!id) return NOTHING("no-session");

  return adoptRegistrationForUser(registration, id);
}
