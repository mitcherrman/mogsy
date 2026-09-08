/**
 * PT1.9 — the demo comparison page.
 *
 * What is worth testing here is not the layout. It is that the page renders
 * the REAL Performance Trends pane rather than a copy of it, that the
 * Free/Premium toggle re-reads both answers instead of leaving a Premium
 * report under a Free capability, that the Free half really is the paywall
 * with no report fetched, that every branch carries the demo warning, and that
 * looking at any of it issues no write.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));

/**
 * The transport is a spy, and `demoTrendsSource` is rebuilt over it.
 *
 * Replacing only `demoAnalyticsApi` would not work: ESM live bindings mean the
 * real `demoTrendsSource` still closes over the real client inside its own
 * module, so the page would have gone to the network while the spy sat idle
 * and every "it never fetched" assertion would have passed vacuously. The
 * substitute below is the real adapter's logic, kept deliberately identical,
 * and the real one is covered directly in demoAnalyticsApi.test.ts.
 */
const demo = vi.hoisted(() => ({ targets: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/quiz/demoAnalyticsApi", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/quiz/demoAnalyticsApi")>();
  return {
    ...original,
    demoAnalyticsApi: demo,
    demoTrendsSource: (target: string, preview: string) => ({
      capability: async () => ({
        capability: (await demo.read(target, preview)).capability,
      }),
      trends: async (windowDays: number) => {
        const body = await demo.read(target, preview, windowDays);
        if (!("current" in body)) throw new Error("refused");
        return body;
      },
    }),
  };
});

/** The self-scoped API must never be reached from this page. */
const live = vi.hoisted(() => ({ capability: vi.fn(), trends: vi.fn() }));
vi.mock("@/lib/quiz/analyticsApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/quiz/analyticsApi")>();
  return { ...original, analyticsApi: live };
});

import AdminDemoAnalytics from "./AdminDemoAnalytics";

const BANNER =
  "DEMO — synthetic record. Not a real player, not a real account, and not counted in any platform figure.";

const TARGET = {
  user_id: "demo::timmy",
  slug: "timmy",
  label: "Timmy (demo)",
  note: "Synthetic 90-day practice record.",
  seeded: { attempts: 302, sessions: 60 },
  is_seeded: true,
};

const PREMIUM_CAP = {
  can_view_snapshot: true,
  snapshot_window_days: 7,
  can_view_trends: true,
  trend_windows: [7, 30, 90],
  allowed_windows: [7, 30, 90],
  can_build: true,
  reason: "premium",
};
const FREE_CAP = {
  can_view_snapshot: true,
  snapshot_window_days: 7,
  can_view_trends: false,
  trend_windows: [] as number[],
  allowed_windows: [7],
  can_build: false,
  reason: "free",
};

const REPORT = {
  ok: true,
  tier: "premium",
  demo: true,
  banner: BANNER,
  preview: "premium",
  target: TARGET,
  capability: PREMIUM_CAP,
  windows: [7, 30, 90],
  window_days: 7,
  since: "2026-08-31 12:00:00",
  until: "2026-09-07 12:00:00",
  previous_since: "2026-08-24 12:00:00",
  current: { attempts: 23, correct: 16, accuracy: 69.57, active_days: 6 },
  previous: { attempts: 23, correct: 15, accuracy: 65.22, active_days: 6 },
  delta: {
    attempts: 0, accuracy_points: 11.62, active_days: 0,
    direction: "improving", comparable: true,
  },
  series: [{ date: "2026-09-01", attempts: 4, correct: 3, accuracy: 75 }],
  modes: [
    { mode: "standard", label: "Practice", known: true, attempts: 12, correct: 9, accuracy: 75 },
  ],
  categories: [
    {
      category: "Item Costs", attempts: 6, correct: 2, accuracy: 33.33,
      previous_attempts: 6, previous_accuracy: 33.33, delta_points: 0,
      direction: "steady", eligible: true, is_weak: true, is_recurring_weak: true,
    },
  ],
  recurring_weak: ["Item Costs"],
  sufficiency: {
    min_attempts: 10, category_min_attempts: 5, trend_points: 5,
    has_data: true, enough_for_trend: true, enough_for_comparison: true,
  },
  counts_modes: ["practice", "time_trial_official"],
  excludes_modes: ["ranked", "daily_challenge", "mastery"],
};

/** PT1.10 — Free is no longer a refusal here. It is the SAME record, projected
 *  to the figures: the thing the owner now compares against Premium. */
