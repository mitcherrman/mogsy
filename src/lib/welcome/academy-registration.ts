// ---------------------------------------------------------------------------
// Academy Registration (HI1-C5) — the visitor's name and self-reported rank.
//
// WHAT THIS IS FOR. The introduction used to hand a visitor to the product as
// an unnamed guest. Page two now asks for two things, and only two, before the
// tour continues: what to call them, and roughly where they play. This module
// owns the local half of that record. It is not the account.
//
// TWO ANSWERS, NOT FOUR (HI1-C5B). The first pass also collected an optional
// password and a "link Riot / Discord / email later" checkbox. Both are gone,
// and deliberately so rather than merely hidden. A password with no email or
// linked identity behind it can authenticate nothing, so collecting one on this
// page meant either storing a secret with no destination or recording a boolean
// that promised an account the introduction had not made. A linking checkbox
// with no Verify page to send anyone to was the same promise in a different
// shape. Both belong to the Verify experience when it is built, where they can
// be honest; nothing in this welcome flow may imply they exist.
//
// THESE TWO ANSWERS ARE DURABLE USER DATA, NOT ONBOARDING STATE. That is the
// whole difference between C5 and C5B. The name maps onto profiles.display_name
// — the column the entire product already treats as an account's display
// identity — and the rank has its own column and its own migration (see
// supabase/migrations/20260821120000_academy_self_reported_rank.sql). What lives
// here is the DEVICE-LOCAL half of a two-stage write, for the very common case
// where the visitor has no session yet.
//
// WHY THERE IS A LOCAL HALF AT ALL. At /welcome there is very often no auth
// session: AuthProvider signs in anonymously only when the `require_auth`
// app_settings row is explicitly disabled, so under the default a first-time
// visitor is a pure signed-out guest and RLS would reject any write made on
// their behalf. Rather than pretend that is persistence, the answers are
// recorded here and ADOPTED into the profile the moment a session exists — at
// registration time if there is one, and otherwise by the identity bridge as
// soon as one appears. See provisional-identity.ts for the adoption rules; the
// `adoptedBy` field below is the whole of the bookkeeping.
// ---------------------------------------------------------------------------

import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";

/**
 * The self-reported League rank options, in ladder order.
 *
 * DELIBERATELY NOT `lib/progression/tiers.ts`. That module's five tiers
 * (bronze/silver/gold/diamond/challenger) are MOGZY's own progression
 * vocabulary, scored by quiz XP and by the Ranked rating — they are not the
 * Riot ladder, they do not cover Iron/Platinum/Emerald/Master/Grandmaster, and
 * rendering this answer with that art would tell the visitor their self-report
 * had been converted into a Mogzy rank it has nothing to do with. The two
 * vocabularies must not be joined by accident, so this list stands alone.
 *
 * THIS LIST AND THE MIGRATION'S CHECK CONSTRAINT ARE ONE VOCABULARY. The ids
 * below are exactly the values profiles.league_rank accepts; a value added here
 * and not there is a write that fails at the database. academy-registration
 * .schema.test.ts pins the two together.
 *
 * `unranked` and `unsure` are both first-class answers, not fallbacks: the
 * field is required, and "I don't know" is a real thing to know about someone.
 */
export const LEAGUE_RANKS = [
  { id: "unranked", label: "Unranked" },
  { id: "iron", label: "Iron" },
  { id: "bronze", label: "Bronze" },
  { id: "silver", label: "Silver" },
  { id: "gold", label: "Gold" },
  { id: "platinum", label: "Platinum" },
  { id: "emerald", label: "Emerald" },
  { id: "diamond", label: "Diamond" },
  { id: "master", label: "Master" },
  { id: "grandmaster", label: "Grandmaster" },
  { id: "challenger", label: "Challenger" },
  { id: "unsure", label: "Not sure / Prefer not to say" },
] as const;

export type LeagueRankId = (typeof LEAGUE_RANKS)[number]["id"];

const RANK_IDS: readonly string[] = LEAGUE_RANKS.map((r) => r.id);

export function isLeagueRankId(value: unknown): value is LeagueRankId {
  return typeof value === "string" && RANK_IDS.includes(value);
}

/** The display label for a rank id, or null when the id is not one of ours. */
export function leagueRankLabel(value: unknown): string | null {
  return LEAGUE_RANKS.find((r) => r.id === value)?.label ?? null;
}

/* -------------------------------------------------------------------------- */
/* The record                                                                  */
/* -------------------------------------------------------------------------- */

export interface AcademyRegistration {
  /** What the Academy calls this visitor. Required, trimmed, never empty. */
  username: string;
  /** Self-reported League rank. Required — but "unranked"/"unsure" are valid. */
  rank: LeagueRankId;
  /** ISO timestamp of the answer. Also what is written to the profile. */
  at: string;
  /**
   * The auth user this record has already been written through to, or null
   * while it is still only local.
   *
   * ADOPTION HAPPENS AT MOST ONCE, and this is how that is enforced. Set it and
   * the bridge stops trying; leave it null and the next session tries again.
   * Once-only is the conservative reading on purpose: a device is not a person,
   * and a provisional name typed by whoever opened the browser first must not
   * follow every account that later signs in on it.
   */
  adoptedBy?: string | null;
}

/** Follows the `mogsy.<domain>.v<n>` convention of every other local record. */
export const ACADEMY_REGISTRATION_STORAGE_KEY = "mogsy.academyRegistration.v1";

/** Longest name the register will hold. Long enough for a real Riot ID tag. */
export const USERNAME_MAX = 24;
/** Shortest name worth calling someone by. */
export const USERNAME_MIN = 2;

