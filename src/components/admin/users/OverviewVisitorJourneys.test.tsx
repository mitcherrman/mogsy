import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { VisitorJourney } from "@/lib/admin/analytics/visitorJourney";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn().mockResolvedValue({ data: [] }) } }));
vi.mock("@/lib/admin/analytics/loadAnalytics", () => ({ loadAnalytics: vi.fn().mockRejectedValue(new Error("denied")) }));
import { OverviewVisitorJourneys, VisitorJourneysView, VisitorJourneyTimeline } from "./OverviewVisitorJourneys";

afterEach(cleanup);
const visitor = (patch: Partial<VisitorJourney> = {}): VisitorJourney => ({
  id: "private-browser-id", kind: "unknown", human: true,
  accountLabel: "Guest or account status unverified — no current profile found",
  firstAt: "2026-10-19T10:00:00Z", lastAt: "2026-10-19T12:00:00Z", landing: "Academy", source: "Direct / source unknown",
  sessions: 2, returning: true, games: 0, actions: [], ...patch,
});
const mount = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

describe("overview visitor disclosure", () => {
  it("defaults to human-signal visitors and can select unknown traffic separately", () => {
    mount(<VisitorJourneysView journeys={[visitor(), visitor({ id: "unknown-traffic", human: false })]} />);
    expect(screen.getByRole("button", { name: "Human visitors · 1" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Human signal unknown · 1" }));
    expect(screen.getByText(/Visitor 1 · Human signal unknown/)).toBeInTheDocument();
  });
  it("expands a visitor and keeps raw identifiers collapsed", () => {
    mount(<VisitorJourneysView journeys={[visitor()]} />);
    const summary = screen.getByText(/Visitor 1 · Account unknown/).closest("summary");
    if (!summary) throw new Error("Visitor summary missing");
    fireEvent.click(summary);
    expect(screen.getByText(/Guest or account status unverified — no current profile found/)).toBeInTheDocument();
    const raw = screen.getByText("private-browser-id").closest("details");
    expect(raw).not.toHaveAttribute("open");
    expect(screen.getByRole("link", { name: /Open visitor detail/ })).toHaveAttribute("href", "/admin/users?section=audience&visitor=private-browser-id");
  });
  it("shows last observed time and unavailable exit/stage evidence", () => {
    mount(<VisitorJourneyTimeline journey={visitor()} />);
    expect(screen.getByText("Last observed activity")).toBeInTheDocument();
    expect(screen.getByText(/Exit and drop-off unknown/)).toBeInTheDocument();
    expect(screen.getByText(/full Daily \/ Role Challenge \/ More Challenges stage progress are unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/No activity events or sessions recorded/)).toBeInTheDocument();
  });
  it("bounds expanded timeline to 80 actions", () => {
    mount(<VisitorJourneyTimeline journey={visitor({ actions: Array.from({ length: 100 }, (_, i) => ({ at: "2026-10-19T12:00:00Z", title: `Action ${i}`, where: "Academy", evidence: "Browser observation" })) })} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Show more actions (80)" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(80);
  });
  it("a failed protected read is unavailable, never a zero audience", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mount(<QueryClientProvider client={client}><OverviewVisitorJourneys /></QueryClientProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Visitor activity unavailable");
    expect(screen.queryByText("Human-signal visitors")).toBeNull();
    client.clear();
  });
});