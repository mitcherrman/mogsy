import { describe, expect, it } from "vitest";
import { computePostConversionDestination } from "./post-conversion-route";
import { resolveReturnTo } from "./auth-destination";
import {
  RANKED_TUTORIAL_ROUTE,
  type RankedTutorialProfileFields,
} from "@/lib/ranked-tutorial/onboarding";

const base: RankedTutorialProfileFields = {
  is_anonymous: false,
  onboarding_completed: false,
  ranked_tutorial_completed_at: null,
  ranked_tutorial_version: null,
};

/** The caller always hands a resolved returnTo; these build one either way. */
const explicit = (path: string) => resolveReturnTo(path, "/quiz");
const implicit = (fallback: string) => resolveReturnTo(null, fallback);

describe("computePostConversionDestination", () => {
  it("does NOT replay the tutorial for a guest who already completed it", () => {
    const profile = {
      ...base,
      ranked_tutorial_completed_at: "2026-07-19T00:00:00Z",
      ranked_tutorial_version: 1,
    };
    expect(computePostConversionDestination(profile, implicit("/quiz"))).toBe("/quiz");
  });

  it("exempts a grandfathered version-0 account", () => {
    const profile = {
      ...base,
      ranked_tutorial_completed_at: "2026-01-01T00:00:00Z",
      ranked_tutorial_version: 0,
    };
    expect(computePostConversionDestination(profile, explicit("/lol"))).toBe("/lol");
  });

  it("routes a permanent tutorial-incomplete account to the tutorial when NO destination was preserved", () => {
    expect(computePostConversionDestination(base, implicit("/quiz"))).toBe(RANKED_TUTORIAL_ROUTE);
  });

  it("AUTH1: an EXPLICIT returnTo outranks an owed tutorial", () => {
    // The user was heading somewhere specific and auth interrupted them. The
    // route guard on that destination is still free to redirect into the
    // tutorial; what must not happen is auth deciding they meant the tutorial.
    expect(computePostConversionDestination(base, explicit("/quiz/ranked"))).toBe("/quiz/ranked");
  });

  it("AUTH1: an UNSAFE returnTo never gains that precedence", () => {
    // Rejected by safeReturnPath, so it is not explicit, so onboarding still
    // applies — an attacker-supplied target cannot outrank anything.
    expect(computePostConversionDestination(base, resolveReturnTo("//evil.com", "/quiz")))
      .toBe(RANKED_TUTORIAL_ROUTE);
  });

  it("honors the provided (already-safe) returnTo when no tutorial is required", () => {
    const done = { ...base, ranked_tutorial_completed_at: "2026-07-19T00:00:00Z", ranked_tutorial_version: 1 };
    expect(computePostConversionDestination(done, explicit("/profile"))).toBe("/profile");
  });
});
