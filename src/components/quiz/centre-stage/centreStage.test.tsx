/**
 * PARCHMENT CONTINUITY — the centre sheet's stage contract and the Daily mode.
 * Real pixel sizes are proven in the browser (e2e/parchment-continuity.spec.ts);
 * these pin the structure that produces them.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DailyStatusView } from "@/lib/daily-challenge/status";

const pickerMounts = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/components/quiz/RoleChallengePicker", async () => {
  const { useEffect } = await import("react");
  return {
    default: function PickerStub() {
      useEffect(() => { pickerMounts.count += 1; }, []);
      return <div data-testid="role-challenge-picker" />;
    },
  };
});

import RankedLobbyHero from "@/components/quiz/RankedLobbyHero";
import DailyModePanel, { dailyModeCopy } from "./DailyModePanel";

const RANKED = { isPlaced: false, placementMatchesRemaining: 5 } as never;

const day = (over: Partial<DailyStatusView>): DailyStatusView => ({
  known: true, completed: false, resumable: false, optionalOpen: false,
  resolved: null, total: null, streak: null, theme: null, ...over,
});

function hero(over: Partial<React.ComponentProps<typeof RankedLobbyHero>> = {}) {
  return render(
    <MemoryRouter>
      <RankedLobbyHero progress={null} ranked={RANKED} onPlayRanked={vi.fn()} {...over} />
    </MemoryRouter>,
  );
}

describe("the centre stage", () => {
  it("keeps Ranked laid out as the one sizer while Daily and Role fill it", () => {
    hero({ hasAccount: true });
    const stage = screen.getByTestId("centre-mode-stage");
    const ranked = screen.getByTestId("ranked-mode-panel");
    expect(ranked.parentElement).toBe(stage);
    expect(ranked.className).toContain("lc-centre-pane--sizer");
    const daily = stage.querySelector('[data-mode-pane="daily"]')!;
    expect(daily.className).toContain("lc-centre-pane--fill");

    fireEvent.click(screen.getByRole("tab", { name: "Role Challenge" }));
    const role = screen.getByTestId("role-mode-panel");
    expect(role.parentElement).toBe(stage);
    expect(role.className).toContain("lc-centre-pane--fill");
    // Exactly one sizer, whichever mode shows.
    expect(stage.querySelectorAll(".lc-centre-pane--sizer")).toHaveLength(1);
  });

  it("mounts Role once and keeps it across switches", () => {
    pickerMounts.count = 0;
    hero({ hasAccount: true });
    expect(screen.queryByTestId("role-challenge-picker")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Role Challenge" }));
    fireEvent.click(screen.getByRole("tab", { name: "Ranked" }));
    fireEvent.click(screen.getByRole("tab", { name: "Daily Challenge" }));
    fireEvent.click(screen.getByRole("tab", { name: "Role Challenge" }));
    expect(pickerMounts.count).toBe(1);
    expect(screen.getByTestId("role-mode-panel").getAttribute("aria-hidden")).toBeNull();
  });

  it("only fades a pane in after a switch, never on first paint", () => {
    hero();
    const stage = screen.getByTestId("centre-mode-stage");
    expect(stage.querySelector('[data-animate="true"]')).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Ranked" }));
    expect(screen.getByTestId("ranked-mode-panel").getAttribute("data-animate")).toBe("true");
  });

  it("arrow keys move between modes", () => {
    hero();
    const daily = screen.getByRole("tab", { name: "Daily Challenge" });
    fireEvent.keyDown(daily, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Role Challenge" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Role Challenge" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Ranked" }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("Daily mode", () => {
  it("words each state, and only uses the PLAY seal for a play action", () => {
    expect(dailyModeCopy(null)).toMatchObject({ action: "Play Daily", seal: true, dayState: "—" });
    expect(dailyModeCopy(day({}))).toMatchObject({ action: "Play Daily", seal: true, dayState: "Ready" });
    expect(dailyModeCopy(day({ resumable: true }))).toMatchObject({
      action: "Continue Daily", seal: true, dayState: "In progress" });
    expect(dailyModeCopy(day({ completed: true, resumable: true, optionalOpen: true }))).toMatchObject({
      action: "Continue / Review", seal: true, dayState: "Complete" });
    expect(dailyModeCopy(day({ completed: true }))).toMatchObject({
      action: "View Today's Results", seal: false, dayState: "Complete" });
  });

  it("launches through the wax seal with the action as its accessible name", () => {
    const onPlay = vi.fn();
    render(<DailyModePanel daily={day({ resumable: true })} onPlay={onPlay} />);
    const seal = screen.getByTestId("daily-play-seal");
    expect(seal).toBe(screen.getByRole("button", { name: "Continue Daily" }));
    fireEvent.click(seal);
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it("offers results, not a PLAY seal, on a finished day", () => {
    const onPlay = vi.fn();
    render(<DailyModePanel daily={day({ completed: true, score: 1840, correct: 9, answered: 12 })} onPlay={onPlay} />);
    expect(screen.queryByTestId("daily-play-seal")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View Today's Results" }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("daily-mode-complete")).toBeTruthy();
    expect(screen.getByTestId("daily-mode-mascot").getAttribute("src")).toContain("cheering");
  });

  it("states only real figures — an unsettled day shows em dashes, never zeros or a streak", () => {
    render(<DailyModePanel daily={day({})} onPlay={vi.fn()} />);
    const stats = screen.getAllByTestId("daily-mode-stat").map((n) => n.textContent);
    expect(stats).toEqual(["TodayReady", "Score—", "Correct—"]);
    expect(screen.getByTestId("daily-mode-panel").textContent).not.toMatch(/streak/i);
  });

  it("shows the server's settled score and correct count", () => {
    render(<DailyModePanel daily={day({ completed: true, score: 1840, correct: 9, answered: 12 })} />);
    const stats = screen.getAllByTestId("daily-mode-stat").map((n) => n.textContent);
    expect(stats).toEqual(["TodayComplete", "Score1,840", "Correct9/12"]);
  });

  it("disables the seal when there is nothing to launch", () => {
    render(<DailyModePanel daily={null} />);
    expect((screen.getByTestId("daily-play-seal") as HTMLButtonElement).disabled).toBe(true);
  });
});
