/**
 * AUTH3 — carry-forward. "A user should choose their Mogzy public identity
 * once, and Mogzy should carry it forward everywhere."
 *
 * The single most important case in this file is the last one: no branch here
 * may ever derive a public name from an email address.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { installLocalStorageStub } from "@/test/localStorageStub";

const resetStorage = installLocalStorageStub();

import {
  ACADEMY_REGISTRATION_STORAGE_KEY,
  saveAcademyRegistration,
} from "@/lib/welcome/academy-registration";
import { readPreferredUsername } from "./preferred-username";

beforeEach(() => {
  resetStorage();
});

describe("a visitor who named themselves at /welcome", () => {
  it("has the name carried forward to signup, so they never retype it", () => {
    saveAcademyRegistration({ username: "MogzyKing", rank: "gold" });

    expect(readPreferredUsername()).toEqual({ value: "MogzyKing", source: "academy" });
  });

  it("keeps the capitalisation they chose", () => {
    saveAcademyRegistration({ username: "mOgZyKiNg", rank: "iron" });
    expect(readPreferredUsername().value).toBe("mOgZyKiNg");
  });
});

describe("a guest with only a generated placeholder", () => {
  it("is invited to choose, not prefilled with Anonymous5472", () => {
    expect(
      readPreferredUsername({ profileName: "Anonymous5472", isAnonymous: true }),
    ).toEqual({ value: "", source: "none" });
  });

  it("is still prefilled from the Academy record if this device has one", () => {
    saveAcademyRegistration({ username: "MogzyKing", rank: "silver" });

    expect(
      readPreferredUsername({ profileName: "Anonymous5472", isAnonymous: true }),
    ).toEqual({ value: "MogzyKing", source: "academy" });
  });

  it("treats an empty profile name as no name at all", () => {
    expect(readPreferredUsername({ profileName: "", isAnonymous: false })).toEqual({
      value: "",
      source: "none",
    });
  });
});

describe("an account that already has a chosen name", () => {
  it("prefers the account over anything this browser is holding", () => {
    // The device record is older intent; the account is what Mogzy calls them
    // today, and it is what every other surface is already showing.
    saveAcademyRegistration({ username: "OldLocalName", rank: "gold" });

    expect(
      readPreferredUsername({ profileName: "RealAccountName", isAnonymous: false }),
    ).toEqual({ value: "RealAccountName", source: "profile" });
  });

  it("counts a converted account keeping an Anonymous name as a chosen name", () => {
    expect(
      readPreferredUsername({ profileName: "Anonymous5472", isAnonymous: false }),
    ).toEqual({ value: "Anonymous5472", source: "profile" });
  });
});

describe("robustness", () => {
  it("reads a corrupt local record as no record", () => {
    localStorage.setItem(ACADEMY_REGISTRATION_STORAGE_KEY, "{not json");
    expect(readPreferredUsername()).toEqual({ value: "", source: "none" });
  });

  it("normalises a padded stored name", () => {
    saveAcademyRegistration({ username: "  Mogzy   King  ", rank: "gold" });
    expect(readPreferredUsername().value).toBe("Mogzy King");
  });
});

describe("email is never an identity source", () => {
  it("has no branch that reads an email, at any position", () => {
    // Structural, on purpose. `john.smith@gmail.com` becoming a public
    // `john.smith` would publish a real name the person gave Mogzy for one
    // purpose, and a behavioural test can only prove the branches it thinks to
    // call. This proves there is no such branch to call.
    const source = readPreferredUsername.toString();
    expect(source).not.toMatch(/email/i);
    expect(source).not.toMatch(/@/);
    expect(source).not.toMatch(/split/);
  });
});
