/** RL2 — the Academy carousel: its two slides, its three controls, and the
 *  boundary that keeps a role dimension out of production. */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import AcademyAnalyticsCarousel from "./AcademyAnalyticsCarousel";
import type { TrendsSource } from "@/components/quiz/trends/usePerformanceTrends";
import type { TrendReport } from "@/lib/quiz/analyticsApi";

const capability = (windows: number[]) => ({
  can_view_snapshot: true,
  snapshot_window_days: windows[0],
  can_view_trends: windows.length > 1,
  trend_windows: windows.length > 1 ? windows : [],
  allowed_windows: windows,
  can_build: false,
  reason: "test",
});

const report = (windowDays: number): TrendReport =>
  ({
    ok: true,
    tier: windowDays === 7 ? "free" : "premium",
    capability: capability([7]),
    windows: [7],
    window_days: windowDays,
    since: null,
    until: null,
    current: { attempts: 30, correct: 21, accuracy: 70, active_days: 3 },
    modes: [
      { mode: "practice", label: "Practice", known: true, attempts: 20, correct: 15, accuracy: 75 },
      { mode: "ranked", label: "Ranked", known: true, attempts: 10, correct: 6, accuracy: 60 },
    ],
    categories: [
      { category: "Items", attempts: 18, correct: 14, accuracy: 78 },
      { category: "Runes", attempts: 12, correct: 7, accuracy: 58 },
    ],
    counts_modes: ["practice", "ranked"],
    excludes_modes: [],
    sufficiency: { has_data: true },
  }) as unknown as TrendReport;

const source = (windows: number[] = [7]): TrendsSource => ({
  capability: async () => ({ capability: capability(windows) }),
  trends: async (days: number) => report(days),
});

describe("the two slides", () => {
  it("opens on the bar chart and moves to the donut", async () => {
    render(<AcademyAnalyticsCarousel source={source()} />);
    await waitFor(() => expect(screen.getByTestId("lobby-accuracy-bars")).toBeTruthy());
    expect(screen.getByTestId("academy-analytics-caption").textContent).toBe(
      "Accuracy by category",
    );
    fireEvent.click(screen.getByTestId("academy-analytics-next"));
    expect(screen.getByTestId("lobby-distribution-donut")).toBeTruthy();
    expect(screen.getByTestId("academy-analytics-caption").textContent).toBe(
      "Answers by category",
    );
  });

  it("wraps around, so neither arrow is ever a dead control", async () => {
    render(<AcademyAnalyticsCarousel source={source()} />);
    await waitFor(() => expect(screen.getByTestId("lobby-accuracy-bars")).toBeTruthy());
    fireEvent.click(screen.getByTestId("academy-analytics-prev"));
    expect(screen.getByTestId("lobby-distribution-donut")).toBeTruthy();
  });
});

describe("Time is the server's answer, not the client's", () => {
  it("renders one pill for a Free account, and still renders it", async () => {
    render(<AcademyAnalyticsCarousel source={source([7])} />);
    await waitFor(() => expect(screen.getByTestId("lobby-analytics-window-7")).toBeTruthy());
    expect(screen.queryByTestId("lobby-analytics-window-30")).toBeNull();
  });

  it("offers every window the capability allows, and re-reads on a change", async () => {
    const src = source([7, 30, 90]);
    const trends = vi.spyOn(src, "trends");
    render(<AcademyAnalyticsCarousel source={src} />);
    await waitFor(() => expect(screen.getByTestId("lobby-analytics-window-90")).toBeTruthy());
    fireEvent.click(screen.getByTestId("lobby-analytics-window-30"));
    await waitFor(() => expect(trends).toHaveBeenCalledWith(30));
  });
});

describe("Mode chooses the dimension", () => {
  it("switches both slides to modes when a single mode is picked", async () => {
    render(<AcademyAnalyticsCarousel source={source()} />);
    await waitFor(() => expect(screen.getByTestId("lobby-analytics-mode-ranked")).toBeTruthy());
    fireEvent.click(screen.getByTestId("lobby-analytics-mode-ranked"));
    expect(screen.getByTestId("academy-analytics-carousel").getAttribute("data-dimension")).toBe(
      "mode",
    );
    expect(screen.getByTestId("academy-analytics-caption").textContent).toBe("Accuracy by mode");
  });
});

describe("Role is inert in production", () => {
  it("renders the control disabled when no demo dimension is supplied", async () => {
    render(<AcademyAnalyticsCarousel source={source()} />);
    await waitFor(() => expect(screen.getByTestId("lobby-analytics-role-top")).toBeTruthy());
    expect(screen.getByTestId("lobby-analytics-role-top")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("lobby-analytics-role-all")).toHaveProperty("disabled", true);
  });

  it("is operable only when a demo dimension is passed", async () => {
    const dimension = vi.fn((r: TrendReport) => r);
    render(<AcademyAnalyticsCarousel source={source()} demoRoleDimension={dimension} />);
    await waitFor(() => expect(screen.getByTestId("lobby-analytics-role-mid")).toBeTruthy());
    expect(screen.getByTestId("lobby-analytics-role-mid")).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByTestId("lobby-analytics-role-mid"));
    expect(dimension).toHaveBeenCalledWith(expect.anything(), "mid");
  });
});

describe("failure is never drawn as an empty record", () => {
  it("says the analytics are unavailable when a request does not return", async () => {
    const broken: TrendsSource = {
      capability: async () => {
        throw new Error("offline");
      },
      trends: async () => report(7),
    };
    render(<AcademyAnalyticsCarousel source={broken} />);
    await waitFor(() => expect(screen.getByTestId("academy-analytics-error")).toBeTruthy());
    expect(screen.queryByTestId("academy-analytics-empty")).toBeNull();
  });
});
