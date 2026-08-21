import { describe, expect, it } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  describePasswordStrength,
  validateNewPassword,
} from "./password-policy";

describe("AUTH1 password policy — length only", () => {
  it("requires exactly 6 characters and nothing else", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(6);
  });

  it("accepts a 6-character password", () => {
    expect(validateNewPassword("abcdef").ok).toBe(true);
  });

  it("accepts a password with no symbol", () => {
    expect(validateNewPassword("abc123").ok).toBe(true);
  });

  it("accepts a password with no uppercase character", () => {
    expect(validateNewPassword("alllowercase").ok).toBe(true);
  });

  it("accepts a password with no number", () => {
    expect(validateNewPassword("noDigitsHere").ok).toBe(true);
  });

  it("accepts a password with no lowercase character", () => {
    expect(validateNewPassword("ALLCAPS").ok).toBe(true);
  });

  it("accepts an all-digit password", () => {
    expect(validateNewPassword("123456").ok).toBe(true);
  });

  it("accepts a password made only of spaces-and-symbols", () => {
    // No composition checklist means no character class is required OR banned.
    expect(validateNewPassword("!!!!!!").ok).toBe(true);
  });

  it("rejects fewer than 6 characters", () => {
    expect(validateNewPassword("abcde").ok).toBe(false);
    expect(validateNewPassword("").ok).toBe(false);
    expect(validateNewPassword("abcde").error).toContain("6");
  });

  it("rejects a non-string password rather than throwing", () => {
    expect(validateNewPassword(undefined as unknown as string).ok).toBe(false);
  });
});

describe("confirmation field", () => {
  it("rejects a mismatch when a confirmation is supplied", () => {
    expect(validateNewPassword("abcdef", "abcdeg").ok).toBe(false);
    expect(validateNewPassword("abcdef", "abcdeg").error).toMatch(/match/i);
  });

  it("accepts a match", () => {
    expect(validateNewPassword("abcdef", "abcdef").ok).toBe(true);
  });

  it("ignores confirmation entirely when it is not supplied", () => {
    expect(validateNewPassword("abcdef").ok).toBe(true);
  });

  it("reports the length problem BEFORE the mismatch", () => {
    // A user who typed a short password twice should be told the real reason.
    expect(validateNewPassword("abc", "abc").error).toContain("6");
  });
});

describe("strength feedback is passive", () => {
  it("labels without ever rejecting", () => {
    // Every one of these is accepted; the label is display-only.
    for (const pw of ["abcdef", "abcdefgh", "Abcdef1!xyz9"]) {
      expect(validateNewPassword(pw).ok).toBe(true);
      expect(describePasswordStrength(pw)).not.toBe("short");
    }
  });

  it("calls anything under the minimum 'short'", () => {
    expect(describePasswordStrength("abc")).toBe("short");
  });

  it("never blocks a merely 'fair' password", () => {
    expect(describePasswordStrength("abcdef")).toBe("fair");
    expect(validateNewPassword("abcdef").ok).toBe(true);
  });
});
