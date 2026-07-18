import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import {
  postProfileOnboardingDestination,
  RANKED_TUTORIAL_ROUTE,
  type RankedTutorialProfileFields,
} from "@/lib/ranked-tutorial/onboarding";

/**
 * Reproduces exactly the handoff Home.handleOnboardingComplete performs: on a
 * successful profile-onboarding write it navigates to the tutorial route with
 * `replace`. This proves the navigation happens AND that browser Back cannot
 * return the user to the completed onboarding form.
 */
function OnboardingFormStub({ profile }: { profile: RankedTutorialProfileFields }) {
  const navigate = useNavigate();
  return (
    <div data-testid="profile-onboarding-form">
      <button
        data-testid="finish-profile-onboarding"
        onClick={() => {
          const dest = postProfileOnboardingDestination(profile);
          if (dest) navigate(dest, { replace: true });
        }}
      >
        Finish
      </button>
    </div>
  );
}

function LocationProbe() {
  const loc = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <div data-testid="pathname">{loc.pathname}</div>
      <button data-testid="go-back" onClick={() => navigate(-1)}>
        back
      </button>
    </>
  );
}

const realAccount: RankedTutorialProfileFields = {
  is_anonymous: false,
  onboarding_completed: true,
  ranked_tutorial_completed_at: null,
  ranked_tutorial_version: null,
};

function renderHarness(profile: RankedTutorialProfileFields) {
  return render(
    <MemoryRouter initialEntries={["/auth", "/home"]} initialIndex={1}>
      <LocationProbe />
      <Routes>
        <Route path="/auth" element={<div data-testid="auth-route">auth</div>} />
        <Route path="/home" element={<OnboardingFormStub profile={profile} />} />
        <Route
          path={RANKED_TUTORIAL_ROUTE}
          element={<div data-testid="tutorial-route">tutorial</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("profile-onboarding → tutorial handoff", () => {
  it("navigates a new real account straight into the tutorial on finish", () => {
    renderHarness(realAccount);
    fireEvent.click(screen.getByTestId("finish-profile-onboarding"));
    expect(screen.getByTestId("pathname").textContent).toBe(RANKED_TUTORIAL_ROUTE);
    expect(screen.getByTestId("tutorial-route")).toBeTruthy();
  });

  it("Back does not return to the completed onboarding form (replace)", () => {
    renderHarness(realAccount);
    fireEvent.click(screen.getByTestId("finish-profile-onboarding"));
    fireEvent.click(screen.getByTestId("go-back"));
    // /home was replaced, so Back lands on the pre-onboarding entry, not the form.
    expect(screen.getByTestId("auth-route")).toBeTruthy();
    expect(screen.queryByTestId("profile-onboarding-form")).toBeNull();
  });
});
