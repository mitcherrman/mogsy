import { describe, expect, it } from "vitest";
import { computePostConversionDestination } from "./post-conversion-route";
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

describe("computePostConversionDestination", () => {
  it("does NOT replay the tutorial for a guest who already completed it", () => {
    const profile = {
      ...base,
      ranked_tutorial_completed_at: "2026-07-19T00:00:00Z",
      ranked_tutorial_version: 1,
    };
    expect(computePostConversionDestination(profile, "/quiz")).toBe("/quiz");
  });

  it("exempts a grandfathered version-0 account", () => {
    const profile = {
      ...base,
      ranked_tutorial_completed_at: "2026-01-01T00:00:00Z",
      ranked_tutorial_version: 0,
    };
    expect(computePostConversionDestination(profile, "/lol")).toBe("/lol");
  });

  it("routes a permanent tutorial-incomplete account to the tutorial", () => {
    expect(computePostConversionDestination(base, "/quiz")).toBe(RANKED_TUTORIAL_ROUTE);
  });

  it("honors the provided (already-safe) returnTo when no tutorial is required", () => {
    const done = { ...base, ranked_tutorial_completed_at: "2026-07-19T00:00:00Z", ranked_tutorial_version: 1 };
    expect(computePostConversionDestination(done, "/profile")).toBe("/profile");
  });
});
