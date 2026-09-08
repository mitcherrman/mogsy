/**
 * PT1.8 — the Trends pane: paywall, the NON-paywall, windows, sparse data.
 *
 * The pane is presentation over a server-resolved capability, so what these
 * tests assert is that it renders the server's answer rather than inventing
 * one — including the case this whole shape exists to prevent: a request that
 * did NOT return must never be drawn as "you need to subscribe".
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import type { TrendsSource } from "./usePerformanceTrends";
import type { TrendReport } from "@/lib/quiz/analyticsApi";

const PREMIUM = {
  can_view_snapshot: true,
  snapshot_window_days: 7,
  can_view_trends: true,
  trend_windows: [7, 30, 90],
  allowed_windows: [7, 30, 90],
  can_build: true,
  reason: "premium",
};
const FREE = {
  can_view_snapshot: true,
  snapshot_window_days: 7,
  can_view_trends: false,
  trend_windows: [] as number[],
  allowed_windows: [7],
  can_build: false,
  reason: "free",
};

const day = (n: number) => `2026-09-${String(n).padStart(2, "0")}`;

const REPORT = (over: Record<string, unknown> = {}) => ({
  ok: true,
  tier: "premium",
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

/** PT1.10 — exactly what the server projects for Free: the figures, with the
 *  comparison and the diagnosis absent (not null). */
