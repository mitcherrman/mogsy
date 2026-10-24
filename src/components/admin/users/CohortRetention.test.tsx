import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoadedAnalytics } from "@/lib/admin/analytics/loadAnalytics";
import type { AnalyticsEventRecord, AnalyticsSessionRecord } from "@/lib/admin/analytics/metrics";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";

const load = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/analytics/loadAnalytics", () => ({ ROW_CAP: 50_000, loadAnalytics: load }));

import { CohortRetentionPanel, RetentionGlance } from "./CohortRetention";
import { lensUnavailableReason } from "@/lib/admin/analytics/useCohortAnalytics";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-10-22T12:00:00.000Z");
const iso = (t: number) => new Date(t).toISOString();

const sess = (id: string, v: string, t: number, cls = "human"): AnalyticsSessionRecord => ({
  session_id: id, visitor_id: v, started_at: iso(t), landing_path: "/", referrer: null,
  utm_source: null, utm_medium: null, utm_campaign: null, traffic_class: cls,
});
const ev = (name: string, t: number, o: Partial<AnalyticsEventRecord>): AnalyticsEventRecord => ({
  event_name: name, received_at: iso(t), visitor_id: null, session_id: null, user_id: null, is_guest: null,
  source_system: "web", source_entity_type: null, source_entity_id: null, verification_type: null, metadata: null, ...o,
});

function loaded(over: Partial<LoadedAnalytics> = {}): LoadedAnalytics {
  return {
    dataset: {
      visitors: [],
      sessions: [
        sess("a1", "A", NOW - 20 * DAY), sess("a2", "A", NOW - 20 * DAY + 30 * HOUR),
        sess("b1", "B", NOW - 20 * DAY),
        sess("x1", "X", NOW - 20 * DAY, "automation"), sess("x2", "X", NOW - 20 * DAY + 30 * HOUR, "automation"),
      ],
      events: [
        ev("signup_completed", NOW - 10 * DAY, { user_id: "U", visitor_id: "A", is_guest: false }),
      ],
    },
    latest: { web: null, railway: null, byRailwayEvent: {} },
    truncated: { events: false, sessions: false, visitors: false },
    loadedAt: NOW,
    overrides: [],
    ...over,
  };
}

function renderWith(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS);
});

describe("CohortRetentionPanel", () => {
  it("shows browser cohorts with denominators, excluding automation by default", async () => {
    load.mockResolvedValue(loaded());
    renderWith(<CohortRetentionPanel />);
    const table = await screen.findByTestId("cohort-table");
    const row = within(table).getByRole("row", { name: /Week of 2026-09-28/ });
    expect(within(row).getAllByRole("cell")[0]).toHaveTextContent("2"); // A and B, not X
    expect(within(row).getByText("2026-09-28 D1: 1 of 2 eligible returned.")).toBeInTheDocument();
    expect(screen.getByTestId("cohort-pooled")).toHaveTextContent("D0");
    expect(load).toHaveBeenCalledWith({ start: expect.any(Number) });
  });

  it("includes automation only when the page filter asks for it", async () => {
    load.mockResolvedValue(loaded());
    renderWith(<CohortRetentionPanel filter="all" />);
    const row = within(await screen.findByTestId("cohort-table")).getByRole("row", { name: /Week of 2026-09-28/ });
    expect(within(row).getAllByRole("cell")[0]).toHaveTextContent("3");
  });

  it("switches to the account lens: its own unit, no D0, pending cells for unelapsed windows", async () => {
    load.mockResolvedValue(loaded());
    renderWith(<CohortRetentionPanel />);
    await screen.findByTestId("cohort-table");
    fireEvent.click(screen.getByRole("button", { name: "Registered accounts" }));
    expect(screen.getByRole("button", { name: "Registered accounts" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("cohort-lens-definition")).toHaveTextContent("signup_completed");
    const table = screen.getByTestId("cohort-table");
    expect(within(table).queryByRole("columnheader", { name: "D0" })).toBeNull();
    // Signed up 10 days ago: W2 (14–21d) cannot be observed yet.
    expect(within(table).getByText(/W2: not observable yet/)).toBeInTheDocument();
  });

  it("says a lens is unavailable rather than computing on a truncated read", async () => {
    load.mockResolvedValue(loaded({ truncated: { events: true, sessions: false, visitors: false } }));
    renderWith(<CohortRetentionPanel />);
    await screen.findByTestId("cohort-table");
    fireEvent.click(screen.getByRole("button", { name: "Registered accounts" }));
    expect(screen.getByTestId("cohort-unavailable")).toHaveTextContent("lost its newest rows");
    expect(screen.queryByTestId("cohort-table")).toBeNull();
  });

  it("has an empty state that is not a zero rate", async () => {
    load.mockResolvedValue(loaded({ dataset: { visitors: [], sessions: [], events: [] } }));
    renderWith(<CohortRetentionPanel />);
    expect(await screen.findByTestId("cohort-empty")).toHaveTextContent("No browser was first seen");
  });

  it("draws the curve without animation under reduced motion", async () => {
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    load.mockResolvedValue(loaded());
    renderWith(<CohortRetentionPanel />);
    const figure = await screen.findByTestId("retention-curve");
    const path = figure.querySelector("path")!;
    expect(path.getAttribute("style")).toContain("transition: none");
    expect(path.getAttribute("stroke-dashoffset")).toBe("0");
    expect(figure.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("reports a failed read as unavailable", async () => {
    load.mockRejectedValue(new Error("denied"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><CohortRetentionPanel /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Retention history unavailable");
    expect(screen.queryByTestId("cohort-table")).toBeNull();
    client.clear();
  });
});

describe("lensUnavailableReason", () => {
  it("ties each lens to the tables it depends on", () => {
    expect(lensUnavailableReason(loaded({ truncated: { events: true, sessions: false, visitors: false } }), "browser")).toBeNull();
    expect(lensUnavailableReason(loaded({ truncated: { events: false, sessions: true, visitors: false } }), "browser")).not.toBeNull();
    expect(lensUnavailableReason(loaded({ truncated: { events: false, sessions: true, visitors: false } }), "account")).toBeNull();
  });
});

describe("RetentionGlance", () => {
  it("shows both lenses separately with eligible denominators and links to the table", async () => {
    load.mockResolvedValue(loaded());
    renderWith(<RetentionGlance />);
    const card = await screen.findByTestId("overview-retention-glance");
    expect((await within(card).findAllByText("of 2 eligible")).length).toBeGreaterThan(0);
    expect(within(card).getByText("Registered accounts")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /Cohort table/ })).toHaveAttribute(
      "href", "/admin/users?section=audience#users-retention");
  });
});
