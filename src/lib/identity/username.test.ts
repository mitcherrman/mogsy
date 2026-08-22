/**
 * AUTH3 — the one username policy.
 *
 * These cases are the POLICY, not an implementation detail of it: they are what
 * "2 to 24, letters/digits/spaces/. _ ' -, case-insensitive uniqueness,
 * capitalisation preserved" actually means, and username.contract.test.ts pins
 * the same statements against the SQL that enforces them server-side.
 */
import { describe, expect, it } from "vitest";

import {
  USERNAME_MAX,
  USERNAME_MESSAGES,
  USERNAME_MIN,
  cleanUsername,
  isPlaceholderUsername,
  isReservedUsername,
  normalizeUsername,
  usernameProblem,
  validateUsername,
} from "./username";

describe("length", () => {
  it("accepts the shortest legal name", () => {
    expect(validateUsername("Ab")).toMatchObject({ ok: true, value: "Ab" });
    expect(USERNAME_MIN).toBe(2);
  });

  it("accepts a name of exactly the maximum length", () => {
    const max = "a".repeat(USERNAME_MAX);
    expect(validateUsername(max)).toMatchObject({ ok: true, value: max });
    expect(USERNAME_MAX).toBe(24);
  });

  it("rejects one character", () => {
    expect(usernameProblem("A")).toBe("too_short");
  });

  it("rejects one character past the maximum", () => {
    expect(usernameProblem("a".repeat(USERNAME_MAX + 1))).toBe("too_long");
  });

  it("measures the NORMALISED name, not the typed one", () => {
    // 24 characters plus surrounding whitespace is a legal 24-character name.
    expect(validateUsername(`  ${"a".repeat(24)}  `).ok).toBe(true);
    // ...and whitespace padding does not rescue a 1-character name.
    expect(usernameProblem("  A  ")).toBe("too_short");
  });
});

describe("normalisation", () => {
  it("trims the ends", () => {
    expect(cleanUsername("  MogzyKing  ")).toBe("MogzyKing");
  });

  it("collapses runs of whitespace to a single space", () => {
    expect(cleanUsername("Mogzy    King")).toBe("Mogzy King");
    expect(cleanUsername("Mogzy\t\nKing")).toBe("Mogzy King");
  });

  it("preserves the capitalisation the user chose", () => {
    expect(validateUsername("MogzyKing").value).toBe("MogzyKing");
  });

  it("compares case-insensitively", () => {
    expect(normalizeUsername("MogzyKing")).toBe(normalizeUsername("mogzyking"));
    expect(normalizeUsername("Mogzy  King")).toBe(normalizeUsername("mogzy king"));
  });
});

describe("characters", () => {
  it.each([
    ["letters", "Mogzling"],
    ["digits", "Mogzy123"],
    ["spaces", "Mogzy King"],
    ["underscore", "Mogzy_King"],
    ["hyphen", "Mogzy-King"],
    ["period", "Mogzy.King"],
    ["apostrophe", "O'Mogzy"],
    ["non-Latin letters", "モグジー"],
    ["accents", "Mögzy"],
  ])("allows %s", (_label, name) => {
    expect(usernameProblem(name)).toBeNull();
  });

  it.each([
    ["an emoji", "Mogzy\u{1f525}"],
    ["an at-sign", "Mogzy@King"],
    ["a slash", "Mogzy/King"],
    // The allow-list is what keeps these out; there is no per-exploit blocklist.
    ["a zero-width joiner", "Mo‍gzy"],
    ["a bidirectional override", "Mo‮gzy"],
    ["a control character", "Mogzy"],
  ])("rejects %s", (_label, name) => {
    expect(usernameProblem(name)).toBe("invalid_characters");
  });

  it("does not require digits, symbols, or any particular case", () => {
    expect(usernameProblem("mogzy1")).toBeNull();
    expect(usernameProblem("MOGZYKING")).toBeNull();
  });
});

describe("reserved names", () => {
  it("blocks the system's own generated placeholder", () => {
    expect(isReservedUsername("Anonymous5472")).toBe(true);
    expect(usernameProblem("Anonymous5472")).toBe("reserved");
  });

  it("does not block a person who genuinely wants to be called Anonymous", () => {
    expect(isReservedUsername("Anonymous")).toBe(false);
    expect(isReservedUsername("Anonymous Wizard")).toBe(false);
    expect(usernameProblem("Anonymous")).toBeNull();
  });

  it("blocks the small system namespace, case-insensitively", () => {
    for (const name of ["admin", "Admin", "MOGZY", "moderator", "support"]) {
      expect(usernameProblem(name)).toBe("reserved");
    }
  });

  it("keeps the reserved list small - ordinary names are not swept up", () => {
    for (const name of ["adminy", "Mogzy Fan", "supporter", "systematic"]) {
      expect(usernameProblem(name)).toBeNull();
    }
  });
});

describe("placeholders", () => {
  it("treats an empty name as a placeholder", () => {
    expect(isPlaceholderUsername("", false)).toBe(true);
    expect(isPlaceholderUsername("   ", false)).toBe(true);
    expect(isPlaceholderUsername(null, false)).toBe(true);
  });

  it("treats a generated name on an anonymous row as a placeholder", () => {
    expect(isPlaceholderUsername("Anonymous5472", true)).toBe(true);
  });

  it("keeps a generated name once the account has converted", () => {
    // Whatever a permanent account's name says is the name it kept.
    expect(isPlaceholderUsername("Anonymous5472", false)).toBe(false);
  });

  it("never treats a chosen name as a placeholder", () => {
    expect(isPlaceholderUsername("MogzyKing", true)).toBe(false);
    expect(isPlaceholderUsername("Anonymous Wizard", true)).toBe(false);
  });
});

describe("error copy", () => {
  it("is a finished, product-facing sentence for every outcome", () => {
    for (const message of Object.values(USERNAME_MESSAGES)) {
      expect(message.length).toBeGreaterThan(10);
      expect(message.endsWith(".")).toBe(true);
      // Never a database word.
      expect(message).not.toMatch(/constraint|postgres|supabase|display_name|violat/i);
    }
  });

  it("names the bounds in the length message", () => {
    expect(USERNAME_MESSAGES.too_short).toContain("2");
    expect(USERNAME_MESSAGES.too_short).toContain("24");
  });

  it("says a taken name is taken", () => {
    expect(USERNAME_MESSAGES.taken).toBe("That username is already taken.");
  });
});