const FREE_SNAPSHOT = {
  ok: true,
  tier: "free",
  demo: true,
  banner: BANNER,
  preview: "free",
  target: TARGET,
  capability: FREE_CAP,
  windows: [7],
  window_days: 7,
  since: "2026-08-31 12:00:00",
  until: "2026-09-07 12:00:00",
  current: { attempts: 23, correct: 16, accuracy: 69.57, active_days: 6 },
  modes: [
    { mode: "standard", label: "Practice", known: true, attempts: 12, correct: 9, accuracy: 75 },
  ],
  categories: [
    { category: "Item Costs", attempts: 6, correct: 2, accuracy: 33.33 },
  ],
  sufficiency: { has_data: true },
  counts_modes: ["practice", "time_trial_official"],
  excludes_modes: ["ranked", "daily_challenge", "mastery"],
};

beforeEach(() => {
  demo.targets.mockReset();
  demo.read.mockReset();
  live.capability.mockReset();
  live.trends.mockReset();
  demo.targets.mockResolvedValue({
    ok: true, demo: true, banner: BANNER,
    previews: ["free", "premium"], targets: [TARGET],
  });
  demo.read.mockImplementation(async (_t: string, preview: string) =>
    preview === "free" ? FREE_SNAPSHOT : REPORT);
});

afterEach(cleanup);

/** Render, and wait for BOTH halves to have settled on a real branch — the
 *  section element appears before its pane has read anything, so waiting on
 *  the section alone asserts against a spinner. */
const bothPanes = async () => {
  render(<AdminDemoAnalytics />);
  await waitFor(() => {
    expect(
      within(screen.getByTestId("demo-preview-premium"))
        .getByTestId("trends-pane"),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("demo-preview-free"))
        .getByTestId("trends-pane"),
    ).toBeTruthy();
  });
  return {
    free: screen.getByTestId("demo-preview-free"),
    premium: screen.getByTestId("demo-preview-premium"),
  };
};

