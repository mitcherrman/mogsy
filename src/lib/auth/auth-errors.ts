// ---------------------------------------------------------------------------
// AUTH2 — the ONE Supabase-auth error mapper.
//
// Users must never read Supabase's vocabulary. The production bug this audit
// started from was visible precisely because a raw GoTrue string reached the
// screen:
//
//   "Updating password of an anonymous user without an email or phone is not
//    allowed"
//
// Nothing in that sentence tells a person what to do. Worse, error handling was
// split across surfaces and they DISAGREED: `/auth` signup matched the literal
// "already been registered" while GoTrue actually returns "User already
// registered" for a duplicate signup, so the one case with an obvious next step
// ("sign in instead") fell through to the generic branch and printed the raw
// text. This module is the single place that decides what a user reads.
//
// Matching prefers `error.code` (a stable GoTrue error code) and only falls
// back to substring matching on the message, because messages are prose and
// change between releases — that is exactly how the mismatch above happened.
//
// The default is deliberately generic. A message this module does not
// recognise is a message we have not written copy for, and shipping the raw
// string "just this once" is how implementation details leak.
// ---------------------------------------------------------------------------

/** What went wrong, in product terms rather than GoTrue terms. */
export type AuthErrorKind =
  | "email_in_use"
  | "invalid_credentials"
  | "email_not_confirmed"
  | "weak_password"
  | "invalid_email"
  | "rate_limited"
  | "unknown";

export interface MappedAuthError {
  kind: AuthErrorKind;
  /** Safe, user-facing text. Never a Supabase string. */
  message: string;
  /**
   * True when the useful next step is signing in to an account that already
   * exists. Surfaces use this to offer a Sign In affordance inline instead of
   * dead-ending the user on an error.
   */
  offerSignIn: boolean;
}

export interface SupabaseAuthErrorLike {
  message?: string | null;
  code?: string | null;
  status?: number | null;
}

const GENERIC = "We couldn't complete that. Please try again.";

/**
 * Stable GoTrue error codes, which are the reliable signal. Verified against
 * the live project (see docs/AUTH2_AUDIT.md "Probe results"):
 *   - duplicate signup            -> user_already_exists
 *   - upgrade to a taken email    -> email_exists
 *   - password below the minimum  -> weak_password
 *   - wrong email/password        -> invalid_credentials
 */
const BY_CODE: Record<string, AuthErrorKind> = {
  email_exists: "email_in_use",
  user_already_exists: "email_in_use",
  identity_already_exists: "email_in_use",
  invalid_credentials: "invalid_credentials",
  email_not_confirmed: "email_not_confirmed",
  weak_password: "weak_password",
  email_address_invalid: "invalid_email",
  validation_failed: "unknown",
  over_request_rate_limit: "rate_limited",
  over_email_send_rate_limit: "rate_limited",
};

function kindFromMessage(raw: string): AuthErrorKind {
  const msg = raw.toLowerCase();
  // "User already registered" / "A user with this email address has already
  // been registered" — both real, both mean the same thing to a person.
  if (
    msg.includes("already registered") ||
    msg.includes("already been registered") ||
    msg.includes("already exists") ||
    msg.includes("already in use")
  ) {
    return "email_in_use";
  }
  if (msg.includes("invalid login credentials")) return "invalid_credentials";
  if (msg.includes("email not confirmed")) return "email_not_confirmed";
  if (msg.includes("password") && (msg.includes("should be at least") || msg.includes("too short"))) {
    return "weak_password";
  }
  if (msg.includes("rate limit") || msg.includes("too many")) return "rate_limited";
  if (msg.includes("invalid") && msg.includes("email")) return "invalid_email";
  return "unknown";
}

const COPY: Record<AuthErrorKind, { message: string; offerSignIn: boolean }> = {
  email_in_use: {
    message: "That email already has an account.",
    offerSignIn: true,
  },
  invalid_credentials: {
    message: "Wrong email or password. Check them and try again.",
    offerSignIn: false,
  },
  // Retained for completeness. With auto-confirm on this is unreachable in the
  // normal flow, and it must never read as "you cannot use Mogzy yet".
  email_not_confirmed: {
    message: "Check your inbox for the confirmation link, or resend it below.",
    offerSignIn: false,
  },
  weak_password: {
    message: "Password must be at least 6 characters.",
    offerSignIn: false,
  },
  invalid_email: {
    message: "That email address looks invalid.",
    offerSignIn: false,
  },
  rate_limited: {
    message: "Too many attempts. Wait a moment and try again.",
    offerSignIn: false,
  },
  unknown: { message: GENERIC, offerSignIn: false },
};

/**
 * Map a Supabase auth error to something a person can act on.
 *
 * `context` names the operation for the console only — it never reaches the
 * screen. The raw message is logged so debugging keeps everything this mapper
 * deliberately withholds from the UI.
 */
export function mapAuthError(
  error: SupabaseAuthErrorLike | null | undefined,
  context = "auth",
): MappedAuthError {
  const raw = typeof error?.message === "string" ? error.message : "";
  const code = typeof error?.code === "string" ? error.code : "";

  let kind: AuthErrorKind = code && BY_CODE[code] ? BY_CODE[code] : "unknown";
  // `validation_failed` is a catch-all code covering unrelated failures, so a
  // message read is the only way to tell them apart. Same fallback when the
  // code is missing entirely (older clients, network-shaped errors).
  if (kind === "unknown" && raw) kind = kindFromMessage(raw);

  if (kind === "unknown" && raw) {
    // Unrecognised: the user gets the generic line, we keep the detail.
    console.error(`[auth:${context}] unmapped error`, { code, message: raw });
  }

  const copy = COPY[kind];
  return { kind, message: copy.message, offerSignIn: copy.offerSignIn };
}
