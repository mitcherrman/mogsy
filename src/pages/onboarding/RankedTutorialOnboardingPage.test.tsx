/**
 * RankedTutorialOnboardingPage — combined, un-numbered welcome entry screen.
 *
 * Verifies the two former welcomes are now one: a single welcome screen with a
 * single Start Tutorial button that leads directly into the numbered tutorial,
 * which begins at timer_intro (Step 1 of 18). Mode-aware controls are preserved:
 * mandatory users get no skip; replay/completed users keep their exits and note.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RankedTutorialOnboardingPage from "./RankedTutorialOnboardingPage";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  status: {
    loading: false,
    required: true,
    completed: false,
    completeTutorial: vi.fn(async () => true),
  } as {
    loading: boolean;
    required: boolean;
    completed: boolean;
    completeTutorial: () => Promise<boolean>;
  },
}));

vi.mock("react-router-dom", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useNavigate: () => mocks.navigate };
});
vi.mock("@/hooks/useRankedTutorialStatus", () => ({
  useRankedTutorialStatus: () => mocks.status,
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/onboarding/ranked-tutorial"]}>
      <RankedTutorialOnboardingPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.status = {
    loading: false,
    required: true,
    completed: false,
    completeTutorial: vi.fn(async () => true),
  };
});
afterEach(cleanup);

describe("combined welcome entry screen", () => {
  it("shows exactly one welcome screen and one Start Tutorial button before Step 1", () => {
    renderPage();
    expect(
      screen.getAllByRole("heading", { name: "Welcome to Ranked training" }),
    ).toHaveLength(1);
    expect(screen.getAllByTestId("start-tutorial")).toHaveLength(1);
    // Mogzy teaches the tutorial: decorative "explaining" pose on the welcome.
    const art = screen
      .getByTestId("onboarding-welcome")
      .querySelector('[data-mogzy-art-category="mascot"]');
    expect(art).toHaveAttribute("data-mogzy-art-name", "explaining");
    expect(art).toHaveAttribute("aria-hidden", "true");
    // The numbered tutorial (and its Continue/progress) is not shown yet.
    expect(screen.queryByTestId("tutorial-progress")).toBeNull();
    expect(screen.queryByTestId("continue-step")).toBeNull();
  });

  it("Start Tutorial leads directly into the numbered tutorial at timer_intro (Step 1 of 18)", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("start-tutorial"));
    // No second welcome, no legacy Begin Training button.
    expect(screen.queryByTestId("onboarding-welcome")).toBeNull();
    expect(screen.queryByTestId("begin-training")).toBeNull();
    expect(screen.queryByText("Begin Training")).toBeNull();
    // Numbered progress begins at the first lesson.
    expect(screen.getByTestId("tutorial-progress")).toHaveTextContent("Step 1 of 18");
    expect(screen.getByRole("heading", { name: "One shared timer" })).toBeInTheDocument();
  });

  it("mandatory (required) users cannot skip — no Back to Quiz, no completed note", () => {
    mocks.status = {
      loading: false,
      required: true,
      completed: false,
      completeTutorial: vi.fn(async () => true),
    };
    renderPage();
    expect(screen.queryByTestId("onboarding-back-to-quiz")).toBeNull();
    expect(screen.queryByText(/already completed this tutorial/i)).toBeNull();
  });

  it("replay/completed users keep Back to Quiz and the completed-user note", () => {
    mocks.status = {
      loading: false,
      required: false,
      completed: true,
      completeTutorial: vi.fn(async () => true),
    };
    renderPage();
    const back = screen.getByTestId("onboarding-back-to-quiz");
    expect(back).toBeInTheDocument();
    expect(screen.getByText(/already completed this tutorial/i)).toBeInTheDocument();
    // Back to Quiz routes to the return route.
    fireEvent.click(back);
    expect(mocks.navigate).toHaveBeenCalledWith("/quiz");
  });

  it("shows the loading gate while status is resolving", () => {
    mocks.status = {
      loading: true,
      required: false,
      completed: false,
      completeTutorial: vi.fn(async () => true),
    };
    renderPage();
    expect(screen.getByTestId("onboarding-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-welcome")).toBeNull();
  });
});