/** Letters, digits, spaces and a few name-ish punctuation marks. */
const USERNAME_ALLOWED = /^[\p{L}\p{N} ._'-]+$/u;

export interface UsernameCheck {
  ok: boolean;
  /** The normalised name to store, when ok. */
  value?: string;
  /** A complete, user-facing sentence, when not. */
  error?: string;
}

/**
 * Validate and normalise a typed name.
 *
 * Normalisation is part of validation on purpose: the stored name is the one
 * that will be printed back at the visitor AND written to profiles.display_name,
 * so runs of whitespace are collapsed and the ends are trimmed before anything
 * is measured. Nothing here rejects a name for being unusual — no reserved-word
 * list, no profanity filter, no uniqueness check. Uniqueness in particular is
 * NOT enforceable from this screen: a signed-out visitor has no account and no
 * server to ask, and display_name carries no unique index.
 */
export function validateUsername(raw: string): UsernameCheck {
  const value = raw.replace(/\s+/g, " ").trim();
  if (!value) return { ok: false, error: "Every student needs a name." };
  if (value.length < USERNAME_MIN) {
    return { ok: false, error: `A name needs at least ${USERNAME_MIN} characters.` };
  }
  if (value.length > USERNAME_MAX) {
    return { ok: false, error: `Names are up to ${USERNAME_MAX} characters.` };
  }
  if (!USERNAME_ALLOWED.test(value)) {
    return { ok: false, error: "Letters, numbers, spaces and . _ ' - only." };
  }
  return { ok: true, value };
}

function readRaw(): string | null {
  try {
    return typeof localStorage !== "undefined"
      ? localStorage.getItem(ACADEMY_REGISTRATION_STORAGE_KEY)
      : null;
  } catch {
    return null;
  }
}

/**
 * The visitor's registration, or null when there isn't a usable one.
 *
 * Same posture as readAcademyWelcomeState: absent, unparseable, non-object,
 * array, missing name, unrecognised rank — every one of them is null, because
 * the worst case of "null" is asking a name again and the worst case of
 * trusting a malformed record is writing garbage into someone's profile.
 * Never throws.
 */
export function readAcademyRegistration(): AcademyRegistration | null {
  const raw = readRaw();
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const { username, rank, at, adoptedBy } = parsed as Record<string, unknown>;
  if (typeof username !== "string") return null;
  const checked = validateUsername(username);
  if (!checked.ok || !checked.value) return null;
  if (!isLeagueRankId(rank)) return null;

  return {
    username: checked.value,
    rank,
    at: typeof at === "string" ? at : "",
    adoptedBy: typeof adoptedBy === "string" && adoptedBy ? adoptedBy : null,
  };
}

/** Whether this device already has a named Academy identity. */
export function hasAcademyRegistration(): boolean {
  return readAcademyRegistration() !== null;
}

/**
 * Record the registration. Last-write-wins, like every other replayable record
 * here: replaying the introduction and giving a different answer means the
 * newer answer is the accurate one.
 *
 * A re-registration CLEARS `adoptedBy`, because a new answer has not been
 * written through to anything yet. What that cannot do is overwrite an
 * established profile — the adoption rules downstream are first-write-wins per
 * field, so a replay by someone who already has a display name changes their
 * local record and leaves their account alone.
 *
 * Silent on failure. This is called from a submit handler that turns a page
 * immediately afterwards, and a quota error thrown out of it would strand the
 * visitor on page two of an introduction.
 */
export function saveAcademyRegistration(input: {
  username: string;
  rank: LeagueRankId;
}): AcademyRegistration | null {
  const checked = validateUsername(input.username);
  if (!checked.ok || !checked.value) return null;
  if (!isLeagueRankId(input.rank)) return null;

  const record: AcademyRegistration = {
    username: checked.value,
    rank: input.rank,
    at: new Date().toISOString(),
    adoptedBy: null,
  };
  writeRecord(record);
  return record;
}

function writeRecord(record: AcademyRegistration): void {
  try {
    localStorage.setItem(ACADEMY_REGISTRATION_STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* private mode or quota — the identity is still live for this session */
  }
}

/**
 * Mark the local record as written through to `userId`.
 *
 * Called by the adoption path once it has either written the profile or
 * established that it must not (an account that already has a name). Both are
 * "this record is settled"; only a state that could still succeed later — no
 * session, no profile row yet, a failed write — leaves it unmarked so the
 * bridge tries again.
 */
export function markAcademyRegistrationAdopted(userId: string): void {
  const record = readAcademyRegistration();
  if (!record || !userId) return;
  writeRecord({ ...record, adoptedBy: userId });
}

/** Forget the registration. Exposed for QA and tests, not wired to any UI. */
export function clearAcademyRegistration(): void {
  try {
    localStorage.removeItem(ACADEMY_REGISTRATION_STORAGE_KEY);
  } catch {
    /* disabled storage */
  }
}

/* -------------------------------------------------------------------------- */
/* The returning visitor's way out                                             */
/* -------------------------------------------------------------------------- */

/**
 * Where the register's "Sign In" sends someone who already has an account.
 *
 * THE EXISTING AUTH SCREEN, NOT A SECOND ONE. /auth already owns sign-in,
 * confirmation resends, the forgotten-password path and the guest-upgrade
 * panel; a login built into the introduction would be a second implementation
 * of all of it, drifting from the first.
 *
 * `returnTo` is read by /auth through safeReturnPath(), which accepts only
 * same-origin absolute paths — so this constant is both the destination and a
 * value that machinery will actually honour. It is the HUB, deliberately: this
 * person already knows Mogzy, and dropping them back into chapter three of an
 * introduction after they have proved who they are would be absurd.
 */
export const ACADEMY_SIGN_IN_ROUTE = `/auth?mode=signin&returnTo=${encodeURIComponent(
  LEAGUE_HOME_ROUTE,
)}`;
