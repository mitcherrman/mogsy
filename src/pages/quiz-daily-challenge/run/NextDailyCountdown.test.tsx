import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextDailyCountdown } from "./NextDailyCountdown";

describe("NextDailyCountdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("counts from the backend UTC boundary without polling", () => {
    vi.setSystemTime(new Date("2026-10-21T21:45:22Z"));
    render(<NextDailyCountdown nextDailyAt="2026-10-22T00:00:00Z"
      serverNow="2026-10-21T21:45:22Z" />);
    expect(screen.getByRole("timer")).toHaveAccessibleName("Next Daily in 02:14:38");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("timer")).toHaveAccessibleName("Next Daily in 02:14:37");
  });

  it("presents rollover as availability, not expiration", () => {
    vi.setSystemTime(new Date("2026-10-22T00:00:01Z"));
    render(<NextDailyCountdown nextDailyAt="2026-10-22T00:00:00Z"
      serverNow="2026-10-22T00:00:01Z" />);
    expect(screen.getByTestId("next-daily-countdown")).toHaveTextContent("New Daily ready");
  });
});
