// ---------------------------------------------------------------------------
// Academy Registration (HI1-C5) — the provisional, named identity.
//
// WHAT THIS IS FOR. The introduction used to hand a visitor to the product as
// an unnamed guest. Page two now asks for a name and a self-reported rank
// before the tour continues, so that everything downstream has someone to
// address. This module owns that record and nothing else: no components, no
// network, no auth.
//
// WHY IT IS DEVICE-LOCAL, AND WHY THAT IS THE HONEST ANSWER TODAY.
// At /welcome there is very often NO auth session at all. AuthProvider only
// calls `signInAnonymously()` when the `require_auth` app_settings row is
// explicitly disabled; with the default (enabled) a first-time visitor reaches
// this page as a pure signed-out guest, and RLS would reject any write made on
// their behalf. There is also nowhere to put a self-reported League rank:
// `profiles` has display_name, is_anonymous and onboarding_completed, and no
// rank column of any kind. So the registration is recorded here, beside
// `mogsy.academyWelcome.v1`, in exactly the same shape and with exactly the
// same failure posture — every unreadable state collapses to "not registered",
// and a blocked write costs the visitor a re-ask and never an exception.
//
// This is deliberately the FOUNDATION of the named-account transition rather
// than the transition itself. The record is additive: it takes nothing away
// from anonymous auth, it breaks no existing user, and when a real account
// later exists the name it carries is what seeds that account's display name
// (see provisional-identity.ts). Removing anonymous use is a later phase with
// backend work in front of it — see the report accompanying this change.
//
// THE PASSWORD IS NEVER STORED. Not here, not in localStorage, not in a URL.
// The same rule lib/auth/account-upgrade.ts states for the email upgrade holds
// here for the same reason, and it is why the record carries only the BOOLEAN
// `hasPassword`. A password typed during registration lives in module memory
// for the life of the page (see stashRegistrationPassword) and is gone on
// reload, which is the correct behaviour for a secret with nowhere to go yet:
// there is no email or identity attached to a brand-new provisional account,
// so no password could authenticate anything until one is linked.
// ---------------------------------------------------------------------------

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
  /**
   * The visitor chose to set a password. The password ITSELF is never stored;
   * this only records that one was asked for, so a later verification step can
   * say "you already picked a password" rather than silently forgetting.
   */
  hasPassword: boolean;
  /**
   * They ticked the linking box. This is the whole of the verification INTENT
   * that HI1-C5 is allowed to record: no provider is chosen, no request is
   * made, nothing is promised. See resolveLinkDestination().
   */
  wantsLinking: boolean;
  /** ISO timestamp. Diagnostic only — nothing branches on it. */
  at: string;
}

/** Follows the `mogsy.<domain>.v<n>` convention of every other local record. */
export const ACADEMY_REGISTRATION_STORAGE_KEY = "mogsy.academyRegistration.v1";

/** Longest name the register will hold. Long enough for a real Riot ID tag. */
export const USERNAME_MAX = 24;
/** Shortest name worth calling someone by. */
export const USERNAME_MIN = 2;
/**
 * Shortest password accepted, matching /auth (Auth.tsx) exactly. A second,
 * stricter rule here would mean a password that registration accepts and the
 * real sign-up screen rejects, or the reverse.
 */
export const PASSWORD_MIN = 6;

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
 * that will be printed back at the visitor, so runs of whitespace are collapsed
 * and the ends are trimmed before anything is measured. Nothing here rejects a
 * name for being unusual — no reserved-word list, no profanity filter, no
 * uniqueness check. Uniqueness in particular is NOT enforceable from this
 * screen: there is no account and no server to ask, and pretending otherwise
 * would be exactly the fake backend this phase is not allowed to build.
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

/** Validate the OPTIONAL password. An empty string is valid — it means "none". */
export function validatePassword(raw: string): { ok: boolean; error?: string } {
  if (!raw) return { ok: true };
  if (raw.length < PASSWORD_MIN) {
    return { ok: false, error: `A password needs at least ${PASSWORD_MIN} characters.` };
  }
  return { ok: true };
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
 * trusting a malformed record is addressing someone by garbage. Never throws.
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

  const { username, rank, hasPassword, wantsLinking, at } = parsed as Record<string, unknown>;
  if (typeof username !== "string") return null;
  const checked = validateUsername(username);
  if (!checked.ok || !checked.value) return null;
  if (!isLeagueRankId(rank)) return null;

  return {
    username: checked.value,
    rank,
    hasPassword: hasPassword === true,
    wantsLinking: wantsLinking === true,
    at: typeof at === "string" ? at : "",
  };
}