const SNAPSHOT = (over: Record<string, unknown> = {}) => ({
  ok: true,
  tier: "free",
  capability: FREE,
  windows: [] as number[],
  // PT1.11 — bounded by ANSWERS, so no window length and no window to pick.
  window_days: null,
  since: "2026-07-02 12:00:00",
  until: "2026-09-05 12:00:00",
  recent_answers: 50,
  span_days: 26,
  current: { attempts: 50, correct: 35, accuracy: 70, active_days: 12 },
  modes: [
    { mode: "standard", label: "Practice", known: true, attempts: 8, correct: 6, accuracy: 75 },
    { mode: "daily_score_attack", label: "Time Trial", known: true, attempts: 8, correct: 7, accuracy: 87.5 },
  ],
  categories: [
    { category: "Item Costs", attempts: 6, correct: 2, accuracy: 33.3, low_sample: false },
    { category: "Rune Recognition", attempts: 5, correct: 5, accuracy: 100, low_sample: false },
    { category: "Objective Timers", attempts: 1, correct: 1, accuracy: 100, low_sample: true },
  ],
  sufficiency: { has_data: true },
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

  it("PT1.10 — shows Free its own figures, and DOES ask for the data", async () => {
    // The behaviour this phase exists to change: Free used to be shown a sales
    // card and the report was never requested.
    api.capability.mockResolvedValue({ ok: true, capability: FREE });
    api.trends.mockResolvedValue(SNAPSHOT());
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-pane")).toBeTruthy());
    expect(api.trends).toHaveBeenCalledWith(7);
    expect(screen.queryByTestId("trends-locked")).toBeNull();
    const pane = screen.getByTestId("trends-pane").textContent ?? "";
    expect(pane).toContain("50");        // answers
    expect(pane).toContain("70%");       // accuracy
    expect(pane).toContain("12");        // days studied
    expect(pane).toContain("Item Costs");
    expect(pane).toContain("33.3%");
    expect(pane).toContain("Rune Recognition");
    expect(pane).toContain("100%");
  });

  it("gives Free the mode breakdown", async () => {
    api.capability.mockResolvedValue({ ok: true, capability: FREE });
    api.trends.mockResolvedValue(SNAPSHOT());
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-modes")).toBeTruthy());
    const modes = screen.getByTestId("trends-modes").textContent ?? "";
    expect(modes).toContain("Practice");
    expect(modes).toContain("Time Trial");
  });

  it("does NOT show Free the interpretation", async () => {
    api.capability.mockResolvedValue({ ok: true, capability: FREE });
    api.trends.mockResolvedValue(SNAPSHOT());
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-pane")).toBeTruthy());
    expect(screen.queryByTestId("trends-movement")).toBeNull();
    expect(screen.queryByTestId("trends-sparkline")).toBeNull();
    expect(screen.queryByTestId("trends-recurring")).toBeNull();
    expect(screen.queryByTestId("trends-category-delta")).toBeNull();
    // and no window picker, because one window is not a choice
    expect(screen.getByTestId("trends-window-picker").hasAttribute("hidden")).toBe(true);
  });

  it("offers Free the upsell as a footer, below its own figures", async () => {
    api.capability.mockResolvedValue({ ok: true, capability: FREE });
    api.trends.mockResolvedValue(SNAPSHOT());
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-premium-upsell")).toBeTruthy());
    // The upsell exists, but it is not the whole surface: the figures are
    // rendered above it in the same pane.
    expect(screen.getByTestId("trends-pane")).toBeTruthy();
    expect(screen.getByTestId("trends-premium-link").getAttribute("href"))
      .toBe("/lol/premium");
  });

  it("tells a Free reader with an empty window that it is empty, not broken", async () => {
    api.capability.mockResolvedValue({ ok: true, capability: FREE });
    api.trends.mockResolvedValue(SNAPSHOT({
      current: { attempts: 0, correct: 0, accuracy: 0, active_days: 0 },
      categories: [], modes: [], sufficiency: { has_data: false },
    }));
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-snapshot-empty")).toBeTruthy());
    expect(screen.queryByTestId("trends-error")).toBeNull();
  });

  it("keeps showing Premium the interpretation", async () => {
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-pane")).toBeTruthy());
    expect(screen.getByTestId("trends-movement")).toBeTruthy();
    expect(screen.getByTestId("trends-sparkline")).toBeTruthy();
    expect(screen.getByTestId("trends-window-picker").hasAttribute("hidden")).toBe(false);
    expect(screen.queryByTestId("trends-premium-upsell")).toBeNull();
  });

  /* The paywall is the ONE Trends surface that cannot show the scope note, so
     its own sentence has to carry the scope. Without this, a player whose study
     is mostly Ranked reads "your accuracy" as a promise about every mode and
     buys a reading of a record that does not contain their play. */
  it("names the record it reads, to Free as well as Premium", async () => {
    // The scope note is a statement of fact about the caller's own totals, so
    // it belongs with the totals — which Free now has.
    api.capability.mockResolvedValue({ ok: true, capability: FREE });
    api.trends.mockResolvedValue(SNAPSHOT());
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-scope-note")).toBeTruthy());
    expect(screen.getByTestId("trends-scope-note").textContent ?? "")
      .toMatch(/practice and time trial/i);
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

  /* Found live on mogzy.lol: a guest opening the tab was told "unavailable
     right now — this is not a subscription problem", because the backend's
     403 ACCOUNT_REQUIRED reaches the client as a failed request. A guest has
     no record to read; that is permanent and actionable, not a fault. */
  it("asks a guest to sign in, and spends no request being refused", () => {
    render(<PerformanceTrendsPane hasAccount={false} signInHref="/auth?x=1" />);
    expect(screen.getByTestId("trends-signed-out")).toBeTruthy();
    expect(screen.getByTestId("trends-sign-in").getAttribute("href")).toBe("/auth?x=1");
    expect(screen.queryByTestId("trends-error")).toBeNull();
    expect(screen.queryByTestId("trends-locked")).toBeNull();
    expect(api.capability).not.toHaveBeenCalled();
    expect(api.trends).not.toHaveBeenCalled();
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
    // Only Runes is recurring, and PT1.11 puts the action on the diagnosis
    // rather than on every listing of the category — so exactly one button.
    const buttons = screen.getAllByTestId("trends-practise-category");
    expect(buttons.length).toBe(1);
    expect(buttons[0].closest("li")!.textContent).toMatch(/Runes/);
    expect(buttons[0].closest("[data-testid='trends-recurring']")).toBeTruthy();
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

  it("prints an untouched category as absent, not as nought per cent", async () => {
    api.trends.mockResolvedValue(
      REPORT({
        categories: [
          {
            category: "Runes", attempts: 0, correct: 0, accuracy: 0,
            previous_attempts: 24, previous_accuracy: 95.83, delta_points: null,
            direction: "insufficient", eligible: false, is_weak: false,
            is_recurring_weak: false,
          },
        ],
      }),
    );
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-categories")).toBeTruthy());
    const row = screen.getAllByTestId("trends-category-row")[0].textContent ?? "";
    expect(row).toMatch(/nothing this window/i);
    expect(row).toMatch(/was 95\.8%/);
    expect(row).not.toMatch(/\b0%/);
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


// ------------------------------------------------- PT1.9 did not change this

describe("PT1.9 — the pane still defaults to the reader's OWN record", () => {
  it("uses the self-scoped analytics API when no source is given", async () => {
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-pane")).toBeTruthy());
    // The injectable source is an admin-preview seam, not a change of default:
    // every consumer render must still go to the API that takes no user id.
    expect(api.capability).toHaveBeenCalled();
    expect(api.trends).toHaveBeenCalled();
  });

  it("prints no demo notice for a real reader", async () => {
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-pane")).toBeTruthy());
    expect(screen.queryByTestId("trends-demo-notice")).toBeNull();
  });

  it("prints the demo notice on the Free snapshot too when one is given", async () => {
    // The banner has to survive every branch a screenshot could be taken from,
    // and since PT1.10 the Free branch is a full pane rather than a card.
    api.capability.mockResolvedValue({ ok: true, capability: FREE });
    api.trends.mockResolvedValue(SNAPSHOT());
    render(<PerformanceTrendsPane demoNotice="DEMO — synthetic record." />);
    await waitFor(() => expect(screen.getByTestId("trends-pane")).toBeTruthy());
    expect(screen.getByTestId("trends-demo-notice").textContent).toContain("DEMO");
  });

  it("reads an injected source instead, and leaves the real API alone", async () => {
    const source: TrendsSource = {
      capability: vi.fn(async () => ({ capability: PREMIUM })),
      trends: vi.fn(async () => REPORT() as unknown as TrendReport),
    };
    render(<PerformanceTrendsPane source={source} />);
    await waitFor(() => expect(screen.getByTestId("trends-pane")).toBeTruthy());
    expect(source.capability).toHaveBeenCalled();
    expect(api.capability).not.toHaveBeenCalled();
    expect(api.trends).not.toHaveBeenCalled();
  });
});


// ------------------------------------------- PT1.10 — the trend-glyph cleanup

describe("PT1.11 — trends in words, not notation", () => {
  const withCategories = (categories: unknown[]) =>
    REPORT({ categories, recurring_weak: [] });

  it("says so in words when there is no comparison behind a row", async () => {
    // The old render produced `100% — —`: an em-dash where a direction belongs
    // and another where a number belongs, both of which read as measurements.
    api.trends.mockResolvedValue(withCategories([
      {
        category: "Objective Timers", attempts: 2, correct: 2, accuracy: 100,
        previous_attempts: 0, previous_accuracy: null, delta_points: null,
        direction: "insufficient", eligible: false, is_weak: false,
        is_recurring_weak: false,
      },
    ]));
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-categories")).toBeTruthy());
    const row = screen.getAllByTestId("trends-category-row")[0];
    // The accuracy survives — it is the reader's own result.
    expect(within(row).getByTestId("trends-category-accuracy").textContent).toBe("100%");
    // The trend slot carries a sentence, never a placeholder glyph.
    expect(within(row).getByTestId("trends-category-delta").textContent)
      .toBe("Not enough data for a trend");
    expect(row.textContent).not.toMatch(/—\s*—/);
  });

  it("uses the same honest wording when a prior figure exists but is thin", async () => {
    api.trends.mockResolvedValue(withCategories([
      {
        // Prior data EXISTS, but too few answers to call a direction.
        category: "Objective Timers", attempts: 1, correct: 1, accuracy: 100,
        previous_attempts: 2, previous_accuracy: 100, delta_points: null,
        direction: "insufficient", eligible: false, is_weak: false,
        is_recurring_weak: false,
      },
    ]));
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-categories")).toBeTruthy());
    const row = screen.getAllByTestId("trends-category-row")[0];
    expect(within(row).getByTestId("trends-category-accuracy").textContent).toBe("100%");
    expect(within(row).getByTestId("trends-category-delta").textContent)
      .toBe("Not enough data for a trend");
    // The prior figure is still shown, so the reader can see there IS history
    // — just not enough of it on one side to call a direction.
    expect(row.textContent).toMatch(/was 100%/);
    expect(row.textContent).not.toMatch(/—\s*—/);
  });

  it("still prints a real direction when there is one", async () => {
    api.trends.mockResolvedValue(withCategories([
      {
        category: "Rune Recognition", attempts: 26, correct: 22, accuracy: 84.6,
        previous_attempts: 26, previous_accuracy: 42.3, delta_points: 42.3,
        direction: "improving", eligible: true, is_weak: false,
        is_recurring_weak: false,
      },
    ]));
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-categories")).toBeTruthy());
    const row = screen.getAllByTestId("trends-category-row")[0];
    expect(within(row).getByTestId("trends-category-accuracy").textContent).toBe("84.6%");
    // PT1.11 — the conclusion first, then the number behind it.
    expect(within(row).getByTestId("trends-category-delta").textContent)
      .toBe("Improving · +42.3 pts");
  });

  it("preserves current accuracy for a Free row, which has no trend at all", async () => {
    api.capability.mockResolvedValue({ ok: true, capability: FREE });
    api.trends.mockResolvedValue(SNAPSHOT());
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-categories")).toBeTruthy());
    const rows = screen.getAllByTestId("trends-category-row");
    const texts = rows.map((r) => r.textContent ?? "");
    expect(texts.join(" ")).toContain("33.3%");
    expect(texts.join(" ")).toContain("100%");
    for (const row of rows) {
      expect(within(row).queryByTestId("trends-category-delta")).toBeNull();
      // Free has no prior-period concept at all, so it is not told there is
      // "not enough" of it — that would imply a comparison it was never in.
      expect(within(row).queryByTestId("trends-no-prior-data")).toBeNull();
      expect(row.textContent).not.toMatch(/—\s*—/);
    }
  });

  it("says Steady rather than printing a bare 0", async () => {
    api.trends.mockResolvedValue(withCategories([
      {
        category: "Item Costs", attempts: 6, correct: 2, accuracy: 33.3,
        previous_attempts: 6, previous_accuracy: 33.3, delta_points: 0,
        direction: "steady", eligible: true, is_weak: true,
        is_recurring_weak: false,
      },
    ]));
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-categories")).toBeTruthy());
    const row = screen.getAllByTestId("trends-category-row")[0];
    expect(within(row).getByTestId("trends-category-delta").textContent).toBe("Steady");
    expect(within(row).getByTestId("trends-category-accuracy").textContent).toBe("33.3%");
    expect(row.textContent).not.toMatch(/—\s*0\b/);
  });

  it("says Declining with the size of the drop", async () => {
    api.trends.mockResolvedValue(withCategories([
      {
        category: "Champion Ability Cooldowns", attempts: 20, correct: 12,
        accuracy: 60, previous_attempts: 23, previous_accuracy: 73.9,
        delta_points: -13.9, direction: "declining", eligible: true,
        is_weak: true, is_recurring_weak: false,
      },
    ]));
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-categories")).toBeTruthy());
    const row = screen.getAllByTestId("trends-category-row")[0];
    expect(within(row).getByTestId("trends-category-delta").textContent)
      .toBe("Declining · −13.9 pts");
  });
});


// ------------------------------------------- PT1.11 — Recent Performance & polish

describe("PT1.11 — Recent Performance, and reading the record", () => {
  const asFree = () => {
    api.capability.mockResolvedValue({ ok: true, capability: FREE });
    api.trends.mockResolvedValue(SNAPSHOT());
  };

  it("calls the Free pane Recent Performance, not a calendar window", async () => {
    asFree();
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-pane")).toBeTruthy());
    const pane = screen.getByTestId("trends-pane").textContent ?? "";
    expect(pane).toContain("Recent Performance");
    expect(pane).not.toMatch(/last 7 days/i);
  });

  it("states the span the snapshot actually covered", async () => {
    asFree();
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-recent-span")).toBeTruthy());
    // 50 answers spread over 26 days — a reader returning after a break is
    // told when their record is from rather than being shown an empty pane.
    expect(screen.getByTestId("trends-recent-span").textContent)
      .toMatch(/last 50 answers, over 26 days/i);
  });

  it("does not print a window length Free never consulted", async () => {
    asFree();
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-pane")).toBeTruthy());
    expect(screen.getByTestId("trends-pane").textContent ?? "")
      .not.toMatch(/of null/);
  });

  it("de-emphasises a one-answer category without hiding its real figures", async () => {
    asFree();
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-categories")).toBeTruthy());
    const rows = screen.getAllByTestId("trends-category-row");
    const thin = rows.find((r) => (r.textContent ?? "").includes("Objective Timers"))!;
    // The true score and the true count both survive.
    expect(within(thin).getByTestId("trends-category-accuracy").textContent).toBe("100%");
    expect(thin.textContent).toContain("1 answer");
    // And it says why it should not be read as the same claim.
    expect(within(thin).getByTestId("trends-low-sample").textContent)
      .toMatch(/too few to read much into/i);
    // A well-evidenced row carries no such note.
    const solid = rows.find((r) => (r.textContent ?? "").includes("Item Costs"))!;
    expect(within(solid).queryByTestId("trends-low-sample")).toBeNull();
  });

  it("renames the recurring-weakness block and explains what it means", async () => {
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-recurring")).toBeTruthy());
    const block = screen.getByTestId("trends-recurring").textContent ?? "";
    expect(block).toContain("Recurring Weaknesses");
    expect(block).not.toMatch(/keeps coming back/i);
    // "repeatedly across periods", not "low once".
    expect(block).toMatch(/this period and the one before it/i);
    expect(block).toMatch(/not just a low score once/i);
  });

  it("offers a named Practice action on a recurring weakness, via the Builder", async () => {
    const onPractise = vi.fn();
    render(<PerformanceTrendsPane onPractiseWeakness={onPractise} />);
    await waitFor(() => expect(screen.getByTestId("trends-recurring")).toBeTruthy());
    const button = within(screen.getByTestId("trends-recurring"))
      .getByTestId("trends-practise-category");
    expect(button.textContent).toBe("Practice Runes");
    fireEvent.click(button);
    // The EXISTING PT1.7B preset shape, unchanged: a single category goes as
    // the bank pool narrowed to it, never as the Builder's own weak pool.
    expect(onPractise).toHaveBeenCalledWith({ pool: "bank", category: "Runes" });
  });

  it("puts the Practice action on the diagnosis, not on every listing of it", async () => {
    const onPractise = vi.fn();
    render(<PerformanceTrendsPane onPractiseWeakness={onPractise} />);
    await waitFor(() => expect(screen.getByTestId("trends-recurring")).toBeTruthy());
    // Runes is both a recurring weakness AND a row in the full category list.
    const recurring = within(screen.getByTestId("trends-recurring"))
      .getAllByTestId("trends-practise-category");
    const catalogue = within(screen.getByTestId("trends-categories"))
      .queryAllByTestId("trends-practise-category");
    expect(recurring.length).toBeGreaterThan(0);
    expect(catalogue.length).toBe(0);
    // The category itself is still listed in full — nothing was removed.
    expect(screen.getByTestId("trends-categories").textContent).toContain("Runes");
  });

  it("never offers the Practice action to Free", async () => {
    asFree();
    const onPractise = vi.fn();
    render(<PerformanceTrendsPane onPractiseWeakness={onPractise} />);
    await waitFor(() => expect(screen.getByTestId("trends-pane")).toBeTruthy());
    // `is_recurring_weak` is a field a Free payload does not carry at all, so
    // the action disappears by construction rather than by a second check.
    expect(screen.queryByTestId("trends-practise-category")).toBeNull();
    expect(screen.queryByTestId("trends-build-weak-session")).toBeNull();
    expect(onPractise).not.toHaveBeenCalled();
  });

  it("labels the volume chart so it means something without explanation", async () => {
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-volume-chart")).toBeTruthy());
    const chart = screen.getByTestId("trends-volume-chart").textContent ?? "";
    expect(chart).toContain("Answers per day");
    expect(screen.getByTestId("trends-volume-peak").textContent)
      .toMatch(/peak \d+ · \d+ total/);
    // And its two ends are dated, so the bars sit on a timeline.
    expect(screen.getByTestId("trends-volume-from").textContent).toBeTruthy();
    expect(screen.getByTestId("trends-volume-to").textContent).toBeTruthy();
  });

  it("shows Free no chart, because the series is Premium", async () => {
    asFree();
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-pane")).toBeTruthy());
    expect(screen.queryByTestId("trends-volume-chart")).toBeNull();
  });

  it("keeps Premium 7/30/90 intact", async () => {
    render(<PerformanceTrendsPane />);
    await waitFor(() => expect(screen.getByTestId("trends-pane")).toBeTruthy());
    const picker = screen.getByTestId("trends-window-picker");
    expect(picker.hasAttribute("hidden")).toBe(false);
    for (const days of [7, 30, 90]) {
      expect(within(picker).getByTestId(`trends-window-${days}`)).toBeTruthy();
    }
    expect(screen.getByTestId("trends-movement")).toBeTruthy();
  });
});
