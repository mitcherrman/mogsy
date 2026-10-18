import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FOUR_STAGE_DAY, fixtureRun, wireResult } from "@/lib/daily-challenge/run/fixtures";

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics", async (orig) => ({
  ...(await orig<typeof import("@/lib/analytics")>()), track,
}));
import { DailyCompletion } from "./DailyCompletion";

const run = fixtureRun(FOUR_STAGE_DAY,
  { status: "completed", outcome: "reviewed", current_stage_index: null },
  Object.fromEntries(FOUR_STAGE_DAY.map((_, i) => [
    i, { status: "completed", result: wireResult() },
  ])));

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="route">{loc.pathname}{loc.search}</p>;
}
function show(guest = true) {
  return render(<MemoryRouter initialEntries={["/quiz/daily-challenge"]}><Routes>
    <Route path="/quiz/daily-challenge" element={<DailyCompletion run={run} saveRequired={guest} />} />
    <Route path="*" element={<LocationProbe />} />
  </Routes></MemoryRouter>);
}

beforeEach(() => track.mockClear());
afterEach(cleanup);

describe("guest's Daily final recap invitation", () => {
  it("displays an inline CTA, keeps the recap and exit link reachable", () => {
    show();
    expect(screen.getByTestId("daily-save-offer")).toBeInTheDocument();
    expect(screen.queryByTestId("daily-save-gate")).toBeNull();
    expect(screen.getByTestId("daily-run-recap")).toBeInTheDocument();
    expect(screen.getByTestId("daily-run-home")).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith("signup_offer_shown", {
      metadata: { placement: "daily_final_recap", activity: "daily_challenge", run_id: run.runId },
    });
  });

  it("clicks through the existing in-place upgrade route without changing the run", () => {
    show();
    fireEvent.click(screen.getByTestId("daily-save-create-account"));
    expect(track).toHaveBeenCalledWith("signup_offer_clicked", {
      metadata: { placement: "daily_final_recap", activity: "daily_challenge", run_id: run.runId },
    });
    expect(screen.getByTestId("route")).toHaveTextContent(
      "/auth?mode=signup&returnTo=%2Fquiz%2Fdaily-challenge");
  });

  it("does not ask registered players to sign up", () => {
    show(false);
    expect(screen.queryByTestId("daily-save-offer")).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });
});