/** Whether this device already has a named Academy identity. */
export function hasAcademyRegistration(): boolean {
  return readAcademyRegistration() !== null;
}

/**
 * Record the registration. Last-write-wins, like the welcome outcome: replaying
 * the introduction and giving a different name means the newer answer is the
 * accurate one.
 *
 * Silent on failure. This is called from a submit handler that navigates
 * immediately afterwards, and a quota error thrown out of it would strand the
 * visitor on page two of an introduction.
 */
export function saveAcademyRegistration(
  input: Omit<AcademyRegistration, "at">,
): AcademyRegistration | null {
  const checked = validateUsername(input.username);
  if (!checked.ok || !checked.value) return null;
  if (!isLeagueRankId(input.rank)) return null;

  const record: AcademyRegistration = {
    username: checked.value,
    rank: input.rank,
    hasPassword: input.hasPassword === true,
    wantsLinking: input.wantsLinking === true,
    at: new Date().toISOString(),
  };
  try {
    localStorage.setItem(ACADEMY_REGISTRATION_STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* private mode or quota — the identity is still live for this session */
  }
  return record;
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
/* What the register's form is holding, before it is a record                  */
/* -------------------------------------------------------------------------- */

/**
 * The four answers as the form holds them, mid-edit.
 *
 * Distinct from AcademyRegistration on purpose, and the difference is exactly
 * the difference between "being filled in" and "filled in": the rank may still
 * be unchosen (`""`, which is not a LeagueRankId), the name is un-normalised,
 * and the PASSWORD IS PRESENT — this shape is never stored, and nothing may
 * serialise it. It lives here rather than beside the form so that a component
 * file exports only components.
 */
export interface RegistrationValue {
  username: string;
  rank: LeagueRankId | "";
  password: string;
  wantsLinking: boolean;
}

export const EMPTY_REGISTRATION: RegistrationValue = {
  username: "",
  rank: "",
  password: "",
  wantsLinking: false,
};

/* -------------------------------------------------------------------------- */
/* The password, in memory only                                                */
/* -------------------------------------------------------------------------- */

let pendingPassword: string | null = null;

/**
 * Hold a just-typed password for the rest of this page session.
 *
 * MODULE MEMORY, DELIBERATELY. A reload loses it, another tab never sees it,
 * and nothing serialises it — which is the entire point. It exists so that the
 * Verify / Link Accounts step, when it ships, can set the password the visitor
 * already chose in the same sitting instead of asking twice; if they reload
 * first they are simply asked again, which is a correct outcome rather than a
 * bug. Nothing may make this durable without a real destination for it.
 */
export function stashRegistrationPassword(password: string): void {
  pendingPassword = password || null;
}

/** Take the held password, if any, and forget it. Single-use by design. */
export function consumeRegistrationPassword(): string | null {
  const held = pendingPassword;
  pendingPassword = null;
  return held;
}

/** Drop the held password without reading it. */
export function clearRegistrationPassword(): void {
  pendingPassword = null;
}

/* -------------------------------------------------------------------------- */
/* The verification seam                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Where a visitor who asked to link an account should be sent, once such a
 * page exists.
 *
 * NULL TODAY, AND THAT IS THE IMPLEMENTATION. There is no Verify / Link
 * Accounts route in this app — App.tsx has /auth, /auth/callback and
 * /reset-password, and none of them is a "link Riot or Discord" surface. The
 * intent is recorded on the registration record; this function is the single
 * place that turns that intent into a destination, so shipping the page is a
 * one-line change here rather than a hunt through the introduction. Until then
 * the final exits behave exactly as they did before, which is the only
 * behaviour that can be honest about a page that does not exist.
 */
export const ACADEMY_VERIFY_ROUTE: string | null = null;

/**
 * The route to send this visitor to after the introduction, or null to use the
 * introduction's normal exit. Reads current storage rather than a cached value,
 * for the same reason resolveEntryDestination does.
 */
export function resolveLinkDestination(): string | null {
  if (!ACADEMY_VERIFY_ROUTE) return null;
  return readAcademyRegistration()?.wantsLinking ? ACADEMY_VERIFY_ROUTE : null;
}
