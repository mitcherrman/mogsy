// ---------------------------------------------------------------------------
// The ONE Mogzy password policy (AUTH1).
//
// Every surface where a NEW password can be established routes through this
// module: /auth signup, /reset-password, /auth/callback (guest conversion) and
// Settings → change password. Before AUTH1 those four surfaces each carried
// their own inline check and they DISAGREED — Settings demanded 8 characters
// while the other three demanded 6, so a password accepted at signup was
// rejected when the same user later tried to change it.
//
// The policy is deliberately minimal — length only:
//   - minimum 6 characters,
//   - NO required symbol, uppercase, lowercase, or digit,
//   - NO composition checklist and NO strength threshold that can block.
//
// Strength feedback is available (`describePasswordStrength`) but is PASSIVE:
// it returns a label for display and never participates in validation. Nothing
// in this module can reject a password of MIN_LENGTH or more.
//
// NOTE: Supabase enforces its own server-side minimum and optional "required
// characters" set from the project's Auth settings. This module cannot relax
// that — if the dashboard is stricter, signup still fails server-side with the
// dashboard's message. See docs/AUTH1_AUDIT.md.
// ---------------------------------------------------------------------------

/** The only hard requirement: length. */
export const PASSWORD_MIN_LENGTH = 6;

/** Copy shown under password fields and in the "too short" error. */
export const PASSWORD_RULE_TEXT = `At least ${PASSWORD_MIN_LENGTH} characters. No symbols or numbers required.`;

export interface PasswordValidation {
  ok: boolean;
  /** User-facing message when ok === false. */
  error?: string;
}

const OK: PasswordValidation = { ok: true };

/**
 * Validate a new password, optionally against its confirmation field.
 *
 * Pass `confirm` only where a confirmation input actually exists; surfaces
 * without one (Settings uses its own paired field, the callback uses two)
 * simply omit it. Length is checked BEFORE the match so a user who typed a
 * short password twice is told the real problem.
 */
export function validateNewPassword(
  password: string,
  confirm?: string,
): PasswordValidation {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (confirm !== undefined && password !== confirm) {
    return { ok: false, error: "Passwords don't match." };
  }
  return OK;
}

export type PasswordStrength = "short" | "fair" | "good" | "strong";

/**
 * PASSIVE strength hint for display only.
 *
 * Never call this from a submit path: a "fair" password is as acceptable as a
 * "strong" one, and treating this as a gate would reintroduce exactly the
 * strength threshold AUTH1 removed.
 */
export function describePasswordStrength(password: string): PasswordStrength {
  const len = password?.length ?? 0;
  if (len < PASSWORD_MIN_LENGTH) return "short";
  // Variety raises the label, never the requirement.
  const variety =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/[0-9]/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password));
  if (len >= 12 && variety >= 3) return "strong";
  if (len >= 8 || variety >= 3) return "good";
  return "fair";
}
