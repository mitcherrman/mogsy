import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import CommunitySplit from "./CommunitySplit";

afterEach(cleanup);

describe("CommunitySplit", () => {
  it("renders backend percentages and counts", () => {
    render(<CommunitySplit leftName="Annie" rightName="Brand"
      summary={{ left_count: 6, right_count: 4, total_count: 10, left_percent: 60, right_percent: 40 }} />);
    expect(screen.getByText("60.0%")).toBeTruthy();
    expect(screen.getByText("40.0%")).toBeTruthy();
    expect(screen.getByText(/10 predictions/)).toBeTruthy();
  });

  it("handles zero predictions cleanly (neutral, no divide-by-zero)", () => {
    render(<CommunitySplit leftName="Annie" rightName="Brand"
      summary={{ left_count: 0, right_count: 0, total_count: 0, left_percent: 0, right_percent: 0 }} />);
    expect(screen.getByText(/No predictions yet/)).toBeTruthy();
    expect(screen.getAllByText("0.0%").length).toBe(2);
  });
});
