/** DAILY-SAVE1: a genuine anonymous guest receives a non-blocking save invitation
 * on the main score result, even when they never finish the optional activities.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { V5_ELIGIBLE_DAY, fixtureV5Run, wireResult } from "@/lib/daily-challenge/run/fixtures";

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()), track,
}));
vi.mock("@/lib/audio/useSfx", () => ({
  useSfx: () => ({ play: vi.fn(), stop: vi.fn(), preload: vi.fn() }),
}));
import { DailyMainResult } from "./DailyMainResult";

const settled = () => fixtureV5Run(V5_ELIGIBLE_DAY, {
  current_stage_index: 1, main_completed_at: "2026-10-08T12:00:00Z", main_score: 1234,
}, { 0: { status: "completed", child_match_id: "child-0",
  result: wireResult({ correct: 9, answered: 10, score: 16, misses: 1 }) } });

const pending = () => fixtureV5Run(V5_ELIGIBLE_DAY, {},
  { 0: { status: "in_progress", child_match_id: "child-0" } });

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Daily main score save invitation", () => {
  it("appears for a settled guest, uses the existing score, and leaves optional actions enabled", () => {
    const run = settled();
    const onSaveScore = vi.fn();
    render(<DailyMainResult run={run} stage={run.stages[0]} onDone={() => {}}
      onProceed={() => {}} guestSaveEligible onSaveScore={onSaveScore} />);
    expect(screen.getByTestId("daily-main-save-offer")).toHaveTextContent("Keep today's Daily score");
    expect(screen.getByTestId("daily-main-continue")).toBeEnabled();
    expect(screen.getByTestId("daily-done-for-now")).toBeEnabled();
    fireEvent.click(screen.getByTestId("daily-main-save-score"));
    expect(onSaveScore).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("signup_offer_clicked", expect.objectContaining({
      metadata: expect.objectContaining({ placement: "daily_main_result", activity: "daily_challenge" }),
    }));
  });

  it("does not present the offer to a registered user", () => {
    const run = settled();
    render(<DailyMainResult run={run} stage={run.stages[0]} onDone={() => {}}
      onProceed={() => {}} onSaveScore={() => {}} />);
    expect(screen.queryByTestId("daily-main-save-offer-slot")).toBeNull();
    expect(track).not.toHaveBeenCalledWith("signup_offer_shown", expect.anything());
  });

  it("reserves its compact slot while scoring and shows only on settlement", () => {
    const before = pending();
    const { rerender } = render(<DailyMainResult run={before} stage={before.stages[0]}
      onDone={() => {}} guestSaveEligible onSaveScore={() => {}} />);
    expect(screen.getByTestId("daily-main-save-offer-slot")).toBeInTheDocument();
    expect(screen.queryByTestId("daily-main-save-offer")).toBeNull();
    expect(track).not.toHaveBeenCalledWith("signup_offer_shown", expect.anything());
    const after = settled();
    rerender(<DailyMainResult run={after} stage={after.stages[0]}
      onDone={() => {}} onProceed={() => {}} guestSaveEligible onSaveScore={() => {}} />);
    expect(screen.getByTestId("daily-main-save-offer")).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith("signup_offer_shown", expect.objectContaining({
      metadata: expect.objectContaining({ placement: "daily_main_result" }),
    }));
  });
});
