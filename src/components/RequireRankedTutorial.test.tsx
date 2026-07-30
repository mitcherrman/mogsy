import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import RequireRankedTutorial from "./RequireRankedTutorial";

// --- Mocks -----------------------------------------------------------------
const authState = { loading: false };
const settingsState = { loading: false, completionRequiredForNewUsers: true };
const tutorialState = {
  loading: false,
  error: false,
  required: false,
  completed: true,
  refresh: vi.fn(),
  completeTutorial: vi.fn(),
};

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));
vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: () => ({
    loading: settingsState.loading,
    settings: {
      policy: {
        combatSim: { tokensRequiredForNonPro: true },
        tutorial: {
          autoPopupEnabled: true,
          completionRequiredForNewUsers: settingsState.completionRequiredForNewUsers,
        },
      },
    },
  }),
}));
vi.mock("@/hooks/useRankedTutorialStatus", () => ({
  useRankedTutorialStatus: () => tutorialState,
}));

function renderGuarded(initial = "/quiz") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/quiz"
          element={
            <RequireRankedTutorial>
              <div data-testid="quiz-content">quiz</div>
            </RequireRankedTutorial>
          }
        />
        <Route
          path="/onboarding/ranked-tutorial"
          element={<div data-testid="onboarding-route">onboarding</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequireRankedTutorial", () => {
  beforeEach(() => {
    authState.loading = false;
    settingsState.loading = false;
    settingsState.completionRequiredForNewUsers = true;
    tutorialState.loading = false;
    tutorialState.error = false;
    tutorialState.required = false;
  });

  it("renders children when the tutorial is not required", () => {
    renderGuarded();
    expect(screen.getByTestId("quiz-content")).toBeTruthy();
    expect(screen.queryByTestId("onboarding-route")).toBeNull();
  });

  it("redirects a required, incomplete account to onboarding", () => {
    tutorialState.required = true;
    renderGuarded();
    expect(screen.getByTestId("onboarding-route")).toBeTruthy();
    expect(screen.queryByTestId("quiz-content")).toBeNull();
  });

  it("does not redirect while any state is still loading (no flicker/loop)", () => {
    tutorialState.loading = true;
    tutorialState.required = true; // would redirect once resolved, but not yet
    renderGuarded();
    expect(screen.queryByTestId("onboarding-route")).toBeNull();
    expect(screen.queryByTestId("quiz-content")).toBeNull();
  });

  it("fails open on a profile-read error (never traps the user)", () => {
    tutorialState.error = true;
    tutorialState.required = true;
    renderGuarded();
    expect(screen.getByTestId("quiz-content")).toBeTruthy();
  });
});

describe("RequireRankedTutorial across gated quiz routes", () => {
  const GATED = ["/quiz", "/quiz/daily", "/quiz/ranked"];

  function renderAt(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          {GATED.map((p) => (
            <Route
              key={p}
              path={p}
              element={
                <RequireRankedTutorial>
                  <div data-testid="gated-content">{p}</div>
                </RequireRankedTutorial>
              }
            />
          ))}
          <Route
            path="/onboarding/ranked-tutorial"
            element={<div data-testid="onboarding-route">onboarding</div>}
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    authState.loading = false;
    settingsState.loading = false;
    settingsState.completionRequiredForNewUsers = true;
    tutorialState.loading = false;
    tutorialState.error = false;
  });

  it.each(GATED)("redirects an incomplete eligible user off %s", (path) => {
    tutorialState.required = true;
    renderAt(path);
    expect(screen.getByTestId("onboarding-route")).toBeTruthy();
    expect(screen.queryByTestId("gated-content")).toBeNull();
  });

  it.each(GATED)("lets a completed/grandfathered account reach %s", (path) => {
    tutorialState.required = false; // completed and grandfathered both resolve here
    tutorialState.completed = true;
    renderAt(path);
    expect(screen.getByTestId("gated-content")).toBeTruthy();
    expect(screen.queryByTestId("onboarding-route")).toBeNull();
  });
});

describe("RequireRankedTutorial under the global forced-tutorial policy", () => {
  beforeEach(() => {
    authState.loading = false;
    settingsState.loading = false;
    settingsState.completionRequiredForNewUsers = true;
    tutorialState.loading = false;
    tutorialState.error = false;
    tutorialState.required = true; // incomplete, eligible account
  });

  it("still forces an incomplete user when the policy is ON (unchanged default)", () => {
    renderGuarded();
    expect(screen.getByTestId("onboarding-route")).toBeTruthy();
  });

  it("lets an incomplete user through when the policy is OFF", () => {
    settingsState.completionRequiredForNewUsers = false;
    renderGuarded();
    expect(screen.getByTestId("quiz-content")).toBeTruthy();
    expect(screen.queryByTestId("onboarding-route")).toBeNull();
  });

  it("re-enabling the policy immediately forces the same incomplete user again", () => {
    settingsState.completionRequiredForNewUsers = false;
    const first = renderGuarded();
    expect(screen.getByTestId("quiz-content")).toBeTruthy();
    first.unmount();

    // No migration, no repair: the account's stored completion state is
    // untouched, so flipping the policy back restores the gate exactly.
    settingsState.completionRequiredForNewUsers = true;
    renderGuarded();
    expect(screen.getByTestId("onboarding-route")).toBeTruthy();
  });

  it("does not disrupt an already-completed user in either policy state", () => {
    tutorialState.required = false;
    tutorialState.completed = true;
    for (const required of [true, false]) {
      settingsState.completionRequiredForNewUsers = required;
      const view = renderGuarded();
      expect(screen.getByTestId("quiz-content")).toBeTruthy();
      view.unmount();
    }
  });

  it("waits for the settings read before deciding (no redirect loop on load)", () => {
    settingsState.loading = true;
    renderGuarded();
    expect(screen.queryByTestId("onboarding-route")).toBeNull();
    expect(screen.queryByTestId("quiz-content")).toBeNull();
  });
});
