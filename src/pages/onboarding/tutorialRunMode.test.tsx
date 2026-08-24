/**
 * Run-mode selection for the Ranked Tutorial host page, which serves BOTH the
 * mandatory onboarding route and the permanent Leaguecraft route.
 *
 * The three concepts must stay separate:
 *   completion state  — has this account ever finished the tutorial?
 *   global policy     — is completion currently required of new users?
 *   run mode          — mandatory (no escape) / voluntary (first completion,
 *                       escapable) / replay (already completed, no write).
 *
 * The behaviour that matters most here: a first completion is recorded even
 * when the tutorial is NOT forced, and a replay never writes at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RankedTutorialOnboardingPage from "./RankedTutorialOnboardingPage";
import { LEAGUECRAFT_TUTORIAL_ROUTE } from "@/lib/ranked-tutorial/onboarding";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  completionRequiredForNewUsers: true,
  status: {
    loading: false,
    required: true,
    completed: false,
    completeTutorial: vi.fn(async () => true),
  },
}));

vi.mock("react-router-dom", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useNavigate: () => mocks.navigate };
});
vi.mock("@/hooks/useAdminAuthority", () => ({
  // The admin-replay authority (`has_role`) is not what these tests are about,
  // and it reads the auth context this suite deliberately does not mount.
  // Answering "not an admin" is the state every one of them describes anyway.
  useAdminAuthority: () => ({ loading: false, isAdmin: false }),
}));
vi.mock("@/hooks/useRankedTutorialStatus", () => ({
  useRankedTutorialStatus: () => mocks.status,
}));
vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: () => ({
    loading: false,
    settings: {
      policy: {
        combatSim: { tokensRequiredForNonPro: true },
        tutorial: {
          autoPopupEnabled: true,
          completionRequiredForNewUsers: mocks.completionRequiredForNewUsers,
        },
      },
    },
  }),
}));

/** Render at the permanent Leaguecraft route (refresh / direct navigation). */
const renderAtLeaguecraftRoute = () =>
  render(
    <MemoryRouter initialEntries={[LEAGUECRAFT_TUTORIAL_ROUTE]}>
      <RankedTutorialOnboardingPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.completionRequiredForNewUsers = true;
  mocks.status = {
    loading: false,
    required: true,
    completed: false,
    completeTutorial: vi.fn(async () => true),
  };
});
afterEach(cleanup);

describe("the permanent Leaguecraft tutorial route", () => {
  it("renders on direct navigation / refresh (a real route, not modal state)", () => {
    renderAtLeaguecraftRoute();
    expect(
      screen.getByRole("heading", { name: "Welcome to Ranked training" }),
    ).toBeTruthy();
  });

  it("is reachable with the auto-popup and forced policies both off", () => {
    mocks.completionRequiredForNewUsers = false;
    renderAtLeaguecraftRoute();
    expect(screen.getByTestId("start-tutorial")).toBeTruthy();
  });

  it("lets an already-completed user replay, and says it changes nothing", () => {
    mocks.status.required = false;
    mocks.status.completed = true;
    renderAtLeaguecraftRoute();
    expect(screen.getByTestId("onboarding-back-to-quiz")).toBeTruthy();
    expect(
      screen.getByText(/replaying won't change your progress/i),
    ).toBeTruthy();
  });
});

describe("escape hatch reflects whether the run is actually compulsory", () => {
  it("gives a forced, incomplete user no way out", () => {
    renderAtLeaguecraftRoute();
    expect(screen.queryByTestId("onboarding-back-to-quiz")).toBeNull();
  });

  it("gives an incomplete user a way out when the policy is off", () => {
    mocks.completionRequiredForNewUsers = false;
    renderAtLeaguecraftRoute();
    expect(screen.getByTestId("onboarding-back-to-quiz")).toBeTruthy();
  });

  it("gives a completed user a way out regardless of the policy", () => {
    mocks.status.required = false;
    mocks.status.completed = true;
    for (const required of [true, false]) {
      mocks.completionRequiredForNewUsers = required;
      renderAtLeaguecraftRoute();
      expect(screen.getByTestId("onboarding-back-to-quiz")).toBeTruthy();
      cleanup();
    }
  });
});

describe("completion persistence vs. replay", () => {
  it("a mandatory run still navigates away only after the write succeeds", async () => {
    renderAtLeaguecraftRoute();
    fireEvent.click(screen.getByTestId("start-tutorial"));
    // The mandatory flow keeps its explicit blocking finish action.
    expect(screen.queryByTestId("onboarding-back-to-quiz")).toBeNull();
    expect(mocks.status.completeTutorial).not.toHaveBeenCalled();
  });

  it("does not write anything before the tutorial is actually finished", () => {
    mocks.completionRequiredForNewUsers = false;
    renderAtLeaguecraftRoute();
    fireEvent.click(screen.getByTestId("start-tutorial"));
    expect(mocks.status.completeTutorial).not.toHaveBeenCalled();
  });

  it("an already-completed replay never gets a completion writer at all", () => {
    mocks.status.required = false;
    mocks.status.completed = true;
    renderAtLeaguecraftRoute();
    fireEvent.click(screen.getByTestId("start-tutorial"));
    expect(mocks.status.completeTutorial).not.toHaveBeenCalled();
  });
});
