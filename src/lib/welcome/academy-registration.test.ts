/**
 * Academy Registration — the local half of a durable identity (HI1-C5B).
 *
 * Three things are being protected, and only one of them is about happy paths.
 *
 * The FIRST is the same failure posture the welcome state has: no stored value,
 * however corrupt, may throw out of a read or hand a caller a name that is not
 * a name. Every unusable state is null — and here that matters more than it did
 * in C5, because what a read returns now gets written into somebody's profile.
 *
 * The SECOND is the adoption bookkeeping: `adoptedBy` is what makes the
 * provisional -> account migration happen at most once, and a re-registration
 * has to clear it or a new answer would never be written through.
 *
 * The THIRD is that the simplification is real. There is no password anywhere
 * in this module, no linking intent, and no Verify destination — a re-added one
 * would be UI promising an account this screen does not make.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACADEMY_REGISTRATION_STORAGE_KEY,
  ACADEMY_SIGN_IN_ROUTE,
  LEAGUE_RANKS,
  clearAcademyRegistration,
  hasAcademyRegistration,
  isLeagueRankId,
  leagueRankLabel,
  markAcademyRegistrationAdopted,
  readAcademyRegistration,
  saveAcademyRegistration,
  validateUsername,
} from "./academy-registration";
import * as registrationModule from "./academy-registration";
import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";
import { installLocalStorageStub } from "@/test/localStorageStub";

// The pinned jsdom does not provide a working Storage — see localStorageStub.
const resetStorage = installLocalStorageStub();

beforeEach(() => {
  resetStorage();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetStorage();
});

const valid = { username: "Summoner", rank: "gold" } as const;

describe("the rank vocabulary", () => {
  it("is the Riot ladder, with both of the honest non-answers on it", () => {
    const ids = LEAGUE_RANKS.map((r) => r.id);
    expect(ids).toEqual([
      "unranked",
      "iron",
      "bronze",
      "silver",
      "gold",
      "platinum",
      "emerald",
      "diamond",
      "master",
      "grandmaster",
      "challenger",
      "unsure",
    ]);
    expect(leagueRankLabel("unsure")).toBe("Not sure / Prefer not to say");
  });

  it("is NOT Mogzy's own five-tier progression vocabulary", () => {
    // lib/progression/tiers.ts has five tiers scored by quiz XP and by the
    // Ranked rating. Joining the two by accident would render a self-report as
    // a Mogzy rank the visitor has not earned and did not claim.
    expect(LEAGUE_RANKS).toHaveLength(12);
    expect(isLeagueRankId("iron")).toBe(true);
    expect(isLeagueRankId("emerald")).toBe(true);
    expect(isLeagueRankId("Gold")).toBe(false); // ids are lower-case, exactly
    expect(leagueRankLabel("platinum")).toBe("Platinum");
    expect(leagueRankLabel("nonsense")).toBeNull();
  });

  it("round-trips every supported choice through storage", () => {
    // Each of the twelve is a real answer a visitor can give, so each one has
    // to survive the write, the read and the validator that guards them both.
    for (const rank of LEAGUE_RANKS) {
      resetStorage();
      saveAcademyRegistration({ username: "Summoner", rank: rank.id });
      expect(readAcademyRegistration()?.rank, rank.id).toBe(rank.id);
    }
  });
});

describe("validating a name", () => {
  it("normalises before it measures, and returns what will be stored", () => {
    expect(validateUsername("  Summoner   Yi  ")).toEqual({ ok: true, value: "Summoner Yi" });
  });

  it("refuses an empty name in the chapter's own words", () => {
    expect(validateUsername("   ").error).toMatch(/needs a name/i);
    expect(validateUsername("").ok).toBe(false);
  });

  it("holds the ends of the range", () => {
    expect(validateUsername("a").ok).toBe(false);
    expect(validateUsername("ab").ok).toBe(true);
    expect(validateUsername("x".repeat(24)).ok).toBe(true);
    expect(validateUsername("x".repeat(25)).ok).toBe(false);
  });

  it("accepts names that are not English words", () => {
    // Unicode letters, not [A-Za-z]. A name filter that rejects someone's
    // actual name is a much worse bug than one that lets an odd one through.
    expect(validateUsername("Ясуо").ok).toBe(true);
    expect(validateUsername("ヤスオ").ok).toBe(true);
    expect(validateUsername("O'Rourke-Smith").ok).toBe(true);
  });

  it("refuses markup and control punctuation", () => {
    expect(validateUsername("<script>").ok).toBe(false);
    expect(validateUsername("a/b").ok).toBe(false);
  });
});

describe("the record", () => {
  it("round-trips, and reports the device as registered", () => {
    expect(hasAcademyRegistration()).toBe(false);
    const saved = saveAcademyRegistration(valid);
    expect(saved).toMatchObject({ username: "Summoner", rank: "gold", adoptedBy: null });
    expect(readAcademyRegistration()).toMatchObject({ username: "Summoner", rank: "gold" });
    expect(hasAcademyRegistration()).toBe(true);
  });

  it("stores the NORMALISED name, because that name becomes a profile column", () => {
    saveAcademyRegistration({ ...valid, username: "  Summoner   Yi " });
    expect(readAcademyRegistration()?.username).toBe("Summoner Yi");
  });

  it("timestamps the answer, because a self-reported rank goes stale", () => {
    saveAcademyRegistration(valid);
    expect(readAcademyRegistration()?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("refuses to write a record it would refuse to read", () => {
    expect(saveAcademyRegistration({ ...valid, username: " " })).toBeNull();
    expect(saveAcademyRegistration({ ...valid, rank: "immortal" as never })).toBeNull();
    expect(hasAcademyRegistration()).toBe(false);
  });

  it("is last-write-wins, like every other replayable record here", () => {
    saveAcademyRegistration({ ...valid, username: "First" });
    saveAcademyRegistration({ ...valid, username: "Second" });
    expect(readAcademyRegistration()?.username).toBe("Second");
  });

  it("collapses every unusable stored value to null rather than throwing", () => {
    for (const raw of [
      "{{{not json",
      "null",
      "[]",
      '"a string"',
      "{}",
      '{"username":"Ok"}', // no rank
      '{"rank":"gold"}', // no name
      '{"username":"  ","rank":"gold"}', // a name that is not a name
      '{"username":"Ok","rank":"immortal"}', // a rank we never offered
      '{"username":123,"rank":"gold"}',
    ]) {
      localStorage.setItem(ACADEMY_REGISTRATION_STORAGE_KEY, raw);
      expect(() => readAcademyRegistration()).not.toThrow();
      expect(readAcademyRegistration(), raw).toBeNull();
    }
  });

  it("never throws out of a write, whatever storage does", () => {
    // Called from a submit handler that turns a page on the next line.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => saveAcademyRegistration(valid)).not.toThrow();
  });

  it("never throws out of a read, whatever storage does", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(readAcademyRegistration()).toBeNull();
  });

  it("clears", () => {
    saveAcademyRegistration(valid);
    clearAcademyRegistration();
    expect(readAcademyRegistration()).toBeNull();
  });
});

describe("the adoption marker", () => {
  it("starts null — a fresh answer has been written through to nothing", () => {
    saveAcademyRegistration(valid);
    expect(readAcademyRegistration()?.adoptedBy).toBeNull();
  });

  it("records the account the record was written through to", () => {
    saveAcademyRegistration(valid);
    markAcademyRegistrationAdopted("user-1");
    expect(readAcademyRegistration()?.adoptedBy).toBe("user-1");
    // …and leaves the answers themselves untouched.
    expect(readAcademyRegistration()).toMatchObject({ username: "Summoner", rank: "gold" });
  });

  it("is cleared by a new answer, so the new answer can be adopted too", () => {
    saveAcademyRegistration(valid);
    markAcademyRegistrationAdopted("user-1");
    saveAcademyRegistration({ ...valid, username: "Second" });
    expect(readAcademyRegistration()?.adoptedBy).toBeNull();
  });

  it("does nothing without a record or without a user", () => {
    expect(() => markAcademyRegistrationAdopted("user-1")).not.toThrow();
    expect(readAcademyRegistration()).toBeNull();
    saveAcademyRegistration(valid);
    markAcademyRegistrationAdopted("");
    expect(readAcademyRegistration()?.adoptedBy).toBeNull();
  });

  it("survives a stored value that carries a nonsense marker", () => {
    localStorage.setItem(
      ACADEMY_REGISTRATION_STORAGE_KEY,
      JSON.stringify({ username: "Ok", rank: "gold", adoptedBy: 42 }),
    );
    expect(readAcademyRegistration()?.adoptedBy).toBeNull();
  });
});

describe("the returning visitor's way out", () => {
  it("hands off to the existing auth screen, returning to the hub", () => {
    // /auth reads returnTo through safeReturnPath(), which accepts only
    // same-origin absolute paths — so this has to be one, or the destination is
    // silently dropped and a returning user lands wherever /auth defaults to.
    expect(ACADEMY_SIGN_IN_ROUTE.startsWith("/auth?")).toBe(true);
    expect(ACADEMY_SIGN_IN_ROUTE).toContain("mode=signin");
    expect(ACADEMY_SIGN_IN_ROUTE).toContain(
      `returnTo=${encodeURIComponent(LEAGUE_HOME_ROUTE)}`,
    );
    expect(LEAGUE_HOME_ROUTE).toBe("/lol");
  });
});

describe("the simplification is real (HI1-C5B)", () => {
  it("has no password surface of any kind", () => {
    // Removed, not hidden. A password with no email or linked identity behind
    // it can authenticate nothing; collecting one here meant either storing a
    // secret with no destination or recording a boolean that promised an
    // account this screen does not make. It belongs to the Verify experience.
    const exported = Object.keys(registrationModule);
    expect(exported.filter((k) => /password/i.test(k))).toEqual([]);
    saveAcademyRegistration(valid);
    const stored = localStorage.getItem(ACADEMY_REGISTRATION_STORAGE_KEY) ?? "";
    expect(stored).not.toMatch(/password/i);
  });

  it("has no linking intent and no Verify destination", () => {
    const exported = Object.keys(registrationModule);
    expect(exported.filter((k) => /linking|verify/i.test(k))).toEqual([]);
    saveAcademyRegistration(valid);
    const stored = localStorage.getItem(ACADEMY_REGISTRATION_STORAGE_KEY) ?? "";
    expect(stored).not.toMatch(/wantsLinking/i);
  });

  it("stores exactly four fields — two answers and their bookkeeping", () => {
    saveAcademyRegistration(valid);
    const stored = JSON.parse(localStorage.getItem(ACADEMY_REGISTRATION_STORAGE_KEY)!);
    expect(Object.keys(stored).sort()).toEqual(["adoptedBy", "at", "rank", "username"]);
  });
});
