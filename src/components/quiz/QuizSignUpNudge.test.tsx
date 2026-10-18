import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ track }));

import QuizSignUpNudge from "./QuizSignUpNudge";

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="route">{loc.pathname}{loc.search}</p>;
}

function show() {
  return render(<MemoryRouter initialEntries={["/quiz"]}><Routes>
    <Route path="/quiz" element={<QuizSignUpNudge returnTo="/quiz" />} />
    <Route path="*" element={<LocationProbe />} />
  </Routes></MemoryRouter>);
}

beforeEach(() => track.mockClear());
afterEach(cleanup);

describe("Practice soft signup moment", () => {
  it("records exactly one offer impression and does not navigate automatically", () => {
    show();
    expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("signup_offer_shown", {
      metadata: { placement: "practice_after_three_answers", activity: "practice", return_to: "/quiz" },
    });
  });

  it("records a click at its placement and preserves the Practice return", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(track).toHaveBeenCalledWith("signup_offer_clicked", {
      metadata: { placement: "practice_after_three_answers", activity: "practice", return_to: "/quiz" },
    });
    expect(screen.getByTestId("route")).toHaveTextContent("/auth?mode=signup&returnTo=%2Fquiz");
  });

  it("dismisses without navigating and records its outcome", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    // Framer Motion retains the exiting element during the fade-out in JSDOM.
    // Persisted suppression and dismissal telemetry are the source of truth.
    expect(sessionStorage.getItem("quiz:gate:nudge_seen")).toBe("1");
    expect(track).toHaveBeenCalledWith("signup_offer_dismissed", {
      metadata: { placement: "practice_after_three_answers", activity: "practice", return_to: "/quiz" },
    });
    expect(screen.queryByTestId("route")).toBeNull();
  });
});
