/**
 * Academy Registration — the provisional identity's contract (HI1-C5).
 *
 * Three things are being protected, and only one of them is about happy paths.
 *
 * The FIRST is the same failure posture the welcome state has: no stored value,
 * however corrupt, may throw out of a read or hand a caller a name that is not
 * a name. Every unusable state is null, because the cost of null is asking
 * again and the cost of trusting rubbish is addressing someone by it.
 *
 * The SECOND is the security rule this phase is built on: a password is NEVER
 * persisted. The record carries a boolean and nothing else, the in-memory stash
 * is single-use, and both are asserted here rather than left to the UI.
 *
 * The THIRD is that the verification intent does not become a promise. The
 * intent is recorded; the destination stays null until a Verify page actually
 * exists.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACADEMY_REGISTRATION_STORAGE_KEY,
  ACADEMY_VERIFY_ROUTE,
  LEAGUE_RANKS,
  clearAcademyRegistration,
  clearRegistrationPassword,
  consumeRegistrationPassword,
  hasAcademyRegistration,
  isLeagueRankId,
  leagueRankLabel,
  readAcademyRegistration,
  resolveLinkDestination,
  saveAcademyRegistration,
  stashRegistrationPassword,
  validatePassword,
  validateUsername,
} from "./academy-registration";
import { installLocalStorageStub } from "@/test/localStorageStub";

// The pinned jsdom does not provide a working Storage — see localStorageStub.
const resetStorage = installLocalStorageStub();

beforeEach(() => {
  resetStorage();
  clearRegistrationPassword();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetStorage();
  clearRegistrationPassword();
});

const valid = { username: "Summoner", rank: "gold", hasPassword: false, wantsLinking: false } as const;

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

describe("validating the optional password", () => {
  it("treats blank as valid, because the field is optional", () => {
    expect(validatePassword("")).toEqual({ ok: true });
  });

  it("uses the same floor the real sign-up screen uses", () => {
    // Auth.tsx rejects under 6. A stricter rule here would mean a password
    // registration accepts and the actual account screen refuses.
    expect(validatePassword("12345").ok).toBe(false);
    expect(validatePassword("123456").ok).toBe(true);
  });
});

describe("the record", () => {
  it("round-trips, and reports the device as registered", () => {
    expect(hasAcademyRegistration()).toBe(false);
    const saved = saveAcademyRegistration({ ...valid, wantsLinking: true });
    expect(saved).toMatchObject({ username: "Summoner", rank: "gold", wantsLinking: true });
    expect(readAcademyRegistration()).toMatchObject({ username: "Summoner", rank: "gold" });
    expect(hasAcademyRegistration()).toBe(true);
  });

  it("stores the NORMALISED name, not the typed one", () => {
    saveAcademyRegistration({ ...valid, username: "  Summoner   Yi " });
    expect(readAcademyRegistration()?.username).toBe("Summoner Yi");
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
    // Called from a submit handler that navigates on the next line.
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

describe("the password", () => {
  it("is not in the record, under any key, ever", () => {
    saveAcademyRegistration({ ...valid, hasPassword: true });
    stashRegistrationPassword("correcthorsebatterystaple");
    const dump = Object.keys(localStorage)
      .map((k) => localStorage.getItem(k) ?? "")
      .join("|");
    expect(dump).not.toContain("correcthorsebatterystaple");
    expect(readAcademyRegistration()?.hasPassword).toBe(true);
  });

  it("is single-use — a second reader gets nothing", () => {
    stashRegistrationPassword("hunter2!");
    expect(consumeRegistrationPassword()).toBe("hunter2!");
    expect(consumeRegistrationPassword()).toBeNull();
  });

  it("treats an empty stash as no stash", () => {
    stashRegistrationPassword("");
    expect(consumeRegistrationPassword()).toBeNull();
  });

  it("can be dropped without being read", () => {
    stashRegistrationPassword("hunter2!");
    clearRegistrationPassword();
    expect(consumeRegistrationPassword()).toBeNull();
  });
});

describe("the verification seam", () => {
  it("has no destination, because the Verify page does not exist", () => {
    // The forward-compatibility contract in one assertion. When a Verify /
    // Link Accounts route ships, ACADEMY_VERIFY_ROUTE becomes it and this test
    // is the one that has to be rewritten deliberately.
    expect(ACADEMY_VERIFY_ROUTE).toBeNull();
    saveAcademyRegistration({ ...valid, wantsLinking: true });
    expect(resolveLinkDestination()).toBeNull();
  });

  it("still records the intent, so the page can honour it later", () => {
    saveAcademyRegistration({ ...valid, wantsLinking: true });
    expect(readAcademyRegistration()?.wantsLinking).toBe(true);
    saveAcademyRegistration({ ...valid, wantsLinking: false });
    expect(readAcademyRegistration()?.wantsLinking).toBe(false);
  });
});
