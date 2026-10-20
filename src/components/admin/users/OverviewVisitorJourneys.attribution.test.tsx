import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { JourneyAction, VisitorJourney } from "@/lib/admin/analytics/visitorJourney";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/admin/analytics/loadAnalytics", () => ({ loadAnalytics: vi.fn() }));
import { AfterDailyCard, VisitorJourneyTimeline, VisitorJourneysView } from "./OverviewVisitorJourneys";
import { computeAfterDaily } from "@/lib/admin/analytics/afterDaily";

afterEach(cleanup);
const end = Date.parse("2026-10-20T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const act = (offsetMs: number, kind: JourneyAction["kind"], title: string, category?: string): JourneyAction =>
  ({ at: new Date(end - offsetMs).toISOString(), title, where: "Daily Challenge page", evidence: "Server record · received timestamp", kind, category });
const visitor = (actions: JourneyAction[]): VisitorJourney => ({
  id: "browser-1", kind: "guest", human: true, accountLabel: "Guest — browser reported; current account unverified",
  firstAt: null, lastAt: null, landing: "Academy", source: "Direct / source unknown", sessions: 2, returning: true, games: 1, actions,
});

describe("literal action descriptions", () => {
  it("labels each row with what kind of observation it is", () => {
    render(<MemoryRouter><VisitorJourneyTimeline journey={visitor([
      act(1000, "stage_end", "Daily Challenge stage 1 completed", "daily_stage"),
      act(2000, "game_start", "Daily Challenge stage 1 started", "daily_stage"),
      act(3000, "click", "Pressed the Daily Challenge button on the Home Hub (Academy)"),
      act(4000, "page_view", "Opened Academy"),
    ])} /></MemoryRouter>);
    const kinds = screen.getAllByTestId("action-kind").map((n) => n.textContent);
    expect(kinds).toEqual(["Stage completed", "Game start", "Button click", "Page view"]);
    expect(screen.getByText("Pressed the Daily Challenge button on the Home Hub (Academy)")).toBeInTheDocument();
  });

  it("does not claim a whole Daily was finished or that the visitor exited", () => {
    render(<MemoryRouter><VisitorJourneyTimeline journey={visitor([act(1000, "stage_end", "Daily Challenge stage 3 completed", "daily_stage")])} /></MemoryRouter>);
    expect(screen.getByText(/Exit and drop-off unknown/)).toBeInTheDocument();
    expect(screen.queryByText(/Daily Challenge completed/)).toBeNull();
  });
});

describe("After the Daily Challenge", () => {
  it("shows the first game after Daily and a return rate with its denominator", () => {
    const j = visitor([
      act(4 * DAY, "game_start", "Daily Challenge stage 1 started", "daily_stage"),
      act(4 * DAY - 60_000, "game_start", "More Challenges · Survival started", "more_challenges"),
      act(2 * DAY, "session", "Returned in a new browser session"),
    ]);
    render(<AfterDailyCard summary={computeAfterDaily([j], end)} />);
    const card = screen.getByTestId("after-daily");
    expect(within(card).getByText(/1 browsers with a recorded Daily stage/)).toBeInTheDocument();
    expect(within(card).getByText(/First game after: More Challenges/)).toBeInTheDocument();
    expect(screen.getByTestId("after-daily-return")).toHaveTextContent("Returned on a later day: 1 of 1 browsers");
  });

  it("says so, rather than showing zero, when no Daily was recorded or follow-up is too short", () => {
    render(<AfterDailyCard summary={computeAfterDaily([], end)} />);
    expect(screen.getByText(/No Daily Challenge stage was recorded/)).toBeInTheDocument();
    cleanup();
    render(<AfterDailyCard summary={computeAfterDaily([visitor([act(60_000, "game_start", "x", "daily_stage")])], end)} />);
    expect(screen.getByTestId("after-daily-return")).toHaveTextContent("not enough follow-up time");
  });

  it("is part of the Overview journeys view", () => {
    render(<MemoryRouter><VisitorJourneysView journeys={[visitor([act(3 * DAY, "game_start", "x", "daily_stage")])]} rangeEnd={end} /></MemoryRouter>);
    expect(screen.getByTestId("after-daily")).toBeInTheDocument();
  });
});
