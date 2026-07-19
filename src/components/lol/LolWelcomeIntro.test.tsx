/**
 * First-visit tutorial popup: exactly one action ("Start Tutorial") that routes
 * into the mandatory tutorial WITHOUT marking completion, and no alternate
 * dismissal path (no close icon, no secondary button, no backdrop dismiss).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LolWelcomeIntro from "./LolWelcomeIntro";
import { RANKED_TUTORIAL_ROUTE } from "@/lib/ranked-tutorial/onboarding";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  trackFunnelEvent: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/lib/funnel-analytics", () => ({
  trackFunnelEvent: mocks.trackFunnelEvent,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LolWelcomeIntro", () => {
  it("renders exactly one action button labelled Start Tutorial", () => {
    render(<LolWelcomeIntro />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent("Start Tutorial");
  });

  it("routes to the tutorial route without marking completion", () => {
    render(<LolWelcomeIntro />);
    fireEvent.click(screen.getByTestId("lol-welcome-start-tutorial"));
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith(RANKED_TUTORIAL_ROUTE);
    // The popup itself performs no profiles write — it does not import supabase,
    // so navigation is the only side effect besides the funnel event.
    expect(mocks.trackFunnelEvent).toHaveBeenCalledWith("lol_start_tutorial_clicked", {
      cta: "welcome_intro",
    });
  });

  it("exposes no alternate dismissal path (no close/skip/explore controls)", () => {
    render(<LolWelcomeIntro />);
    // No legacy escape hatches.
    expect(screen.queryByText(/Start Quiz/i)).toBeNull();
    expect(screen.queryByText(/Explore the hub/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /close|dismiss|skip|later|back/i })).toBeNull();
    // Only one interactive control total.
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("does not dismiss on backdrop click (no navigation, popup stays)", () => {
    render(<LolWelcomeIntro />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
