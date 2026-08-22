/**
 * AUTH2 §12 — users read product language, never Supabase's.
 *
 * The inputs below are the REAL shapes returned by the live project, captured
 * while reproducing the guest-signup failure (docs/AUTH2_AUDIT.md records the
 * probe). Hand-invented error strings are what let the previous mapping drift:
 * `/auth` matched "already been registered" while the signup endpoint actually
 * says "User already registered", so the one case with an obvious next step
 * printed a raw string instead.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mapAuthError } from "./auth-errors";

/** Verbatim from the live project. */
const REAL = {
  anonPassword: {
    status: 422,
    code: "validation_failed",
    message: "Updating password of an anonymous user without an email or phone is not allowed",
  },
  duplicateSignup: { status: 422, code: "user_already_exists", message: "User already registered" },
  takenOnUpgrade: {
    status: 422,
    code: "email_exists",
    message: "A user with this email address has already been registered",
  },
  wrongPassword: { status: 400, code: "invalid_credentials", message: "Invalid login credentials" },
  shortPassword: {
    status: 422,
    code: "weak_password",
    message: "Password should be at least 6 characters.",
  },
};

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("the error that started this audit", () => {
  it("never reaches the user as written", () => {
    const mapped = mapAuthError(REAL.anonPassword);
    expect(mapped.message).not.toMatch(/anonymous/i);
    expect(mapped.message).not.toMatch(/phone/i);
    expect(mapped.message).toBe("We couldn't complete that. Please try again.");
  });

  it("is still logged in full, so debugging loses nothing", () => {
    mapAuthError(REAL.anonPassword, "upgrade");
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("upgrade"),
      expect.objectContaining({ message: REAL.anonPassword.message }),
    );
  });
});

describe("both duplicate-email shapes", () => {
  it.each([
    ["signup", REAL.duplicateSignup],
    ["guest upgrade", REAL.takenOnUpgrade],
  ])("%s resolves to email_in_use with a Sign In offer", (_label, error) => {
    const mapped = mapAuthError(error);
    expect(mapped.kind).toBe("email_in_use");
    expect(mapped.offerSignIn).toBe(true);
    expect(mapped.message).toMatch(/already has an account/i);
  });
});

describe("the rest of the real cases", () => {
  it("maps a wrong password without echoing the server", () => {
    const mapped = mapAuthError(REAL.wrongPassword);
    expect(mapped.kind).toBe("invalid_credentials");
    expect(mapped.message).not.toContain("Invalid login credentials");
    expect(mapped.offerSignIn).toBe(false);
  });

  it("states the real minimum for a short password", () => {
    expect(mapAuthError(REAL.shortPassword).message).toMatch(/at least 6 characters/i);
  });
});

describe("matching strategy", () => {
  it("prefers the stable code over the prose message", () => {
    // Same code, message reworded by a future release: still mapped.
    expect(mapAuthError({ code: "email_exists", message: "totally new wording" }).kind).toBe(
      "email_in_use",
    );
  });

  it("still recognises a message when no code is present", () => {
    // Older clients and network-shaped errors carry no code at all.
    expect(mapAuthError({ message: "User already registered" }).kind).toBe("email_in_use");
  });

  it("falls back to the generic line for anything unrecognised", () => {
    const mapped = mapAuthError({ code: "unexpected_failure", message: "Database error saving new user" });
    expect(mapped.kind).toBe("unknown");
    expect(mapped.message).not.toContain("Database");
  });

  it("handles a missing error object without throwing", () => {
    expect(mapAuthError(null).kind).toBe("unknown");
    expect(mapAuthError(undefined).message).toBeTruthy();
  });
});
