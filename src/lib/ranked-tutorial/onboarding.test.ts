import { describe, expect, it } from "vitest";
import {
  evaluateRankedTutorial,
  postProfileOnboardingDestination,
  RANKED_TUTORIAL_ROUTE,
  type RankedTutorialProfileFields,
} from "./onboarding";

const base: RankedTutorialProfileFields = {
  is_anonymous: false,
  onboarding_completed: true,
  ranked_tutorial_completed_at: null,
  ranked_tutorial_version: null,
};

describe("evaluateRankedTutorial", () => {
  it("requires a new post-launch account (onboarded, no completion stamp)", () => {
    const r = evaluateRankedTutorial(base, { hasUser: true });
    expect(r).toEqual({ completed: false, required: true });
  });

  it("does not require a grandfathered account (version 0 stamp)", () => {
    const r = evaluateRankedTutorial(
      { ...base, ranked_tutorial_completed_at: "2026-01-01T00:00:00Z", ranked_tutorial_version: 0 },
      { hasUser: true },
    );
    expect(r).toEqual({ completed: true, required: false });
  });

  it("does not require an account that completed the current version", () => {
    const r = evaluateRankedTutorial(
      { ...base, ranked_tutorial_completed_at: "2026-07-18T00:00:00Z", ranked_tutorial_version: 1 },
      { hasUser: true },
    );
    expect(r).toEqual({ completed: true, required: false });
  });

  it("requires an anonymous guest who has not completed the tutorial", () => {
    // The tutorial is now first-visit onboarding, before account creation, so
    // anonymous incomplete users are gated by it.
    const r = evaluateRankedTutorial({ ...base, is_anonymous: true }, { hasUser: true });
    expect(r).toEqual({ completed: false, required: true });
  });

  it("exempts an anonymous guest who already completed the tutorial", () => {
    const r = evaluateRankedTutorial(
      {
        ...base,
        is_anonymous: true,
        ranked_tutorial_completed_at: "2026-07-18T00:00:00Z",
        ranked_tutorial_version: 1,
      },
      { hasUser: true },
    );
    expect(r).toEqual({ completed: true, required: false });
  });

  it("ignores profile-setup onboarding state for eligibility", () => {
    // onboarding_completed is no longer a precondition — the tutorial precedes it.
    const r = evaluateRankedTutorial(
      { ...base, onboarding_completed: false },
      { hasUser: true },
    );
    expect(r).toEqual({ completed: false, required: true });
  });

  it("does not require an unauthenticated visitor", () => {
    expect(evaluateRankedTutorial(base, { hasUser: false })).toEqual({
      completed: false,
      required: false,
    });
  });

  it("does not require when the profile row has not loaded yet", () => {
    expect(evaluateRankedTutorial(null, { hasUser: true })).toEqual({
      completed: false,
      required: false,
    });
  });
});

describe("postProfileOnboardingDestination", () => {
  it("sends a freshly-onboarded real account into the tutorial", () => {
    expect(postProfileOnboardingDestination(base)).toBe(RANKED_TUTORIAL_ROUTE);
  });

  it("does not send a grandfathered account into the tutorial", () => {
    expect(
      postProfileOnboardingDestination({
        ...base,
        ranked_tutorial_completed_at: "2026-01-01T00:00:00Z",
        ranked_tutorial_version: 0,
      }),
    ).toBeNull();
  });

  it("sends an anonymous guest who finished profile-setup into the tutorial", () => {
    // If a guest somehow reaches the profile-setup handoff without having
    // completed the tutorial, the tutorial still gates them (first-visit model).
    expect(postProfileOnboardingDestination({ ...base, is_anonymous: true })).toBe(
      RANKED_TUTORIAL_ROUTE,
    );
  });

  it("does not navigate when the profile-onboarding write did not persist", () => {
    // A failed OnboardingFlow write leaves onboarding_completed false.
    expect(postProfileOnboardingDestination({ ...base, onboarding_completed: false })).toBeNull();
  });

  it("does not navigate when the profile could not be read", () => {
    expect(postProfileOnboardingDestination(null)).toBeNull();
  });
});