describe("PT1.9 — the demo comparison", () => {
  it("renders both presentations of the same record side by side", async () => {
    const { free, premium } = await bothPanes();
    // PT1.10 — the Free half is now the shipped SNAPSHOT: the reader's own
    // figures, reached through the shipped path, not a sales card.
    expect(within(free).getByTestId("trends-pane")).toBeTruthy();
    expect(within(free).queryByTestId("trends-locked")).toBeNull();
    expect((free.textContent ?? "")).toContain("69.6%");
    expect((free.textContent ?? "")).toContain("Item Costs");
    // ...with the upsell as a footer beneath them.
    expect(within(free).getByTestId("trends-premium-upsell")).toBeTruthy();
    // The Premium half is the shipped pane, with the shipped window picker.
    expect(within(premium).getByTestId("trends-pane")).toBeTruthy();
    expect(within(premium).getByTestId("trends-window-picker")).toBeTruthy();
  });

  it("shows only Premium the interpretation of the same rows", async () => {
    const { free, premium } = await bothPanes();
    expect(within(premium).getByTestId("trends-movement")).toBeTruthy();
    expect(within(premium).getByTestId("trends-sparkline")).toBeTruthy();
    expect(within(free).queryByTestId("trends-movement")).toBeNull();
    expect(within(free).queryByTestId("trends-sparkline")).toBeNull();
    expect(within(free).queryByTestId("trends-recurring")).toBeNull();
  });

  it("asks for a report on BOTH sides now", async () => {
    await bothPanes();
    // The tier boundary moved to the server's field projection, so the client
    // no longer decides not to ask.
    const freeCalls = demo.read.mock.calls.filter((c) => c[1] === "free");
    expect(freeCalls.length).toBeGreaterThan(0);
    expect(freeCalls.some((c) => c[2] === 7)).toBe(true);
  });

  it("never touches the self-scoped analytics API", async () => {
    await bothPanes();
    expect(live.capability).not.toHaveBeenCalled();
    expect(live.trends).not.toHaveBeenCalled();
  });

  it("only ever names a demo subject the server listed", async () => {
    await bothPanes();
    for (const call of demo.read.mock.calls) {
      expect(call[0]).toBe("demo::timmy");
      expect(call[0]).toContain("::");
    }
  });

  it("prints the demo warning inside every pane, paywall included", async () => {
    const { free, premium } = await bothPanes();
    expect(within(free).getByTestId("trends-demo-notice").textContent)
      .toContain("DEMO");
    expect(within(premium).getByTestId("trends-demo-notice").textContent)
      .toContain("DEMO");
    expect(screen.getByTestId("demo-page-banner").textContent).toContain("DEMO");
    expect(screen.getByTestId("demo-page-badge").textContent)
      .toMatch(/synthetic/i);
  });

  it("re-reads rather than leaving a Premium report under a Free capability", async () => {
    // Single-view, so the pane on screen genuinely changes presentation. This
    // is the case that could go wrong: a pane kept mounted across the switch
    // would show the previous tier's report under the new tier's capability.
    await bothPanes();
    fireEvent.click(screen.getByTestId("demo-layout-premium"));
    await waitFor(() =>
      expect(screen.queryByTestId("demo-preview-free")).toBeNull());

    demo.read.mockClear();
    fireEvent.click(screen.getByTestId("demo-layout-free"));
    await waitFor(() =>
      expect(screen.getByTestId("trends-premium-upsell")).toBeTruthy());
    expect(demo.read).toHaveBeenCalled();
    expect(demo.read.mock.calls.every((c) => c[1] === "free")).toBe(true);
    // The Premium interpretation that was on screen a moment ago is gone.
    expect(screen.queryByTestId("trends-movement")).toBeNull();

    demo.read.mockClear();
    fireEvent.click(screen.getByTestId("demo-layout-premium"));
    await waitFor(() => expect(screen.getByTestId("trends-movement")).toBeTruthy());
    expect(demo.read.mock.calls.every((c) => c[1] === "premium")).toBe(true);
    expect(screen.queryByTestId("trends-premium-upsell")).toBeNull();
  });

  it("shows one presentation at a time when asked", async () => {
    await bothPanes();
    fireEvent.click(screen.getByTestId("demo-layout-premium"));
    await waitFor(() =>
      expect(screen.queryByTestId("demo-preview-free")).toBeNull());
    expect(screen.getByTestId("demo-preview-premium")).toBeTruthy();
    fireEvent.click(screen.getByTestId("demo-layout-both"));
    await waitFor(() =>
      expect(screen.getByTestId("demo-preview-free")).toBeTruthy());
  });

  it("issues no request that is not a GET read", async () => {
    await bothPanes();
    fireEvent.click(screen.getByTestId("demo-layout-free"));
    fireEvent.click(screen.getByTestId("demo-layout-premium"));
    fireEvent.click(screen.getByTestId("demo-layout-both"));
    await waitFor(() =>
      expect(screen.getByTestId("demo-preview-free")).toBeTruthy());
    // The client exposes exactly two operations and both are reads.
    const surface = Object.keys(demo).sort();
    expect(surface).toEqual(["read", "targets"]);
  });

  it("does not offer the Practice handoff, which would write for the admin", async () => {
    const { premium } = await bothPanes();
    // The recurring-weak row is present; its "Practise this" button is not,
    // because acting on it would build a REAL session for the admin's own
    // account out of a synthetic account's weaknesses.
    expect(within(premium).getAllByTestId("trends-category-row").length)
      .toBeGreaterThan(0);
    expect(within(premium).getByTestId("trends-recurring")).toBeTruthy();
    expect(within(premium).queryByTestId("trends-practise-category")).toBeNull();
  });

  it("says so plainly when the demo record has not been seeded", async () => {
    demo.targets.mockResolvedValue({
      ok: true, demo: true, banner: BANNER, previews: ["free", "premium"],
      targets: [{ ...TARGET, is_seeded: false, seeded: { attempts: 0, sessions: 0 } }],
    });
    render(<AdminDemoAnalytics />);
    await waitFor(() =>
      expect(screen.getByTestId("demo-target-note").textContent)
        .toMatch(/not seeded/i));
    expect(screen.queryByTestId("demo-preview-premium")).toBeNull();
    expect(demo.read).not.toHaveBeenCalled();
  });

  it("reports a failed listing as a failure, not as an empty demo", async () => {
    demo.targets.mockRejectedValue(new Error("Demo preview 403: nope"));
    render(<AdminDemoAnalytics />);
    await waitFor(() => expect(screen.getByTestId("demo-error")).toBeTruthy());
    expect(screen.queryByTestId("demo-preview-free")).toBeNull();
  });

  it("reports a failed READ as unavailable, never as a paywall", async () => {
    // The rule PT1.8 exists to keep, carried into the preview: a request that
    // did not return must not render as "you need to subscribe".
    demo.read.mockRejectedValue(new Error("Demo preview 500"));
    render(<AdminDemoAnalytics />);
    await waitFor(() =>
      expect(screen.getAllByTestId("trends-error").length).toBe(2));
    expect(screen.queryByTestId("trends-locked")).toBeNull();
  });
});
