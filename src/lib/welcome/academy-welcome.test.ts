/**
 * Academy Welcome first-run state (HI1).
 *
 * The contract that matters: a returning visitor is never re-interrupted, a
 * brand-new one always is, and NO stored value — however corrupt — can trap
 * someone or throw out of a click handler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACADEMY_WELCOME_ROUTE,
  ACADEMY_WELCOME_STORAGE_KEY,
  clearAcademyWelcomeState,
  hasHandledAcademyWelcome,
  markAcademyWelcomeHandled,
  readAcademyWelcomeState,
  resolveEntryDestination,
} from "./academy-welcome";
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

describe("first-run state", () => {
  it("treats a visitor with no stored state as unseen", () => {
    expect(readAcademyWelcomeState()).toBeNull();
    expect(hasHandledAcademyWelcome()).toBe(false);
  });

  it("records the outcome and reports the visitor as handled", () => {
    markAcademyWelcomeHandled("explored");
    expect(hasHandledAcademyWelcome()).toBe(true);
    expect(readAcademyWelcomeState()).toMatchObject({ outcome: "explored" });
  });

  it("keeps explore and tutorial distinct", () => {
    markAcademyWelcomeHandled("tutorial");
    expect(readAcademyWelcomeState()?.outcome).toBe("tutorial");
  });

  it("stamps an ISO timestamp", () => {
    markAcademyWelcomeHandled("explored");
    const at = readAcademyWelcomeState()?.at ?? "";
    expect(Number.isNaN(Date.parse(at))).toBe(false);
  });

  it("lets a later choice supersede an earlier one (replay)", () => {
    markAcademyWelcomeHandled("explored");
    markAcademyWelcomeHandled("tutorial");
    expect(readAcademyWelcomeState()?.outcome).toBe("tutorial");
  });

  it("can be cleared for QA", () => {
    markAcademyWelcomeHandled("explored");
    clearAcademyWelcomeState();
    expect(hasHandledAcademyWelcome()).toBe(false);
  });

  it("uses a versioned key so a future revision can re-show itself", () => {
    expect(ACADEMY_WELCOME_STORAGE_KEY).toMatch(/\.v\d+$/);
  });
});

describe("entry destination", () => {
  it("sends a brand-new visitor into the introduction", () => {
    expect(resolveEntryDestination()).toBe(ACADEMY_WELCOME_ROUTE);
  });

  it("sends a visitor who explored straight to the hub", () => {
    markAcademyWelcomeHandled("explored");
    expect(resolveEntryDestination()).toBe(LEAGUE_HOME_ROUTE);
  });

  it("sends a visitor who chose the tutorial straight to the hub", () => {
    markAcademyWelcomeHandled("tutorial");
    expect(resolveEntryDestination()).toBe(LEAGUE_HOME_ROUTE);
  });
});

describe("malformed or unavailable storage", () => {
  // Every one of these must resolve to "unseen" rather than throwing: showing a
  // skippable introduction once more is always cheaper than a crash on the
  // entrance screen.
  it.each([
    ["not json at all", "{{{"],
    ["a bare string", '"explored"'],
    ["null", "null"],
    ["an array", '["explored"]'],
    ["a number", "42"],
    ["an object with no outcome", '{"at":"2026-01-01T00:00:00.000Z"}'],
    ["an unrecognised outcome", '{"outcome":"teleported"}'],
    ["a non-string outcome", '{"outcome":7}'],
    ["an empty object", "{}"],
  ])("treats %s as unseen", (_label, raw) => {
    localStorage.setItem(ACADEMY_WELCOME_STORAGE_KEY, raw);
    expect(() => readAcademyWelcomeState()).not.toThrow();
    expect(readAcademyWelcomeState()).toBeNull();
    expect(hasHandledAcademyWelcome()).toBe(false);
    expect(resolveEntryDestination()).toBe(ACADEMY_WELCOME_ROUTE);
  });

  it("tolerates a valid outcome with a missing timestamp", () => {
    localStorage.setItem(ACADEMY_WELCOME_STORAGE_KEY, '{"outcome":"explored"}');
    expect(readAcademyWelcomeState()).toEqual({ outcome: "explored", at: "" });
    expect(hasHandledAcademyWelcome()).toBe(true);
  });

  it("does not throw when reading is blocked (private mode)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => hasHandledAcademyWelcome()).not.toThrow();
    expect(hasHandledAcademyWelcome()).toBe(false);
  });

  it("does not throw when writing is blocked (quota / private mode)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => markAcademyWelcomeHandled("explored")).not.toThrow();
  });

  it("does not throw when clearing is blocked", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => clearAcademyWelcomeState()).not.toThrow();
  });
});
