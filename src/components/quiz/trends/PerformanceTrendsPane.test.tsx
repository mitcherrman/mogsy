/**
 * PT1.8 — the Trends pane: paywall, the NON-paywall, windows, sparse data.
 *
 * The pane is presentation over a server-resolved capability, so what these
 * tests assert is that it renders the server's answer rather than inventing
 * one — including the case this whole shape exists to prevent: a request that
 * did NOT return must never be drawn as "you need to subscribe".
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));

const api = vi.hoisted(() => ({
  capability: vi.fn(),
  trends: vi.fn(),
}));
vi.mock("@/lib/quiz/analyticsApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/quiz/analyticsApi")>();
  return { ...original, analyticsApi: api };
});

import PerformanceTrendsPane from "./PerformanceTrendsPane";

const PREMIUM = {
  can_view_trends: true,
  trend_windows: [7, 30, 90],
  can_build: true,
  reason: "premium",
};
const FREE = {
  can_view_trends: false,
  trend_windows: [] as number[],
  can_build: false,
  reason: "free",
};

const day = (n: number) => `2026-09-${String(n).padStart(2, "0")}`;

const REPORT = (over: Record<string, unknown> = {}) => ({
  ok: true,
  capability: PREMIUM,
  windows: [7, 30, 90],
  window_days: 7,
  since: "2026-08-29 12:00:00",
  until: "2026-09-05 12:00:00",
  previous_since: "2026-08-22 12:00:00",
  current: { attempts: 40, correct: 30, accuracy: 75, active_days: 4 },
  previous: { attempts: 30, correct: 15, accuracy: 50, active_days: 3 },
  delta: {
    attempts: 10,
    accuracy_points: 25,
    active_days: 1,
    direction: "improving",
    comparable: true,
  },
  series: [
    { date: day(1), attempts: 10, correct: 8, accuracy: 80 },
    { date: day(2), attempts: 0, correct: 0, accuracy: null },
    { date: day(3), attempts: 30, correct: 22, accuracy: 73.33 },
  ],
  modes: [
    { mode: "standard", label: "Practice", known: true, attempts: 30, correct: 24, accuracy: 80 },
    { mode: "daily_score_attack", label: "Time Trial", known: true, attempts: 10, correct: 6, accuracy: 60 },
  ],
  categories: [
    {
      category: "Runes", attempts: 12, correct: 4, accuracy: 33.33,
      previous_attempts: 10, previous_accuracy: 30, delta_points: 3.33,
      direction: "steady", eligible: true, is_weak: true, is_recurring_weak: true,
    },
    {
      category: "Item Costs", attempts: 28, correct: 26, accuracy: 92.86,
      previous_attempts: 20, previous_accuracy: 70, delta_points: 22.86,
      direction: "improving", eligible: true, is_weak: false, is_recurring_weak: false,
    },
  ],
  recurring_weak: ["Runes"],
  sufficiency: {
    min_attempts: 10, category_min_attempts: 5, trend_points: 5,
    has_data: true, enough_for_trend: true, enough_for_comparison: true,
  },
  counts_modes: ["practice", "time_trial_official"],
  excludes_modes: ["ranked", "daily_challenge", "mastery"],
  ...over,
});

beforeEach(() => {
  api.capability.mockReset();
  api.trends.mockReset();
  api.capability.mockResolvedValue({ ok: true, capability: PREMIUM });
  api.trends.mockResolvedValue(REPORT());
});

afterEach(cleanup);

// ------------------------------------------------------------------- gating

describe("PT1.8 — what the pane draws for whom", () => {
  it("shows Premium the reading", async () => {
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-pane")).toBeTruthy());
    expect(screen.getByTestId("trends-movement").textContent).toMatch(/up 25 points/i);
    expect(screen.queryByTestId("trends-locked")).toBeNull();
  });

  it("shows Free a paywall, and never asks for the data", async () => {
    api.capability.mockResolvedValue({ ok: true, capability: FREE });
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-locked")).toBeTruthy());
    expect(api.trends).not.toHaveBeenCalled();
  });

  it("tells a Free reader what stays theirs", async () => {
    api.capability.mockResolvedValue({ ok: true, capability: FREE });
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-free-note")).toBeTruthy());
    expect(screen.getByTestId("trends-free-note").textContent).toMatch(/stay free/i);
  });

  it("A FAILED REQUEST IS NOT A PAYWALL", async () => {
    api.capability.mockRejectedValue(new Error("503 Entitlement lookup failed"));
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-error")).toBeTruthy());
    expect(screen.queryByTestId("trends-locked")).toBeNull();
    expect(screen.getByTestId("trends-error").textContent).toMatch(/not a subscription problem/i);
  });

  it("retries from the failure state without reloading the page", async () => {
    api.capability.mockRejectedValueOnce(new Error("network"));
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-retry")).toBeTruthy());
    fireEvent.click(screen.getByTestId("trends-retry"));
    await waitFor(() => expect(screen.getByTestId("trends-pane")).toBeTruthy());
  });

  it("reads nothing at all while the pane is closed", () => {
    render(<PerformanceTrendsPane open={false} />);
    expect(api.capability).not.toHaveBeenCalled();
    expect(api.trends).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------ windows

describe("PT1.8 — the windows", () => {
  it("offers exactly the windows the server named", async () => {
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-window-picker")).toBeTruthy());
    expect(screen.getByTestId("trends-window-7")).toBeTruthy();
    expect(screen.getByTestId("trends-window-30")).toBeTruthy();
    expect(screen.getByTestId("trends-window-90")).toBeTruthy();
  });

  it("asks the server for the window that was pressed", async () => {
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-window-30")).toBeTruthy());
    api.trends.mockResolvedValue(REPORT({ window_days: 30 }));
    fireEvent.click(screen.getByTestId("trends-window-30"));
    await waitFor(() => expect(api.trends).toHaveBeenCalledWith(30));
  });

  it("opens on the first window the capability offers", async () => {
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(api.trends).toHaveBeenCalledWith(7));
  });
});

// ------------------------------------------------------------- sparse data

describe("PT1.8 — when there is not enough to say", () => {
  it("does not print a delta the server refused to compute", async () => {
    api.trends.mockResolvedValue(
      REPORT({
        current: { attempts: 3, correct: 2, accuracy: 66.67, active_days: 1 },
        previous: { attempts: 0, correct: 0, accuracy: 0, active_days: 0 },
        delta: {
          attempts: 3, accuracy_points: null, active_days: 1,
          direction: "insufficient", comparable: false,
        },
        sufficiency: {
          min_attempts: 10, category_min_attempts: 5, trend_points: 5,
          has_data: true, enough_for_trend: false, enough_for_comparison: false,
        },
      }),
    );
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-movement")).toBeTruthy());
    const line = screen.getByTestId("trends-movement").textContent ?? "";
    expect(line).toMatch(/3 answers so far/i);
    expect(line).not.toMatch(/up |down /i);
  });

  it("says an empty window is empty rather than nought per cent", async () => {
    api.trends.mockResolvedValue(
      REPORT({
        current: { attempts: 0, correct: 0, accuracy: 0, active_days: 0 },
        previous: { attempts: 0, correct: 0, accuracy: 0, active_days: 0 },
        delta: {
          attempts: 0, accuracy_points: null, active_days: 0,
          direction: "insufficient", comparable: false,
        },
        series: [],
        modes: [],
        categories: [],
        recurring_weak: [],
        sufficiency: {
          min_attempts: 10, category_min_attempts: 5, trend_points: 5,
          has_data: false, enough_for_trend: false, enough_for_comparison: false,
        },
      }),
    );
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-movement")).toBeTruthy());
    expect(screen.getByTestId("trends-movement").textContent).toMatch(/no answers in this window/i);
    expect(screen.queryByTestId("trends-sparkline")).toBeNull();
    expect(screen.queryByTestId("trends-recurring")).toBeNull();
  });

  it("calls a first window a first window, not an improvement", async () => {
    api.trends.mockResolvedValue(
      REPORT({
        previous: { attempts: 0, correct: 0, accuracy: 0, active_days: 0 },
        delta: {
          attempts: 40, accuracy_points: null, active_days: 4,
          direction: "insufficient", comparable: false,
        },
        sufficiency: {
          min_attempts: 10, category_min_attempts: 5, trend_points: 5,
          has_data: true, enough_for_trend: true, enough_for_comparison: false,
        },
      }),
    );
    render(<PerformanceTrendsPane />);
    await waitFor(() =>
      expect(screen.getByTestId("trends-movement").textContent).toMatch(/first full window/i),
    );
  });
});

// --------------------------------------------------------- the Builder handoff

describe("PT1.8 — handing a weakness to the Practice Builder", () => {
  it("sends ONE category as a plain category filter, not as the weak pool", async () => {
    const onPractise = vi.fn();
    render(<PerformanceTrendsPane onPractiseWeakness={onPractise} />);
    await waitFor(() => expect(screen.getAllByTestId("trends-practise-category").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId("trends-practise-category")[0]);
    expect(onPractise).toHaveBeenCalledWith({ pool: "bank", category: "Runes" });
  });

  it("sends the PLURAL button as the Builder's own weak pool", async () => {
    const onPractise = vi.fn();
    render(<PerformanceTrendsPane onPractiseWeakness={onPractise} />);
    await waitFor(() => expect(screen.getByTestId("trends-build-weak-session")).toBeTruthy());
    fireEvent.click(screen.getByTestId("trends-build-weak-session"));
    expect(onPractise).toHaveBeenCalledWith({ pool: "weak", category: null });
  });

  it("offers no handoff when the host did not supply one", async () => {
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-pane")).toBeTruthy());
    expect(screen.queryByTestId("trends-build-weak-session")).toBeNull();
    expect(screen.queryByTestId("trends-practise-category")).toBeNull();
  });

  it("offers the handoff only for a RECURRING weakness", async () => {
    const onPractise = vi.fn();
    render(<PerformanceTrendsPane onPractiseWeakness={onPractise} />);
    await waitFor(() => expect(screen.getByTestId("trends-pane")).toBeTruthy());
    // Two categories are rendered; only Runes is recurring.
    expect(screen.getAllByTestId("trends-practise-category").length).toBe(2);
    // …the second is the same Runes row, printed once under "keeps coming
    // back" and once in the full list. Item Costs offers no button.
    for (const button of screen.getAllByTestId("trends-practise-category")) {
      expect(button.closest("li")!.textContent).toMatch(/Runes/);
    }
  });
});

// ------------------------------------------------------------------- honesty

describe("PT1.8 — what the pane says about itself", () => {
  it("names the record it is reading and the ones it is not", async () => {
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-scope-note")).toBeTruthy());
    const note = screen.getByTestId("trends-scope-note").textContent ?? "";
    expect(note).toMatch(/practice and time trial/i);
    expect(note).toMatch(/ranked/i);
    expect(note).toMatch(/mastery/i);
  });

  it("renders no question, no answer and no explanation", async () => {
    const { container } = render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-pane")).toBeTruthy());
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/explanation/i);
    expect(text).not.toMatch(/correct answer/i);
    expect(container.querySelectorAll("img").length).toBe(0);
  });

  it("plots VOLUME, and leaves a quiet day empty rather than at zero per cent", async () => {
    const { container } = render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-sparkline")).toBeTruthy());
    const bars = container.querySelectorAll('[data-testid="trends-sparkline"] rect');
    expect(bars.length).toBe(3);
    // The zero-attempt day draws nothing at all.
    expect((bars[1] as SVGRectElement).getAttribute("height")).toBe("0");
  });
});
