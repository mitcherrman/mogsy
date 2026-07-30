/**
 * LolWelcomeIntro dismissibility under the global tutorial policies.
 *
 * A popup shown while completion is NOT required must be escapable — otherwise
 * the overlay would trap a user the route guard is willing to let through.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LolWelcomeIntro from "./LolWelcomeIntro";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("react-router-dom", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useNavigate: () => mocks.navigate };
});
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));

const renderPopup = (props: Parameters<typeof LolWelcomeIntro>[0]) =>
  render(
    <MemoryRouter>
      <LolWelcomeIntro {...props} />
    </MemoryRouter>,
  );

afterEach(cleanup);

describe("forced tutorial ON (default)", () => {
  it("offers no skip control", () => {
    renderPopup({ dismissible: false });
    expect(screen.getByTestId("lol-welcome-start-tutorial")).toBeTruthy();
    expect(screen.queryByTestId("lol-welcome-skip-tutorial")).toBeNull();
  });

  it("is non-dismissible when no props are supplied at all", () => {
    renderPopup({});
    expect(screen.queryByTestId("lol-welcome-skip-tutorial")).toBeNull();
  });
});

describe("forced tutorial OFF", () => {
  it("offers a skip control that does not start the tutorial", () => {
    const onDismiss = vi.fn();
    renderPopup({ dismissible: true, onDismiss });

    fireEvent.click(screen.getByTestId("lol-welcome-skip-tutorial"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("still offers the tutorial as the primary action", () => {
    renderPopup({ dismissible: true, onDismiss: vi.fn() });
    fireEvent.click(screen.getByTestId("lol-welcome-start-tutorial"));
    expect(mocks.navigate).toHaveBeenCalledWith("/onboarding/ranked-tutorial");
  });
});
